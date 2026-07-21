import { useState, useMemo, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft, Plus, Pencil, Trash2, Home, Car, ParkingSquare,
  Building2, User, Euro, Maximize2, FileText, Loader2,
  CheckCircle2, AlertTriangle, Upload, X, Save, Calendar,
  CreditCard, CalendarDays,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  useGetUnit, useListProperties, useListTenants,
  useListContracts, useCreateContract, useUpdateContract, useDeleteContract,
  useListRentDebits,
  useListDocuments, getListContractsQueryKey, getListDocumentsQueryKey,
  type RentDebitWithPayments,
} from "@workspace/api-client-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Schemas ─────────────────────────────────────────────────────────────────

const contractSchema = z.object({
  tenantId:                  z.coerce.number().min(1, "Mieter auswählen"),
  startDate:                 z.string().min(1, "Pflichtfeld"),
  endDate:                   z.string().optional().nullable(),
  monthlyRent:               z.coerce.number().min(0),
  nebenkostenvorauszahlung:  z.coerce.number().min(0).default(0),
  heizkostenvorauszahlung:   z.coerce.number().min(0).default(0),
  deposit:                   z.coerce.number().min(0).optional().nullable(),
  status:                    z.enum(["active", "terminated", "pending"]).default("active"),
  notes:                     z.string().optional().nullable(),
});
type ContractFormValues = z.infer<typeof contractSchema>;

// ─── Type helpers ─────────────────────────────────────────────────────────────

const UNIT_TYPE_META: Record<string, { label: string; Icon: any }> = {
  residential: { label: "Wohnung",        Icon: Home          },
  commercial:  { label: "Gewerbe",        Icon: Building2     },
  garage:      { label: "Garage",         Icon: Car           },
  parking:     { label: "Stellplatz",     Icon: ParkingSquare },
};

