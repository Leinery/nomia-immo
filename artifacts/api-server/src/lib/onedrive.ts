import { ReplitConnectors } from "@replit/connectors-sdk";
import { db, propertiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const connectors = new ReplitConnectors();

// ── Root & structure ──────────────────────────────────────────────────────────

export const ROOT = "Immobiliendashboard und persönlicher Assistent";

/**
 * Full folder tree. Kept here as the single source of truth.
 * Whenever the app creates a new property or new category, add it here
 * and call ensureFolderTree() — the rest of the app picks it up automatically.
 */
export const PROPERTY_SUBFOLDERS = [
  "Mietverträge",
  "Nebenkostenabrechnungen",
  "Wartung und Reparaturen",
  "Korrespondenz",
  "Versicherungen",
  "Steuern",
  "Mahnungen",
  "Sonstiges",
];

export const GLOBAL_FOLDERS = [
  `${ROOT}/Immobilien`,
  `${ROOT}/Finanzen/Banking und Kontoauszüge`,
  `${ROOT}/Finanzen/Kredite`,
  `${ROOT}/Finanzen/Steuern`,
  `${ROOT}/KI-Import`,
  `${ROOT}/Allgemein/Korrespondenz`,
  `${ROOT}/Allgemein/Sonstiges`,
];

// ── Category → folder name ────────────────────────────────────────────────────

const CATEGORY_TO_SUBFOLDER: Record<string, string> = {
  mietvertrag:              "Mietverträge",
  nebenkostenabrechnung:    "Nebenkostenabrechnungen",
  nebenkostenvorauszahlung: "Nebenkostenabrechnungen",
  wartung:                  "Wartung und Reparaturen",
  mahnung:                  "Mahnungen",
  korrespondenz:            "Korrespondenz",
  versicherung:             "Versicherungen",
  steuern:                  "Steuern",
};

// Top-level financial categories (go under Finanzen/, not under a property)
const FINANCE_CATEGORY: Record<string, string> = {
  banking:    "Banking und Kontoauszüge",
  kontoauszug:"Banking und Kontoauszüge",
  kredit:     "Kredite",
};

/** Strip characters OneDrive / Graph path encoding dislikes */
function sanitize(name: string): string {
  return name.replace(/[*":<>?\\|#%]/g, "").replace(/,/g, "").replace(/\s+/g, " ").trim();
}

export function categoryToFolder(category?: string | null): string {
  if (!category) return "Sonstiges";
  const lower = category.toLowerCase();
  return CATEGORY_TO_SUBFOLDER[lower] ?? "Sonstiges";
}

export async function getPropertyFolderName(propertyId?: number | null): Promise<string> {
  if (!propertyId) return "";
  const [prop] = await db.select({ name: propertiesTable.name }).from(propertiesTable).where(eq(propertiesTable.id, propertyId));
  return prop ? sanitize(prop.name) : "";
}

// ── Smart path builder ────────────────────────────────────────────────────────

/**
 * Build the OneDrive path based on:
 *  - propertyFolder: sanitized property name (or "" for global)
 *  - category: document category key
 *  - filename: original filename
 *
 * Routing logic:
 *  1. Banking / Kontoauszug / Kredit → Finanzen/{subcategory}/{filename}
 *  2. Has property + known category   → Immobilien/{property}/{category}/{filename}
 *  3. Has property + unknown category → Immobilien/{property}/Sonstiges/{filename}
 *  4. No property + known subfolder   → Allgemein/{category}/{filename}
 *  5. Fallback                        → KI-Import/{filename}
 */
export function buildSmartPath(
  propertyFolder: string,
  category: string | null | undefined,
  filename: string,
): string {
  const safeFile = sanitize(filename);
  const lower = (category ?? "").toLowerCase();

  // 1. Financial docs always go to Finanzen/
  if (FINANCE_CATEGORY[lower]) {
    return `${ROOT}/Finanzen/${FINANCE_CATEGORY[lower]}/${safeFile}`;
  }

  const subFolder = CATEGORY_TO_SUBFOLDER[lower] ?? "Sonstiges";

  // 2+3. Property-specific docs
  if (propertyFolder) {
    return `${ROOT}/Immobilien/${propertyFolder}/${subFolder}/${safeFile}`;
  }

  // 4. No property — put under Allgemein if we have a folder for it, else KI-Import
  if (subFolder !== "Sonstiges") {
    return `${ROOT}/Allgemein/${subFolder}/${safeFile}`;
  }

  // 5. Fallback
  return `${ROOT}/KI-Import/${safeFile}`;
}

/** Legacy compat — kept so old callers don't break during transition */
export function buildOneDrivePath(propertyFolder: string, categoryFolder: string, filename: string): string {
  return buildSmartPath(propertyFolder, categoryFolder.toLowerCase(), filename);
}

// ── Graph API proxy ───────────────────────────────────────────────────────────

/** Encode each path segment individually, join with "/" */
function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function graphRequest(path: string, options: RequestInit = {}): Promise<Response> {
  // The Replit OneDrive connector proxy base URL is https://graph.microsoft.com
  // (no version). We must include /v1.0 explicitly in every path.
  const versionedPath = path.startsWith("/v1.0") ? path : `/v1.0${path}`;
  return connectors.proxy("onedrive", versionedPath, options as any);
}

// ── Upload ────────────────────────────────────────────────────────────────────

export async function uploadToOneDrive(
  remotePath: string,
  fileData: Buffer | Uint8Array,
  mimeType: string,
): Promise<{ id: string; webUrl: string }> {
  const encoded = encodePath(remotePath);
  const response = await graphRequest(`/me/drive/root:/${encoded}:/content`, {
    method: "PUT",
    headers: { "Content-Type": mimeType || "application/octet-stream" },
    body: fileData,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OneDrive upload failed (${response.status}): ${text.slice(0, 300)}`);
  }

  const json = await response.json() as any;
  return { id: json.id, webUrl: json.webUrl };
}

// ── Create folder (idempotent) ────────────────────────────────────────────────

export async function ensureFolder(folderPath: string): Promise<void> {
  const parts = folderPath.split("/");
  let currentParts: string[] = [];

  for (const part of parts) {
    const parentPath = currentParts.length === 0 ? null : currentParts.join("/");
    const endpoint = parentPath
      ? `/me/drive/root:/${encodePath(parentPath)}:/children`
      : `/me/drive/root/children`;

    const resp = await graphRequest(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: part,
        folder: {},
        "@microsoft.graph.conflictBehavior": "fail",
      }),
    });

    // 409 Conflict = already exists → fine
    if (!resp.ok && resp.status !== 409) {
      const text = await resp.text();
      // Also ignore "nameAlreadyExists"
      if (!text.includes("nameAlreadyExists")) {
        console.warn(`[OneDrive] ensureFolder warning for "${folderPath}": ${resp.status} ${text.slice(0, 200)}`);
      }
    }

    currentParts.push(part);
  }
}

// ── Initialize full folder tree ───────────────────────────────────────────────

export async function initAllFolders(): Promise<{ created: string[]; errors: string[] }> {
  const created: string[] = [];
  const errors: string[] = [];

  async function mkDir(path: string) {
    try {
      await ensureFolder(path);
      created.push(path);
    } catch (err: any) {
      errors.push(`${path}: ${err?.message ?? err}`);
    }
  }

  // 1. Global folders
  for (const path of GLOBAL_FOLDERS) {
    await mkDir(path);
  }

  // 2. Per-property folders (dynamically from DB)
  const properties = await db.select({ id: propertiesTable.id, name: propertiesTable.name }).from(propertiesTable);
  for (const prop of properties) {
    const propFolder = sanitize(prop.name);
    for (const sub of PROPERTY_SUBFOLDERS) {
      await mkDir(`${ROOT}/Immobilien/${propFolder}/${sub}`);
    }
  }

  return { created, errors };
}

/** Kept for backward compat with the /onedrive/setup-folders route */
export async function initPropertyFolders(): Promise<string[]> {
  const { created, errors } = await initAllFolders();
  if (errors.length) console.warn("[OneDrive] Setup errors:", errors);
  return created;
}

// ── Ensure property folders exist (called on property create) ─────────────────

export async function ensurePropertyFolders(propertyName: string): Promise<void> {
  const propFolder = sanitize(propertyName);
  for (const sub of PROPERTY_SUBFOLDERS) {
    await ensureFolder(`${ROOT}/Immobilien/${propFolder}/${sub}`);
  }
}

// ── OneDrive user info ────────────────────────────────────────────────────────

export async function getOneDriveUser(): Promise<{ displayName: string; email: string; driveUrl?: string }> {
  const res = await graphRequest("/me?$select=displayName,mail,userPrincipalName", { method: "GET" });
  const json = await res.json() as any;
  const driveRes = await graphRequest("/me/drive?$select=webUrl", { method: "GET" });
  const driveJson = await driveRes.json() as any;
  return {
    displayName: json.displayName ?? "",
    email: json.mail ?? json.userPrincipalName ?? "",
    driveUrl: driveJson.webUrl,
  };
}
