import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, utilityStatementsTable } from "@workspace/db";
import {
  ListUtilityStatementsQueryParams,
  ListUtilityStatementsResponse,
  CreateUtilityStatementBody,
  CreateUtilityStatementResponse,
  GetUtilityStatementParams,
  GetUtilityStatementResponse,
  DeleteUtilityStatementParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function serializeStatement(s: typeof utilityStatementsTable.$inferSelect) {
  return {
    ...s,
    totalCosts: parseFloat(s.totalCosts),
    tenantShare: parseFloat(s.tenantShare),
    advancePayments: parseFloat(s.advancePayments),
    balance: parseFloat(s.balance),
  };
}

router.get("/utility-statements", async (req, res): Promise<void> => {
  const query = ListUtilityStatementsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  let dbQuery = db.select().from(utilityStatementsTable).$dynamic();
  const conditions = [];
  if (query.data.unitId) conditions.push(eq(utilityStatementsTable.unitId, query.data.unitId));
  if (query.data.year) conditions.push(eq(utilityStatementsTable.year, query.data.year));
  if (conditions.length > 0) dbQuery = dbQuery.where(and(...conditions));
  const rows = await dbQuery.orderBy(utilityStatementsTable.year);
  res.json(ListUtilityStatementsResponse.parse(rows.map(serializeStatement)));
});

router.post("/utility-statements", async (req, res): Promise<void> => {
  const parsed = CreateUtilityStatementBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const balance = parsed.data.tenantShare - parsed.data.advancePayments;
  const [row] = await db.insert(utilityStatementsTable).values({
    ...parsed.data,
    totalCosts: String(parsed.data.totalCosts),
    tenantShare: String(parsed.data.tenantShare),
    advancePayments: String(parsed.data.advancePayments),
    balance: String(balance),
  }).returning();
  res.status(201).json(CreateUtilityStatementResponse.parse(serializeStatement(row)));
});

router.get("/utility-statements/:id", async (req, res): Promise<void> => {
  const params = GetUtilityStatementParams.safeParse({ id: req.params.id });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db.select().from(utilityStatementsTable).where(eq(utilityStatementsTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Utility statement not found" });
    return;
  }
  res.json(GetUtilityStatementResponse.parse(serializeStatement(row)));
});

router.delete("/utility-statements/:id", async (req, res): Promise<void> => {
  const params = DeleteUtilityStatementParams.safeParse({ id: req.params.id });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db.delete(utilityStatementsTable).where(eq(utilityStatementsTable.id, params.data.id)).returning();
  if (!row) {
    res.status(404).json({ error: "Utility statement not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
