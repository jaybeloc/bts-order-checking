import type { OrderLine } from '../types';
import { num, parseCsv, type Row } from './csv';

export interface UnfinishedRow extends OrderLine {
  customer: string;
  reference: string;
  orderedRaw: string;
  warehouse: string;
  status: string;
  rep: string;
}

const REQUIRED = ['Order No', 'Type', 'Description', 'Ordered Qty', 'Shipped Qty'];

export function parseUnfinished(text: string): UnfinishedRow[] {
  const rows = parseCsv(text);
  if (rows.length === 0) throw new Error('The unfinished sales file has no rows.');

  const missing = REQUIRED.filter((c) => !(c in rows[0]));
  if (missing.length) {
    throw new Error(
      `The unfinished sales file is missing these columns: ${missing.join(', ')}. ` +
        'Check the export template in Pronto.',
    );
  }

  return rows
    .filter((r) => r['Order No'])
    .map((r: Row) => ({
      orderNo: r['Order No'],
      boSuffix: r['BO Suffix'] ?? '',
      seq: r['Seq.'] ?? '',
      type: r['Type'] ?? '',
      itemCode: r['Item Code'] ?? '',
      description: r['Description'] ?? '',
      orderedQty: num(r['Ordered Qty']),
      shippedQty: num(r['Shipped Qty']),
      boQty: num(r['B/O Qty']),
      onHand: num(r['On Hand']),
      availableQty: num(r['Available Qty']),
      customer: r['Customer'] ?? '',
      reference: r['Reference'] ?? '',
      orderedRaw: r['Ordered'] ?? '',
      warehouse: r['Whse'] ?? '',
      status: r['Status'] ?? '',
      rep: r['Rep'] ?? '',
    }));
}
