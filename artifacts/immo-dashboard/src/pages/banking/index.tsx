import * as React from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useToast } from "@/hooks/use-toast"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Landmark, RefreshCw, CheckCircle2, CircleDashed, EyeOff, Bot } from "lucide-react"

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "")

// ─── Types ───────────────────────────────────────────────────────────────────

interface NevloAccount {
  id: string
  accountName: string
  iban: string
  balance: number
  currency: string
  lastSyncedAt: string
  bankConnection: { bankName: string; status: string }
}

interface Payment {
  id: number
  nevloTransactionId: string
  accountName: string
  accountIban: string
  bankName: string
  amount: number
  currency: string
  bookingDate: string
  counterpartName: string | null
  counterpartIban: string | null
  purpose: string | null
  contractId: number | null
  matchStatus: "matched" | "unmatched" | "ignored"
  matchedAutomatically: boolean
  tenantName: string | null
}

interface Contract {
  id: number
  monthlyRent: number
  status: string
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function fetchAccounts(): Promise<{ accounts: NevloAccount[] }> {
  const r = await fetch(`${BASE}/api/banking/accounts`)
  if (!r.ok) throw new Error("Konten konnten nicht geladen werden")
  return r.json()
}

async function fetchPayments(): Promise<Payment[]> {
  const r = await fetch(`${BASE}/api/banking/payments`)
  if (!r.ok) throw new Error("Zahlungen konnten nicht geladen werden")
  return r.json()
}

async function fetchContracts(): Promise<Contract[]> {
  const r = await fetch(`${BASE}/api/contracts?status=active`)
  if (!r.ok) throw new Error("Verträge konnten nicht geladen werden")
  return r.json()
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatEur(amount: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amount)
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("de-DE")
}

function formatIban(iban: string) {
  return iban.replace(/(.{4})/g, "$1 ").trim()
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status, auto }: { status: Payment["matchStatus"]; auto: boolean }) {
  if (status === "matched")
    return (
      <Badge className="gap-1 bg-emerald-100 text-emerald-800 border-emerald-200">
        <CheckCircle2 className="h-3 w-3" />
        Zugeordnet
        {auto && <Bot className="h-3 w-3 ml-0.5 opacity-60" />}
      </Badge>
    )
  if (status === "ignored")
    return (
      <Badge variant="outline" className="gap-1 text-muted-foreground">
        <EyeOff className="h-3 w-3" />
        Ignoriert
      </Badge>
    )
  return (
    <Badge variant="outline" className="gap-1 border-amber-300 text-amber-700 bg-amber-50">
      <CircleDashed className="h-3 w-3" />
      Offen
    </Badge>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function BankingPage() {
  const { toast } = useToast()
  const qc = useQueryClient()

  const accountsQ = useQuery({ queryKey: ["banking-accounts"], queryFn: fetchAccounts })
  const paymentsQ = useQuery({ queryKey: ["banking-payments"], queryFn: fetchPayments })
  const contractsQ = useQuery({ queryKey: ["contracts"], queryFn: fetchContracts })

  const syncMut = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${BASE}/api/banking/sync`, { method: "POST" })
      if (!r.ok) throw new Error("Sync fehlgeschlagen")
      return r.json() as Promise<{ imported: number; matched: number }>
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["banking-payments"] })
      toast({
        title: "Sync abgeschlossen",
        description: `${data.imported} neue Buchungen importiert, ${data.matched} automatisch zugeordnet.`,
      })
    },
    onError: () => toast({ title: "Sync fehlgeschlagen", variant: "destructive" }),
  })

  const matchMut = useMutation({
    mutationFn: async ({ paymentId, contractId }: { paymentId: number; contractId: number | null }) => {
      const r = await fetch(`${BASE}/api/banking/payments/${paymentId}/match`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractId }),
      })
      if (!r.ok) throw new Error("Zuordnung fehlgeschlagen")
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["banking-payments"] }),
    onError: () => toast({ title: "Zuordnung fehlgeschlagen", variant: "destructive" }),
  })

  const ignoreMut = useMutation({
    mutationFn: async (paymentId: number) => {
      const r = await fetch(`${BASE}/api/banking/payments/${paymentId}/ignore`, { method: "PATCH" })
      if (!r.ok) throw new Error()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["banking-payments"] }),
    onError: () => toast({ title: "Fehler", variant: "destructive" }),
  })

  const accounts = accountsQ.data?.accounts ?? []
  const payments = paymentsQ.data ?? []
  const contracts = contractsQ.data ?? []

  const matched = payments.filter((p) => p.matchStatus === "matched").length
  const unmatched = payments.filter((p) => p.matchStatus === "unmatched").length
  const totalIncoming = payments.reduce((s, p) => s + (p.matchStatus !== "ignored" ? p.amount : 0), 0)

  return (
    <div className="space-y-6 px-4 md:px-8 py-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Banking</h1>
          <p className="text-muted-foreground text-sm">Kontoauszugs-Abgleich via Nevlo</p>
        </div>
        <Button
          onClick={() => syncMut.mutate()}
          disabled={syncMut.isPending}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${syncMut.isPending ? "animate-spin" : ""}`} />
          {syncMut.isPending ? "Synchronisiere …" : "Jetzt synchronisieren"}
        </Button>
      </div>

      {/* Account cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {accountsQ.isLoading && (
          <p className="text-sm text-muted-foreground col-span-3">Lade Konten …</p>
        )}
        {accounts.map((acc) => (
          <Card key={acc.id} className="relative overflow-hidden">
            <div className="absolute top-0 left-0 h-1 w-full bg-[hsl(var(--sidebar))]" />
            <CardHeader className="pb-2 pt-5">
              <div className="flex items-start gap-3">
                <div className="rounded-md bg-muted p-2">
                  <Landmark className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <CardTitle className="text-base">{acc.accountName}</CardTitle>
                  <p className="text-xs text-muted-foreground">{acc.bankConnection.bankName}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-1">
              <p className="text-2xl font-bold">{formatEur(acc.balance)}</p>
              <p className="text-xs text-muted-foreground font-mono">{formatIban(acc.iban)}</p>
              <p className="text-xs text-muted-foreground">
                Zuletzt sync: {formatDate(acc.lastSyncedAt)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Summary stats */}
      {payments.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-5 pb-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Gesamt importiert</p>
              <p className="text-2xl font-bold mt-1">{formatEur(totalIncoming)}</p>
              <p className="text-xs text-muted-foreground">{payments.length} Buchungen</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Zugeordnet</p>
              <p className="text-2xl font-bold mt-1 text-emerald-700">{matched}</p>
              <p className="text-xs text-muted-foreground">Buchungen</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Offen</p>
              <p className="text-2xl font-bold mt-1 text-amber-600">{unmatched}</p>
              <p className="text-xs text-muted-foreground">Buchungen</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Transactions table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Eingegangene Zahlungen</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {paymentsQ.isLoading ? (
            <p className="text-sm text-muted-foreground p-6">Lade Buchungen …</p>
          ) : payments.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <RefreshCw className="h-8 w-8 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">Noch keine Buchungen importiert</p>
              <p className="text-xs mt-1">Klicke auf „Jetzt synchronisieren" um Kontobewegungen zu laden.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Datum</TableHead>
                    <TableHead>Absender</TableHead>
                    <TableHead>Verwendungszweck</TableHead>
                    <TableHead className="text-right">Betrag</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Vertrag zuordnen</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p) => (
                    <TableRow
                      key={p.id}
                      className={
                        p.matchStatus === "matched"
                          ? "bg-emerald-50/40"
                          : p.matchStatus === "ignored"
                          ? "opacity-50"
                          : ""
                      }
                    >
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatDate(p.bookingDate)}
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="font-medium">{p.counterpartName ?? "—"}</div>
                        {p.counterpartIban && (
                          <div className="text-xs text-muted-foreground font-mono">
                            {formatIban(p.counterpartIban)}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[220px] truncate">
                        {p.purpose ?? "—"}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-sm whitespace-nowrap text-emerald-700">
                        +{formatEur(p.amount)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={p.matchStatus} auto={p.matchedAutomatically} />
                        {p.tenantName && (
                          <div className="text-xs text-muted-foreground mt-1">{p.tenantName}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={p.contractId ? String(p.contractId) : "none"}
                          onValueChange={(val) =>
                            matchMut.mutate({
                              paymentId: p.id,
                              contractId: val === "none" ? null : parseInt(val, 10),
                            })
                          }
                          disabled={p.matchStatus === "ignored"}
                        >
                          <SelectTrigger className="h-8 text-xs w-44">
                            <SelectValue placeholder="Vertrag wählen …" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Kein Vertrag</SelectItem>
                            {contracts.map((c) => (
                              <SelectItem key={c.id} value={String(c.id)}>
                                Vertrag #{c.id} — {formatEur(c.monthlyRent)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        {p.matchStatus !== "ignored" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-muted-foreground"
                            onClick={() => ignoreMut.mutate(p.id)}
                          >
                            <EyeOff className="h-3 w-3 mr-1" />
                            Ignorieren
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
