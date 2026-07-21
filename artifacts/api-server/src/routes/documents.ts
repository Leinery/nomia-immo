import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { db, documentsTable } from "@workspace/db";
import {
  ListDocumentsQueryParams,
  ListDocumentsResponse,
  GetDocumentParams,
  GetDocumentResponse,
  DeleteDocumentParams,
} from "@workspace/api-zod";
import { uploadToOneDrive, buildOneDrivePath, getPropertyFolderName, categoryToFolder } from "../lib/onedrive";

const router: IRouter = Router();

// ─── Auth helper ─────────────────────────────────────────────────────────────

function requireAuth(req: any, res: any, next: any) {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Nicht autorisiert" });
    return;
  }
  next();
}

// ─── List ─────────────────────────────────────────────────────────────────────

router.get("/documents", requireAuth, async (req, res): Promise<void> => {
  const query = ListDocumentsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  let dbQuery = db.select().from(documentsTable).$dynamic();
  const conditions = [];
  if (query.data.propertyId) conditions.push(eq(documentsTable.propertyId, query.data.propertyId));
  if (query.data.unitId)     conditions.push(eq(documentsTable.unitId, query.data.unitId));
  if (query.data.contractId) conditions.push(eq(documentsTable.contractId, query.data.contractId));
  if (conditions.length > 0) dbQuery = dbQuery.where(and(...conditions));
  const rows = await dbQuery.orderBy(documentsTable.createdAt);
  res.json(ListDocumentsResponse.parse(rows));
});

// ─── Upload (metadata only — file already uploaded to Object Storage) ─────────
//
// Flow:
//   1. Client calls POST /api/storage/uploads/request-url → gets presigned URL + objectPath
//   2. Client uploads file bytes directly to GCS via presigned URL
//   3. Client calls this endpoint with metadata + objectPath to persist the record

router.post("/documents/upload", requireAuth, async (req, res): Promise<void> => {
  const {
    name,
    category,
    objectPath,   // path returned by /api/storage/uploads/request-url
    mimeType,
    fileSize,
    propertyId,
    unitId,
    contractId,
  } = req.body as {
    name?: string;
    category?: string;
    objectPath: string;
    mimeType?: string;
    fileSize?: number;
    propertyId?: number;
    unitId?: number;
    contractId?: number;
  };

  if (!objectPath) {
    res.status(400).json({ error: "objectPath ist erforderlich" });
    return;
  }

  // fileUrl points to our serving endpoint  (/api/storage + objectPath)
  const fileUrl = `/api/storage${objectPath}`;

  const [row] = await db
    .insert(documentsTable)
    .values({
      name: name || "Dokument",
      category: category ?? null,
      fileUrl,
      mimeType: mimeType ?? null,
      fileSize: fileSize ?? null,
      propertyId: propertyId ?? null,
      unitId: unitId ?? null,
      contractId: contractId ?? null,
    })
    .returning();

  res.status(201).json(row);

  // ── Async OneDrive push (non-blocking) ─────────────────────────────────────
  (async () => {
    try {
      const fileRes = await fetch(`http://localhost:${process.env.PORT ?? 8080}${fileUrl}`);
      if (!fileRes.ok) return;
      const buffer = Buffer.from(await fileRes.arrayBuffer());
      const propFolder = await getPropertyFolderName(propertyId);
      const catFolder  = categoryToFolder(category);
      const filename   = (name || "Dokument") + (mimeType === "application/pdf" ? ".pdf" : "");
      const remotePath = buildOneDrivePath(propFolder, catFolder, filename);
      const result     = await uploadToOneDrive(remotePath, buffer, mimeType ?? "application/octet-stream");
      await db.update(documentsTable).set({ onedrivePath: result.webUrl }).where(eq(documentsTable.id, row.id));
    } catch (err) {
      console.error("[OneDrive] Upload fehlgeschlagen:", err);
    }
  })();
});

// ─── Get one ─────────────────────────────────────────────────────────────────

router.get("/documents/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetDocumentParams.safeParse({ id: req.params.id });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db.select().from(documentsTable).where(eq(documentsTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Dokument nicht gefunden" });
    return;
  }
  res.json(GetDocumentResponse.parse(row));
});

// ─── Delete ──────────────────────────────────────────────────────────────────

router.delete("/documents/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteDocumentParams.safeParse({ id: req.params.id });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db.delete(documentsTable).where(eq(documentsTable.id, params.data.id)).returning();
  if (!row) {
    res.status(404).json({ error: "Dokument nicht gefunden" });
    return;
  }
  res.sendStatus(204);
});

export default router;
