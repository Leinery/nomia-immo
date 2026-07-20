import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, unitsTable } from "@workspace/db";
import {
  ListUnitsParams,
  ListUnitsResponse,
  CreateUnitParams,
  CreateUnitBody,
  CreateUnitResponse,
  GetUnitParams,
  GetUnitResponse,
  UpdateUnitParams,
  UpdateUnitBody,
  UpdateUnitResponse,
  DeleteUnitParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function serializeUnit(u: typeof unitsTable.$inferSelect) {
  return {
    ...u,
    area: u.area != null ? parseFloat(u.area) : null,
    rooms: u.rooms != null ? parseFloat(u.rooms) : null,
    monthlyRent: u.monthlyRent != null ? parseFloat(u.monthlyRent) : null,
    deposit: u.deposit != null ? parseFloat(u.deposit) : null,
  };
}

router.get("/properties/:propertyId/units", async (req, res): Promise<void> => {
  const params = ListUnitsParams.safeParse({ propertyId: req.params.propertyId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const rows = await db.select().from(unitsTable).where(eq(unitsTable.propertyId, params.data.propertyId)).orderBy(unitsTable.createdAt);
  res.json(ListUnitsResponse.parse(rows.map(serializeUnit)));
});

router.post("/properties/:propertyId/units", async (req, res): Promise<void> => {
  const params = CreateUnitParams.safeParse({ propertyId: req.params.propertyId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = CreateUnitBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db.insert(unitsTable).values({
    ...parsed.data,
    propertyId: params.data.propertyId,
    area: parsed.data.area != null ? String(parsed.data.area) : undefined,
    rooms: parsed.data.rooms != null ? String(parsed.data.rooms) : undefined,
    monthlyRent: parsed.data.monthlyRent != null ? String(parsed.data.monthlyRent) : undefined,
    deposit: parsed.data.deposit != null ? String(parsed.data.deposit) : undefined,
  }).returning();
  res.status(201).json(CreateUnitResponse.parse(serializeUnit(row)));
});

router.get("/units/:id", async (req, res): Promise<void> => {
  const params = GetUnitParams.safeParse({ id: req.params.id });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db.select().from(unitsTable).where(eq(unitsTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Unit not found" });
    return;
  }
  res.json(GetUnitResponse.parse(serializeUnit(row)));
});

router.patch("/units/:id", async (req, res): Promise<void> => {
  const params = UpdateUnitParams.safeParse({ id: req.params.id });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateUnitBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db.update(unitsTable).set({
    ...parsed.data,
    area: parsed.data.area != null ? String(parsed.data.area) : undefined,
    rooms: parsed.data.rooms != null ? String(parsed.data.rooms) : undefined,
    monthlyRent: parsed.data.monthlyRent != null ? String(parsed.data.monthlyRent) : undefined,
    deposit: parsed.data.deposit != null ? String(parsed.data.deposit) : undefined,
  }).where(eq(unitsTable.id, params.data.id)).returning();
  if (!row) {
    res.status(404).json({ error: "Unit not found" });
    return;
  }
  res.json(UpdateUnitResponse.parse(serializeUnit(row)));
});

router.delete("/units/:id", async (req, res): Promise<void> => {
  const params = DeleteUnitParams.safeParse({ id: req.params.id });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db.delete(unitsTable).where(eq(unitsTable.id, params.data.id)).returning();
  if (!row) {
    res.status(404).json({ error: "Unit not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
