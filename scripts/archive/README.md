# Archived one-off scripts

These already did their job — the cement and security department merges and
their Google Drive photo migration are complete and live. Kept here purely
as a historical record of how that data got into Supabase, not as scripts
meant to run again.

If one of these ever needs to be re-run: `google-drive-auth.mjs`,
`link-security-drive-photos.mjs`, `migrate-cement-users.mjs`,
`migrate-cement.mjs`, and `migrate-security.mjs` each resolve the project
root as `path.dirname(path.dirname(fileURLToPath(import.meta.url)))` —
that assumed the script lived directly under `scripts/` (two levels below
the project root). Now that they live under `scripts/archive/` (three
levels below root), that line needs a third `path.dirname(...)` wrapped
around it before the script will find `.env.local` correctly.
