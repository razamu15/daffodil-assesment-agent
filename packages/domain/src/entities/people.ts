/**
 * Household and Helper (Doc 3 §2.3).
 *
 * Payment and contact live on the Helper because they are facts about the person,
 * not about a deal. A helper is never deleted; an engagement ends (status ENDED).
 */
import { z } from "zod";
import {
  BillingCadenceSchema,
  ContactChannelSchema,
  HelperRoleSchema,
  HelperStatusSchema,
  HouseKeyAccessSchema,
  PaymentMethodSchema,
  PrincipalRoleSchema,
} from "../enums";
import { IdSchema, LocalDateSchema, VersionSchema } from "../primitives";

export const PrincipalSchema = z.object({
  personId: IdSchema,
  name: z.string().min(1),
  role: PrincipalRoleSchema,
});
export type Principal = z.infer<typeof PrincipalSchema>;

export const BillingPolicySchema = z.object({
  cadence: BillingCadenceSchema,
  /** null until Jordan says. We don't invent a due date. */
  expectedByDayOfMonth: z.number().int().min(1).max(31).nullable(),
});
export type BillingPolicy = z.infer<typeof BillingPolicySchema>;

export const HouseholdSchema = z.object({
  householdId: IdSchema,
  /** People who can agree to things. Lets a claim like "Sam said it's fine" point at someone. */
  principals: z.array(PrincipalSchema),
  billingPolicy: BillingPolicySchema,
  version: VersionSchema,
});
export type Household = z.infer<typeof HouseholdSchema>;

export const PaymentInfoSchema = z.object({
  method: PaymentMethodSchema,
  /** Venmo handle, Zelle phone/email, or a description for OTHER. null when not stated. */
  handle: z.string().nullable(),
});
export type PaymentInfo = z.infer<typeof PaymentInfoSchema>;

export const ContactInfoSchema = z.object({
  channel: ContactChannelSchema,
  handle: z.string().nullable(),
});
export type ContactInfo = z.infer<typeof ContactInfoSchema>;

/** The editable facts about a helper. Carried by HELPER_PROFILE_CHANGE proposals. */
export const HelperProfileSchema = z.object({
  name: z.string().min(1),
  role: HelperRoleSchema,
  houseKeyAccess: HouseKeyAccessSchema,
  payment: PaymentInfoSchema,
  contact: ContactInfoSchema,
  startedOn: LocalDateSchema.nullable(),
  /** Free text Jordan wants kept with the person ("college student"). Not terms. */
  notes: z.string(),
});
export type HelperProfile = z.infer<typeof HelperProfileSchema>;

export const HelperSchema = HelperProfileSchema.extend({
  helperId: IdSchema,
  status: HelperStatusSchema,
  /** Set (with status ENDED) only by confirming a HELPER_ENGAGEMENT_END action. */
  endedOn: LocalDateSchema.nullable(),
  version: VersionSchema,
});
export type Helper = z.infer<typeof HelperSchema>;
