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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
};

const DOC_TYPE_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  mietvertrag: { label: "Mietvertrag",  color: "bg-blue-100 text-blue-700",    icon: <FileSignature className="h-4 w-4" /> },
  objekt:      { label: "Objekt/Einheit",color: "bg-amber-100 text-amber-700", icon: <Building2 className="h-4 w-4" /> },
  zahlung:     { label: "Zahlung",       color: "bg-emerald-100 text-emerald-700", icon: <FileText className="h-4 w-4" /> },
  unbekannt:   { label: "Unbekannt",     color: "bg-gray-100 text-gray-600",    icon: <FileText className="h-4 w-4" /> },
};

type Step = "upload" | "analyzing" | "confirm" | "done";

export default function KiImportPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("upload");
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<ExtractionResult | null>(null);

  // Editable form state (mirrors extraction result, user can adjust before saving)
  const [form, setForm] = useState<ExtractionResult | null>(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  const [selectedUnitId, setSelectedUnitId] = useState<string>("");

  const { data: properties = [] } = useListProperties();
  const { data: units = [] } = useListUnits(Number(selectedPropertyId), {
    query: { enabled: !!selectedPropertyId },
  });

  const createTenant   = useCreateTenant();
  const createContract = useCreateContract();
  const createUnit     = useCreateUnit();
  const createProperty = useCreateProperty();

  // ── File handling ──
  const addFiles = (newFiles: File[]) => {
    const allowed = newFiles.filter(f => f.type.startsWith("image/") || f.type === "application/pdf");
    setFiles(prev => [...prev, ...allowed].slice(0, 5));
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    addFiles(Array.from(e.dataTransfer.files));
  }, []);

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);

  const removeFile = (i: number) => setFiles(prev => prev.filter((_, j) => j !== i));

  // ── Analyze ──
  async function analyze() {
    if (files.length === 0) return;
    setStep("analyzing");

    const fd = new FormData();
    files.forEach(f => fd.append("files", f));

    try {
      const res = await fetch(`${BASE}/api/ai-import/analyze`, { method: "POST", body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data: ExtractionResult = await res.json();
      setResult(data);
      setForm(JSON.parse(JSON.stringify(data))); // deep copy for editing
      setStep("confirm");
    } catch (err: any) {
      toast({ title: "Analyse fehlgeschlagen", description: err.message, variant: "destructive" });
      setStep("upload");
    }
  }

  // ── Save ──
  async function save() {
    if (!form) return;

    try {
      if (form.documentType === "mietvertrag") {
        // 1. Create tenant
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

        // 2. Resolve unit
        let unitId: number | null = selectedUnitId ? Number(selectedUnitId) : null;

        // 3. Create contract
        if (tenantId && unitId && form.contract?.startDate) {
          await createContract.mutateAsync({
            data: {
              tenantId,
              unitId,
              startDate: form.contract.startDate,
              endDate:   form.contract.endDate ?? undefined,
              monthlyRent: String(form.contract.monthlyRent ?? 0),
              nebenkostenvorauszahlung: form.contract.nebenkostenvorauszahlung
                ? String(form.contract.nebenkostenvorauszahlung)
                : undefined,
              deposit: form.contract.deposit ? String(form.contract.deposit) : undefined,
              notes: form.contract.notes ?? undefined,
            }
          });
        } else if (tenantId) {
          // Tenant created, but no contract (unit not selected)
          toast({ title: "Mieter angelegt", description: "Bitte Einheit auswählen und Vertrag manuell anlegen." });
        }

        qc.invalidateQueries({ queryKey: getListPropertiesQueryKey() });
        toast({ title: "✓ Mietvertrag angelegt", description: tenantId ? "Mieter und Vertrag wurden erfolgreich angelegt." : "Daten angelegt." });

      } else if (form.documentType === "objekt" && form.property?.name) {
        const prop = await createProperty.mutateAsync({
          data: {
            name:    form.property.name,
            address: form.property.address ?? "",
            type:    (form.property.type as any) ?? "apartment_building",
            owner:   form.property.owner ?? undefined,
          }
        });
        qc.invalidateQueries({ queryKey: getListPropertiesQueryKey() });
        toast({ title: "✓ Objekt angelegt", description: `${prop.name} wurde erfolgreich angelegt.` });

      } else {
        toast({ title: "Nichts zu speichern", description: "Dokumenttyp nicht erkannt oder keine Felder befüllt." });
        return;
      }

      setStep("done");
    } catch (err: any) {
      toast({ title: "Fehler beim Speichern", description: err.message, variant: "destructive" });
    }
  }

  function reset() {
    setStep("upload"); setFiles([]); setResult(null); setForm(null);
    setSelectedPropertyId(""); setSelectedUnitId("");
  }

  const isSaving = createTenant.isPending || createContract.isPending || createProperty.isPending;

  // ── Render ──
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[#0f1c15] flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-[#1C3829]" /> KI-Import
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Lade Mietverträge, Objektdaten oder Belege hoch — die KI extrahiert alle Felder automatisch.
        </p>
      </div>

      {/* STEP: Upload */}
      {step === "upload" && (
        <div className="space-y-4">
          {/* Drop zone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
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

          {/* File list */}
          {files.length > 0 && (
            <div className="space-y-2">
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg border px-3 py-2 bg-white">
                  {f.type === "application/pdf"
                    ? <FileText className="h-4 w-4 text-red-500 shrink-0" />
                    : <Image className="h-4 w-4 text-blue-500 shrink-0" />}
                  <span className="text-sm flex-1 truncate">{f.name}</span>
                  <span className="text-xs text-muted-foreground">{(f.size / 1024).toFixed(0)} KB</span>
                  <button onClick={(e) => { e.stopPropagation(); removeFile(i); }} className="text-muted-foreground hover:text-red-500 transition-colors">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <Button onClick={analyze} className="w-full bg-[#1C3829] hover:bg-[#2a5240] text-white mt-1">
                <Sparkles className="h-4 w-4 mr-2" /> Analysieren
              </Button>
            </div>
          )}

          {/* Example hints */}
          <div className="rounded-lg bg-[#f4f7f5] p-4 space-y-1.5 text-sm text-muted-foreground">
            <p className="font-medium text-[#0f1c15] text-xs uppercase tracking-wide mb-2">Was du hochladen kannst</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                { icon: <FileSignature className="h-4 w-4 text-blue-600" />, title: "Mietvertrag (PDF/Foto)", desc: "Legt Mieter + Vertrag an" },
                { icon: <Building2 className="h-4 w-4 text-amber-600" />, title: "Objektdetails (Screenshot)", desc: "Legt Objekt + Einheiten an" },
                { icon: <Users className="h-4 w-4 text-green-600" />, title: "Beliebige Dokumente", desc: "KI erkennt den Typ automatisch" },
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

      {/* STEP: Analyzing */}
      {step === "analyzing" && (
        <Card>
          <CardContent className="py-20 text-center">
            <Loader2 className="h-10 w-10 animate-spin mx-auto mb-4 text-[#1C3829]" />
            <p className="font-medium text-[#0f1c15]">Dokument wird analysiert…</p>
            <p className="text-sm text-muted-foreground mt-1">Claude liest das Dokument und extrahiert alle Felder</p>
          </CardContent>
        </Card>
      )}

      {/* STEP: Confirm */}
      {step === "confirm" && form && result && (
        <div className="space-y-5">
          {/* Result header */}
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  {(() => { const m = DOC_TYPE_META[result.documentType]; return (
                    <Badge className={`${m.color} border-0 flex items-center gap-1.5 text-xs`}>
                      {m.icon}{m.label}
                    </Badge>
                  );})()}
                  <span className="text-xs text-muted-foreground">
                    Konfidenz: {Math.round(result.confidence * 100)}%
                  </span>
                </div>
                <Button variant="ghost" size="sm" onClick={reset} className="text-muted-foreground">
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />Neu hochladen
                </Button>
              </div>
              {result.notes && (
                <p className="text-sm text-muted-foreground mt-2 border-t pt-2">{result.notes}</p>
              )}
            </CardContent>
          </Card>

          {/* ── Mietvertrag ── */}
          {form.documentType === "mietvertrag" && (
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
                      {form.unit?.name && !selectedUnitId && (
                        <p className="text-xs text-muted-foreground">Erkannt: {form.unit.name}</p>
                      )}
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

          {/* ── Objekt ── */}
          {form.documentType === "objekt" && (
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

          {/* ── Unbekannt ── */}
          {(form.documentType === "zahlung" || form.documentType === "unbekannt") && (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                <AlertCircle className="h-8 w-8 mx-auto mb-3 opacity-30" />
                <p className="font-medium">
                  {form.documentType === "zahlung" ? "Zahlungsbeleg erkannt" : "Dokumenttyp nicht eindeutig"}
                </p>
                <p className="text-sm mt-1 max-w-sm mx-auto">
                  {form.documentType === "zahlung"
                    ? "Zahlungen werden automatisch über den Banking-Abgleich zugeordnet. Bitte dort prüfen."
                    : "Bitte lade ein klareres Dokument hoch oder lege die Daten manuell an."}
                </p>
                <Button variant="outline" className="mt-4" onClick={reset}>Anderes Dokument hochladen</Button>
              </CardContent>
            </Card>
          )}

          {/* Save button */}
          {(form.documentType === "mietvertrag" || form.documentType === "objekt") && (
            <Button
              onClick={save}
              disabled={isSaving}
              className="w-full bg-[#1C3829] hover:bg-[#2a5240] text-white h-11"
            >
              {isSaving
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Wird gespeichert…</>
                : <><CheckCircle2 className="h-4 w-4 mr-2" />Daten übernehmen und anlegen</>}
            </Button>
          )}
        </div>
      )}

      {/* STEP: Done */}
      {step === "done" && (
        <Card>
          <CardContent className="py-16 text-center">
            <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-emerald-500" />
            <p className="text-xl font-semibold text-[#0f1c15]">Erfolgreich angelegt!</p>
            <p className="text-sm text-muted-foreground mt-1">Die Daten wurden in deine Verwaltung übernommen.</p>
            <div className="flex gap-3 justify-center mt-6">
              <Button variant="outline" onClick={reset}><RotateCcw className="h-4 w-4 mr-1.5" />Weiteres Dokument</Button>
              <Button className="bg-[#1C3829] hover:bg-[#2a5240] text-white" onClick={() => window.location.hash = "#/tenants"}>
                Mieter ansehen <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Small helpers ──────────────────────────────────────────────────────────────

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
