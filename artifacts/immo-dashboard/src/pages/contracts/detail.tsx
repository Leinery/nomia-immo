import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft, CheckCircle2, XCircle, Clock, Pencil, X, Save,
  RefreshCw, TrendingDown, TrendingUp, Euro, Loader2, AlertTriangle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { formatDate, formatCurrency } from "@/lib/utils";
import {
  useGetContract, useUpdateContract, getGetContractQueryKey,
  useListUnits, useListTenants, useListProperties,
  useListRentDebits, useGenerateRentDebits, useUpdateRentDebit,
  getListRentDebitsQueryKey,
} from "@workspace/api-client-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const MONTHS_DE = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

// ─── Edit contract form ───────────────────────────────────────────────────────

const contractSchema = z.object({
  monthlyRent: z.coerce.number().min(0),
  nebenkostenvorauszahlung: z.coerce.number().min(0),
  deposit: z.coerce.number().min(0).optional().nullable(),
  startDate: z.string().min(1),
  endDate: z.string().optional().nullable(),
  status: z.enum(["active", "terminated", "pending"]),
  notes: z.string().optional().nullable(),
});
type ContractFormValues = z.infer<typeof contractSchema>;

// ─── Edit debit row form ──────────────────────────────────────────────────────

const debitSchema = z.object({
  kaltmiete: z.coerce.number().min(0),
  nebenkostenvorauszahlung: z.coerce.number().min(0),
  notes: z.string().optional().nullable(),
});
type DebitFormValues = z.infer<typeof debitSchema>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === "active")
    return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Aktiv</Badge>;
  if (status === "terminated")
    return <Badge className="bg-red-100 text-red-800 border-red-200">Beendet</Badge>;
  return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Ausstehend</Badge>;
}

