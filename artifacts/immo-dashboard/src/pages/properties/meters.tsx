import * as React from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Plus, Gauge, ChevronDown, ChevronRight, PlusCircle, Trash2, History } from "lucide-react"

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "")

// ─── Types ───────────────────────────────────────────────────────────────────

interface MeterReading {
  id: number
  meterId: number
  readingDate: string
  readingValue: number
  readingType: "annual" | "move_in" | "move_out" | "interim"
  notes: string | null
}

interface Meter {
  id: number
  propertyId: number
  unitId: number | null
  name: string
  meterNumber: string | null
  meterType: string
  unitOfMeasure: string
  distributionKey: string
  location: string | null
  latestReading: MeterReading | null
}

interface Unit {
  id: number
  name: string
  unitType: string
}

// ─── Config ──────────────────────────────────────────────────────────────────

const METER_TYPES: Record<string, { label: string; color: string }> = {
  electricity: { label: "Strom",       color: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  gas:         { label: "Gas",         color: "bg-orange-100 text-orange-800 border-orange-200" },
  water_cold:  { label: "Kaltwasser",  color: "bg-blue-100 text-blue-800 border-blue-200" },
  water_hot:   { label: "Warmwasser",  color: "bg-red-100 text-red-800 border-red-200" },
  heat:        { label: "Wärme",       color: "bg-rose-100 text-rose-800 border-rose-200" },
  other:       { label: "Sonstiges",   color: "bg-gray-100 text-gray-700 border-gray-200" },
}

const DISTRIBUTION_KEYS: Record<string, string> = {
  direct:  "Direktmessung",
  person:  "Nach Personen",
  area:    "Nach Fläche (m²)",
  equal:   "Zu gleichen Teilen",
}

const READING_TYPES: Record<string, string> = {
  annual:   "Jahresablesung",
  move_in:  "Einzug",
  move_out: "Auszug",
  interim:  "Zwischenablesung",
}

const UOM_OPTIONS = [
  { value: "kWh", label: "kWh" },
  { value: "m3",  label: "m³" },
  { value: "GJ",  label: "GJ" },
]

// ─── API ─────────────────────────────────────────────────────────────────────

async function fetchMeters(propertyId: number): Promise<Meter[]> {
  const r = await fetch(`${BASE}/api/properties/${propertyId}/meters`)
  if (!r.ok) throw new Error("Zähler konnten nicht geladen werden")
  return r.json()
}

async function fetchReadings(meterId: number): Promise<MeterReading[]> {
  const r = await fetch(`${BASE}/api/meters/${meterId}/readings`)
  if (!r.ok) throw new Error("Ablesungen konnten nicht geladen werden")
  return r.json()
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MeterTypeBadge({ type }: { type: string }) {
  const cfg = METER_TYPES[type] ?? METER_TYPES.other
  return (
    <Badge variant="outline" className={`text-xs font-normal ${cfg.color}`}>
      {cfg.label}
    </Badge>
  )
}

function ReadingsDialog({
  meter,
  onClose,
}: {
  meter: Meter
  onClose: () => void
}) {
  const { toast } = useToast()
  const qc = useQueryClient()
  const readingsQ = useQuery({
    queryKey: ["meter-readings", meter.id],
    queryFn: () => fetchReadings(meter.id),
  })

  const [date, setDate] = React.useState(new Date().toISOString().split("T")[0])
  const [value, setValue] = React.useState("")
  const [type, setType] = React.useState("annual")
  const [notes, setNotes] = React.useState("")

  const addMut = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${BASE}/api/meters/${meter.id}/readings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ readingDate: date, readingValue: parseFloat(value), readingType: type, notes: notes || undefined }),
      })
      if (!r.ok) throw new Error()
      return r.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meter-readings", meter.id] })
      qc.invalidateQueries({ queryKey: ["meters", meter.propertyId] })
      setValue("")
      setNotes("")
      toast({ title: "Ablesung gespeichert" })
    },
    onError: () => toast({ title: "Fehler beim Speichern", variant: "destructive" }),
  })

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`${BASE}/api/meter-readings/${id}`, { method: "DELETE" })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meter-readings", meter.id] })
      qc.invalidateQueries({ queryKey: ["meters", meter.propertyId] })
    },
  })

  const readings = readingsQ.data ?? []

  const consumption = (() => {
    if (readings.length < 2) return null
    const sorted = [...readings].sort((a, b) => a.readingDate.localeCompare(b.readingDate))
    return sorted[sorted.length - 1].readingValue - sorted[0].readingValue
  })()

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gauge className="h-4 w-4" />
            {meter.name}
            {meter.meterNumber && (
              <span className="text-xs text-muted-foreground font-normal ml-1">Nr. {meter.meterNumber}</span>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Neue Ablesung */}
        <div className="border rounded-lg p-4 space-y-3 bg-muted/20">
          <p className="text-sm font-medium">Neue Ablesung eintragen</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Datum</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Zählerstand ({meter.unitOfMeasure})</Label>
              <Input
                type="number"
                step="0.001"
                placeholder="0.000"
                value={value}
                onChange={e => setValue(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Art</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(READING_TYPES).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notiz (optional)</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} className="h-8 text-sm" placeholder="z.B. Ableser: Hauswart" />
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => addMut.mutate()}
            disabled={!value || addMut.isPending}
            className="w-full"
          >
            <PlusCircle className="h-3.5 w-3.5 mr-1.5" />
            Ablesung speichern
          </Button>
        </div>

        {/* Verlauf */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium flex items-center gap-1.5">
              <History className="h-3.5 w-3.5" /> Ableseverlauf
            </p>
            {consumption != null && (
              <span className="text-xs text-muted-foreground">
                Verbrauch gesamt: <strong>{consumption.toLocaleString("de-DE", { maximumFractionDigits: 3 })} {meter.unitOfMeasure}</strong>
              </span>
            )}
          </div>
          {readingsQ.isLoading ? (
            <p className="text-xs text-muted-foreground">Lade …</p>
          ) : readings.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">Noch keine Ablesungen vorhanden.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Datum</TableHead>
                  <TableHead className="text-xs">Stand</TableHead>
                  <TableHead className="text-xs">Art</TableHead>
                  <TableHead className="text-xs">Δ Verbrauch</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {readings.map((r, i) => {
                  const prev = readings[i + 1]
                  const delta = prev ? r.readingValue - prev.readingValue : null
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm">{new Date(r.readingDate).toLocaleDateString("de-DE")}</TableCell>
                      <TableCell className="text-sm font-mono">{r.readingValue.toLocaleString("de-DE", { minimumFractionDigits: 3 })} {meter.unitOfMeasure}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{READING_TYPES[r.readingType] ?? r.readingType}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {delta != null ? `${delta > 0 ? "+" : ""}${delta.toLocaleString("de-DE", { maximumFractionDigits: 3 })} ${meter.unitOfMeasure}` : "—"}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteMut.mutate(r.id)}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Schließen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AddMeterDialog({
  propertyId,
  units,
  onClose,
}: {
  propertyId: number
  units: Unit[]
  onClose: () => void
}) {
  const { toast } = useToast()
  const qc = useQueryClient()

  const [name, setName] = React.useState("")
  const [meterNumber, setMeterNumber] = React.useState("")
  const [meterType, setMeterType] = React.useState("electricity")
  const [uom, setUom] = React.useState("kWh")
  const [distKey, setDistKey] = React.useState("direct")
  const [unitId, setUnitId] = React.useState<string>("property")
  const [location, setLocation] = React.useState("")

  // Auto-set UOM when type changes
  React.useEffect(() => {
    if (meterType === "gas" || meterType === "water_cold" || meterType === "water_hot") setUom("m3")
    else if (meterType === "heat") setUom("GJ")
    else setUom("kWh")
  }, [meterType])

  const addMut = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${BASE}/api/properties/${propertyId}/meters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          meterNumber: meterNumber || undefined,
          meterType,
          unitOfMeasure: uom,
          distributionKey: distKey,
          unitId: unitId === "property" ? null : parseInt(unitId, 10),
          location: location || undefined,
        }),
      })
      if (!r.ok) throw new Error()
      return r.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meters", propertyId] })
      toast({ title: "Zähler angelegt" })
      onClose()
    },
    onError: () => toast({ title: "Fehler beim Anlegen", variant: "destructive" }),
  })

  const residentialUnits = units.filter(u => u.unitType === "residential")

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Neuen Zähler anlegen</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Bezeichnung *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="z.B. Stromzähler Wohnung EG" className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Typ *</Label>
              <Select value={meterType} onValueChange={setMeterType}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(METER_TYPES).map(([v, { label }]) => (
                    <SelectItem key={v} value={v}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Einheit</Label>
              <Select value={uom} onValueChange={setUom}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UOM_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Zuordnung</Label>
              <Select value={unitId} onValueChange={setUnitId}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="property">Gebäudezähler</SelectItem>
                  {residentialUnits.map(u => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Verteilungsschlüssel</Label>
              <Select value={distKey} onValueChange={setDistKey}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(DISTRIBUTION_KEYS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Zählernummer</Label>
              <Input value={meterNumber} onChange={e => setMeterNumber(e.target.value)} placeholder="optional" className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Standort (optional)</Label>
              <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="z.B. Keller" className="h-8 text-sm" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button onClick={() => addMut.mutate()} disabled={!name || addMut.isPending}>
            Zähler anlegen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MetersSection({
  propertyId,
  units,
}: {
  propertyId: number
  units: Unit[]
}) {
  const { toast } = useToast()
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = React.useState(false)
  const [readingsMeter, setReadingsMeter] = React.useState<Meter | null>(null)
  const [openGroups, setOpenGroups] = React.useState<Set<string>>(new Set(["property"]))

  const metersQ = useQuery({
    queryKey: ["meters", propertyId],
    queryFn: () => fetchMeters(propertyId),
  })

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`${BASE}/api/meters/${id}`, { method: "DELETE" })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meters", propertyId] })
      toast({ title: "Zähler gelöscht" })
    },
    onError: () => toast({ title: "Fehler beim Löschen", variant: "destructive" }),
  })

  const meters = metersQ.data ?? []

  // Group: property-level + per unit
  const propertyMeters = meters.filter(m => m.unitId === null)
  const unitMap = new Map<number, Meter[]>()
  for (const m of meters.filter(m => m.unitId !== null)) {
    const arr = unitMap.get(m.unitId!) ?? []
    arr.push(m)
    unitMap.set(m.unitId!, arr)
  }

  const unitById = new Map(units.map(u => [u.id, u]))

  const toggleGroup = (key: string) => {
    setOpenGroups(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  function MeterRow({ m }: { m: Meter }) {
    return (
      <TableRow key={m.id} className="group">
        <TableCell className="text-sm font-medium">{m.name}</TableCell>
        <TableCell><MeterTypeBadge type={m.meterType} /></TableCell>
        <TableCell className="text-xs text-muted-foreground">{m.meterNumber ?? "—"}</TableCell>
        <TableCell className="text-xs text-muted-foreground">
          {DISTRIBUTION_KEYS[m.distributionKey] ?? m.distributionKey}
        </TableCell>
        <TableCell className="text-sm font-mono">
          {m.latestReading
            ? <span className="text-foreground">{m.latestReading.readingValue.toLocaleString("de-DE", { minimumFractionDigits: 3 })} {m.unitOfMeasure}</span>
            : <span className="text-muted-foreground italic text-xs">Kein Wert</span>
          }
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">
          {m.latestReading ? new Date(m.latestReading.readingDate).toLocaleDateString("de-DE") : "—"}
        </TableCell>
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setReadingsMeter(m)}>
              <Gauge className="h-3 w-3" /> Ablesen
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteMut.mutate(m.id)}>
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
    )
  }

  function MeterGroup({ groupKey, label, groupMeters }: { groupKey: string; label: string; groupMeters: Meter[] }) {
    const open = openGroups.has(groupKey)
    return (
      <Collapsible open={open} onOpenChange={() => toggleGroup(groupKey)}>
        <CollapsibleTrigger asChild>
          <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/40 border-b cursor-pointer hover:bg-muted/60 transition-colors select-none">
            {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
            <span className="text-sm font-medium">{label}</span>
            <Badge variant="secondary" className="text-xs ml-auto">{groupMeters.length} Zähler</Badge>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          {groupMeters.length === 0 ? (
            <p className="text-xs text-muted-foreground px-6 py-3 italic">Keine Zähler in dieser Gruppe.</p>
          ) : (
            <Table>
              <TableBody>
                {groupMeters.map(m => <MeterRow key={m.id} m={m} />)}
              </TableBody>
            </Table>
          )}
        </CollapsibleContent>
      </Collapsible>
    )
  }

  const residentialUnits = units.filter(u => u.unitType === "residential")

  return (
    <>
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Gauge className="h-4 w-4" /> Zähler & Ablesungen
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {meters.length} Zähler · {propertyMeters.length} Gebäude · {meters.length - propertyMeters.length} Einheiten
            </p>
          </div>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowAdd(true)}>
            <Plus className="h-3.5 w-3.5" /> Zähler hinzufügen
          </Button>
        </CardHeader>

        {/* Column headers */}
        {meters.length > 0 && (
          <div className="border-t">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs">Bezeichnung</TableHead>
                  <TableHead className="text-xs">Typ</TableHead>
                  <TableHead className="text-xs">Nr.</TableHead>
                  <TableHead className="text-xs">Schlüssel</TableHead>
                  <TableHead className="text-xs">Letzter Stand</TableHead>
                  <TableHead className="text-xs">Datum</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
            </Table>

            {/* Property-level group */}
            <MeterGroup groupKey="property" label="Gebäudezähler" groupMeters={propertyMeters} />

            {/* Per-unit groups */}
            {residentialUnits.map(u => {
              const uMeters = unitMap.get(u.id) ?? []
              return (
                <MeterGroup
                  key={u.id}
                  groupKey={String(u.id)}
                  label={u.name}
                  groupMeters={uMeters}
                />
              )
            })}
          </div>
        )}

        {meters.length === 0 && !metersQ.isLoading && (
          <CardContent className="py-10 text-center text-muted-foreground">
            <Gauge className="h-10 w-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm">Noch keine Zähler angelegt.</p>
            <p className="text-xs mt-1">Füge Gebäude- und Einheitszähler hinzu um Ablesungen zu erfassen.</p>
          </CardContent>
        )}
      </Card>

      {showAdd && (
        <AddMeterDialog
          propertyId={propertyId}
          units={units}
          onClose={() => setShowAdd(false)}
        />
      )}

      {readingsMeter && (
        <ReadingsDialog
          meter={readingsMeter}
          onClose={() => setReadingsMeter(null)}
        />
      )}
    </>
  )
}
