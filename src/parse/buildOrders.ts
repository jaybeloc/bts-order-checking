import type { Config } from '../config';
import type {
  ChargeLine,
  DeliveryInfo,
  NoteLine,
  Order,
  QtyIssue,
  Student,
} from '../types';
import { orderKey, parseProntoDate } from './csv';
import type { UnfinishedRow } from './unfinished';

const YEAR_TAG = /^year\s*:\s*(.*)$/i;
const NAME_TAG = /^name\s*:\s*(.*)$/i;

/**
 * Walks an order's lines in export order and splits them into students.
 *
 * The layout is: a `Year:` note, then a `Name:` note, then that student's pack
 * and items, repeating for each child on the order. Pairing is positional, so
 * the export's row order must be preserved all the way through the parser.
 * Sequence numbers cannot be used for this: they run 3.1, 3.11, 3.12 ... 3.2,
 * which sorts wrongly as numbers.
 */
function extractStudents(lines: UnfinishedRow[]): Student[] {
  const students: Student[] = [];
  for (const line of lines) {
    if (line.type !== 'DN') continue;
    const desc = line.description.trim();

    const year = YEAR_TAG.exec(desc);
    if (year) {
      students.push({ year: year[1].trim() || null, name: null, seq: line.seq });
      continue;
    }

    const name = NAME_TAG.exec(desc);
    if (name) {
      const open = students.length ? students[students.length - 1] : null;
      if (open && open.name === null) {
        open.name = name[1].trim() || null;
      } else {
        // A name with no year ahead of it. Kept as its own entry so the rules flag it.
        students.push({ year: null, name: name[1].trim() || null, seq: line.seq });
      }
    }
  }
  return students;
}

export function buildOrders(
  rows: UnfinishedRow[],
  delivery: Map<string, DeliveryInfo>,
  config: Config,
): Order[] {
  const grouped = new Map<string, UnfinishedRow[]>();
  for (const row of rows) {
    const key = orderKey(row.orderNo, row.boSuffix);
    const bucket = grouped.get(key);
    if (bucket) bucket.push(row);
    else grouped.set(key, [row]);
  }

  const ignored = new Set(config.ignoredItemCodes);
  const orders: Order[] = [];

  for (const [key, lines] of grouped) {
    const head = lines[0];

    const charges: ChargeLine[] = lines
      .filter((l) => l.type === 'SC')
      .map((l) => ({ seq: l.seq, itemCode: l.itemCode, description: l.description }));

    const noteLines: NoteLine[] = lines
      .filter((l) => l.type === 'DN')
      .map((l) => ({
        seq: l.seq,
        itemCode: l.itemCode.trim(),
        description: l.description.trim(),
      }))
      .filter((l) => l.description);

    const notes: string[] = noteLines.map((l) => l.description);

    // Only SN lines are real stock movements.
    //
    // KN lines are booklist pack headers wrapping the SN components that follow,
    // so counting them reports the same shortage twice.
    //
    // ZROUND "Stock rounding" lines carry negative ordered quantities against a
    // shipped quantity of zero. Comparing them marks a fully shipped order as a
    // backorder, which is the single easiest way to misroute an order.
    const qtyIssues: QtyIssue[] = lines
      .filter(
        (l) =>
          l.type === 'SN' &&
          !ignored.has(l.itemCode) &&
          l.orderedQty !== l.shippedQty,
      )
      .map((l) => ({
        seq: l.seq,
        itemCode: l.itemCode,
        description: l.description,
        orderedQty: l.orderedQty,
        shippedQty: l.shippedQty,
        onHand: l.onHand,
      }));

    orders.push({
      key,
      orderNo: head.orderNo,
      boSuffix: head.boSuffix,
      customer: head.customer,
      reference: head.reference,
      orderedRaw: head.orderedRaw,
      orderedDate: parseProntoDate(head.orderedRaw),
      warehouse: head.warehouse,
      status: head.status,
      rep: head.rep,
      students: extractStudents(lines),
      charges,
      notes,
      noteLines,
      qtyIssues,
      lines,
      delivery: delivery.get(key) ?? null,
      lineCount: lines.length,
    });
  }

  return orders;
}

const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;

/**
 * True for orders that are not a student's booklist: stock transfers, samples,
 * internal ZBTS orders. The ERP export is meant to filter these out; this is the
 * safety net for the ones that slip through, which would otherwise sit in check
 * forever with no student, no packing fee and no payment note.
 *
 * Markers are matched as whole words against the reference and the customer
 * code, either of which can carry one. Whole words rather than any substring,
 * so a family called Samples keeps their order.
 */
export function isInternalOrder(order: Order, config: Config): boolean {
  const markers = config.internalOrderMarkers.filter(Boolean);
  if (markers.length === 0) return false;
  const pattern = new RegExp(
    `\\b(${markers.map((m) => m.replace(REGEX_SPECIALS, '\\$&')).join('|')})\\b`,
    'i',
  );
  return pattern.test(`${order.reference} ${order.customer}`);
}

/** Splits the internal orders out so they never reach the rules. */
export function partitionInternal(
  orders: Order[],
  config: Config,
): { customer: Order[]; internal: Order[] } {
  const customer: Order[] = [];
  const internal: Order[] = [];
  for (const order of orders) {
    (isInternalOrder(order, config) ? internal : customer).push(order);
  }
  return { customer, internal };
}
