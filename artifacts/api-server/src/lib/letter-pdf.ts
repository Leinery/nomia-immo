/**
 * Generates a DIN-5008-style German business letter as a PDF Buffer.
 * Uses pdfkit (pure Node.js, no headless browser needed).
 */
import PDFDocument from "pdfkit";
import type { PingenSenderConfig } from "./pingen";

export interface LetterPdfOptions {
  sender:          PingenSenderConfig;
  recipientName:   string;
  recipientLine2?: string; // optional: company / c/o line above street
  addressLine1:    string; // Straße + Hausnr.
  zip:             string;
  city:            string;
  country?:        string;
  subject:         string;
  body:            string; // plain text (newlines preserved)
  date?:           string; // ISO date string — default: today
}

function formatDateDe(isoOrUndef?: string): string {
  const d = isoOrUndef ? new Date(isoOrUndef) : new Date();
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" });
}

export function generateLetterPdf(opts: LetterPdfOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size:    "A4",
      margins: { top: 25, bottom: 25, left: 25, right: 25 },
    });

    const chunks: Buffer[] = [];
    doc.on("data",  (c: Buffer) => chunks.push(c));
    doc.on("end",   () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const mm = (millimeters: number) => millimeters * 2.835; // mm → pt

    // ── Page margins in mm (DIN 5008 Form A) ─────────────────────────────────
    const marginLeft   = mm(25);
    const marginRight  = mm(25);
    const pageWidth    = mm(210);
    const contentWidth = pageWidth - marginLeft - marginRight;

    // ── Absender-Kurzzeile (small, above address window) ─────────────────────
    const senderShortLine = [opts.sender.name, opts.sender.address, `${opts.sender.zip} ${opts.sender.city}`]
      .filter(Boolean)
      .join(", ");

    doc
      .fontSize(6.5)
      .fillColor("#666666")
      .font("Helvetica")
      .text(senderShortLine, marginLeft, mm(50), { width: mm(85), lineBreak: false, underline: true });

    // ── Empfängeradresse (Anschriftfeld DIN 5008) ─────────────────────────────
    const addrTop = mm(55);
    doc
      .fontSize(10)
      .fillColor("#000000")
      .font("Helvetica");

    let addrY = addrTop;
    if (opts.recipientLine2) {
      doc.text(opts.recipientLine2, marginLeft, addrY, { width: mm(85) });
      addrY += doc.currentLineHeight() + 2;
    }
    doc.text(opts.recipientName, marginLeft, addrY, { width: mm(85) });
    addrY += doc.currentLineHeight() + 2;
    doc.text(opts.addressLine1, marginLeft, addrY, { width: mm(85) });
    addrY += doc.currentLineHeight() + 2;
    doc.text(`${opts.zip} ${opts.city}`, marginLeft, addrY, { width: mm(85) });
    if (opts.country && opts.country !== "DE") {
      addrY += doc.currentLineHeight() + 2;
      doc.text(opts.country, marginLeft, addrY, { width: mm(85) });
    }

    // ── Absenderblock (oben rechts) ───────────────────────────────────────────
    const senderRight = pageWidth - marginRight;
    doc
      .fontSize(10)
      .fillColor("#000000")
      .font("Helvetica-Bold")
      .text(opts.sender.name, 0, mm(50), { width: senderRight - mm(105), align: "right" });

    const senderLines = [opts.sender.address, `${opts.sender.zip} ${opts.sender.city}`].filter(Boolean);
    doc
      .fontSize(10)
      .font("Helvetica")
      .fillColor("#444444");
    senderLines.forEach((line) => {
      doc.text(line, 0, undefined, { width: senderRight - mm(105), align: "right" });
    });

    // ── Datum ─────────────────────────────────────────────────────────────────
    doc
      .fontSize(10)
      .fillColor("#000000")
      .font("Helvetica")
      .text(formatDateDe(opts.date), 0, mm(97), { width: senderRight - mm(25), align: "right" });

    // ── Betreff ───────────────────────────────────────────────────────────────
    doc
      .fontSize(11)
      .font("Helvetica-Bold")
      .fillColor("#000000")
      .text(opts.subject, marginLeft, mm(103), { width: contentWidth });

    // ── Brieftext ─────────────────────────────────────────────────────────────
    const bodyTop = mm(113);
    doc
      .fontSize(10.5)
      .font("Helvetica")
      .fillColor("#000000")
      .text(opts.body, marginLeft, bodyTop, {
        width:     contentWidth,
        lineGap:   2,
        paragraphGap: 6,
      });

    // ── Fußzeile ──────────────────────────────────────────────────────────────
    const footerY = mm(280);
    doc
      .fontSize(8)
      .fillColor("#999999")
      .text(
        `${opts.sender.name}  ·  ${opts.sender.address}  ·  ${opts.sender.zip} ${opts.sender.city}`,
        marginLeft,
        footerY,
        { width: contentWidth, align: "center" }
      );

    doc.end();
  });
}
