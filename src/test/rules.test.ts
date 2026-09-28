import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { defaultConfig, type Config } from '../config';
import {
  buildOrders,
  isInternalOrder,
  partitionInternal,
} from '../parse/buildOrders';
import { parseDelInfo } from '../parse/delInfo';
import { parseProntoDate } from '../parse/csv';
import { parseUnfinished } from '../parse/unfinished';
import { applyOverrides, evaluateAll, groupByReason } from '../rules/evaluate';
import { isKnownYear } from '../rules/index';
import type { Verdict } from '../types';

// fileURLToPath rather than .pathname, which gives /C:/... on Windows.
const here = fileURLToPath(new URL('.', import.meta.url));
const read = (name: string) => readFileSync(join(here, 'fixtures', name), 'utf8');

function run(config: Config = defaultConfig): Map<string, Verdict> {
  const rows = parseUnfinished(read('unfinished.sample.csv'));
  const delivery = parseDelInfo(read('delinfo.sample.csv'));
  const orders = buildOrders(rows, delivery, config);
  const verdicts = evaluateAll(orders, config, true);
  return new Map(verdicts.map((v) => [v.order.key, v]));
}

const reasons = (v: Verdict) => v.reasons.map((r) => r.ruleId).sort();

describe('dates', () => {
  it('reads the Pronto format without guessing day and month', () => {
    const d = parseProntoDate('1-Sep-26')!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8);
    expect(d.getDate()).toBe(1);
  });

  it('returns null rather than an invalid date', () => {
    expect(parseProntoDate('')).toBeNull();
    expect(parseProntoDate('not a date')).toBeNull();
  });
});

describe('line handling', () => {
  it('ignores stock rounding lines when comparing ordered to shipped', () => {
    const rows = parseUnfinished(read('unfinished.sample.csv'));
    const orders = buildOrders(rows, new Map(), defaultConfig);
    const o = orders.find((x) => x.key === '1477239')!;
    const zround = o.lines.filter((l) => l.itemCode === 'ZROUND');
    expect(zround.length).toBeGreaterThan(0);
    expect(o.qtyIssues.some((i) => i.itemCode === 'ZROUND')).toBe(false);
  });

  it('ignores pack header lines so a shortage is not counted twice', () => {
    const rows = parseUnfinished(read('unfinished.sample.csv'));
    const orders = buildOrders(rows, new Map(), defaultConfig);
    const o = orders.find((x) => x.key === '1477239')!;
    expect(o.lines.some((l) => l.type === 'KN')).toBe(true);
    const knCodes = new Set(o.lines.filter((l) => l.type === 'KN').map((l) => l.itemCode));
    expect(o.qtyIssues.some((i) => knCodes.has(i.itemCode))).toBe(false);
  });
});

describe('students', () => {
  it('pairs each year with the name that follows it', () => {
    const rows = parseUnfinished(read('unfinished.sample.csv'));
    const orders = buildOrders(rows, new Map(), defaultConfig);
    const o = orders.find((x) => x.key === '1476780')!;
    expect(o.students).toEqual([
      { year: 'Prep', name: 'CASEY SAMPLE', seq: '1' },
      { year: 'Year 2', name: 'DREW SAMPLE', seq: '4' },
    ]);
  });
});

