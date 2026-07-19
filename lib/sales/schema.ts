import { z } from "zod";

const installmentSchema = z.object({
  amount: z.number().int().min(0),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(["upcoming", "paid", "failed"]),
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});

// Shared by the sale form dialog and the create/update server actions —
// the only place a raw sale blob is trusted, per CLAUDE.md's rule against
// unvalidated `as` on external input.
export const saleInputSchema = z.object({
  clientName: z.string().min(1, "Le nom du client est requis"),
  clientEmail: z.string().email().nullable(),
  sourceChannel: z.string().nullable(),
  offerId: z.string().nullable(),
  totalPrice: z.number().int().min(0),
  paymentType: z.enum(["one_shot", "installments"]),
  installments: z.array(installmentSchema).nullable(),
  saleDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  closer: z.string().nullable(),
});

export type SaleInput = z.infer<typeof saleInputSchema>;
