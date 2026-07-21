import { Router, type IRouter } from "express";
import { eq, and, inArray, isNull, or, gte, sql } from "drizzle-orm";
import {
  db, contractsTable, tenantsTable, unitsTable, propertiesTable,
  rentDebitsTable, rentPaymentsTable,
} from "@workspace/db";

const router: IRouter = Router();

// ─── GET /sollstellungen?year=2026&month=7 ────────────────────────────────────
// Returns all Sollstellungen (rent debits) for the given month across all active
// contracts. Auto-generates a debit for the month if one doesn't exist yet.
router.get("/sollstellungen", async (req, res): Promise<void> => {
  const now   = new Date();
  const year  = parseInt(req.query.year  as string) || now.getFullYear();
  const month = parseInt(req.query.month as string) || (now.getMonth() + 1);

  const today = now.toISOString().slice(0, 10);

  // Active contracts with tenant, unit, property
  const activeContracts = await db
    .select({
      contractId:              contractsTable.id,
      monthlyRent:             contractsTable.monthlyRent,
      nebenkostenvorauszahlung: contractsTable.nebenkostenvorauszahlung,
      startDate:               contractsTable.startDate,
      endDate:                 contractsTable.endDate,
      tenantId:                contractsTable.tenantId,
      tenantFirstName:         tenantsTable.firstName,
      tenantLastName:          tenantsTable.lastName,
      tenantEmail:             tenantsTable.email,
      unitId:                  contractsTable.unitId,
      unitName:                unitsTable.name,
      propertyId:              unitsTable.propertyId,
      propertyName:            propertiesTable.name,
    })
    .from(contractsTable)
    .innerJoin(tenantsTable,   eq(contractsTable.tenantId, tenantsTable.id))
    .innerJoin(unitsTable,     eq(contractsTable.unitId,   unitsTable.id))
    .innerJoin(propertiesTable, eq(unitsTable.propertyId,  propertiesTable.id))
    .where(
      and(
        or(isNull(contractsTable.endDate), gte(contractsTable.endDate, today)),
        eq(contractsTable.status, "active"),
      ),
    );

  if (activeContracts.length === 0) { res.json([]); return; }

  const contractIds = activeContracts.map((c) => c.contractId);

  // Auto-generate missing debits for the requested month (idempotent)
  const missingRows = activeContracts
    .filter((c) => {
      // Only generate if the contract was active during this month
      const contractStart = c.startDate?.slice(0, 7); // "YYYY-MM"
      const reqMonth = `${year}-${String(month).padStart(2, "0")}`;
      return !contractStart || contractStart <= reqMonth;
    })
    .map((c) => ({
      contractId:               c.contractId,
      year,
      month,
      kaltmiete:                c.monthlyRent,
      nebenkostenvorauszahlung: String(c.nebenkostenvorauszahlung ?? "0"),
    }));

  if (missingRows.length > 0) {
    await db.insert(rentDebitsTable).values(missingRows).onConflictDoNothing();
  }

  // Fetch debits for this month
  const debits = await db
    .select()
    .from(rentDebitsTable)
    .where(
      and(
        inArray(rentDebitsTable.contractId, contractIds),
        eq(rentDebitsTable.year, year),
        eq(rentDebitsTable.month, month),
      ),
    );

  // Payments for this month per contract
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  const payments = await db
    .select({
      contractId:  rentPaymentsTable.contractId,
      amount:      rentPaymentsTable.amount,
      bookingDate: rentPaymentsTable.bookingDate,
    })
    .from(rentPaymentsTable)
    .where(
      and(
        inArray(rentPaymentsTable.contractId, contractIds),
        sql`${rentPaymentsTable.bookingDate} LIKE ${monthStr + "%"}`,
        sql`${rentPaymentsTable.amount}::numeric > 0`,
      ),
    );

  // Sum payments per contract for this month
  const paidMap: Record<number, number> = {};
  for (const p of payments) {
    if (p.contractId == null) continue;
    paidMap[p.contractId] = (paidMap[p.contractId] ?? 0) + parseFloat(p.amount as string);
  }

  // Build debit map
  const debitMap: Record<number, typeof debits[0]> = {};
  for (const d of debits) debitMap[d.contractId] = d;

  const result = activeContracts.map((c) => {
    const debit = debitMap[c.contractId];
    const kaltmiete = debit
      ? parseFloat(debit.kaltmiete)
      : parseFloat(c.monthlyRent);
    const nkv = debit
      ? parseFloat(debit.nebenkostenvorauszahlung ?? "0")
      : parseFloat(c.nebenkostenvorauszahlung ?? "0");
    const total  = kaltmiete + nkv;
    const paid   = Math.round((paidMap[c.contractId] ?? 0) * 100) / 100;
    const balance = Math.round((paid - total) * 100) / 100;

    let status: "bezahlt" | "differenz" | "offen";
    if (paid >= total - 0.01)          status = "bezahlt";
    else if (paid > 0.01)              status = "differenz";
    else                               status = "offen";

    return {
      debitId:     debit?.id ?? null,
      contractId:  c.contractId,
      tenantId:    c.tenantId,
      tenantName:  `${c.tenantFirstName} ${c.tenantLastName}`.trim(),
      tenantEmail: c.tenantEmail,
      unitId:      c.unitId,
      unitName:    c.unitName,
      propertyId:  c.propertyId,
      propertyName: c.propertyName,
      year,
      month,
      kaltmiete:   Math.round(kaltmiete * 100) / 100,
      nebenkostenvorauszahlung: Math.round(nkv * 100) / 100,
      total:       Math.round(total * 100) / 100,
      paid,
      balance,
      status,
    };
  });

  res.json(result);
});

export default router;
