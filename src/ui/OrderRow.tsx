import { CATEGORY_LABEL } from '../rules/evaluate';
import type { Verdict } from '../types';

interface Props {
  verdict: Verdict;
  expanded: boolean;
  onToggle: () => void;
  copied: boolean;
  onCopy: () => void;
  onMarkClean: () => void;
  onUndoClean: () => void;
}

function formatDate(raw: string, date: Date | null): string {
  if (!date) return raw;
  return date.toLocaleDateString('en-AU', { day: '2-digit', month: 'short' });
}

export default function OrderRow({
  verdict,
  expanded,
  onToggle,
  copied,
  onCopy,
  onMarkClean,
  onUndoClean,
}: Props) {
  const { order, reasons, action, category, overriddenFrom } = verdict;
  const summary = reasons.length
    ? reasons.map((r) => r.label).join(' · ')
    : 'Nothing outstanding';

  return (
    <>
      {/* A div rather than a button so the copy button can sit inside it. */}
      <div
        className="row"
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        <span className="no">
          {order.key}
          <button
            type="button"
            className="copy"
            data-copied={copied}
            title="Copy order number"
            aria-label={`Copy order number ${order.key}`}
            onClick={(e) => {
              e.stopPropagation();
              onCopy();
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </span>
        <span className="who">{order.reference || order.customer}</span>
        <span className="when">{formatDate(order.orderedRaw, order.orderedDate)}</span>
        <span className="why">{overriddenFrom ? `Marked clean · ${summary}` : summary}</span>
        <span className="do">{action}</span>
      </div>

      {expanded && (
        <div className="detail">
          {overriddenFrom ? (
            <div className="override">
              <span>
                Marked clean by hand. The checker had this in{' '}
                <strong>{CATEGORY_LABEL[overriddenFrom].toLowerCase()}</strong>.
              </span>
              <button type="button" className="ghost" onClick={onUndoClean}>
                Undo
              </button>
            </div>
          ) : category !== 'clean' ? (
            <div className="override">
              <button type="button" className="ghost mark-clean" onClick={onMarkClean}>
                Mark clean
              </button>
              <span className="hint">Ignore the flags below and change to 30</span>
            </div>
          ) : null}

          {reasons.length > 0 && (
            <>
              <h3>{overriddenFrom ? 'Flags waved through' : 'Why it is here'}</h3>
              <ul className="reasons">
                {reasons.map((r) => (
                  <li key={r.ruleId}>
                    {r.label}
                    {r.detail ? <span className="why-detail"> — {r.detail}</span> : null}
                  </li>
                ))}
              </ul>
            </>
          )}

          <h3>Students</h3>
          {order.students.length === 0 ? (
            <p className="why-detail">No year or name tags on this order.</p>
          ) : (
            <div className="pairs">
              {order.students.map((s, i) => (
                <div key={`${s.seq}-${i}`}>
                  <span className="k">{s.year ?? 'No year'}</span> {s.name ?? 'No name'}
                </div>
              ))}
            </div>
          )}

          <h3>Charges and notes</h3>
          <div className="pairs">
            {order.charges.map((c) => (
              <div key={c.seq}>{c.description}</div>
            ))}
            {order.notes
              .filter((n) => !/^(year|name)\s*:/i.test(n))
              .map((n, i) => (
                <div key={i}>{n}</div>
              ))}
            {order.charges.length === 0 && <div className="k">No charge lines</div>}
          </div>

          {order.qtyIssues.length > 0 && (
            <>
              <h3>Short lines</h3>
              <table className="lines">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Description</th>
                    <th className="n">Ord</th>
                    <th className="n">Ship</th>
                    <th className="n">Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {order.qtyIssues.map((i) => (
                    <tr key={i.seq}>
                      <td>{i.itemCode}</td>
                      <td>{i.description}</td>
                      <td className="n">{i.orderedQty}</td>
                      <td className="n short">{i.shippedQty}</td>
                      <td className="n">{i.onHand}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <h3>Delivery</h3>
          {order.delivery && order.delivery.name ? (
            <div className="pairs">
              <div>{order.delivery.name}</div>
              <div>{order.delivery.addressLines.join(', ')}</div>
              <div>
                {order.delivery.suburb} {order.delivery.state} {order.delivery.postcode}
              </div>
              <div>
                <span className="k">Phone</span> {order.delivery.phone || 'none'}
              </div>
              <div>
                <span className="k">Email</span> {order.delivery.email || 'none'}
              </div>
              <div>
                <span className="k">Carrier</span> {order.delivery.carrier || 'none'}
              </div>
            </div>
          ) : (
            <p className="why-detail">No delivery record matched this order.</p>
          )}

          {order.delivery?.instructions && (
            <>
              <h3>Customer instructions</h3>
              <p className="quote">{order.delivery.instructions}</p>
            </>
          )}
        </div>
      )}
    </>
  );
}
