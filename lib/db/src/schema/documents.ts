import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const documentsTable = pgTable("documents", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category"),
  fileUrl: text("file_url").notNull(),
  mimeType: text("mime_type"),
  fileSize: integer("file_size"),
  propertyId: integer("property_id"),
  unitId: integer("unit_id"),
  contractId: integer("contract_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertDocumentSchema = createInsertSchema(documentsTable).omit({ id: true, createdAt: true });
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documentsTable.$inferSelect;
