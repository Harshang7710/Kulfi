import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getCurrentUser } from '@/lib/auth';
import SubmitButton from '@/components/SubmitButton';
import PasswordField from '@/components/PasswordField';
import { passwordSetupAction } from './actions';

export const metadata: Metadata = {
  title: 'Set New Password'
};

export default async function PasswordSetupPage({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const { err } = await searchParams;

  return (
    <div className="login-page" id="main">
      <section className="login-card">
        <img className="login-logo" src="/logo.svg" alt="Desi Mastaani Matka Kulfi logo" />
        <p className="eyebrow">First login security</p>
        <h1>Set your new password</h1>
        <p className="muted">Please replace the temporary password before opening your workspace.</p>
        {err && (
          <div className="notice error" role="alert">
            {err}
          </div>
        )}
        <form action={passwordSetupAction} className="stack">
          <label>
            New password
            <PasswordField name="password" minLength={8} required placeholder="At least 8 characters" />
          </label>
          <label>
            Confirm password
            <PasswordField name="confirmPassword" minLength={8} required placeholder="Repeat new password" />
          </label>
          <SubmitButton pendingText="Saving…">Save password</SubmitButton>
        </form>
      </section>
    </div>
  );
}
