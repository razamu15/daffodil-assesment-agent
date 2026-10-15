/**
 * Expected household and helpers after the starter pack is loaded. Helper
 * profiles are saved directly (not gated); only terms need confirmation.
 *
 * Note the S4 rule in action: only Lupe "has a key" in the notes, so Priya and
 * Theo are UNKNOWN, not NO_KEY.
 */
import { BillingCadence, ContactChannel, HelperStatus, HouseKeyAccess, PaymentMethod } from "@helper-assistant/domain";
import type { Helper, Household } from "@helper-assistant/domain";

export const helperIds = {
  priya: "helper-priya",
  lupe: "helper-lupe",
  theo: "helper-theo",
} as const;

export const starterPackHousehold: Household = {
  householdId: "household-rivera",
  billingPolicy: { cadence: BillingCadence.MONTHLY_IN_ARREARS, expectedByDayOfMonth: null },
  version: 1,
};

export const starterPackHelpers: Helper[] = [
  {
    helperId: helperIds.priya,
    name: "Priya",
    role: "babysitter",
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
    role: "cleaner",
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
    role: "dog walker",
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
