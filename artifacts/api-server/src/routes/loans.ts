import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, loansTable, propertiesTable } from "@workspace/db";

const router: IRouter = Router();

// ─── Amortization engine ──────────────────────────────────────────────────────

interface LoanParams {
  loanAmount: number;
  interestRate: number;  // annual %
  repaymentRate: number; // annual %
  startDate: string;     // YYYY-MM-DD
  fixedRateEndDate?: string | null;
}

function monthlyPaymentFor(p: LoanParams) {
  const monthlyRate = p.interestRate / 100 / 12;
  const monthlyTilgung = p.repaymentRate / 100 / 12;
  return p.loanAmount * (monthlyRate + monthlyTilgung);
}

/** Run the amortization forward month-by-month and return balance at a given date. */
function balanceAt(p: LoanParams, targetDate: Date): number {
  const payment = monthlyPaymentFor(p);
  const monthlyRate = p.interestRate / 100 / 12;
  let balance = p.loanAmount;
  const start = new Date(p.startDate);
  let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const target = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);

  while (cursor < target && balance > 0.005) {
    const interest = balance * monthlyRate;
    const repayment = Math.min(payment - interest, balance);
    balance -= repayment;
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return Math.max(balance, 0);
}

/** Build a year-by-year or month-by-month amortization schedule. */
function buildSchedule(p: LoanParams, granularity: "yearly" | "monthly" = "yearly") {
  const payment = monthlyPaymentFor(p);
  const monthlyRate = p.interestRate / 100 / 12;
  let balance = p.loanAmount;
  const start = new Date(p.startDate);
  let year = start.getFullYear();
  let month = start.getMonth() + 1; // 1-12

  type Row = {
    year: number; month?: number;
    openingBalance: number; interest: number; repayment: number;
    annuitat: number; closingBalance: number; isFixedRateEnd?: boolean;
  };

  const rows: Row[] = [];
  let yearInterest = 0, yearRepayment = 0, yearOpen = balance;
  const fixedEnd = p.fixedRateEndDate ? new Date(p.fixedRateEndDate) : null;
  let safetyLimit = 0;

  while (balance > 0.005 && safetyLimit++ < 720) {
    const interest = balance * monthlyRate;
    const repayment = Math.min(payment - interest, balance);
    const closing = balance - repayment;
    const isFixed = fixedEnd && year === fixedEnd.getFullYear() && month === fixedEnd.getMonth() + 1;

    if (granularity === "monthly") {
      rows.push({
        year, month,
        openingBalance: round2(balance),
        interest: round2(interest),
        repayment: round2(repayment),
        annuitat: round2(interest + repayment),
        closingBalance: round2(Math.max(closing, 0)),
        isFixedRateEnd: !!isFixed,
      });
    } else {
      yearInterest += interest;
      yearRepayment += repayment;
    }

    balance = Math.max(closing, 0);
    const isYearEnd = month === 12 || balance <= 0.005;

    if (granularity === "yearly" && isYearEnd) {
      const isFixedYear = fixedEnd && year === fixedEnd.getFullYear();
      rows.push({
        year,
        openingBalance: round2(yearOpen),
        interest: round2(yearInterest),
        repayment: round2(yearRepayment),
        annuitat: round2(yearInterest + yearRepayment),
        closingBalance: round2(balance),
        isFixedRateEnd: !!isFixedYear,
      });
      yearOpen = balance;
      yearInterest = 0;
      yearRepayment = 0;
    }

    month++;
    if (month > 12) { month = 1; year++; }
  }

  // Flush partial year in yearly mode
  if (granularity === "yearly" && yearInterest > 0) {
    rows.push({
      year,
      openingBalance: round2(yearOpen),
      interest: round2(yearInterest),
      repayment: round2(yearRepayment),
      annuitat: round2(yearInterest + yearRepayment),
      closingBalance: round2(balance),
      isFixedRateEnd: !!(fixedEnd && year === fixedEnd.getFullYear()),
    });
  }

  return rows;
}

function round2(n: number) { return Math.round(n * 100) / 100; }

