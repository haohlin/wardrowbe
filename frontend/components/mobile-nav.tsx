'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Shirt, Sparkles, LayoutGrid, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

const navigation = [
  { labelKey: 'nav.home' as const, href: '/dashboard', icon: Home },
  { labelKey: 'nav.wardrobe' as const, href: '/dashboard/wardrobe', icon: Shirt },
  { labelKey: 'nav.suggest' as const, href: '/dashboard/suggest', icon: Sparkles },
  { labelKey: 'nav.outfits' as const, href: '/dashboard/outfits', icon: LayoutGrid },
  { labelKey: 'nav.settings' as const, href: '/dashboard/settings', icon: Settings },
];

export function MobileNav() {
  const pathname = usePathname();
  const { t } = useI18n();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background lg:hidden">
      <div className="flex h-16 items-center justify-around">
        {navigation.map((item) => {
          const isActive = item.href === '/dashboard'
            ? pathname === '/dashboard'
            : pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center gap-1 px-3 py-2 text-xs',
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <item.icon className="h-5 w-5" aria-hidden="true" />
              <span>{t(item.labelKey)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
