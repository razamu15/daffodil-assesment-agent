/**
 * Line-by-line check. Every number has a "why" (Product §8): open a line to see
 * the breakdown, the agreement and its quote, the bill's own words, and what
 * was assumed. Lines that need a decision start open.
 */
import { Fragment, useState } from "react";
import type { AgreementTerm, BillCheck, LineCheck, LineItem } from "@helper-assistant/domain";
import { lineNeedsDecision } from "../../ui/checkItems";
import { AssumptionsToggle, StatusPill } from "../../ui/common";
import { formatCents, formatTimeRange, formatWeekdayDate } from "../../ui/format";
import { LINE_STATUS_VIEW } from "../../ui/labels";
import { SourceToggle } from "../../ui/SourceDocumentView";

type Props = { lineItems: LineItem[]; check: BillCheck; terms: AgreementTerm[] };

function when(line: LineItem): string {
  if (line.serviceDate === null) return "No date";
  const day = formatWeekdayDate(line.serviceDate);
  return line.startAt !== null && line.endAt !== null ? `${day}, ${formatTimeRange(line.startAt, line.endAt)}` : day;
}

function quantityText(line: LineItem): string | null {
  if (line.quantity === null || line.unit === null) return null;
  const unit = line.unit.toLowerCase();
  const count = `${line.quantity} ${line.quantity === 1 ? unit : `${unit}s`}`;
  return line.unitPriceBilledCents === null ? count : `${count} × ${formatCents(line.unitPriceBilledCents)}`;
}

export function LineChecksTable({ lineItems, check, terms }: Props) {
  const checks = new Map(check.lineChecks.map((c) => [c.lineId, c]));
  const [open, setOpen] = useState<Set<string>>(() => new Set(check.lineChecks.filter((c) => lineNeedsDecision(c.status)).map((c) => c.lineId)));
  const toggle = (lineId: string) => {
    const next = new Set(open);
    if (next.has(lineId)) next.delete(lineId);
    else next.add(lineId);
    setOpen(next);
  };

  return (
    <table className="lines">
      <thead>
        <tr>
          <th>When</th>
          <th>What</th>
          <th className="num">Billed</th>
          <th className="num">Agreed</th>
          <th>Result</th>
        </tr>
      </thead>
      <tbody>
        {lineItems.map((line) => {
          const lc = checks.get(line.lineId);
          if (lc === undefined) return null;
          const view = LINE_STATUS_VIEW[lc.status];
          const isOpen = open.has(line.lineId);
          return (
            <Fragment key={line.lineId}>
              <tr className={`line-row tone-${view.tone}${isOpen ? " open" : ""}`} onClick={() => toggle(line.lineId)}>
                <td>{when(line)}</td>
                <td>
                  {line.relatedLineId !== null && <span className="muted">↳ </span>}
                  {line.label}
                  {quantityText(line) !== null && <span className="muted"> · {quantityText(line)}</span>}
                </td>
                <td className="num">{formatCents(lc.billedCents)}</td>
                <td className="num">{lc.expectedCents === null ? "—" : formatCents(lc.expectedCents)}</td>
                <td>
                  <StatusPill view={view} />
                  <button type="button" className="link-button why-toggle" aria-expanded={isOpen}>
                    {isOpen ? "Hide why" : "Why?"}
                  </button>
                </td>
              </tr>
              {isOpen && (
                <tr className="why-row">
                  <td colSpan={5}>
                    <LineWhy line={line} lc={lc} terms={terms} />
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

function LineWhy({ line, lc, terms }: { line: LineItem; lc: LineCheck; terms: AgreementTerm[] }) {
  const applied = terms.filter((t) => lc.appliedTermIds.includes(t.termId));
  return (
    <div className="why">
      <p className={`why-explanation${lc.likelyCause !== null ? " has-cause" : ""}`}>
        {lc.likelyCause !== null && <span className="cause-tag">Likely mix-up</span>}
        {lc.explanation}
      </p>
      {lc.breakdown.length > 0 && (
        <table className="breakdown">
          <tbody>
            {lc.breakdown.map((step) => (
              <tr key={step.description}>
                <td>{step.description}</td>
                <td className="num">{formatCents(step.amountCents)}</td>
              </tr>
            ))}
            {lc.expectedCents !== null && (
              <tr className="breakdown-total">
                <td>Agreed</td>
                <td className="num">{formatCents(lc.expectedCents)}</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
      {applied.map((term) => (
        <div key={term.termId} className="why-term">
          <span className="why-label">Agreement</span> {term.serviceLabel}: “{term.sourceQuote}”
          <SourceToggle docId={term.sourceDocId} quote={term.sourceQuote} label="Show where it was agreed" />
        </div>
      ))}
      {line.sourceQuote !== "" && (
        <div>
          <span className="why-label">On the bill</span> “{line.sourceQuote}”
        </div>
      )}
      {line.authorizationClaim !== null && (
        <div className="claim">
          <span className="why-label">Claim</span> The bill says {line.authorizationClaim.claimedApprover} OK'd this: “{line.authorizationClaim.text}”. That's the helper's
          word, not an agreement. Only you can accept it.
        </div>
      )}
      <AssumptionsToggle items={lc.assumptions} />
    </div>
  );
}
