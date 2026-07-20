import { useState, useMemo } from "react";
import { 
  useListContracts, 
  useCreateContract, 
  useUpdateContract, 
  useDeleteContract,
  getListContractsQueryKey,
  useListTenants,
  useListProperties,
  useListUnits,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { FileText, Plus, Edit, Trash2, CalendarDays, KeyRound, Building2, User } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/utils";

const contractSchema = z.object({
  tenantId: z.coerce.number().min(1, "Mieter ist erforderlich"),
  propertyId: z.coerce.number().min(1, "Immobilie ist erforderlich"),
  unitId: z.coerce.number().min(1, "Einheit ist erforderlich"),
  startDate: z.string().min(1, "Startdatum ist erforderlich"),
  endDate: z.string().optional().nullable(),
  monthlyRent: z.coerce.number().min(0, "Miete muss positiv sein"),
  deposit: z.coerce.number().optional().nullable(),
  status: z.enum(["active", "terminated", "pending"]),
  notes: z.string().optional().nullable(),
});

type ContractFormValues = z.infer<typeof contractSchema>;

export default function ContractsList() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data: contracts, isLoading: isLoadingContracts } = useListContracts();
  const { data: tenants } = useListTenants();
  const { data: properties } = useListProperties();
  
  const createMutation = useCreateContract();
  const updateMutation = useUpdateContract();
  const deleteMutation = useDeleteContract();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const form = useForm<ContractFormValues>({
    resolver: zodResolver(contractSchema),
    defaultValues: {
      tenantId: 0,
      propertyId: 0,
      unitId: 0,
      startDate: "",
      endDate: "",
      monthlyRent: 0,
      deposit: 0,
      status: "pending",
      notes: "",
    },
  });

  const selectedPropertyId = form.watch("propertyId");
  
  const { data: units } = useListUnits(selectedPropertyId, {
    query: { enabled: !!selectedPropertyId }
  });

  const onSubmit = (data: ContractFormValues) => {
    const payload = {
      tenantId: data.tenantId,
      unitId: data.unitId,
      startDate: data.startDate,
      endDate: data.endDate || undefined,
      monthlyRent: data.monthlyRent,
      deposit: data.deposit || undefined,
      status: data.status,
      notes: data.notes || undefined,
    };

    if (editingId) {
      updateMutation.mutate(
        { id: editingId, data: payload },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListContractsQueryKey() });
            toast({ title: "Vertrag aktualisiert" });
            setIsDialogOpen(false);
          },
        }
      );
    } else {
      createMutation.mutate(
        { data: payload as any },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListContractsQueryKey() });
            toast({ title: "Vertrag erstellt" });
            setIsDialogOpen(false);
          },
        }
      );
    }
  };

  const handleEdit = (contract: any) => {
    setEditingId(contract.id);
    
    // We need to find the propertyId for this unit to populate the cascade select
    // For now, we leave propertyId empty or try to guess. The user might need to re-select if they want to change unit.
    // Ideally the API would return propertyId inside the contract or unit object.
    
    form.reset({
      tenantId: contract.tenantId,
      unitId: contract.unitId,
      startDate: new Date(contract.startDate).toISOString().split('T')[0],
      endDate: contract.endDate ? new Date(contract.endDate).toISOString().split('T')[0] : "",
      monthlyRent: contract.monthlyRent,
      deposit: contract.deposit || undefined,
      status: contract.status as any,
      notes: contract.notes || "",
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    if (!confirm("Sind Sie sicher, dass Sie diesen Vertrag löschen möchten?")) return;
    deleteMutation.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListContractsQueryKey() });
          toast({ title: "Vertrag gelöscht" });
        },
      }
    );
  };

  const openCreateDialog = () => {
    setEditingId(null);
    form.reset({
      tenantId: undefined,
      propertyId: undefined,
      unitId: undefined,
      startDate: "",
      endDate: "",
      monthlyRent: undefined,
      deposit: undefined,
      status: "pending",
      notes: "",
    });
    setIsDialogOpen(true);
  };

  // Helper maps for display
  const tenantMap = useMemo(() => {
    const map = new Map();
    tenants?.forEach(t => map.set(t.id, `${t.firstName} ${t.lastName}`));
    return map;
  }, [tenants]);

  return (
    <div className="flex-1 space-y-8 p-8 max-w-7xl mx-auto w-full animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-serif text-foreground">Mietverträge</h1>
          <p className="text-muted-foreground mt-1 font-sans">Laufende und beendete Verträge verwalten.</p>
        </div>
        <Button onClick={openCreateDialog} className="gap-2">
          <Plus className="w-4 h-4" />
          Neuer Vertrag
        </Button>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead>Vertragsparteien & Objekt</TableHead>
                <TableHead>Laufzeit</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Konditionen</TableHead>
                <TableHead className="text-right">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingContracts ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">Lade Verträge...</TableCell>
                </TableRow>
              ) : contracts?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                    <FileText className="w-12 h-12 mx-auto text-muted mb-4" />
                    Keine Verträge gefunden.
                  </TableCell>
                </TableRow>
              ) : (
                contracts?.map((contract) => (
                  <TableRow key={contract.id} className="group">
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5 font-medium text-foreground">
                          <User className="w-4 h-4 text-muted-foreground" />
                          {tenantMap.get(contract.tenantId) || `Mieter ID: ${contract.tenantId}`}
                        </div>
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <KeyRound className="w-3.5 h-3.5" />
                          Einheit ID: {contract.unitId} {/* In a full app we'd fetch the unit to display the name */}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div className="flex items-center gap-1.5">
                          <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" />
                          <span>{formatDate(contract.startDate)}</span>
                          <span className="text-muted-foreground">-</span>
                          <span>{contract.endDate ? formatDate(contract.endDate) : "Unbefristet"}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={
                        contract.status === 'active' ? 'success' : 
                        contract.status === 'terminated' ? 'destructive' : 'warning'
                      }>
                        {contract.status === 'active' ? 'Aktiv' : 
                         contract.status === 'terminated' ? 'Beendet' : 'Ausstehend'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="font-mono font-medium">{formatCurrency(contract.monthlyRent)}/M.</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Kaution: {formatCurrency(contract.deposit)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(contract)}>
                          <Edit className="w-4 h-4 text-muted-foreground" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(contract.id)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
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

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{editingId ? "Vertrag bearbeiten" : "Neuen Vertrag anlegen"}</DialogTitle>
            <DialogDescription>
              Legen Sie die Konditionen des Mietverhältnisses fest.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="tenantId"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>Mieter</FormLabel>
                      <Select onValueChange={(val) => field.onChange(Number(val))} value={field.value ? String(field.value) : undefined}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Mieter auswählen..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {tenants?.map(t => (
                            <SelectItem key={t.id} value={String(t.id)}>
                              {t.firstName} {t.lastName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {!editingId && (
                  <FormField
                    control={form.control}
                    name="propertyId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Immobilie (für Objektauswahl)</FormLabel>
                        <Select onValueChange={(val) => { field.onChange(Number(val)); form.setValue("unitId", 0); }} value={field.value ? String(field.value) : undefined}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Immobilie..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {properties?.map(p => (
                              <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                
                <FormField
                  control={form.control}
                  name="unitId"
                  render={({ field }) => (
                    <FormItem className={editingId ? "col-span-2" : ""}>
                      <FormLabel>Wohneinheit</FormLabel>
                      <Select onValueChange={(val) => field.onChange(Number(val))} value={field.value ? String(field.value) : undefined} disabled={!editingId && !selectedPropertyId}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Einheit auswählen..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {editingId ? (
                             <SelectItem value={String(field.value)}>Einheit ID: {field.value}</SelectItem>
                          ) : (
                            units?.map(u => (
                              <SelectItem key={u.id} value={String(u.id)} disabled={u.status === 'occupied'}>
                                {u.name} {u.status === 'occupied' ? '(Vermietet)' : ''}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>Vertragsstatus</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Wählen..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="pending">Ausstehend</SelectItem>
                          <SelectItem value="active">Aktiv</SelectItem>
                          <SelectItem value="terminated">Beendet</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vertragsbeginn</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="endDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vertragsende (Optional)</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="monthlyRent"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Monatsmiete (€)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="deposit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Kaution (€)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>Besondere Vereinbarungen / Notizen</FormLabel>
                      <FormControl>
                        <Input placeholder="..." {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <DialogFooter className="pt-4">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Abbrechen</Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {editingId ? "Speichern" : "Erstellen"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
