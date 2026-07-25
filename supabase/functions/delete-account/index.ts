// supabase/functions/delete-account/index.ts — deployment prep: in-app
// account deletion.
//
// Apple/Google require an in-app way to delete your account (not just "email
// us") for any app with login (docs/DEPLOYMENT.md §7). Deleting the
// auth.users row cascades through the whole schema — profiles.id references
// auth.users(id) on delete cascade, and every trainer_id/client_id column
// cascades from profiles.id in turn (see supabase/migrations/0001_profiles.sql
// onward) — so this one call removes the account and everything it owns; no
// per-table cleanup needed here.
//
// Deleting an auth user requires the service_role key, which must never reach
// the app (CLAUDE.md). So the app calls this function with the caller's own
// session; the function verifies that session itself (never trusts a
// client-supplied user id for a destructive admin operation) via an anon-key
// client, then uses a separate service-role client to delete exactly that
// verified user.
//
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are injected
// automatically into every edge function — nothing to set for those.

import { createClient } from "npm:@supabase/supabase-js@2";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing Authorization header." }, 401);

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await callerClient.auth.getUser();
  if (userErr || !userData.user) {
    return json({ error: "Not authenticated." }, 401);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { error: deleteErr } = await admin.auth.admin.deleteUser(userData.user.id);
  if (deleteErr) return json({ error: deleteErr.message }, 500);

  return json({ deleted: true });
});
