-- v48: a colour for each private note (My Workspace > Private Notes), sticky-note style.
-- Applied live to jiltqrunlpewqkofzulz via MCP. Local record, as v2..v47.

alter table public.mtg_private_notes
  add column if not exists color text not null default 'yellow'
  check (color in ('yellow', 'blue', 'green', 'pink', 'purple', 'gray'));
