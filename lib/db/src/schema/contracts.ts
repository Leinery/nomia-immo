import { pgTable, serial, text, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { unitsTable } from "./units";
import { tenantsTable } from "./tenants";

export const contractsTable = pgTable("contracts", {
  id: serial("id").primaryKey(),
  unitId: integer("unit_id").notNull().references(() => unitsTable.id, { onDelete: "cascade" }),
  tenantId: integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  monthlyRent: numeric("monthly_rent", { precision: 10, scale: 2 }).notNull(),
  nebenkostenvorauszahlung: numeric("nebenkostenvorauszahlung", { precision: 10, scale: 2 }).notNull().default("0"),
  heizkostenvorauszahlung: numeric("heizkostenvorauszahlung", { precision: 10, scale: 2 }).notNull().default("0"),
  deposit: numeric("deposit", { precision: 10, scale: 2 }),
  status: text("status").notNull().default("active"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertContractSchema = createInsertSchema(contractsTable).omit({ id: true, createdAt: true });
export type InsertContract = z.infer<typeof insertContractSchema>;
export type Contract = typeof contractsTable.$inferSelect;
