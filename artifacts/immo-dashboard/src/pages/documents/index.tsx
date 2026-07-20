import { useState } from "react";
import { 
  useListDocuments, 
  useDeleteDocument,
  getListDocumentsQueryKey,
  useListProperties
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { FileSpreadsheet, Plus, Trash2, Download, FileText, Image as ImageIcon, FileArchive, Building2, UploadCloud } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils";

const uploadSchema = z.object({
  name: z.string().min(1, "Name ist erforderlich"),
  propertyId: z.coerce.number().optional().nullable(),
  unitId: z.coerce.number().optional().nullable(),
  contractId: z.coerce.number().optional().nullable(),
});

type UploadFormValues = z.infer<typeof uploadSchema>;

const getFileIcon = (mimeType?: string | null) => {
  if (!mimeType) return <FileText className="w-4 h-4" />;
  if (mimeType.includes("pdf")) return <FileArchive className="w-4 h-4 text-red-500" />;
  if (mimeType.includes("image")) return <ImageIcon className="w-4 h-4 text-blue-500" />;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType.includes("csv")) return <FileSpreadsheet className="w-4 h-4 text-green-500" />;
  return <FileText className="w-4 h-4 text-muted-foreground" />;
};

const formatFileSize = (bytes?: number | null) => {
  if (!bytes) return "-";
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${mb.toFixed(2)} MB`;
};

export default function DocumentsList() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data: documents, isLoading: isLoadingDocs } = useListDocuments();
  const { data: properties } = useListProperties();
  const deleteMutation = useDeleteDocument();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const form = useForm<UploadFormValues>({
    resolver: zodResolver(uploadSchema),
    defaultValues: {
      name: "",
      propertyId: undefined,
      unitId: undefined,
      contractId: undefined,
    },
  });

  const onSubmit = async (data: UploadFormValues) => {
    if (!selectedFile) {
      toast({ title: "Bitte wählen Sie eine Datei aus", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("name", data.name);
      
      if (data.propertyId) formData.append("propertyId", String(data.propertyId));
      if (data.unitId) formData.append("unitId", String(data.unitId));
      if (data.contractId) formData.append("contractId", String(data.contractId));

      const res = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error("Fehler beim Hochladen der Datei");
      }

      queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey() });
      toast({ title: "Dokument hochgeladen" });
      setIsDialogOpen(false);
    } catch (err) {
      console.error(err);
      toast({ title: "Upload fehlgeschlagen", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = (id: number) => {
    if (!confirm("Sind Sie sicher, dass Sie dieses Dokument unwiderruflich löschen möchten?")) return;
    deleteMutation.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey() });
          toast({ title: "Dokument gelöscht" });
        },
      }
    );
  };

  const openUploadDialog = () => {
    setSelectedFile(null);
    form.reset({
      name: "",
      propertyId: undefined,
      unitId: undefined,
      contractId: undefined,
    });
    setIsDialogOpen(true);
  };

  return (
    <div className="flex-1 space-y-8 p-4 md:p-8 max-w-7xl mx-auto w-full animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-serif text-foreground">Dokumente</h1>
          <p className="text-muted-foreground mt-1 font-sans">Zentrale Dateiablage für das gesamte Portfolio.</p>
        </div>
        <Button onClick={openUploadDialog} className="gap-2">
          <UploadCloud className="w-4 h-4" />
          Dokument hochladen
        </Button>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead>Dateiname</TableHead>
                <TableHead>Zuweisung</TableHead>
                <TableHead>Größe</TableHead>
                <TableHead>Datum</TableHead>
                <TableHead className="text-right">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingDocs ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">Lade Dokumente...</TableCell>
                </TableRow>
              ) : documents?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                    <FileSpreadsheet className="w-12 h-12 mx-auto text-muted mb-4" />
                    Keine Dokumente gefunden.
                  </TableCell>
                </TableRow>
              ) : (
                documents?.map((doc) => (
                  <TableRow key={doc.id} className="group">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-md bg-muted/50">
                          {getFileIcon(doc.mimeType)}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">{doc.name}</span>
                          <span className="text-xs text-muted-foreground uppercase">{doc.category || "Allgemein"}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {doc.propertyId && (
                          <Badge variant="outline" className="text-xs font-normal border-border gap-1 text-muted-foreground">
                            <Building2 className="w-3 h-3" />
                            Prop {doc.propertyId}
                          </Badge>
                        )}
                        {doc.unitId && (
                          <Badge variant="outline" className="text-xs font-normal border-border gap-1 text-muted-foreground">
                            Unit {doc.unitId}
                          </Badge>
                        )}
                        {doc.contractId && (
                          <Badge variant="outline" className="text-xs font-normal border-border gap-1 text-muted-foreground">
                            Contract {doc.contractId}
                          </Badge>
                        )}
                        {!doc.propertyId && !doc.unitId && !doc.contractId && (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground font-mono">
                      {formatFileSize(doc.fileSize)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(doc.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer">
                          <Button variant="ghost" size="icon" type="button">
                            <Download className="w-4 h-4 text-muted-foreground" />
                          </Button>
                        </a>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(doc.id)}>
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
            <DialogTitle>Dokument hochladen</DialogTitle>
            <DialogDescription>
              Wählen Sie eine Datei aus und ordnen Sie sie optional einer Immobilie zu.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 gap-4">
                <FormItem>
                  <FormLabel>Datei</FormLabel>
                  <FormControl>
                    <Input 
                      type="file" 
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setSelectedFile(file);
                          if (!form.getValues("name")) {
                            form.setValue("name", file.name);
                          }
                        }
                      }} 
                    />
                  </FormControl>
                  {selectedFile && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {selectedFile.name} ({formatFileSize(selectedFile.size)})
                    </p>
                  )}
                </FormItem>

                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Anzeigename</FormLabel>
                      <FormControl>
                        <Input placeholder="Dokumentenname..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="bg-muted/30 p-4 rounded-md space-y-4 border">
                  <p className="text-sm font-medium">Zuordnung (Optional)</p>
                  
                  <FormField
                    control={form.control}
                    name="propertyId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Immobilie</FormLabel>
                        <Select onValueChange={(val) => field.onChange(Number(val))} value={field.value ? String(field.value) : undefined}>
                          <FormControl>
                            <SelectTrigger className="bg-background">
                              <SelectValue placeholder="Immobilie wählen..." />
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

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="unitId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Einheit ID</FormLabel>
                          <FormControl>
                            <Input type="number" className="bg-background" placeholder="Optional" {...field} value={field.value ?? ""} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="contractId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Vertrag ID</FormLabel>
                          <FormControl>
                            <Input type="number" className="bg-background" placeholder="Optional" {...field} value={field.value ?? ""} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </div>
              <DialogFooter className="pt-4 border-t mt-4">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Abbrechen</Button>
                <Button type="submit" disabled={isUploading}>
                  {isUploading ? "Lädt hoch..." : "Hochladen"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
