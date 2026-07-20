import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { propertiesTable } from "./properties";
import { unitsTable } from "./units";

// Meter types
// electricity | gas | water_cold | water_hot | heat | other

// Distribution keys (how a property-level meter is split between units)
// direct   — individual meter per unit, no splitting needed
// person   — nach Personenzahl
// area     — nach Wohnfläche (m²)
// equal    — zu gleichen Teilen

export const metersTable = pgTable("meters", {
  id: serial("id").primaryKey(),
  propertyId: integer("property_id").notNull().references(() => propertiesTable.id, { onDelete: "cascade" }),
  unitId: integer("unit_id").references(() => unitsTable.id, { onDelete: "cascade" }), // null = Gebäudezähler
  name: text("name").notNull(),
  meterNumber: text("meter_number"),
  meterType: text("meter_type").notNull(), // electricity | gas | water_cold | water_hot | heat | other
  unitOfMeasure: text("unit_of_measure").notNull().default("kWh"), // kWh | m3 | GJ
  distributionKey: text("distribution_key").notNull().default("direct"), // direct | person | area | equal
  location: text("location"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMeterSchema = createInsertSchema(metersTable).omit({ id: true, createdAt: true });
export type InsertMeter = z.infer<typeof insertMeterSchema>;
export type Meter = typeof metersTable.$inferSelect;
