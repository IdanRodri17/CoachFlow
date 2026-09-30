// supabase/functions/send-sms-reminders/index.ts — V11 add-on: automated SMS
// reminders via SMS4Free (api.sms4free.co.il), as a cheaper/simpler
// alternative to WhatsApp Business API automation (which needs Meta business
// verification + approved message templates — see the conversation this was
// scoped from). Unlike email, this reaches BOTH app clients (trainer_clients.
// contact_phone) and offline/managed clients (managed_clients.phone), since
// SMS only needs a phone number, not an account.
//
// Runs on the same windows as send-reminders — day-before from 18:00 and
// morning-of from 07:00 Asia/Jerusalem, both decided server-side by the
// due_sms_reminders view (0019_reminder_scheduling.sql) and tagged on each row
// as `kind`. Tracked independently of email via sms_reminded_at /
// morning_sms_reminded_at: a client with both an email and a phone gets both
// reminders, and either channel or timing being unavailable never blocks the
// others.
//
// LANGUAGE (V18): Hebrew by default, English for app clients whose profile
// locale is 'en'; each text is kept to one paid SMS segment (buildReminder).
//
// SECRETS (set once: `supabase secrets set NAME=value`):
//   SMS4FREE_API_KEY — from your SMS4Free dashboard's API page.
//   SMS4FREE_USER    — the mobile number you log into sms4free.co.il with.
//   SMS4FREE_PASS    — the password you log into sms4free.co.il with.
//   SMS4FREE_SENDER  — shown to recipients as the sender. IMPORTANT: on the
//                      free-trial tier this MUST exactly equal SMS4FREE_USER
//                      (your own registered mobile number) — SMS4Free only
//                      allows a custom alphanumeric sender name (e.g.
//                      "CoachFlow", max 11 chars, English letters/digits
//                      only) after purchasing a paid message package.
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically.
//
// ONE-TIME PREREQUISITE (per SMS4Free's own docs): before the API will work
// AT ALL, you must manually send one SMS from the "שליחת SMS" page on
// sms4free.co.il, using the same sender number — this verifies the sender.
// Skipping this makes every API call fail with status -6.
//
// CRON (V18): scheduled hourly by pg_cron in the checked-in migration
// 0022_reminder_cron.sql (job "send-sms-reminders-hourly"). Hourly is safe:
// the view gates the send time, and the stamp columns make repeat ticks
// no-ops — which matters on this channel, since every SMS costs money.
//
// AUTH (V18): only that job may start a run. It sends an x-cron-secret header,
// checked below against Vault via verify_cron_secret() (0022), so the secret
// never leaves the database and isn't duplicated as a function secret.
// DEPLOY WITH --no-verify-jwt: this check replaces the gateway's JWT check,
// which anyone holding the public anon key would pass.
//
// MANUAL SMOKE TEST: from the SQL Editor, `select public.invoke_sms_reminders();`
// (same code path as the cron job), then read the JSON summary with
// `select status_code, content from net._http_response order by created desc limit 1;`.
// Run twice to confirm the second run sends zero. The Dashboard "Invoke"
// button can't send the header and correctly gets 401. Every attempt is
// recorded in public.reminder_log (0023).

import { createClient } from "npm:@supabase/supabase-js@2";

type ReminderKind = "day_before" | "morning_of";

type DueSmsReminder = {
  id: string;
  trainer_id: string;
  client_id: string | null;
  managed_client_id: string | null;
  template_id: string | null;
  scheduled_date: string;
  scheduled_time: string | null;
  kind: ReminderKind;
};

