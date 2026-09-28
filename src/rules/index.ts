import type { Config } from '../config';
import type { Category, Order } from '../types';

/** Everything a rule is allowed to know beyond the order itself. */
export interface EvalContext {
  config: Config;
  /** False until the delivery info file is loaded, so address rules stay quiet. */
  deliveryFileLoaded: boolean;
}

/**
 * A rule fires when `test` returns true. `detail` adds the specifics the
 * operator needs to act without opening the order.
 *
 * To add an exception, add an object to the array at the bottom of this file.
 * Nothing else needs to change. Values that might move (fee wording, cutoff
 * date, valid years) belong in config.ts, not in here.
 */
export interface Rule {
  id: string;
  category: Exclude<Category, 'clean'>;
  label: string;
  /** Skip the rule entirely, for anything toggled off in the UI. */
  applies?: (order: Order, ctx: EvalContext) => boolean;
  test: (order: Order, ctx: EvalContext) => boolean;
  detail?: (order: Order, ctx: EvalContext) => string | undefined;
}

function hasCharge(order: Order, prefix: string): boolean {
  const wanted = prefix.toLowerCase();
  return order.charges.some((c) => c.description.toLowerCase().startsWith(wanted));
}

/** Free delivery runs up to and including the cutoff. */
export function deliveryFeeRequired(order: Order, { config }: EvalContext): boolean {
  if (config.deliveryFeeMode === 'off') return false;
  if (config.deliveryFeeMode === 'on') return true;
  if (!order.orderedDate) return false;
  const cutoff = new Date(`${config.freeDeliveryUntil}T23:59:59`);
  return order.orderedDate.getTime() > cutoff.getTime();
}

/**
 * Year tags are typed by hand and arrive as "Year 7-8", "Year 7 - 8", "year 7/8".
 * Comparing a canonical form keeps spacing and slashes from raising a false flag.
 */
export function normaliseYear(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/^YEAR(?=\d)/, 'YEAR ')
    .replace(/\s*[-/]\s*/g, '-')
    .replace(/\s+/g, ' ');
}

export function isKnownYear(value: string, config: Config): boolean {
  const wanted = normaliseYear(value);
  return config.validYears.some((y) => normaliseYear(y) === wanted);
}

const YEAR_OR_NAME_TAG = /^(year|name)\s*:/i;

/**
 * DN lines that are not part of the normal paperwork.
 *
 * Quiet: Year and Name tags, booklist pack headers (which carry a stock code
 * rather than a note code), and the standard notes listed in config. Anything
 * else is text a customer typed where it does not belong, usually a delivery
 * instruction, so the team can move it to the delivery record. Working from a
 * list of notes to stay quiet about, rather than a list of words to look for,
 * means an unusual note is never missed.
 */
export function unexpectedNotes(order: Order, { config }: EvalContext): string[] {
  const noteCodes = config.noteItemCodes.map((c) => c.toUpperCase());
  const quiet = [
    config.paidNoteText,
    config.multipleOrdersNote,
    ...config.holdNoteMarkers,
    ...config.expectedNotes,
  ]
    .filter(Boolean)
    .map((s) => s.toUpperCase());

  return order.noteLines
    .filter((n) => !n.itemCode || noteCodes.includes(n.itemCode.toUpperCase()))
    .map((n) => n.description)
    .filter((d) => !YEAR_OR_NAME_TAG.test(d))
    .filter((d) => !quiet.some((q) => d.toUpperCase().includes(q)));
}

