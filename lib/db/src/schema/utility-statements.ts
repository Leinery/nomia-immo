import { pgTable, serial, text, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { unitsTable } from "./units";

export const utilityStatementsTable = pgTable("utility_statements", {
  id: serial("id").primaryKey(),
  unitId: integer("unit_id").notNull().references(() => unitsTable.id, { onDelete: "cascade" }),
  year: integer("year").notNull(),
  totalCosts: numeric("total_costs", { precision: 10, scale: 2 }).notNull(),
  tenantShare: numeric("tenant_share", { precision: 10, scale: 2 }).notNull(),
  advancePayments: numeric("advance_payments", { precision: 10, scale: 2 }).notNull(),
  balance: numeric("balance", { precision: 10, scale: 2 }).notNull(),
  notes: text("notes"),
  breakdown: text("breakdown"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUtilityStatementSchema = createInsertSchema(utilityStatementsTable).omit({ id: true, createdAt: true });
export type InsertUtilityStatement = z.infer<typeof insertUtilityStatementSchema>;
export type UtilityStatement = typeof utilityStatementsTable.$inferSelect;
