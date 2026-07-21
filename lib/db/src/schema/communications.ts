import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";
import { contractsTable } from "./contracts";

export const communicationsTable = pgTable("communications", {
  id:             serial("id").primaryKey(),
  tenantId:       integer("tenant_id").references(() => tenantsTable.id, { onDelete: "cascade" }),
  contractId:     integer("contract_id").references(() => contractsTable.id, { onDelete: "set null" }),
  // channel: 'email_out' | 'email_in' | 'letter_registered' | 'letter_post' | 'note' | 'phone'
  channel:        text("channel").notNull(),
  direction:      text("direction").notNull().default("outbound"), // 'inbound' | 'outbound'
  subject:        text("subject"),
  body:           text("body").notNull().default(""),
  // status: 'draft' | 'sent' | 'delivered' | 'failed'
  status:         text("status").notNull().default("sent"),
  sentAt:         timestamp("sent_at"),
  trackingNumber: text("tracking_number"),
  mahnungLevel:   integer("mahnung_level"),             // 1 / 2 / 3 for dunning notices
  relatedType:    text("related_type"),                 // 'rent_debit' | 'maintenance_issue'
  relatedId:      integer("related_id"),
  createdAt:      timestamp("created_at").defaultNow().notNull(),
});

export type Communication    = typeof communicationsTable.$inferSelect;
export type InsertCommunication = typeof communicationsTable.$inferInsert;
