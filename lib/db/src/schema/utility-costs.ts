import { pgTable, serial, text, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { propertiesTable } from "./properties";

export const utilityCostsTable = pgTable("utility_costs", {
  id: serial("id").primaryKey(),
  propertyId: integer("property_id").notNull().references(() => propertiesTable.id, { onDelete: "cascade" }),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  category: text("category").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUtilityCostSchema = createInsertSchema(utilityCostsTable).omit({ id: true, createdAt: true });
export type InsertUtilityCost = z.infer<typeof insertUtilityCostSchema>;
export type UtilityCost = typeof utilityCostsTable.$inferSelect;
