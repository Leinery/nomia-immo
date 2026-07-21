import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft, Pencil, X, Save, Loader2, AlertTriangle,
  TrendingDown, Euro, CreditCard, Calendar,
} from "lucide-react";
import { differenceInDays, parseISO, format } from "date-fns";
import { de } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import {
  useGetLoan, useUpdateLoan, useGetLoanSchedule,
  useListProperties, getGetLoanQueryKey, getGetLoanScheduleQueryKey,
} from "@workspace/api-client-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const loanSchema = z.object({
  propertyId: z.coerce.number().optional().nullable(),
  lenderName: z.string().min(1),
  loanAmount: z.coerce.number().min(1),
  interestRate: z.coerce.number().min(0),
  repaymentRate: z.coerce.number().min(0),
  startDate: z.string().min(1),
  fixedRateEndDate: z.string().optional().nullable(),
  repaymentType: z.enum(["annuity", "bullet"]).default("annuity"),
  notes: z.string().optional().nullable(),
});
type LoanFormValues = z.infer<typeof loanSchema>;

export default function LoanDetail() {
  const { id } = useParams<{ id: string }>();
  const loanId = parseInt(id ?? "0");
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [editing, setEditing] = useState(false);
  const [scheduleView, setScheduleView] = useState<"yearly" | "monthly">("yearly");

  const { data: loan, isLoading } = useGetLoan(loanId);
  const { data: schedule, isLoading: scheduleLoading } = useGetLoanSchedule(loanId, scheduleView);
  const { data: properties } = useListProperties();
  const propMap = Object.fromEntries((properties ?? []).map((p) => [p.id, p]));
  const updateMutation = useUpdateLoan();

  const form = useForm<LoanFormValues>({
    resolver: zodResolver(loanSchema),
    values: loan ? {
      propertyId: loan.propertyId ?? null,
      lenderName: loan.lenderName,
      loanAmount: loan.loanAmount,
      interestRate: loan.interestRate,
      repaymentRate: loan.repaymentRate,
      startDate: loan.startDate,
      fixedRateEndDate: loan.fixedRateEndDate ?? null,
      repaymentType: (loan.repaymentType as any) ?? "annuity",
      notes: loan.notes ?? null,
    } : undefined,
  });

  const saveForm = form.handleSubmit(async (data) => {
    try {
      await updateMutation.mutateAsync({
        id: loanId,
        body: { ...data, propertyId: data.propertyId || null, fixedRateEndDate: data.fixedRateEndDate || null },
      });
      queryClient.invalidateQueries({ queryKey: getGetLoanQueryKey(loanId) });
      queryClient.invalidateQueries({ queryKey: getGetLoanScheduleQueryKey(loanId, scheduleView) });
      toast({ title: "Kredit gespeichert" });
      setEditing(false);
    } catch {
      toast({ title: "Fehler beim Speichern", variant: "destructive" });
    }
  });

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }
  if (!loan) {
    return <div className="text-center py-20 text-muted-foreground">Kredit nicht gefunden.</div>;
  }

  const daysToFixedEnd = loan.fixedRateEndDate
    ? differenceInDays(parseISO(loan.fixedRateEndDate), new Date())
    : null;
  const fixedEndLabel = loan.fixedRateEndDate
    ? format(parseISO(loan.fixedRateEndDate), "dd. MMMM yyyy", { locale: de })
    : null;

  // Total interest remaining (from current balance forward)
  const totalInterestRemaining = schedule?.schedule.reduce((s, r) => s + r.interest, 0) ?? 0;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(`${BASE}/loans`)} className="mt-0.5 shrink-0">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-foreground">{loan.lenderName}</h1>
            {daysToFixedEnd !== null && daysToFixedEnd < 365 && (
              <Badge className="bg-amber-100 text-amber-800 border-amber-200 gap-1">
                <AlertTriangle className="w-3 h-3" />
                Zinsbindung in {daysToFixedEnd}d
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-0.5 text-sm">
            {loan.propertyId ? (propMap[loan.propertyId]?.name ?? `Obj. ${loan.propertyId}`) : "Kein Objekt"}
            {" · "}Kredit #{loan.id}
          </p>
        </div>
        <Button
          variant={editing ? "outline" : "default"}
          size="sm"
          className="gap-1.5 shrink-0"
          onClick={() => setEditing(!editing)}
        >
          {editing ? <><X className="w-3.5 h-3.5" /> Abbrechen</> : <><Pencil className="w-3.5 h-3.5" /> Bearbeiten</>}
        </Button>
      </div>

      {/* Zinsbindungs-Alert */}
      {daysToFixedEnd !== null && daysToFixedEnd < 365 && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800">
                Zinsbindung endet am {fixedEndLabel}
                {daysToFixedEnd < 0 ? " (bereits abgelaufen)" : ` — noch ${daysToFixedEnd} Tage`}
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                Restschuld bei Zinsbindungsende: <strong>{formatCurrency(loan.balanceAtFixedEnd ?? 0)}</strong>.
                Jetzt Anschlussfinanzierung vergleichen.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Darlehensbetrag", value: formatCurrency(loan.loanAmount), sub: `seit ${format(parseISO(loan.startDate), "MMM yyyy", { locale: de })}` },
          { label: "Restschuld heute", value: formatCurrency(loan.currentBalance), sub: `${((loan.currentBalance / loan.loanAmount) * 100).toFixed(1)} % des Darlehens` },
          { label: "Monatliche Rate", value: formatCurrency(loan.monthlyPayment), sub: `Zinsen ${formatCurrency(loan.monthlyInterest)} · Tilgung ${formatCurrency(loan.monthlyRepayment)}` },
          {
            label: "Zinsbindung bis",
            value: fixedEndLabel ?? "—",
            sub: daysToFixedEnd !== null
              ? (daysToFixedEnd < 0 ? "Abgelaufen" : `Restschuld ${formatCurrency(loan.balanceAtFixedEnd ?? 0)}`)
              : "Keine Zinsbindung",
          },
        ].map((k) => (
          <Card key={k.label} className="shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">{k.label}</p>
              <p className="text-lg font-semibold tabular-nums leading-snug">{k.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{k.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Edit form / detail view */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Darlehensdetails</CardTitle>
        </CardHeader>
        <CardContent>
          {editing ? (
            <Form {...form}>
              <form onSubmit={saveForm} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="lenderName" render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>Bank / Kreditgeber</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="loanAmount" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Darlehensbetrag (€)</FormLabel>
                      <FormControl><Input type="number" step="1000" {...field} value={field.value ?? ""} /></FormControl>
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
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="interestRate" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Zinssatz (% p.a.)</FormLabel>
                      <FormControl><Input type="number" step="0.01" {...field} value={field.value ?? ""} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="repaymentRate" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tilgungssatz (% p.a.)</FormLabel>
                      <FormControl><Input type="number" step="0.01" {...field} value={field.value ?? ""} /></FormControl>
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
                      <FormControl><Input {...field} value={field.value ?? ""} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <div className="flex gap-2 pt-1">
                  <Button type="submit" size="sm" className="gap-1.5" disabled={updateMutation.isPending}>
                    <Save className="w-3.5 h-3.5" /> Speichern
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setEditing(false)}>Abbrechen</Button>
                </div>
              </form>
            </Form>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-3 text-sm">
              {[
                { label: "Bank", value: loan.lenderName },
                { label: "Zinssatz p.a.", value: `${loan.interestRate.toFixed(4)} %` },
                { label: "Tilgungssatz p.a.", value: `${loan.repaymentRate.toFixed(4)} %` },
                { label: "Kreditart", value: loan.repaymentType === "annuity" ? "Annuitätendarlehen" : "Endfälliges Darlehen" },
                { label: "Auszahlungsdatum", value: format(parseISO(loan.startDate), "dd.MM.yyyy") },
                { label: "Zinsbindung bis", value: fixedEndLabel ?? "—" },
                { label: "Verbleibende Zinskosten", value: formatCurrency(totalInterestRemaining) },
                { label: "Immobilie", value: loan.propertyId ? (propMap[loan.propertyId]?.name ?? `ID ${loan.propertyId}`) : "—" },
                { label: "Notizen", value: loan.notes ?? "—" },
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

      {/* Tilgungsplan */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base">Tilgungsplan</CardTitle>
            <div className="flex items-center gap-2 text-sm">
              <Label htmlFor="view-toggle" className="text-muted-foreground">Monatlich</Label>
              <Switch
                id="view-toggle"
                checked={scheduleView === "yearly"}
                onCheckedChange={(v) => setScheduleView(v ? "yearly" : "monthly")}
              />
              <Label htmlFor="view-toggle" className="text-muted-foreground">Jährlich</Label>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {scheduleLoading ? (
            <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Berechne Tilgungsplan…
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead>{scheduleView === "yearly" ? "Jahr" : "Monat"}</TableHead>
                  <TableHead className="text-right">Restschuld Anfang</TableHead>
                  <TableHead className="text-right">Zinsen</TableHead>
                  <TableHead className="text-right">Tilgung</TableHead>
                  <TableHead className="text-right">Annuität</TableHead>
                  <TableHead className="text-right">Restschuld Ende</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedule?.schedule.map((row, i) => {
                  const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
                  const label = scheduleView === "monthly" && row.month
                    ? `${MONTHS[(row.month - 1) % 12]} ${row.year}`
                    : String(row.year);
                  const isCurrentYear = row.year === new Date().getFullYear();
                  const isFixedEnd = row.isFixedRateEnd;
                  return (
                    <TableRow
                      key={i}
                      className={
                        isFixedEnd
                          ? "bg-amber-50 border-l-2 border-amber-400"
                          : isCurrentYear && scheduleView === "yearly"
                          ? "bg-primary/5"
                          : ""
                      }
                    >
                      <TableCell className="font-medium text-sm">
                        {label}
                        {isFixedEnd && (
                          <Badge className="ml-2 bg-amber-100 text-amber-800 border-amber-200 text-xs font-normal">
                            Zinsbindungsende
                          </Badge>
                        )}
                        {isCurrentYear && scheduleView === "yearly" && !isFixedEnd && (
                          <Badge className="ml-2 bg-primary/10 text-primary border-primary/20 text-xs font-normal">
                            Aktuell
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{formatCurrency(row.openingBalance)}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums text-red-600">{formatCurrency(row.interest)}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums text-emerald-700">{formatCurrency(row.repayment)}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums font-medium">{formatCurrency(row.annuitat)}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{formatCurrency(row.closingBalance)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              {schedule && (
                <tfoot>
                  <tr className="border-t-2 bg-muted/20">
                    <td className="px-4 py-2 text-sm font-semibold">Gesamt</td>
                    <td />
                    <td className="px-4 py-2 text-right text-sm text-red-600 font-medium tabular-nums">
                      {formatCurrency(schedule.schedule.reduce((s, r) => s + r.interest, 0))}
                    </td>
                    <td className="px-4 py-2 text-right text-sm text-emerald-700 font-medium tabular-nums">
                      {formatCurrency(schedule.schedule.reduce((s, r) => s + r.repayment, 0))}
                    </td>
                    <td className="px-4 py-2 text-right text-sm font-semibold tabular-nums">
                      {formatCurrency(schedule.schedule.reduce((s, r) => s + r.annuitat, 0))}
                    </td>
                    <td />
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
