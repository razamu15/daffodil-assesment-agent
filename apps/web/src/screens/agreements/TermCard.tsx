/**
 * One agreement term: its price as a table (PricingTable), when it applies, the exact
 * quote it came from (with the source one click away), and every assumption,
 * each with a one-click way to correct it through the assistant.
 */
import type { AgreementTerm, Helper } from "@helper-assistant/domain";
import { hrefFor, routes } from "../../app/routes";
import { PricingTable } from "../../ui/PricingTable";
import { SourceToggle } from "../../ui/SourceDocumentView";

export function TermCard({ term, helper }: { term: AgreementTerm; helper: Helper }) {
  const changeDraft = (about: string) => routes.chat(null, `About ${helper.name}'s ${term.serviceLabel.toLowerCase()} (${about}): `);
  return (
    <article className={`term-card${term.effectiveTo !== null ? " closed" : ""}`}>
      <header>
        <h3>{term.serviceLabel}</h3>
      </header>
      <PricingTable term={term} />
      <blockquote className="quote">“{term.sourceQuote}”</blockquote>
      <SourceToggle docId={term.sourceDocId} quote={term.sourceQuote} />
      {term.assumptions.length > 0 && (
        <div className="assumptions">
          <span className="assumptions-title">What was assumed</span>
          <ul>
            {term.assumptions.map((a) => (
              <li key={a}>
                {a}{" "}
                <a className="small" href={hrefFor(changeDraft(a))}>
                  Change this…
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}
