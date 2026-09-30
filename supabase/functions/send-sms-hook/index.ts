// supabase/functions/send-sms-hook/index.ts — V18a: SMS login codes via
// SMS4Free, wired in as Supabase Auth's "Send SMS" hook.
//
// Supabase Auth's built-in phone providers (Twilio, Twilio Verify,
// MessageBird, Vonage, Textlocal) don't include SMS4Free, so Auth hands every
// login code to this function instead: it POSTs { user, sms: { otp } }, we
// send the SMS, and an empty 200 tells Auth it went out. Any other status
// fails the signInWithOtp() call in the app.
//
// Israeli mobile numbers only (05X…). The app already normalizes to
// +9725XXXXXXXX before calling Auth; this re-checks, because anything else
// can't be delivered by SMS4Free — and refusing it here also shuts the door on
// SMS-pumping fraud to premium international numbers.
//
// The SMS4Free call and STATUS_MESSAGES are copied from send-sms-reminders on
// purpose (the playbook says copy, don't refactor the reminder function).
//
// SECRETS (set once: `supabase secrets set NAME=value`):
//   SEND_SMS_HOOK_SECRET — "v1,whsec_…", generated in Dashboard →
//                          Authentication → Hooks → Send SMS hook.
//   SMS4FREE_API_KEY / SMS4FREE_USER / SMS4FREE_PASS / SMS4FREE_SENDER —
//                          the same four send-sms-reminders already uses.
//                          On the free tier SMS4FREE_SENDER must equal
//                          SMS4FREE_USER, so codes arrive from that mobile.
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically.
//
// DEPLOY WITH --no-verify-jwt: Auth calls this before the user has a JWT, so
// the gateway's JWT check would reject every call. The Standard Webhooks
// signature (verified first thing below) is what authenticates the caller.
//
//   npx supabase functions deploy send-sms-hook --no-verify-jwt --project-ref <ref>
//
// TIME BUDGET: Auth gives the hook 5 seconds in total, and retries only on
// 429/503. Hence the hard timeouts below, and every failure answers 500 —
// never 503 — so a slow provider can't turn into a duplicate paid SMS.
//
// NEVER LOG THE CODE. Logs carry the last three digits of the number and the
// provider status, nothing else.

import { Webhook } from "npm:standardwebhooks@1.0.0";
import { createClient } from "npm:@supabase/supabase-js@2";

type HookPayload = {
  user: { id: string; phone: string };
  sms: { otp: string };
};

// SMS4Free's status codes (from their API docs): >0 = sent to N recipients,
// 0/negative = specific documented failure reasons.
const STATUS_MESSAGES: Record<number, string> = {
  0: "general error",
  [-1]: "wrong key/username/password",
  [-2]: "wrong sender name/number",
  [-3]: "no recipients found",
  [-4]: "insufficient message balance",
  [-5]: "message content not valid",
  [-6]: "sender number needs verification (send one SMS manually from the SMS4Free site first)",
};

// Hebrew is sent as UCS-2, which caps a single SMS at 70 characters (vs 160).
// Both texts stay under that, so every login costs exactly one message.
// "code" / "קוד" plus a standalone number is what the phone's one-time-code
// autofill looks for.
const MESSAGES = {
  he: (otp: string) => `קוד הכניסה שלך ל-CoachFlow הוא ${otp}. אין למסור אותו לאף אחד.`,
  en: (otp: string) => `Your CoachFlow code is ${otp}. Don't share it with anyone.`,
};

// SMS4Free expects Israeli local format (0XXXXXXXXX). Auth may hand us the
// number with or without the "+".
function toIsraeliLocal(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.startsWith("972")) return `0${digits.slice(3)}`;
  if (digits.startsWith("0")) return digits;
  if (digits.length === 9) return `0${digits}`;
  return null;
}

// Error shape Auth expects from a hook; its message reaches the app's error.
function hookError(httpCode: number, message: string): Response {
  return new Response(JSON.stringify({ error: { http_code: httpCode, message } }), {
    status: httpCode,
    headers: { "Content-Type": "application/json" },
  });
}

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

// Existing users get their profile language; a first-time signup has no
// profile yet and gets Hebrew (the app's default market). Any lookup failure
// also falls back to Hebrew — the language must never block the code.
async function localeFor(userId: string): Promise<"he" | "en"> {
  try {
    const { data } = await supabase
      .from("profiles")
      .select("locale")
      .eq("id", userId)
      .abortSignal(AbortSignal.timeout(1000))
      .maybeSingle();
    return data?.locale === "en" ? "en" : "he";
  } catch {
    return "he";
  }
}

Deno.serve(async (req) => {
  const hookSecret = Deno.env.get("SEND_SMS_HOOK_SECRET");
  const apiKey = Deno.env.get("SMS4FREE_API_KEY");
  const smsUser = Deno.env.get("SMS4FREE_USER");
  const pass = Deno.env.get("SMS4FREE_PASS");
  const sender = Deno.env.get("SMS4FREE_SENDER");
  if (!hookSecret || !apiKey || !smsUser || !pass || !sender) {
    console.error("send-sms-hook: SEND_SMS_HOOK_SECRET / SMS4FREE_* secrets are not all set.");
    return hookError(500, "SMS sending is not configured.");
  }

  // Verify the signature against the RAW body before trusting anything in it.
  const rawBody = await req.text();
  let payload: HookPayload;
  try {
    const wh = new Webhook(hookSecret.replace("v1,whsec_", ""));
    payload = wh.verify(rawBody, Object.fromEntries(req.headers)) as HookPayload;
  } catch {
    return hookError(401, "Invalid webhook signature.");
  }

  const local = toIsraeliLocal(payload.user.phone ?? "");
  if (!local || !/^05\d{8}$/.test(local)) {
    return hookError(400, "Only Israeli mobile numbers are supported.");
  }
  const tail = local.slice(-3);

  const msg = MESSAGES[await localeFor(payload.user.id)](payload.sms.otp);

  try {
    const res = await fetch("https://api.sms4free.co.il/ApiSMS/v2/SendSMS", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: apiKey, user: smsUser, pass, sender, recipient: local, msg }),
      signal: AbortSignal.timeout(3500),
    });
    const result = (await res.json()) as { status: number; message: string };

    if (result.status > 0) {
      console.log(`send-sms-hook: sent to …${tail}`);
      return new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    const reason = STATUS_MESSAGES[result.status] ?? result.message ?? `unknown status ${result.status}`;
    console.error(`send-sms-hook: …${tail} SMS4Free status ${result.status} (${reason})`);
    return hookError(500, `SMS provider error: ${reason}`);
  } catch (e) {
    console.error(`send-sms-hook: …${tail} ${(e as Error).name}: ${(e as Error).message}`);
    return hookError(500, "SMS provider did not respond.");
  }
});
