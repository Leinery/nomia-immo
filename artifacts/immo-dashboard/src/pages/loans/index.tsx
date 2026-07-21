import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Plus, Pencil, Trash2, AlertTriangle, CheckCircle2, CreditCard, TrendingDown,
} from "lucide-react";
import { differenceInDays, parseISO, format } from "date-fns";
import { de } from "date-fns/locale";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import {
  useListLoans, useCreateLoan, useUpdateLoan, useDeleteLoan, getListLoansQueryKey,
  useListProperties,
} from "@workspace/api-client-react";
import type { LoanItem, CreateLoanBody } from "@workspace/api-client-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Form schema ──────────────────────────────────────────────────────────────

const loanSchema = z.object({
  propertyId: z.coerce.number().optional().nullable(),
  lenderName: z.string().min(1, "Bank ist erforderlich"),
  loanAmount: z.coerce.number().min(1),
  interestRate: z.coerce.number().min(0).max(30),
  repaymentRate: z.coerce.number().min(0).max(30),
  startDate: z.string().min(1),
  fixedRateEndDate: z.string().optional().nullable(),
  repaymentType: z.enum(["annuity", "bullet"]).default("annuity"),
  notes: z.string().optional().nullable(),
});
type LoanFormValues = z.infer<typeof loanSchema>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function FixedRateBadge({ fixedRateEndDate }: { fixedRateEndDate: string | null }) {
  if (!fixedRateEndDate) return <span className="text-muted-foreground text-xs">—</span>;
  const end = parseISO(fixedRateEndDate);
  const days = differenceInDays(end, new Date());
  const label = format(end, "MMM yyyy", { locale: de });
  if (days < 0) return <Badge className="bg-red-100 text-red-800 border-red-200 text-xs font-normal gap-1"><AlertTriangle className="w-3 h-3" /> {label} (abgelaufen)</Badge>;
  if (days < 365) return <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs font-normal gap-1"><AlertTriangle className="w-3 h-3" /> {label} ({days}d)</Badge>;
  return <span className="text-sm">{label}</span>;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function LoansList() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data: loans, isLoading } = useListLoans();
  const { data: properties } = useListProperties();
  const propMap = Object.fromEntries((properties ?? []).map((p) => [p.id, p]));

  const createMutation = useCreateLoan();
  const updateMutation = useUpdateLoan();
  const deleteMutation = useDeleteLoan();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const form = useForm<LoanFormValues>({
    resolver: zodResolver(loanSchema),
    defaultValues: { repaymentType: "annuity" },
  });

  const openCreate = () => {
    form.reset({ repaymentType: "annuity" });
    setEditingId(null);
    setIsDialogOpen(true);
  };

  const openEdit = (loan: LoanItem) => {
    form.reset({
      propertyId: loan.propertyId ?? null,
      lenderName: loan.lenderName,
      loanAmount: loan.loanAmount,
      interestRate: loan.interestRate,
      repaymentRate: loan.repaymentRate,
      startDate: loan.startDate,
      fixedRateEndDate: loan.fixedRateEndDate ?? null,
      repaymentType: (loan.repaymentType as any) ?? "annuity",
      notes: loan.notes ?? null,
    });
    setEditingId(loan.id);
    setIsDialogOpen(true);
  };

  const onSubmit = async (data: LoanFormValues) => {
    const body: CreateLoanBody = {
      ...data,
      propertyId: data.propertyId || null,
      fixedRateEndDate: data.fixedRateEndDate || null,
      notes: data.notes || null,
    };
    try {
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, body });
        toast({ title: "Kredit aktualisiert" });
      } else {
        await createMutation.mutateAsync({ body });
        toast({ title: "Kredit angelegt" });
      }
      queryClient.invalidateQueries({ queryKey: getListLoansQueryKey() });
      setIsDialogOpen(false);
    } catch {
      toast({ title: "Fehler beim Speichern", variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Kredit wirklich löschen?")) return;
    try {
      await deleteMutation.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getListLoansQueryKey() });
      toast({ title: "Kredit gelöscht" });
    } catch {
      toast({ title: "Fehler beim Löschen", variant: "destructive" });
    }
  };

  // Aggregate KPIs
  const totalDebt    = loans?.reduce((s, l) => s + l.currentBalance, 0) ?? 0;
  const totalPayment = loans?.reduce((s, l) => s + l.monthlyPayment, 0) ?? 0;
  const totalInterest = loans?.reduce((s, l) => s + l.monthlyInterest, 0) ?? 0;
  const urgentCount  = loans?.filter((l) => {
    if (!l.fixedRateEndDate) return false;
    return differenceInDays(parseISO(l.fixedRateEndDate), new Date()) < 365;
  }).length ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Kredite & Finanzierung</h1>
          <p className="text-muted-foreground mt-1">Darlehen, Zinsbindung und Tilgungsplan im Überblick.</p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="w-4 h-4" /> Neuer Kredit
        </Button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Gesamtschuld", value: formatCurrency(totalDebt), icon: CreditCard, sub: "Restschuld heute" },
          { label: "Rate/Monat gesamt", value: formatCurrency(totalPayment), icon: TrendingDown, sub: `davon Zinsen ${formatCurrency(totalInterest)}` },
          { label: "Kredite", value: String(loans?.length ?? 0), icon: CreditCard, sub: "Darlehen aktiv" },
          {
            label: "Zinsbindung läuft ab",
            value: urgentCount > 0 ? `${urgentCount} Kredit${urgentCount > 1 ? "e" : ""}` : "Kein Handlungsbedarf",
            icon: urgentCount > 0 ? AlertTriangle : CheckCircle2,
            sub: "< 12 Monate",
            warn: urgentCount > 0,
          },
        ].map((kpi) => (
          <Card key={kpi.label} className={`shadow-sm ${kpi.warn ? "border-amber-300 bg-amber-50" : ""}`}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">{kpi.label}</p>
              <p className={`text-xl font-semibold tabular-nums ${kpi.warn ? "text-amber-700" : "text-foreground"}`}>{kpi.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{kpi.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Table */}
      <Card className="shadow-sm">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead>Bank</TableHead>
                <TableHead className="hidden sm:table-cell">Immobilie</TableHead>
                <TableHead className="text-right hidden md:table-cell">Darlehensbetrag</TableHead>
                <TableHead className="text-right">Restschuld</TableHead>
                <TableHead className="text-right hidden sm:table-cell">Rate/Monat</TableHead>
                <TableHead className="text-right hidden md:table-cell">Zinssatz</TableHead>
                <TableHead className="hidden sm:table-cell">Zinsbindung bis</TableHead>
                <TableHead className="w-20 text-right">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">Lade Kredite…</TableCell>
                </TableRow>
              ) : !loans?.length ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-16 text-muted-foreground">
                    <CreditCard className="w-10 h-10 mx-auto mb-3 opacity-20" />
                    <p className="text-sm">Noch keine Kredite erfasst.</p>
                    <p className="text-xs mt-1">Lege Darlehen mit Zinssatz und Tilgung an — der Tilgungsplan wird automatisch berechnet.</p>
                  </TableCell>
                </TableRow>
              ) : (
                loans.map((loan) => (
                  <TableRow
                    key={loan.id}
                    className="group cursor-pointer hover:bg-muted/30"
                    onClick={() => navigate(`${BASE}/loans/${loan.id}`)}
                  >
                    <TableCell className="font-medium">{loan.lenderName}</TableCell>
                    <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                      {loan.propertyId ? (propMap[loan.propertyId]?.name ?? `Obj. ${loan.propertyId}`) : "—"}
                    </TableCell>
                    <TableCell className="text-right hidden md:table-cell text-sm tabular-nums text-muted-foreground">
                      {formatCurrency(loan.loanAmount)}
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium tabular-nums">
                      {formatCurrency(loan.currentBalance)}
                    </TableCell>
                    <TableCell className="text-right hidden sm:table-cell text-sm tabular-nums">
                      {formatCurrency(loan.monthlyPayment)}
                    </TableCell>
                    <TableCell className="text-right hidden md:table-cell text-sm">
                      {loan.interestRate.toFixed(2)} %
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <FixedRateBadge fixedRateEndDate={loan.fixedRateEndDate} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div
                        className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(loan)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(loan.id)}>
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>{editingId ? "Kredit bearbeiten" : "Neuer Kredit"}</DialogTitle>
            <DialogDescription>Tilgungsplan und Restschuld werden automatisch berechnet.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">

                <FormField control={form.control} name="lenderName" render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Bank / Kreditgeber</FormLabel>
                    <FormControl><Input placeholder="z.B. Volksbank Hannover" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="propertyId" render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Immobilie (optional)</FormLabel>
                    <Select value={field.value ? String(field.value) : "none"} onValueChange={(v) => field.onChange(v === "none" ? null : parseInt(v))}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Keine Zuordnung" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="none">Keine Zuordnung</SelectItem>
                        {(properties ?? []).map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="loanAmount" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Darlehensbetrag (€)</FormLabel>
                    <FormControl><Input type="number" step="1000" placeholder="300000" {...field} value={field.value ?? ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="repaymentType" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kreditart</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="annuity">Annuitätendarlehen</SelectItem>
                        <SelectItem value="bullet">Endfälliges Darlehen</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="interestRate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Zinssatz (% p.a.)</FormLabel>
                    <FormControl><Input type="number" step="0.01" placeholder="1.50" {...field} value={field.value ?? ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="repaymentRate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tilgungssatz (% p.a.)</FormLabel>
                    <FormControl><Input type="number" step="0.01" placeholder="2.00" {...field} value={field.value ?? ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="startDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Auszahlungsdatum</FormLabel>
                    <FormControl><Input type="date" {...field} value={field.value ?? ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="fixedRateEndDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Zinsbindung bis</FormLabel>
                    <FormControl><Input type="date" {...field} value={field.value ?? ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

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