describe('verdicts', () => {
  const v = run();

  it('holds an order marked do not process, whatever else it looks like', () => {
    const o = v.get('1476735')!;
    expect(o.category).toBe('hold');
    expect(reasons(o)).toContain('do-not-process');
    expect(o.action).toBe('Leave on hold, do not process');
  });

  it('passes a single student order with a packing fee and no shortages', () => {
    const o = v.get('1476778')!;
    expect(o.category).toBe('clean');
    expect(o.reasons).toEqual([]);
    expect(o.action).toBe('Change to 30');
  });

  it('sends a short shipped order to backorder', () => {
    const o = v.get('1477811')!;
    expect(o.category).toBe('backorder');
    expect(reasons(o)).toContain('qty-mismatch');
    expect(o.action).toBe('Change to 11');
  });

  it('puts a multi student order in check and keeps the shortage reason', () => {
    const o = v.get('1477239')!;
    expect(o.category).toBe('check');
    expect(reasons(o)).toContain('multiple-students');
    expect(reasons(o)).toContain('qty-mismatch');
    expect(o.action).toBe('Fix, then change to 11');
  });

  it('notices when the multiple orders note is already on the order', () => {
    const o = v.get('1477239')!;
    const r = o.reasons.find((x) => x.ruleId === 'multiple-students')!;
    expect(r.detail).toContain('already on the order');
  });

  it('stays quiet about an instruction in the delivery record, which is the right place', () => {
    const o = v.get('1476780')!;
    // The instruction wraps across Addr 1 to Addr 3 in the export.
    expect(o.order.delivery?.instructions).toBe(
      'Please leave undercover at the front door if we are not home',
    );
    expect(reasons(o)).not.toContain('note-in-wrong-place');
  });

  it('flags an instruction typed onto the order as a note', () => {
    const o = v.get('1476735')!;
    expect(reasons(o)).toContain('note-in-wrong-place');
    const r = o.reasons.find((x) => x.ruleId === 'note-in-wrong-place')!;
    expect(r.detail).toBe('Please leave inside the gate beside the front door');
  });

  it('stays quiet about tags, pack lines and the standard notes', () => {
    // Year and Name tags, a booklist pack line, the paid note, the thank you note.
    const o = v.get('1476778')!;
    expect(o.order.noteLines.length).toBeGreaterThan(3);
    expect(reasons(o)).not.toContain('note-in-wrong-place');
  });

  it('flags an order that has no matching delivery record', () => {
    const rows = parseUnfinished(read('unfinished.sample.csv'));
    const orders = buildOrders(rows, new Map(), defaultConfig);
    const verdicts = evaluateAll(orders, defaultConfig, true);
    expect(verdicts.every((x) => reasons(x).includes('no-delivery-record'))).toBe(true);
  });

  it('stays quiet about addresses until the delivery file is loaded', () => {
    const rows = parseUnfinished(read('unfinished.sample.csv'));
    const orders = buildOrders(rows, new Map(), defaultConfig);
    const verdicts = evaluateAll(orders, defaultConfig, false);
    expect(verdicts.some((x) => reasons(x).includes('no-delivery-record'))).toBe(false);
  });
});

describe('delivery fee', () => {
  it('stays quiet for orders placed during the free period', () => {
    const o = run().get('1476778')!;
    expect(reasons(o)).not.toContain('missing-delivery-fee');
  });

  it('fires once the cutoff has passed', () => {
    const config: Config = { ...defaultConfig, freeDeliveryUntil: '2026-08-01' };
    const o = run(config).get('1476778')!;
    expect(reasons(o)).toContain('missing-delivery-fee');
  });

  it('can be forced on and off regardless of the order date', () => {
    const forced: Config = { ...defaultConfig, deliveryFeeMode: 'on' };
    expect(reasons(run(forced).get('1476778')!)).toContain('missing-delivery-fee');

    const off: Config = {
      ...defaultConfig,
      freeDeliveryUntil: '2026-08-01',
      deliveryFeeMode: 'off',
    };
    expect(reasons(run(off).get('1476778')!)).not.toContain('missing-delivery-fee');
  });
});

describe('config driven rules', () => {
  it('flags a warehouse the team does not pick from', () => {
    const config: Config = { ...defaultConfig, expectedWarehouse: 'JAY' };
    const o = run(config).get('1476778')!;
    expect(o.category).toBe('hold');
    expect(reasons(o)).toContain('wrong-warehouse');
  });

  it('flags a missing packing fee', () => {
    const config: Config = { ...defaultConfig, packingFeePrefix: 'Handling Fee' };
    expect(reasons(run(config).get('1476778')!)).toContain('missing-packing-fee');
  });

  it('flags an unpaid order', () => {
    const config: Config = { ...defaultConfig, paidNoteText: 'PAID IN FULL BY EFT' };
    expect(reasons(run(config).get('1476778')!)).toContain('not-paid');
  });
});

