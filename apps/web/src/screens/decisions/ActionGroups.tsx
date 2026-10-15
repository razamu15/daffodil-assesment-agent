/**
 * Pending cards grouped by targetKey (Doc 3 §4.6 "Detect"): cards that change
 * the same thing are shown together as a conflict, so Jordan picks one.
 *
 * Call sites: Decisions screen, Chat (this chat's pending cards).
 */
import type { AgreementTerm, Helper, PendingAction } from "@helper-assistant/domain";
import { ActionCard } from "./ActionCard";

export function ActionGroups({ actions, helpers, terms }: { actions: PendingAction[]; helpers: Helper[]; terms: AgreementTerm[] }) {
  const groups = new Map<string, PendingAction[]>();
  for (const action of actions) groups.set(action.targetKey, [...(groups.get(action.targetKey) ?? []), action]);
  return (
    <div className="action-groups">
      {[...groups.entries()].map(([targetKey, group]) =>
        group.length === 1 ? (
          <ActionCard key={targetKey} action={group[0]!} helpers={helpers} terms={terms} />
        ) : (
          <section key={targetKey} className="conflict-group">
            <p className="conflict-head">
              <strong>These {group.length} proposals change the same thing and disagree.</strong> Confirm the one that's right and reject the other
              {group.length > 2 ? "s" : ""}. If you confirm one, the other can no longer apply.
            </p>
            {group.map((a) => (
              <ActionCard key={a.ref} action={a} helpers={helpers} terms={terms} />
            ))}
          </section>
        ),
      )}
    </div>
  );
}
