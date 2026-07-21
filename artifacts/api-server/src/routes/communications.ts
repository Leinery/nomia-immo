import { Router, type IRouter } from "express";
import { eq, desc, and } from "drizzle-orm";
import {
  db, communicationsTable, tenantsTable, contractsTable,
} from "@workspace/db";
import { sendMail, isSmtpConfigured } from "../lib/mailer";

const router: IRouter = Router();

// ─── GET /communications?tenantId=X ──────────────────────────────────────────
router.get("/communications", async (req, res): Promise<void> => {
  const tenantId = req.query.tenantId ? parseInt(req.query.tenantId as string) : null;

  let query = db
    .select()
    .from(communicationsTable)
    .orderBy(desc(communicationsTable.createdAt));

  const rows = tenantId
    ? await db.select().from(communicationsTable)
        .where(eq(communicationsTable.tenantId, tenantId))
        .orderBy(desc(communicationsTable.createdAt))
    : await query;

  res.json(rows);
});

// ─── POST /communications — manual log (letter, note, incoming email, …) ──────
router.post("/communications", async (req, res): Promise<void> => {
  const {
    tenantId, contractId, channel, direction = "outbound",
    subject, body, status = "sent", trackingNumber,
    mahnungLevel, relatedType, relatedId,
  } = req.body;

  if (!tenantId || !channel || body == null) {
    res.status(400).json({ error: "tenantId, channel und body sind erforderlich" });
    return;
  }

  const [row] = await db.insert(communicationsTable).values({
    tenantId:     Number(tenantId),
    contractId:   contractId ? Number(contractId) : null,
    channel,
    direction,
    subject:      subject ?? null,
    body:         String(body),
    status,
    sentAt:       status === "sent" ? new Date() : null,
    trackingNumber: trackingNumber ?? null,
    mahnungLevel: mahnungLevel ? Number(mahnungLevel) : null,
    relatedType:  relatedType ?? null,
    relatedId:    relatedId ? Number(relatedId) : null,
  }).returning();

  res.status(201).json(row);
});

// ─── POST /communications/send-email — send via SMTP + log ───────────────────
router.post("/communications/send-email", async (req, res): Promise<void> => {
  const {
    tenantId, contractId, toEmail, subject, body,
    mahnungLevel, relatedType, relatedId,
  } = req.body;

  if (!tenantId || !toEmail || !subject || !body) {
    res.status(400).json({ error: "tenantId, toEmail, subject und body sind erforderlich" });
    return;
  }

  if (!isSmtpConfigured()) {
    res.status(503).json({
      error: "SMTP nicht konfiguriert",
      hint: "Bitte SMTP_HOST, SMTP_USER, SMTP_PASS und optional SMTP_PORT / SMTP_FROM_EMAIL als Replit Secrets setzen.",
    });
    return;
  }

  let messageId: string;
  try {
    const result = await sendMail({ to: toEmail, subject, text: body });
    messageId = result.messageId;
  } catch (err: any) {
    res.status(500).json({ error: "E-Mail konnte nicht gesendet werden", detail: err.message });
    return;
  }

  const [row] = await db.insert(communicationsTable).values({
    tenantId:     Number(tenantId),
    contractId:   contractId ? Number(contractId) : null,
    channel:      "email_out",
    direction:    "outbound",
    subject,
    body:         String(body),
    status:       "sent",
    sentAt:       new Date(),
    trackingNumber: messageId,
    mahnungLevel: mahnungLevel ? Number(mahnungLevel) : null,
    relatedType:  relatedType ?? null,
    relatedId:    relatedId ? Number(relatedId) : null,
  }).returning();

  res.status(201).json({ ...row, messageId });
});

// ─── POST /communications/smtp-status — check if SMTP is configured ───────────
router.get("/communications/smtp-status", async (_req, res): Promise<void> => {
  res.json({ configured: isSmtpConfigured() });
});

// ─── PATCH /communications/:id ────────────────────────────────────────────────
router.patch("/communications/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Ungültige ID" }); return; }

  const { status, trackingNumber, body, subject } = req.body;
  const update: Record<string, any> = {};
  if (status !== undefined)         update.status         = status;
  if (trackingNumber !== undefined) update.trackingNumber = trackingNumber;
  if (body !== undefined)           update.body           = body;
  if (subject !== undefined)        update.subject        = subject;

  const [row] = await db.update(communicationsTable)
    .set(update)
    .where(eq(communicationsTable.id, id))
    .returning();
  if (!row) { res.status(404).json({ error: "Kommunikation nicht gefunden" }); return; }
  res.json(row);
});

// ─── DELETE /communications/:id ───────────────────────────────────────────────
router.delete("/communications/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Ungültige ID" }); return; }
  await db.delete(communicationsTable).where(eq(communicationsTable.id, id));
  res.sendStatus(204);
});

export default router;
