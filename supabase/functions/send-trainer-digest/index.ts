// supabase/functions/send-trainer-digest/index.ts — V17: the trainer's
// morning digest.
//
// One email per trainer per morning listing every session they have TODAY
// (Asia/Jerusalem), ordered by time. Sessions with no time set are listed
// last under "any time", matching how the Schedule tab orders them.
//
// Distinct from send-reminders / send-sms-reminders, which tell the CLIENT
// about their own workout. This tells the TRAINER about their whole day, so
// it is one message per trainer, not per workout — which is also why there is
// no per-row "already sent" column to stamp: the digest is idempotent by
// virtue of running once a day on a cron. If it is invoked twice in one
// morning the trainer gets it twice; that is a deliberate trade against
// adding a table just to track a once-daily send.
//
// Trainers opt out via Profile > Notifications
// (profiles.daily_digest_enabled). The trainer_daily_digest view already
// filters opted-out trainers, so there is no check to write here.
//
// ⚠️ AUTH: this endpoint requires a shared secret in the x-cron-secret header.
// Platform JWT verification alone is NOT enough here — the anon key satisfies
// it and ships inside every app binary, so anyone could POST this endpoint in
// a loop and, because there is no per-send stamp column, re-blast every
// opted-in trainer on every request (burning the Resend quota and putting the
// shared REMINDER_FROM_EMAIL sender at risk, which would degrade the
// client-facing reminders too). The reminder functions are replay-bounded by
// their stamp columns; this one is not, so it carries its own gate.
//
// SECRETS (set once: `supabase secrets set NAME=value`):
//   RESEND_API_KEY      — from https://resend.com/api-keys
//   REMINDER_FROM_EMAIL — same verified sender as send-reminders.
//   DIGEST_CRON_SECRET  — any long random string you generate. Send it as the
//                         x-cron-secret header from whatever triggers this.
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically.
//
// CRON SETUP: same two options as send-reminders (Dashboard Cron, or pg_cron
// + pg_net), but schedule this one ONCE PER DAY in the morning.
//
//   ⚠️ Exactly one daily entry. This function has no per-send tracking column,
//      so every invocation emails every opted-in trainer. An hourly schedule
//      would email them hourly.
//
// Cron expressions are UTC. Israel is UTC+3 in summer (IDT) and UTC+2 in
// winter (IST), so 07:00 local is:
//   "0 4 * * *"  → 07:00 IDT (summer) / 06:00 IST (winter)
//   "0 5 * * *"  → 08:00 IDT (summer) / 07:00 IST (winter)
// Pick whichever end of that hour you prefer and accept the DST drift — a
// digest arriving at 06:00 or 08:00 instead of 07:00 is harmless.
//
// The pg_net snippet in send-reminders works here too — just add the header:
//   headers := jsonb_build_object(
//     'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
//     'x-cron-secret', '<DIGEST_CRON_SECRET>',
//     'Content-Type', 'application/json'
//   )
//
// MANUAL SMOKE TEST: curl with both headers. The Dashboard's "Invoke" button
// can't set a custom header, so it will (correctly) return 403 here:
//   curl -X POST https://<ref>.supabase.co/functions/v1/send-trainer-digest \
//     -H "Authorization: Bearer <ANON_OR_SERVICE_KEY>" \
//     -H "x-cron-secret: <DIGEST_CRON_SECRET>"
// Response is a JSON summary.

import { createClient } from "npm:@supabase/supabase-js@2";

type DigestRow = {
  trainer_id: string;
  scheduled_workout_id: string;
  client_id: string | null;
  managed_client_id: string | null;
  template_id: string | null;
  scheduled_date: string;
  scheduled_time: string | null;
  status: string;
};

const TIME_ZONE = "Asia/Jerusalem";

