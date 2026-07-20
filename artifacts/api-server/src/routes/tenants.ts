import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, tenantsTable } from "@workspace/db";
import {
  ListTenantsResponse,
  CreateTenantBody,
  CreateTenantResponse,
  GetTenantParams,
  GetTenantResponse,
  UpdateTenantParams,
  UpdateTenantBody,
  UpdateTenantResponse,
  DeleteTenantParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/tenants", async (_req, res): Promise<void> => {
  const rows = await db.select().from(tenantsTable).orderBy(tenantsTable.lastName);
  res.json(ListTenantsResponse.parse(rows));
});

router.post("/tenants", async (req, res): Promise<void> => {
  const parsed = CreateTenantBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db.insert(tenantsTable).values({
    ...parsed.data,
    dateOfBirth: parsed.data.dateOfBirth != null
      ? (parsed.data.dateOfBirth as unknown as Date).toISOString?.().split("T")[0] ?? String(parsed.data.dateOfBirth)
      : undefined,
  }).returning();
  res.status(201).json(CreateTenantResponse.parse(row));
});

router.get("/tenants/:id", async (req, res): Promise<void> => {
  const params = GetTenantParams.safeParse({ id: req.params.id });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }
  res.json(GetTenantResponse.parse(row));
});

router.patch("/tenants/:id", async (req, res): Promise<void> => {
  const params = UpdateTenantParams.safeParse({ id: req.params.id });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateTenantBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db.update(tenantsTable).set({
    ...parsed.data,
    dateOfBirth: parsed.data.dateOfBirth != null
      ? (parsed.data.dateOfBirth as unknown as Date).toISOString?.().split("T")[0] ?? String(parsed.data.dateOfBirth)
      : undefined,
  }).where(eq(tenantsTable.id, params.data.id)).returning();
  if (!row) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }
  res.json(UpdateTenantResponse.parse(row));
});

router.delete("/tenants/:id", async (req, res): Promise<void> => {
  const params = DeleteTenantParams.safeParse({ id: req.params.id });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db.delete(tenantsTable).where(eq(tenantsTable.id, params.data.id)).returning();
  if (!row) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
