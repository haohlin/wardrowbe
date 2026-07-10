'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import { format, formatDistanceToNow, parseISO } from 'date-fns';
import {
  BookmarkPlus,
  CalendarPlus,
  ChevronLeft,
  Loader2,
  Pencil,
  Sparkles,
  Star,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { LineageCard } from '@/components/shared/lineage-card';
import { CloneToLookbookDialog } from '@/components/shared/clone-to-lookbook-dialog';
import { useDeleteOutfit, useOutfit, useOutfits } from '@/lib/hooks/use-outfits';
import { useWearToday } from '@/lib/hooks/use-studio';
import { getErrorMessage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

export default function OutfitDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const outfitId = params?.id;

  const { data: outfit, isLoading } = useOutfit(outfitId);
  const { language } = useI18n();
  const deleteMutation = useDeleteOutfit();
  const wearTodayMutation = useWearToday(outfitId ?? '');

  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);

  const isTemplate =
    outfit !== undefined && outfit !== null && outfit.scheduled_for === null;
  const isWorn = !!outfit?.feedback?.worn_at;

  const { data: wearInstancesData } = useOutfits(
    isTemplate && outfitId ? { cloned_from_outfit_id: outfitId } : {},
    1,
    10
  );

  if (isLoading || !outfit) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const handleWearToday = async () => {
    try {
      const result = await wearTodayMutation.mutateAsync({});
      toast.success('Added to today');
      router.push(`/dashboard/outfits/${result.id}`);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to wear today'));
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this outfit? This cannot be undone.')) return;
    try {
      await deleteMutation.mutateAsync(outfit.id);
      toast.success('Outfit deleted');
      router.push('/dashboard/outfits');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to delete'));
    }
  };

  const localizedText = outfit.localized_text?.[language === 'zh' ? 'zh' : 'en'] ?? null;
  const displayReasoning = localizedText?.headline || outfit.reasoning;
  const displayHighlights = localizedText?.highlights?.length ? localizedText.highlights : outfit.highlights;
  const displayTip = localizedText?.styling_tip || outfit.style_notes;
  const title = outfit.name || displayReasoning || `${outfit.occasion} outfit`;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/dashboard/outfits">
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back to Outfits
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight capitalize">{title}</h1>
        <div className="flex items-center gap-2 mt-2">
          <Badge variant="outline" className="capitalize">
            {outfit.occasion}
          </Badge>
          <Badge variant="outline" className="capitalize">
            {outfit.source.replace('_', ' ')}
          </Badge>
          <span className="text-sm text-muted-foreground">
            {outfit.scheduled_for
              ? formatDistanceToNow(parseISO(outfit.scheduled_for), {
                  addSuffix: true,
                })
              : 'Lookbook template'}
          </span>
        </div>

        {/* AI reasoning */}
        {((outfit.name && outfit.reasoning) ||
          (outfit.highlights && outfit.highlights.length > 0)) && (
          <div className="mt-2 space-y-1.5 text-xs flex-1">
            {outfit.name && outfit.reasoning && (
              <p className="font-medium text-foreground break-words">{outfit.reasoning}</p>
            )}
            {outfit.highlights && outfit.highlights.length > 0 && (
              <ul className="space-y-0.5">
                {outfit.highlights.slice(0, 3).map((highlight, index) => (
                  <li key={index} className="flex items-start gap-1.5 text-muted-foreground">
                    <span className="text-primary">•</span>
                    <span>{highlight}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Styling tip */}
        {outfit.style_notes && (
          <div className="mt-2 p-2 bg-muted rounded border text-xs">
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Tip:</span> {outfit.style_notes}
            </p>
          </div>
        )}

      </div>

      <LineageCard outfit={outfit} />

      {(displayReasoning || displayHighlights?.length || displayTip || outfit.try_on_image_url) && (
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-r from-primary/10 to-primary/5 p-4 border-b">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">Your Outfit</h2>
            </div>
            {displayReasoning && (
              <p data-i18n-skip="true" className="mt-2 text-base font-medium text-foreground">{displayReasoning}</p>
            )}
            {displayHighlights && displayHighlights.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {displayHighlights.map((highlight, index) => (
                  <li key={index} data-i18n-skip="true" className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="text-primary mt-0.5">•</span>
                    <span>{highlight}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {outfit.try_on_image_url && (
            <div className="border-b bg-background">
              <div className="relative w-full aspect-[4/3] sm:aspect-[16/9]">
                <Image
                  src={outfit.try_on_image_url}
                  alt={`AI try-on preview for ${title}`}
                  fill
                  className="object-contain bg-muted/30"
                  sizes="(max-width: 640px) 100vw, 896px"
                />
              </div>
              <p className="px-4 py-2 text-xs text-muted-foreground">
                AI try-on preview with front and back views based on your saved body measurements.
              </p>
            </div>
          )}
          {displayTip && (
            <CardContent className="p-4">
              <div data-i18n-skip="true" className="p-3 bg-muted rounded-lg border text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Tip:</span> {displayTip}
              </div>
            </CardContent>
          )}
          {outfit.debug_prompt && (
            <CardContent className="p-4 pt-0">
              <details className="rounded-lg border bg-muted/50 p-3 text-sm">
                <summary className="cursor-pointer font-medium text-foreground">Debug AI prompt</summary>
                <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs text-muted-foreground">
                  {outfit.debug_prompt}
                </pre>
              </details>
            </CardContent>
          )}
        </Card>
      )}

      <Card>
        <CardContent className="p-4">
          <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
            Items ({outfit.items.length})
          </h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
            {outfit.items.map((item) => (
              <Link
                key={item.id}
                href={`/dashboard/wardrobe?itemId=${item.id}`}
                className="group"
              >
                <div className="relative aspect-square rounded-lg overflow-hidden border bg-muted">
                  {item.thumbnail_url || item.image_url ? (
                    <Image
                      src={(item.thumbnail_url || item.image_url)!}
                      alt={item.name || item.type}
                      fill
                      className="object-cover transition-transform group-hover:scale-105"
                      sizes="(max-width: 640px) 33vw, 20vw"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-xs text-muted-foreground">
                        {item.type}
                      </span>
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1 truncate">
                  {item.name || item.type}
                </p>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        {isTemplate && (
          <Button onClick={handleWearToday} disabled={wearTodayMutation.isPending}>
            {wearTodayMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <CalendarPlus className="h-4 w-4 mr-2" />
            )}
            Wear today
          </Button>
        )}
        {!isTemplate && (
          <Button variant="outline" onClick={() => setCloneDialogOpen(true)}>
            <BookmarkPlus className="h-4 w-4 mr-2" />
            Save to lookbook
          </Button>
        )}
        {!isWorn && (
          <Button variant="outline" asChild>
            <Link href={`/dashboard/outfits/new?edit=${outfit.id}`}>
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </Link>
          </Button>
        )}
        <Button
          variant="outline"
          className="text-destructive hover:text-destructive"
          onClick={handleDelete}
          disabled={deleteMutation.isPending}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete
        </Button>
      </div>

      {isTemplate && wearInstancesData && wearInstancesData.total > 0 && (
        <Card>
          <CardContent className="p-4">
            <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
              Worn {wearInstancesData.total} time
              {wearInstancesData.total === 1 ? '' : 's'}
            </h2>
            <div className="space-y-2">
              {wearInstancesData.outfits.map((wear) => (
                <Link
                  key={wear.id}
                  href={`/dashboard/outfits/${wear.id}`}
                  className="flex items-center justify-between rounded-lg border px-3 py-2 hover:bg-muted/50"
                >
                  <span className="text-sm">
                    {wear.scheduled_for
                      ? format(parseISO(wear.scheduled_for), 'MMM d, yyyy')
                      : 'Undated'}
                  </span>
                  {wear.feedback?.rating && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                      {wear.feedback.rating}
                    </div>
                  )}
                </Link>
              ))}
            </div>
            {wearInstancesData.has_more && (
              <Button variant="link" size="sm" asChild className="mt-2 px-0">
                <Link href={`/dashboard/outfits?filter=worn&cloned_from=${outfit.id}`}>
                  See all
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {isTemplate && wearInstancesData && wearInstancesData.total === 0 && (
        <Alert className="border-muted">
          <AlertDescription className="text-sm text-muted-foreground">
            This look has not been worn yet. Click &quot;Wear today&quot; to log it.
          </AlertDescription>
        </Alert>
      )}

      {!isTemplate && (
        <CloneToLookbookDialog
          open={cloneDialogOpen}
          sourceOutfitId={outfit.id}
          sourceOccasion={outfit.occasion}
          onClose={() => setCloneDialogOpen(false)}
          onSuccess={(newId) => router.push(`/dashboard/outfits/${newId}`)}
        />
      )}
    </div>
  );
}
