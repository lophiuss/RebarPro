-- v40: repoint mould_assets/mould_jobs/mould_time_entries from the
-- mould_projects/mould_workers sync-snapshot tables onto the real
-- plantpro_projects/plantpro_workers tables (now that PlantPro is merged
-- in as its own department), then drop the snapshot tables. Both snapshot
-- tables were synced from the same PMS source as plantpro_* and carry the
-- same source_pms_id values, so the remap below is a deterministic,
-- lossless join -- verified before writing this migration: every
-- mould_projects/mould_workers row has a matching source_pms_id in
-- plantpro_projects/plantpro_workers (0 unmatched), and mould_jobs/
-- mould_time_entries are currently empty (0 rows), so this is a schema
-- change with no real data at stake today -- the UPDATE statements below
-- exist for correctness/safety, not because they change anything right now.

begin;

-- ---------------------------------------------------------------------------
-- mould_assets.owning_project_id / current_project_id -> plantpro_projects.id
-- ---------------------------------------------------------------------------

alter table mould_assets drop constraint mould_assets_owning_project_id_fkey;
alter table mould_assets drop constraint mould_assets_current_project_id_fkey;

update mould_assets ma
set owning_project_id = pp.id
from mould_projects mp join plantpro_projects pp on pp.source_pms_id = mp.source_pms_id
where ma.owning_project_id = mp.id;

update mould_assets ma
set current_project_id = pp.id
from mould_projects mp join plantpro_projects pp on pp.source_pms_id = mp.source_pms_id
where ma.current_project_id = mp.id;

alter table mould_assets
  add constraint mould_assets_owning_project_id_fkey foreign key (owning_project_id) references plantpro_projects(id) on delete set null;
alter table mould_assets
  add constraint mould_assets_current_project_id_fkey foreign key (current_project_id) references plantpro_projects(id) on delete set null;

-- ---------------------------------------------------------------------------
-- mould_jobs.project_id -> plantpro_projects.id
-- ---------------------------------------------------------------------------

alter table mould_jobs drop constraint mould_jobs_project_id_fkey;

update mould_jobs mj
set project_id = pp.id
from mould_projects mp join plantpro_projects pp on pp.source_pms_id = mp.source_pms_id
where mj.project_id = mp.id;

alter table mould_jobs
  add constraint mould_jobs_project_id_fkey foreign key (project_id) references plantpro_projects(id) on delete set null;

-- ---------------------------------------------------------------------------
-- mould_time_entries.worker_id -> plantpro_workers.id, .project_id -> plantpro_projects.id
-- ---------------------------------------------------------------------------

alter table mould_time_entries drop constraint mould_time_entries_worker_id_fkey;
alter table mould_time_entries drop constraint mould_time_entries_project_id_fkey;

update mould_time_entries mte
set worker_id = pw.id
from mould_workers mw join plantpro_workers pw on pw.source_pms_id = mw.source_pms_id
where mte.worker_id = mw.id;

update mould_time_entries mte
set project_id = pp.id
from mould_projects mp join plantpro_projects pp on pp.source_pms_id = mp.source_pms_id
where mte.project_id = mp.id;

alter table mould_time_entries
  add constraint mould_time_entries_worker_id_fkey foreign key (worker_id) references plantpro_workers(id) on delete restrict;
alter table mould_time_entries
  add constraint mould_time_entries_project_id_fkey foreign key (project_id) references plantpro_projects(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Drop the now-unreferenced sync-snapshot tables.
-- ---------------------------------------------------------------------------

drop table mould_projects;
drop table mould_workers;

commit;
