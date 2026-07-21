import { Router, type IRouter } from "express";
import multer from "multer";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { uploadToOneDrive, buildSmartPath } from "../lib/onedrive";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 5 } });

const SYSTEM_PROMPT = `Du bist ein Experte für deutsche Immobilienverwaltung und Dokumentenanalyse.
Analysiere das hochgeladene Dokument und extrahiere alle relevanten Informationen strukturiert.
Berücksichtige dabei ausdrücklich alle Nutzerhinweise, die im User-Message angegeben werden.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt ohne Markdown-Codeblöcke, in diesem Format:

{
  "documentType": "mietvertrag" | "objekt" | "kredit" | "zahlung" | "unbekannt",
  "confidence": 0.0-1.0,
  "notes": "Kurze Zusammenfassung des Dokuments auf Deutsch",
  "tenant": {
    "firstName": "string oder null",
    "lastName": "string oder null",
    "email": "string oder null",
    "phone": "string oder null",
    "dateOfBirth": "YYYY-MM-DD oder null"
  },
  "unit": {
    "name": "string oder null",
    "propertyAddress": "string oder null",
    "area": Zahl oder null,
    "floor": Zahl oder null,
    "unitType": "residential" | "commercial" | "garage" | "parking" | null
  },
  "contract": {
    "startDate": "YYYY-MM-DD oder null",
    "endDate": "YYYY-MM-DD oder null",
    "monthlyRent": Zahl oder null,
    "nebenkostenvorauszahlung": Zahl oder null,
    "deposit": Zahl oder null,
    "notes": "string oder null"
  },
  "property": {
    "name": "string oder null",
    "address": "string oder null",
    "type": "apartment_building" | "commercial" | "house" | "land" | null,
    "owner": "string oder null"
  },
  "payment": {
    "amount": Zahl oder null,
    "date": "YYYY-MM-DD oder null",
    "reference": "string oder null",
    "senderName": "string oder null"
  },
  "loan": {
    "lenderName": "Name der Bank/des Kreditgebers oder null",
    "propertyAddress": "Adresse des finanzierten Objekts oder null",
    "loanAmount": Ursprungskreditbetrag als Zahl oder null,
    "currentBalance": Aktueller Reststand als Zahl oder null,
    "interestRate": Sollzinssatz als Dezimalzahl in Prozent (z.B. 1.45 fuer 1,45%) oder null,
    "monthlyRate": Monatliche Rate in EUR als Zahl oder null,
    "startDate": "YYYY-MM-DD oder null (Auszahlungsdatum/Vertragsbeginn)",
    "fixedRateEndDate": "YYYY-MM-DD oder null (Zinsbindungsende)",
    "loanIban": "IBAN des Kreditkontos oder null",
    "debitAccountIban": "IBAN des Belastungskontos oder null",
    "notes": "string oder null"
  }
}

ENTSCHEIDUNGSREGELN fuer documentType (in dieser Reihenfolge pruefen):

1. KREDIT — setze documentType="kredit" wenn IRGENDEINES dieser Kriterien zutrifft:
   - Der Nutzerhinweis enthaelt ein dieser Woerter: Kredit, Darlehen, Finanzierung, Hypothek, Baudarlehen, Annuitaet, Sollzinssatz, Zinsbindung, Tilgung
   - Das Dokument zeigt: Ursprungsdarlehen, Restschuld, Reststand, monatliche Rate, Sollzinssatz, Zinsbindungsende, Auszahlungsbetrag, Tilgungsrate
   - Das Dokument ist eine Kreditbestaetigung, ein Darlehensvertrag oder eine Banking-Ansicht die ein Darlehenskonto zeigt

2. MIETVERTRAG — setze documentType="mietvertrag" wenn: Mietvertrag, Mietverhaeltnis, Mietzins, Kaution im Dokument

3. OBJEKT — setze documentType="objekt" wenn: Grundriss, Einheitenliste, Flaechen-Uebersicht, Objektdaten

4. ZAHLUNG — NUR wenn: reiner Kontoauszug OHNE Kreditbezug, Ueberweisungsbeleg, Lastschrift

5. UNBEKANNT — nur als letzter Ausweg

WICHTIG: Ein Volksbank-/Banking-Screenshot der ein Darlehen oder einen Kredit zeigt ist IMMER documentType="kredit", NICHT "zahlung".
WICHTIG: Wenn der Nutzerhinweis "Kredit" enthaelt, ist documentType IMMER "kredit".

Weitere Hinweise:
- Datumsformat immer YYYY-MM-DD
- Geldbetraege als Zahl ohne Waehrungszeichen (z.B. 850.00 fuer 850,00 EUR)
- Fehlende Werte als null, nicht als leeren String`;


function fileToContentBlock(file: Express.Multer.File): any {
  const base64 = file.buffer.toString("base64");
  const mime = file.mimetype as string;

  if (mime === "application/pdf") {
    return {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: base64 },
    };
  }

  const imageTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  const imgMime = imageTypes.includes(mime) ? mime : "image/jpeg";
  return {
    type: "image",
    source: { type: "base64", media_type: imgMime, data: base64 },
  };
}

// ─── POST /ai-import/analyze ──────────────────────────────────────────────────
router.post(
  "/ai-import/analyze",
  upload.array("files", 5),
  async (req, res): Promise<void> => {
    const files = req.files as Express.Multer.File[] | undefined;

    if (!files || files.length === 0) {
      res.status(400).json({ error: "Keine Dateien hochgeladen." });
      return;
    }

    // Optional user hint passed as form field "comment"
    const userComment = typeof req.body?.comment === "string" ? req.body.comment.trim() : "";

    const introText = userComment
      ? `Analysiere dieses Dokument. Der Nutzer hat folgenden Hinweis gegeben: "${userComment}"\nExtrahiere alle relevanten Informationen als JSON.`
      : "Analysiere dieses Dokument und extrahiere alle relevanten Informationen als JSON.";

    const contentBlocks: any[] = [
      { type: "text", text: introText },
      ...files.map(fileToContentBlock),
    ];

    try {
      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 8192,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: contentBlocks }],
      });

      const text = message.content
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text)
        .join("");

      // Strip any accidental markdown fences
      const cleaned = text.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();

      let parsed: any;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        res.status(422).json({ error: "KI-Antwort konnte nicht als JSON geparst werden.", raw: text });
        return;
      }

      // ── Async OneDrive push ────────────────────────────────────────────────
      const docType = parsed.documentType ?? "unbekannt";
      // Map AI document type to category key for smart routing
      const aiCategory = docType === "mietvertrag" ? "mietvertrag"
                       : docType === "zahlung"      ? "banking"
                       : docType === "kredit"       ? "kredit"
                       : docType === "objekt"       ? "sonstiges"
                       : "sonstiges";

      for (const file of files) {
        (async () => {
          try {
            const filename = file.originalname || `ki-import-${Date.now()}.pdf`;
            const remotePath = buildSmartPath("", aiCategory, filename);
            await uploadToOneDrive(remotePath, file.buffer, file.mimetype);
            console.log("[OneDrive] KI-Import uploaded:", remotePath);
          } catch (err) {
            console.error("[OneDrive] KI-Import upload failed:", err);
          }
        })();
      }

      res.json({ ...parsed, _onedriveCatFolder: aiCategory });
    } catch (err: any) {
      console.error("AI Import error:", err);
      res.status(500).json({ error: err?.message ?? "Unbekannter Fehler bei der KI-Analyse." });
    }
  },
);

export default router;
