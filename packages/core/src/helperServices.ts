/**
 * The services a helper has: those with a saved term (AGREED), and those only in
 * an agreement change still waiting for Jordan (PROPOSED). A bill that arrives
 * together with the helper's rates can then name its lines' services before the
 * rates are confirmed, and confirming them re-checks the bill (apply.ts).
 *
 * Call sites: records/bills.ts (recordBill's service-key guard), the agent's
 * list_helpers tool and extraction context.
 */
import { AgreementChangeKind, PendingActionStatus, PendingActionType } from "@helper-assistant/domain";
import type { Id, ServiceKey } from "@helper-assistant/domain";
import type { CoreDeps } from "./deps";

export const ServiceStatus = { AGREED: "AGREED", PROPOSED: "PROPOSED" } as const;
export type ServiceStatus = (typeof ServiceStatus)[keyof typeof ServiceStatus];

export type HelperService = { helperId: Id; serviceKey: ServiceKey; serviceLabel: string; status: ServiceStatus };

/** One entry per helper and service key; AGREED wins over PROPOSED. `helperId` null = every helper. */
export async function helperServices({ store }: Pick<CoreDeps, "store">, helperId: Id | null): Promise<HelperService[]> {
  const [terms, pending] = await Promise.all([
    store.listTerms(helperId === null ? undefined : { helperId }),
    store.listActions({ status: PendingActionStatus.PENDING }),
  ]);
  const services = new Map<string, HelperService>();
  const add = (service: HelperService) => {
    const key = `${service.helperId}\u0000${service.serviceKey}`;
    if (!services.has(key) || service.status === ServiceStatus.AGREED) services.set(key, service);
  };
  for (const t of terms) add({ helperId: t.helperId, serviceKey: t.serviceKey, serviceLabel: t.serviceLabel, status: ServiceStatus.AGREED });
  for (const action of pending) {
    if (action.type !== PendingActionType.AGREEMENT_CHANGE || action.payload.change === AgreementChangeKind.END_TERM) continue;
    const { term } = action.payload;
    if (helperId !== null && term.helperId !== helperId) continue;
    add({ helperId: term.helperId, serviceKey: term.serviceKey, serviceLabel: term.serviceLabel, status: ServiceStatus.PROPOSED });
  }
  return [...services.values()];
}
