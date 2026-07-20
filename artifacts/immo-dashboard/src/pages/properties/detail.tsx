import { useState } from "react";
import { useParams, Link } from "wouter";
import { 
  useGetProperty, 
  useListUnits, 
  useCreateUnit, 
  useUpdateUnit, 
  useDeleteUnit,
  getGetPropertyQueryKey,
  getListUnitsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Building2, Plus, Edit, Trash2, ArrowLeft, Maximize, Euro, Key, ShieldAlert } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";

const unitSchema = z.object({
  name: z.string().min(1, "Name ist erforderlich"),
  floor: z.coerce.number().optional().nullable(),
  area: z.coerce.number().optional().nullable(),
  rooms: z.coerce.number().optional().nullable(),
  status: z.enum(["vacant", "occupied", "renovation"]),
  monthlyRent: z.coerce.number().optional().nullable(),
  deposit: z.coerce.number().optional().nullable(),
  description: z.string().optional().nullable(),
});

type UnitFormValues = z.infer<typeof unitSchema>;

export default function PropertyDetail() {
  const params = useParams();
  const propertyId = Number(params.id);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: property, isLoading: isLoadingProperty } = useGetProperty(propertyId, { 
    query: { enabled: !!propertyId, queryKey: getGetPropertyQueryKey(propertyId) } 
  });
  const { data: units, isLoading: isLoadingUnits } = useListUnits(propertyId, { 
    query: { enabled: !!propertyId, queryKey: getListUnitsQueryKey(propertyId) } 
  });

  const createMutation = useCreateUnit();
  const updateMutation = useUpdateUnit();
  const deleteMutation = useDeleteUnit();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const form = useForm<UnitFormValues>({
    resolver: zodResolver(unitSchema),
    defaultValues: {
      name: "",
      status: "vacant",
      description: "",
    },
  });

  const onSubmit = (data: UnitFormValues) => {
    const payload = {
      ...data,
      floor: data.floor || undefined,
      area: data.area || undefined,
      rooms: data.rooms || undefined,
      monthlyRent: data.monthlyRent || undefined,
      deposit: data.deposit || undefined,
      description: data.description || undefined,
    };

    if (editingId) {
      updateMutation.mutate(
        { id: editingId, data: payload },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListUnitsQueryKey(propertyId) });
            toast({ title: "Einheit aktualisiert" });
            setIsDialogOpen(false);
          },
        }
      );
    } else {
      createMutation.mutate(
        { propertyId, data: payload as any },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListUnitsQueryKey(propertyId) });
            toast({ title: "Einheit erstellt" });
            setIsDialogOpen(false);
          },
        }
      );
    }
  };

  const handleEdit = (unit: any) => {
    setEditingId(unit.id);
    form.reset({
      name: unit.name,
      floor: unit.floor || undefined,
      area: unit.area || undefined,
      rooms: unit.rooms || undefined,
      status: unit.status as any,
      monthlyRent: unit.monthlyRent || undefined,
      deposit: unit.deposit || undefined,
      description: unit.description || "",
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    if (!confirm("Sind Sie sicher, dass Sie diese Einheit löschen möchten?")) return;
    deleteMutation.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListUnitsQueryKey(propertyId) });
          toast({ title: "Einheit gelöscht" });
        },
      }
    );
  };

  const openCreateDialog = () => {
    setEditingId(null);
    form.reset({
      name: "",
      floor: undefined,
      area: undefined,
      rooms: undefined,
      status: "vacant",
      monthlyRent: undefined,
      deposit: undefined,
      description: "",
    });
    setIsDialogOpen(true);
  };

  if (isLoadingProperty) {
    return <div className="p-8 text-center text-muted-foreground animate-pulse">Lade Immobilie...</div>;
  }

  if (!property) {
    return <div className="p-8 text-center text-destructive">Immobilie nicht gefunden</div>;
  }

  return (
    <div className="flex-1 space-y-8 p-4 md:p-8 max-w-7xl mx-auto w-full animate-in fade-in duration-500">
      <div className="flex items-center gap-4">
        <Link href="/properties" className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-9 w-9 border border-input bg-background shadow-sm">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-serif text-foreground">{property.name}</h1>
          <p className="text-muted-foreground mt-1 font-sans">{property.address}</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gesamteinheiten</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">{units?.length || 0}</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vermietet</CardTitle>
            <Key className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-green-600 dark:text-green-500">
              {units?.filter(u => u.status === 'occupied').length || 0}
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Leerstand</CardTitle>
            <ShieldAlert className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-500">
              {units?.filter(u => u.status === 'vacant').length || 0}
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monatliche Sollmiete</CardTitle>
            <Euro className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">
              {formatCurrency(units?.reduce((sum, u) => sum + (u.monthlyRent || 0), 0) || 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Wohneinheiten</CardTitle>
            <CardDescription>Verwalten Sie die Einheiten dieser Immobilie</CardDescription>
          </div>
          <Button onClick={openCreateDialog} size="sm" className="gap-2">
            <Plus className="w-4 h-4" />
            Einheit hinzufügen
          </Button>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead>Bezeichnung</TableHead>
                <TableHead>Details</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Miete</TableHead>
                <TableHead className="text-right">Kaution</TableHead>
                <TableHead className="text-right">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingUnits ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">Lade Einheiten...</TableCell>
                </TableRow>
              ) : units?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                    <Maximize className="w-12 h-12 mx-auto text-muted mb-4" />
                    Keine Einheiten vorhanden. Erstellen Sie die erste Einheit.
                  </TableCell>
                </TableRow>
              ) : (
                units?.map((unit) => (
                  <TableRow key={unit.id} className="group">
                    <TableCell>
                      <div className="font-semibold text-foreground">{unit.name}</div>
                      {unit.description && <div className="text-xs text-muted-foreground">{unit.description}</div>}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {unit.floor !== null && `Etage ${unit.floor} • `}
                        {unit.area !== null && `${unit.area} m² • `}
                        {unit.rooms !== null && `${unit.rooms} Zi.`}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={
                        unit.status === 'occupied' ? 'success' : 
                        unit.status === 'vacant' ? 'warning' : 'info'
                      }>
                        {unit.status === 'occupied' ? 'Vermietet' : 
                         unit.status === 'vacant' ? 'Leerstand' : 'Renovierung'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono font-medium">
                      {formatCurrency(unit.monthlyRent)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {formatCurrency(unit.deposit)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(unit)}>
                          <Edit className="w-4 h-4 text-muted-foreground" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(unit.id)}>
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
            <DialogTitle>{editingId ? "Einheit bearbeiten" : "Neue Einheit"}</DialogTitle>
            <DialogDescription>
              Geben Sie die Details der Wohneinheit ein.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>Bezeichnung (z.B. WHG 01)</FormLabel>
                      <FormControl>
                        <Input placeholder="Bezeichnung" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Wählen..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="vacant">Leerstand</SelectItem>
                          <SelectItem value="occupied">Vermietet</SelectItem>
                          <SelectItem value="renovation">Renovierung</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="floor"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Etage</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="z.B. 1" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="area"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fläche (m²)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.1" placeholder="z.B. 75.5" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="rooms"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Zimmer</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.5" placeholder="z.B. 3" {...field} value={field.value ?? ""} />
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
                      <FormLabel>Kaltmiete (€)</FormLabel>
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
