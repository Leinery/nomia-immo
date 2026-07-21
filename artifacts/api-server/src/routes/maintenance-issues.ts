import { Router, type IRouter } from "express";
import { eq, desc, and } from "drizzle-orm";
import {
  db, maintenanceIssuesTable, propertiesTable, unitsTable, tenantsTable,
} from "@workspace/db";

const router: IRouter = Router();

// ─── GET /maintenance-issues?propertyId=X&status=open ────────────────────────
router.get("/maintenance-issues", async (req, res): Promise<void> => {
  const propertyId = req.query.propertyId ? parseInt(req.query.propertyId as string) : null;
  const statusFilter = req.query.status as string | undefined;

  const rows = await db
    .select({
      id:          maintenanceIssuesTable.id,
      propertyId:  maintenanceIssuesTable.propertyId,
      propertyName: propertiesTable.name,
      unitId:      maintenanceIssuesTable.unitId,
      unitName:    unitsTable.name,
      tenantId:    maintenanceIssuesTable.tenantId,
      tenantFirstName: tenantsTable.firstName,
      tenantLastName:  tenantsTable.lastName,
      title:       maintenanceIssuesTable.title,
      description: maintenanceIssuesTable.description,
      status:      maintenanceIssuesTable.status,
      priority:    maintenanceIssuesTable.priority,
      category:    maintenanceIssuesTable.category,
      reportedAt:  maintenanceIssuesTable.reportedAt,
      resolvedAt:  maintenanceIssuesTable.resolvedAt,
      createdAt:   maintenanceIssuesTable.createdAt,
    })
    .from(maintenanceIssuesTable)
    .innerJoin(propertiesTable, eq(maintenanceIssuesTable.propertyId, propertiesTable.id))
    .leftJoin(unitsTable,      eq(maintenanceIssuesTable.unitId,     unitsTable.id))
    .leftJoin(tenantsTable,    eq(maintenanceIssuesTable.tenantId,   tenantsTable.id))
    .where(
      propertyId && statusFilter
        ? and(eq(maintenanceIssuesTable.propertyId, propertyId),
              eq(maintenanceIssuesTable.status, statusFilter))
        : propertyId
          ? eq(maintenanceIssuesTable.propertyId, propertyId)
          : statusFilter
            ? eq(maintenanceIssuesTable.status, statusFilter)
            : undefined,
    )
    .orderBy(desc(maintenanceIssuesTable.createdAt));

  const result = rows.map((r) => ({
    ...r,
    tenantName: r.tenantFirstName ? `${r.tenantFirstName} ${r.tenantLastName}`.trim() : null,
  }));

  res.json(result);
});

// ─── POST /maintenance-issues ─────────────────────────────────────────────────
router.post("/maintenance-issues", async (req, res): Promise<void> => {
  const { propertyId, unitId, tenantId, title, description, status, priority, category, reportedAt } = req.body;
  if (!propertyId || !title) {
    res.status(400).json({ error: "propertyId und title sind erforderlich" });
    return;
  }

  const [row] = await db.insert(maintenanceIssuesTable).values({
    propertyId:  Number(propertyId),
    unitId:      unitId      ? Number(unitId)      : null,
    tenantId:    tenantId    ? Number(tenantId)    : null,
    title,
    description: description ?? null,
    status:      status      ?? "open",
    priority:    priority    ?? "medium",
    category:    category    ?? "other",
    reportedAt:  reportedAt  ?? new Date().toISOString().slice(0, 10),
  }).returning();

  res.status(201).json(row);
});

// ─── PATCH /maintenance-issues/:id ───────────────────────────────────────────
router.patch("/maintenance-issues/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Ungültige ID" }); return; }

  const { title, description, status, priority, category, reportedAt, resolvedAt, tenantId, unitId } = req.body;
  const update: Record<string, any> = {};
  if (title        !== undefined) update.title        = title;
  if (description  !== undefined) update.description  = description;
  if (status       !== undefined) update.status       = status;
  if (priority     !== undefined) update.priority     = priority;
  if (category     !== undefined) update.category     = category;
  if (reportedAt   !== undefined) update.reportedAt   = reportedAt;
  if (resolvedAt   !== undefined) update.resolvedAt   = resolvedAt;
  if (tenantId     !== undefined) update.tenantId     = tenantId ? Number(tenantId) : null;
  if (unitId       !== undefined) update.unitId       = unitId   ? Number(unitId)   : null;

  const [row] = await db.update(maintenanceIssuesTable).set(update).where(eq(maintenanceIssuesTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Wartungsvorgang nicht gefunden" }); return; }
  res.json(row);
});

// ─── DELETE /maintenance-issues/:id ──────────────────────────────────────────
router.delete("/maintenance-issues/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Ungültige ID" }); return; }
  await db.delete(maintenanceIssuesTable).where(eq(maintenanceIssuesTable.id, id));
  res.sendStatus(204);
});

export default router;
