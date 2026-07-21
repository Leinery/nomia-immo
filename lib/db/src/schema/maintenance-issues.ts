import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { propertiesTable } from "./properties";
import { unitsTable } from "./units";
import { tenantsTable } from "./tenants";

export const maintenanceIssuesTable = pgTable("maintenance_issues", {
  id:          serial("id").primaryKey(),
  propertyId:  integer("property_id").notNull().references(() => propertiesTable.id, { onDelete: "cascade" }),
  unitId:      integer("unit_id").references(() => unitsTable.id, { onDelete: "set null" }),
  tenantId:    integer("tenant_id").references(() => tenantsTable.id, { onDelete: "set null" }),
  title:       text("title").notNull(),
  description: text("description"),
  // status: 'open' | 'in_progress' | 'resolved'
  status:      text("status").notNull().default("open"),
  // priority: 'low' | 'medium' | 'high' | 'urgent'
  priority:    text("priority").notNull().default("medium"),
  // category: 'plumbing' | 'electrical' | 'heating' | 'structural' | 'appliance' | 'other'
  category:    text("category").notNull().default("other"),
  reportedAt:  text("reported_at"),  // YYYY-MM-DD
  resolvedAt:  text("resolved_at"),  // YYYY-MM-DD
  createdAt:   timestamp("created_at").defaultNow().notNull(),
});

export type MaintenanceIssue       = typeof maintenanceIssuesTable.$inferSelect;
export type InsertMaintenanceIssue = typeof maintenanceIssuesTable.$inferInsert;
