import type { DeliveryInfo } from '../types';
import { orderKey, parseCsv, type Row } from './csv';

const ADDR_FIELDS = ['Addr 1', 'Addr 2', 'Addr 3', 'Addr 4', 'Addr 5', 'Addr 6', 'Addr 7'];

function joinAddrFields(row: Row): string {
  return ADDR_FIELDS.map((f) => (row[f] ?? '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Returns delivery info keyed by order number + BO suffix.
 *
 * Each order has up to three rows:
 *   DA  the delivery address
 *   DI  the delivery instructions
 *   E   the contact email record
 *
 * DI text is wrapped across Addr 1 to Addr 7 mid-sentence, so those fields have
 * to be concatenated before the instruction can be read. An order can also have
 * no DI row at all, which is different from having a blank one.
 */
export function parseDelInfo(text: string): Map<string, DeliveryInfo> {
  const rows = parseCsv(text);
  if (rows.length === 0) throw new Error('The delivery info file has no rows.');
  if (!('Addr 1' in rows[0])) {
    throw new Error(
      'The delivery info file has no address columns. It may be the wrong export.',
    );
  }

  const out = new Map<string, DeliveryInfo>();

  const blank = (): DeliveryInfo => ({
    name: '',
    addressLines: [],
    suburb: '',
    state: '',
    postcode: '',
    phone: '',
    email: '',
    carrier: '',
    instructions: '',
    hasInstructionRow: false,
  });

  for (const row of rows) {
    const orderNo = row['Order No'];
    if (!orderNo) continue;
    const key = orderKey(orderNo, row['BO Suffix'] ?? '');
    const info = out.get(key) ?? blank();
    const type = (row['Type'] ?? '').toUpperCase();

    if (type === 'DA') {
      info.name = row['Addr 1'] ?? '';
      info.addressLines = [row['Addr 2'], row['Addr 3'], row['Addr 4']]
        .map((v) => (v ?? '').trim())
        .filter(Boolean);
      info.suburb = row['Addr 5'] ?? '';
      info.state = row['Addr 6'] ?? '';
      info.postcode = row['Post'] ?? '';
      info.phone = row['Phone'] ?? '';
      if (row['Email']) info.email = row['Email'];
    } else if (type === 'DI') {
      info.hasInstructionRow = true;
      const text = joinAddrFields(row);
      info.instructions = info.instructions ? `${info.instructions} ${text}`.trim() : text;
    } else if (type === 'E') {
      if (!info.email && row['Email']) info.email = row['Email'];
    }

    if (row['Carrier'] && !info.carrier) info.carrier = row['Carrier'];
    out.set(key, info);
  }

  return out;
}