const CONTRACT_STATUS: Record<string, { label: string; cls: string }> = {
  active:     { label: "Aktiv",        cls: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  terminated: { label: "Beendet",      cls: "bg-red-100 text-red-800 border-red-200" },
  pending:    { label: "Ausstehend",   cls: "bg-amber-100 text-amber-800 border-amber-200" },
};

const MONTHS_DE = ["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"];

function fmt(v: number) { return formatCurrency(v); }

function tenantDisplayName(t: any) {
  return (t?.companyName ? t.companyName + (t.firstName || t.lastName ? ` (${[t.firstName, t.lastName].filter(Boolean).join(" ")})` : "") : [t?.firstName, t?.lastName].filter(Boolean).join(" ")) || "—";
}

// ─── Upload helper ────────────────────────────────────────────────────────────

async function uploadToObjectStorage(
  file: File,
  onProgress: (p: number) => void,
): Promise<string> {
  const metaRes = await fetch(`${BASE}/api/storage/uploads/request-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: file.name, contentType: file.type }),
  });
  if (!metaRes.ok) throw new Error("Konnte Upload-URL nicht abrufen");
  const { uploadURL, objectPath } = await metaRes.json();
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadURL);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload  = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload fehlgeschlagen: ${xhr.status}`)));
    xhr.onerror = () => reject(new Error("Upload-Verbindungsfehler"));
    xhr.send(file);
  });
  return objectPath;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function UnitDetailPage() {
  const { id } = useParams<{ id: string }>();
  const unitId = parseInt(id ?? "0");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Data ────────────────────────────────────────────────────────────────────
  const { data: unit, isLoading: loadingUnit } = useGetUnit(unitId);
  const { data: properties }                   = useListProperties();
  const { data: tenants = [] }                 = useListTenants();
  const { data: contracts = [], isLoading: loadingContracts } = useListContracts(
    { unitId } as any,
    { query: { queryKey: getListContractsQueryKey({ unitId } as any), enabled: !!unitId } },
  );
  const { data: documents = [], isLoading: loadingDocs } = useListDocuments(
    { unitId } as any,
    { query: { queryKey: getListDocumentsQueryKey({ unitId } as any), enabled: !!unitId } },
  );

  // Active contract (most recent active)
  const sortedContracts = useMemo(() =>
    [...contracts].sort((a, b) => String(b.startDate).localeCompare(String(a.startDate))),
    [contracts]
  );
  const activeContract = sortedContracts.find(c => c.status === "active");

  const { data: debits = [], isLoading: loadingDebits } = useListRentDebits(
    activeContract?.id ?? 0,
    { query: { enabled: !!activeContract?.id } },
  );
  const recentDebits = useMemo(() =>
    [...debits].sort((a, b) => b.year !== a.year ? b.year - a.year : b.month - a.month).slice(0, 6),
    [debits]
  );

  // Mutations
  const createContractMutation = useCreateContract();
  const updateContractMutation = useUpdateContract();
  const deleteContractMutation = useDeleteContract();

  // State
  const [contractDialog, setContractDialog] = useState<{ mode: "create" | "edit"; contract?: any } | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);

  // ── Contract form ────────────────────────────────────────────────────────────
  const form = useForm<ContractFormValues>({
    resolver: zodResolver(contractSchema),
    defaultValues: { status: "active", nebenkostenvorauszahlung: 0, heizkostenvorauszahlung: 0 },
  });

  function openCreateContract() {
    form.reset({ status: "active", nebenkostenvorauszahlung: 0, heizkostenvorauszahlung: 0 });
    setContractDialog({ mode: "create" });
  }

  function openEditContract(c: any) {
    form.reset({
      tenantId:                 c.tenantId,
      startDate:                String(c.startDate).slice(0, 10),
      endDate:                  c.endDate ? String(c.endDate).slice(0, 10) : null,
      monthlyRent:              c.monthlyRent,
      nebenkostenvorauszahlung: c.nebenkostenvorauszahlung ?? 0,
      heizkostenvorauszahlung:  c.heizkostenvorauszahlung ?? 0,
      deposit:                  c.deposit ?? null,
      status:                   c.status,
      notes:                    c.notes ?? null,
    });
    setContractDialog({ mode: "edit", contract: c });
  }

  const saveContract = form.handleSubmit(async (data) => {
    try {
      if (contractDialog?.mode === "edit" && contractDialog.contract) {
        await updateContractMutation.mutateAsync({
          params: { id: contractDialog.contract.id },
          data: {
            ...data,
            startDate: new Date(data.startDate),
            endDate:   data.endDate ? new Date(data.endDate) : undefined,
            deposit:   data.deposit ?? undefined,
            notes:     data.notes ?? undefined,
          },
        });
        toast({ title: "Mietverhältnis gespeichert" });
      } else {
        await createContractMutation.mutateAsync({
          data: {
            unitId,
            tenantId:                data.tenantId,
            startDate:               new Date(data.startDate),
            endDate:                 data.endDate ? new Date(data.endDate) : undefined,
            monthlyRent:             data.monthlyRent,
            nebenkostenvorauszahlung: data.nebenkostenvorauszahlung,
            heizkostenvorauszahlung:  data.heizkostenvorauszahlung,
            deposit:                 data.deposit ?? undefined,
            status:                  data.status,
            notes:                   data.notes ?? undefined,
          },
        });
        toast({ title: "Mietverhältnis angelegt" });
      }
      qc.invalidateQueries({ queryKey: getListContractsQueryKey({ unitId } as any) });
      setContractDialog(null);
    } catch {
      toast({ title: "Fehler beim Speichern", variant: "destructive" });
    }
  });

  async function handleDeleteContract(contractId: number) {
    if (!confirm("Mietverhältnis löschen? Alle zugehörigen Sollstellungen werden ebenfalls gelöscht.")) return;
    try {
      await deleteContractMutation.mutateAsync({ id: contractId });
      qc.invalidateQueries({ queryKey: getListContractsQueryKey({ unitId } as any) });
      toast({ title: "Mietverhältnis gelöscht" });
    } catch {
      toast({ title: "Fehler beim Löschen", variant: "destructive" });
    }
  }

  // ── Document upload ──────────────────────────────────────────────────────────
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !unit) return;
    e.target.value = "";
    setUploading(true);
    setUploadProgress(0);
    try {
      const objectPath = await uploadToObjectStorage(file, setUploadProgress);
      const body: any = {
        objectPath,
        filename:    file.name,
        fileSize:    file.size,
        mimeType:    file.type || "application/octet-stream",
        unitId,
        propertyId:  (unit as any).propertyId ?? undefined,
      };
      const res = await fetch(`${BASE}/api/documents/upload`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      qc.invalidateQueries({ queryKey: getListDocumentsQueryKey({ unitId } as any) });
      toast({ title: "Dokument hochgeladen" });
    } catch (err: any) {
      toast({ title: "Upload fehlgeschlagen", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }

  // ── Derived ──────────────────────────────────────────────────────────────────
  const property = properties?.find((p) => p.id === (unit as any)?.propertyId);
  const currentTenant = tenants.find(t => t.id === activeContract?.tenantId);
  const unitMeta = UNIT_TYPE_META[(unit as any)?.unitType ?? "residential"];

  if (loadingUnit) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!unit) {
    return <div className="text-center py-20 text-muted-foreground">Einheit nicht gefunden.</div>;
  }

  const u = unit as any;
  const gesamt = activeContract
    ? activeContract.monthlyRent + (activeContract.nebenkostenvorauszahlung ?? 0) + (activeContract.heizkostenvorauszahlung ?? 0)
    : null;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* ── Breadcrumb / Header ─────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <button
            onClick={() => navigate(property ? `${BASE}/properties/${property.id}` : `${BASE}/properties`)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-2 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {property?.name ?? "Zurück zur Immobilie"}
          </button>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-foreground">{u.name}</h1>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted border px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              {unitMeta && <unitMeta.Icon className="w-3.5 h-3.5" />}
              {unitMeta?.label ?? u.unitType}
            </span>
            {activeContract && (
              <Badge className={`text-[10px] border ${CONTRACT_STATUS.active.cls}`}>Vermietet</Badge>
            )}
            {!activeContract && (
              <Badge className="text-[10px] border bg-gray-100 text-gray-500 border-gray-200">Leerstand</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {u.area && <span>{u.area} m²</span>}
            {u.rooms && <span> · {u.rooms} Zimmer</span>}
            {u.area && activeContract && (
              <span> · {(activeContract.monthlyRent / u.area).toFixed(2)} €/m²</span>
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate(`${BASE}/contracts`)}>
          <FileText className="w-3.5 h-3.5 mr-1.5" />Alle Verträge
        </Button>
      </div>

      {/* ── Top grid: Aktueller Mieter + Eckdaten ────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Eckdaten */}
        <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Kaltmiete",         value: activeContract ? fmt(activeContract.monthlyRent) : "—",                      icon: Euro          },
            { label: "Nebenkosten VZ",    value: activeContract ? fmt(activeContract.nebenkostenvorauszahlung ?? 0) : "—",     icon: Euro          },
            { label: "Heizkosten VZ",     value: activeContract ? fmt(activeContract.heizkostenvorauszahlung ?? 0) : "—",      icon: Euro          },
            { label: "Gesamt/Monat",      value: gesamt != null ? fmt(gesamt) : "—",                                           icon: Euro, hi: true },
          ].map((item) => (
            <Card key={item.label} className={`shadow-sm ${item.hi ? "border-primary/20 bg-primary/5" : ""}`}>
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-1.5 mb-1">
                  <item.icon className="w-3.5 h-3.5 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                </div>
                <p className={`text-lg font-bold tabular-nums ${item.hi ? "text-primary" : "text-foreground"}`}>{item.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Aktueller Mieter */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Aktueller Mieter</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 pt-0">
            {activeContract && currentTenant ? (
              <>
                <div className="flex items-start gap-2">
                  <User className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold text-sm leading-snug">{tenantDisplayName(currentTenant)}</p>
                    <p className="text-xs text-muted-foreground">Mieter seit {formatDate(activeContract.startDate)}</p>
                  </div>
                </div>
                <Separator />
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Kaltmiete</span>
                    <span className="tabular-nums font-medium">{fmt(activeContract.monthlyRent)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Nebenkosten VZ</span>
                    <span className="tabular-nums">{fmt(activeContract.nebenkostenvorauszahlung ?? 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Heizkosten VZ</span>
                    <span className="tabular-nums">{fmt(activeContract.heizkostenvorauszahlung ?? 0)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-semibold">
                    <span>Gesamt (brutto)</span>
                    <span className="tabular-nums text-primary">{fmt(gesamt ?? 0)}</span>
                  </div>
                </div>
                <button
                  onClick={() => navigate(`${BASE}/contracts/${activeContract.id}`)}
                  className="w-full text-xs text-primary hover:underline flex items-center justify-center gap-1 mt-1"
                >
                  <FileText className="w-3 h-3" />Vertragsdetails anzeigen
                </button>
              </>
            ) : (
              <div className="text-center py-4 text-sm text-muted-foreground">
                <User className="w-8 h-8 mx-auto mb-2 opacity-20" />
                <p>Kein aktiver Mieter</p>
                <Button size="sm" variant="outline" className="mt-3 gap-1.5" onClick={openCreateContract}>
                  <Plus className="w-3.5 h-3.5" />Mietverhältnis anlegen
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Mietverhältnisse (Tenancy History) ──────────────────────────────── */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <CalendarDays className="w-4 h-4" /> Mietverhältnisse
            </CardTitle>
            <Button size="sm" className="bg-[#1C3829] hover:bg-[#2a5240] text-white gap-1.5" onClick={openCreateContract}>
              <Plus className="w-3.5 h-3.5" />Neues Mietverhältnis
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loadingContracts ? (
            <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Lade…
            </div>
          ) : sortedContracts.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              <Calendar className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p>Noch keine Mietverhältnisse hinterlegt.</p>
              <Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={openCreateContract}>
                <Plus className="w-3.5 h-3.5" />Erstes Mietverhältnis anlegen
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-muted/20">
                <TableRow>
                  <TableHead>Mieter</TableHead>
                  <TableHead className="hidden sm:table-cell">Zeitraum</TableHead>
                  <TableHead className="text-right hidden md:table-cell">Kaltmiete</TableHead>
                  <TableHead className="text-right hidden md:table-cell">NK VZ</TableHead>
                  <TableHead className="text-right hidden lg:table-cell">HK VZ</TableHead>
                  <TableHead className="hidden sm:table-cell">Status</TableHead>
                  <TableHead className="text-right">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedContracts.map((c) => {
                  const t = tenants.find(t => t.id === c.tenantId);
                  const s = CONTRACT_STATUS[c.status] ?? CONTRACT_STATUS.pending;
                  return (
                    <TableRow key={c.id} className="hover:bg-muted/20">
                      <TableCell>
                        <div className="text-sm font-medium">{tenantDisplayName(t)}</div>
                        <div className="text-xs text-muted-foreground sm:hidden">
                          {formatDate(c.startDate)} – {c.endDate ? formatDate(c.endDate) : "laufend"}
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm text-muted-foreground whitespace-nowrap">
                        {formatDate(c.startDate)} – {c.endDate ? formatDate(c.endDate) : <span className="text-emerald-600 font-medium">laufend</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm hidden md:table-cell">{fmt(c.monthlyRent)}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm hidden md:table-cell">{fmt(c.nebenkostenvorauszahlung ?? 0)}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm hidden lg:table-cell">{fmt((c as any).heizkostenvorauszahlung ?? 0)}</TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-bold tracking-wide ${s.cls}`}>
                          {s.label}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`${BASE}/contracts/${c.id}`)}>
                            <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditContract(c)}>
                            <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDeleteContract(c.id)}>
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Mietübersicht + Dokumente side by side ───────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Mietübersicht */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <Euro className="w-4 h-4" /> Mietübersicht
                {activeContract && (
                  <span className="text-[10px] font-normal text-muted-foreground/70">(letzte 6 Monate)</span>
                )}
              </CardTitle>
              {activeContract && (
                <button
                  onClick={() => navigate(`${BASE}/contracts/${activeContract.id}`)}
                  className="text-xs text-primary hover:underline"
                >
                  Alle anzeigen →
                </button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {!activeContract ? (
              <div className="text-center py-10 text-sm text-muted-foreground px-6">
                Kein aktiver Mietvertrag — keine Sollstellungen vorhanden.
              </div>
            ) : loadingDebits ? (
              <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> Lade…
              </div>
            ) : recentDebits.length === 0 ? (
              <div className="text-center py-10 text-sm text-muted-foreground px-6">
                <p>Noch keine Sollstellungen generiert.</p>
                <button
                  onClick={() => navigate(`${BASE}/contracts/${activeContract.id}`)}
                  className="text-xs text-primary hover:underline mt-2 block"
                >
                  → Im Vertragsdetail generieren
                </button>
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-muted/20">
                  <TableRow>
                    <TableHead>Monat</TableHead>
                    <TableHead className="text-right">Betrag</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentDebits.map((d) => (
                    <DebitRow key={d.id} d={d} />
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Dokumente */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <FileText className="w-4 h-4" /> Dokumente
              </CardTitle>
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.zip"
                  onChange={handleFileUpload}
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  Hochladen
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {uploading && (
              <div className="mb-3 space-y-1.5">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Wird hochgeladen…</span>
                  <span>{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} className="h-1.5" />
              </div>
            )}
            {loadingDocs ? (
              <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> Lade…
              </div>
            ) : documents.length === 0 ? (
              <div className="text-center py-10 text-sm text-muted-foreground">
                <FileText className="w-10 h-10 mx-auto mb-2 opacity-20" />
                <p>Noch keine Dokumente hochgeladen.</p>
                <p className="text-xs mt-1 opacity-70">Mietverträge, Übergabeprotokolle, etc.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {documents.map((doc: any) => (
                  <div key={doc.id} className="flex items-center justify-between gap-3 py-2 border-b last:border-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm truncate font-medium">{doc.filename}</p>
                        <p className="text-xs text-muted-foreground">
                          {doc.fileSize ? `${(doc.fileSize / 1024).toFixed(0)} KB · ` : ""}
                          {new Date(doc.createdAt).toLocaleDateString("de-DE")}
                        </p>
                      </div>
                    </div>
                    <a
                      href={`${BASE}/api/documents/${doc.id}/download`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary hover:underline shrink-0"
                    >
                      Download
                    </a>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Contract dialog ──────────────────────────────────────────────────── */}
      {contractDialog && (
        <Dialog open onOpenChange={() => setContractDialog(null)}>
          <DialogContent className="sm:max-w-[580px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {contractDialog.mode === "edit" ? "Mietverhältnis bearbeiten" : "Neues Mietverhältnis"}
              </DialogTitle>
              <DialogDescription>
                {contractDialog.mode === "create"
                  ? "Fügen Sie ein neues Mietverhältnis mit dem gültigen Datum ab hinzu. Bestehende Verträge bitte vorher beenden."
                  : "Vertragsdaten anpassen — z.B. Mietanpassung ab einem bestimmten Datum."}
              </DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form onSubmit={saveContract} className="space-y-5">
                {/* Mieter */}
                <FormField control={form.control} name="tenantId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mieter <span className="text-destructive">*</span></FormLabel>
                    <Select value={String(field.value ?? "")} onValueChange={(v) => field.onChange(parseInt(v))}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Mieter auswählen…" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {tenants.map((t) => (
                          <SelectItem key={t.id} value={String(t.id)}>
                            {tenantDisplayName(t)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                <div className="grid grid-cols-2 gap-3">
                  {/* Beginn */}
                  <FormField control={form.control} name="startDate" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Beginn <span className="text-destructive">*</span></FormLabel>
                      <FormControl><Input type="date" {...field} value={field.value ?? ""} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  {/* Ende */}
                  <FormField control={form.control} name="endDate" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ende (leer = unbefristet)</FormLabel>
                      <FormControl><Input type="date" {...field} value={field.value ?? ""} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <Separator />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Miete</p>

                <div className="grid grid-cols-3 gap-3">
                  <FormField control={form.control} name="monthlyRent" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Kaltmiete (€) <span className="text-destructive">*</span></FormLabel>
                      <FormControl><Input type="number" step="0.01" placeholder="0,00" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="nebenkostenvorauszahlung" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nebenkosten VZ (€)</FormLabel>
                      <FormControl><Input type="number" step="0.01" placeholder="0,00" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="heizkostenvorauszahlung" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Heizkosten VZ (€)</FormLabel>
                      <FormControl><Input type="number" step="0.01" placeholder="0,00" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="deposit" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Kaution (€)</FormLabel>
                      <FormControl><Input type="number" step="0.01" placeholder="0,00" {...field} value={field.value ?? ""} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="status" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="active">Aktiv</SelectItem>
                          <SelectItem value="terminated">Beendet</SelectItem>
                          <SelectItem value="pending">Ausstehend</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <FormField control={form.control} name="notes" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notizen</FormLabel>
                    <FormControl><Input placeholder="Optional…" {...field} value={field.value ?? ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <DialogFooter className="pt-1">
                  <Button type="button" variant="outline" onClick={() => setContractDialog(null)}>Abbrechen</Button>
                  <Button
                    type="submit"
                    className="bg-[#1C3829] hover:bg-[#2a5240] text-white gap-1.5"
                    disabled={createContractMutation.isPending || updateContractMutation.isPending}
                  >
                    <Save className="w-3.5 h-3.5" />
                    {contractDialog.mode === "edit" ? "Speichern" : "Anlegen"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ─── Debit row ────────────────────────────────────────────────────────────────

function DebitRow({ d }: { d: RentDebitWithPayments }) {
  const isPaid    = d.balance >= -0.01;
  const isPartial = !isPaid && d.paid > 0;

  return (
    <TableRow>
      <TableCell className="text-sm">
        {["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"][d.month - 1]} {d.year}
      </TableCell>
      <TableCell className="text-right tabular-nums text-sm">{formatCurrency(d.total)}</TableCell>
      <TableCell>
        {isPaid ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
            <CheckCircle2 className="w-3.5 h-3.5" />BEZAHLT
          </span>
        ) : isPartial ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600">
            <AlertTriangle className="w-3.5 h-3.5" />TEILWEISE
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600">
            <AlertTriangle className="w-3.5 h-3.5" />OFFEN
          </span>
        )}
      </TableCell>
    </TableRow>
  );
}
