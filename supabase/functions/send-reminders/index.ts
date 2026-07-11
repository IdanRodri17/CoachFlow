// supabase/functions/send-reminders/index.ts — V11: 24h-ahead email reminders.
//
// Runs on a schedule (see "CRON SETUP" below). Finds scheduled_workouts due
// within the next 24h (Asia/Jerusalem — computed server-side by the
// due_reminders view in 0011_reminders.sql, never the function's own clock)
// that haven't been reminded yet, emails the client via Resend, and stamps
// reminded_at so a second run never double-sends.
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
//      e.g. "0 * * * *" (hourly is plenty — the reminder window is 24h wide).
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

type DueReminder = {
  id: string;
  trainer_id: string;
  client_id: string;
  template_id: string | null;
  scheduled_date: string;
  scheduled_time: string | null;
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

    const clientName = nameById.get(row.client_id) ?? "there";
    const trainerName = nameById.get(row.trainer_id) ?? "your trainer";
    const templateName = row.template_id ? (templateNameById.get(row.template_id) ?? "your workout") : "your workout";
    const dateLabel = formatDate(row.scheduled_date);
    const timeLabel = row.scheduled_time ? row.scheduled_time.slice(0, 5) : null;
    const when = timeLabel ? `${dateLabel} at ${timeLabel}` : dateLabel;

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
          subject: `Reminder: ${templateName} ${when}`,
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
        .update({ reminded_at: new Date().toISOString() })
        .eq("id", row.id);
      if (updateErr) {
        failed++;
        errors.push(`${row.id}: sent but failed to mark reminded_at (${updateErr.message})`);
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
