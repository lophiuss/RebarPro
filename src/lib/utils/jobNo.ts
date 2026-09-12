// Every maintenance job (Jobs, Work Requests, Job History — all the same
// underlying maintenance_work_requests table) already has a unique,
// auto-generated `id`. Rather than adding a new column/migration just to
// get a "Job No.", this derives one straight from that id — automatic
// for every job, past and future, with zero schema change.
export function jobNo(id: number | string): string {
  return `JOB-${String(id).padStart(5, '0')}`
}