describe('internal orders', () => {
  const orders = buildOrders(
    parseUnfinished(read('unfinished.sample.csv')),
    new Map(),
    defaultConfig,
  );
  const like = (fields: Partial<(typeof orders)[number]>) => ({ ...orders[0], ...fields });

  it('keeps stock transfers and ZBTS orders out of the buckets', () => {
    const { customer, internal } = partitionInternal(orders, defaultConfig);
    expect(internal.map((o) => o.key).sort()).toEqual(['1477900', '1477901']);
    expect(customer.map((o) => o.key)).not.toContain('1477900');
    expect(customer.length).toBe(orders.length - 2);
  });

  it('matches the marker on the reference or on the customer code', () => {
    expect(isInternalOrder(like({ reference: 'Stock Transfer' }), defaultConfig)).toBe(true);
    expect(isInternalOrder(like({ reference: 'TFRORD= 1477118' }), defaultConfig)).toBe(true);
    expect(isInternalOrder(like({ customer: 'ZBTS' }), defaultConfig)).toBe(true);
  });

  it('leaves a family whose name contains a marker word alone', () => {
    expect(isInternalOrder(like({ reference: 'JAMES SAMPLESON' }), defaultConfig)).toBe(false);
    expect(isInternalOrder(like({ reference: 'ALEX SAMPLE' }), defaultConfig)).toBe(false);
  });
});

describe('year levels', () => {
  it('accepts Prep through Year 12 and the two year bands', () => {
    for (const y of ['Prep', 'Year 1', 'Year 6', 'Year 7', 'Year 12', 'Year 7-8', 'Year 11-12']) {
      expect(isKnownYear(y, defaultConfig)).toBe(true);
    }
  });

  it('does not mind case, spacing or a slash', () => {
    for (const y of ['year 7', 'YEAR7', 'Year 7 - 8', 'Year 7/8']) {
      expect(isKnownYear(y, defaultConfig)).toBe(true);
    }
  });

  it('still rejects a year that does not exist', () => {
    for (const y of ['Year 13', 'Year 0', 'Yr 4', 'Prep-1']) {
      expect(isKnownYear(y, defaultConfig)).toBe(false);
    }
  });

  it('leaves the sample orders alone', () => {
    for (const o of run().values()) expect(reasons(o)).not.toContain('unknown-year');
  });
});

describe('marking clean by hand', () => {
  const verdicts = [...run().values()];
  const find = (list: Verdict[], key: string) => list.find((x) => x.order.key === key)!;
  const waive = (key: string, ruleIds = reasons(find(verdicts, key))) =>
    new Map([[key, ruleIds]]);

  it('moves a held order to clean and keeps the flags it waved through', () => {
    const before = find(verdicts, '1476735');
    const after = find(applyOverrides(verdicts, waive('1476735')), '1476735');
    expect(after.category).toBe('clean');
    expect(after.overriddenFrom).toBe('hold');
    expect(after.action).toBe('Change to 30');
    expect(reasons(after)).toEqual(reasons(before));
  });

  it('leaves every other order alone', () => {
    const after = applyOverrides(verdicts, waive('1476735'));
    for (const v of after) {
      if (v.order.key !== '1476735') expect(v).toBe(find(verdicts, v.order.key));
    }
  });

  it('lapses when the order has a flag that was not waived', () => {
    const after = find(
      applyOverrides(verdicts, waive('1477239', ['multiple-students'])),
      '1477239',
    );
    expect(after.category).toBe('check');
    expect(after.overriddenFrom).toBeUndefined();
  });

  it('lists hand cleared orders in their own group after the rest', () => {
    const groups = groupByReason(applyOverrides(verdicts, waive('1476735')), 'clean');
    expect(groups.map((g) => g.id)).toEqual(['clean', 'override']);
    expect(groups[1].verdicts.map((v) => v.order.key)).toEqual(['1476735']);
  });
});
