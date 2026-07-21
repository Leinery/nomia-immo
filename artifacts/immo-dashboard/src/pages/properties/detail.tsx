import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import {
  useGetProperty,
  useListUnits,
  useCreateUnit,
  useUpdateUnit,
  useDeleteUnit,
  useUpdateProperty,
  useDeleteProperty,
  useGetPropertyRentOverview,
  useListContracts,
  getGetPropertyQueryKey,
  getListUnitsQueryKey,
  getGetPropertyRentOverviewQueryKey,
  getListPropertiesQueryKey,
} from "@workspace/api-client-react";
import type { UnitRentOverviewItem } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft, Plus, Pencil, Trash2, Home, Car, ParkingSquare,
  Building2, Euro, Maximize2, MapPin, FileText, Loader2, ChevronDown,
  TrendingUp, TrendingDown, Minus, Banknote, CreditCard, Receipt,
} from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import MetersSection from "./meters";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Schemas ──────────────────────────────────────────────────────────────────

const unitSchema = z.object({
  name: z.string().min(1),
  unitType: z.enum(["residential", "commercial", "garage", "parking"]).default("residential"),
  floor: z.coerce.number().optional().nullable(),
  area: z.coerce.number().optional().nullable(),
  rooms: z.coerce.number().optional().nullable(),
  status: z.enum(["vacant", "occupied", "renovation"]).default("vacant"),
  monthlyRent: z.coerce.number().optional().nullable(),
  deposit: z.coerce.number().optional().nullable(),
  description: z.string().optional().nullable(),
});
type UnitFormValues = z.infer<typeof unitSchema>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const UNIT_TYPE_META: Record<string, { label: string; icon: React.ReactNode; plural: string }> = {
  residential: { label: "Wohnung",       icon: <Home className="w-3.5 h-3.5" />,          plural: "Wohnungen"       },
  commercial:  { label: "Gewerbe",       icon: <Building2 className="w-3.5 h-3.5" />,     plural: "Gewerbeeinheiten"},
  garage:      { label: "Garage",        icon: <Car className="w-3.5 h-3.5" />,           plural: "Garagen"         },
  parking:     { label: "Stellplatz",    icon: <ParkingSquare className="w-3.5 h-3.5" />, plural: "Stellplätze"     },
};

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    bezahlt:    { label: "BEZAHLT",    cls: "bg-emerald-100 text-emerald-800 border-emerald-200" },
    teilweise:  { label: "TEILWEISE",  cls: "bg-amber-100 text-amber-800 border-amber-200" },
    offen:      { label: "OFFEN",      cls: "bg-red-100 text-red-700 border-red-200" },
    kein_debit: { label: "KEIN SOLL",  cls: "bg-gray-100 text-gray-600 border-gray-200" },
    leerstand:  { label: "LEERSTAND",  cls: "bg-gray-100 text-gray-500 border-gray-200" },
    kein_vertrag:{ label: "KEIN VTG",  cls: "bg-orange-100 text-orange-700 border-orange-200" },
  };
  const c = cfg[status] ?? { label: status, cls: "bg-gray-100 text-gray-600 border-gray-200" };
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-bold tracking-wide ${c.cls}`}>
      {c.label}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PropertyDetail() {
  const { id } = useParams<{ id: string }>();
  const propertyId = Number(id);
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: property, isLoading: loadingProp } = useGetProperty(propertyId, {
    query: { enabled: !!propertyId, queryKey: getGetPropertyQueryKey(propertyId) },
  });
  const { data: units, isLoading: loadingUnits } = useListUnits(propertyId, {
    query: { enabled: !!propertyId, queryKey: getListUnitsQueryKey(propertyId) },
  });
  const { data: rentOverview, isLoading: loadingOverview } = useGetPropertyRentOverview(propertyId, {
    query: { enabled: !!propertyId },
  });

  // Cashflow
  const { data: cashflow, isLoading: loadingCashflow } = useQuery<{
    kaltmietenTotal: number;
    nebenkostenTotal: number;
    totalIncome: number;
    totalLoanPayments: number;
    cashflow: number;
    contractCount: number;
    loans: {
      id: number;
      lenderName: string | null;
      loanAmount: number;
      currentBalance: number;
      interestRate: number;
      repaymentRate: number;
      fixedRateEndDate: string | null;
      monthlyPayment: number;
    }[];
  }>({
    queryKey: ["cashflow", propertyId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/properties/${propertyId}/cashflow`);
      if (!res.ok) throw new Error("Cashflow konnte nicht geladen werden");
      return res.json();
    },
    enabled: !!propertyId,
  });

  const updatePropertyMutation = useUpdateProperty();
  const deletePropertyMutation = useDeleteProperty();
  const createMutation = useCreateUnit();
  const updateMutation = useUpdateUnit();
  const deleteMutation = useDeleteUnit();

  const [isUnitDialogOpen, setIsUnitDialogOpen] = useState(false);
  const [editingUnitId, setEditingUnitId] = useState<number | null>(null);
  const [activeUnitType, setActiveUnitType] = useState<"residential" | "commercial" | "garage" | "parking">("residential");
  const [editingProp, setEditingProp] = useState(false);

  const unitForm = useForm<UnitFormValues>({
    resolver: zodResolver(unitSchema),
    defaultValues: { status: "vacant", unitType: "residential" },
  });

  // Unit groupings
  const unitGroups = useMemo(() => {
    const groups: Record<string, typeof units> = { residential: [], commercial: [], garage: [], parking: [] };
    for (const u of units ?? []) {
      const t = (u as any).unitType ?? "residential";
      if (t in groups) groups[t]!.push(u);
    }
    return groups;
  }, [units]);

  // Rent overview map by unitId
  const overviewMap = useMemo(() => {
    const m = new Map<number, UnitRentOverviewItem>();
    for (const item of rentOverview ?? []) m.set(item.unitId, item);
    return m;
  }, [rentOverview]);

  // Aggregates from active contracts for Eckdaten
  const totalArea = useMemo(() =>
    (units ?? []).reduce((s, u) => s + ((u as any).area ?? 0), 0), [units]);
  const residentialArea = useMemo(() =>
    (units ?? []).filter(u => (u as any).unitType === "residential" || !(u as any).unitType)
      .reduce((s, u) => s + ((u as any).area ?? 0), 0), [units]);
  const monthlyRent = useMemo(() =>
    (rentOverview ?? []).reduce((s, r) => s + r.currentMonth.soll, 0), [rentOverview]);

  // Filtered sidebar units
  const sidebarUnits = unitGroups[activeUnitType] ?? [];

  // Submit unit form
  const onUnitSubmit = async (data: UnitFormValues) => {
    const payload = {
      ...data,
      floor: data.floor || undefined, area: data.area || undefined,
      rooms: data.rooms || undefined, monthlyRent: data.monthlyRent || undefined,
      deposit: data.deposit || undefined, description: data.description || undefined,
    };
    try {
      if (editingUnitId) {
        await updateMutation.mutateAsync({ id: editingUnitId, data: payload as any });
        toast({ title: "Einheit aktualisiert" });
      } else {
        await createMutation.mutateAsync({ propertyId, data: payload as any });
        toast({ title: "Einheit angelegt" });
      }
      queryClient.invalidateQueries({ queryKey: getListUnitsQueryKey(propertyId) });
      queryClient.invalidateQueries({ queryKey: getGetPropertyRentOverviewQueryKey(propertyId) });
      setIsUnitDialogOpen(false);
    } catch {
      toast({ title: "Fehler beim Speichern", variant: "destructive" });
    }
  };

  const openCreateUnit = (type: "residential" | "commercial" | "garage" | "parking" = activeUnitType) => {
    setEditingUnitId(null);
    unitForm.reset({ status: "vacant", unitType: type });
    setIsUnitDialogOpen(true);
  };

  const openEditUnit = (unit: any) => {
    setEditingUnitId(unit.id);
    unitForm.reset({
      name: unit.name, unitType: unit.unitType ?? "residential",
      floor: unit.floor, area: unit.area, rooms: unit.rooms,
      status: unit.status, monthlyRent: unit.monthlyRent,
      deposit: unit.deposit, description: unit.description ?? "",
    });
    setIsUnitDialogOpen(true);
  };

  const handleDeleteUnit = async (id: number) => {
    if (!confirm("Einheit löschen?")) return;
    try {
      await deleteMutation.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getListUnitsQueryKey(propertyId) });
      queryClient.invalidateQueries({ queryKey: getGetPropertyRentOverviewQueryKey(propertyId) });
      toast({ title: "Einheit gelöscht" });
    } catch {
      toast({ title: "Fehler beim Löschen", variant: "destructive" });
    }
  };

  const handleDeleteProperty = async () => {
    if (!confirm("Immobilie und alle Daten löschen?")) return;
    try {
      await deletePropertyMutation.mutateAsync({ id: propertyId });
      queryClient.invalidateQueries({ queryKey: getListPropertiesQueryKey() });
      navigate(`${BASE}/properties`);
      toast({ title: "Immobilie gelöscht" });
    } catch {
      toast({ title: "Fehler beim Löschen", variant: "destructive" });
    }
  };

  if (loadingProp) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }
  if (!property) {
    return <div className="text-center py-20 text-muted-foreground">Immobilie nicht gefunden.</div>;
  }

  const now = new Date();
  const monthLabel = format(now, "MMMM yyyy", { locale: de });

  return (
    <div className="flex gap-0 h-full min-h-[calc(100vh-4rem)] -m-4 md:-m-6">
      {/* ─── Left sidebar ───────────────────────────────────────────────────── */}
      <div className="w-72 shrink-0 border-r bg-muted/20 flex flex-col overflow-hidden">
        {/* Back + property info */}
        <div className="p-4 border-b bg-background">
          <button
            onClick={() => navigate(`${BASE}/properties`)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-3 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Zurück zur Objektübersicht
          </button>
          <div className="bg-primary/5 border border-primary/10 rounded-lg p-3">
            <p className="font-semibold text-sm text-foreground leading-snug">{property.name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{property.address}</p>
          </div>
          {/* Quick links */}
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => navigate(`${BASE}/contracts`)}
              className="flex-1 flex flex-col items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors py-2 rounded-md hover:bg-primary/5"
            >
              <FileText className="w-4 h-4" />
              Mietverträge
            </button>
            <button
              onClick={() => navigate(`${BASE}/utility-costs`)}
              className="flex-1 flex flex-col items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors py-2 rounded-md hover:bg-primary/5"
            >
              <Euro className="w-4 h-4" />
              Nebenkosten
            </button>
          </div>
        </div>

        {/* Add unit button */}
        <div className="px-3 py-2.5 border-b">
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-primary" onClick={() => openCreateUnit()}>
            <Plus className="w-4 h-4" /> Neue Einheit hinzufügen
          </Button>
        </div>

        {/* Unit type filter */}
        <div className="px-3 py-2 border-b">
          <div className="flex gap-1 flex-wrap">
            {(["residential", "commercial", "garage", "parking"] as const).map((t) => {
              const meta = UNIT_TYPE_META[t];
              const count = unitGroups[t]?.length ?? 0;
              if (count === 0 && t !== activeUnitType) return null;
              return (
                <button
                  key={t}
                  onClick={() => setActiveUnitType(t)}
                  className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors ${
                    activeUnitType === t
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {meta.label} {count}
                </button>
              );
            })}
          </div>
        </div>

        {/* Unit list */}
        <div className="flex-1 overflow-y-auto">
          {loadingUnits ? (
            <div className="p-4 text-center text-xs text-muted-foreground">Lade Einheiten…</div>
          ) : sidebarUnits.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">
              Keine {UNIT_TYPE_META[activeUnitType]?.plural}.
              <br />
              <button onClick={() => openCreateUnit(activeUnitType)} className="text-primary hover:underline mt-1 block mx-auto">
                Jetzt anlegen →
              </button>
            </div>
          ) : (
            sidebarUnits.map((unit: any) => {
              const overview = overviewMap.get(unit.id);
              return (
                <div
                  key={unit.id}
                  className="flex items-center justify-between px-3 py-2.5 border-b hover:bg-muted/30 transition-colors group"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{unit.name}</span>
                      {overview && <StatusBadge status={overview.currentMonth.status} />}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {overview?.tenantName && <span className="truncate block">{overview.tenantName}</span>}
                      {unit.area && <span>{unit.area} m²</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditUnit(unit)}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDeleteUnit(unit.id)}>
                      <Trash2 className="w-3 h-3 text-destructive" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ─── Right content area ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-foreground">{property.name}</h1>
              {/* Unit count badges */}
              {(["residential", "commercial", "garage", "parking"] as const).map((t) => {
                const count = unitGroups[t]?.length ?? 0;
                if (count === 0) return null;
                return (
                  <span key={t} className="inline-flex items-center gap-1 rounded-full bg-muted border px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                    {count} {UNIT_TYPE_META[t].plural}
                  </span>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={() => navigate(`${BASE}/contracts`)}>
              <FileText className="w-3.5 h-3.5 mr-1.5" /> Mietverträge
            </Button>
            <Button variant="outline" size="sm" onClick={handleDeleteProperty}>
              <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Löschen
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Übersicht</TabsTrigger>
            <TabsTrigger value="cashflow">Cashflow</TabsTrigger>
            <TabsTrigger value="meters">Zähler</TabsTrigger>
          </TabsList>

          {/* ── Übersicht tab ─────────────────────────────────────────────── */}
          <TabsContent value="overview" className="space-y-6 mt-4">
            {/* Eckdaten */}
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Eckdaten</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                  <div className="flex items-start gap-3">
                    <Euro className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-lg font-semibold tabular-nums">{formatCurrency(monthlyRent)}</p>
                      <p className="text-xs text-muted-foreground">Kaltmiete (Soll)</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Maximize2 className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-lg font-semibold tabular-nums">
                        {residentialArea > 0 && monthlyRent > 0
                          ? `${(monthlyRent / residentialArea).toFixed(2)} €`
                          : "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">Ø €/m² (Wohnen)</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Building2 className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-lg font-semibold tabular-nums">
                        {totalArea > 0 ? `${totalArea.toLocaleString("de-DE")} m²` : "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">Gesamtfläche</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <MapPin className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium leading-snug">{property.address}</p>
                      <p className="text-xs text-muted-foreground">Adresse</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Mietübersicht current month */}
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Mietübersicht — {monthLabel}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                {loadingOverview ? (
                  <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" /> Lade…
                  </div>
                ) : (
                  <Table>
                    <TableHeader className="bg-muted/20">
                      <TableRow>
                        <TableHead>Einheit</TableHead>
                        <TableHead className="hidden sm:table-cell">Mieter</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Soll</TableHead>
                        <TableHead className="text-right hidden sm:table-cell">Gezahlt</TableHead>
                        <TableHead className="text-right hidden md:table-cell">Differenz</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(rentOverview ?? []).filter(r => r.unitType === activeUnitType).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8 text-sm text-muted-foreground">
                            Keine Einheiten vom Typ {UNIT_TYPE_META[activeUnitType]?.plural} mit Sollstellungen.
                          </TableCell>
                        </TableRow>
                      ) : (
                        (rentOverview ?? [])
                          .filter((r) => r.unitType === activeUnitType)
                          .map((r) => {
                            const diff = r.currentMonth.gezahlt - r.currentMonth.soll;
                            return (
                              <TableRow key={r.unitId}>
                                <TableCell className="font-medium text-sm">{r.unitName}</TableCell>
                                <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                                  {r.tenantName ?? "—"}
                                </TableCell>
                                <TableCell><StatusBadge status={r.currentMonth.status} /></TableCell>
                                <TableCell className="text-right tabular-nums text-sm">
                                  {r.currentMonth.soll > 0 ? formatCurrency(r.currentMonth.soll) : "—"}
                                </TableCell>
                                <TableCell className="text-right tabular-nums text-sm hidden sm:table-cell">
                                  {r.currentMonth.gezahlt > 0 ? formatCurrency(r.currentMonth.gezahlt) : "—"}
                                </TableCell>
                                <TableCell className={`text-right tabular-nums text-sm hidden md:table-cell ${diff < -0.01 ? "text-red-600" : diff > 0.01 ? "text-emerald-600" : "text-muted-foreground"}`}>
                                  {r.currentMonth.soll > 0
                                    ? (diff > 0.01 ? "+" : "") + formatCurrency(diff)
                                    : "—"}
                                </TableCell>
                              </TableRow>
                            );
                          })
                      )}
                    </TableBody>
                    {rentOverview && rentOverview.filter(r => r.unitType === activeUnitType).some(r => r.currentMonth.soll > 0) && (
                      <tfoot>
                        <tr className="border-t-2 bg-muted/20 text-sm font-semibold">
                          <td className="px-4 py-2.5" colSpan={3}>Gesamt</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">
                            {formatCurrency(rentOverview.filter(r => r.unitType === activeUnitType).reduce((s, r) => s + r.currentMonth.soll, 0))}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums hidden sm:table-cell">
                            {formatCurrency(rentOverview.filter(r => r.unitType === activeUnitType).reduce((s, r) => s + r.currentMonth.gezahlt, 0))}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums hidden md:table-cell">
                            {(() => {
                              const d = rentOverview.filter(r => r.unitType === activeUnitType).reduce((s, r) => s + r.currentMonth.gezahlt - r.currentMonth.soll, 0);
                              return <span className={d < -0.01 ? "text-red-600" : d > 0.01 ? "text-emerald-600" : ""}>{(d > 0.01 ? "+" : "") + formatCurrency(d)}</span>;
                            })()}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Cashflow tab ──────────────────────────────────────────────── */}
          <TabsContent value="cashflow" className="space-y-5 mt-4">
            {loadingCashflow ? (
              <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground text-sm">
                <Loader2 className="w-5 h-5 animate-spin" /> Lade Cashflow…
              </div>
            ) : !cashflow ? (
              <div className="text-center py-16 text-muted-foreground text-sm">Keine Daten verfügbar.</div>
            ) : (
              <>
                {/* ── Cashflow-Ampel ─────────────────────────────────────────── */}
                <Card className={`shadow-sm border-2 ${cashflow.cashflow >= 0 ? "border-emerald-200 bg-emerald-50/50" : "border-red-200 bg-red-50/50"}`}>
                  <CardContent className="pt-6 pb-5">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className={`rounded-full p-3 ${cashflow.cashflow >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                          {cashflow.cashflow > 0.01
                            ? <TrendingUp className="w-7 h-7" />
                            : cashflow.cashflow < -0.01
                              ? <TrendingDown className="w-7 h-7" />
                              : <Minus className="w-7 h-7" />}
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Monatlicher Cashflow</p>
                          <p className={`text-3xl font-bold tabular-nums ${cashflow.cashflow >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                            {cashflow.cashflow >= 0 ? "+" : ""}{formatCurrency(cashflow.cashflow)}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {cashflow.cashflow >= 0 ? "Cashflow positiv" : "Cashflow negativ"} · {cashflow.contractCount} aktive Mietverträge
                          </p>
                        </div>
                      </div>
                      {/* Mini-Formel */}
                      <div className="flex items-center gap-2 text-sm text-muted-foreground bg-background/80 border rounded-lg px-4 py-2.5 shrink-0">
                        <span className="tabular-nums text-foreground font-medium">{formatCurrency(cashflow.kaltmietenTotal)}</span>
                        <span className="text-muted-foreground">Kaltmiete</span>
                        <span className="text-muted-foreground">−</span>
                        <span className="tabular-nums text-foreground font-medium">{formatCurrency(cashflow.totalLoanPayments)}</span>
                        <span className="text-muted-foreground">Kredite</span>
                        <span className="text-muted-foreground">=</span>
                        <span className={`tabular-nums font-bold ${cashflow.cashflow >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                          {cashflow.cashflow >= 0 ? "+" : ""}{formatCurrency(cashflow.cashflow)}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* ── Einnahmen ──────────────────────────────────────────────── */}
                <Card className="shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                      <Banknote className="w-4 h-4" /> Einnahmen (monatlich)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="bg-muted/30 rounded-lg p-4">
                        <p className="text-xs text-muted-foreground mb-1">Kaltmiete</p>
                        <p className="text-xl font-bold tabular-nums text-foreground">{formatCurrency(cashflow.kaltmietenTotal)}</p>
                      </div>
                      <div className="bg-muted/30 rounded-lg p-4">
                        <p className="text-xs text-muted-foreground mb-1">Nebenkostenvorauszahlung</p>
                        <p className="text-xl font-bold tabular-nums text-foreground">{formatCurrency(cashflow.nebenkostenTotal)}</p>
                      </div>
                      <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-4">
                        <p className="text-xs text-muted-foreground mb-1">Gesamteinnahmen</p>
                        <p className="text-xl font-bold tabular-nums text-emerald-700">{formatCurrency(cashflow.totalIncome)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* ── Kreditraten ────────────────────────────────────────────── */}
                <Card className="shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                      <CreditCard className="w-4 h-4" /> Kreditverpflichtungen (monatlich)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {cashflow.loans.length === 0 ? (
                      <div className="px-6 py-8 text-center text-sm text-muted-foreground">
                        Keine Kredite für diese Immobilie hinterlegt.
                      </div>
                    ) : (
                      <Table>
                        <TableHeader className="bg-muted/20">
                          <TableRow>
                            <TableHead>Kreditgeber</TableHead>
                            <TableHead className="text-right">Darlehensbetrag</TableHead>
                            <TableHead className="text-right hidden sm:table-cell">Restschuld</TableHead>
                            <TableHead className="text-right hidden md:table-cell">Zins</TableHead>
                            <TableHead className="text-right hidden md:table-cell">Tilgung</TableHead>
                            <TableHead className="text-right">Rate / Monat</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {cashflow.loans.map((loan) => (
                            <TableRow key={loan.id}>
                              <TableCell className="font-medium text-sm">{loan.lenderName ?? "Unbekannte Bank"}</TableCell>
                              <TableCell className="text-right tabular-nums text-sm">{formatCurrency(loan.loanAmount)}</TableCell>
                              <TableCell className="text-right tabular-nums text-sm hidden sm:table-cell">
                                {loan.currentBalance !== loan.loanAmount
                                  ? <span className="text-amber-600">{formatCurrency(loan.currentBalance)}</span>
                                  : formatCurrency(loan.currentBalance)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums text-sm hidden md:table-cell">{loan.interestRate.toFixed(2)} %</TableCell>
                              <TableCell className="text-right tabular-nums text-sm hidden md:table-cell">{loan.repaymentRate.toFixed(2)} %</TableCell>
                              <TableCell className="text-right tabular-nums text-sm font-semibold text-red-600">
                                − {formatCurrency(loan.monthlyPayment)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                        {cashflow.loans.length > 1 && (
                          <tfoot>
                            <tr className="border-t-2 bg-muted/20 text-sm font-semibold">
                              <td className="px-4 py-2.5" colSpan={5}>Gesamt Kreditraten</td>
                              <td className="px-4 py-2.5 text-right tabular-nums text-red-600">
                                − {formatCurrency(cashflow.totalLoanPayments)}
                              </td>
                            </tr>
                          </tfoot>
                        )}
                      </Table>
                    )}
                  </CardContent>
                </Card>

                {/* ── Hinweis ────────────────────────────────────────────────── */}
                <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">
                  <Receipt className="w-4 h-4 shrink-0 mt-0.5" />
                  <p>
                    Der Cashflow berücksichtigt Kaltmiete abzüglich monatlicher Kreditraten (Zins + Tilgung).
                    Nicht enthalten: Verwaltungskosten, Instandhaltungsrücklagen, Versicherungen, Steuer.
                    Rate = Darlehensbetrag × (Zinssatz + Tilgungssatz) ÷ 1.200.
                  </p>
                </div>
              </>
            )}
          </TabsContent>

          {/* ── Zähler tab ────────────────────────────────────────────────── */}
          <TabsContent value="meters" className="mt-4">
            <MetersSection
              propertyId={property.id}
              units={(units ?? []).map((u: any) => ({ id: u.id, name: u.name, unitType: u.unitType ?? "residential" }))}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* ─── Unit dialog ──────────────────────────────────────────────────────── */}
      <Dialog open={isUnitDialogOpen} onOpenChange={setIsUnitDialogOpen}>
        <DialogContent className="sm:max-w-[540px]">
          <DialogHeader>
            <DialogTitle>{editingUnitId ? "Einheit bearbeiten" : "Neue Einheit"}</DialogTitle>
            <DialogDescription>Wohnung, Garage oder Stellplatz anlegen.</DialogDescription>
          </DialogHeader>
          <Form {...unitForm}>
            <form onSubmit={unitForm.handleSubmit(onUnitSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={unitForm.control} name="unitType" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Einheitentyp</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="residential">Wohnung</SelectItem>
                        <SelectItem value="commercial">Gewerbeeinheit</SelectItem>
                        <SelectItem value="garage">Garage</SelectItem>
                        <SelectItem value="parking">Stellplatz</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={unitForm.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bezeichnung</FormLabel>
                    <FormControl><Input placeholder="z.B. WHG 01 OG links" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={unitForm.control} name="status" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="vacant">Leerstand</SelectItem>
                        <SelectItem value="occupied">Vermietet</SelectItem>
                        <SelectItem value="renovation">Renovierung</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={unitForm.control} name="floor" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Etage</FormLabel>
                    <FormControl><Input type="number" placeholder="z.B. 1" {...field} value={field.value ?? ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={unitForm.control} name="area" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fläche (m²)</FormLabel>
                    <FormControl><Input type="number" step="0.1" placeholder="z.B. 75.5" {...field} value={field.value ?? ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={unitForm.control} name="rooms" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Zimmer</FormLabel>
                    <FormControl><Input type="number" step="0.5" placeholder="z.B. 3" {...field} value={field.value ?? ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={unitForm.control} name="monthlyRent" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kaltmiete (€)</FormLabel>
                    <FormControl><Input type="number" step="0.01" {...field} value={field.value ?? ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={unitForm.control} name="deposit" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kaution (€)</FormLabel>
                    <FormControl><Input type="number" step="0.01" {...field} value={field.value ?? ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={unitForm.control} name="description" render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Notizen</FormLabel>
                    <FormControl><Input placeholder="Optional" {...field} value={field.value ?? ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" onClick={() => setIsUnitDialogOpen(false)}>Abbrechen</Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {editingUnitId ? "Speichern" : "Anlegen"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
