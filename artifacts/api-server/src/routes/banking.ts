import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, rentPaymentsTable, contractsTable, tenantsTable, unitsTable } from "@workspace/db";

const router: IRouter = Router();

const NEVLO_BASE = "https://nevlo.io/api/v1";

function nevloHeaders() {
  return {
    Authorization: `Bearer ${process.env.NEVLO_ACCESS_TOKEN}`,
    "Content-Type": "application/json",
  };
}

// GET /api/banking/accounts — proxy Nevlo accounts
router.get("/banking/accounts", async (_req, res): Promise<void> => {
  const response = await fetch(`${NEVLO_BASE}/accounts`, { headers: nevloHeaders() });
  if (!response.ok) {
    res.status(502).json({ error: "Nevlo API nicht erreichbar" });
    return;
  }
  const data = await response.json() as { accounts: NevloAccount[] };
  res.json(data);
});

interface NevloAccount {
  id: string;
  accountName: string;
  iban: string;
  accountType: string;
  balance: number;
  currency: string;
  lastSyncedAt: string;
  bankConnection: { bankName: string; status: string };
}

interface NevloTransaction {
  id: string;
  amount: number;
  currency: string;
  bookingDate: string;
  valueDate: string;
  merchantName: string | null;
  counterpartName: string | null;
  counterpartIban: string | null;
  purpose: string | null;
  type: string;
  bankAccount: {
    id: string;
    iban: string;
    accountName: string;
    bankConnection: { bankName: string };
  };
}

// POST /api/banking/sync — pull latest transactions & auto-match
router.post("/banking/sync", async (_req, res): Promise<void> => {
  // 1. Get all Nevlo accounts
  const accResp = await fetch(`${NEVLO_BASE}/accounts`, { headers: nevloHeaders() });
  if (!accResp.ok) {
    res.status(502).json({ error: "Nevlo-Konten konnten nicht geladen werden" });
    return;
  }
  const { accounts } = await accResp.json() as { accounts: NevloAccount[] };

  // 2. Fetch transactions for all accounts (last 90 days)
  const since = new Date();
  since.setDate(since.getDate() - 90);
  const sinceStr = since.toISOString().split("T")[0];

  const accountIds = accounts.map((a) => a.id).join(",");
  const txResp = await fetch(
    `${NEVLO_BASE}/transactions?accountIds=${accountIds}&dateFrom=${sinceStr}&limit=200`,
    { headers: nevloHeaders() }
  );
  if (!txResp.ok) {
    res.status(502).json({ error: "Transaktionen konnten nicht geladen werden" });
    return;
  }
  const { transactions } = await txResp.json() as { transactions: NevloTransaction[] };

  // 3. Load active contracts with tenant info for matching
  const contracts = await db
    .select({
      contractId: contractsTable.id,
      monthlyRent: contractsTable.monthlyRent,
      tenantFirstName: tenantsTable.firstName,
      tenantLastName: tenantsTable.lastName,
      tenantEmail: tenantsTable.email,
    })
    .from(contractsTable)
    .innerJoin(tenantsTable, eq(contractsTable.tenantId, tenantsTable.id))
    .innerJoin(unitsTable, eq(contractsTable.unitId, unitsTable.id))
    .where(eq(contractsTable.status, "active"));

  // 4. Import ALL transactions (positive = income, negative = expense)
  let imported = 0;
  let matched = 0;

  for (const tx of transactions) {
    // Skip already imported
    const existing = await db
      .select({ id: rentPaymentsTable.id })
      .from(rentPaymentsTable)
      .where(eq(rentPaymentsTable.nevloTransactionId, tx.id));
    if (existing.length > 0) continue;

    // Auto-match logic — only for incoming (positive) transactions
    let contractId: number | null = null;
    let matchedAuto = false;

    if (tx.amount > 0) {
      const tenantFullName = (c: typeof contracts[0]) =>
        `${c.tenantFirstName} ${c.tenantLastName}`.toLowerCase();

      for (const contract of contracts) {
        const rent = parseFloat(contract.monthlyRent);
        const amtDiff = rent > 0 ? Math.abs(tx.amount - rent) / rent : 1;
        const nameMatch =
          tx.counterpartName &&
          tenantFullName(contract).split(" ").some((part) =>
            tx.counterpartName!.toLowerCase().includes(part)
          );
        const purposeMatch =
          tx.purpose &&
          tenantFullName(contract).split(" ").some((part) =>
            tx.purpose!.toLowerCase().includes(part)
          );

        // Match if: amount within 5% tolerance OR tenant name in counterpart/purpose
        if (amtDiff <= 0.05 || nameMatch || purposeMatch) {
          contractId = contract.contractId;
          matchedAuto = true;
          break;
        }
      }
    }

    const accountInfo = accounts.find((a) => a.id === tx.bankAccount.id);

    await db.insert(rentPaymentsTable).values({
      nevloTransactionId: tx.id,
      nevloAccountId: tx.bankAccount.id,
      accountIban: tx.bankAccount.iban,
      accountName: tx.bankAccount.accountName,
      bankName: tx.bankAccount.bankConnection.bankName,
      amount: String(tx.amount),
      currency: tx.currency,
      bookingDate: tx.bookingDate.split("T")[0],
      counterpartName: tx.counterpartName ?? null,
      counterpartIban: tx.counterpartIban ?? null,
      purpose: tx.purpose ?? null,
      contractId: contractId ?? undefined,
      matchStatus: contractId ? "matched" : "unmatched",
      matchedAutomatically: matchedAuto ? 1 : 0,
      // Auto-categorise incoming as 'rent', outgoing stays null (user assigns)
      category: tx.amount > 0 && contractId ? "rent" : null,
    });

    imported++;
    if (contractId) matched++;
  }

  res.json({ imported, matched, total: transactions.length });
});

