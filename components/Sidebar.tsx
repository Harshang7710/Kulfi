'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Role } from '@/lib/types';

type NavItem = { href: string; label: string; icon: keyof typeof icons };

const ownerNav: NavItem[] = [
  { href: '/owner', label: 'Dashboard', icon: 'dashboard' },
  { href: '/owner/reports', label: 'Sales Reports', icon: 'reports' },
  { href: '/owner/items', label: 'Items', icon: 'items' },
  { href: '/owner/inventory', label: 'Inventory', icon: 'inventory' },
  { href: '/owner/movements', label: 'Movement', icon: 'movement' },
  { href: '/owner/users', label: 'Users', icon: 'users' }
];

const managerNav: NavItem[] = [
  { href: '/manager', label: 'Home', icon: 'home' },
  { href: '/manager/pos', label: 'POS Billing', icon: 'pos' },
  { href: '/manager/returns', label: 'Returns', icon: 'returns' },
  { href: '/manager/stock', label: 'Available Stock', icon: 'inventory' }
];

const icons = {
  dashboard: 'M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z',
  reports: 'M5 21V9m7 12V3m7 18v-7',
  items: 'M20 7 12 3 4 7m16 0-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
  inventory: 'M3 7h18M3 12h18M3 17h18',
  movement: 'M8 7h11m0 0-3-3m3 3-3 3M16 17H5m0 0 3-3m-3 3 3 3',
  users: 'M16 19a4 4 0 0 0-8 0M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 8a3 3 0 0 0-5-2.2M4 19a3 3 0 0 1 5-2.2',
  home: 'M4 11 12 4l8 7M6 10v9h12v-9',
  pos: 'M3 6h18l-1.5 9H4.5L3 6Zm0 0L2 3M8 20h.01M16 20h.01',
  returns: 'M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3'
} as const;

function Icon({ name }: { name: keyof typeof icons }) {
  return (
    <span className="nav-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d={icons[name]} />
      </svg>
    </span>
  );
}

export default function Sidebar({ role, logoutAction }: { role: Role; logoutAction: () => Promise<void> }) {
  const pathname = usePathname();
  const items = role === 'owner' ? ownerNav : managerNav;

  return (
    <aside className="sidebar">
      <Link className="brand" href={role === 'owner' ? '/owner' : '/manager'}>
        <img src="/logo.svg" alt="Desi Mastaani Matka Kulfi logo" />
        <span>
          Desi Mastaani
          <br />
          <span>Matka Kulfi</span>
        </span>
      </Link>
      <nav aria-label="Main navigation">
        {items.map(({ href, label, icon }) => {
          const active = pathname === href;
          return (
            <Link key={href} href={href} className={`nav${active ? ' active' : ''}`} aria-current={active ? 'page' : undefined}>
              <Icon name={icon} />
              {label}
            </Link>
          );
        })}
        <form action={logoutAction}>
          <button className="nav logout" type="submit">
            <Icon name="returns" />
            Logout
          </button>
        </form>
      </nav>
    </aside>
  );
}
