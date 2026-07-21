import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, contractsTable } from "@workspace/db";
import {
  ListContractsQueryParams,
  ListContractsResponse,
  CreateContractBody,
  CreateContractResponse,
  GetContractParams,
  GetContractResponse,
  UpdateContractParams,
  UpdateContractBody,
  UpdateContractResponse,
  DeleteContractParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function serializeContract(c: typeof contractsTable.$inferSelect) {
  return {
    ...c,
    monthlyRent: parseFloat(c.monthlyRent),
    nebenkostenvorauszahlung: parseFloat(c.nebenkostenvorauszahlung ?? "0"),
    deposit: c.deposit != null ? parseFloat(c.deposit) : null,
  };
}

const toDateStr = (d: Date | string | undefined) =>
  d instanceof Date ? d.toISOString().split("T")[0] : d;

router.get("/contracts", async (req, res): Promise<void> => {
  const query = ListContractsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  let dbQuery = db.select().from(contractsTable).$dynamic();
  const conditions = [];
  if (query.data.unitId)   conditions.push(eq(contractsTable.unitId, query.data.unitId));
  if (query.data.tenantId) conditions.push(eq(contractsTable.tenantId, query.data.tenantId));
  if (query.data.status)   conditions.push(eq(contractsTable.status, query.data.status));
  if (conditions.length > 0) dbQuery = dbQuery.where(and(...conditions));

  const rows = await dbQuery.orderBy(contractsTable.createdAt);
  res.json(ListContractsResponse.parse(rows.map(serializeContract)));
});

router.post("/contracts", async (req, res): Promise<void> => {
  const parsed = CreateContractBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db.insert(contractsTable).values({
    ...parsed.data,
    startDate: toDateStr(parsed.data.startDate) as string,
    endDate:   parsed.data.endDate ? toDateStr(parsed.data.endDate) : undefined,
    monthlyRent: String(parsed.data.monthlyRent),
    nebenkostenvorauszahlung: String(parsed.data.nebenkostenvorauszahlung ?? 0),
    deposit: parsed.data.deposit != null ? String(parsed.data.deposit) : undefined,
  }).returning();
  res.status(201).json(CreateContractResponse.parse(serializeContract(row)));
});

router.get("/contracts/:id", async (req, res): Promise<void> => {
  const params = GetContractParams.safeParse({ id: req.params.id });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db.select().from(contractsTable).where(eq(contractsTable.id, params.data.id));
  if (!row) { res.status(404).json({ error: "Vertrag nicht gefunden" }); return; }
  res.json(GetContractResponse.parse(serializeContract(row)));
});

router.patch("/contracts/:id", async (req, res): Promise<void> => {
  const params = UpdateContractParams.safeParse({ id: req.params.id });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateContractBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db.update(contractsTable).set({
    ...parsed.data,
    startDate: parsed.data.startDate ? toDateStr(parsed.data.startDate) : undefined,
    endDate:   parsed.data.endDate   ? toDateStr(parsed.data.endDate)   : undefined,
    monthlyRent: parsed.data.monthlyRent != null ? String(parsed.data.monthlyRent) : undefined,
    nebenkostenvorauszahlung: parsed.data.nebenkostenvorauszahlung != null
      ? String(parsed.data.nebenkostenvorauszahlung)
      : undefined,
    deposit: parsed.data.deposit != null ? String(parsed.data.deposit) : undefined,
  }).where(eq(contractsTable.id, params.data.id)).returning();
  if (!row) { res.status(404).json({ error: "Vertrag nicht gefunden" }); return; }
  res.json(UpdateContractResponse.parse(serializeContract(row)));
});

router.delete("/contracts/:id", async (req, res): Promise<void> => {
  const params = DeleteContractParams.safeParse({ id: req.params.id });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db.delete(contractsTable).where(eq(contractsTable.id, params.data.id)).returning();
  if (!row) { res.status(404).json({ error: "Vertrag nicht gefunden" }); return; }
  res.sendStatus(204);
});

export default router;
