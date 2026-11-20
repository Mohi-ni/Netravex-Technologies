// Supabase Edge Function: POST /functions/v1/submit-enquiry
// Validates the website form, stores it in Postgres and sends the SMTP auto-reply.
//
// Secrets to set (see README):
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
//   NOTIFY_EMAIL      (optional) team mailbox that receives a copy
//   ALLOWED_ORIGINS   (optional) comma-separated site origins, default "*"
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.

import { createClient } from "npm:@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { type Deps, handleRequest } from "./handler.ts";

const env = (name: string) => Deno.env.get(name) ?? "";

const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

async function sendMail(mail: { to: string; subject: string; text: string; html: string }) {
  const port = Number(env("SMTP_PORT") || "465");
  const client = new SMTPClient({
    connection: {
      hostname: env("SMTP_HOST"),
      port,
      tls: port === 465, // 465 = implicit TLS. Other ports use STARTTLS when the server offers it.
      auth: { username: env("SMTP_USER"), password: env("SMTP_PASS") },
    },
  });
  try {
    await client.send({
      from: env("SMTP_FROM") || env("SMTP_USER"),
      to: mail.to,
      subject: mail.subject,
      content: mail.text,
      html: mail.html,
    });
  } finally {
    await client.close();
  }
}

const deps: Deps = {
  allowedOrigins: (env("ALLOWED_ORIGINS") || "*").split(",").map((s) => s.trim()).filter(Boolean),
  notifyTo: env("NOTIFY_EMAIL") || undefined,
  now: () => new Date(),
  sendMail,

  async insertInquiry(row) {
    const { data, error } = await db.from("scoping_inquiries").insert(row).select("id, reference_id").single();
    if (error) throw error;
    return data;
  },

  async countRecentByEmail(email, sinceIso) {
    const { count, error } = await db
      .from("scoping_inquiries")
      .select("id", { count: "exact", head: true })
      .ilike("work_email", email.replace(/[%_\\]/g, "\\$&"))
      .gte("created_at", sinceIso);
    if (error) throw error;
    return count ?? 0;
  },

  async setReplyStatus(id, status, error) {
    const { error: e } = await db
      .from("scoping_inquiries")
      .update({ auto_reply_status: status, auto_reply_error: error ?? null })
      .eq("id", id);
    if (e) throw e;
  },
};

Deno.serve((req) => handleRequest(req, deps));
