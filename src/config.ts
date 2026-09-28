/**
 * Everything here changes without any logic changing.
 * If you find yourself editing a rule to change a value, the value belongs in here.
 */

export type DeliveryFeeMode = 'auto' | 'on' | 'off';

export interface Config {
  /** Charge line descriptions are matched by prefix, never by sequence number.
   *  Sequence positions move between orders (packing sat at 909 in September,
   *  delivery sits at 909 once it is added). Descriptions are stable. */
  packingFeePrefix: string;
  deliveryFeePrefix: string;

  /** Free delivery applies up to and including this date. */
  freeDeliveryUntil: string; // ISO yyyy-mm-dd

  /** auto = decide per order from its own order date.
   *  on / off = force, for when policy changes at short notice. */
  deliveryFeeMode: DeliveryFeeMode;

  /** The note Pronto puts on a paid web order. */
  paidNoteText: string;

  /** Anything not in this list is held. */
  expectedWarehouse: string;

  /** Year tag values that are considered valid. Compared loosely: case, spacing
   *  and a slash instead of a dash do not matter. */
  validYears: string[];

  /** Orders that are not a student's booklist: stock transfers, samples, internal
   *  ZBTS orders. They are dropped before the rules run rather than filling the
   *  check bucket with orders that will never have a student or a packing fee.
   *  Matched against the reference and the customer code, since either can carry
   *  the marker depending on how the order was raised. */
  internalOrderMarkers: string[];

  /** Item codes on stock lines that are not real stock movements. */
  ignoredItemCodes: string[];

  /** Text that means the order must not be released, whatever else it looks like. */
  holdNoteMarkers: string[];

  /** The note the team adds in Pronto for a multi-student order. */
  multipleOrdersNote: string;

  /** Item codes Pronto puts on DN lines that are genuine notes. A DN line
   *  carrying any other code is a booklist pack header, not a note. */
  noteItemCodes: string[];

  /** Notes that belong on an order, so the checker stays quiet about them.
   *
   *  The paid note, the hold markers and the multi-student note are covered
   *  already and do not need repeating here. Everything else on a note line is
   *  flagged for the team to move, which is the way round that matters: an
   *  unusual note is never missed, and a note that turns out to be standard is
   *  silenced by adding it to this list. */
  expectedNotes: string[];
}

/** Prep to Year 12. Year 12 is the top: there is no Year 13. */
const YEAR_LEVELS = ['Prep', ...Array.from({ length: 12 }, (_, i) => `Year ${i + 1}`)];

/** The two year bands some schools order by, Year 1-2 up to Year 11-12. */
const YEAR_BANDS = Array.from({ length: 11 }, (_, i) => `Year ${i + 1}-${i + 2}`);

export const defaultConfig: Config = {
  packingFeePrefix: 'Packing Fee',
  deliveryFeePrefix: 'Delivery',
  freeDeliveryUntil: '2026-12-11',
  deliveryFeeMode: 'auto',
  paidNoteText: 'FULLY PAID BY CREDIT CARD',
  expectedWarehouse: 'BTS',
  validYears: [...YEAR_LEVELS, ...YEAR_BANDS],
  internalOrderMarkers: ['TFRORD', 'STOCK TRANSFER', 'SAMPLES', 'ZBTS'],
  ignoredItemCodes: ['ZROUND'],
  holdNoteMarkers: ['DO NOT PROCESS'],
  multipleOrdersNote: 'MULTIPLE ORDERS INSIDE',
  noteItemCodes: ['Note', 'Text', 'Memo'],
  expectedNotes: ['THANK YOU FOR YOUR ORDER'],
};
