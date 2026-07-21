import { pgTable, serial, integer, numeric, text, timestamp, unique } from "drizzle-orm/pg-core";
import { contractsTable } from "./contracts";

export const rentDebitsTable = pgTable("rent_debits", {
  id: serial("id").primaryKey(),
  contractId: integer("contract_id").notNull().references(() => contractsTable.id, { onDelete: "cascade" }),
  year: integer("year").notNull(),
  month: integer("month").notNull(), // 1–12
  kaltmiete: numeric("kaltmiete", { precision: 10, scale: 2 }).notNull(),
  nebenkostenvorauszahlung: numeric("nebenkostenvorauszahlung", { precision: 10, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique("unique_debit_per_month").on(table.contractId, table.year, table.month),
]);

export type RentDebit = typeof rentDebitsTable.$inferSelect;
