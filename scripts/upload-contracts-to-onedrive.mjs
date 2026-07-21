/**
 * One-time script: upload contract PDFs to OneDrive
 * Always uses upload sessions (avoids proxy binary-upload Cloudflare issues)
 */
import { ReplitConnectors } from "@replit/connectors-sdk";
import fs from "node:fs";

const c = new ReplitConnectors();

async function req(method, path, opts = {}) {
  const r = await c.proxy("onedrive", `/v1.0${path}`, { method, ...opts });
  const text = await r.text();
  if (!r.ok && r.status !== 201) throw new Error(`${method} ${path} → ${r.status}: ${text.slice(0, 200)}`);
  try { return JSON.parse(text); } catch { return text; }
}

async function ensureFolder(parentId, name) {
  const children = await req("GET", `/me/drive/items/${parentId}/children?$select=name,id,folder`);
  const found = children.value?.find((i) => i.folder && i.name === name);
  if (found) { console.log(`  📁 Exists: ${name}`); return found.id; }
  const created = await req("POST", `/me/drive/items/${parentId}/children`, {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, folder: {}, "@microsoft.graph.conflictBehavior": "rename" }),
  });
  console.log(`  📁 Created: ${name} (id=${created.id})`);
  return created.id;
}

async function uploadViaSession(parentId, fileName, filePath) {
  const content = fs.readFileSync(filePath);
  const encoded = encodeURIComponent(fileName);

  // Create upload session (gets a direct upload URL, no proxy for data)
  const session = await req("POST", `/me/drive/items/${parentId}:/${encoded}:/createUploadSession`, {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": "replace" } }),
  });
  const uploadUrl = session.uploadUrl;

  // Upload in chunks directly to the session URL
  const chunkSize = 5 * 1024 * 1024;
  let offset = 0;
  let lastResult;
  while (offset < content.length) {
    const chunk = content.slice(offset, offset + chunkSize);
    const end = offset + chunk.length - 1;
    const r = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Range": `bytes ${offset}-${end}/${content.length}`,
        "Content-Length": String(chunk.length),
      },
      body: chunk,
    });
    const t = await r.text();
    try { lastResult = JSON.parse(t); } catch { lastResult = { raw: t }; }
    offset += chunk.length;
  }
  return lastResult;
}

const root = await req("GET", "/me/drive/root?$select=id,name");
console.log(`📂 Root: ${root.name}`);

const immoId  = await ensureFolder(root.id, "Immobilienverwaltung");
const mvId    = await ensureFolder(immoId, "Mietverträge");
const leinId  = await ensureFolder(mvId, "Leinstraße 31");
const angerId = await ensureFolder(mvId, "Am Anger 16-18");

const files = [
  { folder: leinId,  name: "Mietvertrag_Eisenwerk_15_2_GmbH_EG_Leinery_Lounge.pdf",           src: "attached_assets/MV_Leinery_Lounge_-_Eisenwerk(1)_1784624723204.pdf" },
  { folder: leinId,  name: "Mietvertrag_Hewlett-Packard_GmbH_2_3_OG_Leinery_Lofts.pdf",        src: "attached_assets/2020_04_02_signed_Mietvertrag_Leinery_Lofts_200330_Hannover_Fi_1784624806231.pdf" },
  { folder: leinId,  name: "Mietvertrag_Hanovolt_GmbH_4_5_OG_Leinery_Penthouse.pdf",           src: "attached_assets/Mietvertrag_Hanovolt_GmbH_1784624812644.pdf" },
  { folder: leinId,  name: "Mietvertrag_Francesca_Fratelli_1_OG_Leinery_Business.pdf",          src: "attached_assets/Mietvertrag_Francesca_&_Fratelli_1._OG__1784624818769.pdf" },
  { folder: angerId, name: "Gesamtmietvertrag_Stadt_Seelze.pdf",                                src: "attached_assets/Gesamtmietvertrag_Stadt_Seelze_1784580599715.pdf" },
];

console.log("\n📤 Uploading via upload sessions...");
for (const f of files) {
  if (!fs.existsSync(f.src)) { console.log(`  ⚠️  Not found: ${f.src}`); continue; }
  const mb = (fs.statSync(f.src).size / 1024 / 1024).toFixed(1);
  process.stdout.write(`  → ${f.name} (${mb} MB) ... `);
  try {
    const result = await uploadViaSession(f.folder, f.name, f.src);
    if (result?.id) console.log(`✅`);
    else console.log("⚠️ ", JSON.stringify(result).slice(0, 200));
  } catch (e) {
    console.log("❌", e.message);
  }
}
console.log("\n✅ Done.");
