import { useState, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListProperties, useListUnits, useCreateTenant, useCreateContract,
  useCreateUnit, useCreateProperty,
  getListPropertiesQueryKey, getListUnitsQueryKey,
} from "@workspace/api-client-react";
import {
  Upload, FileText, Image, Sparkles, CheckCircle2, AlertCircle,
  X, RotateCcw, Loader2, ChevronRight, Building2, Users, FileSignature,
  MessageSquare, ThumbsUp, ThumbsDown, FolderDown, RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type ExtractionResult = {
  documentType: "mietvertrag" | "objekt" | "zahlung" | "unbekannt";
  confidence: number;
  notes?: string;
  tenant?: { firstName?: string; lastName?: string; email?: string; phone?: string; dateOfBirth?: string } | null;
  unit?: { name?: string; propertyAddress?: string; area?: number; floor?: number; unitType?: string } | null;
  contract?: { startDate?: string; endDate?: string; monthlyRent?: number; nebenkostenvorauszahlung?: number; deposit?: number; notes?: string } | null;
  property?: { name?: string; address?: string; type?: string; owner?: string } | null;
  payment?: { amount?: number; date?: string; reference?: string; senderName?: string } | null;
  _onedriveCatFolder?: string;
};

const DOC_TYPE_META: Record<string, { label: string; color: string; action: string }> = {
  mietvertrag: { label: "Mietvertrag",    color: "bg-blue-100 text-blue-700",       action: "Mieter und Mietvertrag anlegen" },
  objekt:      { label: "Objekt/Einheit", color: "bg-amber-100 text-amber-700",     action: "Neues Objekt anlegen" },
  zahlung:     { label: "Zahlung",        color: "bg-emerald-100 text-emerald-700", action: "Als Dokument ablegen" },
  unbekannt:   { label: "Unbekannt",      color: "bg-gray-100 text-gray-600",       action: "Als Dokument ablegen" },
};

type Step = "upload" | "analyzing" | "confirm" | "done";

export default function KiImportPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep]               = useState<Step>("upload");
  const [files, setFiles]             = useState<File[]>([]);
  const [fileComments, setFileComments] = useState<Record<number, string>>({});
  const [dragging, setDragging]       = useState(false);
  const [result, setResult]           = useState<ExtractionResult | null>(null);
  const [form, setForm]               = useState<ExtractionResult | null>(null);

  // Proposal state
  const [userApproved, setUserApproved] = useState<boolean | null>(null);
  const [altComment, setAltComment]     = useState("");
  const [showFields, setShowFields]     = useState(false);

  // Save-as-document state (for zahlung/unbekannt)
  const [saveDocPropertyId, setSaveDocPropertyId] = useState("");
  const [saveDocCategory, setSaveDocCategory]     = useState("sonstiges");

  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  const [selectedUnitId, setSelectedUnitId]         = useState<string>("");

  const { data: properties = [] } = useListProperties();
  const { data: units = [] } = useListUnits(Number(selectedPropertyId), {
    query: { enabled: !!selectedPropertyId },
  });

  const createTenant   = useCreateTenant();
  const createContract = useCreateContract();
  const createProperty = useCreateProperty();

  // ── File handling ────────────────────────────────────────────────────────────
  const addFiles = (newFiles: File[]) => {
    const allowed = newFiles.filter(f => f.type.startsWith("image/") || f.type === "application/pdf");
    setFiles(prev => [...prev, ...allowed].slice(0, 5));
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    addFiles(Array.from(e.dataTransfer.files));
  }, []);

  const removeFile = (i: number) => {
    setFiles(prev => prev.filter((_, j) => j !== i));
    setFileComments(prev => {
      const next = { ...prev };
      delete next[i];
      // Re-index
      const reindexed: Record<number, string> = {};
      Object.entries(next).forEach(([k, v]) => {
        const idx = parseInt(k);
        if (idx > i) reindexed[idx - 1] = v;
        else reindexed[idx] = v;
      });
      return reindexed;
    });
  };

  const setComment = (i: number, val: string) =>
    setFileComments(prev => ({ ...prev, [i]: val }));

  // ── Analyze ──────────────────────────────────────────────────────────────────
  async function analyze(extraHint?: string) {
    if (files.length === 0) return;
    setStep("analyzing");
    setUserApproved(null);
    setAltComment("");
    setShowFields(false);

    const fd = new FormData();
    files.forEach(f => fd.append("files", f));

    // Merge per-file comments + optional re-analyze hint into one comment string
    const parts: string[] = [];
    files.forEach((f, i) => {
      if (fileComments[i]) parts.push(`Datei "${f.name}": ${fileComments[i]}`);
    });
    if (extraHint) parts.push(`Zusätzlicher Hinweis: ${extraHint}`);
    if (parts.length > 0) fd.append("comment", parts.join(" | "));

    try {
      const res = await fetch(`${BASE}/api/ai-import/analyze`, { method: "POST", body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data: ExtractionResult = await res.json();
      setResult(data);
      setForm(JSON.parse(JSON.stringify(data)));
      setStep("confirm");
    } catch (err: any) {
      toast({ title: "Analyse fehlgeschlagen", description: err.message, variant: "destructive" });
      setStep("upload");
    }
  }

  // ── Save mietvertrag / objekt ────────────────────────────────────────────────
  async function save() {
    if (!form) return;
    try {
      if (form.documentType === "mietvertrag") {
        let tenantId: number | null = null;
        if (form.tenant?.firstName || form.tenant?.lastName) {
          const t = await createTenant.mutateAsync({
            data: {
              firstName: form.tenant?.firstName ?? "",
              lastName:  form.tenant?.lastName  ?? "",
              email:     form.tenant?.email     ?? undefined,
              phone:     form.tenant?.phone     ?? undefined,
              dateOfBirth: form.tenant?.dateOfBirth ?? undefined,
            }
          });
          tenantId = t.id;
        }
        const unitId = selectedUnitId ? Number(selectedUnitId) : null;
        if (tenantId && unitId && form.contract?.startDate) {
          await createContract.mutateAsync({
            data: {
              tenantId, unitId,
              startDate: form.contract.startDate,
              endDate:   form.contract.endDate ?? undefined,
              monthlyRent: String(form.contract.monthlyRent ?? 0),
              nebenkostenvorauszahlung: form.contract.nebenkostenvorauszahlung
                ? String(form.contract.nebenkostenvorauszahlung) : "0",
              deposit: form.contract.deposit ? String(form.contract.deposit) : undefined,
              notes: form.contract.notes ?? undefined,
            }
          });
        }
        qc.invalidateQueries({ queryKey: getListPropertiesQueryKey() });
        toast({ title: "✓ Mietvertrag angelegt" });

      } else if (form.documentType === "objekt" && form.property?.name) {
        await createProperty.mutateAsync({
          data: {
            name:    form.property.name,
            address: form.property.address ?? "",
            type:    (form.property.type as any) ?? "apartment_building",
            owner:   form.property.owner ?? undefined,
          }
        });
        qc.invalidateQueries({ queryKey: getListPropertiesQueryKey() });
        toast({ title: "✓ Objekt angelegt" });
      }
      setStep("done");
    } catch (err: any) {
      toast({ title: "Fehler beim Speichern", description: err.message, variant: "destructive" });
    }
  }

  // ── Save as document (zahlung/unbekannt) ─────────────────────────────────────
  async function saveAsDocument() {
    if (files.length === 0) return;
    try {
      for (const file of files) {
        // 1. Get presigned URL
        const metaRes = await fetch(`${BASE}/api/storage/uploads/request-url`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
        });
        if (!metaRes.ok) throw new Error("Upload-URL konnte nicht angefordert werden");
        const { uploadURL, objectPath } = await metaRes.json();

        // 2. Upload to GCS
        await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });

        // 3. Register document
        await fetch(`${BASE}/api/documents/upload`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name:       file.name.replace(/\.[^.]+$/, ""),
            category:   saveDocCategory,
            objectPath,
            mimeType:   file.type,
            fileSize:   file.size,
            propertyId: saveDocPropertyId ? Number(saveDocPropertyId) : null,
          }),
        });
      }
      toast({ title: "✓ Als Dokument gespeichert" });
      setStep("done");
    } catch (err: any) {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    }
  }

  function reset() {
    setStep("upload"); setFiles([]); setFileComments({});
    setResult(null); setForm(null);
    setUserApproved(null); setAltComment(""); setShowFields(false);
    setSelectedPropertyId(""); setSelectedUnitId("");
    setSaveDocPropertyId(""); setSaveDocCategory("sonstiges");
  }

  const isSaving = createTenant.isPending || createContract.isPending || createProperty.isPending;

  // ── Proposal text ─────────────────────────────────────────────────────────────
  function proposedActionText(r: ExtractionResult): string {
    if (r.documentType === "mietvertrag") {
      const name = [r.tenant?.firstName, r.tenant?.lastName].filter(Boolean).join(" ");
      const rent = r.contract?.monthlyRent ? ` (${r.contract.monthlyRent.toLocaleString("de-DE")} €/Monat)` : "";
      return `Mieter "${name || "unbekannt"}"${rent} anlegen und Mietvertrag erstellen`;
    }
    if (r.documentType === "objekt") {
      return `Objekt "${r.property?.name || "unbekannt"}" in der Datenbank anlegen`;
    }
    if (r.documentType === "zahlung") {
      const amt = r.payment?.amount ? `${r.payment.amount.toLocaleString("de-DE")} €` : "";
      return `Zahlungsbeleg${amt ? ` über ${amt}` : ""} als Dokument ablegen`;
    }
    return "Dokument ablegen";
  }

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[#0f1c15] flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-[#1C3829]" /> KI-Import
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Lade Dokumente hoch — gib optional einen kurzen Hinweis, die KI entscheidet was damit zu tun ist.
        </p>
      </div>

      {/* ── UPLOAD ─────────────────────────────────────────────────────────── */}
      {step === "upload" && (
        <div className="space-y-4">
          <div
            onClick={() => fileInputRef.current?.click()}
            onDrop={onDrop}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
              dragging ? "border-[#1C3829] bg-[#f0f7f3]" : "border-gray-200 hover:border-[#1C3829]/50 hover:bg-gray-50"
            }`}
          >
            <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
            <p className="font-medium text-[#0f1c15]">Dateien hier ablegen</p>
            <p className="text-sm text-muted-foreground mt-1">oder klicken zum Auswählen</p>
            <p className="text-xs text-muted-foreground mt-2">PDF, JPG, PNG, WEBP · max. 5 Dateien · je 20 MB</p>
          </div>
          <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf" className="hidden"
            onChange={e => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />

          {files.length > 0 && (
            <div className="space-y-3">
              {files.map((f, i) => (
                <div key={i} className="rounded-lg border bg-white overflow-hidden">
                  {/* File row */}
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    {f.type === "application/pdf"
                      ? <FileText className="h-4 w-4 text-red-500 shrink-0" />
                      : <Image className="h-4 w-4 text-blue-500 shrink-0" />}
                    <span className="text-sm flex-1 truncate font-medium">{f.name}</span>
                    <span className="text-xs text-muted-foreground">{(f.size / 1024).toFixed(0)} KB</span>
                    <button
                      onClick={e => { e.stopPropagation(); removeFile(i); }}
                      className="text-muted-foreground hover:text-red-500 transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {/* Comment field */}
                  <div className="px-3 pb-3 flex items-center gap-2">
                    <MessageSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <Input
                      placeholder={"Hinweis für die KI (optional) — z.B. \u201EScreenshot Kredit, Leinstra\xDFe 31\u201C"}
                      value={fileComments[i] ?? ""}
                      onChange={e => setComment(i, e.target.value)}
                      className="h-7 text-xs border-0 border-b rounded-none bg-transparent px-0 focus-visible:ring-0 placeholder:text-muted-foreground/60"
                    />
                  </div>
                </div>
              ))}

              <Button onClick={() => analyze()} className="w-full bg-[#1C3829] hover:bg-[#2a5240] text-white mt-1">
                <Sparkles className="h-4 w-4 mr-2" /> Analysieren
              </Button>
            </div>
          )}

          {/* Hints */}
          <div className="rounded-lg bg-[#f4f7f5] p-4 text-sm text-muted-foreground">
            <p className="font-medium text-[#0f1c15] text-xs uppercase tracking-wide mb-2">Was du hochladen kannst</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                { icon: <FileSignature className="h-4 w-4 text-blue-600" />, title: "Mietvertrag (PDF/Foto)", desc: "Legt Mieter + Vertrag an" },
                { icon: <Building2 className="h-4 w-4 text-amber-600" />, title: "Kredit- / Objektdaten", desc: "Hinweis hilft der KI" },
                { icon: <Users className="h-4 w-4 text-green-600" />, title: "Beliebige Dokumente", desc: "KI erkennt Typ automatisch" },
              ].map((item, i) => (
                <div key={i} className="flex gap-2.5 items-start bg-white rounded-lg p-3 border">
                  <div className="mt-0.5 shrink-0">{item.icon}</div>
                  <div>
                    <p className="text-xs font-medium text-[#0f1c15]">{item.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── ANALYZING ──────────────────────────────────────────────────────── */}
      {step === "analyzing" && (
        <Card>
          <CardContent className="py-20 text-center">
            <Loader2 className="h-10 w-10 animate-spin mx-auto mb-4 text-[#1C3829]" />
            <p className="font-medium text-[#0f1c15]">Dokument wird analysiert…</p>
            <p className="text-sm text-muted-foreground mt-1">Claude liest das Dokument und extrahiert alle Felder</p>
          </CardContent>
        </Card>
      )}

      {/* ── CONFIRM ────────────────────────────────────────────────────────── */}
      {step === "confirm" && form && result && (
        <div className="space-y-4">

          {/* ── Proposal card ────────────────────────────────────────── */}
          <Card className="border-[#1C3829]/20">
            <CardContent className="pt-4 pb-4 space-y-4">
              {/* Type + confidence */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  {(() => { const m = DOC_TYPE_META[result.documentType]; return (
                    <Badge className={`${m.color} border-0 text-xs`}>{m.label}</Badge>
                  );})()}
                  <span className="text-xs text-muted-foreground">Konfidenz: {Math.round(result.confidence * 100)}%</span>
                </div>
                <Button variant="ghost" size="sm" onClick={reset} className="text-muted-foreground h-7">
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />Neu hochladen
                </Button>
              </div>

              {/* AI summary */}
              {result.notes && (
                <p className="text-sm text-[#0f1c15] bg-muted/40 rounded-lg px-3 py-2 leading-relaxed">
                  {result.notes}
                </p>
              )}

              <Separator />

              {/* Proposed action */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Empfohlene Aktion
                </p>
                <p className="text-sm font-medium text-[#0f1c15]">
                  {proposedActionText(result)}
                </p>
              </div>

              {/* Yes / No buttons (only when not yet decided) */}
              {userApproved === null && (
                <div className="flex gap-2 pt-1">
                  <Button
                    onClick={() => { setUserApproved(true); setShowFields(true); }}
                    className="flex-1 bg-[#1C3829] hover:bg-[#2a5240] text-white gap-2"
                  >
                    <ThumbsUp className="h-4 w-4" /> Ja, so umsetzen
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setUserApproved(false)}
                    className="flex-1 gap-2"
                  >
                    <ThumbsDown className="h-4 w-4" /> Nein, anders
                  </Button>
                </div>
              )}

              {/* Alternative action */}
              {userApproved === false && (
                <div className="space-y-3 pt-1">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Was soll stattdessen passieren?</Label>
                    <Textarea
                      placeholder={"z.B. 'Das ist ein Kredit fuer Leinstrasse 31, bitte als Kreditdokument anlegen' oder 'Nur als PDF ablegen unter Steuern'"}
                      value={altComment}
                      onChange={e => setAltComment(e.target.value)}
                      rows={3}
                      className="text-sm resize-none"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => analyze(altComment)}
                      className="flex-1 gap-2"
                      disabled={!altComment.trim()}
                    >
                      <RefreshCw className="h-4 w-4" /> Neu analysieren
                    </Button>
                    <Button
                      onClick={() => { setUserApproved(true); setShowFields(true); }}
                      className="flex-1 bg-[#1C3829] hover:bg-[#2a5240] text-white gap-2"
                    >
                      <FolderDown className="h-4 w-4" /> Trotzdem so übernehmen
                    </Button>
                  </div>
                </div>
              )}

              {/* "Show fields" toggle when approved */}
              {userApproved === true && (result.documentType === "mietvertrag" || result.documentType === "objekt") && (
                <button
                  onClick={() => setShowFields(v => !v)}
                  className="text-xs text-muted-foreground underline underline-offset-2"
                >
                  {showFields ? "Felder ausblenden" : "Erkannte Felder prüfen / bearbeiten ▾"}
                </button>
              )}
            </CardContent>
          </Card>

          {/* ── Mietvertrag fields ───────────────────────────────────── */}
          {userApproved === true && showFields && form.documentType === "mietvertrag" && (
            <div className="space-y-4">
              <SectionCard title="Mieter" icon={<Users className="h-4 w-4" />}>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Vorname" value={form.tenant?.firstName ?? ""} onChange={v => setForm(p => p ? { ...p, tenant: { ...p.tenant, firstName: v } } : null)} />
                  <Field label="Nachname" value={form.tenant?.lastName ?? ""} onChange={v => setForm(p => p ? { ...p, tenant: { ...p.tenant, lastName: v } } : null)} />
                  <Field label="E-Mail" value={form.tenant?.email ?? ""} onChange={v => setForm(p => p ? { ...p, tenant: { ...p.tenant, email: v } } : null)} className="col-span-2" />
                  <Field label="Telefon" value={form.tenant?.phone ?? ""} onChange={v => setForm(p => p ? { ...p, tenant: { ...p.tenant, phone: v } } : null)} />
                  <Field label="Geburtsdatum" value={form.tenant?.dateOfBirth ?? ""} onChange={v => setForm(p => p ? { ...p, tenant: { ...p.tenant, dateOfBirth: v } } : null)} type="date" />
                </div>
              </SectionCard>

              <SectionCard title="Einheit" icon={<Building2 className="h-4 w-4" />}>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5 col-span-2">
                    <Label className="text-xs">Objekt</Label>
                    <Select value={selectedPropertyId} onValueChange={v => { setSelectedPropertyId(v); setSelectedUnitId(""); }}>
                      <SelectTrigger><SelectValue placeholder="Objekt auswählen" /></SelectTrigger>
                      <SelectContent>
                        {(properties as any[]).map((p: any) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {form.unit?.propertyAddress && !selectedPropertyId && (
                      <p className="text-xs text-muted-foreground">Erkannt: {form.unit.propertyAddress}</p>
                    )}
                  </div>
                  {selectedPropertyId && (
                    <div className="space-y-1.5 col-span-2">
                      <Label className="text-xs">Einheit</Label>
                      <Select value={selectedUnitId} onValueChange={setSelectedUnitId}>
                        <SelectTrigger><SelectValue placeholder="Einheit auswählen" /></SelectTrigger>
                        <SelectContent>
                          {(units as any[]).map((u: any) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </SectionCard>

              <SectionCard title="Mietvertrag" icon={<FileSignature className="h-4 w-4" />}>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Startdatum" value={form.contract?.startDate ?? ""} onChange={v => setForm(p => p ? { ...p, contract: { ...p.contract, startDate: v } } : null)} type="date" />
                  <Field label="Enddatum (leer = unbefristet)" value={form.contract?.endDate ?? ""} onChange={v => setForm(p => p ? { ...p, contract: { ...p.contract, endDate: v } } : null)} type="date" />
                  <Field label="Kaltmiete (€)" value={String(form.contract?.monthlyRent ?? "")} onChange={v => setForm(p => p ? { ...p, contract: { ...p.contract, monthlyRent: parseFloat(v) || 0 } } : null)} type="number" />
                  <Field label="Nebenkosten (€)" value={String(form.contract?.nebenkostenvorauszahlung ?? "")} onChange={v => setForm(p => p ? { ...p, contract: { ...p.contract, nebenkostenvorauszahlung: parseFloat(v) || 0 } } : null)} type="number" />
                  <Field label="Kaution (€)" value={String(form.contract?.deposit ?? "")} onChange={v => setForm(p => p ? { ...p, contract: { ...p.contract, deposit: parseFloat(v) || 0 } } : null)} type="number" className="col-span-2" />
                </div>
              </SectionCard>
            </div>
          )}

          {/* ── Objekt fields ────────────────────────────────────────── */}
          {userApproved === true && showFields && form.documentType === "objekt" && (
            <SectionCard title="Objekt" icon={<Building2 className="h-4 w-4" />}>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Objektname" value={form.property?.name ?? ""} onChange={v => setForm(p => p ? { ...p, property: { ...p.property, name: v } } : null)} className="col-span-2" />
                <Field label="Adresse" value={form.property?.address ?? ""} onChange={v => setForm(p => p ? { ...p, property: { ...p.property, address: v } } : null)} className="col-span-2" />
                <Field label="Eigentümer" value={form.property?.owner ?? ""} onChange={v => setForm(p => p ? { ...p, property: { ...p.property, owner: v } } : null)} className="col-span-2" />
                <div className="space-y-1.5">
                  <Label className="text-xs">Typ</Label>
                  <Select value={form.property?.type ?? "apartment_building"} onValueChange={v => setForm(p => p ? { ...p, property: { ...p.property, type: v } } : null)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="apartment_building">Mehrfamilienhaus</SelectItem>
                      <SelectItem value="commercial">Gewerbe</SelectItem>
                      <SelectItem value="house">Einfamilienhaus</SelectItem>
                      <SelectItem value="land">Grundstück</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </SectionCard>
          )}

          {/* ── Save-as-document (zahlung / unbekannt) ───────────────── */}
          {userApproved === true && (form.documentType === "zahlung" || form.documentType === "unbekannt") && (
            <Card>
              <CardContent className="pt-4 pb-4 space-y-3">
                <p className="text-sm font-medium text-[#0f1c15] flex items-center gap-2">
                  <FolderDown className="h-4 w-4 text-muted-foreground" />
                  Dokument ablegen
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Objekt (optional)</Label>
                    <Select value={saveDocPropertyId} onValueChange={setSaveDocPropertyId}>
                      <SelectTrigger><SelectValue placeholder="Keinem Objekt zuordnen" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Kein Objekt</SelectItem>
                        {(properties as any[]).map((p: any) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Kategorie</Label>
                    <Select value={saveDocCategory} onValueChange={setSaveDocCategory}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="banking">Banking / Zahlung</SelectItem>
                        <SelectItem value="kredit">Kredit</SelectItem>
                        <SelectItem value="mietvertrag">Mietvertrag</SelectItem>
                        <SelectItem value="nebenkostenabrechnung">Nebenkosten</SelectItem>
                        <SelectItem value="steuern">Steuern</SelectItem>
                        <SelectItem value="versicherung">Versicherung</SelectItem>
                        <SelectItem value="korrespondenz">Korrespondenz</SelectItem>
                        <SelectItem value="sonstiges">Sonstiges</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Action button ────────────────────────────────────────── */}
          {userApproved === true && (
            <Button
              onClick={
                (form.documentType === "zahlung" || form.documentType === "unbekannt")
                  ? saveAsDocument
                  : save
              }
              disabled={isSaving}
              className="w-full bg-[#1C3829] hover:bg-[#2a5240] text-white h-11"
            >
              {isSaving
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Wird gespeichert…</>
                : <><CheckCircle2 className="h-4 w-4 mr-2" />Umsetzen</>}
            </Button>
          )}
        </div>
      )}

      {/* ── DONE ───────────────────────────────────────────────────────────── */}
      {step === "done" && (
        <Card>
          <CardContent className="py-16 text-center">
            <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-emerald-500" />
            <p className="text-xl font-semibold text-[#0f1c15]">Erfolgreich!</p>
            <p className="text-sm text-muted-foreground mt-1">Die Daten wurden übernommen.</p>
            <div className="flex gap-3 justify-center mt-6">
              <Button variant="outline" onClick={reset}><RotateCcw className="h-4 w-4 mr-1.5" />Weiteres Dokument</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function SectionCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3 pt-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-2 text-[#0f1c15]">
          {icon}{title}
        </CardTitle>
      </CardHeader>
      <Separator />
      <CardContent className="pt-4">{children}</CardContent>
    </Card>
  );
}

function Field({ label, value, onChange, type = "text", className = "" }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <Label className="text-xs">{label}</Label>
      <Input type={type} value={value} onChange={e => onChange(e.target.value)} className="h-8 text-sm" />
    </div>
  );
}
