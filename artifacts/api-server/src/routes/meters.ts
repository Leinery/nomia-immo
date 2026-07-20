import { Router, type IRouter } from "express";
import { eq, desc, inArray } from "drizzle-orm";
import { db, metersTable, meterReadingsTable } from "@workspace/db";

const router: IRouter = Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function serializeMeter(m: typeof metersTable.$inferSelect) {
  return m;
}

function serializeReading(r: typeof meterReadingsTable.$inferSelect) {
  return {
    ...r,
    readingValue: parseFloat(r.readingValue),
  };
}

// ─── Meters ──────────────────────────────────────────────────────────────────

// GET /api/properties/:propertyId/meters — list all meters for a property (with latest reading)
router.get("/properties/:propertyId/meters", async (req, res): Promise<void> => {
  const propertyId = parseInt(req.params.propertyId, 10);
  if (isNaN(propertyId)) { res.status(400).json({ error: "Ungültige propertyId" }); return; }

  const meters = await db
    .select()
    .from(metersTable)
    .where(eq(metersTable.propertyId, propertyId))
    .orderBy(metersTable.unitId, metersTable.meterType, metersTable.name);

  // Fetch latest reading per meter
  const meterIds = meters.map((m) => m.id);
  const allReadings = meterIds.length
    ? await db
        .select()
        .from(meterReadingsTable)
        .where(inArray(meterReadingsTable.meterId, meterIds))
        .orderBy(desc(meterReadingsTable.readingDate))
    : [];

  // Keep only the latest reading per meter
  const latestByMeter = new Map<number, typeof meterReadingsTable.$inferSelect>();
  for (const r of allReadings) {
    if (!latestByMeter.has(r.meterId)) latestByMeter.set(r.meterId, r);
  }

  res.json(
    meters.map((m) => {
      const latest = latestByMeter.get(m.id);
      return {
        ...serializeMeter(m),
        latestReading: latest ? serializeReading(latest) : null,
      };
    })
  );
});

// POST /api/properties/:propertyId/meters — create a meter
router.post("/properties/:propertyId/meters", async (req, res): Promise<void> => {
  const propertyId = parseInt(req.params.propertyId, 10);
  if (isNaN(propertyId)) { res.status(400).json({ error: "Ungültige propertyId" }); return; }

  const { unitId, name, meterNumber, meterType, unitOfMeasure, distributionKey, location } = req.body as {
    unitId?: number | null;
    name: string;
    meterNumber?: string;
    meterType: string;
    unitOfMeasure?: string;
    distributionKey?: string;
    location?: string;
  };

  if (!name || !meterType) {
    res.status(400).json({ error: "name und meterType sind Pflichtfelder" });
    return;
  }

  const [row] = await db.insert(metersTable).values({
    propertyId,
    unitId: unitId ?? null,
    name,
    meterNumber: meterNumber ?? null,
    meterType,
    unitOfMeasure: unitOfMeasure ?? "kWh",
    distributionKey: distributionKey ?? "direct",
    location: location ?? null,
  }).returning();

  res.status(201).json(serializeMeter(row));
});

// PATCH /api/meters/:id — update a meter
router.patch("/meters/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Ungültige ID" }); return; }

  const { name, meterNumber, meterType, unitOfMeasure, distributionKey, location } = req.body as Partial<typeof metersTable.$inferInsert>;

  const [row] = await db
    .update(metersTable)
    .set({ name, meterNumber, meterType, unitOfMeasure, distributionKey, location })
    .where(eq(metersTable.id, id))
    .returning();

  if (!row) { res.status(404).json({ error: "Zähler nicht gefunden" }); return; }
  res.json(serializeMeter(row));
});

// DELETE /api/meters/:id
router.delete("/meters/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Ungültige ID" }); return; }

  const [row] = await db.delete(metersTable).where(eq(metersTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Zähler nicht gefunden" }); return; }
  res.sendStatus(204);
});

// ─── Meter Readings ───────────────────────────────────────────────────────────

// GET /api/meters/:meterId/readings
router.get("/meters/:meterId/readings", async (req, res): Promise<void> => {
  const meterId = parseInt(req.params.meterId, 10);
  if (isNaN(meterId)) { res.status(400).json({ error: "Ungültige meterId" }); return; }

  const readings = await db
    .select()
    .from(meterReadingsTable)
    .where(eq(meterReadingsTable.meterId, meterId))
    .orderBy(desc(meterReadingsTable.readingDate));

  res.json(readings.map(serializeReading));
});

// POST /api/meters/:meterId/readings — add a reading
router.post("/meters/:meterId/readings", async (req, res): Promise<void> => {
  const meterId = parseInt(req.params.meterId, 10);
  if (isNaN(meterId)) { res.status(400).json({ error: "Ungültige meterId" }); return; }

  const { readingDate, readingValue, readingType, notes } = req.body as {
    readingDate: string;
    readingValue: number;
    readingType?: string;
    notes?: string;
  };

  if (!readingDate || readingValue == null) {
    res.status(400).json({ error: "readingDate und readingValue sind Pflichtfelder" });
    return;
  }

  const [row] = await db.insert(meterReadingsTable).values({
    meterId,
    readingDate,
    readingValue: String(readingValue),
    readingType: readingType ?? "annual",
    notes: notes ?? null,
  }).returning();

  res.status(201).json(serializeReading(row));
});

// DELETE /api/meter-readings/:id
router.delete("/meter-readings/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Ungültige ID" }); return; }

  const [row] = await db.delete(meterReadingsTable).where(eq(meterReadingsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Ablesung nicht gefunden" }); return; }
  res.sendStatus(204);
});

export default router;
