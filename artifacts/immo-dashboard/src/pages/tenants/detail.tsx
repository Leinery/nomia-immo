import { useState } from "react";
import { useParams } from "wouter";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListTenants, useGetCommunications, useCreateCommunication, useSendEmail,
  useGetSmtpStatus, useGetMaintenanceIssues, getCommunicationsQueryKey,
  type CommunicationItem,
} from "@workspace/api-client-react";
import {
  ArrowLeft, Mail, Send, FileText, Phone, Pencil, Trash2, AlertCircle,
  MailOpen, BookmarkCheck, StickyNote, MessageSquarePlus, Package, Wrench,
  Building2, User, MapPin, Smartphone, CreditCard, Hash,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const CHANNEL_META: Record<string, { label: string; Icon: any; color: string }> = {
  email_out:          { label: "E-Mail",       Icon: Send,          color: "text-blue-600" },
  email_in:           { label: "Eingang",      Icon: MailOpen,      color: "text-indigo-600" },
  letter_registered:  { label: "Einschreiben", Icon: BookmarkCheck, color: "text-orange-600" },
  letter_post:        { label: "Brief",        Icon: Mail,          color: "text-slate-600" },
  note:               { label: "Notiz",        Icon: StickyNote,    color: "text-yellow-600" },
  phone:              { label: "Telefonat",    Icon: Phone,         color: "text-green-600" },
};

const PRIORITY_META: Record<string, { label: string; cls: string }> = {
  urgent: { label: "Dringend",   cls: "bg-red-100 text-red-700 border-red-200" },
  high:   { label: "Hoch",       cls: "bg-orange-100 text-orange-700 border-orange-200" },
  medium: { label: "Mittel",     cls: "bg-amber-100 text-amber-700 border-amber-200" },
  low:    { label: "Niedrig",    cls: "bg-gray-100 text-gray-600 border-gray-200" },
};
const STATUS_META: Record<string, { label: string; cls: string }> = {
  open:        { label: "Offen",           cls: "bg-red-100 text-red-700" },
  in_progress: { label: "In Bearbeitung",  cls: "bg-blue-100 text-blue-700" },
  resolved:    { label: "Erledigt",        cls: "bg-emerald-100 text-emerald-700" },
};

function formatTs(ts: string) {
  return new Date(ts).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

type SendState = {
  channel: string;
  subject: string;
  body: string;
  trackingNumber: string;
};

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const tenantId = parseInt(id ?? "0");
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: tenants = [] } = useListTenants();
  const tenant = tenants.find((t) => t.id === tenantId);

  const { data: comms = [], isLoading: commsLoading } = useGetCommunications({ tenantId });
  const { data: issues = [] } = useGetMaintenanceIssues({});
  const tenantIssues = issues.filter((i) => i.tenantId === tenantId);

  const { data: smtpStatus } = useGetSmtpStatus();
  const sendEmailMutation = useSendEmail();
  const logMutation       = useCreateCommunication();

  const [sendDialog, setSendDialog] = useState<SendState | null>(null);

  function openSendDialog() {
    setSendDialog({ channel: "email_out", subject: "", body: "", trackingNumber: "" });
  }

  async function handleSend() {
    if (!sendDialog || !tenant) return;
    const { channel, subject, body, trackingNumber } = sendDialog;

    try {
      if (channel === "email_out") {
        if (!tenant.email) {
          toast({ title: "Keine E-Mail-Adresse", variant: "destructive" });
          return;
        }
        await sendEmailMutation.mutateAsync({ tenantId, toEmail: tenant.email, subject, body });
        toast({ title: "E-Mail gesendet" });
      } else {
        await logMutation.mutateAsync({
          tenantId, channel, direction: channel === "email_in" ? "inbound" : "outbound",
          subject: subject || null, body, status: "sent",
          trackingNumber: trackingNumber || null,
        });
        toast({ title: "Kommunikation erfasst" });
      }
      qc.invalidateQueries({ queryKey: getCommunicationsQueryKey({ tenantId }) });
      setSendDialog(null);
    } catch (err: any) {
      const detail = err?.response?.data?.hint ?? err?.response?.data?.error ?? err.message;
      toast({ title: "Fehler", description: detail, variant: "destructive" });
    }
  }

  if (!tenant) {
    return (
      <div className="p-6">
        <Link href="/tenants"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />Zurück</Button></Link>
        <p className="text-muted-foreground mt-4">Mieter nicht gefunden.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Back */}
      <Link href="/tenants">
        <Button variant="ghost" size="sm" className="mb-2 -ml-2 text-muted-foreground">
          <ArrowLeft className="h-4 w-4 mr-1" />Alle Mieter
        </Button>
      </Link>

      {/* Header card */}
      <Card>
        <CardContent className="pt-5 pb-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-3 flex-1 min-w-0">
              {/* Name / Firma */}
              <div>
                {(tenant as any).companyName ? (
                  <>
                    <h1 className="text-2xl font-semibold text-[#0f1c15] flex items-center gap-2">
                      <Building2 className="h-5 w-5 text-muted-foreground shrink-0" />
                      {(tenant as any).companyName}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5 ml-7">
                      {[tenant.firstName, tenant.lastName].filter(Boolean).join(" ")}
                      {(tenant as any).contactPerson && (
                        <span className="ml-3 text-xs bg-muted px-1.5 py-0.5 rounded">
                          AP: {(tenant as any).contactPerson}
                        </span>
                      )}
                    </p>
                  </>
                ) : (
                  <h1 className="text-2xl font-semibold text-[#0f1c15] flex items-center gap-2">
                    <User className="h-5 w-5 text-muted-foreground shrink-0" />
                    {tenant.firstName} {tenant.lastName}
                  </h1>
                )}
              </div>

              {/* Kontaktdaten-Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5 text-sm text-muted-foreground ml-7">
                {tenant.email && (
                  <a href={`mailto:${tenant.email}`} className="flex items-center gap-1.5 hover:text-primary transition-colors">
                    <Mail className="h-3.5 w-3.5 shrink-0" />{tenant.email}
                  </a>
                )}
                {tenant.phone && (
                  <a href={`tel:${tenant.phone}`} className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 shrink-0" />{tenant.phone}
                  </a>
                )}
                {(tenant as any).mobile && (
                  <a href={`tel:${(tenant as any).mobile}`} className="flex items-center gap-1.5">
                    <Smartphone className="h-3.5 w-3.5 shrink-0" />{(tenant as any).mobile}
                  </a>
                )}
                {((tenant as any).street || (tenant as any).city) && (
                  <span className="flex items-start gap-1.5">
                    <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>
                      {(tenant as any).street}{(tenant as any).street && <br />}
                      {[(tenant as any).zipCode, (tenant as any).city].filter(Boolean).join(" ")}
                    </span>
                  </span>
                )}
                {(tenant as any).iban && (
                  <span className="flex items-center gap-1.5 font-mono text-xs">
                    <CreditCard className="h-3.5 w-3.5 shrink-0" />{(tenant as any).iban}
                  </span>
                )}
                {(tenant as any).taxId && (
                  <span className="flex items-center gap-1.5">
                    <Hash className="h-3.5 w-3.5 shrink-0" />{(tenant as any).taxId}
                  </span>
                )}
              </div>
            </div>

            <Button className="bg-[#1C3829] hover:bg-[#2a5240] text-white shrink-0" onClick={openSendDialog}>
              <MessageSquarePlus className="h-4 w-4 mr-1.5" />Nachricht
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="kommunikation">
        <TabsList>
          <TabsTrigger value="kommunikation">Kommunikation ({comms.length})</TabsTrigger>
          <TabsTrigger value="wartung">Wartungsvorgänge ({tenantIssues.length})</TabsTrigger>
        </TabsList>

        {/* ── Kommunikation ── */}
        <TabsContent value="kommunikation" className="mt-4">
          {commsLoading ? (
            <p className="text-sm text-muted-foreground">Lädt …</p>
          ) : comms.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center text-muted-foreground">
                <MessageSquarePlus className="h-8 w-8 mx-auto mb-3 opacity-30" />
                <p>Noch keine Kommunikation erfasst.</p>
                <Button variant="outline" className="mt-4" onClick={openSendDialog}>Erste Nachricht senden</Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {comms.map((c) => <CommEntry key={c.id} comm={c} />)}
            </div>
          )}
        </TabsContent>

        {/* ── Wartung ── */}
        <TabsContent value="wartung" className="mt-4">
          {tenantIssues.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Wrench className="h-8 w-8 mx-auto mb-3 opacity-30" />
                <p>Keine Wartungsvorgänge für diesen Mieter.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {tenantIssues.map((issue) => {
                const p = PRIORITY_META[issue.priority] ?? PRIORITY_META.medium;
                const s = STATUS_META[issue.status]   ?? STATUS_META.open;
                return (
                  <Card key={issue.id}>
                    <CardContent className="pt-4 pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-0.5">
                          <p className="font-medium text-sm">{issue.title}</p>
                          {issue.description && <p className="text-xs text-muted-foreground">{issue.description}</p>}
                          <p className="text-xs text-muted-foreground">{issue.propertyName}{issue.unitName ? ` · ${issue.unitName}` : ""}</p>
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          <Badge variant="outline" className={`text-[10px] ${p.cls}`}>{p.label}</Badge>
                          <Badge className={`text-[10px] border-0 ${s.cls}`}>{s.label}</Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Send / Log dialog */}
      {sendDialog && (
        <Dialog open onOpenChange={() => setSendDialog(null)}>
          <DialogContent className="sm:max-w-[540px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Nachricht an {tenant.firstName} {tenant.lastName}</DialogTitle>
              <DialogDescription>Kommunikation senden oder manuell erfassen</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-1">
              <div className="space-y-1.5">
                <Label>Kanal</Label>
                <Select value={sendDialog.channel} onValueChange={v => setSendDialog(p => p ? { ...p, channel: v } : null)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email_out">E-Mail (senden)</SelectItem>
                    <SelectItem value="email_in">E-Mail (Eingang erfassen)</SelectItem>
                    <SelectItem value="letter_registered">Einschreiben</SelectItem>
                    <SelectItem value="letter_post">Brief</SelectItem>
                    <SelectItem value="note">Interne Notiz</SelectItem>
                    <SelectItem value="phone">Telefonat</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {sendDialog.channel === "email_out" && !smtpStatus?.configured && (
                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>SMTP nicht konfiguriert. Bitte <strong>SMTP_HOST</strong>, <strong>SMTP_USER</strong>, <strong>SMTP_PASS</strong> setzen.</span>
                </div>
              )}

              {sendDialog.channel !== "note" && sendDialog.channel !== "phone" && (
                <div className="space-y-1.5">
                  <Label>Betreff</Label>
                  <Input value={sendDialog.subject} onChange={e => setSendDialog(p => p ? { ...p, subject: e.target.value } : null)} />
                </div>
              )}

              <div className="space-y-1.5">
                <Label>{sendDialog.channel === "note" ? "Notiz" : sendDialog.channel === "phone" ? "Gesprächsnotiz" : "Inhalt"}</Label>
                <Textarea
                  rows={8}
                  className="resize-none"
                  value={sendDialog.body}
                  onChange={e => setSendDialog(p => p ? { ...p, body: e.target.value } : null)}
                />
              </div>

              {(sendDialog.channel === "letter_registered" || sendDialog.channel === "letter_post") && (
                <div className="space-y-1.5">
                  <Label>Sendungsnummer (optional)</Label>
                  <Input
                    placeholder="z.B. RR 123 456 789 DE"
                    value={sendDialog.trackingNumber}
                    onChange={e => setSendDialog(p => p ? { ...p, trackingNumber: e.target.value } : null)}
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSendDialog(null)}>Abbrechen</Button>
              <Button
                onClick={handleSend}
                disabled={sendEmailMutation.isPending || logMutation.isPending || !sendDialog.body.trim()}
                className="bg-[#1C3829] hover:bg-[#2a5240] text-white"
              >
                <Send className="h-3.5 w-3.5 mr-1.5" />
                {sendDialog.channel === "email_out" ? "Senden" : "Erfassen"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function CommEntry({ comm }: { comm: CommunicationItem }) {
  const meta = CHANNEL_META[comm.channel] ?? { label: comm.channel, Icon: FileText, color: "text-gray-500" };
  const { Icon } = meta;
  const isOutbound = comm.direction === "outbound";

  return (
    <div className={`flex gap-3 ${isOutbound ? "flex-row" : "flex-row-reverse"}`}>
      <div className={`mt-1 h-7 w-7 rounded-full flex items-center justify-center shrink-0 ${isOutbound ? "bg-[#e8f0ea]" : "bg-blue-50"}`}>
        <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
      </div>
      <div className={`max-w-[80%] space-y-1 ${isOutbound ? "" : "items-end"}`}>
        <div className={`rounded-xl px-4 py-2.5 text-sm ${isOutbound ? "bg-[#1C3829] text-white" : "bg-white border text-[#0f1c15]"}`}>
          {comm.subject && <p className="font-medium text-xs opacity-70 mb-1">{comm.subject}</p>}
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{comm.body}</p>
          {comm.trackingNumber && comm.channel !== "email_out" && (
            <p className="text-xs opacity-60 mt-1">Sendung: {comm.trackingNumber}</p>
          )}
          {comm.mahnungLevel && (
            <span className={`inline-block mt-1 text-[10px] rounded px-1.5 py-0.5 font-medium ${isOutbound ? "bg-white/20" : "bg-red-100 text-red-700"}`}>
              {comm.mahnungLevel}. Mahnung
            </span>
          )}
        </div>
        <p className={`text-[10px] text-muted-foreground px-1 ${isOutbound ? "" : "text-right"}`}>
          {meta.label} · {formatTs(comm.createdAt)}
        </p>
      </div>
    </div>
  );
}
