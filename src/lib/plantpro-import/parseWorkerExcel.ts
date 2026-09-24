// Parses the "Foreign Worker (5)" worker-details Excel export: header row 4
// (1-based), data from row 5. No worker-ID column — Name is the only join key
// against the PDF timecard (see matching.ts).
//
// Column layout (0-based index into each data row array):
//   0 S/N, 1 Name, 2 Date Joined (DDMMYY string, e.g. "070116" -> 2016-01-07),
//   3 Nationality, 4 Passport No, 5 Passport Expiry (Excel date serial),
//   6 Date of Birth (Excel date serial), 7 Permit Expiry (Excel date serial;
//   the merged header spans this + column 8, whose numeric value is
//   unused/ambiguous and ignored), 9 Salary (per month), 10 Hostel (a full
//   address string, not a name/code).
//
// The sheet reports 283 total rows, but only 149 carry actual data (S/N
// 1-149) — the rest are blank formatting rows past the last entry. Rows with
// no Name are skipped.

export type ExcelWorkerRow = {
  rowNumber: number; // 1-based spreadsheet row, for error reporting
  name: string;
  dateJoined: string | null; // yyyy-MM-dd
  nationality: string;
  passportNo: string;
  passportExpiry: string | null; // yyyy-MM-dd
  dateOfBirth: string | null; // yyyy-MM-dd
  permitExpiry: string | null; // yyyy-MM-dd
  salary: number | null;
  hostelAddress: string;
};

export type ExcelParseResult = {
  rows: ExcelWorkerRow[];
  totalSheetRows: number;
  errors: { rowNumber: number; message: string }[];
};

const SHEET_NAME = 'Foreign Worker (5)';
const HEADER_ROW_INDEX = 3; // 0-based; spreadsheet row 4
const DATA_START_INDEX = 4; // 0-based; spreadsheet row 5

/** Excel's 1900 date system: serial 1 = 1900-01-01 (with the epoch offset baked in as 25569 = days between 1899-12-30 and 1970-01-01). */
function excelSerialToIso(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const utcDays = Math.floor(value - 25569);
  const ms = utcDays * 86400 * 1000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** "070116" (DDMMYY) -> "2016-01-07". Accepts numbers too (Excel sometimes drops a leading zero, e.g. 70116 for day 07). */
function ddmmyyStringToIso(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  let s = String(value).trim();
  if (/^\d+$/.test(s) && s.length < 6) s = s.padStart(6, '0');
  const m = s.match(/^(\d{2})(\d{2})(\d{2})$/);
  if (!m) return null;
  const [, dd, mm, yy] = m;
  const year = 2000 + Number(yy); // this export's dates are all 2000s
  return `${year}-${mm}-${dd}`;
}

function cleanString(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim().replace(/\s+/g, ' ');
}

export async function parseWorkerExcel(buffer: Buffer): Promise<ExcelParseResult> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const sheetName = workbook.SheetNames.includes(SHEET_NAME) ? SHEET_NAME : workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Sheet "${SHEET_NAME}" not found in the uploaded Excel file.`);

  const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
  const header = raw[HEADER_ROW_INDEX] || [];
  void header; // header row is documented/fixed above; not used for dynamic column lookup

  const rows: ExcelWorkerRow[] = [];
  const errors: { rowNumber: number; message: string }[] = [];

  for (let i = DATA_START_INDEX; i < raw.length; i++) {
    const r = raw[i];
    if (!r) continue;
    const name = cleanString(r[1]);
    if (!name) continue; // blank formatting row past the last real entry

    const rowNumber = i + 1;
    try {
      const salaryRaw = r[9];
      rows.push({
        rowNumber,
        name,
        dateJoined: ddmmyyStringToIso(r[2]),
        nationality: cleanString(r[3]),
        passportNo: cleanString(r[4]),
        passportExpiry: excelSerialToIso(r[5]),
        dateOfBirth: excelSerialToIso(r[6]),
        permitExpiry: excelSerialToIso(r[7]),
        salary: typeof salaryRaw === 'number' ? salaryRaw : salaryRaw ? Number(salaryRaw) || null : null,
        hostelAddress: cleanString(r[10]),
      });
    } catch (e) {
      errors.push({ rowNumber, message: (e as Error).message });
    }
  }

  return { rows, totalSheetRows: raw.length, errors };
}
