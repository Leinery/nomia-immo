import { Router, type IRouter } from "express";
import multer from "multer";
import { anthropic } from "@workspace/integrations-anthropic-ai";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 5 } });

const SYSTEM_PROMPT = `Du bist ein Experte für deutsche Immobilienverwaltung und Dokumentenanalyse.
Analysiere das hochgeladene Dokument (Mietvertrag, Objekt-Screenshot, Kontoauszug, etc.) und extrahiere alle relevanten Informationen strukturiert.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt ohne Markdown-Codeblöcke, in diesem Format:

{
  "documentType": "mietvertrag" | "objekt" | "zahlung" | "unbekannt",
  "confidence": 0.0-1.0,
  "notes": "Kurze Zusammenfassung des Dokuments",
  "tenant": {
    "firstName": "string oder null",
    "lastName": "string oder null",
    "email": "string oder null",
    "phone": "string oder null",
    "dateOfBirth": "YYYY-MM-DD oder null"
  },
  "unit": {
    "name": "string oder null (z.B. 'WE 1 OG links', 'Stellplatz 3')",
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
  }
}

Wichtige Hinweise:
- Datumsformat immer YYYY-MM-DD
- Geldbeträge als Zahl ohne Währungszeichen (z.B. 850.00 für 850,00 €)
- Fehlende Werte als null, nicht als leeren String
- Bei Mietvertrag: Kaltmiete und Nebenkosten getrennt extrahieren
- documentType "mietvertrag" wenn Mietvertrag, "objekt" wenn Objektdetails/Einheitenliste, "zahlung" wenn Kontoauszug/Zahlungsbeleg`;

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

    const contentBlocks: any[] = [
      {
        type: "text",
        text: "Analysiere dieses Dokument und extrahiere alle relevanten Informationen als JSON.",
      },
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

      res.json(parsed);
    } catch (err: any) {
      console.error("AI Import error:", err);
      res.status(500).json({ error: err?.message ?? "Unbekannter Fehler bei der KI-Analyse." });
    }
  },
);

export default router;