// V17: the view emits both timings; each stamps its own column so one never
// suppresses the other (see 0019_reminder_scheduling.sql).
const SMS_REMINDED_COLUMN: Record<ReminderKind, string> = {
  day_before: "sms_reminded_at",
  morning_of: "morning_sms_reminded_at",
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

type Locale = "he" | "en";

// First word only: "Dana Cohen" → "Dana". Shorter SMS, and how a trainer
// actually addresses a client.
function firstName(name: string | null | undefined): string | null {
  const first = name?.trim().split(/\s+/)[0];
  return first ? first : null;
}

// One paid SMS segment is 160 GSM-7 characters, but only 70 UTF-16 units as
// soon as the text contains anything outside GSM — which every Hebrew
// message does. (Printable ASCII is used as a close-enough stand-in for GSM-7.)
function fitsOneSms(msg: string): boolean {
  return /^[\x20-\x7E\n]*$/.test(msg) ? msg.length <= 160 : msg.length <= 70;
}

// V18 (B3): reminders in the client's language — Hebrew unless an app client
// chose English in the app; offline clients have no app, so Hebrew (the
// default market). day_before rows are always for TOMORROW and morning_of
// rows for TODAY (0019's view guarantees it), so the texts say so instead of
// spelling a date. Candidates run longest-first; the first one that fits a
// single segment is sent, so a long template name can't double the cost.
function buildReminder(
  locale: Locale,
  kind: ReminderKind,
  p: { client: string | null; trainer: string | null; template: string | null; time: string | null },
): string {
  const candidates: string[] = [];
  if (locale === "he") {
    const day = kind === "morning_of" ? "היום" : "מחר";
    const when = p.time ? `${day} ב-${p.time}` : day;
    const withTrainer = p.trainer ? ` עם ${p.trainer}` : "";
    const workout = p.template ? `"${p.template}"` : "אימון";
    if (p.client) candidates.push(`היי ${p.client}! תזכורת: ${workout} ${when}${withTrainer}. נתראה!`);
    candidates.push(`תזכורת: ${workout} ${when}${withTrainer}`);
    candidates.push(`תזכורת: אימון ${when}${withTrainer}`);
    candidates.push(`תזכורת: אימון ${when}`);
  } else {
    const day = kind === "morning_of" ? "today" : "tomorrow";
    const when = p.time ? `${day} at ${p.time}` : day;
    const withTrainer = p.trainer ? ` with ${p.trainer}` : "";
    const workout = p.template ? `"${p.template}"` : "your workout";
    if (p.client) candidates.push(`Hi ${p.client}! Reminder: ${workout} ${when}${withTrainer}. See you then!`);
    candidates.push(`Reminder: ${workout} ${when}${withTrainer}`);
    candidates.push(`Reminder: workout ${when}${withTrainer}`);
    candidates.push(`Reminder: workout ${when}`);
  }
  return candidates.find(fitsOneSms) ?? candidates[candidates.length - 1];
}

// SMS4Free expects Israeli local format (0XXXXXXXXX) — normalize whatever
// format the trainer typed in (e.g. "+972501234567", "050-123-4567").
function toIsraeliLocal(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.startsWith("972")) return `0${digits.slice(3)}`;
  if (digits.startsWith("0")) return digits;
  if (digits.length === 9) return `0${digits}`;
  return null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const apiKey = Deno.env.get("SMS4FREE_API_KEY");
  const user = Deno.env.get("SMS4FREE_USER");
  const pass = Deno.env.get("SMS4FREE_PASS");
  const sender = Deno.env.get("SMS4FREE_SENDER");

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Only the pg_cron job (or invoke_sms_reminders() by hand) gets past here.
  const { data: authorized, error: authErr } = await supabase.rpc("verify_cron_secret", {
    p_secret: req.headers.get("x-cron-secret") ?? "",
  });
  if (authErr) return json({ error: `cron secret check failed: ${authErr.message}` }, 500);
  if (!authorized) return json({ error: "Forbidden" }, 401);

  if (!apiKey || !user || !pass || !sender) {
    return json({ error: "SMS4FREE_API_KEY / SMS4FREE_USER / SMS4FREE_PASS / SMS4FREE_SENDER secrets are not all set." }, 500);
  }

  const { data: due, error: dueErr } = await supabase
    .from("due_sms_reminders")
    .select("*")
    .returns<DueSmsReminder[]>();
  if (dueErr) return json({ error: dueErr.message }, 500);
  if (!due || due.length === 0) return json({ due: 0, sent: 0, skipped: 0, failed: 0 });

  const appClientIds = [...new Set(due.map((d) => d.client_id).filter(Boolean) as string[])];
  const managedClientIds = [...new Set(due.map((d) => d.managed_client_id).filter(Boolean) as string[])];
  const trainerIds = [...new Set(due.map((d) => d.trainer_id))];
  const templateIds = [...new Set(due.map((d) => d.template_id).filter(Boolean) as string[])];

  const [trainerProfilesRes, appNamesRes, appPhonesRes, managedRes, templatesRes] = await Promise.all([
    supabase.from("profiles").select("id, display_name").in("id", trainerIds),
    appClientIds.length > 0
      ? supabase.from("profiles").select("id, display_name, locale").in("id", appClientIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string; locale: string }[], error: null }),
    appClientIds.length > 0
      ? supabase.from("trainer_clients").select("client_id, contact_phone").in("client_id", appClientIds)
      : Promise.resolve({ data: [] as { client_id: string; contact_phone: string | null }[], error: null }),
    managedClientIds.length > 0
      ? supabase.from("managed_clients").select("id, name, phone").in("id", managedClientIds)
      : Promise.resolve({ data: [] as { id: string; name: string; phone: string | null }[], error: null }),
    templateIds.length > 0
      ? supabase.from("workout_templates").select("id, name").in("id", templateIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[], error: null }),
  ]);
  if (trainerProfilesRes.error) return json({ error: trainerProfilesRes.error.message }, 500);
  if (appNamesRes.error) return json({ error: appNamesRes.error.message }, 500);
  if (appPhonesRes.error) return json({ error: appPhonesRes.error.message }, 500);
  if (managedRes.error) return json({ error: managedRes.error.message }, 500);
  if (templatesRes.error) return json({ error: templatesRes.error.message }, 500);

  const trainerNameById = new Map((trainerProfilesRes.data ?? []).map((p) => [p.id, p.display_name]));
  const appNameById = new Map((appNamesRes.data ?? []).map((p) => [p.id, p.display_name]));
  const appLocaleById = new Map((appNamesRes.data ?? []).map((p) => [p.id, p.locale]));
  const appPhoneById = new Map((appPhonesRes.data ?? []).map((r) => [r.client_id, r.contact_phone]));
  const managedById = new Map((managedRes.data ?? []).map((m) => [m.id, m]));
  const templateNameById = new Map((templatesRes.data ?? []).map((t) => [t.id, t.name]));

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];

  // V18 (0023): one reminder_log row per send attempt, success or failure, so
  // "did it go out and what did SMS4Free say?" is a query, not a guess. A
  // logging failure is reported in the summary but never blocks the send.
  async function logAttempt(
    row: DueSmsReminder,
    recipient: string,
    providerStatus: string | null,
    error: string | null,
  ) {
    const { error: logErr } = await supabase.from("reminder_log").insert({
      scheduled_workout_id: row.id,
      channel: "sms",
      kind: row.kind,
      recipient,
      provider_status: providerStatus,
      error,
    });
    if (logErr) errors.push(`${row.id}: failed to write reminder_log (${logErr.message})`);
  }

  for (const row of due) {
    // Resolve the stamp column BEFORE sending — see the same guard in
    // send-reminders. An unmarked SMS is re-sent on every cron tick, and
    // unlike email each one costs money.
    const column = SMS_REMINDED_COLUMN[row.kind];
    if (!column) {
      failed++;
      errors.push(`${row.id}: unknown reminder kind "${row.kind}" — is migration 0019 applied?`);
      continue;
    }

    const clientName = row.client_id
      ? appNameById.get(row.client_id)
      : managedById.get(row.managed_client_id!)?.name;
    const locale: Locale = row.client_id && appLocaleById.get(row.client_id) === "en" ? "en" : "he";
    const rawPhone = row.client_id
      ? appPhoneById.get(row.client_id)
      : managedById.get(row.managed_client_id!)?.phone;

    const phone = rawPhone ? toIsraeliLocal(rawPhone) : null;
    if (!phone) {
      skipped++;
      continue;
    }

    const message = buildReminder(locale, row.kind, {
      client: firstName(clientName),
      trainer: firstName(trainerNameById.get(row.trainer_id)),
      template: row.template_id ? (templateNameById.get(row.template_id) ?? null) : null,
      time: row.scheduled_time ? row.scheduled_time.slice(0, 5) : null,
    });

    try {
      const res = await fetch("https://api.sms4free.co.il/ApiSMS/v2/SendSMS", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: apiKey, user, pass, sender, recipient: phone, msg: message }),
      });
      const result = (await res.json()) as { status: number; message: string };

      if (result.status > 0) {
        const { error: updateErr } = await supabase
          .from("scheduled_workouts")
          .update({ [column]: new Date().toISOString() })
          .eq("id", row.id);
        if (updateErr) {
          failed++;
          errors.push(`${row.id}: sent but failed to mark ${column} (${updateErr.message})`);
          await logAttempt(row, phone, String(result.status), `sent, but failed to mark ${column}: ${updateErr.message}`);
          continue;
        }
        sent++;
        await logAttempt(row, phone, String(result.status), null);
      } else {
        failed++;
        const reason = STATUS_MESSAGES[result.status] ?? result.message ?? `unknown status ${result.status}`;
        errors.push(`${row.id}: SMS4Free status ${result.status} (${reason})`);
        await logAttempt(row, phone, String(result.status), reason);
      }
    } catch (e) {
      failed++;
      errors.push(`${row.id}: ${(e as Error).message}`);
      await logAttempt(row, phone, null, (e as Error).message);
    }
  }

  return json({ due: due.length, sent, skipped, failed, errors });
});
