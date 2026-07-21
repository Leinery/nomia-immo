import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, loansTable } from "@workspace/db";

const router: IRouter = Router();

// ─── Amortization engine ──────────────────────────────────────────────────────

interface LoanParams {
  loanAmount: number;
  interestRate: number;
  repaymentRate: number;
  startDate: string;
  fixedRateEndDate?: string | null;
  annualSondertilgung?: number | null;
}

function monthlyPaymentFor(p: LoanParams) {
  return p.loanAmount * (p.interestRate / 100 / 12 + p.repaymentRate / 100 / 12);
}

function balanceAt(p: LoanParams, targetDate: Date): number {
  const payment = monthlyPaymentFor(p);
  const r = p.interestRate / 100 / 12;
  let balance = p.loanAmount;
  const start = new Date(p.startDate);
  let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const target = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
  while (cursor < target && balance > 0.005) {
    balance -= Math.min(payment - balance * r, balance);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return Math.max(balance, 0);
}

function buildSchedule(p: LoanParams, granularity: "yearly" | "monthly" = "yearly", withSondertilgung = false) {
  const payment = monthlyPaymentFor(p);
  const r = p.interestRate / 100 / 12;
  let balance = p.loanAmount;
  const start = new Date(p.startDate);
  let year = start.getFullYear();
  let month = start.getMonth() + 1;

  type Row = {
    year: number; month?: number;
    openingBalance: number; interest: number; repayment: number;
    sondertilgung?: number; annuitat: number; closingBalance: number;
    isFixedRateEnd?: boolean;
  };

  const rows: Row[] = [];
  let yearInterest = 0, yearRepayment = 0, yearSonder = 0, yearOpen = balance;
  const fixedEnd = p.fixedRateEndDate ? new Date(p.fixedRateEndDate) : null;
  let safetyLimit = 0;

  while (balance > 0.005 && safetyLimit++ < 720) {
    const interest = balance * r;
    const repayment = Math.min(payment - interest, balance);
    const closing = Math.max(balance - repayment, 0);
    const isFixed = fixedEnd && year === fixedEnd.getFullYear() && month === fixedEnd.getMonth() + 1;

    if (granularity === "monthly") {
      rows.push({
        year, month,
        openingBalance: round2(balance),
        interest: round2(interest),
        repayment: round2(repayment),
        annuitat: round2(interest + repayment),
        closingBalance: round2(closing),
        isFixedRateEnd: !!isFixed,
      });
    } else {
      yearInterest += interest;
      yearRepayment += repayment;
    }

    balance = closing;
    const isYearEnd = month === 12 || balance <= 0.005;

    // Apply Sondertilgung at year-end
    let sonder = 0;
    if (withSondertilgung && isYearEnd && p.annualSondertilgung && p.annualSondertilgung > 0) {
      sonder = Math.min(p.annualSondertilgung, balance);
      balance = Math.max(balance - sonder, 0);
      yearSonder += sonder;
    }

    if (granularity === "yearly" && isYearEnd) {
      const isFixedYear = fixedEnd && year === fixedEnd.getFullYear();
      rows.push({
        year,
        openingBalance: round2(yearOpen),
        interest: round2(yearInterest),
        repayment: round2(yearRepayment),
        ...(withSondertilgung ? { sondertilgung: round2(yearSonder) } : {}),
        annuitat: round2(yearInterest + yearRepayment + yearSonder),
        closingBalance: round2(balance),
        isFixedRateEnd: !!isFixedYear,
      });
      yearOpen = balance;
      yearInterest = 0; yearRepayment = 0; yearSonder = 0;
    }

    month++;
    if (month > 12) { month = 1; year++; }
  }

  // Flush partial year (yearly granularity)
  if (granularity === "yearly" && yearInterest > 0) {
    rows.push({
      year,
      openingBalance: round2(yearOpen),
      interest: round2(yearInterest),
      repayment: round2(yearRepayment),
      ...(withSondertilgung ? { sondertilgung: round2(yearSonder) } : {}),
      annuitat: round2(yearInterest + yearRepayment + yearSonder),
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
    annualSondertilgung: row.annualSondertilgung ? parseFloat(row.annualSondertilgung) : null,
  };
  const r = p.interestRate / 100 / 12;
  const monthlyPayment = round2(monthlyPaymentFor(p));

  // Use override if set, otherwise compute
  const computedBalance = round2(balanceAt(p, new Date()));
  const currentBalance = row.currentBalanceOverride
    ? round2(parseFloat(row.currentBalanceOverride))
    : computedBalance;

  const monthlyInterest = round2(currentBalance * r);
  const monthlyRepayment = round2(monthlyPayment - monthlyInterest);
  const balanceAtFixedEnd = p.fixedRateEndDate
    ? round2(balanceAt(p, new Date(p.fixedRateEndDate)))
    : null;

  // Sondertilgung
  const annualSondertilgung = p.annualSondertilgung ?? null;
  const sondertilgungUsedThisYear = row.sondertilgungUsedThisYear
    ? round2(parseFloat(row.sondertilgungUsedThisYear))
    : 0;
  const freeSondertilgung = annualSondertilgung != null
    ? round2(annualSondertilgung - sondertilgungUsedThisYear)
    : null;

  return {
    ...row,
    loanAmount: p.loanAmount,
    interestRate: p.interestRate,
    repaymentRate: p.repaymentRate,
    annualSondertilgung,
    sondertilgungUsedThisYear,
    currentBalanceOverride: row.currentBalanceOverride ? parseFloat(row.currentBalanceOverride) : null,
    // Computed
    monthlyPayment,
    currentBalance,
    monthlyInterest,
    monthlyRepayment,
    balanceAtFixedEnd,
    freeSondertilgung,
  };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

router.get("/loans", async (_req, res): Promise<void> => {
  const rows = await db.select().from(loansTable).orderBy(loansTable.createdAt);
  res.json(rows.map(serializeLoan));
});

router.post("/loans", async (req, res): Promise<void> => {
  const {
    propertyId, lenderName, loanAmount, interestRate, repaymentRate,
    startDate, fixedRateEndDate, repaymentType, notes,
    loanIban, loanBic, debitAccountIban, accountHolder,
    annualSondertilgung, sondertilgungUsedThisYear, currentBalanceOverride,
  } = req.body;
  if (!lenderName || !loanAmount || !interestRate || !repaymentRate || !startDate) {
    res.status(400).json({ error: "Pflichtfelder fehlen" }); return;
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
    loanIban: loanIban ?? null,
    loanBic: loanBic ?? null,
    debitAccountIban: debitAccountIban ?? null,
    accountHolder: accountHolder ?? null,
    annualSondertilgung: annualSondertilgung != null ? String(annualSondertilgung) : null,
    sondertilgungUsedThisYear: sondertilgungUsedThisYear != null ? String(sondertilgungUsedThisYear) : "0",
    currentBalanceOverride: currentBalanceOverride != null ? String(currentBalanceOverride) : null,
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
  const {
    propertyId, lenderName, loanAmount, interestRate, repaymentRate,
    startDate, fixedRateEndDate, repaymentType, notes,
    loanIban, loanBic, debitAccountIban, accountHolder,
    annualSondertilgung, sondertilgungUsedThisYear, currentBalanceOverride,
  } = req.body;
  const update: Record<string, any> = {};
  if (propertyId !== undefined)            update.propertyId = propertyId;
  if (lenderName)                          update.lenderName = lenderName;
  if (loanAmount != null)                  update.loanAmount = String(loanAmount);
  if (interestRate != null)                update.interestRate = String(interestRate);
  if (repaymentRate != null)               update.repaymentRate = String(repaymentRate);
  if (startDate)                           update.startDate = startDate;
  if (fixedRateEndDate !== undefined)      update.fixedRateEndDate = fixedRateEndDate;
  if (repaymentType)                       update.repaymentType = repaymentType;
  if (notes !== undefined)                 update.notes = notes;
  if (loanIban !== undefined)              update.loanIban = loanIban;
  if (loanBic !== undefined)               update.loanBic = loanBic;
  if (debitAccountIban !== undefined)      update.debitAccountIban = debitAccountIban;
  if (accountHolder !== undefined)         update.accountHolder = accountHolder;
  if (annualSondertilgung !== undefined)   update.annualSondertilgung = annualSondertilgung != null ? String(annualSondertilgung) : null;
  if (sondertilgungUsedThisYear !== undefined) update.sondertilgungUsedThisYear = String(sondertilgungUsedThisYear ?? 0);
  if (currentBalanceOverride !== undefined) update.currentBalanceOverride = currentBalanceOverride != null ? String(currentBalanceOverride) : null;

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
  const withSonder = req.query.sondertilgung === "true";
  const p: LoanParams = {
    loanAmount: parseFloat(row.loanAmount),
    interestRate: parseFloat(row.interestRate),
    repaymentRate: parseFloat(row.repaymentRate),
    startDate: row.startDate,
    fixedRateEndDate: row.fixedRateEndDate,
    annualSondertilgung: row.annualSondertilgung ? parseFloat(row.annualSondertilgung) : null,
  };
  res.json({
    monthlyPayment: round2(monthlyPaymentFor(p)),
    schedule: buildSchedule(p, granularity, withSonder),
  });
});

export default router;
