import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import {
  useListProperties,
  useCreateProperty,
  useUpdateProperty,
  useDeleteProperty,
  getListPropertiesQueryKey,
  type PropertyWithSummary,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Building2, Plus, Pencil, Trash2, Home, Building, Factory,
  Map as MapIcon, Search, ChevronRight, AreaChart,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Schema ───────────────────────────────────────────────────────────────────

const propertySchema = z.object({
  name: z.string().min(1, "Name ist erforderlich"),
  address: z.string().min(1, "Adresse ist erforderlich"),
  type: z.enum(["apartment_building", "house", "commercial", "land"]),
  description: z.string().optional(),
  purchasePrice: z.coerce.number().optional().nullable(),
  purchaseYear: z.coerce.number().optional().nullable(),
  owner: z.string().optional().nullable(),
});
type PropertyFormValues = z.infer<typeof propertySchema>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TYPE_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  apartment_building: { label: "Mehrfamilienhaus", icon: <Building className="w-3.5 h-3.5" />, color: "bg-blue-50 text-blue-700 border-blue-200" },
  house:             { label: "Einfamilienhaus",   icon: <Home className="w-3.5 h-3.5" />,     color: "bg-green-50 text-green-700 border-green-200" },
  commercial:        { label: "Gewerbe",            icon: <Factory className="w-3.5 h-3.5" />,  color: "bg-amber-50 text-amber-700 border-amber-200" },
  land:              { label: "Grundstück",         icon: <MapIcon className="w-3.5 h-3.5" />,  color: "bg-stone-50 text-stone-600 border-stone-200" },
};

