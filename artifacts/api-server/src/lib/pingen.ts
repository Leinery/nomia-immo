/**
 * Pingen v2 API helper
 *
 * Credentials needed (Replit Secrets):
 *   PINGEN_CLIENT_ID       – OAuth2 Client ID aus dem Pingen-Dashboard
 *   PINGEN_CLIENT_SECRET   – OAuth2 Client Secret
 *   PINGEN_ORGANISATION_ID – Organisations-ID (sichtbar in der Pingen-URL)
 *
 * Optional:
 *   PINGEN_SENDER_NAME     – Absendername im Brief (default: "Nomia Verwaltung")
 *   PINGEN_SENDER_ADDRESS  – Straße + Hausnr. des Absenders
 *   PINGEN_SENDER_ZIP      – PLZ des Absenders
 *   PINGEN_SENDER_CITY     – Ort des Absenders
 */

const AUTH_URL = "https://identity.pingen.com/auth/access-tokens";
const API_BASE = "https://api.pingen.com";

export function isPingenConfigured(): boolean {
  return !!(
    process.env.PINGEN_CLIENT_ID &&
    process.env.PINGEN_CLIENT_SECRET &&
    process.env.PINGEN_ORGANISATION_ID
  );
}

export interface PingenSenderConfig {
  name:    string;
  address: string;
  zip:     string;
  city:    string;
  country: string;
}

export function getPingenSenderConfig(): PingenSenderConfig {
  return {
    name:    process.env.PINGEN_SENDER_NAME    ?? "Nomia Verwaltung",
    address: process.env.PINGEN_SENDER_ADDRESS ?? "",
    zip:     process.env.PINGEN_SENDER_ZIP     ?? "",
    city:    process.env.PINGEN_SENDER_CITY    ?? "",
    country: process.env.PINGEN_SENDER_COUNTRY ?? "DE",
  };
}

// ─── Internal: access token (short-lived, no cache needed for per-request use) ─

async function getAccessToken(): Promise<string> {
  const resp = await fetch(AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type:    "client_credentials",
      client_id:     process.env.PINGEN_CLIENT_ID!,
      client_secret: process.env.PINGEN_CLIENT_SECRET!,
      scope:         "letter",
    }),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Pingen-Authentifizierung fehlgeschlagen (${resp.status}): ${txt}`);
  }
  const data = await resp.json() as { access_token: string };
  return data.access_token;
}

// ─── Internal: upload PDF → returns the file URL pingen can access ─────────────

async function uploadPdf(token: string, pdfBuffer: Buffer, filename: string): Promise<string> {
  // Step 1: request presigned upload URL from pingen
  const initResp = await fetch(`${API_BASE}/file-upload`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type":  "application/vnd.api+json",
      "Accept":        "application/vnd.api+json",
    },
    body: JSON.stringify({
      data: {
        type: "file_uploads",
        attributes: { filename },
      },
    }),
  });
  if (!initResp.ok) {
    const txt = await initResp.text();
    throw new Error(`Pingen file-upload Init fehlgeschlagen (${initResp.status}): ${txt}`);
  }
  const initData = await initResp.json() as {
    data: { attributes: { url: string; url_original: string } };
  };
  const { url: uploadUrl, url_original: fileUrl } = initData.data.attributes;

  // Step 2: PUT the PDF to the presigned S3 URL
  const putResp = await fetch(uploadUrl, {
    method:  "PUT",
    headers: { "Content-Type": "application/pdf" },
    body:    pdfBuffer,
  });
  if (!putResp.ok) {
    throw new Error(`PDF-Upload zu Pingen S3 fehlgeschlagen (${putResp.status})`);
  }

  return fileUrl;
}

// ─── Public: send letter ───────────────────────────────────────────────────────

export type DeliveryProduct = "economy" | "fast" | "registered";

export interface SendLetterParams {
  pdfBuffer:       Buffer;
  filename:        string;
  recipientName:   string;
  addressLine1:    string; // Straße + Hausnummer
  zip:             string;
  city:            string;
  country:         string;
  deliveryProduct: DeliveryProduct;
}

export interface PingenLetterResult {
  pingenId:       string;
  status:         string;
  trackingNumber: string | null;
}

export async function sendLetterViaPingen(params: SendLetterParams): Promise<PingenLetterResult> {
  if (!isPingenConfigured()) {
    throw new Error("Pingen nicht konfiguriert. Bitte PINGEN_CLIENT_ID, PINGEN_CLIENT_SECRET und PINGEN_ORGANISATION_ID als Secrets setzen.");
  }

  const token  = await getAccessToken();
  const fileUrl = await uploadPdf(token, params.pdfBuffer, params.filename);
  const orgId  = process.env.PINGEN_ORGANISATION_ID!;

  const resp = await fetch(`${API_BASE}/organisations/${orgId}/letter-mailings`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type":  "application/vnd.api+json",
      "Accept":        "application/vnd.api+json",
    },
    body: JSON.stringify({
      data: {
        type: "letter_mailings",
        attributes: {
          file_original_name: params.filename,
          file_url:           fileUrl,
          delivery_product:   params.deliveryProduct,
          print_mode:         "simplex",
          print_spectrum:     "grayscale",
          address: {
            name:    params.recipientName,
            address: params.addressLine1,
            city:    params.city,
            zip:     params.zip,
            country: params.country,
          },
        },
      },
    }),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Pingen letter-mailing fehlgeschlagen (${resp.status}): ${txt}`);
  }

  const data = await resp.json() as {
    data: {
      id: string;
      attributes: { status: string; tracking_number?: string };
    };
  };

  return {
    pingenId:       data.data.id,
    status:         data.data.attributes.status,
    trackingNumber: data.data.attributes.tracking_number ?? null,
  };
}
