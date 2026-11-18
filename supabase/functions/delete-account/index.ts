// supabase/functions/delete-account/index.ts — in-app account deletion.
//
// Apple and Google require an in-app way to delete your account (not just
// "email us") for any app with login. Deleting the auth.users row cascades
// through the database: profiles.id references auth.users(id) on delete
// cascade, and every trainer_id/client_id column cascades from profiles.id in
// turn (see supabase/migrations/0001_profiles.sql onward).
//
// Cascades never reach Storage, though: there is no FK into storage.objects.
// So the account's progress photos are removed here FIRST, while the
// managed_clients rows that name a trainer's offline-client folders still
// exist. If that fails, the account is left in place so the user can retry;
// an account must never be "deleted" while its body photos survive.
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

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const BUCKET = "progress-photos";
const PAGE = 100;
// 100 passes x 100 objects = 10,000 photos per folder before we give up loudly.
const MAX_PASSES = 100;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

// Photos live flat under "<owner id>/<timestamp>.jpg": the account's own id
// (an app client's photos), plus one folder per offline client a trainer
// manages (managed_clients.id). Each pass lists up to PAGE objects and removes
// them, until the folder is empty.
async function removeOwnedPhotos(admin: SupabaseClient, userId: string): Promise<void> {
  const { data: managed, error } = await admin
    .from("managed_clients")
    .select("id")
    .eq("trainer_id", userId);
  if (error) throw error;

  const folders = [userId, ...(managed ?? []).map((m) => m.id as string)];
  for (const folder of folders) {
    let emptied = false;
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      const { data: objects, error: listErr } = await admin.storage
        .from(BUCKET)
        .list(folder, { limit: PAGE });
      if (listErr) throw listErr;
      // Files only: a sub-folder entry has no id (paths are flat, so none expected).
      const paths = (objects ?? []).filter((o) => o.id !== null).map((o) => `${folder}/${o.name}`);
      if (paths.length === 0) {
        emptied = true;
        break;
      }
      const { error: removeErr } = await admin.storage.from(BUCKET).remove(paths);
      if (removeErr) throw removeErr;
    }
    if (!emptied) throw new Error(`folder ${folder} still has photos after ${MAX_PASSES} passes`);
  }
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
  const userId = userData.user.id;

  const admin = createClient(supabaseUrl, serviceRoleKey);

  try {
    await removeOwnedPhotos(admin, userId);
  } catch (e) {
    console.error("delete-account: photo removal failed:", (e as Error).message);
    return json(
      { error: "Couldn't finish deleting your photos. Your account was not deleted; please try again." },
      500,
    );
  }

  const { error: deleteErr } = await admin.auth.admin.deleteUser(userId);
  if (deleteErr) {
    console.error("delete-account: deleteUser failed:", deleteErr.message);
    return json({ error: "Couldn't delete the account. Please try again." }, 500);
  }

  return json({ deleted: true });
});
