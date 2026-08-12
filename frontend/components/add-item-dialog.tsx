'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, X, Loader2, CheckCircle2, AlertCircle, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreateItem, useBulkCreateItems, BulkUploadResponse } from '@/lib/hooks/use-items';
import { useClothingTypes, useClothingColors } from '@/lib/hooks/use-translated-constants';
import { useTranslations } from 'next-intl';

interface AddItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface BulkFileMetadata {
  type: string;
  name: string;
  brand: string;
  primaryColor: string;
  notes: string;
}

interface FileWithPreview {
  file: File;
  preview: string;
  id: string;
  metadata: BulkFileMetadata;
}

const emptyBulkFileMetadata = (): BulkFileMetadata => ({
  type: '',
  name: '',
  brand: '',
  primaryColor: '',
  notes: '',
});

export function AddItemDialog({ open, onOpenChange }: AddItemDialogProps) {
  const t = useTranslations('wardrobe.addItem');
  const tc = useTranslations('common');
  const clothingTypes = useClothingTypes();
  const clothingColors = useClothingColors();
  // Single upload state
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [type, setType] = useState('');
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [primaryColor, setPrimaryColor] = useState('');
  const [notes, setNotes] = useState('');

  // Bulk upload state
  const [bulkFiles, setBulkFiles] = useState<FileWithPreview[]>([]);
  const [bulkResult, setBulkResult] = useState<BulkUploadResponse | null>(null);
  const [skipAi, setSkipAi] = useState(false);
  const [activeTab, setActiveTab] = useState('single');
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  // Track blob URLs for cleanup on unmount
  const blobUrlsRef = useRef<Set<string>>(new Set());

  const createItem = useCreateItem();
  const bulkCreateItems = useBulkCreateItems();

  // Cleanup blob URLs on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      blobUrlsRef.current.clear();
    };
  }, []);

  // Single file drop handler
  const onDropSingle = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      setFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  // Bulk file drop handler
  const onDropBulk = useCallback((acceptedFiles: File[]) => {
    const newFiles: FileWithPreview[] = acceptedFiles.map((file) => {
      const preview = URL.createObjectURL(file);
      blobUrlsRef.current.add(preview);
      return {
        file,
        preview,
        id: `${file.name}-${Date.now()}-${Math.random()}`,
        metadata: emptyBulkFileMetadata(),
      };
    });
    setBulkFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const { getRootProps: getSingleRootProps, getInputProps: getSingleInputProps, isDragActive: isSingleDragActive } = useDropzone({
    onDrop: onDropSingle,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.webp', '.heic', '.heif'],
    },
    maxFiles: 1,
    multiple: false,
  });

  const { getRootProps: getBulkRootProps, getInputProps: getBulkInputProps, isDragActive: isBulkDragActive } = useDropzone({
    onDrop: onDropBulk,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.webp', '.heic', '.heif'],
    },
    multiple: true,
  });

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!file) return;

    const formData = new FormData();
    formData.append('image', file);
    // Type is optional - AI will detect if not provided
    if (type) formData.append('type', type);
    if (name) formData.append('name', name);
    if (brand) formData.append('brand', brand);
    if (primaryColor) formData.append('primary_color', primaryColor);
    if (notes) formData.append('notes', notes);

    try {
      await createItem.mutateAsync(formData);
      handleClose();
    } catch (error) {
      console.error('Failed to create item:', error);
    }
  };

  const handleBulkSubmit = async () => {
    if (bulkFiles.length === 0) return;

    try {
      const result = await bulkCreateItems.mutateAsync({
        files: bulkFiles.map((f) => f.file),
        metadata: bulkFiles.map((f) => ({
          type: f.metadata.type || undefined,
          name: f.metadata.name || undefined,
          brand: f.metadata.brand || undefined,
          primary_color: f.metadata.primaryColor || undefined,
          colors: f.metadata.primaryColor ? [f.metadata.primaryColor] : undefined,
          notes: f.metadata.notes || undefined,
        })),
        skipAi,
      });
      setBulkResult(result);

      // Show toast based on results
      if (result.failed === 0) {
        toast.success(t('bulk.allSuccess', { count: result.successful }));
      } else if (result.successful === 0) {
        toast.error(t('bulk.allFailed', { count: result.failed }));
      } else {
        toast.warning(t('bulk.partial', { success: result.successful, failed: result.failed }));
      }
    } catch (error) {
      console.error('Failed to bulk upload:', error);
      toast.error(t('bulk.uploadError'));
    }
  };

  // Check if there are unsaved files that would be lost on close
  const hasUnsavedFiles = (file !== null) || (bulkFiles.length > 0 && !bulkResult);

  const handleCloseRequest = () => {
    // Show confirmation if there are unsaved files and not currently uploading
    if (hasUnsavedFiles && !createItem.isPending && !bulkCreateItems.isPending) {
      setShowCloseConfirm(true);
    } else {
      handleClose();
    }
  };

  const handleClose = () => {
    // Single upload cleanup
    setFile(null);
    setPreview(null);
    setType('');
    setName('');
    setBrand('');
    setPrimaryColor('');
    setNotes('');

    // Bulk upload cleanup - also clean up from the ref
    bulkFiles.forEach((f) => {
      URL.revokeObjectURL(f.preview);
      blobUrlsRef.current.delete(f.preview);
    });
    setBulkFiles([]);
    setBulkResult(null);
    setSkipAi(false);
    setActiveTab('single');
    setShowCloseConfirm(false);

    onOpenChange(false);
  };

  const clearSingleFile = () => {
    setFile(null);
    setPreview(null);
  };

  const removeBulkFile = (id: string) => {
    setBulkFiles((prev) => {
      const fileToRemove = prev.find((f) => f.id === id);
      if (fileToRemove) {
        URL.revokeObjectURL(fileToRemove.preview);
        blobUrlsRef.current.delete(fileToRemove.preview);
      }
      return prev.filter((f) => f.id !== id);
    });
  };

  const updateBulkFileMetadata = (
    id: string,
    field: keyof BulkFileMetadata,
    value: string
  ) => {
    setBulkFiles((prev) =>
      prev.map((entry) =>
        entry.id === id
          ? { ...entry, metadata: { ...entry.metadata, [field]: value } }
          : entry
      )
    );
  };

  const clearBulkFiles = () => {
    bulkFiles.forEach((f) => {
      URL.revokeObjectURL(f.preview);
      blobUrlsRef.current.delete(f.preview);
    });
    setBulkFiles([]);
    setBulkResult(null);
    setSkipAi(false);
  };

  return (
    <>
    <Dialog open={open} onOpenChange={handleCloseRequest}>
      <DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>
            {t('subtitle')}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="single">{t('singleItem')}</TabsTrigger>
            <TabsTrigger value="bulk">{t('bulkUpload')}</TabsTrigger>
          </TabsList>

          {/* Single Item Upload */}
          <TabsContent value="single" className="min-h-0 space-y-4 overflow-y-auto pr-1">
            <form onSubmit={handleSingleSubmit} className="space-y-4">
              {!preview ? (
                <div
                  {...getSingleRootProps()}
                  className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                    isSingleDragActive
                      ? 'border-primary bg-primary/5'
                      : 'border-muted-foreground/25 hover:border-primary/50'
                  }`}
                >
                  <input {...getSingleInputProps()} />
                  <Upload className="mx-auto h-12 w-12 text-muted-foreground" />
                  <p className="mt-2 text-sm text-muted-foreground">
                    {isSingleDragActive
                      ? t('dropzoneActive')
                      : t('dropzone')}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('formatHint')}
                  </p>
                </div>
              ) : (
                <div className="relative">
                  <img
                    src={preview}
                    alt={t('previewAlt')}
                    className="w-full h-48 object-cover rounded-lg"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2 h-8 w-8"
                    onClick={clearSingleFile}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}

              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="type">{t('typeLabel')}</Label>
                  <Select value={type} onValueChange={setType}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('letAiDetect')} />
                    </SelectTrigger>
                    <SelectContent>
                      {clothingTypes.map((ct) => (
                        <SelectItem key={ct.value} value={ct.value}>
                          {ct.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="name">{t('namePlaceholder')}</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t('nameInputPlaceholder')}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="brand">{t('brandPlaceholder')}</Label>
                    <Input
                      id="brand"
                      value={brand}
                      onChange={(e) => setBrand(e.target.value)}
                      placeholder={t('brandInputPlaceholder')}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="color">{t('primaryColor')}</Label>
                    <Select value={primaryColor} onValueChange={setPrimaryColor}>
                      <SelectTrigger>
                        <SelectValue placeholder={t('selectPlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        {clothingColors.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            <div className="flex items-center gap-2">
                              <div
                                className="w-3 h-3 rounded-full border"
                                style={{ backgroundColor: c.hex }}
                              />
                              {c.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">{t('notesPlaceholder')}</Label>
                  <Input
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={t('notesInputPlaceholder')}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={handleCloseRequest}>
                  {tc('cancel')}
                </Button>
                <Button
                  type="submit"
                  disabled={!file || createItem.isPending}
                >
                  {createItem.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t('uploading')}
                    </>
                  ) : (
                    t('submit')
                  )}
                </Button>
              </div>
            </form>
          </TabsContent>

          {/* Bulk Upload */}
          <TabsContent value="bulk" className="min-h-0 space-y-4 overflow-y-auto pr-1">
            {!bulkResult ? (
              <>
                <div
                  {...getBulkRootProps()}
                  className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                    isBulkDragActive
                      ? 'border-primary bg-primary/5'
                      : 'border-muted-foreground/25 hover:border-primary/50'
                  }`}
                >
                  <input {...getBulkInputProps()} />
                  <Upload className="mx-auto h-10 w-10 text-muted-foreground" />
                  <p className="mt-2 text-sm text-muted-foreground">
                    {isBulkDragActive
                      ? t('dropzoneActive')
                      : t('dropzone')}
                  </p>
                </div>

                {bulkFiles.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">
                        {t('bulk.imageCount', { count: bulkFiles.length })}
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={clearBulkFiles}
                      >
                        {t('bulk.clearAll')}
                      </Button>
                    </div>

                    <ScrollArea className="h-[min(42dvh,360px)] rounded-md border p-3">
                      <div className="space-y-4">
                        {bulkFiles.map((f) => (
                          <div key={f.id} className="space-y-3 rounded-lg border bg-card p-3">
                            <div className="flex gap-3">
                              <div className="relative shrink-0">
                                <img
                                  src={f.preview}
                                  alt={f.file.name}
                                  className="h-20 w-20 rounded-md object-cover"
                                />
                                <Button
                                  type="button"
                                  variant="destructive"
                                  size="icon"
                                  className="absolute -right-2 -top-2 h-6 w-6"
                                  onClick={() => removeBulkFile(f.id)}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                              <div className="min-w-0 flex-1 space-y-2">
                                <p className="truncate text-sm font-medium">{f.file.name}</p>
                                <Label htmlFor={`bulk-type-${f.id}`}>{t('typeLabel')}</Label>
                                <Select
                                  value={f.metadata.type}
                                  onValueChange={(value) => updateBulkFileMetadata(f.id, 'type', value)}
                                >
                                  <SelectTrigger id={`bulk-type-${f.id}`} className="h-8">
                                    <SelectValue placeholder={t('letAiDetect')} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {clothingTypes.map((ct) => (
                                      <SelectItem key={ct.value} value={ct.value}>{ct.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            <Input
                              id={`bulk-name-${f.id}`}
                              value={f.metadata.name}
                              onChange={(event) => updateBulkFileMetadata(f.id, 'name', event.target.value)}
                              placeholder={t('namePlaceholder')}
                            />
                            <div className="grid grid-cols-2 gap-3">
                              <Input
                                id={`bulk-brand-${f.id}`}
                                value={f.metadata.brand}
                                onChange={(event) => updateBulkFileMetadata(f.id, 'brand', event.target.value)}
                                placeholder={t('brandPlaceholder')}
                              />
                              <Select
                                value={f.metadata.primaryColor}
                                onValueChange={(value) => updateBulkFileMetadata(f.id, 'primaryColor', value)}
                              >
                                <SelectTrigger id={`bulk-color-${f.id}`}>
                                  <SelectValue placeholder={t('primaryColor')} />
                                </SelectTrigger>
                                <SelectContent>
                                  {clothingColors.map((color) => (
                                    <SelectItem key={color.value} value={color.value}>{color.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <Input
                              id={`bulk-notes-${f.id}`}
                              value={f.metadata.notes}
                              onChange={(event) => updateBulkFileMetadata(f.id, 'notes', event.target.value)}
                              placeholder={t('notesPlaceholder')}
                            />
                          </div>
                        ))}
                      </div>
                    </ScrollArea>

                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="skip-ai"
                        checked={skipAi}
                        onCheckedChange={(checked) => setSkipAi(checked === true)}
                      />
                      <Label htmlFor="skip-ai" className="text-xs font-normal text-muted-foreground">
                        {t('bulk.skipAi')}
                      </Label>
                    </div>
                    {!skipAi && (
                      <p className="text-xs text-muted-foreground">
                        {t('bulk.hint')}
                      </p>
                    )}
                  </div>
                )}

                {bulkCreateItems.isPending && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm">{t('bulk.uploadingCount', { count: bulkFiles.length })}</span>
                      </div>
                      <span className="text-sm text-muted-foreground">{bulkCreateItems.uploadProgress}%</span>
                    </div>
                    <Progress value={bulkCreateItems.uploadProgress} className="h-2" />
                  </div>
                )}

                <div
                  data-testid="bulk-upload-actions"
                  className="sticky bottom-0 z-10 flex justify-end gap-2 border-t bg-background/95 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur"
                >
                  <Button type="button" variant="outline" onClick={handleCloseRequest}>
                    {tc('cancel')}
                  </Button>
                  <Button
                    onClick={handleBulkSubmit}
                    disabled={bulkFiles.length === 0 || bulkCreateItems.isPending}
                  >
                    {bulkCreateItems.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t('uploading')}
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-4 w-4" />
                        {t('bulk.uploadButton', { count: bulkFiles.length })}
                      </>
                    )}
                  </Button>
                </div>
              </>
            ) : (
              /* Bulk Upload Results */
              <div className="space-y-4">
                <div className="flex items-center justify-center gap-3 py-4">
                  {bulkResult.failed === 0 ? (
                    <CheckCircle2 className="h-12 w-12 text-green-500" />
                  ) : bulkResult.successful === 0 ? (
                    <AlertCircle className="h-12 w-12 text-destructive" />
                  ) : (
                    <AlertCircle className="h-12 w-12 text-yellow-500" />
                  )}
                </div>

                <div className="text-center">
                  <p className="text-lg font-medium">
                    {t('bulk.resultSuccess', { success: bulkResult.successful, total: bulkResult.total })}
                  </p>
                  {bulkResult.failed > 0 && (
                    <p className="text-sm text-muted-foreground">
                      {t('bulk.resultFailed', { count: bulkResult.failed })}
                    </p>
                  )}
                </div>

                <ScrollArea className="h-[200px] rounded-md border">
                  <div className="p-3 space-y-2">
                    {bulkResult.results.map((result, index) => (
                      <div
                        key={index}
                        className={`flex items-center gap-3 p-2 rounded-md ${
                          result.success ? 'bg-green-500/10' : 'bg-destructive/10'
                        }`}
                      >
                        {result.success ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{result.filename}</p>
                          {result.error && (
                            <p className="text-xs text-destructive">{result.error}</p>
                          )}
                        </div>
                        {result.item && (
                          <ImageIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={clearBulkFiles}>
                    {t('bulk.uploadMore')}
                  </Button>
                  <Button onClick={handleClose}>
                    {tc('done')}
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>

    <AlertDialog open={showCloseConfirm} onOpenChange={setShowCloseConfirm}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('bulk.discardConfirm.title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {activeTab === 'single'
              ? t('bulk.discardConfirm.singleImage')
              : t('bulk.discardConfirm.imageCount', { count: bulkFiles.length })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('bulk.discardConfirm.keepEditing')}</AlertDialogCancel>
          <AlertDialogAction onClick={handleClose}>{t('bulk.discardConfirm.discard')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
