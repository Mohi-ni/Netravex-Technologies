// Request handling for the enquiry form. No network imports here, so the logic
// can be tested on its own. index.ts plugs in the real database and SMTP client.

export const NOTICE_VERSION = "2026-11-v1";
export const ORG_TYPES = ["Co-operative bank", "Growing enterprise", "Other"] as const;
export const FOCUS_AREAS = [
  "30-day readiness roadmap",
  "Data inventory and mapping",
  "Notices and consent",
  "Rights and grievance process",
  "Security controls review",
  "Breach response playbook",
  "Not sure yet",
] as const;

const MAX_PER_EMAIL_PER_HOUR = 3;
const MAX_BODY_CHARS = 20_000;
const MAIL_TIMEOUT_MS = 8_000;

export interface InquiryRow {
  full_name: string;
  organization_name: string;
  org_type: string;
  role_title: string | null;
  work_email: string;
  phone_number: string | null;
  focus_area: string | null;
  message: string | null;
  answers: (number | null)[] | null;
  readiness_score: number | null;
  readiness_percent: number | null;
  consent_given: true;
  notice_version: string;
}

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Deps {
  /** "*" or a list of site origins that may call this function. */
  allowedOrigins: string[];
  insertInquiry(row: InquiryRow): Promise<{ id: string; reference_id: string }>;
  countRecentByEmail(email: string, sinceIso: string): Promise<number>;
  setReplyStatus(id: string, status: "SENT" | "FAILED", error?: string): Promise<void>;
  sendMail(mail: Mail): Promise<void>;
  /** Team mailbox that gets a copy of every enquiry. Optional. */
  notifyTo?: string;
  now(): Date;
}

type Json = Record<string, unknown>;

class BadRequest extends Error {}

// ------------------------------------------------------------------ helpers
function cors(req: Request, allowed: string[]): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const ok = allowed.includes("*") || allowed.includes(origin);
  return {
    "Access-Control-Allow-Origin": allowed.includes("*") ? "*" : ok ? origin : allowed[0] ?? "null",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function reply(req: Request, deps: Deps, status: number, body: Json): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { ...cors(req, deps.allowedOrigins), "Content-Type": "application/json" },
  });
}

/** Trim, drop control characters, enforce length. Returns null for empty optional values. */
function text(value: unknown, field: string, min: number, max: number, required: boolean): string | null {
  if (value === undefined || value === null || value === "") {
    if (required) throw new BadRequest(`${field} is required.`);
    return null;
  }
  if (typeof value !== "string") throw new BadRequest(`${field} is not valid.`);
  // deno-lint-ignore no-control-regex
  const clean = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  if (clean.length === 0) {
    if (required) throw new BadRequest(`${field} is required.`);
    return null;
  }
  if (clean.length < min) throw new BadRequest(`${field} is too short.`);
  if (clean.length > max) throw new BadRequest(`${field} is too long (limit ${max} characters).`);
  return clean;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** answers: 10 values, each null/0/1/2. Unanswered counts as 0, same as the browser. */
export function scoreAnswers(answers: (number | null)[] | null) {
  if (!answers || answers.every((a) => a === null)) return { score: null, percent: null };
  const points = answers.reduce<number>((sum, a) => sum + (a ?? 0), 0);
  return { score: points / 2, percent: Math.round((points / 20) * 100) };
}

function parseAnswers(value: unknown): (number | null)[] | null {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || value.length !== 10) throw new BadRequest("Scorecard answers are not valid.");
  const out = value.map((v) => {
    if (v === null) return null;
    if (v === 0 || v === 1 || v === 2) return v;
    throw new BadRequest("Scorecard answers are not valid.");
  });
  return out;
}

function parseInquiry(body: Json): InquiryRow {
  if (body.consent !== true) {
    throw new BadRequest("Please tick the consent box so we can contact you about this enquiry.");
  }
  const email = text(body.email, "Email", 5, 150, true)!;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new BadRequest("Email is not valid.");

  const phone = text(body.phone, "Phone", 5, 20, false);
  if (phone && !/^[0-9+()\-\s]+$/.test(phone)) throw new BadRequest("Phone is not valid.");

  const orgType = text(body.orgType, "Organisation type", 1, 50, false) ?? "Other";
  if (!(ORG_TYPES as readonly string[]).includes(orgType)) throw new BadRequest("Organisation type is not valid.");

  const focus = text(body.focusArea, "Focus area", 1, 120, false);
  if (focus && !(FOCUS_AREAS as readonly string[]).includes(focus)) throw new BadRequest("Focus area is not valid.");

  const answers = parseAnswers(body.answers);
  const { score, percent } = scoreAnswers(answers);

  return {
    full_name: text(body.fullName, "Name", 2, 120, true)!,
    organization_name: text(body.organization, "Organisation", 2, 150, true)!,
    org_type: orgType,
    role_title: text(body.role, "Role", 1, 100, false),
    work_email: email,
    phone_number: phone,
    focus_area: focus,
    message: text(body.message, "Message", 1, 2000, false),
    answers: score === null ? null : answers,
    readiness_score: score,
    readiness_percent: percent,
    consent_given: true,
    notice_version: NOTICE_VERSION,
  };
}

