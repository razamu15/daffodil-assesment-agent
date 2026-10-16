/**
 * What was already decided in this chat, out of the way: folded lists of the
 * proposals Jordan approved, and those that didn't go through (rejected,
 * outdated, withdrawn). Read-only; each one unfolds to its details.
 *
 * Call site: ChatScreen.
 */
import { PendingActionStatus, PendingActionType } from "@helper-assistant/domain";
import type { AgreementTerm, Helper, Id, PendingAction } from "@helper-assistant/domain";
import { useApiQuery } from "../../app/AppContext";
import { Assumptions, Loaded, StatusPill } from "../../ui/common";
import { formatInstant } from "../../ui/format";
import { ACTION_STATUS_VIEW } from "../../ui/labels";
import { ActionDetails } from "../decisions/ActionDetails";

type DecidedData = { decided: PendingAction[]; helpers: Helper[]; terms: AgreementTerm[] };

export function DecidedPanel({ sessionId }: { sessionId: Id | null }) {
  const query = useApiQuery(async (api): Promise<DecidedData> => {
    const [{ actions }, { helpers }, { terms }] = await Promise.all([api.call("listActions"), api.call("listHelpers"), api.call("listTerms")]);
    const decided = actions.filter((a) => sessionId !== null && a.sourceSessionId === sessionId && a.status !== PendingActionStatus.PENDING);
    return { decided, helpers, terms };
  }, [sessionId]);
  return (
    <aside className="decided-panel">
      <Loaded query={query}>
        {({ decided, helpers, terms }) => {
          const approved = decided.filter((a) => a.status === PendingActionStatus.CONFIRMED);
          const notApplied = decided.filter((a) => a.status !== PendingActionStatus.CONFIRMED);
          if (decided.length === 0) return <p className="muted small">Changes you approve in this chat will be listed here.</p>;
          return (
            <>
              <DecidedGroup title="Approved in this chat" actions={approved} helpers={helpers} terms={terms} open />
              <DecidedGroup title="Not applied" actions={notApplied} helpers={helpers} terms={terms} open={false} />
            </>
          );
        }}
      </Loaded>
    </aside>
  );
}

function DecidedGroup({ title, actions, helpers, terms, open }: { title: string; actions: PendingAction[]; helpers: Helper[]; terms: AgreementTerm[]; open: boolean }) {
  if (actions.length === 0) return null;
  return (
    <details className="decided-group" open={open}>
      <summary>
        {title} ({actions.length})
      </summary>
      <ul>
        {actions.map((a) => (
          <li key={a.ref}>
            <details>
              <summary>
                <span className="muted small">#{a.ref}</span> {a.summary}
              </summary>
              <StatusPill view={ACTION_STATUS_VIEW[a.status]} />
              {a.resolvedAt !== null && <span className="muted small"> {formatInstant(a.resolvedAt)}</span>}
              <ActionDetails action={a} ctx={{ helpers, terms, messageBody: a.type === PendingActionType.HELPER_MESSAGE ? a.payload.body : "", onMessageBodyChange: null }} />
              <Assumptions items={a.assumptions} />
              {a.resolutionNote !== null && <p className="resolution-note">{a.resolutionNote}</p>}
            </details>
          </li>
        ))}
      </ul>
    </details>
  );
}
