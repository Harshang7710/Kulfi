import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getCurrentUser } from '@/lib/auth';
import { loginAction } from './actions';

export const metadata: Metadata = {
  title: 'Login'
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const user = await getCurrentUser();
  if (user) redirect(user.role === 'owner' ? '/owner' : '/manager');

  const { err } = await searchParams;

  return (
    <div className="login-page" id="main">
      <section className="login-card">
        <img className="login-logo" src="/logo.svg" alt="Desi Mastaani Matka Kulfi logo" />
        <h1>Desi Mastaani Matka Kulfi</h1>
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
          <button className="btn primary" type="submit">
            Login
          </button>
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
