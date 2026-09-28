import type { Config } from '../config';
import type { Category, Order, Reason, Verdict } from '../types';
import { rules, type EvalContext } from './index';

/**
 * Precedence, highest first. An order can trip several rules; it appears once,
 * under the most serious one, carrying every reason it tripped.
 *
 * Data problems outrank the status recommendation on purpose: an order that is
 * both short-shipped and missing a name needs the name fixed before anyone
 * decides where it goes.
 */
export const CATEGORY_ORDER: Category[] = ['hold', 'check', 'backorder', 'clean'];

export const CATEGORY_LABEL: Record<Category, string> = {
  hold: 'Hold',
  check: 'Check',
  backorder: 'Backorder',
  clean: 'Clean',
};

function actionFor(category: Category, reasons: Reason[]): string {
  const alsoShort = reasons.some((r) => r.ruleId === 'qty-mismatch');
  switch (category) {
    case 'hold':
      return 'Leave on hold, do not process';
    case 'check':
      return alsoShort ? 'Fix, then change to 11' : 'Fix, then change to 30';
    case 'backorder':
      return 'Change to 11';
    case 'clean':
      return 'Change to 30';
  }
}

export function evaluateOrder(order: Order, ctx: EvalContext): Verdict {
  const reasons: Reason[] = [];

  for (const rule of rules) {
    if (rule.applies && !rule.applies(order, ctx)) continue;
    if (!rule.test(order, ctx)) continue;
    reasons.push({
      ruleId: rule.id,
      category: rule.category,
      label: rule.label,
      detail: rule.detail?.(order, ctx),
    });
  }

  const category =
    CATEGORY_ORDER.find((c) => reasons.some((r) => r.category === c)) ?? 'clean';

  return { order, category, reasons, action: actionFor(category, reasons) };
}

export function evaluateAll(
  orders: Order[],
  config: Config,
  deliveryFileLoaded: boolean,
): Verdict[] {
  const ctx: EvalContext = { config, deliveryFileLoaded };
  return orders.map((order) => evaluateOrder(order, ctx));
}

/**
 * Moves orders the operator has cleared by hand into clean, keeping their
 * reasons so the row still shows what was waved through.
 *
 * An override covers only the flags that were showing when it was made. If a
 * later export or a fee setting raises a new one, the order drops back into
 * its bucket rather than going to 30 with an issue nobody looked at.
 */
export function applyOverrides(
  verdicts: Verdict[],
  waived: ReadonlyMap<string, readonly string[]>,
): Verdict[] {
  if (waived.size === 0) return verdicts;
  return verdicts.map((v): Verdict => {
    const ruleIds = waived.get(v.order.key);
    if (!ruleIds || v.category === 'clean') return v;
    if (!v.reasons.every((r) => ruleIds.includes(r.ruleId))) return v;
    return {
      ...v,
      category: 'clean',
      overriddenFrom: v.category,
      action: actionFor('clean', v.reasons),
    };
  });
}

export function countByCategory(verdicts: Verdict[]): Record<Category, number> {
  const counts: Record<Category, number> = { hold: 0, check: 0, backorder: 0, clean: 0 };
  for (const v of verdicts) counts[v.category] += 1;
  return counts;
}

/** Groups a bucket by reason so the operator can work one kind of fix at a time. */
export function groupByReason(verdicts: Verdict[], category: Category) {
  const groups = new Map<string, { label: string; verdicts: Verdict[] }>();
  for (const v of verdicts) {
    if (v.category !== category) continue;
    const primary = v.reasons.find((r) => r.category === category);
    const [id, label] = v.overriddenFrom
      ? ['override', 'Marked clean by hand']
      : [primary?.ruleId ?? 'clean', primary?.label ?? 'Ready to pick'];
    const group = groups.get(id);
    if (group) group.verdicts.push(v);
    else groups.set(id, { label, verdicts: [v] });
  }
  // Hand-cleared orders go last so they read as the exceptions they are.
  return [...groups.entries()]
    .map(([id, g]) => ({ id, ...g }))
    .sort((a, b) => Number(a.id === 'override') - Number(b.id === 'override'));
}
