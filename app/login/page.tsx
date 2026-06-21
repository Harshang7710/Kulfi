import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getCurrentUser } from '@/lib/auth';
import SubmitButton from '@/components/SubmitButton';
import { loginAction } from './actions';

export const metadata: Metadata = {
  title: 'Login'
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const user = await getCurrentUser();
  if (user) redirect(user.role === 'owner' ? '/owner' : '/manager');

  const { err } = await searchParams;

  const highlights: [string, string][] = [
    ['Fast POS billing', 'Multi-draft counter with instant cart and split payments'],
    ['Live inventory', 'Two-fridge stock tracking with low-stock alerts'],
    ['Owner reports', 'Daily sales, profit and manager performance at a glance']
  ];

  return (
    <div className="login-page login-split" id="main">
      <aside className="login-hero" aria-hidden="true">
        <div className="login-hero-inner">
          <img className="login-hero-logo" src="/logo.svg" alt="" />
          <p className="eyebrow">Franchise Management Suite</p>
          <h2 className="login-hero-title">Run your kulfi counter like a pro.</h2>
          <ul className="login-hero-list">
            {highlights.map(([title, desc]) => (
              <li key={title}>
                <span className="login-hero-check">✓</span>
                <span>
                  <strong>{title}</strong>
                  <small>{desc}</small>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
      <section className="login-card">
        <img className="login-logo" src="/logo.svg" alt="Desi Mastaani Matka Kulfi logo" />
        <h1>Welcome back</h1>
        <p className="eyebrow">Desi Mastaani Matka Kulfi</p>
        {err && (
          <div className="notice error" role="alert">
            {err}
          </div>
        )}
        <form action={loginAction} className="stack">
          <label>
            User ID or Email
            <input name="identifier" required placeholder="User ID or Email" />
          </label>
          <label>
            Password
            <input name="password" type="password" required placeholder="••••••••" />
          </label>
          <SubmitButton pendingText="Logging in…">Login</SubmitButton>
        </form>
        {process.env.NODE_ENV !== 'production' && (
          <div className="demo">
            <span>Seed users</span>
            <span>Owner: ID 1001 / owner@desimastaani.test / password123</span>
            <span>Manager: ID 2001 / manager@desimastaani.test / password123</span>
          </div>
        )}
      </section>
    </div>
  );
}
