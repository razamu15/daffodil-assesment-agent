/**
 * PaymentRecord: Jordan's note that an approved bill was paid outside the app
 * (Venmo, Zelle). We never move money; this only records that Jordan did.
 *
 * A separate record, not a bill status: the approved bill is sealed and stays
 * untouched. Created directly by the UI "Mark as paid" button, with no
 * confirmation step, because the click *is* Jordan's statement. One per bill.
 */
import { z } from "zod";
import { PaymentMethodSchema } from "../enums";
import { IdSchema, InstantSchema, LocalDateSchema, NonNegativeCentsSchema, VersionSchema } from "../primitives";

export const PaymentRecordSchema = z.object({
  paymentId: IdSchema,
  billId: IdSchema,
  helperId: IdSchema,
  /** The approved amount at the time of recording (Approval.amountApprovedCents). */
  amountCents: NonNegativeCentsSchema,
  paidOn: LocalDateSchema,
  method: PaymentMethodSchema,
  /** Optional free text ("Venmo ref 1234"). */
  note: z.string().nullable(),
  recordedAt: InstantSchema,
  version: VersionSchema,
});
export type PaymentRecord = z.infer<typeof PaymentRecordSchema>;
