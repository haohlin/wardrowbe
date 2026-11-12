const AI_ROUTES = [
  '/dashboard/suggest',
  '/dashboard/pairings',
  '/dashboard/learning',
  '/dashboard/tryon',
];

export function isAiRoute(pathname: string): boolean {
  return AI_ROUTES.some((route) => pathname === route || pathname.startsWith(route + '/'));
}
