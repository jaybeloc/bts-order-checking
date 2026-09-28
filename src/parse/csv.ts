import Papa from 'papaparse';

export type Row = Record<string, string>;

/** Parse a CSV string into rows keyed by header, with every value trimmed.
 *  Row order is preserved and must stay that way: student grouping depends on it. */
export function parseCsv(text: string): Row[] {
  const result = Papa.parse<Row>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  });
  return result.data.map((row) => {
    const out: Row = {};
    for (const [k, v] of Object.entries(row)) out[k] = (v ?? '').toString().trim();
    return out;
  });
}

export function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsText(file);
  });
}

export function num(value: string | undefined): number {
  if (!value) return 0;
  const n = Number(value.replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * Pronto exports dates as 1-Sep-26. Handing that to `new Date()` is unreliable
 * across browsers, and d/m/y strings silently parse as m/d/y, so parse explicitly.
 */
export function parseProntoDate(value: string): Date | null {
  if (!value) return null;
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/.exec(value.trim());
  if (!m) return null;
  const day = Number(m[1]);
  const month = MONTHS[m[2].toLowerCase()];
  if (month === undefined) return null;
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  const d = new Date(year, month, day);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function orderKey(orderNo: string, boSuffix: string): string {
  return boSuffix ? `${orderNo}-${boSuffix}` : orderNo;
}
