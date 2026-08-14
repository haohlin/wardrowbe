'use client';

import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Camera, CheckCircle2, Clock3, Loader2, RefreshCw, Sparkles, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';

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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { getErrorMessage } from '@/lib/api';
import { useOutfits } from '@/lib/hooks/use-outfits';
import {
  TryOn,
  useCreateTryOn,
  useDeleteTryOn,
  useDeleteTryOnPhoto,
  useTryOnQuota,
  useTryOns,
  useUploadTryOnPhoto,
} from '@/lib/hooks/use-tryon';
import { useUserProfile } from '@/lib/hooks/use-user';

function outfitLabel(outfit: { name: string | null; occasion: string }) {
  return outfit.name || `${outfit.occasion} outfit`;
}

function resultImage(record: TryOn) {
  return record.result_image_url || record.image_url || record.generated_image_url;
}

export default function TryOnPage() {
  const t = useTranslations('tryon');
  const { data: outfitsData, isLoading: outfitsLoading } = useOutfits({}, 1, 100);
  const { data: profile } = useUserProfile();
  const { data: quota } = useTryOnQuota();
  const { data: tryOnsData, isLoading: tryOnsLoading } = useTryOns();
  const createTryOn = useCreateTryOn();
  const uploadPhoto = useUploadTryOnPhoto();
  const deleteTryOn = useDeleteTryOn();
  const deleteSavedPhoto = useDeleteTryOnPhoto();

  const [selectedOutfitId, setSelectedOutfitId] = useState<string>();
  const [photo, setPhoto] = useState<File>();
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [useSavedPhoto, setUseSavedPhoto] = useState(false);
  const [savePhoto, setSavePhoto] = useState(false);
  const [tryOnToDelete, setTryOnToDelete] = useState<TryOn>();
  const [removeSavedPhotoOpen, setRemoveSavedPhotoOpen] = useState(false);

  const outfits = useMemo(() => outfitsData?.outfits ?? [], [outfitsData?.outfits]);
  const hasSavedPhoto = Boolean(profile?.tryon_person_image_url);
  const isBusy = createTryOn.isPending || uploadPhoto.isPending;
  const canGenerate = Boolean(selectedOutfitId && (photo || (useSavedPhoto && hasSavedPhoto)) && quota?.can_generate !== false);

  useEffect(() => {
    if (!selectedOutfitId && outfits.length > 0) setSelectedOutfitId(outfits[0].id);
  }, [outfits, selectedOutfitId]);

  useEffect(() => {
    if (hasSavedPhoto && !photo) setUseSavedPhoto(true);
  }, [hasSavedPhoto, photo]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const handlePhotoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextPhoto = event.target.files?.[0];
    if (!nextPhoto) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPhoto(nextPhoto);
    setPreviewUrl(URL.createObjectURL(nextPhoto));
    setUseSavedPhoto(false);
  };

  const handleGenerate = async () => {
    if (!selectedOutfitId) {
      toast.error(t('noOutfits'));
      return;
    }
    if (!photo && !(useSavedPhoto && hasSavedPhoto)) {
      toast.error(t('photoError'));
      return;
    }

    try {
      if (photo && savePhoto) {
        await uploadPhoto.mutateAsync(photo);
        await createTryOn.mutateAsync({ outfitId: selectedOutfitId, useSavedPhoto: true });
      } else {
        await createTryOn.mutateAsync({
          outfitId: selectedOutfitId,
          photo,
          useSavedPhoto: useSavedPhoto && hasSavedPhoto,
        });
      }
      toast.success(t('queued'));
      setPhoto(undefined);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(undefined);
      if (savePhoto) setUseSavedPhoto(true);
      setSavePhoto(false);
    } catch (error) {
      toast.error(getErrorMessage(error, t('generateError')));
    }
  };

  const handleRetry = async (record: TryOn) => {
    if (!hasSavedPhoto) {
      toast.error(t('retryRequiresSavedPhoto'));
      return;
    }
    try {
      await createTryOn.mutateAsync({ outfitId: record.outfit_id, useSavedPhoto: true });
      toast.success(t('queued'));
    } catch (error) {
      toast.error(getErrorMessage(error, t('generateError')));
    }
  };

  const handleDeleteTryOn = async () => {
    if (!tryOnToDelete) return;
    try {
      await deleteTryOn.mutateAsync(tryOnToDelete.id);
      toast.success(t('deleted'));
      setTryOnToDelete(undefined);
    } catch (error) {
      toast.error(getErrorMessage(error, t('deleteError')));
    }
  };

  const handleDeleteSavedPhoto = async () => {
    try {
      await deleteSavedPhoto.mutateAsync();
      toast.success(t('savedPhotoDeleted'));
      setUseSavedPhoto(false);
      setRemoveSavedPhotoOpen(false);
    } catch (error) {
      toast.error(getErrorMessage(error, t('savedPhotoDeleteError')));
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Badge variant="secondary">
          {quota?.unlimited ? t('unlimited') : t('remaining', { count: quota?.remaining ?? 0 })}
        </Badge>
      </div>

      <Card>
        <CardContent className="grid gap-5 p-5 md:grid-cols-[1fr_1.2fr]">
          <div className="space-y-2">
            <Label htmlFor="tryon-outfit">{t('outfit')}</Label>
            <Select value={selectedOutfitId} onValueChange={setSelectedOutfitId} disabled={outfitsLoading || outfits.length === 0}>
              <SelectTrigger id="tryon-outfit">
                <SelectValue placeholder={t('selectOutfit')} />
              </SelectTrigger>
              <SelectContent>
                {outfits.map((outfit) => (
                  <SelectItem key={outfit.id} value={outfit.id}>
                    {outfitLabel(outfit)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!outfitsLoading && outfits.length === 0 && (
              <p className="text-sm text-muted-foreground">{t('noOutfits')}</p>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="tryon-photo">{t('photo')}</Label>
              {hasSavedPhoto && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="use-saved-tryon-photo"
                    checked={useSavedPhoto}
                    onCheckedChange={(checked) => {
                      setUseSavedPhoto(checked === true);
                      if (checked) {
                        setPhoto(undefined);
                        if (previewUrl) URL.revokeObjectURL(previewUrl);
                        setPreviewUrl(undefined);
                      }
                    }}
                  />
                  <Label htmlFor="use-saved-tryon-photo" className="text-sm font-normal">
                    {t('useSavedPhoto')}
                  </Label>
                </div>
              )}
            </div>

            {useSavedPhoto && profile?.tryon_person_image_url ? (
              <div className="flex items-center gap-3 rounded-md border p-3">
                <div className="relative h-14 w-14 overflow-hidden rounded bg-muted">
                  <Image src={profile.tryon_person_image_url} alt={t('savedPhoto')} fill className="object-cover" sizes="56px" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{t('savedPhoto')}</p>
                  <p className="text-xs text-muted-foreground">{t('savePhotoDescription')}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setRemoveSavedPhotoOpen(true)}>
                  {t('removeSavedPhoto')}
                </Button>
              </div>
            ) : (
              <>
                <Input id="tryon-photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoChange} />
                {previewUrl && (
                  <div className="flex items-center gap-3 rounded-md border p-3">
                    <div className="relative h-14 w-14 overflow-hidden rounded bg-muted">
                      <Image src={previewUrl} alt={t('photo')} fill className="object-cover" sizes="56px" unoptimized />
                    </div>
                    <span className="min-w-0 flex-1 truncate text-sm">{photo?.name}</span>
                  </div>
                )}
                {photo && (
                  <div className="flex items-center gap-2">
                    <Checkbox id="save-tryon-photo" checked={savePhoto} onCheckedChange={(checked) => setSavePhoto(checked === true)} />
                    <Label htmlFor="save-tryon-photo" className="text-sm font-normal">
                      {t('savePhoto')}
                    </Label>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="md:col-span-2 flex justify-end">
            <Button onClick={handleGenerate} disabled={!canGenerate || isBusy}>
              {isBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              {isBusy ? t('generating') : t('generate')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('history')}</h2>
        {tryOnsLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-72" />
            <Skeleton className="h-72" />
            <Skeleton className="h-72" />
          </div>
        ) : tryOnsData?.items.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tryOnsData.items.map((record) => {
              const generated = resultImage(record);
              const active = record.status === 'pending' || record.status === 'processing';
              return (
                <Card key={record.id} className="overflow-hidden">
                  <CardContent className="space-y-3 p-3">
                    {generated ? (
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <div className="relative aspect-[3/4] overflow-hidden rounded bg-muted">
                            <Image src={record.person_image_url} alt={t('before')} fill className="object-cover" sizes="(max-width: 640px) 45vw, 180px" />
                          </div>
                          <p className="text-xs text-muted-foreground">{t('before')}</p>
                        </div>
                        <div className="space-y-1">
                          <div className="relative aspect-[3/4] overflow-hidden rounded bg-muted">
                            <Image src={generated} alt={t('after')} fill className="object-cover" sizes="(max-width: 640px) 45vw, 180px" />
                          </div>
                          <p className="text-xs text-muted-foreground">{t('after')}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex aspect-[3/2] flex-col items-center justify-center gap-2 rounded bg-muted text-muted-foreground">
                        {active ? <Loader2 className="h-7 w-7 animate-spin" /> : <Camera className="h-7 w-7" />}
                        <span className="text-sm">{t(record.status)}</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-2">
                      <Badge variant={record.status === 'failed' ? 'destructive' : active ? 'secondary' : 'outline'}>
                        {record.status === 'completed' && <CheckCircle2 className="mr-1 h-3 w-3" />}
                        {active && <Clock3 className="mr-1 h-3 w-3" />}
                        {t(record.status)}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{new Date(record.created_at).toLocaleDateString()}</span>
                    </div>

                    {record.status === 'failed' && (
                      <p className="text-sm text-destructive">{record.error || t('failed')}</p>
                    )}

                    <div className="flex justify-end gap-2">
                      {record.status === 'failed' && (
                        <Button variant="outline" size="sm" onClick={() => handleRetry(record)} disabled={isBusy}>
                          <RefreshCw className="mr-1 h-3.5 w-3.5" />
                          {t('retry')}
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => setTryOnToDelete(record)} aria-label={t('delete')}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
              <Upload className="h-7 w-7" />
              <p>{t('emptyHistory')}</p>
            </CardContent>
          </Card>
        )}
      </section>

      <AlertDialog open={Boolean(tryOnToDelete)} onOpenChange={(open) => !open && setTryOnToDelete(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('deleteConfirmDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTryOn} disabled={deleteTryOn.isPending}>
              {t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={removeSavedPhotoOpen} onOpenChange={setRemoveSavedPhotoOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('removeSavedPhoto')}</AlertDialogTitle>
            <AlertDialogDescription>{t('removeSavedPhotoDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteSavedPhoto} disabled={deleteSavedPhoto.isPending}>
              {t('removeSavedPhoto')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
