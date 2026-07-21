import { pgTable, serial, integer, numeric, text, timestamp } from "drizzle-orm/pg-core";
import { propertiesTable } from "./properties";

export const loansTable = pgTable("loans", {
  id: serial("id").primaryKey(),
  propertyId: integer("property_id").references(() => propertiesTable.id, { onDelete: "set null" }),
  lenderName: text("lender_name").notNull(),
  loanAmount: numeric("loan_amount", { precision: 12, scale: 2 }).notNull(),
  interestRate: numeric("interest_rate", { precision: 6, scale: 4 }).notNull(), // annual %, e.g. 1.8400
  repaymentRate: numeric("repayment_rate", { precision: 6, scale: 4 }).notNull(), // annual %, e.g. 2.0000
  startDate: text("start_date").notNull(),          // YYYY-MM-DD
  fixedRateEndDate: text("fixed_rate_end_date"),    // Zinsbindungsende, nullable

  // Bank account details
  loanIban: text("loan_iban"),                      // IBAN des Darlehenskontos
  loanBic: text("loan_bic"),                        // BIC der Bank
  debitAccountIban: text("debit_account_iban"),     // Abbuchungskonto IBAN
  accountHolder: text("account_holder"),            // Kontoinhaber

  // Sondertilgung
  annualSondertilgung: numeric("annual_sondertilgung", { precision: 12, scale: 2 }), // max. Sondertilgung pro Jahr
  sondertilgungUsedThisYear: numeric("sondertilgung_used_this_year", { precision: 12, scale: 2 }).default("0"),

  // Balance override — falls der tatsächliche Bankstand abweicht
  currentBalanceOverride: numeric("current_balance_override", { precision: 12, scale: 2 }),

  repaymentType: text("repayment_type").notNull().default("annuity"), // annuity | bullet
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Loan = typeof loansTable.$inferSelect;
