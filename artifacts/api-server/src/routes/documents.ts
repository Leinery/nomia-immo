import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs";
import { db, documentsTable } from "@workspace/db";
import {
  ListDocumentsQueryParams,
  ListDocumentsResponse,
  GetDocumentParams,
  GetDocumentResponse,
  DeleteDocumentParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

// Store uploaded files in /tmp/uploads
const uploadDir = "/tmp/uploads";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e6);
    cb(null, unique + path.extname(file.originalname));
  },
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

router.get("/documents", async (req, res): Promise<void> => {
  const query = ListDocumentsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  let dbQuery = db.select().from(documentsTable).$dynamic();
  const conditions = [];
  if (query.data.propertyId) conditions.push(eq(documentsTable.propertyId, query.data.propertyId));
  if (query.data.unitId) conditions.push(eq(documentsTable.unitId, query.data.unitId));
  if (query.data.contractId) conditions.push(eq(documentsTable.contractId, query.data.contractId));
  if (conditions.length > 0) dbQuery = dbQuery.where(and(...conditions));
  const rows = await dbQuery.orderBy(documentsTable.createdAt);
  res.json(ListDocumentsResponse.parse(rows));
});

// Multipart file upload — not in OpenAPI spec, handled via custom route
router.post("/documents/upload", upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: "No file provided" });
    return;
  }
  const name = typeof req.body.name === "string" && req.body.name.trim() ? req.body.name.trim() : req.file.originalname;
  const category = typeof req.body.category === "string" ? req.body.category : null;
  const propertyId = req.body.propertyId ? parseInt(req.body.propertyId, 10) : null;
  const unitId = req.body.unitId ? parseInt(req.body.unitId, 10) : null;
  const contractId = req.body.contractId ? parseInt(req.body.contractId, 10) : null;

  const fileUrl = `/api/documents/file/${req.file.filename}`;
  const [row] = await db
    .insert(documentsTable)
    .values({
      name,
      category,
      fileUrl,
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
      propertyId,
      unitId,
      contractId,
    })
    .returning();
  res.status(201).json(row);
});

// Serve uploaded files
router.get("/documents/file/:filename", (req, res): void => {
  const filename = path.basename(req.params.filename as string);
  const filePath = path.join(uploadDir, filename);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "File not found" });
    return;
  }
  res.sendFile(filePath);
});

router.get("/documents/:id", async (req, res): Promise<void> => {
  const params = GetDocumentParams.safeParse({ id: req.params.id });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db.select().from(documentsTable).where(eq(documentsTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  res.json(GetDocumentResponse.parse(row));
});

router.delete("/documents/:id", async (req, res): Promise<void> => {
  const params = DeleteDocumentParams.safeParse({ id: req.params.id });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db.delete(documentsTable).where(eq(documentsTable.id, params.data.id)).returning();
  if (!row) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  // Try to clean up file
  if (row.fileUrl) {
    const filename = path.basename(row.fileUrl);
    const filePath = path.join(uploadDir, filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  res.sendStatus(204);
});

export default router;
