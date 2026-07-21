import { Router, type IRouter } from "express";
import { eq, inArray, isNull, or, gte } from "drizzle-orm";
import {
  db, propertiesTable, unitsTable, contractsTable,
  tenantsTable, rentDebitsTable, rentPaymentsTable,
} from "@workspace/db";
import {
  CreatePropertyBody,
  CreatePropertyResponse,
  GetPropertyParams,
  GetPropertyResponse,
  UpdatePropertyParams,
  UpdatePropertyBody,
  UpdatePropertyResponse,
  DeletePropertyParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function serializeProperty(p: typeof propertiesTable.$inferSelect) {
  return {
    ...p,
    purchasePrice: p.purchasePrice != null ? parseFloat(p.purchasePrice) : null,
  };
}

// ─── GET /properties — enriched with unit aggregates and monthly rent ──────────
router.get("/properties", async (_req, res): Promise<void> => {
  const properties = await db.select().from(propertiesTable).orderBy(propertiesTable.createdAt);
  if (properties.length === 0) { res.json([]); return; }

  // All units
  const allUnits = await db.select({
    id: unitsTable.id, propertyId: unitsTable.propertyId,
    unitType: unitsTable.unitType, area: unitsTable.area, status: unitsTable.status,
  }).from(unitsTable);

  // Active contracts (endDate IS NULL or endDate >= today)
  const today = new Date().toISOString().slice(0, 10);
  const activeContracts = await db.select({
    id: contractsTable.id, unitId: contractsTable.unitId,
    monthlyRent: contractsTable.monthlyRent, nebenkostenvorauszahlung: contractsTable.nebenkostenvorauszahlung,
  }).from(contractsTable).where(or(isNull(contractsTable.endDate), gte(contractsTable.endDate, today)));

  // Build maps
  const unitsByProperty = new Map<number, typeof allUnits>();
  for (const u of allUnits) {
    if (!unitsByProperty.has(u.propertyId)) unitsByProperty.set(u.propertyId, []);
    unitsByProperty.get(u.propertyId)!.push(u);
  }
  const contractsByUnitId = new Map<number, typeof activeContracts[0]>();
  for (const c of activeContracts) contractsByUnitId.set(c.unitId, c);

  const result = properties.map((p) => {
    const propUnits = unitsByProperty.get(p.id) ?? [];
    const residential = propUnits.filter((u) => (u.unitType ?? "residential") === "residential").length;
    const garage = propUnits.filter((u) => u.unitType === "garage").length;
    const parking = propUnits.filter((u) => u.unitType === "parking").length;
    const totalArea = propUnits.reduce((s, u) => s + (u.area ? parseFloat(u.area) : 0), 0);
    const monthlyRent = propUnits.reduce((s, u) => {
      const c = contractsByUnitId.get(u.id);
      if (!c) return s;
      return s + parseFloat(c.monthlyRent) + parseFloat(c.nebenkostenvorauszahlung ?? "0");
    }, 0);

    return {
      ...serializeProperty(p),
      totalUnits: residential, // backward compat: residential count
      unitsByType: { residential, garage, parking },
      totalArea: Math.round(totalArea * 10) / 10,
      monthlyRent: Math.round(monthlyRent * 100) / 100,
    };
  });

  res.json(result);
});

// ─── POST /properties ─────────────────────────────────────────────────────────
router.post("/properties", async (req, res): Promise<void> => {
  const parsed = CreatePropertyBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.insert(propertiesTable).values({
    ...parsed.data,
    purchasePrice: parsed.data.purchasePrice != null ? String(parsed.data.purchasePrice) : undefined,
  }).returning();
  res.status(201).json(CreatePropertyResponse.parse(serializeProperty(row)));
});

// ─── GET /properties/:id ──────────────────────────────────────────────────────
router.get("/properties/:id", async (req, res): Promise<void> => {
  const params = GetPropertyParams.safeParse({ id: req.params.id });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [row] = await db.select().from(propertiesTable).where(eq(propertiesTable.id, params.data.id));
  if (!row) { res.status(404).json({ error: "Property not found" }); return; }
  res.json(GetPropertyResponse.parse(serializeProperty(row)));
});

// ─── PATCH /properties/:id ────────────────────────────────────────────────────
router.patch("/properties/:id", async (req, res): Promise<void> => {
  const params = UpdatePropertyParams.safeParse({ id: req.params.id });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdatePropertyBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.update(propertiesTable).set({
    ...parsed.data,
    purchasePrice: parsed.data.purchasePrice != null ? String(parsed.data.purchasePrice) : undefined,
  }).where(eq(propertiesTable.id, params.data.id)).returning();
  if (!row) { res.status(404).json({ error: "Property not found" }); return; }
  res.json(UpdatePropertyResponse.parse(serializeProperty(row)));
});

// ─── DELETE /properties/:id ───────────────────────────────────────────────────
router.delete("/properties/:id", async (req, res): Promise<void> => {
  const params = DeletePropertyParams.safeParse({ id: req.params.id });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [row] = await db.delete(propertiesTable).where(eq(propertiesTable.id, params.data.id)).returning();
  if (!row) { res.status(404).json({ error: "Property not found" }); return; }
  res.sendStatus(204);
});

// ─── GET /properties/:id/rent-overview ───────────────────────────────────────
// Returns per-unit payment status for the current month.
router.get("/properties/:id/rent-overview", async (req, res): Promise<void> => {
  const propertyId = parseInt(req.params.id);
  if (isNaN(propertyId)) { res.status(400).json({ error: "Ungültige ID" }); return; }

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const today = now.toISOString().slice(0, 10);

  // All units for this property
  const units = await db.select().from(unitsTable)
    .where(eq(unitsTable.propertyId, propertyId))
    .orderBy(unitsTable.name);

  if (units.length === 0) { res.json([]); return; }

  const unitIds = units.map((u) => u.id);

  // Active contracts linked to these units
  const contracts = await db.select().from(contractsTable)
    .where(
      inArray(contractsTable.unitId, unitIds),
    );

  // Tenants
  const tenantIds = [...new Set(contracts.map((c) => c.tenantId))];
  const tenants = tenantIds.length > 0
    ? await db.select({ id: tenantsTable.id, firstName: tenantsTable.firstName, lastName: tenantsTable.lastName })
        .from(tenantsTable).where(inArray(tenantsTable.id, tenantIds))
    : [];
  const tenantMap = new Map(tenants.map((t) => [t.id, t]));

  // Current month debits
  const contractIds = contracts.map((c) => c.id);
  const debits = contractIds.length > 0
    ? await db.select().from(rentDebitsTable)
        .where(
          inArray(rentDebitsTable.contractId, contractIds),
        )
        .then((rows) => rows.filter((d) => d.year === currentYear && d.month === currentMonth))
    : [];

  // Current month payments (positive amounts only)
  const payments = contractIds.length > 0
    ? await db.select({
        contractId: rentPaymentsTable.contractId,
        amount: rentPaymentsTable.amount,
        bookingDate: rentPaymentsTable.bookingDate,
      }).from(rentPaymentsTable)
        .where(inArray(rentPaymentsTable.contractId, contractIds))
        .then((rows) =>
          rows.filter((p) => {
            if (!p.bookingDate) return false;
            const d = new Date(p.bookingDate);
            return (
              d.getFullYear() === currentYear &&
              d.getMonth() + 1 === currentMonth &&
              parseFloat(p.amount as string) > 0
            );
          }),
        )
    : [];

  // Maps
  const activeContractByUnit = new Map<number, typeof contracts[0]>();
  for (const c of contracts) {
    if (!c.endDate || c.endDate >= today) {
      // Keep the most recent contract per unit
      if (!activeContractByUnit.has(c.unitId)) activeContractByUnit.set(c.unitId, c);
    }
  }
  const debitByContract = new Map(debits.map((d) => [d.contractId, d]));
  const paidByContract: Record<number, number> = {};
  for (const p of payments) {
    if (p.contractId == null) continue;
    paidByContract[p.contractId] = (paidByContract[p.contractId] ?? 0) + parseFloat(p.amount as string);
  }

  const result = units.map((u) => {
    const contract = activeContractByUnit.get(u.id);
    const tenant = contract ? tenantMap.get(contract.tenantId) : null;
    const debit = contract ? debitByContract.get(contract.id) : null;

    let status: string;
    let soll = 0;
    let gezahlt = 0;

    if (u.status === "vacant") {
      status = "leerstand";
    } else if (!contract) {
      status = "kein_vertrag";
    } else if (!debit) {
      status = "kein_debit";
    } else {
      soll = parseFloat(debit.kaltmiete) + parseFloat(debit.nebenkostenvorauszahlung ?? "0");
      gezahlt = paidByContract[contract.id] ?? 0;
      if (gezahlt >= soll - 0.01) status = "bezahlt";
      else if (gezahlt > 0) status = "teilweise";
      else status = "offen";
    }

    return {
      unitId: u.id,
      unitName: u.name,
      unitType: u.unitType ?? "residential",
      area: u.area ? parseFloat(u.area) : null,
      unitStatus: u.status,
      contractId: contract?.id ?? null,
      tenantId: tenant?.id ?? null,
      tenantName: tenant ? `${tenant.firstName} ${tenant.lastName}` : null,
      currentMonth: { soll, gezahlt, status },
    };
  });

  res.json(result);
});

export default router;
