import { useState, useMemo } from "react";
import { 
  useListUtilityCosts, 
  useCreateUtilityCost, 
  useUpdateUtilityCost, 
  useDeleteUtilityCost,
  getListUtilityCostsQueryKey,
  useListProperties
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Euro, Plus, Edit, Trash2, CalendarDays, Building2, Tag } from "lucide-react";

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

const utilityCostSchema = z.object({
  propertyId: z.coerce.number().min(1, "Immobilie ist erforderlich"),
  year: z.coerce.number().min(2000, "Jahr ist erforderlich"),
  month: z.coerce.number().min(1).max(12, "Monat muss zwischen 1 und 12 liegen"),
  category: z.enum(["heating", "water", "electricity", "maintenance", "insurance", "garbage", "elevator", "cleaning", "other"]),
  amount: z.coerce.number().min(0, "Betrag muss positiv sein"),
  description: z.string().optional().nullable(),
});

type UtilityCostFormValues = z.infer<typeof utilityCostSchema>;

const categoryLabels: Record<string, string> = {
  heating: "Heizung",
  water: "Wasser",
  electricity: "Strom",
  maintenance: "Wartung",
  insurance: "Versicherung",
  garbage: "Müll",
  elevator: "Aufzug",
  cleaning: "Reinigung",
  other: "Sonstige"
};

export default function UtilityCostsList() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data: costs, isLoading: isLoadingCosts } = useListUtilityCosts();
  const { data: properties } = useListProperties();
  
  const createMutation = useCreateUtilityCost();
  const updateMutation = useUpdateUtilityCost();
  const deleteMutation = useDeleteUtilityCost();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const form = useForm<UtilityCostFormValues>({
    resolver: zodResolver(utilityCostSchema),
    defaultValues: {
      propertyId: 0,
      year: currentYear,
      month: currentMonth,
      category: "water",
      amount: 0,
      description: "",
    },
  });

  const onSubmit = (data: UtilityCostFormValues) => {
    const payload = {
      propertyId: data.propertyId,
      year: data.year,
      month: data.month,
      category: data.category,
      amount: data.amount,
      description: data.description || undefined,
    };

    if (editingId) {
      updateMutation.mutate(
        { id: editingId, data: payload },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListUtilityCostsQueryKey() });
            toast({ title: "Kosten aktualisiert" });
            setIsDialogOpen(false);
          },
        }
      );
    } else {
      createMutation.mutate(
        { data: payload },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListUtilityCostsQueryKey() });
            toast({ title: "Kosten gebucht" });
            setIsDialogOpen(false);
          },
        }
      );
    }
  };

  const handleEdit = (cost: any) => {
    setEditingId(cost.id);
    form.reset({
      propertyId: cost.propertyId,
      year: cost.year,
      month: cost.month,
      category: cost.category as any,
      amount: cost.amount,
      description: cost.description || "",
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    if (!confirm("Sind Sie sicher, dass Sie diese Kostenbuchung löschen möchten?")) return;
    deleteMutation.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListUtilityCostsQueryKey() });
          toast({ title: "Buchung gelöscht" });
        },
      }
    );
  };

  const openCreateDialog = () => {
    setEditingId(null);
    form.reset({
      propertyId: undefined,
      year: currentYear,
      month: currentMonth,
      category: "heating",
      amount: undefined,
      description: "",
    });
    setIsDialogOpen(true);
  };

  const propertyMap = useMemo(() => {
    const map = new Map();
    properties?.forEach(p => map.set(p.id, p.name));
    return map;
  }, [properties]);

  return (
    <div className="flex-1 space-y-8 p-4 md:p-8 max-w-7xl mx-auto w-full animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-serif text-foreground">Nebenkosten</h1>
          <p className="text-muted-foreground mt-1 font-sans">Erfassen Sie laufende Bewirtschaftungskosten.</p>
        </div>
        <Button onClick={openCreateDialog} className="gap-2">
          <Plus className="w-4 h-4" />
          Kosten buchen
        </Button>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead>Immobilie & Kategorie</TableHead>
                <TableHead>Zeitraum</TableHead>
                <TableHead>Notizen</TableHead>
                <TableHead className="text-right">Betrag</TableHead>
                <TableHead className="text-right">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingCosts ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">Lade Kosten...</TableCell>
                </TableRow>
              ) : costs?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                    <Euro className="w-12 h-12 mx-auto text-muted mb-4" />
                    Keine Kosten gebucht.
                  </TableCell>
                </TableRow>
              ) : (
                costs?.map((cost) => (
                  <TableRow key={cost.id} className="group">
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5 font-medium text-foreground">
                          <Building2 className="w-4 h-4 text-muted-foreground" />
                          {propertyMap.get(cost.propertyId) || `ID: ${cost.propertyId}`}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Badge variant="outline" className="text-xs font-normal text-muted-foreground gap-1 bg-muted/50 border-0">
                            <Tag className="w-3 h-3" />
                            {categoryLabels[cost.category] || cost.category}
                          </Badge>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm font-medium">
                        <CalendarDays className="w-4 h-4 text-muted-foreground" />
                        {cost.month.toString().padStart(2, '0')} / {cost.year}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                      {cost.description || "-"}
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold text-foreground">
                      {formatCurrency(cost.amount)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(cost)}>
                          <Edit className="w-4 h-4 text-muted-foreground" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(cost.id)}>
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
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingId ? "Kosten bearbeiten" : "Kosten buchen"}</DialogTitle>
            <DialogDescription>
              Tragen Sie die entstandenen Nebenkosten ein.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="propertyId"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>Immobilie</FormLabel>
                      <Select onValueChange={(val) => field.onChange(Number(val))} value={field.value ? String(field.value) : undefined}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Immobilie auswählen..." />
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
                  name="category"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>Kostenart</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Kategorie..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Object.entries(categoryLabels).map(([key, label]) => (
                            <SelectItem key={key} value={key}>{label}</SelectItem>
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
                    <FormItem>
                      <FormLabel>Jahr</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="month"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Monat (1-12)</FormLabel>
                      <FormControl>
                        <Input type="number" min="1" max="12" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>Betrag (€)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>Beschreibung / Notiz</FormLabel>
                      <FormControl>
                        <Input placeholder="Rechnungsnummer, Lieferant..." {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <DialogFooter className="pt-4">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Abbrechen</Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {editingId ? "Speichern" : "Buchen"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
