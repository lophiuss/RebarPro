-- Token/cost tracking for AI Helper — every Gemini call logs its token
-- counts, and the super admin can set a $/1M-token rate to turn that into
-- an estimated cost (the app has no way to know real-time Gemini billing,
-- so this is a configurable estimate, not an exact invoice figure).
-- Applied live via the Supabase MCP apply_migration tool; this file is the
-- local record, per this repo's migration convention.

create table if not exists ai_helper_usage_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  model text not null,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  total_tokens integer not null default 0,
  created_at timestamptz not null default now()
);

alter table ai_helper_usage_log enable row level security;

create policy ai_helper_usage_log_insert on ai_helper_usage_log
  for insert with check (user_id = auth.uid());

create policy ai_helper_usage_log_select on ai_helper_usage_log
  for select using (is_super_admin());

alter table ai_helper_settings
  add column if not exists price_per_1m_input_tokens numeric not null default 0,
  add column if not exists price_per_1m_output_tokens numeric not null default 0;
