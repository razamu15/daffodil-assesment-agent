/**
 * Agreements: per helper, the editable details (key, how to pay, contact), the
 * terms in effect, earlier versions, and notes, each with its source.
 */
import { useState } from "react";
import { HelperStatus } from "@helper-assistant/domain";
import type { AgreementTerm, Helper, HelperNote } from "@helper-assistant/domain";
import { useApiQuery } from "../../app/AppContext";
import { hrefFor, routes } from "../../app/routes";
import { Loaded, StatusPill } from "../../ui/common";
import { formatLongDate } from "../../ui/format";
import { HELPER_STATUS_VIEW, KEY_REMINDER, NOTE_KIND_LABEL } from "../../ui/labels";
import { SourceToggle } from "../../ui/SourceDocumentView";
import { HelperProfileForm } from "./HelperProfileForm";
import { TermCard } from "./TermCard";

type AgreementsData = { helpers: Helper[]; terms: AgreementTerm[]; notes: HelperNote[] };

export function AgreementsScreen({ helperId }: { helperId: string | null }) {
  const query = useApiQuery(async (api): Promise<AgreementsData> => {
    const [{ helpers }, { terms, notes }] = await Promise.all([api.call("listHelpers"), api.call("listTerms")]);
    return { helpers, terms, notes };
  }, []);
  return (
    <section className="screen">
      <h1>Agreements</h1>
      <Loaded query={query}>{(data) => <AgreementsView {...data} helperId={helperId} />}</Loaded>
    </section>
  );
}

function AgreementsView({ helpers, terms, notes, helperId }: AgreementsData & { helperId: string | null }) {
  const [adding, setAdding] = useState(helpers.length === 0);
  const selected = helpers.find((h) => h.helperId === helperId) ?? helpers[0] ?? null;
  return (
    <div className="agreements">
      <nav className="helper-list" aria-label="Helpers">
        {helpers.map((h) => (
          <a key={h.helperId} href={hrefFor(routes.agreements(h.helperId))} className={!adding && h.helperId === selected?.helperId ? "active" : undefined} onClick={() => setAdding(false)}>
            <strong>{h.name}</strong>
            <span className="muted">{h.role}</span>
            {h.status === HelperStatus.ENDED && <StatusPill view={HELPER_STATUS_VIEW[h.status]} />}
          </a>
        ))}
        <button type="button" className="link-button" onClick={() => setAdding(true)}>
          + Add a helper
        </button>
      </nav>
      <div className="helper-detail">
        {adding || selected === null ? (
          <>
            <h2>Add a helper</h2>
            <HelperProfileForm helper={null} onCancel={helpers.length > 0 ? () => setAdding(false) : undefined} />
          </>
        ) : (
          <HelperDetail
            key={selected.helperId}
            helper={selected}
            terms={terms.filter((t) => t.helperId === selected.helperId)}
            notes={notes.filter((n) => n.helperId === selected.helperId)}
          />
        )}
      </div>
    </div>
  );
}

function HelperDetail({ helper, terms, notes }: { helper: Helper; terms: AgreementTerm[]; notes: HelperNote[] }) {
  const current = terms.filter((t) => t.effectiveTo === null);
  const earlier = terms.filter((t) => t.effectiveTo !== null).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  const keyReminder = helper.status === HelperStatus.ENDED ? KEY_REMINDER[helper.houseKeyAccess] : null;
  return (
    <>
      <header className="helper-head">
        <h2>
          {helper.name} <span className="muted">· {helper.role}</span>
        </h2>
        <StatusPill view={HELPER_STATUS_VIEW[helper.status]} />
        {helper.endedOn !== null && <span className="muted">Last day {formatLongDate(helper.endedOn)}</span>}
      </header>
      {keyReminder !== null && <p className="key-reminder">🔑 {keyReminder(helper.name)}</p>}

      <section>
        <h3 className="section-title">Details</h3>
        <HelperProfileForm helper={helper} />
      </section>

      <section>
        <h3 className="section-title">What you agreed</h3>
        {current.length === 0 ? (
          <p className="muted">
            No agreements yet. <a href={hrefFor(routes.chat(null, `Here's what I agreed with ${helper.name}: `))}>Tell the assistant</a> or drop a screenshot.
          </p>
        ) : (
          <div className="term-grid">
            {current.map((t) => (
              <TermCard key={t.termId} term={t} helper={helper} />
            ))}
          </div>
        )}
      </section>

      {earlier.length > 0 && (
        <section>
          <h3 className="section-title">Earlier versions</h3>
          <div className="term-grid">
            {earlier.map((t) => (
              <TermCard key={t.termId} term={t} helper={helper} />
            ))}
          </div>
        </section>
      )}

      {notes.length > 0 && (
        <section className="notes">
          <h3 className="section-title">Notes</h3>
          <ul>
            {notes.map((n) => (
              <li key={n.noteId}>
                <span className="why-label">{NOTE_KIND_LABEL[n.noteKind]}</span> {n.text}
                {n.sourceDocId !== null && <SourceToggle docId={n.sourceDocId} />}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
