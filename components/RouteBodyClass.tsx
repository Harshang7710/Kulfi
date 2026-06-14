'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { routeClass } from '@/lib/route-class';

export default function RouteBodyClass() {
  const pathname = usePathname();

  useEffect(() => {
    const next = routeClass(pathname || '/');
    // The server already set the initial route class on <body>; on client-side
    // navigation, drop any stale route-* class and apply the current one.
    const stale = Array.from(document.body.classList).filter((c) => c.startsWith('route-') && c !== next);
    document.body.classList.remove(...stale);
    document.body.classList.add(next);
  }, [pathname]);

  return null;
}