function BalanceBadge({ balance, total }: { balance: number; total: number }) {
  if (total === 0) return <span className="text-muted-foreground text-xs">—</span>;
  if (balance >= 0)
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
        <CheckCircle2 className="w-3.5 h-3.5" /> Bezahlt
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600">
      <AlertTriangle className="w-3.5 h-3.5" /> {formatCurrency(Math.abs(balance))} offen
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ContractDetail() {
  const { id } = useParams<{ id: string }>();
  const contractId = parseInt(id ?? "0");
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [editingContract, setEditingContract] = useState(false);
  const [editingDebitId, setEditingDebitId] = useState<number | null>(null);
  const [generatingDebits, setGeneratingDebits] = useState(false);

  const { data: contract, isLoading: loadingContract } = useGetContract(contractId);
  const { data: debits, isLoading: loadingDebits } = useListRentDebits(contractId);
  const { data: units }      = useListUnits();
  const { data: tenants }    = useListTenants();
  const { data: properties } = useListProperties();

  const updateContractMutation = useUpdateContract();
  const generateMutation       = useGenerateRentDebits();
  const updateDebitMutation    = useUpdateRentDebit();

  const unit     = units?.find((u) => u.id === contract?.unitId);
  const tenant   = tenants?.find((t) => t.id === contract?.tenantId);
  const property = properties?.find((p) => p.id === unit?.propertyId);

  // ── Contract edit form ────────────────────────────────────────────────────

  const contractForm = useForm<ContractFormValues>({
    resolver: zodResolver(contractSchema),
    values: contract
      ? {
          monthlyRent: contract.monthlyRent,
          nebenkostenvorauszahlung: contract.nebenkostenvorauszahlung ?? 0,
          deposit: contract.deposit ?? null,
          startDate: contract.startDate instanceof Date
            ? contract.startDate.toISOString().split("T")[0]
            : String(contract.startDate),
          endDate: contract.endDate
            ? (contract.endDate instanceof Date ? contract.endDate.toISOString().split("T")[0] : String(contract.endDate))
            : null,
          status: contract.status,
          notes: contract.notes ?? null,
        }
      : undefined,
  });

  const saveContract = contractForm.handleSubmit(async (data) => {
    try {
      await updateContractMutation.mutateAsync({
        params: { id: contractId },
        data: {
          ...data,
          startDate: new Date(data.startDate),
          endDate: data.endDate ? new Date(data.endDate) : undefined,
          deposit: data.deposit ?? undefined,
          notes: data.notes ?? undefined,
        },
      });
      queryClient.invalidateQueries({ queryKey: getGetContractQueryKey(contractId) });
      toast({ title: "Vertrag gespeichert" });
      setEditingContract(false);
    } catch {
      toast({ title: "Fehler beim Speichern", variant: "destructive" });
    }
  });

  // ── Debit edit form ───────────────────────────────────────────────────────

  const debitForm = useForm<DebitFormValues>({ resolver: zodResolver(debitSchema) });

  function startEditDebit(d: NonNullable<typeof debits>[number]) {
    debitForm.reset({
      kaltmiete: d.kaltmiete,
      nebenkostenvorauszahlung: d.nebenkostenvorauszahlung,
      notes: d.notes ?? null,
    });
    setEditingDebitId(d.id);
  }

  const saveDebit = debitForm.handleSubmit(async (data) => {
    if (!editingDebitId) return;
    try {
      await updateDebitMutation.mutateAsync({ id: editingDebitId, body: data });
      queryClient.invalidateQueries({ queryKey: getListRentDebitsQueryKey(contractId) });
      toast({ title: "Sollstellung aktualisiert" });
      setEditingDebitId(null);
    } catch {
      toast({ title: "Fehler beim Speichern", variant: "destructive" });
    }
  });

  // ── Auto-generate debits ──────────────────────────────────────────────────

  const handleGenerate = async () => {
    setGeneratingDebits(true);
    try {
      const result = await generateMutation.mutateAsync({
        contractId,
        body: { from: "2025-01" },
      });
      queryClient.invalidateQueries({ queryKey: getListRentDebitsQueryKey(contractId) });
      toast({ title: `${result.generated} Sollstellungen angelegt` });
    } catch {
      toast({ title: "Fehler beim Generieren", variant: "destructive" });
    } finally {
      setGeneratingDebits(false);
    }
  };

  // ── Totals ────────────────────────────────────────────────────────────────

  const totalSoll  = debits?.reduce((s, d) => s + d.total, 0) ?? 0;
  const totalPaid  = debits?.reduce((s, d) => s + d.paid, 0) ?? 0;
  const totalBalance = totalPaid - totalSoll;

  if (loadingContract) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!contract) {
    return <div className="text-center py-20 text-muted-foreground">Vertrag nicht gefunden.</div>;
  }

  const gesamt = contract.monthlyRent + (contract.nebenkostenvorauszahlung ?? 0);

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(`${BASE}/contracts`)} className="mt-0.5">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-foreground">
              {tenant?.name ?? "Unbekannter Mieter"}
            </h1>
            <StatusBadge status={contract.status} />
          </div>
          <p className="text-muted-foreground mt-0.5 text-sm">
            {property?.name && <span>{property.name} · </span>}
            {unit?.name ?? `Einheit ${contract.unitId}`}
            {" · "}Vertrag #{contract.id}
          </p>
        </div>
        <Button
          variant={editingContract ? "outline" : "default"}
          size="sm"
          className="gap-1.5 shrink-0"
          onClick={() => editingContract ? setEditingContract(false) : setEditingContract(true)}
        >
          {editingContract ? <><X className="w-3.5 h-3.5" /> Abbrechen</> : <><Pencil className="w-3.5 h-3.5" /> Bearbeiten</>}
        </Button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Kaltmiete", value: formatCurrency(contract.monthlyRent), icon: Euro },
          { label: "Nebenkosten", value: formatCurrency(contract.nebenkostenvorauszahlung ?? 0), icon: Euro },
          { label: "Gesamt/Monat", value: formatCurrency(gesamt), icon: Euro, highlight: true },
          {
            label: totalBalance >= 0 ? "Guthaben" : "Rückstand",
            value: formatCurrency(Math.abs(totalBalance)),
            icon: totalBalance >= 0 ? TrendingUp : TrendingDown,
            color: totalBalance >= 0 ? "text-emerald-700" : "text-red-600",
          },
        ].map((s) => (
          <Card key={s.label} className={`shadow-sm ${s.highlight ? "bg-primary/5 border-primary/20" : ""}`}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
              <p className={`text-xl font-semibold tabular-nums ${s.color ?? "text-foreground"}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Contract details (view / edit) */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Vertragsdaten</CardTitle>
        </CardHeader>
        <CardContent>
          {editingContract ? (
            <Form {...contractForm}>
              <form onSubmit={saveContract} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={contractForm.control} name="monthlyRent" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Kaltmiete (€)</FormLabel>
                      <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={contractForm.control} name="nebenkostenvorauszahlung" render={({ field }) => (
                    <FormItem>
                      <FormLabel>NKV (€)</FormLabel>
                      <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={contractForm.control} name="deposit" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Kaution (€)</FormLabel>
                      <FormControl><Input type="number" step="0.01" {...field} value={field.value ?? ""} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={contractForm.control} name="status" render={({ field }) => (
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
                  <FormField control={contractForm.control} name="startDate" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Beginn</FormLabel>
                      <FormControl><Input type="date" {...field} value={field.value ?? ""} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={contractForm.control} name="endDate" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ende (leer = unbefristet)</FormLabel>
                      <FormControl><Input type="date" {...field} value={field.value ?? ""} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={contractForm.control} name="notes" render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>Notizen</FormLabel>
                      <FormControl><Input {...field} value={field.value ?? ""} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <div className="flex gap-2 pt-1">
                  <Button type="submit" size="sm" className="gap-1.5" disabled={updateContractMutation.isPending}>
                    <Save className="w-3.5 h-3.5" /> Speichern
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setEditingContract(false)}>Abbrechen</Button>
                </div>
              </form>
            </Form>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-3 text-sm">
              {[
                { label: "Beginn", value: formatDate(contract.startDate) },
                { label: "Ende", value: contract.endDate ? formatDate(contract.endDate) : "Unbefristet" },
                { label: "Kaution", value: contract.deposit ? formatCurrency(contract.deposit) : "—" },
                { label: "Einheit", value: unit?.name ?? `ID ${contract.unitId}` },
                { label: "Mieter", value: tenant?.name ?? `ID ${contract.tenantId}` },
                { label: "Notizen", value: contract.notes ?? "—" },
              ].map((row) => (
                <div key={row.label}>
                  <p className="text-xs text-muted-foreground">{row.label}</p>
                  <p className="font-medium mt-0.5">{row.value}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sollstellungen */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base">Sollstellungen & Zahlungsverlauf</CardTitle>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={handleGenerate}
              disabled={generatingDebits}
            >
              {generatingDebits
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generiere…</>
                : <><RefreshCw className="w-3.5 h-3.5" /> Sollstellungen generieren</>}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {loadingDebits ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Lade Sollstellungen…
            </div>
          ) : !debits?.length ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              <Clock className="w-8 h-8 mx-auto mb-2 opacity-20" />
              <p>Noch keine Sollstellungen vorhanden.</p>
              <p className="text-xs mt-1">Klicke „Sollstellungen generieren" um alle Monate ab Jan 2025 anzulegen.</p>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="w-24">Monat</TableHead>
                  <TableHead className="text-right">Kaltmiete</TableHead>
                  <TableHead className="text-right">NKV</TableHead>
                  <TableHead className="text-right font-semibold">Soll</TableHead>
                  <TableHead className="text-right">Eingezahlt</TableHead>
                  <TableHead className="text-right">Differenz</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {debits.map((d) => {
                  const isEditing = editingDebitId === d.id;
                  const monthLabel = `${MONTHS_DE[(d.month - 1) % 12]} ${d.year}`;
                  return (
                    <TableRow key={d.id} className="group">
                      <TableCell className="font-medium text-sm whitespace-nowrap">{monthLabel}</TableCell>

                      {isEditing ? (
                        <>
                          <TableCell>
                            <Input
                              type="number"
                              step="0.01"
                              className="w-24 h-7 text-right text-sm"
                              {...debitForm.register("kaltmiete")}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              step="0.01"
                              className="w-24 h-7 text-right text-sm"
                              {...debitForm.register("nebenkostenvorauszahlung")}
                            />
                          </TableCell>
                          <TableCell className="text-right text-sm font-semibold tabular-nums">
                            {formatCurrency(
                              (parseFloat(debitForm.watch("kaltmiete") as any) || 0) +
                              (parseFloat(debitForm.watch("nebenkostenvorauszahlung") as any) || 0)
                            )}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums text-muted-foreground">{formatCurrency(d.paid)}</TableCell>
                          <TableCell />
                          <TableCell />
                          <TableCell>
                            <div className="flex gap-1">
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={saveDebit} disabled={updateDebitMutation.isPending}>
                                <Save className="w-3.5 h-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingDebitId(null)}>
                                <X className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell className="text-right text-sm tabular-nums">{formatCurrency(d.kaltmiete)}</TableCell>
                          <TableCell className="text-right text-sm tabular-nums">{formatCurrency(d.nebenkostenvorauszahlung)}</TableCell>
                          <TableCell className="text-right text-sm font-semibold tabular-nums">{formatCurrency(d.total)}</TableCell>
                          <TableCell className={`text-right text-sm tabular-nums ${d.paid > 0 ? "text-foreground" : "text-muted-foreground"}`}>
                            {formatCurrency(d.paid)}
                          </TableCell>
                          <TableCell className={`text-right text-sm tabular-nums font-medium ${d.balance < 0 ? "text-red-600" : d.balance > 0 ? "text-emerald-700" : "text-muted-foreground"}`}>
                            {d.balance === 0 ? "—" : (d.balance > 0 ? "+" : "") + formatCurrency(d.balance)}
                          </TableCell>
                          <TableCell><BalanceBadge balance={d.balance} total={d.total} /></TableCell>
                          <TableCell>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => startEditDebit(d)}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>

              {/* Totals row */}
              {debits.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 bg-muted/20">
                    <td className="px-4 py-2 text-sm font-semibold" colSpan={3}>Gesamt</td>
                    <td className="px-4 py-2 text-right text-sm font-semibold tabular-nums">{formatCurrency(totalSoll)}</td>
                    <td className="px-4 py-2 text-right text-sm tabular-nums">{formatCurrency(totalPaid)}</td>
                    <td className={`px-4 py-2 text-right text-sm font-semibold tabular-nums ${totalBalance < 0 ? "text-red-600" : totalBalance > 0 ? "text-emerald-700" : ""}`}>
                      {totalBalance === 0 ? "—" : (totalBalance > 0 ? "+" : "") + formatCurrency(totalBalance)}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
