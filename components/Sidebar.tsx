'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Role } from '@/lib/types';

const ownerNav: [string, string][] = [
  ['/owner', 'Dashboard'],
  ['/owner/reports', 'Sales Reports'],
  ['/owner/items', 'Items'],
  ['/owner/inventory', 'Inventory'],
  ['/owner/movements', 'Movement'],
  ['/owner/users', 'Users']
];

const managerNav: [string, string][] = [
  ['/manager', 'Home'],
  ['/manager/pos', 'POS Billing'],
  ['/manager/returns', 'Returns'],
  ['/manager/stock', 'Available Stock']
];

export default function Sidebar({ role, logoutAction }: { role: Role; logoutAction: () => Promise<void> }) {
  const pathname = usePathname();
  const items = role === 'owner' ? ownerNav : managerNav;

  return (
    <aside className="sidebar">
      <a className="brand" href={role === 'owner' ? '/owner' : '/manager'}>
        <img src="/logo.svg" alt="Desi Mastaani Matka Kulfi logo" />
        <span>
          Desi Mastaani
          <br />
          <span>Matka Kulfi</span>
        </span>
      </a>
      <nav aria-label="Main navigation">
        {items.map(([href, label], index) => (
          <Link
            key={href}
            href={href}
            className={`nav nav-idx-${index}${pathname === href ? ' active' : ''}`}
            aria-current={pathname === href ? 'page' : undefined}
          >
            {label}
          </Link>
        ))}
        <form action={logoutAction}>
          <button className="nav logout" type="submit">
            Logout
          </button>
        </form>
      </nav>
    </aside>
  );
}
