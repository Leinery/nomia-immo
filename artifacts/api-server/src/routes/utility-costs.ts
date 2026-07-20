import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, utilityCostsTable } from "@workspace/db";
import {
  ListUtilityCostsQueryParams,
  ListUtilityCostsResponse,
  CreateUtilityCostBody,
  CreateUtilityCostResponse,
  UpdateUtilityCostParams,
  UpdateUtilityCostBody,
  UpdateUtilityCostResponse,
  DeleteUtilityCostParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function serializeUtilityCost(u: typeof utilityCostsTable.$inferSelect) {
  return {
    ...u,
    amount: parseFloat(u.amount),
  };
}

router.get("/utility-costs", async (req, res): Promise<void> => {
  const query = ListUtilityCostsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  let dbQuery = db.select().from(utilityCostsTable).$dynamic();
  const conditions = [];
  if (query.data.propertyId) conditions.push(eq(utilityCostsTable.propertyId, query.data.propertyId));
  if (query.data.year) conditions.push(eq(utilityCostsTable.year, query.data.year));
  if (conditions.length > 0) dbQuery = dbQuery.where(and(...conditions));
  const rows = await dbQuery.orderBy(utilityCostsTable.year, utilityCostsTable.month);
  res.json(ListUtilityCostsResponse.parse(rows.map(serializeUtilityCost)));
});

router.post("/utility-costs", async (req, res): Promise<void> => {
  const parsed = CreateUtilityCostBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db.insert(utilityCostsTable).values({
    ...parsed.data,
    amount: String(parsed.data.amount),
  }).returning();
  res.status(201).json(CreateUtilityCostResponse.parse(serializeUtilityCost(row)));
});

router.patch("/utility-costs/:id", async (req, res): Promise<void> => {
  const params = UpdateUtilityCostParams.safeParse({ id: req.params.id });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateUtilityCostBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db.update(utilityCostsTable).set({
    ...parsed.data,
    amount: parsed.data.amount != null ? String(parsed.data.amount) : undefined,
  }).where(eq(utilityCostsTable.id, params.data.id)).returning();
  if (!row) {
    res.status(404).json({ error: "Utility cost not found" });
    return;
  }
  res.json(UpdateUtilityCostResponse.parse(serializeUtilityCost(row)));
});

router.delete("/utility-costs/:id", async (req, res): Promise<void> => {
  const params = DeleteUtilityCostParams.safeParse({ id: req.params.id });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db.delete(utilityCostsTable).where(eq(utilityCostsTable.id, params.data.id)).returning();
  if (!row) {
    res.status(404).json({ error: "Utility cost not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
