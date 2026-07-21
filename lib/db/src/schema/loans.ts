import { pgTable, serial, integer, numeric, text, timestamp } from "drizzle-orm/pg-core";
import { propertiesTable } from "./properties";

export const loansTable = pgTable("loans", {
  id: serial("id").primaryKey(),
  propertyId: integer("property_id").references(() => propertiesTable.id, { onDelete: "set null" }),
  lenderName: text("lender_name").notNull(),
  loanAmount: numeric("loan_amount", { precision: 12, scale: 2 }).notNull(),
  interestRate: numeric("interest_rate", { precision: 6, scale: 4 }).notNull(), // annual %, e.g. 1.5000
  repaymentRate: numeric("repayment_rate", { precision: 6, scale: 4 }).notNull(), // annual %, e.g. 2.0000
  startDate: text("start_date").notNull(),          // YYYY-MM-DD
  fixedRateEndDate: text("fixed_rate_end_date"),    // Zinsbindungsende, nullable
  repaymentType: text("repayment_type").notNull().default("annuity"), // annuity | bullet
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Loan = typeof loansTable.$inferSelect;
