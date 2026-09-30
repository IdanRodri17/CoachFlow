// supabase/functions/send-reminders/index.ts — V11 email reminders, V17
// day-before + morning-of scheduling.
//
// Runs on a schedule (see "CRON SETUP" below). Reads due_reminders
// (0019_reminder_scheduling.sql), which decides BOTH which workouts are due
// and what time of day is appropriate to tell someone — all in Asia/Jerusalem,
// server-side, never this function's clock. Each row arrives tagged with a
// `kind`:
//   'day_before' — session is tomorrow; the view only exposes it from 18:00.
//   'morning_of' — session is today;    the view only exposes it from 07:00.
// The two are tracked in separate columns (reminded_at / morning_reminded_at),
// stamped after a successful send so no run ever double-sends, and so one
// timing failing never suppresses the other.
//
// App clients only — offline/managed clients have no email on file.
//
// SECRETS (set once: `supabase secrets set NAME=value`):
//   RESEND_API_KEY      — from https://resend.com/api-keys
//   REMINDER_FROM_EMAIL — a sender on a domain verified with Resend, e.g.
//                         "CoachFlow <reminders@yourdomain.com>". Resend's
//                         sandbox address (used if this isn't set) only
//                         delivers to the Resend account's own email — fine
//                         for a first smoke test, not for real clients.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically into
// every edge function — nothing to set for those.
//
// CRON SETUP (pick one):
//   1. Dashboard: Edge Functions -> send-reminders -> Cron -> add a schedule,
//      e.g. "0 * * * *". Hourly is the right cadence and is SAFE: the view's
//      own time gates decide when a message may go out, and the stamp columns
//      make every later tick a no-op. Running hourly just means each reminder
//      lands within an hour of its 18:00 / 07:00 gate. (Do NOT try to encode
//      the send times in the cron expression instead — pg_cron is UTC and
//      Israel shifts between UTC+2 and UTC+3, so a fixed hour would drift
//      across DST. Let the view hold the local-time logic.)
//   2. SQL (pg_cron + pg_net — enable both under Database -> Extensions),
//      run once in the SQL editor:
//        select cron.schedule(
//          'send-reminders-hourly',
//          '0 * * * *',
//          $$
//          select net.http_post(
//            url := 'https://<project-ref>.supabase.co/functions/v1/send-reminders',
//            headers := jsonb_build_object(
//              'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
//              'Content-Type', 'application/json'
//            )
//          );
//          $$
//        );
//
// MANUAL SMOKE TEST: invoke this function directly (Dashboard "Invoke"
// button, or `curl -X POST .../functions/v1/send-reminders -H "Authorization:
// Bearer <anon-or-service-key>"`). Response is a JSON summary; run it twice
// in a row to confirm the second run sends zero (already reminded).

import { createClient } from "npm:@supabase/supabase-js@2";

type ReminderKind = "day_before" | "morning_of";

type DueReminder = {
  id: string;
  trainer_id: string;
  client_id: string;
  template_id: string | null;
  scheduled_date: string;
  scheduled_time: string | null;
  kind: ReminderKind;
};

// V17: the view emits both timings; each stamps its own column so one never
// suppresses the other (see 0019_reminder_scheduling.sql).
const REMINDED_COLUMN: Record<ReminderKind, string> = {
  day_before: "reminded_at",
  morning_of: "morning_reminded_at",
};

const TIME_ZONE = "Asia/Jerusalem";

