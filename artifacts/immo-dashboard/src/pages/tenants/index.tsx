import { useState } from "react";
import { useLocation } from "wouter";
import {
  useListTenants,
  useCreateTenant,
  useUpdateTenant,
  useDeleteTenant,
  getListTenantsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Users, Plus, Edit, Trash2, Mail, Phone, MapPin,
  Building2, User, Smartphone, CreditCard, Hash,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";

// ─── Schema ───────────────────────────────────────────────────────────────────

const tenantSchema = z.object({
  companyName:   z.string().optional().nullable(),
  firstName:     z.string().min(1, "Pflichtfeld"),
  lastName:      z.string().min(1, "Pflichtfeld"),
  contactPerson: z.string().optional().nullable(),
  street:        z.string().optional().nullable(),
  houseNumber:   z.string().optional().nullable(),
  zipCode:       z.string().optional().nullable(),
  city:          z.string().optional().nullable(),
  email:         z.string().email("Ungültige E-Mail").optional().or(z.literal("")).nullable(),
  phone:         z.string().optional().nullable(),
  mobile:        z.string().optional().nullable(),
  dateOfBirth:   z.string().optional().nullable(),
  taxId:         z.string().optional().nullable(),
  iban:          z.string().optional().nullable(),
  notes:         z.string().optional().nullable(),
});

type TenantFormValues = z.infer<typeof tenantSchema>;

const EMPTY: TenantFormValues = {
  companyName: "", firstName: "", lastName: "", contactPerson: "",
  street: "", houseNumber: "", zipCode: "", city: "",
  email: "", phone: "", mobile: "",
  dateOfBirth: "", taxId: "", iban: "", notes: "",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function nullify(v: string | null | undefined) {
  return v?.trim() || undefined;
}

// ─── Section header ───────────────────────────────────────────────────────────

function Section({ title }: { title: string }) {
  return (
    <div className="col-span-2 pt-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">{title}</p>
      <Separator />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TenantsList() {
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { data: tenants, isLoading } = useListTenants();

  const createMutation = useCreateTenant();
  const updateMutation = useUpdateTenant();
  const deleteMutation = useDeleteTenant();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const form = useForm<TenantFormValues>({
    resolver: zodResolver(tenantSchema),
    defaultValues: EMPTY,
  });

  const onSubmit = (data: TenantFormValues) => {
    const payload = {
      companyName:   nullify(data.companyName),
      firstName:     data.firstName,
      lastName:      data.lastName,
      contactPerson: nullify(data.contactPerson),
      street:        nullify(data.street),
      houseNumber:   nullify(data.houseNumber),
      zipCode:       nullify(data.zipCode),
      city:          nullify(data.city),
      email:         nullify(data.email),
      phone:         nullify(data.phone),
      mobile:        nullify(data.mobile),
      dateOfBirth:   nullify(data.dateOfBirth),
      taxId:         nullify(data.taxId),
      iban:          nullify(data.iban),
      notes:         nullify(data.notes),
    };

    const onSuccess = () => {
      queryClient.invalidateQueries({ queryKey: getListTenantsQueryKey() });
      toast({ title: editingId ? "Mieter aktualisiert" : "Mieter angelegt" });
      setIsDialogOpen(false);
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload }, { onSuccess });
    } else {
      createMutation.mutate({ data: payload as any }, { onSuccess });
    }
  };

  const handleEdit = (t: any) => {
    setEditingId(t.id);
    form.reset({
      companyName:   t.companyName   ?? "",
      firstName:     t.firstName     ?? "",
      lastName:      t.lastName      ?? "",
      contactPerson: t.contactPerson ?? "",
      street:        t.street        ?? "",
      houseNumber:   t.houseNumber   ?? "",
      zipCode:       t.zipCode       ?? "",
      city:          t.city          ?? "",
      email:         t.email         ?? "",
      phone:         t.phone         ?? "",
      mobile:        t.mobile        ?? "",
      dateOfBirth:   t.dateOfBirth   ? new Date(t.dateOfBirth).toISOString().split("T")[0] : "",
      taxId:         t.taxId         ?? "",
      iban:          t.iban          ?? "",
      notes:         t.notes         ?? "",
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    if (!confirm("Mieter wirklich löschen?")) return;
    deleteMutation.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTenantsQueryKey() });
        toast({ title: "Mieter gelöscht" });
      },
    });
  };

  const openCreate = () => {
    setEditingId(null);
    form.reset(EMPTY);
    setIsDialogOpen(true);
  };

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 max-w-7xl mx-auto w-full animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-serif text-foreground">Mieter</h1>
          <p className="text-muted-foreground mt-1 font-sans">CRM — Stammdaten aller Mieter und Gewerbemieter.</p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="w-4 h-4" /> Neuer Mieter
        </Button>
      </div>

      {/* Table */}
      <Card className="shadow-sm">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead>Name / Firma</TableHead>
                <TableHead className="hidden md:table-cell">Straße + Nr.</TableHead>
                <TableHead className="hidden lg:table-cell">PLZ / Ort</TableHead>
                <TableHead className="hidden md:table-cell">E-Mail</TableHead>
                <TableHead>Telefon</TableHead>
                <TableHead className="text-right">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">Lade Daten…</TableCell>
                </TableRow>
              ) : tenants?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-14 text-muted-foreground">
                    <Users className="w-12 h-12 mx-auto text-muted mb-3 opacity-30" />
                    <p>Noch keine Mieter angelegt.</p>
                  </TableCell>
                </TableRow>
              ) : (
                tenants?.map((tenant) => (
                  <TableRow
                    key={tenant.id}
                    className="group cursor-pointer hover:bg-[#f4f7f5]/60"
                    onClick={() => navigate(`/tenants/${tenant.id}`)}
                  >
                    {/* Name / Firma */}
                    <TableCell>
                      <div className="flex flex-col">
                        {(tenant as any).companyName ? (
                          <>
                            <span className="font-semibold text-sm flex items-center gap-1.5">
                              <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              {(tenant as any).companyName}
                            </span>
                            <span className="text-xs text-muted-foreground mt-0.5">
                              {[tenant.firstName, tenant.lastName].filter(Boolean).join(" ")}
                            </span>
                          </>
                        ) : (
                          <span className="font-medium text-sm flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            {[tenant.firstName, tenant.lastName].filter(Boolean).join(" ")}
                          </span>
                        )}
                      </div>
                    </TableCell>

                    {/* Straße + Nr. */}
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      {(tenant as any).street || (tenant as any).houseNumber ? (
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            {[(tenant as any).street, (tenant as any).houseNumber].filter(Boolean).join(" ")}
                          </span>
                        </div>
                      ) : "—"}
                    </TableCell>

                    {/* PLZ / Ort */}
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      {(tenant as any).zipCode || (tenant as any).city
                        ? [(tenant as any).zipCode, (tenant as any).city].filter(Boolean).join(" ")
                        : "—"}
                    </TableCell>

                    {/* E-Mail */}
                    <TableCell className="hidden md:table-cell text-sm">
                      {tenant.email ? (
                        <a
                          href={`mailto:${tenant.email}`}
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors"
                        >
                          <Mail className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate max-w-[180px]">{tenant.email}</span>
                        </a>
                      ) : "—"}
                    </TableCell>

                    {/* Telefon */}
                    <TableCell className="text-sm">
                      {tenant.phone ? (
                        <a
                          href={`tel:${tenant.phone}`}
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors"
                        >
                          <Phone className="w-3.5 h-3.5 shrink-0" />
                          {tenant.phone}
                        </a>
                      ) : (tenant as any).mobile ? (
                        <a
                          href={`tel:${(tenant as any).mobile}`}
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors"
                        >
                          <Smartphone className="w-3.5 h-3.5 shrink-0" />
                          {(tenant as any).mobile}
                        </a>
                      ) : "—"}
                    </TableCell>

                    {/* Aktionen */}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleEdit(tenant); }}>
                          <Edit className="w-4 h-4 text-muted-foreground" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleDelete(tenant.id); }}>
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

      {/* CRM Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Mieter bearbeiten" : "Neuen Mieter anlegen"}</DialogTitle>
            <DialogDescription>
              Stammdaten für das CRM — alle Felder außer Vor- und Nachname sind optional.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">

                {/* ── Firma & Name ──────────────────────────────────────── */}
                <Section title="Firma & Name" />

                <FormField control={form.control} name="companyName" render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Firmenname</FormLabel>
                    <FormControl>
                      <Input placeholder="Müller GmbH (leer lassen bei Privatpersonen)" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="firstName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vorname / Inhaber *</FormLabel>
                    <FormControl><Input placeholder="Max" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="lastName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nachname *</FormLabel>
                    <FormControl><Input placeholder="Mustermann" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="contactPerson" render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Ansprechpartner (abweichend)</FormLabel>
                    <FormControl>
                      <Input placeholder="z.B. Frau Schmidt (Buchhaltung)" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* ── Adresse ───────────────────────────────────────────── */}
                <Section title="Adresse" />

                {/* Straße + Hausnummer in 3:1-Aufteilung */}
                <div className="col-span-2 grid grid-cols-[3fr_1fr] gap-3">
                  <FormField control={form.control} name="street" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Straße</FormLabel>
                      <FormControl>
                        <Input placeholder="Musterstraße" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="houseNumber" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Hausnr.</FormLabel>
                      <FormControl>
                        <Input placeholder="12a" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <FormField control={form.control} name="zipCode" render={({ field }) => (
                  <FormItem>
                    <FormLabel>PLZ</FormLabel>
                    <FormControl><Input placeholder="30159" {...field} value={field.value ?? ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="city" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ort</FormLabel>
                    <FormControl><Input placeholder="Hannover" {...field} value={field.value ?? ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* ── Kontakt ───────────────────────────────────────────── */}
                <Section title="Kontakt" />

                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>E-Mail-Adresse</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="info@firma.de" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="phone" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefon (Festnetz)</FormLabel>
                    <FormControl>
                      <Input type="tel" placeholder="+49 511 123456" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="mobile" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mobilnummer</FormLabel>
                    <FormControl>
                      <Input type="tel" placeholder="+49 171 1234567" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* ── Weitere Angaben ───────────────────────────────────── */}
                <Section title="Weitere Angaben" />

                <FormField control={form.control} name="dateOfBirth" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Geburtsdatum</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="taxId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>USt-IdNr / Steuernummer</FormLabel>
                    <FormControl>
                      <Input placeholder="DE123456789" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="iban" render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>IBAN (für Lastschrift / Mahnungen)</FormLabel>
                    <FormControl>
                      <Input placeholder="DE89 3704 0044 0532 0130 00" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* ── Notizen ───────────────────────────────────────────── */}
                <Section title="Notizen" />

                <FormField control={form.control} name="notes" render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Interne Notizen</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Weitere Informationen, Besonderheiten…"
                        className="resize-none"
                        rows={3}
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

              </div>

              <DialogFooter className="pt-4">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Abbrechen</Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {editingId ? "Speichern" : "Anlegen"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
