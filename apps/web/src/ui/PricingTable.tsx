/**
 * A term's price as a table: one row per pricing rule (Charge, Amount, When it
 * applies), then the schedule and the dates it's in effect. Replaces the
 * run-on "$22 an hour · $28 an hour after 10pm · …" line.
 *
 * Call sites: Agreements (TermCard), Decisions and chat (agreement-change cards).
 */
import type { TermContent } from "@helper-assistant/domain";
import { formatLongDate } from "./format";
import { describeSchedule, ruleRow } from "./rules";

function effectiveText(term: Pick<TermContent, "effectiveFrom" | "effectiveTo">): string {
  if (term.effectiveTo === null) return `From ${formatLongDate(term.effectiveFrom)}`;
  return `${formatLongDate(term.effectiveFrom)} – ${formatLongDate(term.effectiveTo)}`;
}

export function PricingTable({ term, caption }: { term: TermContent; caption?: string }) {
  return (
    <table className="pricing-table">
      {caption !== undefined && <caption>{caption}</caption>}
      <thead>
        <tr>
          <th scope="col">Charge</th>
          <th scope="col">Amount</th>
          <th scope="col">When it applies</th>
        </tr>
      </thead>
      <tbody>
        {term.pricingRules.map((rule, i) => {
          const row = ruleRow(rule);
          return (
            <tr key={i}>
              <th scope="row">{row.charge}</th>
              <td className="amount">{row.amount}</td>
              <td>{row.when}</td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row">Schedule</th>
          <td colSpan={2}>{describeSchedule(term.schedule)}</td>
        </tr>
        <tr>
          <th scope="row">In effect</th>
          <td colSpan={2}>{effectiveText(term)}</td>
        </tr>
      </tfoot>
    </table>
  );
}
