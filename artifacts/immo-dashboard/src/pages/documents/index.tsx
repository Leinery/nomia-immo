import { useState, useEffect } from "react";
import {
  useListDocuments,
  useDeleteDocument,
  useListProperties,
  getListDocumentsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  FileSpreadsheet, Plus, Trash2, Download, FileText,
  Image as ImageIcon, FileArchive, Building2, UploadCloud, Loader2,
  Cloud, CloudOff, ExternalLink, FolderOpen,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Schema ───────────────────────────────────────────────────────────────────

const uploadSchema = z.object({
  name: z.string().min(1, "Name ist erforderlich"),
  category: z.string().optional().nullable(),
  propertyId: z.coerce.number().optional().nullable(),
});
type UploadFormValues = z.infer<typeof uploadSchema>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getFileIcon(mimeType?: string | null) {
  if (!mimeType) return <FileText className="w-4 h-4 text-muted-foreground" />;
  if (mimeType.includes("pdf")) return <FileArchive className="w-4 h-4 text-red-500" />;
  if (mimeType.includes("image")) return <ImageIcon className="w-4 h-4 text-blue-500" />;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType.includes("csv"))
    return <FileSpreadsheet className="w-4 h-4 text-green-500" />;
  return <FileText className="w-4 h-4 text-muted-foreground" />;
}

