/** Maps a pathname to the `route-*` class used to scope page-specific layout
 *  (e.g. the POS fixed shell). Shared by the server layout and the client
 *  reconciler so SSR and client navigation stay in sync. */
export function routeClass(pathname: string): string {
  const slug = (pathname || '/')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return `route-${slug || 'home'}`;
}
