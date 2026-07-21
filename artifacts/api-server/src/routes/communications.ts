import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import {
  db, communicationsTable, tenantsTable,
} from "@workspace/db";
import { sendMail, isSmtpConfigured } from "../lib/mailer";
import { isPingenConfigured, getPingenSenderConfig, sendLetterViaPingen, type DeliveryProduct } from "../lib/pingen";
import { generateLetterPdf } from "../lib/letter-pdf";

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

// ─── GET /communications/pingen-status ────────────────────────────────────────
router.get("/communications/pingen-status", (_req, res): void => {
  const configured = isPingenConfigured();
  const sender     = configured ? getPingenSenderConfig() : null;
  res.json({ configured, sender });
});

// ─── POST /communications/send-letter — send physical letter via Pingen ───────
router.post("/communications/send-letter", async (req, res): Promise<void> => {
  const {
    tenantId, contractId,
    subject, body,
    // Recipient (can override tenant address)
    recipientName, addressLine1, zip, city, country = "DE",
    deliveryProduct = "economy",
  } = req.body as {
    tenantId:        number;
    contractId?:     number;
    subject:         string;
    body:            string;
    recipientName:   string;
    addressLine1:    string;
    zip:             string;
    city:            string;
    country?:        string;
    deliveryProduct?: DeliveryProduct;
  };

  if (!tenantId || !subject || !body || !recipientName || !addressLine1 || !zip || !city) {
    res.status(400).json({ error: "tenantId, subject, body, recipientName, addressLine1, zip und city sind erforderlich" });
    return;
  }

  if (!isPingenConfigured()) {
    res.status(503).json({
      error: "Pingen nicht konfiguriert",
      hint:  "Bitte PINGEN_CLIENT_ID, PINGEN_CLIENT_SECRET und PINGEN_ORGANISATION_ID als Replit Secrets setzen.",
    });
    return;
  }

  const sender = getPingenSenderConfig();
  let pdfBuffer: Buffer;

  try {
    pdfBuffer = await generateLetterPdf({
      sender,
      recipientName,
      addressLine1,
      zip,
      city,
      country,
      subject,
      body,
    });
  } catch (err: any) {
    res.status(500).json({ error: "PDF-Generierung fehlgeschlagen", detail: err.message });
    return;
  }

  let pingenResult: Awaited<ReturnType<typeof sendLetterViaPingen>>;
  try {
    pingenResult = await sendLetterViaPingen({
      pdfBuffer,
      filename:        `brief-mieter-${tenantId}-${Date.now()}.pdf`,
      recipientName,
      addressLine1,
      zip,
      city,
      country,
      deliveryProduct,
    });
  } catch (err: any) {
    res.status(502).json({ error: "Versand über Pingen fehlgeschlagen", detail: err.message });
    return;
  }

  // Log in communications table
  const channel = deliveryProduct === "registered" ? "letter_registered" : "letter_post";
  const [row] = await db.insert(communicationsTable).values({
    tenantId:       Number(tenantId),
    contractId:     contractId ? Number(contractId) : null,
    channel,
    direction:      "outbound",
    subject,
    body,
    status:         "sent",
    sentAt:         new Date(),
    trackingNumber: pingenResult.trackingNumber ?? pingenResult.pingenId,
  }).returning();

  res.status(201).json({ ...row, pingenId: pingenResult.pingenId, pingenStatus: pingenResult.status });
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
