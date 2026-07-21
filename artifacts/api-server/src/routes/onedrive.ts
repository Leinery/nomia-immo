import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db, documentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  getOneDriveUser,
  initPropertyFolders,
  uploadToOneDrive,
  buildOneDrivePath,
  getPropertyFolderName,
  categoryToFolder,
} from "../lib/onedrive";

const router: IRouter = Router();

function requireAuth(req: any, res: any, next: any) {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Nicht autorisiert" }); return; }
  next();
}

// ── GET /onedrive/status ──────────────────────────────────────────────────────
router.get("/onedrive/status", requireAuth, async (_req, res): Promise<void> => {
  try {
    const user = await getOneDriveUser();
    res.json({ connected: true, ...user });
  } catch (err: any) {
    res.json({ connected: false, error: err?.message });
  }
});

// ── POST /onedrive/setup-folders ─────────────────────────────────────────────
router.post("/onedrive/setup-folders", requireAuth, async (_req, res): Promise<void> => {
  try {
    const created = await initPropertyFolders();
    res.json({ ok: true, folders: created });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// ── POST /onedrive/sync-document/:id ─────────────────────────────────────────
// Manually push an existing document to OneDrive (or re-sync)
router.post("/onedrive/sync-document/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Ungültige ID" }); return; }

  const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, id));
  if (!doc) { res.status(404).json({ error: "Dokument nicht gefunden" }); return; }

  try {
    // Download from our storage proxy
    const fileRes = await fetch(`http://localhost:${process.env.PORT ?? 8080}${doc.fileUrl}`, {
      headers: { "x-internal-sync": "1" },
    });
    if (!fileRes.ok) throw new Error(`Storage download failed: ${fileRes.status}`);

    const buffer = Buffer.from(await fileRes.arrayBuffer());
    const filename = doc.name + (doc.mimeType === "application/pdf" ? ".pdf" : "");
    const propFolder = await getPropertyFolderName(doc.propertyId);
    const catFolder  = categoryToFolder(doc.category);
    const remotePath = buildOneDrivePath(propFolder, catFolder, filename);

    const result = await uploadToOneDrive(remotePath, buffer, doc.mimeType ?? "application/octet-stream");

    await db.update(documentsTable)
      .set({ onedrivePath: result.webUrl })
      .where(eq(documentsTable.id, id));

    res.json({ ok: true, webUrl: result.webUrl, path: remotePath });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

export default router;
