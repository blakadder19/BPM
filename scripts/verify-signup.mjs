/**
 * Run after applying fix-trigger.sql to verify signup works.
 * Usage: node --env-file=.env.local scripts/verify-signup.mjs
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("Missing env vars"); process.exit(1); }

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

async function run() {
  const testEmail = `verify-signup-${Date.now()}@test.local`;
  console.log(`Creating test user: ${testEmail}`);

  const { data, error } = await admin.auth.admin.createUser({
    email: testEmail,
    password: "test123456",
    email_confirm: true,
    user_metadata: {
      full_name: "Verify Test",
      role: "student",
      preferred_role: "leader",
    },
  });

  if (error) {
    console.log("FAILED:", error.message);
    console.log(">>> fix-trigger.sql was NOT applied or did not fix the issue <<<");
    process.exit(1);
  }

  console.log("User created:", data.user?.id);

  const { data: uRow } = await admin.from("users").select("id, email, role").eq("id", data.user.id).maybeSingle();
  console.log("public.users row:", uRow ? `EXISTS (role=${uRow.role})` : "MISSING");

  const { data: pRow } = await admin.from("student_profiles").select("id").eq("id", data.user.id).maybeSingle();
  console.log("student_profiles row:", pRow ? "EXISTS" : "MISSING");

  // Cleanup
  await admin.auth.admin.deleteUser(data.user.id);
  console.log("Test user cleaned up.");

  if (uRow && pRow) {
    console.log("\n>>> SIGNUP IS WORKING. Trigger is fixed. <<<");
  } else {
    console.log("\n>>> Partial failure — user created but profile rows missing <<<");
  }
}

run().catch(console.error);