function serializeLoan(row: typeof loansTable.$inferSelect) {
  const p: LoanParams = {
    loanAmount: parseFloat(row.loanAmount),
    interestRate: parseFloat(row.interestRate),
    repaymentRate: parseFloat(row.repaymentRate),
    startDate: row.startDate,
    fixedRateEndDate: row.fixedRateEndDate,
  };
  const monthlyPayment = round2(monthlyPaymentFor(p));
  const currentBalance = round2(balanceAt(p, new Date()));
  const monthlyRate = p.interestRate / 100 / 12;
  const monthlyInterest = round2(currentBalance * monthlyRate);
  const monthlyRepayment = round2(monthlyPayment - monthlyInterest);
  const balanceAtFixedEnd = p.fixedRateEndDate
    ? round2(balanceAt(p, new Date(p.fixedRateEndDate)))
    : null;

  return {
    ...row,
    loanAmount: p.loanAmount,
    interestRate: p.interestRate,
    repaymentRate: p.repaymentRate,
    // Computed
    monthlyPayment,
    currentBalance,
    monthlyInterest,
    monthlyRepayment,
    balanceAtFixedEnd,
  };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

router.get("/loans", async (req, res): Promise<void> => {
  const rows = await db.select().from(loansTable).orderBy(loansTable.createdAt);
  res.json(rows.map(serializeLoan));
});

router.post("/loans", async (req, res): Promise<void> => {
  const { propertyId, lenderName, loanAmount, interestRate, repaymentRate,
          startDate, fixedRateEndDate, repaymentType, notes } = req.body;
  if (!lenderName || !loanAmount || !interestRate || !repaymentRate || !startDate) {
    res.status(400).json({ error: "Pflichtfelder: lenderName, loanAmount, interestRate, repaymentRate, startDate" });
    return;
  }
  const [row] = await db.insert(loansTable).values({
    propertyId: propertyId ?? null,
    lenderName,
    loanAmount: String(loanAmount),
    interestRate: String(interestRate),
    repaymentRate: String(repaymentRate),
    startDate,
    fixedRateEndDate: fixedRateEndDate ?? null,
    repaymentType: repaymentType ?? "annuity",
    notes: notes ?? null,
  }).returning();
  res.status(201).json(serializeLoan(row));
});

router.get("/loans/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Ungültige ID" }); return; }
  const [row] = await db.select().from(loansTable).where(eq(loansTable.id, id));
  if (!row) { res.status(404).json({ error: "Kredit nicht gefunden" }); return; }
  res.json(serializeLoan(row));
});

router.patch("/loans/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Ungültige ID" }); return; }
  const { propertyId, lenderName, loanAmount, interestRate, repaymentRate,
          startDate, fixedRateEndDate, repaymentType, notes } = req.body;
  const update: Record<string, any> = {};
  if (propertyId !== undefined) update.propertyId = propertyId;
  if (lenderName)      update.lenderName = lenderName;
  if (loanAmount != null) update.loanAmount = String(loanAmount);
  if (interestRate != null) update.interestRate = String(interestRate);
  if (repaymentRate != null) update.repaymentRate = String(repaymentRate);
  if (startDate)       update.startDate = startDate;
  if (fixedRateEndDate !== undefined) update.fixedRateEndDate = fixedRateEndDate;
  if (repaymentType)   update.repaymentType = repaymentType;
  if (notes !== undefined) update.notes = notes;

  const [row] = await db.update(loansTable).set(update).where(eq(loansTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Kredit nicht gefunden" }); return; }
  res.json(serializeLoan(row));
});

router.delete("/loans/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Ungültige ID" }); return; }
  const [row] = await db.delete(loansTable).where(eq(loansTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Kredit nicht gefunden" }); return; }
  res.sendStatus(204);
});

router.get("/loans/:id/schedule", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Ungültige ID" }); return; }
  const [row] = await db.select().from(loansTable).where(eq(loansTable.id, id));
  if (!row) { res.status(404).json({ error: "Kredit nicht gefunden" }); return; }

  const granularity = req.query.view === "monthly" ? "monthly" : "yearly";
  const p: LoanParams = {
    loanAmount: parseFloat(row.loanAmount),
    interestRate: parseFloat(row.interestRate),
    repaymentRate: parseFloat(row.repaymentRate),
    startDate: row.startDate,
    fixedRateEndDate: row.fixedRateEndDate,
  };
  const schedule = buildSchedule(p, granularity);
  const monthlyPayment = round2(monthlyPaymentFor(p));
  res.json({ monthlyPayment, schedule });
});

export default router;