function formatFileSize(bytes?: number | null) {
  if (!bytes) return "—";
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${mb.toFixed(2)} MB`;
}

const CATEGORIES: Record<string, string> = {
  contract:   "Mietvertrag",
  invoice:    "Rechnung",
  utility:    "Nebenkosten",
  insurance:  "Versicherung",
  inspection: "Protokoll",
  other:      "Sonstiges",
};

// ─── Upload flow using Object Storage presigned URLs ─────────────────────────

async function uploadToObjectStorage(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<string> {
  // Step 1: Request presigned URL from our API
  const metaRes = await fetch(`${BASE}/api/storage/uploads/request-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
  });
  if (!metaRes.ok) throw new Error("Presigned URL konnte nicht angefordert werden");
  const { uploadURL, objectPath } = await metaRes.json();

  // Step 2: Upload file directly to GCS via XMLHttpRequest (for progress tracking)
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadURL);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload fehlgeschlagen: ${xhr.status}`)));
    xhr.onerror = () => reject(new Error("Netzwerkfehler beim Upload"));
    xhr.send(file);
  });

  return objectPath as string;
}

// ─── Main component ───────────────────────────────────────────────────────────

type OneDriveStatus = { connected: boolean; displayName?: string; email?: string; driveUrl?: string; error?: string };

export default function DocumentsList() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: documents, isLoading: isLoadingDocs } = useListDocuments();
  const { data: properties } = useListProperties();
  const deleteMutation = useDeleteDocument();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [onedrive, setOnedrive] = useState<OneDriveStatus | null>(null);
  const [isSettingUpFolders, setIsSettingUpFolders] = useState(false);

  useEffect(() => {
    fetch(`${BASE}/api/onedrive/status`)
      .then(r => r.json())
      .then(setOnedrive)
      .catch(() => setOnedrive({ connected: false }));
  }, []);

  const setupFolders = async () => {
    setIsSettingUpFolders(true);
    try {
      const res = await fetch(`${BASE}/api/onedrive/setup-folders`, { method: "POST" });
      const data = await res.json();
      toast({ title: "✓ Ordnerstruktur angelegt", description: `${data.folders?.length ?? 0} Ordner in OneDrive erstellt.` });
    } catch {
      toast({ title: "Fehler", description: "Ordner konnten nicht angelegt werden.", variant: "destructive" });
    } finally {
      setIsSettingUpFolders(false);
    }
  };

  const form = useForm<UploadFormValues>({
    resolver: zodResolver(uploadSchema),
    defaultValues: { name: "", category: null, propertyId: null },
  });

  const openDialog = () => {
    form.reset({ name: "", category: null, propertyId: null });
    setSelectedFile(null);
    setUploadProgress(0);
    setIsDialogOpen(true);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setSelectedFile(f);
    if (f && !form.getValues("name")) form.setValue("name", f.name.replace(/\.[^.]+$/, ""));
  };

  const onSubmit = async (data: UploadFormValues) => {
    if (!selectedFile) {
      toast({ title: "Bitte eine Datei auswählen", variant: "destructive" });
      return;
    }
    setIsUploading(true);
    setUploadProgress(0);
    try {
      // Upload to Object Storage, get back objectPath
      const objectPath = await uploadToObjectStorage(selectedFile, setUploadProgress);

      // Persist metadata in our DB
      const res = await fetch(`${BASE}/api/documents/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          category: data.category || null,
          objectPath,
          mimeType: selectedFile.type,
          fileSize: selectedFile.size,
          propertyId: data.propertyId || null,
        }),
      });
      if (!res.ok) throw new Error("Metadaten konnten nicht gespeichert werden");

      queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey() });
      toast({ title: "Dokument hochgeladen", description: data.name });
      setIsDialogOpen(false);
    } catch (err: any) {
      toast({ title: "Upload fehlgeschlagen", description: err.message, variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Dokument wirklich löschen?")) return;
    try {
      await deleteMutation.mutateAsync({ params: { id } });
      queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey() });
      toast({ title: "Dokument gelöscht" });
    } catch {
      toast({ title: "Fehler beim Löschen", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dokumente</h1>
          <p className="text-muted-foreground mt-1">
            Mietverträge, Rechnungen und Belege — gespeichert in App-Speicher und OneDrive.
          </p>
        </div>
        <Button onClick={openDialog} className="gap-2">
          <Plus className="w-4 h-4" /> Dokument hochladen
        </Button>
      </div>

      {/* OneDrive status banner */}
      {onedrive !== null && (
        <div className={`rounded-xl border px-4 py-3 flex items-center justify-between gap-4 flex-wrap ${
          onedrive.connected ? "bg-blue-50 border-blue-200" : "bg-amber-50 border-amber-200"
        }`}>
          <div className="flex items-center gap-3">
            {onedrive.connected
              ? <Cloud className="h-5 w-5 text-blue-600 shrink-0" />
              : <CloudOff className="h-5 w-5 text-amber-500 shrink-0" />}
            <div>
              {onedrive.connected ? (
                <>
                  <p className="text-sm font-medium text-blue-900">
                    OneDrive verbunden · {onedrive.displayName}
                  </p>
                  <p className="text-xs text-blue-700 mt-0.5">
                    Hochgeladene Dokumente werden automatisch nach{" "}
                    <span className="font-mono">Nomia Immobilien/…</span> synchronisiert.
                  </p>
                </>
              ) : (
                <p className="text-sm font-medium text-amber-900">OneDrive nicht verbunden</p>
              )}
            </div>
          </div>
          {onedrive.connected && (
            <div className="flex items-center gap-2">
              <Button
                size="sm" variant="outline"
                className="border-blue-300 bg-white text-blue-700 hover:bg-blue-50 h-8"
                onClick={setupFolders}
                disabled={isSettingUpFolders}
              >
                {isSettingUpFolders
                  ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  : <FolderOpen className="h-3.5 w-3.5 mr-1.5" />}
                Ordnerstruktur anlegen
              </Button>
              {onedrive.driveUrl && (
                <Button size="sm" variant="ghost" className="text-blue-700 h-8" asChild>
                  <a href={onedrive.driveUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> OneDrive öffnen
                  </a>
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <Card className="shadow-sm">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Kategorie</TableHead>
                <TableHead className="hidden sm:table-cell">Immobilie</TableHead>
                <TableHead className="hidden md:table-cell">Größe</TableHead>
                <TableHead className="hidden md:table-cell">Hochgeladen</TableHead>
                <TableHead className="text-right">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingDocs ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                    Lade Dokumente…
                  </TableCell>
                </TableRow>
              ) : !documents?.length ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-16 text-muted-foreground">
                    <UploadCloud className="w-10 h-10 mx-auto mb-3 opacity-20" />
                    <p className="text-sm">Noch keine Dokumente hochgeladen.</p>
                    <p className="text-xs mt-1">Mietverträge, Rechnungen oder Belege lassen sich direkt hier ablegen.</p>
                  </TableCell>
                </TableRow>
              ) : (
                documents.map((doc) => (
                  <TableRow key={doc.id} className="group">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getFileIcon(doc.mimeType)}
                        <span className="font-medium text-sm">{doc.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {doc.category ? (
                        <Badge variant="secondary" className="text-xs font-normal">
                          {CATEGORIES[doc.category] ?? doc.category}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                      {doc.propertyId
                        ? properties?.find((p) => p.id === doc.propertyId)?.name ?? `Obj. ${doc.propertyId}`
                        : "—"}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground font-mono">
                      {formatFileSize(doc.fileSize)}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      {formatDate(doc.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {(doc as any).onedrivePath && (
                          <Button variant="ghost" size="icon" asChild title="In OneDrive öffnen">
                            <a href={(doc as any).onedrivePath} target="_blank" rel="noopener noreferrer">
                              <Cloud className="w-4 h-4 text-blue-500" />
                            </a>
                          </Button>
                        )}
                        {doc.fileUrl && (
                          <Button variant="ghost" size="icon" asChild>
                            <a href={`${BASE}${doc.fileUrl}`} target="_blank" rel="noopener noreferrer" title="Öffnen">
                              <Download className="w-4 h-4 text-muted-foreground" />
                            </a>
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(doc.id)}
                        >
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

      {/* Upload dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Dokument hochladen</DialogTitle>
            <DialogDescription>
              Datei wird sicher in der Cloud gespeichert und ist dauerhaft verfügbar.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* File picker */}
              <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center">
                <input
                  type="file"
                  id="file-input"
                  className="hidden"
                  onChange={onFileChange}
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png,.gif,.zip"
                />
                <label htmlFor="file-input" className="cursor-pointer">
                  <UploadCloud className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                  {selectedFile ? (
                    <div>
                      <p className="text-sm font-medium">{selectedFile.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{formatFileSize(selectedFile.size)}</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm text-muted-foreground">Klicken zum Auswählen</p>
                      <p className="text-xs text-muted-foreground mt-0.5">PDF, Word, Excel, Bilder bis 50 MB</p>
                    </div>
                  )}
                </label>
              </div>

              {isUploading && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Wird hochgeladen…</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <Progress value={uploadProgress} className="h-1.5" />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>Bezeichnung</FormLabel>
                      <FormControl>
                        <Input placeholder="z.B. Mietvertrag Wohnung EG" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Kategorie</FormLabel>
                      <Select
                        value={field.value ?? ""}
                        onValueChange={(v) => field.onChange(v || null)}
                      >
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Wählen…" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Object.entries(CATEGORIES).map(([v, l]) => (
                            <SelectItem key={v} value={v}>{l}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="propertyId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Immobilie</FormLabel>
                      <Select
                        value={field.value ? String(field.value) : ""}
                        onValueChange={(v) => field.onChange(v ? parseInt(v) : null)}
                      >
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {properties?.map((p) => (
                            <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isUploading}>
                  Abbrechen
                </Button>
                <Button type="submit" disabled={isUploading || !selectedFile} className="gap-2">
                  {isUploading ? <><Loader2 className="h-4 w-4 animate-spin" /> Wird hochgeladen…</> : <><UploadCloud className="h-4 w-4" /> Hochladen</>}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
