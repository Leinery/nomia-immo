import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft, Pencil, X, Save, Loader2, AlertTriangle,
  Euro, CreditCard, Calendar, Copy, Check, ToggleLeft,
  Landmark, TrendingDown, Info,
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
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import {
  useGetLoan, useUpdateLoan, useGetLoanSchedule,
  useListProperties, getGetLoanQueryKey, getGetLoanScheduleQueryKey,
} from "@workspace/api-client-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Schema ───────────────────────────────────────────────────────────────────

const loanSchema = z.object({
  propertyId: z.coerce.number().optional().nullable(),
  lenderName: z.string().min(1),
  loanAmount: z.coerce.number().min(1),
  interestRate: z.coerce.number().min(0),
  repaymentRate: z.coerce.number().min(0),
  startDate: z.string().min(1),
  fixedRateEndDate: z.string().optional().nullable(),
  repaymentType: z.enum(["annuity", "bullet"]).default("annuity"),
  // Bankverbindung
  loanIban: z.string().optional().nullable(),
  loanBic: z.string().optional().nullable(),
  debitAccountIban: z.string().optional().nullable(),
  accountHolder: z.string().optional().nullable(),
  // Sondertilgung
  annualSondertilgung: z.coerce.number().optional().nullable(),
  sondertilgungUsedThisYear: z.coerce.number().optional().nullable(),
  // Restschuld
  currentBalanceOverride: z.coerce.number().optional().nullable(),
  notes: z.string().optional().nullable(),
});
type LoanFormValues = z.infer<typeof loanSchema>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function IbanDisplay({ iban }: { iban: string }) {
  const [copied, setCopied] = useState(false);
  const formatted = iban.replace(/(.{4})/g, "$1 ").trim();
  return (
    <div className="flex items-center gap-2 font-mono text-sm">
      <span>{formatted}</span>
      <button
        onClick={() => { navigator.clipboard.writeText(iban); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
        className="text-muted-foreground hover:text-foreground transition-colors"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function LoanDetail() {
  const { id } = useParams<{ id: string }>();
  const loanId = parseInt(id ?? "0");
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [editing, setEditing] = useState(false);
  const [scheduleView, setScheduleView] = useState<"yearly" | "monthly">("yearly");
  const [withSonder, setWithSonder] = useState(false);
  const [editingSonder, setEditingSonder] = useState(false);
  const [sonderUsedInput, setSonderUsedInput] = useState("");

  const { data: loan, isLoading } = useGetLoan(loanId);
  const { data: schedule, isLoading: scheduleLoading } = useGetLoanSchedule(loanId, scheduleView, withSonder);
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
      loanIban: loan.loanIban ?? null,
      loanBic: loan.loanBic ?? null,
      debitAccountIban: loan.debitAccountIban ?? null,
      accountHolder: loan.accountHolder ?? null,
      annualSondertilgung: loan.annualSondertilgung ?? null,
      sondertilgungUsedThisYear: loan.sondertilgungUsedThisYear ?? 0,
      currentBalanceOverride: loan.currentBalanceOverride ?? null,
      notes: loan.notes ?? null,
    } : undefined,
  });

  const saveForm = form.handleSubmit(async (data) => {
    try {
      await updateMutation.mutateAsync({
        id: loanId,
        body: {
          ...data,
          propertyId: data.propertyId || null,
          fixedRateEndDate: data.fixedRateEndDate || null,
          annualSondertilgung: data.annualSondertilgung || null,
          currentBalanceOverride: data.currentBalanceOverride || null,
        },
      });
      queryClient.invalidateQueries({ queryKey: getGetLoanQueryKey(loanId) });
      queryClient.invalidateQueries({ queryKey: getGetLoanScheduleQueryKey(loanId, scheduleView, withSonder) });
      toast({ title: "Kredit gespeichert" });
      setEditing(false);
    } catch {
      toast({ title: "Fehler beim Speichern", variant: "destructive" });
    }
  });

  const saveSonderUsed = async () => {
    const val = parseFloat(sonderUsedInput);
    if (isNaN(val) || val < 0) return;
    try {
      await updateMutation.mutateAsync({ id: loanId, body: { sondertilgungUsedThisYear: val } });
      queryClient.invalidateQueries({ queryKey: getGetLoanQueryKey(loanId) });
      toast({ title: "Sondertilgung aktualisiert" });
      setEditingSonder(false);
    } catch { toast({ title: "Fehler", variant: "destructive" }); }
  };

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
  const isFixedEndSoon = daysToFixedEnd !== null && daysToFixedEnd < 730 && daysToFixedEnd >= 0;

  const totalInterestRemaining = schedule?.schedule.reduce((s, r) => s + r.interest, 0) ?? 0;
  const redemptionPct = ((loan.loanAmount - loan.currentBalance) / loan.loanAmount) * 100;
  const sonderPct = loan.annualSondertilgung ? (loan.annualSondertilgung / loan.loanAmount) * 100 : null;

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
            {isFixedEndSoon && (
              <Badge className="bg-amber-100 text-amber-800 border-amber-200 gap-1">
                <AlertTriangle className="w-3 h-3" />
                Zinsbindung in {daysToFixedEnd}d
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-0.5 text-sm">
            {loan.propertyId ? (propMap[loan.propertyId]?.name ?? `Obj. ${loan.propertyId}`) : "Kein Objekt"}
            {loan.accountHolder ? ` · ${loan.accountHolder}` : ""}
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

      {/* Zinsbindungs-Alert — 2-Jahres-Warnung */}
      {daysToFixedEnd !== null && daysToFixedEnd < 730 && (
        <Card className={daysToFixedEnd < 180 ? "border-red-300 bg-red-50" : "border-amber-300 bg-amber-50"}>
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className={`w-5 h-5 shrink-0 mt-0.5 ${daysToFixedEnd < 180 ? "text-red-600" : "text-amber-600"}`} />
            <div>
              <p className={`text-sm font-semibold ${daysToFixedEnd < 180 ? "text-red-800" : "text-amber-800"}`}>
                Zinsbindung endet am {fixedEndLabel} — noch {daysToFixedEnd} Tage
              </p>
              <p className={`text-xs mt-0.5 ${daysToFixedEnd < 180 ? "text-red-700" : "text-amber-700"}`}>
                Restschuld bei Zinsbindungsende: <strong>{formatCurrency(loan.balanceAtFixedEnd ?? 0)}</strong>.
                {daysToFixedEnd < 365 ? " Jetzt Anschlussfinanzierung abschließen!" : " Anschlussfinanzierung frühzeitig vergleichen empfehlenswert."}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: "Ursprungsdarlehen",
            value: formatCurrency(loan.loanAmount),
            sub: `seit ${format(parseISO(loan.startDate), "MMM yyyy", { locale: de })}`,
          },
          {
            label: loan.currentBalanceOverride ? "Restschuld (Bankstand)" : "Restschuld heute",
            value: formatCurrency(loan.currentBalance),
            sub: `${(100 - redemptionPct).toFixed(1)} % noch offen · ${redemptionPct.toFixed(1)} % getilgt`,
          },
          {
            label: "Monatliche Rate",
            value: formatCurrency(loan.monthlyPayment),
            sub: `Zinsen ${formatCurrency(loan.monthlyInterest)} · Tilgung ${formatCurrency(loan.monthlyRepayment)}`,
          },
          {
            label: "Zinsbindung bis",
            value: fixedEndLabel ?? "—",
            sub: daysToFixedEnd !== null
              ? `Restschuld ${formatCurrency(loan.balanceAtFixedEnd ?? 0)}`
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

      {/* Sondertilgung card */}
      {loan.annualSondertilgung != null && (
        <Card className="shadow-sm border-emerald-200">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-emerald-600" /> Sondertilgung {new Date().getFullYear()}
              </CardTitle>
              <button
                onClick={() => { setSonderUsedInput(String(loan.sondertilgungUsedThisYear ?? 0)); setEditingSonder(true); }}
                className="text-xs text-primary hover:underline"
              >
                Genutzte aktualisieren
              </button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-6 text-sm">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Vereinbart / Jahr</p>
                <p className="text-xl font-semibold tabular-nums">{formatCurrency(loan.annualSondertilgung)}</p>
                {sonderPct && <p className="text-xs text-muted-foreground mt-0.5">{sonderPct.toFixed(1)} % des Ursprungsdarlehens</p>}
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Genutzt {new Date().getFullYear()}</p>
                {editingSonder ? (
                  <div className="flex items-center gap-1">
                    <Input type="number" step="100" className="h-7 w-28 text-sm" value={sonderUsedInput} onChange={(e) => setSonderUsedInput(e.target.value)} />
                    <Button size="sm" className="h-7 px-2" onClick={saveSonderUsed} disabled={updateMutation.isPending}><Save className="w-3 h-3" /></Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditingSonder(false)}><X className="w-3 h-3" /></Button>
                  </div>
                ) : (
                  <p className="text-xl font-semibold tabular-nums text-muted-foreground">{formatCurrency(loan.sondertilgungUsedThisYear)}</p>
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Noch verfügbar</p>
                <p className={`text-xl font-semibold tabular-nums ${(loan.freeSondertilgung ?? 0) > 0 ? "text-emerald-700" : "text-muted-foreground"}`}>
                  {formatCurrency(loan.freeSondertilgung ?? 0)}
                </p>
                {(loan.freeSondertilgung ?? 0) > 0 && (
                  <p className="text-xs text-emerald-700 mt-0.5">Spart {formatCurrency((loan.freeSondertilgung ?? 0) * loan.interestRate / 100)} Zinsen/Jahr</p>
                )}
              </div>
            </div>
            {(loan.freeSondertilgung ?? 0) > 0 && (
              <div className="mt-3 flex items-start gap-2 text-xs text-muted-foreground bg-emerald-50 rounded-md p-2.5 border border-emerald-100">
                <Info className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                Tipp: Sondertilgung nutzen verkürzt die Laufzeit und spart laufende Zinskosten.
                Im Tilgungsplan unten siehst du den Effekt mit dem Toggle „Mit Sondertilgung".
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Darlehensdetails + Bearbeiten */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Darlehensdetails</CardTitle>
        </CardHeader>
        <CardContent>
          {editing ? (
            <Form {...form}>
              <form onSubmit={saveForm} className="space-y-5">
                {/* — Grunddaten — */}
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Grunddaten</p>
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
                  <FormField control={form.control} name="currentBalanceOverride" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Restschuld laut Bank (€)</FormLabel>
                      <FormControl><Input type="number" step="0.01" placeholder="leer = berechnet" {...field} value={field.value ?? ""} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <Separator />
                {/* — Bankverbindung — */}
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Bankverbindung</p>
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="accountHolder" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Kontoinhaber</FormLabel>
                      <FormControl><Input {...field} value={field.value ?? ""} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="loanBic" render={({ field }) => (
                    <FormItem>
                      <FormLabel>BIC</FormLabel>
                      <FormControl><Input placeholder="z.B. GENODEF1PAT" {...field} value={field.value ?? ""} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="loanIban" render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>IBAN Darlehenskonto</FormLabel>
                      <FormControl><Input placeholder="DE..." {...field} value={field.value ?? ""} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="debitAccountIban" render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>Abbuchungskonto IBAN</FormLabel>
                      <FormControl><Input placeholder="DE..." {...field} value={field.value ?? ""} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <Separator />
                {/* — Sondertilgung — */}
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sondertilgung</p>
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="annualSondertilgung" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vereinbarte Sondertilgung / Jahr (€)</FormLabel>
                      <FormControl><Input type="number" step="100" {...field} value={field.value ?? ""} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="sondertilgungUsedThisYear" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bereits genutzt {new Date().getFullYear()} (€)</FormLabel>
                      <FormControl><Input type="number" step="100" {...field} value={field.value ?? ""} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <Separator />
                <FormField control={form.control} name="notes" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notizen</FormLabel>
                    <FormControl><Input {...field} value={field.value ?? ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <div className="flex gap-2 pt-1">
                  <Button type="submit" size="sm" className="gap-1.5" disabled={updateMutation.isPending}>
                    <Save className="w-3.5 h-3.5" /> Speichern
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setEditing(false)}>Abbrechen</Button>
                </div>
              </form>
            </Form>
          ) : (
            <div className="space-y-5">
              {/* Grunddaten */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-3 text-sm">
                {[
                  { label: "Bank", value: loan.lenderName },
                  { label: "Sollzinssatz p.a.", value: `${loan.interestRate.toFixed(4)} %` },
                  { label: "Tilgungssatz p.a.", value: `${loan.repaymentRate.toFixed(4)} %` },
                  { label: "Kreditart", value: loan.repaymentType === "annuity" ? "Annuitätendarlehen" : "Endfälliges Darlehen" },
                  { label: "Auszahlungsdatum", value: format(parseISO(loan.startDate), "dd.MM.yyyy") },
                  { label: "Zinsbindung bis", value: fixedEndLabel ?? "—" },
                  { label: "Restschuld bei Zinsbindungsende", value: formatCurrency(loan.balanceAtFixedEnd ?? 0) },
                  { label: "Noch zu zahlende Zinsen", value: formatCurrency(totalInterestRemaining) },
                  { label: "Immobilie", value: loan.propertyId ? (propMap[loan.propertyId]?.name ?? `ID ${loan.propertyId}`) : "—" },
                  ...(loan.notes ? [{ label: "Notizen", value: loan.notes }] : []),
                ].map((row) => (
                  <div key={row.label}>
                    <p className="text-xs text-muted-foreground">{row.label}</p>
                    <p className="font-medium mt-0.5">{row.value}</p>
                  </div>
                ))}
              </div>

              {/* Bankverbindung */}
              {(loan.loanIban || loan.debitAccountIban || loan.loanBic || loan.accountHolder) && (
                <>
                  <Separator />
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-3 text-sm">
                    {loan.accountHolder && (
                      <div>
                        <p className="text-xs text-muted-foreground">Kontoinhaber</p>
                        <p className="font-medium mt-0.5">{loan.accountHolder}</p>
                      </div>
                    )}
                    {loan.loanBic && (
                      <div>
                        <p className="text-xs text-muted-foreground">BIC</p>
                        <p className="font-mono font-medium mt-0.5">{loan.loanBic}</p>
                      </div>
                    )}
                    {loan.loanIban && (
                      <div className="col-span-2 sm:col-span-1">
                        <p className="text-xs text-muted-foreground">IBAN Darlehenskonto</p>
                        <div className="mt-0.5"><IbanDisplay iban={loan.loanIban} /></div>
                      </div>
                    )}
                    {loan.debitAccountIban && (
                      <div className="col-span-2 sm:col-span-2">
                        <p className="text-xs text-muted-foreground">Abbuchungskonto</p>
                        <div className="mt-0.5"><IbanDisplay iban={loan.debitAccountIban} /></div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tilgungsplan */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base">Tilgungsplan</CardTitle>
            <div className="flex items-center gap-4 text-sm flex-wrap">
              {loan.annualSondertilgung && (
                <div className="flex items-center gap-1.5">
                  <Switch id="sonder-toggle" checked={withSonder} onCheckedChange={setWithSonder} />
                  <Label htmlFor="sonder-toggle" className="text-muted-foreground cursor-pointer">
                    Mit Sondertilgung
                  </Label>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <Label htmlFor="view-toggle" className="text-muted-foreground">Monatlich</Label>
                <Switch
                  id="view-toggle"
                  checked={scheduleView === "yearly"}
                  onCheckedChange={(v) => setScheduleView(v ? "yearly" : "monthly")}
                />
                <Label htmlFor="view-toggle" className="text-muted-foreground">Jährlich</Label>
              </div>
            </div>
          </div>
          {withSonder && loan.annualSondertilgung && (
            <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded px-2.5 py-1.5 mt-2">
              Simulation: {formatCurrency(loan.annualSondertilgung)} Sondertilgung pro Jahr ab jetzt —
              Gesamtlaufzeit und Restschuld verkürzen sich deutlich.
            </p>
          )}
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
                  {withSonder && <TableHead className="text-right text-emerald-700">Sondertilg.</TableHead>}
                  <TableHead className="text-right">Rate gesamt</TableHead>
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
                      {withSonder && (
                        <TableCell className="text-right text-sm tabular-nums text-emerald-700 font-medium">
                          {row.sondertilgung ? formatCurrency(row.sondertilgung) : "—"}
                        </TableCell>
                      )}
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
                    {withSonder && (
                      <td className="px-4 py-2 text-right text-sm text-emerald-700 font-medium tabular-nums">
                        {formatCurrency(schedule.schedule.reduce((s, r) => s + (r.sondertilgung ?? 0), 0))}
                      </td>
                    )}
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
