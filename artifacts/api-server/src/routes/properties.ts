import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, propertiesTable } from "@workspace/db";
import {
  ListPropertiesResponse,
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

router.get("/properties", async (_req, res): Promise<void> => {
  const rows = await db.select().from(propertiesTable).orderBy(propertiesTable.createdAt);
  res.json(ListPropertiesResponse.parse(rows.map(serializeProperty)));
});

router.post("/properties", async (req, res): Promise<void> => {
  const parsed = CreatePropertyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db.insert(propertiesTable).values({
    ...parsed.data,
    purchasePrice: parsed.data.purchasePrice != null ? String(parsed.data.purchasePrice) : undefined,
  }).returning();
  res.status(201).json(CreatePropertyResponse.parse(serializeProperty(row)));
});

router.get("/properties/:id", async (req, res): Promise<void> => {
  const params = GetPropertyParams.safeParse({ id: req.params.id });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db.select().from(propertiesTable).where(eq(propertiesTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Property not found" });
    return;
  }
  res.json(GetPropertyResponse.parse(serializeProperty(row)));
});

router.patch("/properties/:id", async (req, res): Promise<void> => {
  const params = UpdatePropertyParams.safeParse({ id: req.params.id });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdatePropertyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db.update(propertiesTable).set({
    ...parsed.data,
    purchasePrice: parsed.data.purchasePrice != null ? String(parsed.data.purchasePrice) : undefined,
  }).where(eq(propertiesTable.id, params.data.id)).returning();
  if (!row) {
    res.status(404).json({ error: "Property not found" });
    return;
  }
  res.json(UpdatePropertyResponse.parse(serializeProperty(row)));
});

router.delete("/properties/:id", async (req, res): Promise<void> => {
  const params = DeletePropertyParams.safeParse({ id: req.params.id });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db.delete(propertiesTable).where(eq(propertiesTable.id, params.data.id)).returning();
  if (!row) {
    res.status(404).json({ error: "Property not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