// -------------------------------------------------------------------- email
export function autoReply(row: InquiryRow, ref: string): Mail {
  const first = row.full_name.split(/\s+/)[0];
  const scoreLine = row.readiness_score === null
    ? ""
    : `\nYour readiness self-check: ${row.readiness_score.toFixed(1)} out of 10.`;
  const textBody =
    `Hi ${first},\n\n` +
    `Thanks for contacting Netravex Technologies. We have received your enquiry.\n\n` +
    `Reference: ${ref}${scoreLine}\n\n` +
    `A member of our team will read it and reply personally. To add anything, reply to this email and quote the reference.\n\n` +
    `You can withdraw your consent at any time by replying "withdraw".\n\n` +
    `This is an automated message.\nNetravex Technologies, Bhubaneswar`;
  const html =
    `<p>Hi ${esc(first)},</p>` +
    `<p>Thanks for contacting Netravex Technologies. We have received your enquiry.</p>` +
    `<p><strong>Reference: ${esc(ref)}</strong>${row.readiness_score === null ? "" : `<br>Your readiness self-check: ${row.readiness_score.toFixed(1)} out of 10.`}</p>` +
    `<p>A member of our team will read it and reply personally. To add anything, reply to this email and quote the reference.</p>` +
    `<p>You can withdraw your consent at any time by replying &ldquo;withdraw&rdquo;.</p>` +
    `<p style="color:#667">This is an automated message.<br>Netravex Technologies, Bhubaneswar</p>`;
  return { to: row.work_email, subject: `Netravex enquiry received (${ref})`, text: textBody, html };
}

export function teamNotice(row: InquiryRow, ref: string, to: string): Mail {
  const lines = [
    `New enquiry ${ref}`,
    "",
    `Name: ${row.full_name}${row.role_title ? ` (${row.role_title})` : ""}`,
    `Organisation: ${row.organization_name} (${row.org_type})`,
    `Email: ${row.work_email}`,
    `Phone: ${row.phone_number ?? "not given"}`,
    `Wants help with: ${row.focus_area ?? "not given"}`,
    `Readiness: ${row.readiness_score === null ? "not attached" : `${row.readiness_score.toFixed(1)} / 10`}`,
    "",
    row.message ?? "(no message)",
  ];
  const textBody = lines.join("\n");
  return {
    to,
    subject: `New enquiry ${ref}: ${row.organization_name}`.replace(/[\r\n]+/g, " "),
    text: textBody,
    html: `<pre style="font-family:inherit;white-space:pre-wrap">${esc(textBody)}</pre>`,
  };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("Mail server timed out")), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

// ------------------------------------------------------------------ handler
export async function handleRequest(req: Request, deps: Deps): Promise<Response> {
  if (req.method === "OPTIONS") return reply(req, deps, 204, {});
  if (req.method !== "POST") return reply(req, deps, 405, { error: "Use POST." });

  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_CHARS) throw new BadRequest("Request is too large.");
    let body: Json;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new BadRequest("Request was not valid JSON.");
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) throw new BadRequest("Request was not valid.");

    // Honeypot: real visitors never fill this hidden field. Pretend it worked.
    if (typeof body.website === "string" && body.website.trim() !== "") {
      return reply(req, deps, 201, { success: true, referenceId: "NVX-00000", emailSent: false });
    }

    const row = parseInquiry(body);

    const since = new Date(deps.now().getTime() - 60 * 60 * 1000).toISOString();
    if ((await deps.countRecentByEmail(row.work_email, since)) >= MAX_PER_EMAIL_PER_HOUR) {
      return reply(req, deps, 429, { error: "Too many enquiries from this email address. Please try again later." });
    }

    const saved = await deps.insertInquiry(row);

    let emailSent = false;
    try {
      await withTimeout(deps.sendMail(autoReply(row, saved.reference_id)), MAIL_TIMEOUT_MS);
      emailSent = true;
      await deps.setReplyStatus(saved.id, "SENT");
    } catch (err) {
      console.error("auto-reply failed", err);
      try {
        await deps.setReplyStatus(saved.id, "FAILED", String(err instanceof Error ? err.message : err).slice(0, 300));
      } catch (e) {
        console.error("could not record reply status", e);
      }
    }

    if (deps.notifyTo) {
      try {
        await withTimeout(deps.sendMail(teamNotice(row, saved.reference_id, deps.notifyTo)), MAIL_TIMEOUT_MS);
      } catch (err) {
        console.error("team notice failed", err);
      }
    }

    return reply(req, deps, 201, {
      success: true,
      referenceId: saved.reference_id,
      readinessPercent: row.readiness_percent,
      emailSent,
    });
  } catch (err) {
    if (err instanceof BadRequest) return reply(req, deps, 400, { error: err.message });
    console.error("submit-enquiry error", err);
    return reply(req, deps, 500, { error: "Something went wrong on our side. Please try again in a moment." });
  }
}
