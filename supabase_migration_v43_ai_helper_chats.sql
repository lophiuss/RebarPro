-- v43: ai_helper_chats — saved AI Helper conversations, private to the
-- person who had them. RLS is strictly user_id = auth.uid() for every
-- operation: no other user, including admins, can read someone else's chats
-- (they can contain data that person was entitled to see, e.g. salaries).
--
-- Applied live to jiltqrunlpewqkofzulz via MCP. Local record, as v2..v42.

create table public.ai_helper_chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default 'New chat',
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ai_helper_chats_user_updated_idx on public.ai_helper_chats (user_id, updated_at desc);
alter table public.ai_helper_chats enable row level security;
create policy "own chats select" on public.ai_helper_chats for select using (user_id = auth.uid());
create policy "own chats insert" on public.ai_helper_chats for insert with check (user_id = auth.uid());
create policy "own chats update" on public.ai_helper_chats for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own chats delete" on public.ai_helper_chats for delete using (user_id = auth.uid());
