import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMaintenanceIssues, useCreateMaintenanceIssue, useUpdateMaintenanceIssue, useDeleteMaintenanceIssue,
  getMaintenanceIssuesQueryKey,
  type MaintenanceIssueItem,
} from "@workspace/api-client-react";
import { useListProperties } from "@workspace/api-client-react";
import { Wrench, Plus, ChevronDown, Pencil, Trash2, AlertTriangle, Clock, CheckCircle2, Zap, Droplet, Flame, Building2, Cpu, MoreHorizontal } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

const PRIORITIES = [
  { value: "urgent", label: "Dringend",   cls: "bg-red-100 text-red-700 border-red-200" },
  { value: "high",   label: "Hoch",       cls: "bg-orange-100 text-orange-700 border-orange-200" },
  { value: "medium", label: "Mittel",     cls: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "low",    label: "Niedrig",    cls: "bg-gray-100 text-gray-600 border-gray-200" },
];
const STATUSES = [
  { value: "open",        label: "Offen",          cls: "bg-red-100 text-red-700",     Icon: AlertTriangle },
  { value: "in_progress", label: "In Bearbeitung", cls: "bg-blue-100 text-blue-700",   Icon: Clock },
  { value: "resolved",    label: "Erledigt",       cls: "bg-emerald-100 text-emerald-700", Icon: CheckCircle2 },
];
const CATEGORIES = [
  { value: "plumbing",    label: "Sanitär",     Icon: Droplet   },
  { value: "electrical",  label: "Elektrik",    Icon: Zap       },
  { value: "heating",     label: "Heizung",     Icon: Flame     },
  { value: "structural",  label: "Bausubstanz", Icon: Building2 },
  { value: "appliance",   label: "Hausgeräte",  Icon: Cpu       },
  { value: "other",       label: "Sonstiges",   Icon: MoreHorizontal },
];

function PriorityBadge({ priority }: { priority: string }) {
  const p = PRIORITIES.find(x => x.value === priority) ?? PRIORITIES[2];
  return <Badge variant="outline" className={`text-[10px] ${p.cls}`}>{p.label}</Badge>;
}
function StatusBadge({ status }: { status: string }) {
  const s = STATUSES.find(x => x.value === status) ?? STATUSES[0];
  return <Badge className={`text-[10px] border-0 ${s.cls} flex items-center gap-1`}><s.Icon className="h-2.5 w-2.5" />{s.label}</Badge>;
}
function CategoryIcon({ category }: { category: string }) {
  const c = CATEGORIES.find(x => x.value === category) ?? CATEGORIES[5];
  return <c.Icon className="h-4 w-4 text-muted-foreground" />;
}

type FormState = {
  propertyId: string;
  title: string;
  description: string;
  priority: string;
  category: string;
  reportedAt: string;
};

const emptyForm = (): FormState => ({
  propertyId: "",
  title: "",
  description: "",
  priority: "medium",
  category: "other",
  reportedAt: new Date().toISOString().slice(0, 10),
});

