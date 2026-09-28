/** One row of the Unfinished Sales export, normalised. */
export interface OrderLine {
  orderNo: string;
  boSuffix: string;
  seq: string;
  type: string; // SN stock, KN kit header, DN note, SC charge
  itemCode: string;
  description: string;
  orderedQty: number;
  shippedQty: number;
  boQty: number;
  onHand: number;
  availableQty: number;
}

export interface Student {
  year: string | null;
  name: string | null;
  /** Sequence of the Year line, so the UI can point at it. */
  seq: string;
}

export interface ChargeLine {
  seq: string;
  itemCode: string;
  description: string;
}

/** A DN line: a Year or Name tag, a booklist pack header, or a free text note. */
export interface NoteLine {
  seq: string;
  /** Blank on tags, a note code such as Note or Memo, a stock code on pack headers. */
  itemCode: string;
  description: string;
}

/** A stock line where ordered and shipped disagree. */
export interface QtyIssue {
  seq: string;
  itemCode: string;
  description: string;
  orderedQty: number;
  shippedQty: number;
  onHand: number;
}

export interface DeliveryInfo {
  name: string;
  addressLines: string[];
  suburb: string;
  state: string;
  postcode: string;
  phone: string;
  email: string;
  carrier: string;
  /** Reassembled from Addr 1..7 of the DI row, which wraps mid-sentence. */
  instructions: string;
  hasInstructionRow: boolean;
}

export interface Order {
  /** Order No + BO Suffix. Order No alone is not unique. */
  key: string;
  orderNo: string;
  boSuffix: string;
  customer: string;
  reference: string; // truncated to 20 chars by Pronto, do not match on it
  orderedRaw: string;
  orderedDate: Date | null;
  warehouse: string;
  status: string;
  rep: string;

  students: Student[];
  charges: ChargeLine[];
  /** Note descriptions, for the rules that only read text. */
  notes: string[];
  /** The same DN lines with their sequence and item code, which tell a real note
   *  from a booklist pack header. */
  noteLines: NoteLine[];
  qtyIssues: QtyIssue[];
  lines: OrderLine[];

  delivery: DeliveryInfo | null;
  lineCount: number;
}

export type Category = 'hold' | 'check' | 'backorder' | 'clean';

export interface Reason {
  ruleId: string;
  category: Category;
  label: string;
  detail?: string;
}

export interface Verdict {
  order: Order;
  category: Category;
  reasons: Reason[];
  /** What the operator does next, in the words they use. */
  action: string;
  /** Set when the operator marked the order clean by hand: the bucket the rules put it in. */
  overriddenFrom?: Category;
}
