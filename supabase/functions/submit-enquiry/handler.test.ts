// Run with: deno test supabase/functions/submit-enquiry/handler.test.ts
import { type Deps, handleRequest, type InquiryRow, type Mail, scoreAnswers } from "./handler.ts";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error("Assertion failed: " + msg);
}

function setup(over: Partial<Deps> = {}) {
  const state = { rows: [] as InquiryRow[], mails: [] as Mail[], statuses: [] as string[], recent: 0 };
  const deps: Deps = {
    allowedOrigins: ["https://netravex.example"],
    notifyTo: "team@netravex.example",
    now: () => new Date("2026-11-20T10:00:00Z"),
    insertInquiry: (row) => {
      state.rows.push(row);
      return Promise.resolve({ id: "id-1", reference_id: "NVX-10001" });
    },
    countRecentByEmail: () => Promise.resolve(state.recent),
    setReplyStatus: (_id, status) => {
      state.statuses.push(status);
      return Promise.resolve();
    },
    sendMail: (m) => {
      state.mails.push(m);
      return Promise.resolve();
    },
    ...over,
  };
  return { deps, state };
}

const good = {
  fullName: "Asha Das",
  organization: "Khordha Co-operative Bank",
  orgType: "Co-operative bank",
  role: "IT Head",
  email: "asha@bank.in",
  phone: "+91 98765 43210",
  focusArea: "30-day readiness roadmap",
  message: "We would like a scoping call.",
  answers: [2, 1, 0, null, 2, 2, 1, 0, 0, 1],
  consent: true,
  website: "",
};

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("https://x.supabase.co/functions/v1/submit-enquiry", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://netravex.example", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

Deno.test("saves the enquiry, scores it on the server, sends both emails", async () => {
  const { deps, state } = setup();
  const res = await handleRequest(post({ ...good, readinessScore: 10 }), deps);
  const json = await res.json();
  assert(res.status === 201, "status 201");
  assert(json.referenceId === "NVX-10001" && json.emailSent === true, "reference + emailSent");
  assert(state.rows[0].readiness_score === 4.5 && state.rows[0].readiness_percent === 45, "score from answers, not from client");
  assert(state.rows[0].notice_version.length > 0, "notice version stored");
  assert(state.mails[0].to === "asha@bank.in" && state.mails[0].subject.includes("NVX-10001"), "auto-reply to visitor");
  assert(state.mails[0].text.length < 700, "auto-reply is short");
  assert(state.mails[1].to === "team@netravex.example", "team notice");
  assert(state.statuses.join() === "SENT", "reply marked SENT");
  assert(res.headers.get("access-control-allow-origin") === "https://netravex.example", "CORS origin echoed");
});

Deno.test("still saves the enquiry when SMTP fails", async () => {
  const { deps, state } = setup({ sendMail: () => Promise.reject(new Error("smtp down")) });
  const res = await handleRequest(post(good), deps);
  const json = await res.json();
  assert(res.status === 201 && json.success === true && json.emailSent === false, "success but emailSent=false");
  assert(state.rows.length === 1 && state.statuses.join() === "FAILED", "saved, marked FAILED");
});

Deno.test("rejects missing consent, bad email, bad scorecard, bad phone", async () => {
  for (
    const patch of [
      { consent: false },
      { email: "nope" },
      { answers: [1, 2, 3] },
      { answers: [5, 1, 0, null, 2, 2, 1, 0, 0, 1] },
      { phone: "call me <script>" },
      { orgType: "Hacker" },
      { fullName: "" },
    ]
  ) {
    const { deps, state } = setup();
    const res = await handleRequest(post({ ...good, ...patch }), deps);
    assert(res.status === 400, `400 for ${JSON.stringify(patch)}`);
    assert(state.rows.length === 0, "nothing stored");
  }
});

Deno.test("bad JSON, wrong method, oversized body", async () => {
  const { deps } = setup();
  assert((await handleRequest(post("{oops"), deps)).status === 400, "bad json");
  assert((await handleRequest(new Request("https://x.co/f", { method: "GET" }), deps)).status === 405, "GET 405");
  assert((await handleRequest(post({ ...good, message: "x".repeat(30000) }), deps)).status === 400, "too large");
});

Deno.test("honeypot is silently dropped", async () => {
  const { deps, state } = setup();
  const res = await handleRequest(post({ ...good, website: "http://spam.example" }), deps);
  assert(res.status === 201 && state.rows.length === 0 && state.mails.length === 0, "no row, no mail");
});

Deno.test("rate limit: 3 per email per hour", async () => {
  const { deps, state } = setup();
  state.recent = 3;
  const res = await handleRequest(post(good), deps);
  assert(res.status === 429 && state.rows.length === 0, "429 and nothing stored");
});

Deno.test("preflight and unlisted origin", async () => {
  const { deps } = setup();
  const pre = await handleRequest(
    new Request("https://x.co/f", { method: "OPTIONS", headers: { origin: "https://netravex.example" } }),
    deps,
  );
  assert(pre.status === 204 && pre.headers.get("access-control-allow-headers")!.includes("apikey"), "preflight ok");
  const other = await handleRequest(post(good, { origin: "https://evil.example" }), deps);
  assert(other.headers.get("access-control-allow-origin") !== "https://evil.example", "evil origin not echoed");
});

Deno.test("email content cannot inject HTML or headers", async () => {
  const { deps, state } = setup();
  await handleRequest(post({ ...good, fullName: "<img src=x onerror=alert(1)> Bob\r\nBcc: a@b.c" }), deps);
  const m = state.mails[0];
  assert(!m.html.includes("<img"), "html escaped");
  assert(!/[\r\n]/.test(m.subject), "no newline in subject");
});

Deno.test("scoring", () => {
  assert(scoreAnswers(null).score === null, "no answers");
  assert(scoreAnswers([null, null, null, null, null, null, null, null, null, null]).score === null, "all null");
  const all = scoreAnswers([2, 2, 2, 2, 2, 2, 2, 2, 2, 2]);
  assert(all.score === 10 && all.percent === 100, "all yes");
  assert(scoreAnswers([1, 0, 0, 0, 0, 0, 0, 0, 0, 0]).percent === 5, "one partly");
});