function UnitBadges({ unitsByType }: { unitsByType?: { residential: number; garage: number; parking: number; commercial?: number } }) {
  if (!unitsByType) return <span className="text-muted-foreground text-sm">—</span>;
  const parts: string[] = [];
  if (unitsByType.commercial  > 0) parts.push(`${unitsByType.commercial} Gew.`);
  if (unitsByType.residential > 0) parts.push(`${unitsByType.residential} Whg.`);
  if (unitsByType.garage > 0)      parts.push(`${unitsByType.garage} Gar.`);
  if (unitsByType.parking > 0)     parts.push(`${unitsByType.parking} Stpl.`);
  return <span className="text-sm tabular-nums">{parts.join(" · ") || "—"}</span>;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PropertiesList() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data: rawProperties, isLoading } = useListProperties();
  const properties = rawProperties as PropertyWithSummary[] | undefined;

  const createMutation = useCreateProperty();
  const updateMutation = useUpdateProperty();
  const deleteMutation = useDeleteProperty();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("all");

  const form = useForm<PropertyFormValues>({
    resolver: zodResolver(propertySchema),
    defaultValues: { name: "", address: "", type: "apartment_building" },
  });

  const uniqueOwners = useMemo(() =>
    [...new Set((properties ?? []).map(p => (p as PropertyWithSummary).owner).filter(Boolean) as string[])].sort(),
  [properties]);

  const filtered = useMemo(() => {
    if (!properties) return [];
    let list = properties as PropertyWithSummary[];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.address.toLowerCase().includes(q));
    }
    if (ownerFilter !== "all") {
      list = list.filter((p) => (p.owner ?? "") === ownerFilter);
    }
    return list;
  }, [properties, search, ownerFilter]);

  // Totals
  const totals = useMemo(() => ({
    units: filtered.reduce((s, p) => s + ((p as any).unitsByType?.residential ?? 0) + ((p as any).unitsByType?.garage ?? 0) + ((p as any).unitsByType?.parking ?? 0), 0),
    area: filtered.reduce((s, p) => s + ((p as any).totalArea ?? 0), 0),
    rent: filtered.reduce((s, p) => s + ((p as any).monthlyRent ?? 0), 0),
  }), [filtered]);

  const onSubmit = async (data: PropertyFormValues) => {
    const payload = { ...data, purchasePrice: data.purchasePrice || undefined, purchaseYear: data.purchaseYear || undefined, owner: data.owner || null };
    try {
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, data: payload as any });
        toast({ title: "Immobilie aktualisiert" });
      } else {
        await createMutation.mutateAsync({ data: payload as any });
        toast({ title: "Immobilie angelegt" });
      }
      queryClient.invalidateQueries({ queryKey: getListPropertiesQueryKey() });
      setIsDialogOpen(false);
    } catch {
      toast({ title: "Fehler beim Speichern", variant: "destructive" });
    }
  };

  const openEdit = (p: PropertyWithSummary) => {
    setEditingId(p.id);
    form.reset({ name: p.name, address: p.address, type: p.type as any, description: p.description ?? "", purchasePrice: p.purchasePrice ?? undefined, purchaseYear: p.purchaseYear ?? undefined, owner: p.owner ?? "" });
    setIsDialogOpen(true);
  };

  const openCreate = () => {
    setEditingId(null);
    form.reset({ name: "", address: "", type: "apartment_building", owner: "" });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Immobilie wirklich löschen? Alle zugehörigen Daten gehen verloren.")) return;
    try {
      await deleteMutation.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getListPropertiesQueryKey() });
      toast({ title: "Immobilie gelöscht" });
    } catch {
      toast({ title: "Fehler beim Löschen", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Objekte</h1>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="w-4 h-4" /> Objekt hinzufügen
        </Button>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Objekte durchsuchen..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {uniqueOwners.length > 0 && (
          <Select value={ownerFilter} onValueChange={setOwnerFilter}>
            <SelectTrigger className="w-52 h-9 text-sm">
              <SelectValue placeholder="Eigentümer filtern" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Eigentümer</SelectItem>
              {uniqueOwners.map((o) => (
                <SelectItem key={o} value={o}>{o}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Table */}
      <Card className="shadow-sm overflow-hidden">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Objekt</TableHead>
                <TableHead className="hidden sm:table-cell">Einheiten</TableHead>
                <TableHead className="text-right hidden md:table-cell">Gesamtfläche</TableHead>
                <TableHead className="hidden lg:table-cell">Kategorie</TableHead>
                <TableHead className="hidden xl:table-cell">Eigentümer</TableHead>
                <TableHead className="text-right">Monatl. Miete</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    Lade Immobilien…
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-16 text-muted-foreground">
                    <Building2 className="w-10 h-10 mx-auto mb-3 opacity-20" />
                    <p className="text-sm">{search ? "Keine Treffer für diese Suche." : "Noch keine Immobilien. Leg dein erstes Objekt an."}</p>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((property) => {
                  const meta = TYPE_META[property.type] ?? TYPE_META.apartment_building;
                  const ps = property as PropertyWithSummary;
                  return (
                    <TableRow
                      key={property.id}
                      className="group cursor-pointer hover:bg-muted/20 transition-colors"
                      onClick={() => navigate(`${BASE}/properties/${property.id}`)}
                    >
                      <TableCell className="text-center">
                        <Building2 className="w-4 h-4 text-muted-foreground/40 mx-auto" />
                      </TableCell>
                      <TableCell>
                        <div className="font-semibold text-foreground">{property.name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{property.address}</div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <UnitBadges unitsByType={ps.unitsByType} />
                      </TableCell>
                      <TableCell className="text-right hidden md:table-cell text-sm tabular-nums text-muted-foreground">
                        {ps.totalArea != null ? `${ps.totalArea.toLocaleString("de-DE")} m²` : "—"}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${meta.color}`}>
                          {meta.icon}{meta.label}
                        </span>
                      </TableCell>
                      <TableCell className="hidden xl:table-cell text-sm text-muted-foreground">
                        {ps.owner ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="text-sm font-semibold tabular-nums">
                          {ps.monthlyRent != null ? formatCurrency(ps.monthlyRent) : "—"}
                        </div>
                        <div className="text-xs text-muted-foreground">Soll/Monat</div>
                      </TableCell>
                      <TableCell>
                        <div
                          className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(property)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(property.id)}>
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </Button>
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
            {/* Totals footer */}
            {filtered.length > 0 && (
              <tfoot>
                <tr className="border-t-2 bg-muted/20 font-semibold text-sm">
                  <td className="px-4 py-2.5" colSpan={2}>
                    {filtered.length} {filtered.length === 1 ? "Objekt" : "Objekte"}
                  </td>
                  <td className="px-4 py-2.5 hidden sm:table-cell tabular-nums">
                    {totals.units} Einheiten
                  </td>
                  <td className="px-4 py-2.5 text-right hidden md:table-cell tabular-nums text-muted-foreground">
                    {totals.area.toLocaleString("de-DE")} m²
                  </td>
                  <td className="hidden lg:table-cell" />
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {formatCurrency(totals.rent)}
                    <div className="text-xs font-normal text-muted-foreground">Mieteinnahmen (Soll)</div>
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </Table>
        </CardContent>
      </Card>

      {/* Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{editingId ? "Objekt bearbeiten" : "Neues Objekt anlegen"}</DialogTitle>
            <DialogDescription>Stammdaten der Immobilie.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Objektname</FormLabel>
                    <FormControl><Input placeholder="z.B. Am Anger 16-18" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="address" render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Adresse</FormLabel>
                    <FormControl><Input placeholder="Straße, PLZ Ort" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="type" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Objekttyp</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="apartment_building">Mehrfamilienhaus</SelectItem>
                        <SelectItem value="house">Einfamilienhaus</SelectItem>
                        <SelectItem value="commercial">Gewerbe</SelectItem>
                        <SelectItem value="land">Grundstück</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="purchaseYear" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kaufjahr</FormLabel>
                    <FormControl><Input type="number" placeholder="z.B. 2019" {...field} value={field.value ?? ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="purchasePrice" render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Kaufpreis (€)</FormLabel>
                    <FormControl><Input type="number" step="1000" placeholder="z.B. 850000" {...field} value={field.value ?? ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="owner" render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Eigentümer (optional)</FormLabel>
                    <FormControl><Input placeholder="z.B. Leinery Group GmbH" {...field} value={field.value ?? ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="description" render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Notizen (optional)</FormLabel>
                    <FormControl><Input placeholder="Freitext" {...field} value={field.value ?? ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Abbrechen</Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {editingId ? "Speichern" : "Anlegen"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
