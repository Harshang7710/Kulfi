'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

function routeClass(path: string) {
  const slug = path.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  return `route-${slug || 'home'}`;
}

export default function RouteBodyClass() {
  const pathname = usePathname();

  useEffect(() => {
    const className = routeClass(pathname || '/');
    document.body.classList.add(className);
    return () => {
      document.body.classList.remove(className);
    };
  }, [pathname]);

  return null;
}