export default function MaintenancePage() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [editingIssue, setEditingIssue] = useState<MaintenanceIssueItem | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const { toast } = useToast();
  const qc = useQueryClient();

  const qKey = { status: statusFilter === "all" ? undefined : statusFilter };
  const { data: issues = [], isLoading } = useGetMaintenanceIssues(qKey);
  const { data: properties = [] } = useListProperties();
  const createMutation = useCreateMaintenanceIssue();
  const updateMutation = useUpdateMaintenanceIssue();
  const deleteMutation = useDeleteMaintenanceIssue();

  function openCreate() {
    setEditingIssue(null);
    setForm(emptyForm());
    setShowForm(true);
  }

  function openEdit(issue: MaintenanceIssueItem) {
    setEditingIssue(issue);
    setForm({
      propertyId: String(issue.propertyId),
      title:       issue.title,
      description: issue.description ?? "",
      priority:    issue.priority,
      category:    issue.category,
      reportedAt:  issue.reportedAt ?? new Date().toISOString().slice(0, 10),
    });
    setShowForm(true);
  }

  async function handleSubmit() {
    if (!form.propertyId || !form.title.trim()) {
      toast({ title: "Objekt und Bezeichnung sind erforderlich", variant: "destructive" });
      return;
    }
    try {
      if (editingIssue) {
        await updateMutation.mutateAsync({ id: editingIssue.id, ...form, propertyId: Number(form.propertyId) });
        toast({ title: "Wartungsvorgang aktualisiert" });
      } else {
        await createMutation.mutateAsync({ ...form, propertyId: Number(form.propertyId) });
        toast({ title: "Wartungsvorgang angelegt" });
      }
      qc.invalidateQueries({ queryKey: getMaintenanceIssuesQueryKey(qKey) });
      setShowForm(false);
    } catch (err: any) {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    }
  }

  async function quickStatus(issue: MaintenanceIssueItem, status: string) {
    try {
      const update: Record<string, any> = { status };
      if (status === "resolved") update.resolvedAt = new Date().toISOString().slice(0, 10);
      await updateMutation.mutateAsync({ id: issue.id, ...update });
      qc.invalidateQueries({ queryKey: getMaintenanceIssuesQueryKey(qKey) });
      toast({ title: "Status aktualisiert" });
    } catch { toast({ title: "Fehler", variant: "destructive" }); }
  }

  async function handleDelete(id: number) {
    try {
      await deleteMutation.mutateAsync(id);
      qc.invalidateQueries({ queryKey: getMaintenanceIssuesQueryKey(qKey) });
      toast({ title: "Gelöscht" });
    } catch { toast({ title: "Fehler", variant: "destructive" }); }
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#0f1c15]">Wartungsvorgänge</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Probleme und Reparaturen verwalten</p>
        </div>
        <Button className="bg-[#1C3829] hover:bg-[#2a5240] text-white" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1.5" />Neues Problem
        </Button>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44 h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Status</SelectItem>
            {STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{issues.length} Vorgänge</span>
      </div>

      {/* List */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Lädt …</p>
      ) : issues.length === 0 ? (
        <Card>
          <CardContent className="py-20 text-center text-muted-foreground">
            <Wrench className="h-10 w-10 mx-auto mb-3 opacity-20" />
            <p className="font-medium">Keine Wartungsvorgänge</p>
            <Button variant="outline" className="mt-4" onClick={openCreate}>Ersten Vorgang anlegen</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {issues.map((issue) => (
            <Card key={issue.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5"><CategoryIcon category={issue.category} /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-[#0f1c15]">{issue.title}</p>
                        {issue.description && (
                          <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{issue.description}</p>
                        )}
                        <div className="flex flex-wrap gap-2 mt-2 text-xs text-muted-foreground">
                          <span>{issue.propertyName}{issue.unitName ? ` · ${issue.unitName}` : ""}</span>
                          {issue.tenantName && <span>· {issue.tenantName}</span>}
                          {issue.reportedAt && <span>· Gemeldet: {issue.reportedAt}</span>}
                          {issue.resolvedAt  && <span>· Erledigt: {issue.resolvedAt}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <PriorityBadge priority={issue.priority} />
                        <StatusBadge   status={issue.status} />
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(issue)}><Pencil className="h-3.5 w-3.5 mr-2" />Bearbeiten</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {issue.status !== "open"        && <DropdownMenuItem onClick={() => quickStatus(issue, "open")}>        Als Offen markieren</DropdownMenuItem>}
                            {issue.status !== "in_progress" && <DropdownMenuItem onClick={() => quickStatus(issue, "in_progress")}>In Bearbeitung</DropdownMenuItem>}
                            {issue.status !== "resolved"    && <DropdownMenuItem onClick={() => quickStatus(issue, "resolved")}>   Als Erledigt markieren</DropdownMenuItem>}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-red-600" onClick={() => handleDelete(issue.id)}>
                              <Trash2 className="h-3.5 w-3.5 mr-2" />Löschen
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingIssue ? "Vorgang bearbeiten" : "Neues Problem erfassen"}</DialogTitle>
            <DialogDescription>Details zum Wartungsvorgang</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label>Objekt *</Label>
              <Select value={form.propertyId} onValueChange={v => setForm(p => ({ ...p, propertyId: v }))}>
                <SelectTrigger><SelectValue placeholder="Objekt wählen" /></SelectTrigger>
                <SelectContent>
                  {properties.map((p: any) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Bezeichnung *</Label>
              <Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="z.B. Wasserhahn defekt WE 3" />
            </div>
            <div className="space-y-1.5">
              <Label>Beschreibung</Label>
              <Textarea rows={3} className="resize-none" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Priorität</Label>
                <Select value={form.priority} onValueChange={v => setForm(p => ({ ...p, priority: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PRIORITIES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Kategorie</Label>
                <Select value={form.category} onValueChange={v => setForm(p => ({ ...p, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Meldedatum</Label>
              <Input type="date" value={form.reportedAt} onChange={e => setForm(p => ({ ...p, reportedAt: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Abbrechen</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} className="bg-[#1C3829] hover:bg-[#2a5240] text-white">
              {editingIssue ? "Speichern" : "Anlegen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
