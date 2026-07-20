import { pgTable, serial, text, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { propertiesTable } from "./properties";

export const unitsTable = pgTable("units", {
  id: serial("id").primaryKey(),
  propertyId: integer("property_id").notNull().references(() => propertiesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  floor: integer("floor"),
  area: numeric("area", { precision: 8, scale: 2 }),
  rooms: numeric("rooms", { precision: 4, scale: 1 }),
  unitType: text("unit_type").notNull().default("residential"),
  status: text("status").notNull().default("vacant"),
  monthlyRent: numeric("monthly_rent", { precision: 10, scale: 2 }),
  deposit: numeric("deposit", { precision: 10, scale: 2 }),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUnitSchema = createInsertSchema(unitsTable).omit({ id: true, createdAt: true });
export type InsertUnit = z.infer<typeof insertUnitSchema>;
export type Unit = typeof unitsTable.$inferSelect;