function formatDate(dateISO: string): string {
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: TIME_ZONE,
  }).format(new Date(`${dateISO}T12:00:00Z`));
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (_req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("REMINDER_FROM_EMAIL") ?? "CoachFlow <onboarding@resend.dev>";

  if (!resendApiKey) {
    return json({ error: "RESEND_API_KEY secret is not set." }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: due, error: dueErr } = await supabase.from("due_reminders").select("*").returns<DueReminder[]>();
  if (dueErr) return json({ error: dueErr.message }, 500);
  if (!due || due.length === 0) return json({ due: 0, sent: 0, skipped: 0, failed: 0 });

  // Batch-fetch names (client + trainer) and template names — avoids one
  // query per row for what's usually a small, occasional batch.
  const clientIds = [...new Set(due.map((d) => d.client_id))];
  const trainerIds = [...new Set(due.map((d) => d.trainer_id))];
  const templateIds = [...new Set(due.map((d) => d.template_id).filter(Boolean) as string[])];

  const [profilesRes, templatesRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", [...new Set([...clientIds, ...trainerIds])]),
    templateIds.length > 0
      ? supabase.from("workout_templates").select("id, name").in("id", templateIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[], error: null }),
  ]);
  if (profilesRes.error) return json({ error: profilesRes.error.message }, 500);

  const nameById = new Map((profilesRes.data ?? []).map((p) => [p.id, p.display_name]));
  const templateNameById = new Map((templatesRes.data ?? []).map((t) => [t.id, t.name]));

  // Emails live in auth.users, not profiles — one admin lookup per unique
  // client (small batch given the 24h window). A null email (phone-only
  // signup) means we skip, not fail.
  const emailByClientId = new Map<string, string | null>();
  for (const id of clientIds) {
    const { data, error } = await supabase.auth.admin.getUserById(id);
    emailByClientId.set(id, error ? null : (data.user?.email ?? null));
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const row of due) {
    const email = emailByClientId.get(row.client_id);
    if (!email) {
      skipped++;
      continue;
    }

    // Resolve the stamp column BEFORE sending. row.kind comes from the view,
    // and .returns<>() is only a compile-time assertion — if these functions
    // are ever deployed against a database where 0019 hasn't been applied, the
    // old views have no `kind`, the lookup yields undefined, and the update
    // would PATCH a column literally named "undefined". Doing it after the
    // send means the mail goes out and is never marked, so every subsequent
    // cron tick re-sends it. Fail before spending anything.
    const column = REMINDED_COLUMN[row.kind];
    if (!column) {
      failed++;
      errors.push(`${row.id}: unknown reminder kind "${row.kind}" — is migration 0019 applied?`);
      continue;
    }

    const clientName = nameById.get(row.client_id) ?? "there";
    const trainerName = nameById.get(row.trainer_id) ?? "your trainer";
    const templateName = row.template_id ? (templateNameById.get(row.template_id) ?? "your workout") : "your workout";
    const dateLabel = formatDate(row.scheduled_date);
    const timeLabel = row.scheduled_time ? row.scheduled_time.slice(0, 5) : null;
    // "today at 07:30" reads better than "Mon, Mar 3 at 07:30" on the morning
    // itself; the day-before message still needs the explicit date.
    const when =
      row.kind === "morning_of"
        ? timeLabel
          ? `today at ${timeLabel}`
          : "today"
        : timeLabel
          ? `${dateLabel} at ${timeLabel}`
          : dateLabel;
    const subject =
      row.kind === "morning_of"
        ? `Today: ${templateName} ${when}`
        : `Reminder: ${templateName} ${when}`;

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to: email,
          subject,
          html: `<p>Hi ${clientName},</p><p>Just a reminder — you have <strong>${templateName}</strong> ${when} with ${trainerName}.</p><p>See you then! 💪</p>`,
        }),
      });
      if (!res.ok) {
        failed++;
        errors.push(`${row.id}: Resend ${res.status} ${await res.text()}`);
        continue;
      }

      const { error: updateErr } = await supabase
        .from("scheduled_workouts")
        .update({ [column]: new Date().toISOString() })
        .eq("id", row.id);
      if (updateErr) {
        failed++;
        errors.push(`${row.id}: sent but failed to mark ${column} (${updateErr.message})`);
        continue;
      }
      sent++;
    } catch (e) {
      failed++;
      errors.push(`${row.id}: ${(e as Error).message}`);
    }
  }

  return json({ due: due.length, sent, skipped, failed, errors });
});
