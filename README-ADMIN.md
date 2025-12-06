Admin: Reconcile or remove user accounts

This repo includes a helper script to inspect and (optionally) fix mismatches between the PostgreSQL `users` table and Supabase Auth.

File: `scripts/reconcile-user.js`

Purpose:
- Find whether a given email exists in the DB (`users`) and/or in Supabase Auth.
- Optionally delete the Supabase Auth user (`--delete-auth`) so the email can be reused.
- Optionally re-create a minimal DB `users` row linked to an existing Supabase Auth id (`--recreate-db`).

Safety:
- Destructive operations require the `--confirm` flag. Without `--confirm` the script only reports what it would do.

Requirements:
- A `.env` file with:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY` (required to call the Admin APIs)
  - `DATABASE_URL`

Usage examples:

1) Report-only (no destructive actions):
   node scripts/reconcile-user.js you@sm.imamu.edu.sa

2) Delete the Supabase Auth user (irreversible):
   node scripts/reconcile-user.js you@sm.imamu.edu.sa --delete-auth --confirm

3) Recreate a minimal DB row linked to the existing Supabase auth id:
   node scripts/reconcile-user.js you@sm.imamu.edu.sa --recreate-db --confirm

4) Both actions together (delete auth then recreate db) — not common, be careful:
   node scripts/reconcile-user.js you@sm.imamu.edu.sa --delete-auth --recreate-db --confirm

Notes:
- This script is intentionally minimal. Update `recreateDbUserFromAuth()` if you need to insert more fields (student_id, university, etc.).
- Prefer deleting the Supabase Auth user from the Supabase dashboard if you're not comfortable running scripts.
