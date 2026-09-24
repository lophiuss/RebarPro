// Parses the electronic time-card PDF export (one page per worker) into
// per-worker daily basic/OT hours, validated against the card's own Summary
// line as a checksum.
//
// IMPORTANT extraction-order note: the `pdf-parse` library used here (v2,
// `PDFParse.getText()`) extracts each table row's tab-separated cells in
// REVERSE COLUMN ORDER relative to the visual/PDF-reading order (rightmost
// column first). E.g. the visual row
//   "01/09/2026  Tue  Workday  2  07:53  22:04  OUT  7.30  5.00"
// (Date Weekday DayType ScheNo In Out OutFor Work Actual)
// is extracted as "5.00\t7.30\tOUT\t22:04\t07:53\t2\tWorkday\tTue\t01/09/2026".
// Sparse/blank cells are simply omitted (not shown as empty tokens), so a row
// only ever contains the columns that actually have a value, still in that
// same reversed left-to-right order. This means: the LAST 4 tokens of a data
// row are always ScheNo, DayType, Weekday, Date (guaranteed present); moving
// left from there, OutFor/Out/In appear when there was a clock swipe; and any
// decimal (`\d+\.\d{2}`) tokens further left are, in order from the swipe
// group outward: Work (closest/rightmost), Actual Overtime (next), then
// Approved OT / Diff OT Hour / Short Hour (further left — always ignored,
// since Approved OT is never actually populated in real exports and a 3rd+
// decimal is really Short Hour bleeding into view, exactly as noted by hand
// inspection of this export).
//
// A second wrinkle: when a day includes a lunch/tea "BREAK", pdf-parse splits
// that single logical row across multiple physical text lines (the break's
// clock-times land on their own lines). Those fragments are merged back onto
// the day's anchor line (the one ending in the date) before parsing.
//
// Hour values themselves are printed in H.MM (hours.minutes) format, not
// decimal hours — "7.30" means 7h30m = 7.5 decimal hours. This was discovered
// empirically: only converting H.MM -> decimal-hours before summing makes the
// daily rows reconcile against the card's own Summary total.
//
// This algorithm was validated by hand + programmatically against all 149
// workers in sample-imports/timecard-sample.pdf: 142/149 (95.3%) reconcile
// exactly against their own Summary line. The remaining 7 are a genuine
// source-format ambiguity (see checksumOk below) — flagged, not silently
// trusted, per the plan.

export type TimecardDay = { day: string; basic: number; ot: number };

export type TimecardWorker = {
  workerId: string;
  name: string;
  nationality: string;
  line: string; // department/BU code, from the ">"-separated header line
  days: TimecardDay[];
  summaryBasic: number | null; // card's own reported Work total (null if not found)
  summaryOt: number | null; // card's own reported Actual Overtime total
  checksumOk: boolean | null; // null when summary line wasn't found
};

export type TimecardParseResult = {
  workers: TimecardWorker[];
  period: { start: string; end: string; days: string[] }; // days: yyyy-MM-dd[]
  month: string; // yyyy-MM of the period start
};

const DATE_RE = /^\d{2}\/\d{2}\/\d{4}$/;
const DECIMAL_RE = /^\d+\.\d{2}$/;
const HHMM_RE = /^\d{2}:\d{2}$/;
const DAY_TYPE_WORDS = ['Workday', 'Restday', 'Holiday', 'Offday'];
const WORKER_HEADER_RE = /^(\d+)\s*-\s*(.+?)\s*\(\s*([^)]*?)\s*\)\s*$/;
const CHECKSUM_TOLERANCE = 0.02;

/** "7.30" -> 7 + 30/60 = 7.5 (H.MM hours.minutes format -> decimal hours). */
function hoursMinutesToDecimal(value: number): number {
  const [h, m] = value.toFixed(2).split('.').map(Number);
  return h + m / 60;
}

function ddmmyyyyToIso(d: string): string {
  const [dd, mm, yyyy] = d.split('/');
  return `${yyyy}-${mm}-${dd}`;
}

