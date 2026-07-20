import { useState, useMemo, useEffect } from "react";
import { 
  useListUtilityStatements, 
  useCreateUtilityStatement, 
  useDeleteUtilityStatement,
  getListUtilityStatementsQueryKey,
  useListProperties,
  useListUnits
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Receipt, Plus, Trash2, CalendarDays, Maximize, AlertCircle } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";

const statementSchema = z.object({
  propertyId: z.coerce.number().min(1, "Immobilie ist erforderlich"),
  unitId: z.coerce.number().min(1, "Einheit ist erforderlich"),
  year: z.coerce.number().min(2000, "Jahr ist erforderlich"),
  totalCosts: z.coerce.number().min(0, "Gesamtkosten müssen positiv sein"),
  tenantShare: z.coerce.number().min(0, "Mieteranteil muss positiv sein"),
  advancePayments: z.coerce.number().min(0, "Vorauszahlungen müssen positiv sein"),
  notes: z.string().optional().nullable(),
  breakdown: z.string().optional().nullable(),
});

type StatementFormValues = z.infer<typeof statementSchema>;

export default function UtilityStatementsList() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data: statements, isLoading: isLoadingStatements } = useListUtilityStatements();
  const { data: properties } = useListProperties();
  
  const createMutation = useCreateUtilityStatement();
  const deleteMutation = useDeleteUtilityStatement();

  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const currentYear = new Date().getFullYear() - 1; // Usually statements are for the previous year

  const form = useForm<StatementFormValues>({
    resolver: zodResolver(statementSchema),
    defaultValues: {
      propertyId: 0,
      unitId: 0,
      year: currentYear,
      totalCosts: 0,
      tenantShare: 0,
      advancePayments: 0,
      notes: "",
      breakdown: "",
    },
  });

  const selectedPropertyId = form.watch("propertyId");
  const tenantShare = form.watch("tenantShare");
  const advancePayments = form.watch("advancePayments");
  const balance = (Number(tenantShare) || 0) - (Number(advancePayments) || 0);

  const { data: units } = useListUnits(selectedPropertyId, {
    query: { enabled: !!selectedPropertyId }
  });

  const onSubmit = (data: StatementFormValues) => {
    const payload = {
      unitId: data.unitId,
      year: data.year,
      totalCosts: data.totalCosts,
      tenantShare: data.tenantShare,
      advancePayments: data.advancePayments,
      notes: data.notes || undefined,
      breakdown: data.breakdown || undefined,
    };

    createMutation.mutate(
      { data: payload },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListUtilityStatementsQueryKey() });
          toast({ title: "Abrechnung erstellt" });
          setIsDialogOpen(false);
        },
      }
    );
  };

  const handleDelete = (id: number) => {
    if (!confirm("Sind Sie sicher, dass Sie diese Abrechnung löschen möchten?")) return;
    deleteMutation.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListUtilityStatementsQueryKey() });
          toast({ title: "Abrechnung gelöscht" });
        },
      }
    );
  };

  const openCreateDialog = () => {
    form.reset({
      propertyId: undefined,
      unitId: undefined,
      year: currentYear,
      totalCosts: undefined,
      tenantShare: undefined,
      advancePayments: undefined,
      notes: "",
      breakdown: "",
    });
    setIsDialogOpen(true);
  };

  return (
    <div className="flex-1 space-y-8 p-8 max-w-7xl mx-auto w-full animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-serif text-foreground">Nebenkostenabrechnungen</h1>
          <p className="text-muted-foreground mt-1 font-sans">Erstellte Abrechnungen und Salden der Mieter.</p>
        </div>
        <Button onClick={openCreateDialog} className="gap-2">
          <Plus className="w-4 h-4" />
          Neue Abrechnung
        </Button>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead>Einheit & Jahr</TableHead>
                <TableHead className="text-right">Gesamtkosten (Haus)</TableHead>
                <TableHead className="text-right">Anteil Mieter</TableHead>
                <TableHead className="text-right">Geleistet (Vorauszahlungen)</TableHead>
                <TableHead className="text-right">Saldo (Nachzahlung/Guthaben)</TableHead>
                <TableHead className="text-right">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingStatements ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">Lade Abrechnungen...</TableCell>
                </TableRow>
              ) : statements?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                    <Receipt className="w-12 h-12 mx-auto text-muted mb-4" />
                    Keine Abrechnungen vorhanden.
                  </TableCell>
                </TableRow>
              ) : (
                statements?.map((stmt) => (
                  <TableRow key={stmt.id} className="group">
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5 font-medium text-foreground">
                          <Maximize className="w-4 h-4 text-muted-foreground" />
                          Einheit ID: {stmt.unitId}
                        </div>
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-0.5">
                          <CalendarDays className="w-3 h-3" />
                          Jahr {stmt.year}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {formatCurrency(stmt.totalCosts)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(stmt.tenantShare)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(stmt.advancePayments)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={stmt.balance > 0 ? "warning" : "success"} className="font-mono text-sm px-2 py-1">
                        {stmt.balance > 0 ? "+" : ""}{formatCurrency(stmt.balance)}
                      </Badge>
                      <div className="text-xs text-muted-foreground mt-1 text-right">
                        {stmt.balance > 0 ? "Nachzahlung" : "Guthaben"}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(stmt.id)}>
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
            <DialogTitle>Abrechnung erstellen</DialogTitle>
            <DialogDescription>
              Geben Sie die Daten für die Nebenkostenabrechnung ein.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="propertyId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Immobilie</FormLabel>
                      <Select onValueChange={(val) => { field.onChange(Number(val)); form.setValue("unitId", 0); }} value={field.value ? String(field.value) : undefined}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Wählen..." />
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

                <FormField
                  control={form.control}
                  name="unitId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Einheit</FormLabel>
                      <Select onValueChange={(val) => field.onChange(Number(val))} value={field.value ? String(field.value) : undefined} disabled={!selectedPropertyId}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Einheit..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {units?.map(u => (
                            <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="year"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>Abrechnungsjahr</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="totalCosts"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Gesamtkosten Haus (€)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="tenantShare"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Anteil Mieter (€)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="advancePayments"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Geleistete Vorauszahlungen (€)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="col-span-1 flex flex-col justify-end pb-2">
                  <div className="text-sm font-medium text-muted-foreground mb-1">Berechneter Saldo</div>
                  <div className={`text-lg font-bold font-mono ${balance > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                    {balance > 0 ? "+" : ""}{formatCurrency(balance)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {balance > 0 ? "Nachzahlung durch Mieter" : "Guthaben für Mieter"}
                  </div>
                </div>

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem className="col-span-2 mt-4">
                      <FormLabel>Notizen</FormLabel>
                      <FormControl>
                        <Input placeholder="Besonderheiten zur Abrechnung..." {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <DialogFooter className="pt-4 border-t mt-4">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Abbrechen</Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  Abrechnung erstellen
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
