import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetSollstellungen, useSendEmail, useCreateCommunication,
  useGetSmtpStatus, getSollstellungenQueryKey, getCommunicationsQueryKey,
  type SollstellungItem,
} from "@workspace/api-client-react";
import { ChevronLeft, ChevronRight, AlertCircle, Mail, FileText, Send, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";

const MONTHS = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];

function fmt(n: number) {
  return n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

function StatusBadge({ status }: { status: SollstellungItem["status"] }) {
  if (status === "bezahlt")
    return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100"><CheckCircle2 className="h-3 w-3 mr-1" />Bezahlt</Badge>;
  if (status === "differenz")
    return <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100"><AlertTriangle className="h-3 w-3 mr-1" />Differenz</Badge>;
  return <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100"><XCircle className="h-3 w-3 mr-1" />Offen</Badge>;
}

type MahnungState = {
  item: SollstellungItem;
  level: "1" | "2" | "3";
  channel: "email" | "letter";
  subject: string;
  body: string;
  trackingNumber: string;
};

function buildTemplate(item: SollstellungItem, level: string) {
  const monthName = MONTHS[item.month - 1];
  const diff = Math.abs(item.balance);
  const levelWord = level === "1" ? "freundliche Erinnerung" : level === "2" ? "zweite Mahnung" : "letzte Mahnung";
  return {
    subject: `${level}. Mahnung – Mietzahlung ${monthName} ${item.year} – ${item.unitName}`,
    body: `Sehr geehrte/r ${item.tenantName},

mit dieser ${levelWord} möchten wir Sie darauf hinweisen, dass die Mietzahlung für ${monthName} ${item.year} in Höhe von ${fmt(item.total)} noch nicht vollständig beglichen wurde.

${item.paid > 0 ? `Bereits eingegangen: ${fmt(item.paid)}\nNoch ausstehend: ${fmt(diff)}` : `Offener Betrag: ${fmt(item.total)}`}

Bitte überweisen Sie den ausstehenden Betrag innerhalb von 14 Tagen auf das Ihnen bekannte Konto.

Bei Fragen stehen wir Ihnen gerne zur Verfügung.

Mit freundlichen Grüßen
Ihre Hausverwaltung`,
  };
}

export default function SollstellungenPage() {
  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [mahnung, setMahnung] = useState<MahnungState | null>(null);

  const { toast } = useToast();
  const qc = useQueryClient();

  const { data = [], isLoading } = useGetSollstellungen({ year, month });
  const { data: smtpStatus } = useGetSmtpStatus();
  const sendEmail  = useSendEmail();
  const logLetter  = useCreateCommunication();

  // Month navigation
  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  // KPIs
  const kpis = useMemo(() => {
    const totalSoll  = data.reduce((s, r) => s + r.total, 0);
    const totalPaid  = data.reduce((s, r) => s + r.paid,  0);
    const offen      = data.filter(r => r.status === "offen").length;
    const differenz  = data.filter(r => r.status === "differenz").length;
    return { totalSoll, totalPaid, offen, differenz };
  }, [data]);

  function openMahnung(item: SollstellungItem) {
    const level = "1";
    const tpl = buildTemplate(item, level);
    setMahnung({ item, level, channel: "email", subject: tpl.subject, body: tpl.body, trackingNumber: "" });
  }

  function onLevelChange(level: "1" | "2" | "3") {
    if (!mahnung) return;
    const tpl = buildTemplate(mahnung.item, level);
    setMahnung(prev => prev ? { ...prev, level, subject: tpl.subject, body: tpl.body } : null);
  }

  async function sendMahnung() {
    if (!mahnung) return;
    const { item, channel, subject, body, level, trackingNumber } = mahnung;

    try {
      if (channel === "email") {
        if (!item.tenantEmail) {
          toast({ title: "Keine E-Mail-Adresse", description: "Für diesen Mieter ist keine E-Mail-Adresse hinterlegt.", variant: "destructive" });
          return;
        }
        await sendEmail.mutateAsync({
          tenantId: item.tenantId, contractId: item.contractId,
          toEmail: item.tenantEmail, subject, body,
          mahnungLevel: Number(level), relatedType: "rent_debit", relatedId: item.debitId,
        });
        toast({ title: `${level}. Mahnung gesendet`, description: `E-Mail an ${item.tenantEmail}` });
      } else {
        await logLetter.mutateAsync({
          tenantId: item.tenantId, contractId: item.contractId,
          channel: "letter_registered", direction: "outbound",
          subject, body, status: "sent",
          trackingNumber: trackingNumber || null,
          mahnungLevel: Number(level), relatedType: "rent_debit", relatedId: item.debitId,
        });
        toast({ title: `${level}. Mahnung erfasst`, description: "Brief wurde als verschickt markiert." });
      }
      qc.invalidateQueries({ queryKey: getCommunicationsQueryKey({ tenantId: item.tenantId }) });
      setMahnung(null);
    } catch (err: any) {
      const detail = err?.response?.data?.hint ?? err?.response?.data?.error ?? err.message;
      toast({ title: "Fehler", description: detail, variant: "destructive" });
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#0f1c15]">Sollstellungen</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Monatliche Mietsollstellungen und Zahlungsstatus</p>
        </div>
        <div className="flex items-center gap-2 bg-white border rounded-lg px-2 py-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-sm font-medium w-36 text-center">{MONTHS[month - 1]} {year}</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">Gesamt Soll</p>
          <p className="text-xl font-semibold text-[#0f1c15] mt-0.5">{fmt(kpis.totalSoll)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">Bezahlt</p>
          <p className="text-xl font-semibold text-emerald-600 mt-0.5">{fmt(kpis.totalPaid)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">Offene Posten</p>
          <p className="text-xl font-semibold text-red-600 mt-0.5">{kpis.offen}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">Differenzen</p>
          <p className="text-xl font-semibold text-amber-600 mt-0.5">{kpis.differenz}</p>
        </CardContent></Card>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-[#f4f7f5]">
                <TableHead className="pl-4">Mieter</TableHead>
                <TableHead>Einheit</TableHead>
                <TableHead>Objekt</TableHead>
                <TableHead className="text-right">Soll</TableHead>
                <TableHead className="text-right">Bezahlt</TableHead>
                <TableHead className="text-right">Differenz</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-4" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-12">Lädt …</TableCell></TableRow>
              ) : data.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-12">Keine aktiven Verträge für diesen Monat.</TableCell></TableRow>
              ) : data.map((row) => (
                <TableRow key={row.contractId} className="hover:bg-[#f4f7f5]/50">
                  <TableCell className="pl-4 font-medium">{row.tenantName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{row.unitName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{row.propertyName}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(row.total)}</TableCell>
                  <TableCell className="text-right tabular-nums text-emerald-700">{fmt(row.paid)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.balance < -0.01
                      ? <span className="text-red-600">−{fmt(Math.abs(row.balance))}</span>
                      : row.balance > 0.01
                        ? <span className="text-emerald-600">+{fmt(row.balance)}</span>
                        : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell><StatusBadge status={row.status} /></TableCell>
                  <TableCell className="pr-4 text-right">
                    {row.status !== "bezahlt" && (
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openMahnung(row)}>
                        <AlertCircle className="h-3 w-3 mr-1" />Mahnung
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Mahnung Dialog */}
      {mahnung && (
        <Dialog open onOpenChange={() => setMahnung(null)}>
          <DialogContent className="sm:max-w-[580px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Mahnung senden</DialogTitle>
              <DialogDescription>
                {mahnung.item.tenantName} · {mahnung.item.unitName} · {MONTHS[month - 1]} {year}
                {mahnung.item.balance < 0 && (
                  <span className="text-red-600 font-medium"> · Rückstand: {fmt(Math.abs(mahnung.item.balance))}</span>
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-1">
              {/* Level */}
              <div className="space-y-1.5">
                <Label>Mahnung</Label>
                <Select value={mahnung.level} onValueChange={(v) => onLevelChange(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1. Mahnung (freundliche Erinnerung)</SelectItem>
                    <SelectItem value="2">2. Mahnung</SelectItem>
                    <SelectItem value="3">3. Mahnung (letzte Mahnung)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Channel */}
              <div className="space-y-1.5">
                <Label>Versandweg</Label>
                <RadioGroup
                  value={mahnung.channel}
                  onValueChange={(v) => setMahnung(p => p ? { ...p, channel: v as any } : null)}
                  className="flex gap-4"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="email" id="ch-email" />
                    <Label htmlFor="ch-email" className="cursor-pointer flex items-center gap-1"><Mail className="h-3.5 w-3.5" />E-Mail</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="letter" id="ch-letter" />
                    <Label htmlFor="ch-letter" className="cursor-pointer flex items-center gap-1"><FileText className="h-3.5 w-3.5" />Brief (manuell)</Label>
                  </div>
                </RadioGroup>
              </div>

              {mahnung.channel === "email" && !smtpStatus?.configured && (
                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>SMTP nicht konfiguriert. Bitte <strong>SMTP_HOST</strong>, <strong>SMTP_USER</strong> und <strong>SMTP_PASS</strong> als Replit Secrets setzen.</span>
                </div>
              )}

              {/* Subject */}
              <div className="space-y-1.5">
                <Label>Betreff</Label>
                <Input value={mahnung.subject} onChange={e => setMahnung(p => p ? { ...p, subject: e.target.value } : null)} />
              </div>

              {/* Body */}
              <div className="space-y-1.5">
                <Label>Inhalt</Label>
                <Textarea
                  rows={10}
                  className="font-mono text-xs resize-none"
                  value={mahnung.body}
                  onChange={e => setMahnung(p => p ? { ...p, body: e.target.value } : null)}
                />
              </div>

              {/* Tracking (letter only) */}
              {mahnung.channel === "letter" && (
                <div className="space-y-1.5">
                  <Label>Sendungsnummer (optional)</Label>
                  <Input
                    placeholder="z.B. RR 123 456 789 DE"
                    value={mahnung.trackingNumber}
                    onChange={e => setMahnung(p => p ? { ...p, trackingNumber: e.target.value } : null)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Für Deutsche Post Einschreiben: Sendungsnummer nach dem Versand hier eintragen und speichern.
                  </p>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setMahnung(null)}>Abbrechen</Button>
              <Button
                onClick={sendMahnung}
                disabled={sendEmail.isPending || logLetter.isPending}
                className="bg-[#1C3829] hover:bg-[#2a5240] text-white"
              >
                <Send className="h-3.5 w-3.5 mr-1.5" />
                {mahnung.channel === "email" ? "E-Mail senden" : "Als verschickt erfassen"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
