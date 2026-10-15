/**
 * Decisions: everything waiting on Jordan's yes (pending cards, conflicts
 * grouped), messages ready to send, and what was recently resolved, so nothing
 * changes silently (Product §8).
 */
import { MessageStatus, PendingActionStatus } from "@helper-assistant/domain";
import type { AgreementTerm, Helper, OutboundMessage, PendingAction } from "@helper-assistant/domain";
import { useApiQuery } from "../../app/AppContext";
import { Loaded } from "../../ui/common";
import { ActionCard } from "./ActionCard";
import { ActionGroups } from "./ActionGroups";
import { MessageList } from "./MessageList";

type DecisionsData = { actions: PendingAction[]; helpers: Helper[]; terms: AgreementTerm[]; messages: OutboundMessage[] };

const RECENT_LIMIT = 6;

export function DecisionsScreen() {
  const query = useApiQuery(async (api): Promise<DecisionsData> => {
    const [{ actions }, { helpers }, { terms }, { messages }] = await Promise.all([
      api.call("listActions"),
      api.call("listHelpers"),
      api.call("listTerms"),
      api.call("listMessages"),
    ]);
    return { actions, helpers, terms, messages };
  }, []);
  return (
    <section className="screen">
      <h1>Decisions</h1>
      <Loaded query={query}>{(data) => <DecisionsView {...data} />}</Loaded>
    </section>
  );
}

function DecisionsView({ actions, helpers, terms, messages }: DecisionsData) {
  const pending = actions.filter((a) => a.status === PendingActionStatus.PENDING);
  const ready = messages.filter((m) => m.status === MessageStatus.READY);
  const recent = actions
    .filter((a) => a.status !== PendingActionStatus.PENDING && a.resolvedAt !== null)
    .sort((a, b) => b.resolvedAt!.localeCompare(a.resolvedAt!))
    .slice(0, RECENT_LIMIT);
  return (
    <>
      <section>
        <h2>Waiting on you</h2>
        {pending.length === 0 ? <p className="muted">Nothing needs your confirmation right now.</p> : <ActionGroups actions={pending} helpers={helpers} terms={terms} />}
      </section>
      {ready.length > 0 && (
        <section>
          <h2>Ready for you to send</h2>
          <MessageList messages={ready} helpers={helpers} />
        </section>
      )}
      {recent.length > 0 && (
        <section>
          <h2>Recently resolved</h2>
          <div className="action-groups">
            {recent.map((a) => (
              <ActionCard key={a.ref} action={a} helpers={helpers} terms={terms} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
