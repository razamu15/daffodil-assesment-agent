/**
 * Expected household and helpers after Jordan confirms everything in the starter pack.
 *
 * Note the S4 rule in action: only Lupe "has a key" in the notes, so Priya and
 * Theo are UNKNOWN, not NO_KEY.
 */
import {
  BillingCadence,
  ContactChannel,
  HelperRole,
  HelperStatus,
  HouseKeyAccess,
  PaymentMethod,
  PrincipalRole,
} from "@helper-assistant/domain";
import type { Helper, Household } from "@helper-assistant/domain";

export const helperIds = {
  priya: "helper-priya",
  lupe: "helper-lupe",
  theo: "helper-theo",
} as const;

export const starterPackHousehold: Household = {
  householdId: "household-rivera",
  principals: [
    { personId: "person-jordan", name: "Jordan", role: PrincipalRole.DECISION_MAKER },
    { personId: "person-sam", name: "Sam", role: PrincipalRole.PARTNER },
  ],
  billingPolicy: { cadence: BillingCadence.MONTHLY_IN_ARREARS, expectedByDayOfMonth: null },
  version: 1,
};

export const starterPackHelpers: Helper[] = [
  {
    helperId: helperIds.priya,
    name: "Priya",
    role: HelperRole.BABYSITTER,
    status: HelperStatus.ACTIVE,
    startedOn: null,
    endedOn: null,
    houseKeyAccess: HouseKeyAccess.UNKNOWN,
    payment: { method: PaymentMethod.VENMO, handle: null },
    contact: { channel: ContactChannel.SMS, handle: null },
    notes: "College student. Usually after school on Wednesdays plus some weekend nights.",
    version: 1,
  },
  {
    helperId: helperIds.lupe,
    name: "Lupe",
    role: HelperRole.CLEANER,
    status: HelperStatus.ACTIVE,
    startedOn: null,
    endedOn: null,
    houseKeyAccess: HouseKeyAccess.HAS_KEY,
    payment: { method: PaymentMethod.ZELLE, handle: null },
    contact: { channel: ContactChannel.SMS, handle: null },
    notes: "Comes Tuesday mornings.",
    version: 1,
  },
  {
    helperId: helperIds.theo,
    name: "Theo",
    role: HelperRole.DOG_WALKER,
    status: HelperStatus.ACTIVE,
    startedOn: null,
    endedOn: null,
    houseKeyAccess: HouseKeyAccess.UNKNOWN,
    payment: { method: PaymentMethod.VENMO, handle: null },
    contact: { channel: ContactChannel.SMS, handle: null },
    notes: "Walks Biscuit on weekdays around noon.",
    version: 1,
  },
];
