import { pgTable, serial, text, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { metersTable } from "./meters";

// reading_type:
// annual   — Jahresablesung (Hauptablesung für NKA)
// move_in  — Einzugsablesung
// move_out — Auszugsablesung
// interim  — Zwischenablesung

export const meterReadingsTable = pgTable("meter_readings", {
  id: serial("id").primaryKey(),
  meterId: integer("meter_id").notNull().references(() => metersTable.id, { onDelete: "cascade" }),
  readingDate: text("reading_date").notNull(), // YYYY-MM-DD
  readingValue: numeric("reading_value", { precision: 12, scale: 3 }).notNull(),
  readingType: text("reading_type").notNull().default("annual"), // annual | move_in | move_out | interim
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMeterReadingSchema = createInsertSchema(meterReadingsTable).omit({ id: true, createdAt: true });
export type InsertMeterReading = z.infer<typeof insertMeterReadingSchema>;
export type MeterReading = typeof meterReadingsTable.$inferSelect;
