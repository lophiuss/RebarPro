-- v17: moved the daily cement variance report from 10am to 1pm Malaysia
-- time, to give the morning's stock-take entries more time to be corrected
-- before the snapshot is taken (see the investigation into PLO 79/OPC's
-- alert vs. Report mismatch — the alert is a point-in-time snapshot, the
-- Report always recalculates live, so a correction made after the snapshot
-- makes the two disagree until the next run).
--
-- Applied live to jiltqrunlpewqkofzulz via MCP. This file is the local
-- record of that state, matching the v2..v16 convention.

-- 05:00 UTC = 13:00 (1pm) Malaysia Time (UTC+8, no DST).
select cron.alter_job(
  (select jobid from cron.job where jobname = 'cement-daily-alert-report'),
  schedule => '0 5 * * *'
);
