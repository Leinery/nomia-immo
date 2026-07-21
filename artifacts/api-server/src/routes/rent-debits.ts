import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, contractsTable, rentDebitsTable, rentPaymentsTable } from "@workspace/db";

const router: IRouter = Router();

function serializeDebit(d: typeof rentDebitsTable.$inferSelect) {
  return {
    ...d,
    kaltmiete: parseFloat(d.kaltmiete),
    nebenkostenvorauszahlung: parseFloat(d.nebenkostenvorauszahlung ?? "0"),
    total: parseFloat(d.kaltmiete) + parseFloat(d.nebenkostenvorauszahlung ?? "0"),
  };
}

// ─── GET /contracts/:contractId/debits ────────────────────────────────────────
// Returns all Sollstellungen for a contract, enriched with paid amounts per month.
router.get("/contracts/:contractId/debits", async (req, res): Promise<void> => {
  const contractId = parseInt(req.params.contractId);
  if (isNaN(contractId)) { res.status(400).json({ error: "Ungültige Vertrags-ID" }); return; }

  const debits = await db
    .select()
    .from(rentDebitsTable)
    .where(eq(rentDebitsTable.contractId, contractId))
    .orderBy(rentDebitsTable.year, rentDebitsTable.month);

  // Sum payments per month for this contract
  const payments = await db
    .select({
      bookingDate: rentPaymentsTable.bookingDate,
      amount: rentPaymentsTable.amount,
    })
    .from(rentPaymentsTable)
    .where(
      and(
        eq(rentPaymentsTable.contractId, contractId),
        sql`${rentPaymentsTable.amount}::numeric > 0`,
      ),
    );

  // Build a map: "YYYY-MM" -> total paid
  const paidMap: Record<string, number> = {};
  for (const p of payments) {
    const key = p.bookingDate?.slice(0, 7); // "YYYY-MM"
    if (!key) continue;
    paidMap[key] = (paidMap[key] ?? 0) + parseFloat(p.amount as string);
  }

  const result = debits.map((d) => {
    const key = `${d.year}-${String(d.month).padStart(2, "0")}`;
    const kaltmiete = parseFloat(d.kaltmiete);
    const nkv = parseFloat(d.nebenkostenvorauszahlung ?? "0");
    const total = kaltmiete + nkv;
    const paid = paidMap[key] ?? 0;
    const balance = paid - total; // positive = Überzahlung, negative = Rückstand
    return {
      ...serializeDebit(d),
      paid: Math.round(paid * 100) / 100,
      balance: Math.round(balance * 100) / 100,
    };
  });

  res.json(result);
});

// ─── POST /contracts/:contractId/debits/generate ─────────────────────────────
// Auto-generates Sollstellungen from a given month to today (idempotent).
// Body: { from: "2025-01", to?: "2026-07" }
router.post("/contracts/:contractId/debits/generate", async (req, res): Promise<void> => {
  const contractId = parseInt(req.params.contractId);
  if (isNaN(contractId)) { res.status(400).json({ error: "Ungültige Vertrags-ID" }); return; }

  const [contract] = await db
    .select()
    .from(contractsTable)
    .where(eq(contractsTable.id, contractId));
  if (!contract) { res.status(404).json({ error: "Vertrag nicht gefunden" }); return; }

  const fromStr: string = req.body.from ?? "2025-01";
  const now = new Date();
  const toStr: string = req.body.to ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const [fromYear, fromMonth] = fromStr.split("-").map(Number);
  const [toYear, toMonth] = toStr.split("-").map(Number);

  const kaltmiete = String(contract.monthlyRent);
  const nkv = String(contract.nebenkostenvorauszahlung ?? "0");

  const rows: Array<{ contractId: number; year: number; month: number; kaltmiete: string; nebenkostenvorauszahlung: string }> = [];
  let y = fromYear, m = fromMonth;
  while (y < toYear || (y === toYear && m <= toMonth)) {
    rows.push({ contractId, year: y, month: m, kaltmiete, nebenkostenvorauszahlung: nkv });
    m++;
    if (m > 12) { m = 1; y++; }
  }

  if (rows.length === 0) { res.json({ generated: 0 }); return; }

  // ON CONFLICT DO NOTHING — idempotent
  await db
    .insert(rentDebitsTable)
    .values(rows)
    .onConflictDoNothing();

  res.json({ generated: rows.length });
});

// ─── POST /rent-debits ────────────────────────────────────────────────────────
router.post("/rent-debits", async (req, res): Promise<void> => {
  const { contractId, year, month, kaltmiete, nebenkostenvorauszahlung, notes } = req.body;
  if (!contractId || !year || !month || kaltmiete == null) {
    res.status(400).json({ error: "contractId, year, month und kaltmiete sind erforderlich" });
    return;
  }
  const [row] = await db.insert(rentDebitsTable).values({
    contractId: Number(contractId),
    year: Number(year),
    month: Number(month),
    kaltmiete: String(kaltmiete),
    nebenkostenvorauszahlung: String(nebenkostenvorauszahlung ?? 0),
    notes: notes ?? null,
  }).returning();
  res.status(201).json(serializeDebit(row));
});

// ─── PATCH /rent-debits/:id ───────────────────────────────────────────────────
router.patch("/rent-debits/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Ungültige ID" }); return; }

  const { kaltmiete, nebenkostenvorauszahlung, notes } = req.body;
  const update: Record<string, any> = {};
  if (kaltmiete != null) update.kaltmiete = String(kaltmiete);
  if (nebenkostenvorauszahlung != null) update.nebenkostenvorauszahlung = String(nebenkostenvorauszahlung);
  if (notes !== undefined) update.notes = notes;

  const [row] = await db.update(rentDebitsTable).set(update).where(eq(rentDebitsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Sollstellung nicht gefunden" }); return; }
  res.json(serializeDebit(row));
});

// ─── DELETE /rent-debits/:id ──────────────────────────────────────────────────
router.delete("/rent-debits/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Ungültige ID" }); return; }

  const [row] = await db.delete(rentDebitsTable).where(eq(rentDebitsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Sollstellung nicht gefunden" }); return; }
  res.sendStatus(204);
});

export default router;