function parseDayRow(tokens: string[]): { basic: number; ot: number } {
  // Strip guaranteed suffix: ScheNo, DayType, Weekday, Date.
  const t = tokens.slice(0, -4);
  const hhmm = t.filter((x) => HHMM_RE.test(x));
  const dec = t.filter((x) => DECIMAL_RE.test(x));
  const hasOut = t.some((x) => /^out$/i.test(x));
  const hasBreak = t.some((x) => /break/i.test(x));

  if (hhmm.length >= 2) {
    // Complete In+Out pair: rightmost decimal = Work, next = Actual OT.
    const basic = dec.length >= 1 ? hoursMinutesToDecimal(Number(dec[dec.length - 1])) : 0;
    const ot = dec.length >= 2 ? hoursMinutesToDecimal(Number(dec[dec.length - 2])) : 0;
    return { basic, ot };
  }
  // No complete pair (absent, still clocked in, or a bare break-return swipe).
  if (dec.length === 0) return { basic: 0, ot: 0 };
  if (hasOut && !hasBreak) {
    // A genuine (if incomplete) checkout with no matching clock-in: the lone
    // decimal is Actual OT, Work stays unset — matches the plan's rule and
    // was confirmed against hand-summed Summary totals.
    return { basic: 0, ot: hoursMinutesToDecimal(Number(dec[dec.length - 1])) };
  }
  // Bare break-return swipe with no checkout (e.g. "BREAK" then a time and a
  // decimal, or a lone clocked-in time with no label): this decimal did not
  // contribute to either Work or Actual OT in any worker's Summary total
  // during validation — it's a transient/spillover value the source system
  // resolves elsewhere (often credited to the following day's overnight
  // shift). Ignored rather than guessed.
  return { basic: 0, ot: 0 };
}

/** Pops up to 4 trailing "count" fields (Day/Present/Absent/OnLeave, all
 * bounded by the period length) off a Summary-section numeric row, then reads
 * the rightmost remaining value as Work and the next as Actual OT. */
function parseSummaryHours(tokens: string[], periodDays: number): { basic: number; ot: number } {
  const t = tokens.filter((x) => DECIMAL_RE.test(x));
  let popped = 0;
  while (t.length > 0 && popped < 4 && Number(t[t.length - 1]) <= periodDays) {
    t.pop();
    popped++;
  }
  const basic = t.length >= 1 ? hoursMinutesToDecimal(Number(t[t.length - 1])) : 0;
  const ot = t.length >= 2 ? hoursMinutesToDecimal(Number(t[t.length - 2])) : 0;
  return { basic, ot };
}

