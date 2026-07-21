import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Pencil, Trash2, ExternalLink } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { formatDate, formatCurrency } from "@/lib/utils";
import {
  useListContracts, useCreateContract, useUpdateContract, useDeleteContract,
  getListContractsQueryKey,
  useListUnits, useListTenants, useListProperties,
} from "@workspace/api-client-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Schema ───────────────────────────────────────────────────────────────────

const contractSchema = z.object({
  unitId: z.coerce.number().min(1, "Einheit erforderlich"),
  tenantId: z.coerce.number().min(1, "Mieter erforderlich"),
  monthlyRent: z.coerce.number().min(0),
  nebenkostenvorauszahlung: z.coerce.number().min(0).default(0),
  heizkostenvorauszahlung: z.coerce.number().min(0).default(0),
  deposit: z.coerce.number().min(0).optional().nullable(),
  startDate: z.string().min(1, "Startdatum erforderlich"),
  endDate: z.string().optional().nullable(),
  status: z.enum(["active", "terminated", "pending"]).default("active"),
  notes: z.string().optional().nullable(),
});
type ContractFormValues = z.infer<typeof contractSchema>;

// ─── Main component ───────────────────────────────────────────────────────────

export default function ContractsList() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data: contracts, isLoading } = useListContracts();
  const { data: units }      = useListUnits();
  const { data: tenants }    = useListTenants();
  const { data: properties } = useListProperties();

  const createMutation = useCreateContract();
  const updateMutation = useUpdateContract();
  const deleteMutation = useDeleteContract();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Lookup maps
  const unitMap   = Object.fromEntries((units ?? []).map((u) => [u.id, u]));
  const tenantMap = Object.fromEntries((tenants ?? []).map((t) => [t.id, t]));
  const propMap   = Object.fromEntries((properties ?? []).map((p) => [p.id, p]));

  const form = useForm<ContractFormValues>({
    resolver: zodResolver(contractSchema),
    defaultValues: {
      status: "active",
      nebenkostenvorauszahlung: 0,
      heizkostenvorauszahlung: 0,
      deposit: null,
    },
  });

  const openCreate = () => {
    form.reset({ status: "active", nebenkostenvorauszahlung: 0, heizkostenvorauszahlung: 0, deposit: null });
    setEditingId(null);
    setIsDialogOpen(true);
  };

  const openEdit = (c: NonNullable<typeof contracts>[number]) => {
    form.reset({
      unitId: c.unitId,
      tenantId: c.tenantId,
      monthlyRent: c.monthlyRent,
      nebenkostenvorauszahlung: c.nebenkostenvorauszahlung ?? 0,
      heizkostenvorauszahlung: c.heizkostenvorauszahlung ?? 0,
      deposit: c.deposit ?? null,
      startDate: c.startDate instanceof Date
        ? c.startDate.toISOString().split("T")[0]
        : String(c.startDate),
      endDate: c.endDate
        ? (c.endDate instanceof Date ? c.endDate.toISOString().split("T")[0] : String(c.endDate))
        : null,
      status: c.status,
      notes: c.notes ?? null,
    });
    setEditingId(c.id);
    setIsDialogOpen(true);
  };

  const onSubmit = async (data: ContractFormValues) => {
    try {
      if (editingId) {
        await updateMutation.mutateAsync({
          params: { id: editingId },
          data: {
            ...data,
            startDate: new Date(data.startDate),
            endDate: data.endDate ? new Date(data.endDate) : undefined,
            deposit: data.deposit ?? undefined,
            notes: data.notes ?? undefined,
          },
        });
        toast({ title: "Vertrag aktualisiert" });
      } else {
        await createMutation.mutateAsync({
          data: {
            ...data,
            startDate: new Date(data.startDate),
            endDate: data.endDate ? new Date(data.endDate) : undefined,
            deposit: data.deposit ?? undefined,
            notes: data.notes ?? undefined,
          },
        });
        toast({ title: "Vertrag angelegt" });
      }
      queryClient.invalidateQueries({ queryKey: getListContractsQueryKey() });
      setIsDialogOpen(false);
    } catch {
      toast({ title: "Fehler beim Speichern", variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Vertrag wirklich löschen?")) return;
    try {
      await deleteMutation.mutateAsync({ params: { id } });
      queryClient.invalidateQueries({ queryKey: getListContractsQueryKey() });
      toast({ title: "Vertrag gelöscht" });
    } catch {
      toast({ title: "Fehler beim Löschen", variant: "destructive" });
    }
  };

  function statusBadge(status: string) {
    if (status === "active")     return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs font-normal">Aktiv</Badge>;
    if (status === "terminated") return <Badge className="bg-red-100 text-red-800 border-red-200 text-xs font-normal">Beendet</Badge>;
    return <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs font-normal">Ausstehend</Badge>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Mietverträge</h1>
          <p className="text-muted-foreground mt-1">
            Alle Mietverhältnisse — klicke auf einen Vertrag für Sollstellungen & Zahlungsverlauf.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="w-4 h-4" /> Neuer Vertrag
        </Button>
      </div>

      {/* Table */}
      <Card className="shadow-sm">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead>Mieter</TableHead>
                <TableHead className="hidden sm:table-cell">Einheit / Immobilie</TableHead>
                <TableHead className="hidden md:table-cell">Laufzeit</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right hidden sm:table-cell">Kaltmiete</TableHead>
                <TableHead className="text-right hidden md:table-cell">NKV</TableHead>
                <TableHead className="text-right">Gesamt</TableHead>
                <TableHead className="w-20 text-right">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">Lade Verträge…</TableCell>
                </TableRow>
              ) : !contracts?.length ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-16 text-muted-foreground text-sm">Keine Verträge vorhanden.</TableCell>
                </TableRow>
              ) : (
                contracts.map((c) => {
                  const unit   = unitMap[c.unitId];
                  const tenant = tenantMap[c.tenantId];
                  const prop   = unit ? propMap[unit.propertyId] : undefined;
                  const gesamt = c.monthlyRent + (c.nebenkostenvorauszahlung ?? 0) + (c.heizkostenvorauszahlung ?? 0);
                  return (
                    <TableRow
                      key={c.id}
                      className="group cursor-pointer hover:bg-muted/30"
                      onClick={() => navigate(`${BASE}/contracts/${c.id}`)}
                    >
                      <TableCell className="font-medium">{tenant?.name ?? `Mieter ${c.tenantId}`}</TableCell>
                      <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                        <div>{unit?.name ?? `Einheit ${c.unitId}`}</div>
                        {prop && <div className="text-xs opacity-70">{prop.name}</div>}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground whitespace-nowrap">
                        {formatDate(c.startDate)}
                        {" – "}
                        {c.endDate ? formatDate(c.endDate) : "∞"}
                      </TableCell>
                      <TableCell>{statusBadge(c.status)}</TableCell>
                      <TableCell className="text-right hidden sm:table-cell text-sm tabular-nums">{formatCurrency(c.monthlyRent)}</TableCell>
                      <TableCell className="text-right hidden md:table-cell text-sm tabular-nums text-muted-foreground">{formatCurrency(c.nebenkostenvorauszahlung ?? 0)}</TableCell>
                      <TableCell className="text-right text-sm font-medium tabular-nums">{formatCurrency(gesamt)}</TableCell>
                      <TableCell className="text-right">
                        <div
                          className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`${BASE}/contracts/${c.id}`)}>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(c.id)}>
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create / Edit dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[540px]">
          <DialogHeader>
            <DialogTitle>{editingId ? "Vertrag bearbeiten" : "Neuer Mietvertrag"}</DialogTitle>
            <DialogDescription>Kaltmiete und NKV werden für die Sollstellungen verwendet.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {/* Tenant */}
                <FormField control={form.control} name="tenantId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mieter</FormLabel>
                    <Select value={field.value ? String(field.value) : ""} onValueChange={(v) => field.onChange(parseInt(v))}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Mieter wählen…" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {(tenants ?? []).map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* Unit */}
                <FormField control={form.control} name="unitId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Einheit</FormLabel>
                    <Select value={field.value ? String(field.value) : ""} onValueChange={(v) => field.onChange(parseInt(v))}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Einheit wählen…" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {(units ?? []).map((u) => {
                          const p = propMap[u.propertyId];
                          return <SelectItem key={u.id} value={String(u.id)}>{u.name}{p ? ` (${p.name})` : ""}</SelectItem>;
                        })}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* Kaltmiete */}
                <FormField control={form.control} name="monthlyRent" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kaltmiete (€)</FormLabel>
                    <FormControl><Input type="number" step="0.01" placeholder="0.00" {...field} value={field.value ?? ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* NKV */}
                <FormField control={form.control} name="nebenkostenvorauszahlung" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nebenkosten VZ (€)</FormLabel>
                    <FormControl><Input type="number" step="0.01" placeholder="0.00" {...field} value={field.value ?? ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* HKV */}
                <FormField control={form.control} name="heizkostenvorauszahlung" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Heizkosten VZ (€)</FormLabel>
                    <FormControl><Input type="number" step="0.01" placeholder="0.00" {...field} value={field.value ?? ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* Deposit */}
                <FormField control={form.control} name="deposit" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kaution (€)</FormLabel>
                    <FormControl><Input type="number" step="0.01" placeholder="Optional" {...field} value={field.value ?? ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* Status */}
                <FormField control={form.control} name="status" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="active">Aktiv</SelectItem>
                        <SelectItem value="pending">Ausstehend</SelectItem>
                        <SelectItem value="terminated">Beendet</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* Start date */}
                <FormField control={form.control} name="startDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Beginn</FormLabel>
                    <FormControl><Input type="date" {...field} value={field.value ?? ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* End date */}
                <FormField control={form.control} name="endDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ende (leer = unbefristet)</FormLabel>
                    <FormControl><Input type="date" {...field} value={field.value ?? ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* Notes */}
                <FormField control={form.control} name="notes" render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Notizen</FormLabel>
                    <FormControl><Input placeholder="Optional" {...field} value={field.value ?? ""} /></FormControl>
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