function formatDate(dateISO: string): string {
  return new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: TIME_ZONE,
  }).format(new Date(`${dateISO}T12:00:00Z`));
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// display_name is client-controlled and unconstrained (profiles_update_own is
// row-level with no column restriction, and there's no CHECK on the column), so
// it crosses a trust boundary on its way into this HTML. Left raw, a client
// could name themselves a fake billing link and have it delivered to their own
// trainer from the trainer's verified sender.
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get("DIGEST_CRON_SECRET");
  if (!cronSecret) {
    return json({ error: "DIGEST_CRON_SECRET secret is not set." }, 500);
  }
  if (req.headers.get("x-cron-secret") !== cronSecret) {
    return json({ error: "Forbidden." }, 403);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("REMINDER_FROM_EMAIL") ?? "CoachFlow <onboarding@resend.dev>";

  if (!resendApiKey) {
    return json({ error: "RESEND_API_KEY secret is not set." }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: rows, error: rowsErr } = await supabase
    .from("trainer_daily_digest")
    .select("*")
    .returns<DigestRow[]>();
  if (rowsErr) return json({ error: rowsErr.message }, 500);
  if (!rows || rows.length === 0) return json({ trainers: 0, sent: 0, skipped: 0, failed: 0 });

  // Batch-fetch the names this digest needs, same approach as send-reminders:
  // a handful of queries for the whole run rather than one per row.
  const trainerIds = [...new Set(rows.map((r) => r.trainer_id))];
  const appClientIds = [...new Set(rows.map((r) => r.client_id).filter(Boolean) as string[])];
  const managedClientIds = [...new Set(rows.map((r) => r.managed_client_id).filter(Boolean) as string[])];
  const templateIds = [...new Set(rows.map((r) => r.template_id).filter(Boolean) as string[])];

  const [profilesRes, managedRes, templatesRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", [...new Set([...trainerIds, ...appClientIds])]),
    managedClientIds.length > 0
      ? supabase.from("managed_clients").select("id, name").in("id", managedClientIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[], error: null }),
    templateIds.length > 0
      ? supabase.from("workout_templates").select("id, name").in("id", templateIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[], error: null }),
  ]);
  if (profilesRes.error) return json({ error: profilesRes.error.message }, 500);
  if (managedRes.error) return json({ error: managedRes.error.message }, 500);
  if (templatesRes.error) return json({ error: templatesRes.error.message }, 500);

  const nameById = new Map((profilesRes.data ?? []).map((p) => [p.id, p.display_name]));
  const managedNameById = new Map((managedRes.data ?? []).map((m) => [m.id, m.name]));
  const templateNameById = new Map((templatesRes.data ?? []).map((t) => [t.id, t.name]));

  // Trainer emails live in auth.users, not profiles — one admin lookup per
  // trainer (a small batch: this is the trainer roster, not the client list).
  const emailByTrainerId = new Map<string, string | null>();
  for (const id of trainerIds) {
    const { data, error } = await supabase.auth.admin.getUserById(id);
    emailByTrainerId.set(id, error ? null : (data.user?.email ?? null));
  }

  const byTrainer = new Map<string, DigestRow[]>();
  for (const row of rows) {
    const list = byTrainer.get(row.trainer_id) ?? [];
    list.push(row);
    byTrainer.set(row.trainer_id, list);
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const [trainerId, sessions] of byTrainer) {
    const email = emailByTrainerId.get(trainerId);
    if (!email) {
      skipped++;
      continue;
    }

    // Timed sessions first in clock order, untimed ("any time") last.
    sessions.sort((a, b) => {
      if (a.scheduled_time === b.scheduled_time) return 0;
      if (a.scheduled_time === null) return 1;
      if (b.scheduled_time === null) return -1;
      return a.scheduled_time < b.scheduled_time ? -1 : 1;
    });

    const trainerName = nameById.get(trainerId) ?? "there";
    const dateLabel = formatDate(sessions[0].scheduled_date);

    const items = sessions
      .map((s) => {
        const clientName = s.client_id
          ? (nameById.get(s.client_id) ?? "Client")
          : (managedNameById.get(s.managed_client_id!) ?? "Client");
        const templateName = s.template_id
          ? (templateNameById.get(s.template_id) ?? "Workout")
          : "Workout";
        const time = s.scheduled_time ? s.scheduled_time.slice(0, 5) : "Any time";
        const done = s.status === "completed" ? " ✓" : "";
        return `<li><strong>${time}</strong> — ${esc(clientName)} · ${esc(templateName)}${done}</li>`;
      })
      .join("");

    const count = sessions.length;
    const subject = `Today: ${count} session${count === 1 ? "" : "s"}`;

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
          html:
            `<p>Good morning ${esc(trainerName)},</p>` +
            `<p>Here's your ${dateLabel}:</p>` +
            `<ul>${items}</ul>` +
            `<p>Have a good one 💪</p>`,
        }),
      });
      if (!res.ok) {
        failed++;
        // Status only — the response body and the trainer's UUID both leak to
        // whatever called this. Full detail goes to the function logs.
        console.error(`digest failed for ${trainerId}: Resend ${res.status} ${await res.text()}`);
        errors.push(`Resend ${res.status}`);
        continue;
      }
      sent++;
    } catch (e) {
      failed++;
      console.error(`digest failed for ${trainerId}: ${(e as Error).message}`);
      errors.push("send failed");
    }
  }

  return json({ trainers: byTrainer.size, sent, skipped, failed, errors });
});