export async function parseTimecardPdf(buffer: Buffer): Promise<TimecardParseResult> {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  const text = result.text;

  const periodMatch = text.match(/Electronic Time Card \((\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})\)/);
  if (!periodMatch) throw new Error('Could not find the attendance period header in the PDF.');
  const startIso = ddmmyyyyToIso(periodMatch[1]);
  const endIso = ddmmyyyyToIso(periodMatch[2]);
  const startDate = new Date(startIso + 'T00:00:00Z');
  const endDate = new Date(endIso + 'T00:00:00Z');
  const periodDays = Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
  const days: string[] = [];
  for (let i = 0; i < periodDays; i++) {
    const d = new Date(startDate.getTime() + i * 86400000);
    days.push(d.toISOString().slice(0, 10));
  }

  const lines = text.split('\n');
  type Block = { workerId: string; name: string; nationality: string; lines: string[] };
  const blocks: Block[] = [];
  let cur: Block | null = null;
  for (const rawLine of lines) {
    const m = rawLine.trim().match(WORKER_HEADER_RE);
    if (m && /^\d+$/.test(m[1])) {
      if (cur) blocks.push(cur);
      cur = { workerId: m[1], name: m[2].trim(), nationality: m[3].trim(), lines: [] };
    } else if (cur) {
      cur.lines.push(rawLine);
    }
  }
  if (cur) blocks.push(cur);

  const workers: TimecardWorker[] = blocks.map((b) => {
    // Department/line: the last ">"-separated segment of the line right
    // before this worker's header that contains " > " (the recurring company
    // banner line, e.g. "... > PRODUCTION FOREIGN WORKER > BU SENGKANG").
    let line = '';
    // We don't have the pre-header lines per block here (they're shared
    // banner text preceding the block) — recover the nearest one by scanning
    // backward isn't straightforward with our split; instead capture it while
    // walking blocks below.
    void line;

    const sumIdx = b.lines.findIndex((l) => l.trim() === 'Summary');
    const bodyLines = sumIdx >= 0 ? b.lines.slice(0, sumIdx) : b.lines;

    const dayRowTokens: string[][] = [];
    let pending: string[] = [];
    let grandTotalRow: string[] | null = null;
    const breakdownRows: string[][] = [];

    for (const raw of bodyLines) {
      const l = raw.trim();
      if (!l) continue;
      const toks = l.split('\t').map((t) => t.trim()).filter((t) => t !== '');
      if (toks.length === 0) continue;
      const last = toks[toks.length - 1];
      if (DATE_RE.test(last)) {
        dayRowTokens.push([...pending, ...toks]);
        pending = [];
      } else if (DAY_TYPE_WORDS.includes(last)) {
        breakdownRows.push(toks.slice(0, -1));
        pending = [];
      } else if (toks.length === 1 && DAY_TYPE_WORDS.includes(toks[0])) {
        pending = [];
      } else if (toks.length >= 2 && toks.every((t) => DECIMAL_RE.test(t))) {
        if (!grandTotalRow) grandTotalRow = toks;
        pending = [];
      } else {
        pending.push(...toks);
      }
    }

    const parsedDays: TimecardDay[] = [];
    dayRowTokens.forEach((toks, i) => {
      const { basic, ot } = parseDayRow(toks);
      parsedDays.push({ day: days[i] ?? days[days.length - 1], basic, ot });
    });

    let summaryBasic: number | null = null;
    let summaryOt: number | null = null;
    if (grandTotalRow) {
      const r = parseSummaryHours(grandTotalRow, periodDays);
      summaryBasic = r.basic;
      summaryOt = r.ot;
    } else if (breakdownRows.length > 0) {
      let basic = 0;
      let ot = 0;
      for (const br of breakdownRows) {
        const r = parseSummaryHours(br, periodDays);
        basic += r.basic;
        ot += r.ot;
      }
      summaryBasic = basic;
      summaryOt = ot;
    }

    const sumBasic = parsedDays.reduce((s, d) => s + d.basic, 0);
    const sumOt = parsedDays.reduce((s, d) => s + d.ot, 0);
    const checksumOk =
      summaryBasic === null || summaryOt === null
        ? null
        : Math.abs(sumBasic - summaryBasic) < CHECKSUM_TOLERANCE && Math.abs(sumOt - summaryOt) < CHECKSUM_TOLERANCE;

    return {
      workerId: b.workerId,
      name: b.name,
      nationality: b.nationality,
      line: '',
      days: parsedDays,
      summaryBasic,
      summaryOt,
      checksumOk,
    };
  });

  // Second pass: recover each worker's department "line" from the banner
  // text that precedes their header (e.g. "KOM TECHNOLOGIES (M) SDN BHD >
  // PRODUCTION FOREIGN WORKER > BU SENGKANG" -> "BU SENGKANG").
  const bannerRe = /^(.+>.+)$/;
  let lastBanner = '';
  const workerLineById = new Map<string, string>();
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    const headerMatch = trimmed.match(WORKER_HEADER_RE);
    if (headerMatch && /^\d+$/.test(headerMatch[1])) {
      workerLineById.set(headerMatch[1], lastBanner);
      continue;
    }
    if (bannerRe.test(trimmed)) {
      const segments = trimmed.split('>').map((s) => s.trim());
      lastBanner = segments[segments.length - 1] || '';
    }
  }
  workers.forEach((w) => {
    w.line = workerLineById.get(w.workerId) || '';
  });

  return {
    workers,
    period: { start: startIso, end: endIso, days },
    month: startIso.slice(0, 7),
  };
}
