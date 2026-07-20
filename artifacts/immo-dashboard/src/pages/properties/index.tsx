import { useState } from "react";
import { Link } from "wouter";
import { 
  useListProperties, 
  useCreateProperty, 
  useUpdateProperty, 
  useDeleteProperty,
  getListPropertiesQueryKey,
  type PropertyType
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Building2, Plus, Edit, Trash2, Home, Building, Factory, Map as MapIcon, ArrowRight } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/utils";

const propertySchema = z.object({
  name: z.string().min(1, "Name ist erforderlich"),
  address: z.string().min(1, "Adresse ist erforderlich"),
  type: z.enum(["apartment_building", "house", "commercial", "land"]),
  description: z.string().optional(),
  purchasePrice: z.coerce.number().optional().nullable(),
  purchaseYear: z.coerce.number().optional().nullable(),
  totalUnits: z.coerce.number().optional().nullable(),
});

type PropertyFormValues = z.infer<typeof propertySchema>;

const propertyTypes: Record<string, { label: string, icon: React.ReactNode }> = {
  apartment_building: { label: "Mehrfamilienhaus", icon: <Building className="w-4 h-4" /> },
  house: { label: "Einfamilienhaus", icon: <Home className="w-4 h-4" /> },
  commercial: { label: "Gewerbe", icon: <Factory className="w-4 h-4" /> },
  land: { label: "Grundstück", icon: <MapIcon className="w-4 h-4" /> },
};

export default function PropertiesList() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: properties, isLoading } = useListProperties();
  const createMutation = useCreateProperty();
  const updateMutation = useUpdateProperty();
  const deleteMutation = useDeleteProperty();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const form = useForm<PropertyFormValues>({
    resolver: zodResolver(propertySchema),
    defaultValues: {
      name: "",
      address: "",
      type: "apartment_building",
      description: "",
    },
  });

  const onSubmit = (data: PropertyFormValues) => {
    // Clean up empty optional numbers
    const payload = {
      ...data,
      purchasePrice: data.purchasePrice || undefined,
      purchaseYear: data.purchaseYear || undefined,
      totalUnits: data.totalUnits || undefined,
    };

    if (editingId) {
      updateMutation.mutate(
        { id: editingId, data: payload },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListPropertiesQueryKey() });
            toast({ title: "Immobilie aktualisiert" });
            setIsDialogOpen(false);
          },
        }
      );
    } else {
      createMutation.mutate(
        { data: payload as any },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListPropertiesQueryKey() });
            toast({ title: "Immobilie erstellt" });
            setIsDialogOpen(false);
          },
        }
      );
    }
  };

  const handleEdit = (property: any) => {
    setEditingId(property.id);
    form.reset({
      name: property.name,
      address: property.address,
      type: property.type as any,
      description: property.description || "",
      purchasePrice: property.purchasePrice || undefined,
      purchaseYear: property.purchaseYear || undefined,
      totalUnits: property.totalUnits || undefined,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    if (!confirm("Sind Sie sicher, dass Sie diese Immobilie löschen möchten?")) return;
    deleteMutation.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListPropertiesQueryKey() });
          toast({ title: "Immobilie gelöscht" });
        },
      }
    );
  };

  const openCreateDialog = () => {
    setEditingId(null);
    form.reset({
      name: "",
      address: "",
      type: "apartment_building",
      description: "",
      purchasePrice: undefined,
      purchaseYear: undefined,
      totalUnits: undefined,
    });
    setIsDialogOpen(true);
  };

  return (
    <div className="flex-1 space-y-8 p-4 md:p-8 max-w-7xl mx-auto w-full animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-serif text-foreground">Immobilien</h1>
          <p className="text-muted-foreground mt-1 font-sans">Verwalten Sie Ihr Immobilienportfolio.</p>
        </div>
        <Button onClick={openCreateDialog} className="gap-2">
          <Plus className="w-4 h-4" />
          Neue Immobilie
        </Button>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="w-[300px]">Immobilie & Adresse</TableHead>
                <TableHead>Typ</TableHead>
                <TableHead className="text-right">Kaufpreis</TableHead>
                <TableHead className="text-right">Einheiten</TableHead>
                <TableHead className="text-right">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">Lade Daten...</TableCell>
                </TableRow>
              ) : properties?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                    <Building2 className="w-12 h-12 mx-auto text-muted mb-4" />
                    Keine Immobilien gefunden. Erstellen Sie Ihre erste Immobilie.
                  </TableCell>
                </TableRow>
              ) : (
                properties?.map((property) => (
                  <TableRow key={property.id} className="group">
                    <TableCell>
                      <div className="font-semibold text-foreground">{property.name}</div>
                      <div className="text-sm text-muted-foreground">{property.address}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="gap-1.5 font-normal">
                        {propertyTypes[property.type]?.icon}
                        {propertyTypes[property.type]?.label || property.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(property.purchasePrice)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {property.totalUnits || 0}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(property)}>
                          <Edit className="w-4 h-4 text-muted-foreground" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(property.id)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                        <Link href={`/properties/${property.id}`} className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-9 w-9">
                          <ArrowRight className="w-4 h-4 text-primary" />
                        </Link>
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
            <DialogTitle>{editingId ? "Immobilie bearbeiten" : "Neue Immobilie anlegen"}</DialogTitle>
            <DialogDescription>
              Geben Sie die Stammdaten der Immobilie ein.
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
                      <FormLabel>Objektname</FormLabel>
                      <FormControl>
                        <Input placeholder="z.B. Residenz am Park" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>Adresse</FormLabel>
                      <FormControl>
                        <Input placeholder="Straße, PLZ Ort" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Objekttyp</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Wählen..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="apartment_building">Mehrfamilienhaus</SelectItem>
                          <SelectItem value="house">Einfamilienhaus</SelectItem>
                          <SelectItem value="commercial">Gewerbe</SelectItem>
                          <SelectItem value="land">Grundstück</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="totalUnits"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Anzahl Einheiten</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="purchasePrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Kaufpreis (€)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="purchaseYear"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Kaufjahr</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} value={field.value ?? ""} />
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
                      <FormLabel>Notizen</FormLabel>
                      <FormControl>
                        <Input placeholder="Optionale Beschreibung" {...field} value={field.value ?? ""} />
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
