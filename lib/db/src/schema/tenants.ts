import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tenantsTable = pgTable("tenants", {
  id:            serial("id").primaryKey(),
  // ── Name ──────────────────────────────────────────────────────────────────
  companyName:   text("company_name"),          // Firmenname (für Gewerbemieter)
  firstName:     text("first_name").notNull(),   // Vorname / Inhaber
  lastName:      text("last_name").notNull(),    // Nachname / Inhaber
  contactPerson: text("contact_person"),         // Ansprechpartner (abweichend)
  // ── Adresse ───────────────────────────────────────────────────────────────
  street:        text("street"),                 // Straße + Hausnummer
  zipCode:       text("zip_code"),               // PLZ
  city:          text("city"),                   // Ort
  // ── Kontakt ───────────────────────────────────────────────────────────────
  email:         text("email"),
  phone:         text("phone"),                  // Festnetz
  mobile:        text("mobile"),                 // Mobilnummer
  // ── Weitere Angaben ───────────────────────────────────────────────────────
  dateOfBirth:   text("date_of_birth"),
  taxId:         text("tax_id"),                 // USt-IdNr / Steuernummer
  iban:          text("iban"),                   // IBAN für Lastschrift
  notes:         text("notes"),
  createdAt:     timestamp("created_at").defaultNow().notNull(),
});

export const insertTenantSchema = createInsertSchema(tenantsTable).omit({ id: true, createdAt: true });
export type InsertTenant = z.infer<typeof insertTenantSchema>;
export type Tenant = typeof tenantsTable.$inferSelect;
