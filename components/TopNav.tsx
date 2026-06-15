'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { Role } from '@/lib/types';

interface NavUser {
  name: string;
  email: string;
  role: Role;
  userId?: string;
}

const ownerNav: [string, string][] = [
  ['/owner', 'Dashboard'],
  ['/owner/reports', 'Sales Reports'],
  ['/owner/items', 'Items'],
  ['/owner/inventory', 'Inventory'],
  ['/owner/users', 'Users']
];

const managerNav: [string, string][] = [
  ['/manager', 'Home'],
  ['/manager/pos', 'POS Billing'],
  ['/manager/returns', 'Returns'],
  ['/manager/stock', 'Available Stock'],
  ['/manager/movements', 'Movement']
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function TopNav({ user, logoutAction }: { user: NavUser; logoutAction: () => Promise<void> }) {
  const pathname = usePathname();
  const items = user.role === 'owner' ? ownerNav : managerNav;

  const [navOpen, setNavOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const userRef = useRef<HTMLDivElement>(null);

  // Close menus on route change.
  useEffect(() => {
    setNavOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  // Close the avatar menu on outside click / Escape.
  useEffect(() => {
    if (!menuOpen) return;
    function onClick(e: MouseEvent) {
      if (userRef.current && !userRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  // Close the confirm dialog on Escape.
  useEffect(() => {
    if (!confirmLogout) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setConfirmLogout(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [confirmLogout]);

  const home = user.role === 'owner' ? '/owner' : '/manager';

  return (
    <header className="topnav">
      <div className="topnav-inner">
        <button
          type="button"
          className="nav-toggle"
          aria-label="Toggle navigation menu"
          aria-expanded={navOpen}
          onClick={() => setNavOpen((v) => !v)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            {navOpen ? <path d="M6 6 18 18M18 6 6 18" /> : <path d="M3 6h18M3 12h18M3 18h18" />}
          </svg>
        </button>

        <Link className="brand" href={home}>
          <img src="/logo.svg" alt="Desi Mastaani Matka Kulfi logo" />
          <span>
            Desi Mastaani <span>Matka Kulfi</span>
          </span>
        </Link>

        <nav className={`topnav-links${navOpen ? ' open' : ''}`} aria-label="Main navigation">
          {items.map(([href, label]) => {
            const active = pathname === href;
            return (
              <Link key={href} href={href} className={`nav${active ? ' active' : ''}`} aria-current={active ? 'page' : undefined}>
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="topnav-user" ref={userRef}>
          <button
            type="button"
            className="avatar-btn"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span className={`avatar avatar-${user.role}`} aria-hidden="true">
              {initials(user.name)}
            </span>
            <span className="avatar-meta">
              <strong>{user.name}</strong>
              <small>{user.role === 'owner' ? 'Owner' : 'Manager'}</small>
            </span>
            <svg className="avatar-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          {menuOpen && (
            <div className="user-menu" role="menu">
              <div className="user-menu-head">
                <span className={`avatar avatar-lg avatar-${user.role}`} aria-hidden="true">
                  {initials(user.name)}
                </span>
                <div className="user-menu-id">
                  <strong>{user.name}</strong>
                  <small>
                    {user.role === 'owner' ? 'Owner' : 'Manager'}
                    {user.userId ? ` · ID ${user.userId}` : ''}
                  </small>
                  <small className="user-menu-email">{user.email}</small>
                </div>
              </div>
              <button
                type="button"
                role="menuitem"
                className="user-menu-item danger"
                onClick={() => {
                  setMenuOpen(false);
                  setConfirmLogout(true);
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
                </svg>
                Log out
              </button>
            </div>
          )}
        </div>
      </div>

      {confirmLogout && (
        <div className="modal-backdrop" onClick={() => setConfirmLogout(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="logout-title" onClick={(e) => e.stopPropagation()}>
            <h3 id="logout-title">Log out?</h3>
            <p className="muted">You’ll need to sign in again to get back into the workspace.</p>
            <div className="modal-actions">
              <button type="button" className="btn secondary" onClick={() => setConfirmLogout(false)}>
                Cancel
              </button>
              <form action={logoutAction}>
                <button type="submit" className="btn danger">
                  Log out
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
