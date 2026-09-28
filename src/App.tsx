import { useMemo, useState } from 'react';

import { defaultConfig, type DeliveryFeeMode } from './config';
import { buildOrders, partitionInternal } from './parse/buildOrders';
import { parseDelInfo } from './parse/delInfo';
import { readFile } from './parse/csv';
import { parseUnfinished, type UnfinishedRow } from './parse/unfinished';
import {
  applyOverrides,
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  countByCategory,
  evaluateAll,
  groupByReason,
} from './rules/evaluate';
import type { Category, DeliveryInfo, Order, Verdict } from './types';
import FileDrop from './ui/FileDrop';
import OrderRow from './ui/OrderRow';

interface Loaded<T> {
  fileName: string;
  data: T;
}

const NEXT_STEP: Record<Category, string> = {
  hold: 'Leave at 20',
  check: 'Fix first',
  backorder: 'Change to 11',
  clean: 'Change to 30',
};

export default function App() {
  const [unfinished, setUnfinished] = useState<Loaded<UnfinishedRow[]> | null>(null);
  const [delInfo, setDelInfo] = useState<Loaded<Map<string, DeliveryInfo>> | null>(null);
  const [errors, setErrors] = useState<{ a: string | null; b: string | null }>({
    a: null,
    b: null,
  });

  const [feeMode, setFeeMode] = useState<DeliveryFeeMode>(defaultConfig.deliveryFeeMode);
  const [category, setCategory] = useState<Category>('check');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  /** Orders marked clean by hand, with the rule ids that were showing at the time. */
  const [waived, setWaived] = useState<ReadonlyMap<string, readonly string[]>>(
    () => new Map(),
  );

  const config = useMemo(() => ({ ...defaultConfig, deliveryFeeMode: feeMode }), [feeMode]);

  // Stock transfers, samples and ZBTS orders never reach the rules: they have no
  // student and no packing fee, so every one of them would sit in check forever.
  const built = useMemo(() => {
    if (!unfinished) return { customer: [] as Order[], internal: [] as Order[] };
    const orders = buildOrders(
      unfinished.data,
      delInfo?.data ?? new Map(),
      config,
    );
    return partitionInternal(orders, config);
  }, [unfinished, delInfo, config]);

  const evaluated = useMemo(
    () => evaluateAll(built.customer, config, Boolean(delInfo)),
    [built, config, delInfo],
  );

  const verdicts = useMemo(() => applyOverrides(evaluated, waived), [evaluated, waived]);

  function markClean(v: Verdict) {
    if (v.category === 'hold') {
      const why = v.reasons
        .filter((r) => r.category === 'hold')
        .map((r) => r.label)
        .join(', ');
      if (!window.confirm(`Order ${v.order.key} is on hold: ${why}.\n\nMark it clean anyway?`)) {
        return;
      }
    }
    setWaived((prev) => new Map(prev).set(v.order.key, v.reasons.map((r) => r.ruleId)));
  }

  function undoClean(key: string) {
    setWaived((prev) => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  }

  const counts = useMemo(() => countByCategory(verdicts), [verdicts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return verdicts;
    return verdicts.filter(
      (v) =>
        v.order.key.toLowerCase().includes(q) ||
        v.order.reference.toLowerCase().includes(q) ||
        v.order.students.some((s) => (s.name ?? '').toLowerCase().includes(q)),
    );
  }, [verdicts, search]);

  const groups = useMemo(() => groupByReason(filtered, category), [filtered, category]);

  async function loadUnfinished(file: File) {
    try {
      const rows = parseUnfinished(await readFile(file));
      setUnfinished({ fileName: file.name, data: rows });
      setErrors((e) => ({ ...e, a: null }));
    } catch (err) {
      setUnfinished(null);
      setErrors((e) => ({ ...e, a: (err as Error).message }));
    }
  }

  async function loadDelInfo(file: File) {
    try {
      const map = parseDelInfo(await readFile(file));
      setDelInfo({ fileName: file.name, data: map });
      setErrors((e) => ({ ...e, b: null }));
    } catch (err) {
      setDelInfo(null);
      setErrors((e) => ({ ...e, b: (err as Error).message }));
    }
  }

  async function copyNumbers(id: string, keys: string[]) {
    try {
      await navigator.clipboard.writeText(keys.join('\n'));
      setCopied(id);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      setCopied(null);
    }
  }

  const orderDates = verdicts
    .map((v) => v.order.orderedRaw)
    .filter(Boolean)
    .sort();
  const span =
    orderDates.length > 0
      ? orderDates[0] === orderDates[orderDates.length - 1]
        ? orderDates[0]
        : `${orderDates[0]} to ${orderDates[orderDates.length - 1]}`
      : null;

  return (
    <div className="shell">
      <header className="bar">
        <div className="bar-title">
          <h1>BTS order check</h1>
          <p className="run">
            {verdicts.length > 0
              ? `${verdicts.length} orders${span ? `, ordered ${span}` : ''}`
              : 'Status 20 orders, checked before picking'}
          </p>
        </div>

        <FileDrop
          what="Unfinished sales"
          fileName={unfinished?.fileName ?? null}
          rowCount={unfinished?.data.length ?? null}
          error={errors.a}
          onPick={loadUnfinished}
        />
        <FileDrop
          what="Outstanding delivery info"
          fileName={delInfo?.fileName ?? null}
          rowCount={delInfo ? delInfo.data.size : null}
          error={errors.b}
          onPick={loadDelInfo}
        />

        <div className="fee">
          <span className="fee-label">
            Delivery fee{' '}
            {feeMode === 'auto' ? `from ${config.freeDeliveryUntil}` : 'forced'}
          </span>
          <div className="segmented">
            {(['auto', 'on', 'off'] as DeliveryFeeMode[]).map((m) => (
              <button
                key={m}
                aria-pressed={feeMode === m}
                onClick={() => setFeeMode(m)}
                title={
                  m === 'auto'
                    ? 'Require the fee on orders placed after the free delivery cutoff'
                    : m === 'on'
                      ? 'Require the fee on every order'
                      : 'Never require the fee'
                }
              >
                {m === 'auto' ? 'By order date' : m === 'on' ? 'Always' : 'Never'}
              </button>
            ))}
          </div>
        </div>
      </header>

      {(errors.a || errors.b) && <p className="problem">{errors.a ?? errors.b}</p>}

      {!unfinished ? (
        <div className="start">
          <h2>Load the morning export</h2>
          <p>
            Drop in the unfinished sales file to sort the day's orders. Add the delivery
            info file as well to check addresses and customer instructions.
          </p>
        </div>
      ) : (
        <>
          <div className="buckets">
            {CATEGORY_ORDER.map((c) => (
              <button
                key={c}
                className="bucket"
                aria-pressed={category === c}
                onClick={() => setCategory(c)}
                style={
                  {
                    '--tone': `var(--${c})`,
                    '--wash': `var(--${c}-wash)`,
                  } as React.CSSProperties
                }
              >
                <span className="count">{counts[c]}</span>
                <span className="name">{CATEGORY_LABEL[c]}</span>
                <span className="then">{NEXT_STEP[c]}</span>
              </button>
            ))}
          </div>

          {built.internal.length > 0 && (
            <details className="skipped">
              <summary>
                {built.internal.length} stock transfer or internal{' '}
                {built.internal.length === 1 ? 'order' : 'orders'} ignored
              </summary>
              <div className="pairs">
                {built.internal.map((o) => (
                  <div key={o.key}>
                    <span className="k">{o.key}</span> {o.reference || o.customer}
                  </div>
                ))}
              </div>
            </details>
          )}

          <div className="tools">
            <input
              className="search"
              placeholder="Find an order number or student"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button
              className="ghost"
              onClick={() =>
                copyNumbers(
                  'all',
                  filtered.filter((v) => v.category === category).map((v) => v.order.key),
                )
              }
            >
              {copied === 'all'
                ? 'Copied'
                : `Copy all ${CATEGORY_LABEL[category].toLowerCase()} order numbers`}
            </button>
          </div>

          {groups.length === 0 ? (
            <p className="none">Nothing in {CATEGORY_LABEL[category].toLowerCase()}.</p>
          ) : (
            groups.map((group) => (
              <section
                key={group.id}
                className="group"
                style={
                  {
                    '--tone': `var(--${category})`,
                    '--wash': `var(--${category}-wash)`,
                  } as React.CSSProperties
                }
              >
                <div className="group-head">
                  <h2>{group.label}</h2>
                  <span className="tally">{group.verdicts.length}</span>
                  <button
                    className="ghost"
                    onClick={() =>
                      copyNumbers(group.id, group.verdicts.map((v) => v.order.key))
                    }
                  >
                    {copied === group.id ? 'Copied' : 'Copy order numbers'}
                  </button>
                </div>
                {group.verdicts.map((v) => (
                  <OrderRow
                    key={v.order.key}
                    verdict={v}
                    expanded={open === v.order.key}
                    onToggle={() => setOpen(open === v.order.key ? null : v.order.key)}
                    copied={copied === `order:${v.order.key}`}
                    onCopy={() => copyNumbers(`order:${v.order.key}`, [v.order.key])}
                    onMarkClean={() => markClean(v)}
                    onUndoClean={() => undoClean(v.order.key)}
                  />
                ))}
              </section>
            ))
          )}
        </>
      )}
    </div>
  );
}
