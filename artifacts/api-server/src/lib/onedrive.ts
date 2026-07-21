import { ReplitConnectors } from "@replit/connectors-sdk";
import { db, propertiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const connectors = new ReplitConnectors();

// ── Folder name mapping ───────────────────────────────────────────────────────

const CATEGORY_FOLDER: Record<string, string> = {
  mietvertrag:             "Mietverträge",
  nebenkostenabrechnung:   "Nebenkostenabrechnungen",
  nebenkostenvorauszahlung:"Nebenkostenabrechnungen",
  wartung:                 "Wartung",
  banking:                 "Banking",
  kontoauszug:             "Banking",
  kredit:                  "Kredite",
  mahnung:                 "Mahnungen",
  korrespondenz:           "Korrespondenz",
  steuern:                 "Steuern",
  versicherung:            "Versicherungen",
};

const ROOT_FOLDER = "Nomia Immobilien";

/** Strip characters OneDrive / Graph path encoding dislikes */
function sanitize(name: string): string {
  return name.replace(/[*":<>?\\|]/g, "").replace(/,/g, "").replace(/\s+/g, " ").trim();
}

export function categoryToFolder(category?: string | null): string {
  if (!category) return "Sonstiges";
  return CATEGORY_FOLDER[category.toLowerCase()] ?? "Sonstiges";
}

export async function getPropertyFolderName(propertyId?: number | null): Promise<string> {
  if (!propertyId) return "Allgemein";
  const [prop] = await db.select({ name: propertiesTable.name }).from(propertiesTable).where(eq(propertiesTable.id, propertyId));
  return prop ? sanitize(prop.name) : "Allgemein";
}

export function buildOneDrivePath(propertyFolder: string, categoryFolder: string, filename: string): string {
  const safeFile = sanitize(filename);
  return `${ROOT_FOLDER}/${propertyFolder}/${categoryFolder}/${safeFile}`;
}

// ── Upload ────────────────────────────────────────────────────────────────────

export async function uploadToOneDrive(
  remotePath: string,
  fileData: Buffer | Uint8Array,
  mimeType: string,
): Promise<{ id: string; webUrl: string }> {
  const encoded = remotePath.split("/").map(encodeURIComponent).join("/");
  const response = await connectors.proxy("onedrive", `/me/drive/root:/${encoded}:/content`, {
    method: "PUT",
    headers: { "Content-Type": mimeType || "application/octet-stream" },
    body: fileData,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OneDrive upload failed (${response.status}): ${text.slice(0, 200)}`);
  }

  const json = await response.json() as any;
  return { id: json.id, webUrl: json.webUrl };
}

// ── Create folder (idempotent) ────────────────────────────────────────────────

export async function ensureFolder(folderPath: string): Promise<void> {
  const parts = folderPath.split("/");
  // Build path segment by segment using PATCH (upsert folder)
  let current = "";
  for (const part of parts) {
    const parent = current || "root";
    const endpoint = current
      ? `/me/drive/root:/${encodeURIComponent(current)}:/children`
      : `/me/drive/root/children`;

    await connectors.proxy("onedrive", endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: part,
        folder: {},
        "@microsoft.graph.conflictBehavior": "fail",
      }),
    });
    current = current ? `${current}/${part}` : part;
  }
}

// ── Initialize all property folders ──────────────────────────────────────────

export async function initPropertyFolders(): Promise<string[]> {
  const subfolders = [
    "Mietverträge",
    "Nebenkostenabrechnungen",
    "Banking",
    "Wartung",
    "Mahnungen",
    "Korrespondenz",
    "Versicherungen",
    "Steuern",
    "Sonstiges",
  ];

  const properties = await db.select({ id: propertiesTable.id, name: propertiesTable.name }).from(propertiesTable);
  const created: string[] = [];

  for (const prop of properties) {
    const propFolder = sanitize(prop.name);
    for (const sub of subfolders) {
      const path = `${ROOT_FOLDER}/${propFolder}/${sub}`;
      try {
        await ensureFolder(path);
        created.push(path);
      } catch {
        // Already exists — fine
        created.push(`${path} (bereits vorhanden)`);
      }
    }
  }

  return created;
}

// ── Get OneDrive user info ────────────────────────────────────────────────────

export async function getOneDriveUser(): Promise<{ displayName: string; email: string; driveUrl?: string }> {
  const res = await connectors.proxy("onedrive", "/me?$select=displayName,mail,userPrincipalName", { method: "GET" });
  const json = await res.json() as any;
  const driveRes = await connectors.proxy("onedrive", "/me/drive?$select=webUrl", { method: "GET" });
  const driveJson = await driveRes.json() as any;
  return {
    displayName: json.displayName ?? "",
    email: json.mail ?? json.userPrincipalName ?? "",
    driveUrl: driveJson.webUrl,
  };
}
