import { useState } from "react";
import { 
  useListTenants, 
  useCreateTenant, 
  useUpdateTenant, 
  useDeleteTenant,
  getListTenantsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Users, Plus, Edit, Trash2, Mail, Phone, Calendar } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils";

const tenantSchema = z.object({
  firstName: z.string().min(1, "Vorname ist erforderlich"),
  lastName: z.string().min(1, "Nachname ist erforderlich"),
  email: z.string().email("Ungültige E-Mail").optional().or(z.literal("")),
  phone: z.string().optional().nullable(),
  dateOfBirth: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

type TenantFormValues = z.infer<typeof tenantSchema>;

export default function TenantsList() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: tenants, isLoading } = useListTenants();
  
  const createMutation = useCreateTenant();
  const updateMutation = useUpdateTenant();
  const deleteMutation = useDeleteTenant();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const form = useForm<TenantFormValues>({
    resolver: zodResolver(tenantSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      dateOfBirth: "",
      notes: "",
    },
  });

  const onSubmit = (data: TenantFormValues) => {
    const payload = {
      ...data,
      email: data.email || undefined,
      phone: data.phone || undefined,
      dateOfBirth: data.dateOfBirth || undefined,
      notes: data.notes || undefined,
    };

    if (editingId) {
      updateMutation.mutate(
        { id: editingId, data: payload },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListTenantsQueryKey() });
            toast({ title: "Mieter aktualisiert" });
            setIsDialogOpen(false);
          },
        }
      );
    } else {
      createMutation.mutate(
        { data: payload as any },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListTenantsQueryKey() });
            toast({ title: "Mieter erstellt" });
            setIsDialogOpen(false);
          },
        }
      );
    }
  };

  const handleEdit = (tenant: any) => {
    setEditingId(tenant.id);
    form.reset({
      firstName: tenant.firstName,
      lastName: tenant.lastName,
      email: tenant.email || "",
      phone: tenant.phone || "",
      dateOfBirth: tenant.dateOfBirth ? new Date(tenant.dateOfBirth).toISOString().split('T')[0] : "",
      notes: tenant.notes || "",
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    if (!confirm("Sind Sie sicher, dass Sie diesen Mieter löschen möchten?")) return;
    deleteMutation.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTenantsQueryKey() });
          toast({ title: "Mieter gelöscht" });
        },
      }
    );
  };

  const openCreateDialog = () => {
    setEditingId(null);
    form.reset({
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      dateOfBirth: "",
      notes: "",
    });
    setIsDialogOpen(true);
  };

  return (
    <div className="flex-1 space-y-8 p-8 max-w-7xl mx-auto w-full animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-serif text-foreground">Mieter</h1>
          <p className="text-muted-foreground mt-1 font-sans">Verwalten Sie Ihre Mieter-Datenbank.</p>
        </div>
        <Button onClick={openCreateDialog} className="gap-2">
          <Plus className="w-4 h-4" />
          Neuer Mieter
        </Button>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Kontaktdaten</TableHead>
                <TableHead>Geburtsdatum</TableHead>
                <TableHead>Notizen</TableHead>
                <TableHead className="text-right">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">Lade Daten...</TableCell>
                </TableRow>
              ) : tenants?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                    <Users className="w-12 h-12 mx-auto text-muted mb-4" />
                    Keine Mieter gefunden. Erstellen Sie den ersten Eintrag.
                  </TableCell>
                </TableRow>
              ) : (
                tenants?.map((tenant) => (
                  <TableRow key={tenant.id} className="group">
                    <TableCell className="font-medium text-foreground">
                      {tenant.firstName} {tenant.lastName}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1 text-sm text-muted-foreground">
                        {tenant.email && (
                          <div className="flex items-center gap-1.5">
                            <Mail className="w-3.5 h-3.5" />
                            <a href={`mailto:${tenant.email}`} className="hover:text-primary transition-colors">{tenant.email}</a>
                          </div>
                        )}
                        {tenant.phone && (
                          <div className="flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5" />
                            {tenant.phone}
                          </div>
                        )}
                        {!tenant.email && !tenant.phone && "-"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm">
                        {tenant.dateOfBirth ? (
                          <>
                            <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                            {formatDate(tenant.dateOfBirth)}
                          </>
                        ) : "-"}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                      {tenant.notes || "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(tenant)}>
                          <Edit className="w-4 h-4 text-muted-foreground" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(tenant.id)}>
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
            <DialogTitle>{editingId ? "Mieter bearbeiten" : "Neuen Mieter anlegen"}</DialogTitle>
            <DialogDescription>
              Geben Sie die persönlichen Daten des Mieters ein.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vorname</FormLabel>
                      <FormControl>
                        <Input placeholder="Max" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nachname</FormLabel>
                      <FormControl>
                        <Input placeholder="Mustermann" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>E-Mail</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="max@example.com" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Telefon</FormLabel>
                      <FormControl>
                        <Input type="tel" placeholder="+49 123 45678" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="dateOfBirth"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Geburtsdatum</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} value={field.value ?? ""} />
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
                      <FormLabel>Notizen</FormLabel>
                      <FormControl>
                        <Input placeholder="Zusätzliche Informationen..." {...field} value={field.value ?? ""} />
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
