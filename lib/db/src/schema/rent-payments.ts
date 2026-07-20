import { pgTable, serial, text, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { contractsTable } from "./contracts";

export const rentPaymentsTable = pgTable("rent_payments", {
  id: serial("id").primaryKey(),
  // Nevlo transaction ID — unique so we don't double-import
  nevloTransactionId: text("nevlo_transaction_id").notNull().unique(),
  // Which Nevlo account this came from
  nevloAccountId: text("nevlo_account_id").notNull(),
  accountIban: text("account_iban").notNull(),
  accountName: text("account_name").notNull(),
  bankName: text("bank_name").notNull(),
  // Transaction data from Nevlo
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("EUR"),
  bookingDate: text("booking_date").notNull(),
  counterpartName: text("counterpart_name"),
  counterpartIban: text("counterpart_iban"),
  purpose: text("purpose"),
  // Matching
  contractId: integer("contract_id").references(() => contractsTable.id, { onDelete: "set null" }),
  matchStatus: text("match_status").notNull().default("unmatched"), // 'matched' | 'unmatched' | 'ignored'
  matchedAutomatically: integer("matched_automatically").notNull().default(0), // boolean as int
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertRentPaymentSchema = createInsertSchema(rentPaymentsTable).omit({ id: true, createdAt: true });
export type InsertRentPayment = z.infer<typeof insertRentPaymentSchema>;
export type RentPayment = typeof rentPaymentsTable.$inferSelect;