// GET /api/banking/payments — list all stored payments with contract details
router.get("/banking/payments", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: rentPaymentsTable.id,
      nevloTransactionId: rentPaymentsTable.nevloTransactionId,
      nevloAccountId: rentPaymentsTable.nevloAccountId,
      accountIban: rentPaymentsTable.accountIban,
      accountName: rentPaymentsTable.accountName,
      bankName: rentPaymentsTable.bankName,
      amount: rentPaymentsTable.amount,
      currency: rentPaymentsTable.currency,
      bookingDate: rentPaymentsTable.bookingDate,
      counterpartName: rentPaymentsTable.counterpartName,
      counterpartIban: rentPaymentsTable.counterpartIban,
      purpose: rentPaymentsTable.purpose,
      contractId: rentPaymentsTable.contractId,
      matchStatus: rentPaymentsTable.matchStatus,
      matchedAutomatically: rentPaymentsTable.matchedAutomatically,
      category: rentPaymentsTable.category,
      createdAt: rentPaymentsTable.createdAt,
      tenantFirstName: tenantsTable.firstName,
      tenantLastName: tenantsTable.lastName,
    })
    .from(rentPaymentsTable)
    .leftJoin(contractsTable, eq(rentPaymentsTable.contractId, contractsTable.id))
    .leftJoin(tenantsTable, eq(contractsTable.tenantId, tenantsTable.id))
    .orderBy(desc(rentPaymentsTable.bookingDate));

  const result = rows.map((r) => ({
    ...r,
    amount: parseFloat(r.amount),
    matchedAutomatically: r.matchedAutomatically === 1,
    tenantName:
      r.tenantFirstName && r.tenantLastName
        ? `${r.tenantFirstName} ${r.tenantLastName}`
        : null,
  }));

  res.json(result);
});

// PATCH /api/banking/payments/:id/match — manually assign a contract
router.patch("/banking/payments/:id/match", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const { contractId } = req.body as { contractId: number | null };

  if (isNaN(id)) {
    res.status(400).json({ error: "Ungültige ID" });
    return;
  }

  const [row] = await db
    .update(rentPaymentsTable)
    .set({
      contractId: contractId ?? undefined,
      matchStatus: contractId ? "matched" : "unmatched",
      matchedAutomatically: 0,
    })
    .where(eq(rentPaymentsTable.id, id))
    .returning();

  if (!row) {
    res.status(404).json({ error: "Zahlung nicht gefunden" });
    return;
  }

  res.json({ ...row, amount: parseFloat(row.amount), matchedAutomatically: false });
});

// PATCH /api/banking/payments/:id/category — set category
router.patch("/banking/payments/:id/category", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const { category } = req.body as { category: string | null };
  if (isNaN(id)) { res.status(400).json({ error: "Ungültige ID" }); return; }
  const [row] = await db
    .update(rentPaymentsTable)
    .set({ category: category ?? undefined })
    .where(eq(rentPaymentsTable.id, id))
    .returning();
  if (!row) { res.status(404).json({ error: "Buchung nicht gefunden" }); return; }
  res.json({ ...row, amount: parseFloat(row.amount) });
});

// PATCH /api/banking/payments/:id/ignore — mark as ignored
router.patch("/banking/payments/:id/ignore", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Ungültige ID" });
    return;
  }

  const [row] = await db
    .update(rentPaymentsTable)
    .set({ matchStatus: "ignored", contractId: undefined, matchedAutomatically: 0 })
    .where(eq(rentPaymentsTable.id, id))
    .returning();

  if (!row) {
    res.status(404).json({ error: "Zahlung nicht gefunden" });
    return;
  }

  res.json({ ...row, amount: parseFloat(row.amount) });
});

export default router;