export const rules: Rule[] = [
  {
    id: 'do-not-process',
    category: 'hold',
    label: 'Marked do not process',
    test: (order, { config }) =>
      order.notes.some((note) =>
        config.holdNoteMarkers.some((marker) =>
          note.toUpperCase().includes(marker.toUpperCase()),
        ),
      ),
    detail: (order, { config }) =>
      order.notes.find((note) =>
        config.holdNoteMarkers.some((m) => note.toUpperCase().includes(m.toUpperCase())),
      ),
  },
  {
    id: 'wrong-warehouse',
    category: 'hold',
    label: 'Not a BTS warehouse order',
    test: (order, { config }) => order.warehouse !== config.expectedWarehouse,
    detail: (order) => `Warehouse ${order.warehouse || 'blank'}`,
  },

  {
    id: 'no-student',
    category: 'check',
    label: 'No student details on the order',
    test: (order) => order.students.length === 0,
  },
  {
    id: 'missing-name',
    category: 'check',
    label: 'Year with no name',
    test: (order) => order.students.some((s) => s.year !== null && !s.name),
    detail: (order) => {
      const years = order.students.filter((s) => s.year !== null && !s.name).map((s) => s.year);
      return years.join(', ');
    },
  },
  {
    id: 'missing-year',
    category: 'check',
    label: 'Name with no year',
    test: (order) => order.students.some((s) => s.name !== null && !s.year),
    detail: (order) =>
      order.students
        .filter((s) => s.name !== null && !s.year)
        .map((s) => s.name)
        .join(', '),
  },
  {
    id: 'unknown-year',
    category: 'check',
    label: 'Year value not recognised',
    test: (order, { config }) =>
      order.students.some((s) => s.year !== null && !isKnownYear(s.year, config)),
    detail: (order, { config }) =>
      order.students
        .filter((s) => s.year !== null && !isKnownYear(s.year!, config))
        .map((s) => s.year)
        .join(', '),
  },
  {
    id: 'multiple-students',
    category: 'check',
    label: 'Multiple orders inside',
    test: (order) => order.students.length > 1,
    detail: (order, { config }) => {
      const who = order.students
        .map((s) => `${s.name ?? 'no name'} (${s.year ?? 'no year'})`)
        .join(', ');
      const already = order.delivery?.instructions
        .toUpperCase()
        .includes(config.multipleOrdersNote.toUpperCase());
      return already ? `${who} — note already on the order` : `${who} — note still to add`;
    },
  },
  {
    id: 'missing-packing-fee',
    category: 'check',
    label: 'No packing fee',
    test: (order, { config }) => !hasCharge(order, config.packingFeePrefix),
  },
  {
    id: 'missing-delivery-fee',
    category: 'check',
    label: 'No delivery fee',
    applies: deliveryFeeRequired,
    test: (order, { config }) => !hasCharge(order, config.deliveryFeePrefix),
  },
  {
    id: 'not-paid',
    category: 'check',
    label: 'No payment confirmation',
    test: (order, { config }) =>
      !order.notes.some((note) =>
        note.toUpperCase().includes(config.paidNoteText.toUpperCase()),
      ),
  },
  {
    // Instructions in the delivery record are in the right place and stay quiet.
    // This is for the ones typed onto the order as a note, which the team moves.
    id: 'note-in-wrong-place',
    category: 'check',
    label: 'Note in the wrong place',
    test: (order, ctx) => unexpectedNotes(order, ctx).length > 0,
    detail: (order, ctx) => unexpectedNotes(order, ctx).join(' · '),
  },
  {
    id: 'no-delivery-record',
    category: 'check',
    label: 'No delivery address found',
    // Only meaningful once the delivery info file is loaded.
    applies: (_order, ctx) => ctx.deliveryFileLoaded,
    test: (order) => !order.delivery || !order.delivery.name,
  },

  {
    id: 'qty-mismatch',
    category: 'backorder',
    label: 'Ordered and shipped do not match',
    test: (order) => order.qtyIssues.length > 0,
    detail: (order) => {
      const n = order.qtyIssues.length;
      const short = order.qtyIssues
        .slice(0, 3)
        .map((i) => `${i.itemCode} ${i.shippedQty}/${i.orderedQty}`)
        .join(', ');
      return n > 3 ? `${n} lines: ${short}, …` : `${n} line${n === 1 ? '' : 's'}: ${short}`;
    },
  },
];
