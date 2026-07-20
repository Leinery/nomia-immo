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
import { Landmark, RefreshCw, CheckCircle2, CircleDashed, EyeOff, Bot, ArrowDownLeft, ArrowUpRight } from "lucide-react"

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
  category: string | null
  tenantName: string | null
}

interface Contract {
  id: number
  monthlyRent: number
  status: string
}

const CATEGORIES = [
  { value: "rent",        label: "Miete" },
  { value: "utility",     label: "Nebenkosten" },
  { value: "maintenance", label: "Instandhaltung" },
  { value: "management",  label: "Verwaltung" },
  { value: "insurance",   label: "Versicherung" },
  { value: "tax",         label: "Steuer / Abgaben" },
  { value: "other",       label: "Sonstiges" },
]

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

// ─── Badges ──────────────────────────────────────────────────────────────────

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

function categoryLabel(cat: string | null) {
  return CATEGORIES.find((c) => c.value === cat)?.label ?? null
}

// ─── Main page ────────────────────────────────────────────────────────────────

type DirectionFilter = "all" | "credit" | "debit"

export default function BankingPage() {
  const { toast } = useToast()
  const qc = useQueryClient()
  const [direction, setDirection] = React.useState<DirectionFilter>("all")

  const accountsQ = useQuery({ queryKey: ["banking-accounts"], queryFn: fetchAccounts })
  const paymentsQ = useQuery({ queryKey: ["banking-payments"], queryFn: fetchPayments })
  const contractsQ = useQuery({ queryKey: ["contracts"], queryFn: fetchContracts })

  const syncMut = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${BASE}/api/banking/sync`, { method: "POST" })
      if (!r.ok) throw new Error("Sync fehlgeschlagen")
      return r.json() as Promise<{ imported: number; matched: number; total: number }>
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

  const categoryMut = useMutation({
    mutationFn: async ({ paymentId, category }: { paymentId: number; category: string | null }) => {
      const r = await fetch(`${BASE}/api/banking/payments/${paymentId}/category`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category }),
      })
      if (!r.ok) throw new Error("Kategorie konnte nicht gesetzt werden")
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["banking-payments"] }),
    onError: () => toast({ title: "Kategorie-Fehler", variant: "destructive" }),
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
  const allPayments = paymentsQ.data ?? []
  const contracts = contractsQ.data ?? []

  // Direction filter
  const payments = allPayments.filter((p) => {
    if (direction === "credit") return p.amount > 0
    if (direction === "debit") return p.amount < 0
    return true
  })

  const totalCredit = allPayments.filter(p => p.matchStatus !== "ignored" && p.amount > 0).reduce((s, p) => s + p.amount, 0)
  const totalDebit  = allPayments.filter(p => p.matchStatus !== "ignored" && p.amount < 0).reduce((s, p) => s + p.amount, 0)
  const matched   = allPayments.filter((p) => p.matchStatus === "matched").length
  const unmatched = allPayments.filter((p) => p.matchStatus === "unmatched").length

  return (
    <div className="space-y-6 px-4 md:px-8 py-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Banking</h1>
          <p className="text-muted-foreground text-sm">Alle Kontobewegungen via Nevlo</p>
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
      {allPayments.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-1.5 mb-1">
                <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-600" />
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Einnahmen</p>
              </div>
              <p className="text-xl font-bold text-emerald-700">{formatEur(totalCredit)}</p>
              <p className="text-xs text-muted-foreground">{allPayments.filter(p => p.amount > 0).length} Buchungen</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-1.5 mb-1">
                <ArrowUpRight className="h-3.5 w-3.5 text-red-500" />
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Ausgaben</p>
              </div>
              <p className="text-xl font-bold text-red-600">{formatEur(totalDebit)}</p>
              <p className="text-xs text-muted-foreground">{allPayments.filter(p => p.amount < 0).length} Buchungen</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Zugeordnet</p>
              <p className="text-xl font-bold text-emerald-700">{matched}</p>
              <p className="text-xs text-muted-foreground">Buchungen</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Offen</p>
              <p className="text-xl font-bold text-amber-600">{unmatched}</p>
              <p className="text-xs text-muted-foreground">Buchungen</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Transactions table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Alle Buchungen</CardTitle>
          {/* Direction filter tabs */}
          <div className="flex gap-1 rounded-lg border p-1 bg-muted/40">
            {(["all", "credit", "debit"] as DirectionFilter[]).map((d) => (
              <button
                key={d}
                onClick={() => setDirection(d)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  direction === d
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {d === "all" ? "Alle" : d === "credit" ? "Einnahmen" : "Ausgaben"}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {paymentsQ.isLoading ? (
            <p className="text-sm text-muted-foreground p-6">Lade Buchungen …</p>
          ) : payments.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <RefreshCw className="h-8 w-8 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">
                {allPayments.length === 0
                  ? "Noch keine Buchungen importiert"
                  : "Keine Buchungen für diesen Filter"}
              </p>
              {allPayments.length === 0 && (
                <p className="text-xs mt-1">Klicke auf „Jetzt synchronisieren" um Kontobewegungen zu laden.</p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">Datum</TableHead>
                    <TableHead>Gegenkonto</TableHead>
                    <TableHead>Verwendungszweck</TableHead>
                    <TableHead className="text-right">Betrag</TableHead>
                    <TableHead>Kategorie</TableHead>
                    <TableHead>Status / Vertrag</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p) => {
                    const isCredit = p.amount > 0
                    return (
                      <TableRow
                        key={p.id}
                        className={
                          p.matchStatus === "ignored"
                            ? "opacity-40"
                            : ""
                        }
                      >
                        <TableCell className="whitespace-nowrap text-sm">
                          {formatDate(p.bookingDate)}
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="flex items-center gap-1.5">
                            {isCredit
                              ? <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                              : <ArrowUpRight className="h-3.5 w-3.5 text-red-500 shrink-0" />
                            }
                            <div>
                              <div className="font-medium leading-tight">{p.counterpartName ?? "—"}</div>
                              {p.counterpartIban && (
                                <div className="text-xs text-muted-foreground font-mono">
                                  {formatIban(p.counterpartIban)}
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                          {p.purpose ?? "—"}
                        </TableCell>
                        <TableCell className={`text-right font-semibold text-sm whitespace-nowrap ${isCredit ? "text-emerald-700" : "text-red-600"}`}>
                          {isCredit ? "+" : ""}{formatEur(p.amount)}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={p.category ?? "none"}
                            onValueChange={(val) =>
                              categoryMut.mutate({
                                paymentId: p.id,
                                category: val === "none" ? null : val,
                              })
                            }
                          >
                            <SelectTrigger className="h-8 text-xs w-40">
                              <SelectValue placeholder="Kategorie …">
                                {p.category ? categoryLabel(p.category) : <span className="text-muted-foreground">Kategorie …</span>}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none"><span className="text-muted-foreground">— keine —</span></SelectItem>
                              {CATEGORIES.map((c) => (
                                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          {isCredit ? (
                            <>
                              <StatusBadge status={p.matchStatus} auto={p.matchedAutomatically} />
                              {p.tenantName && (
                                <div className="text-xs text-muted-foreground mt-1">{p.tenantName}</div>
                              )}
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
                                <SelectTrigger className="h-7 text-xs w-40 mt-1">
                                  <SelectValue placeholder="Vertrag …" />
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
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground">Ausgabe</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {p.matchStatus !== "ignored" ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-muted-foreground"
                              onClick={() => ignoreMut.mutate(p.id)}
                            >
                              <EyeOff className="h-3 w-3 mr-1" />
                              Ignorieren
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-muted-foreground"
                              onClick={() =>
                                matchMut.mutate({ paymentId: p.id, contractId: null })
                              }
                            >
                              Wiederherstellen
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
