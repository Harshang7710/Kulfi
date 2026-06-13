'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { login, sessionPayloadFor, setSessionCookie } from '@/lib/auth';
import { checkLoginRateLimit } from '@/lib/security';
import { loginSchema } from '@/lib/validation';

export async function loginAction(formData: FormData) {
  const ip = (await headers()).get('x-forwarded-for') || 'unknown';
  if (!checkLoginRateLimit(ip)) {
    redirect(`/login?err=${encodeURIComponent('Too many login attempts. Please wait a few minutes and try again.')}`);
  }

  const parsed = loginSchema.safeParse({
    identifier: formData.get('identifier'),
    password: formData.get('password')
  });
  if (!parsed.success) {
    redirect(`/login?err=${encodeURIComponent('Invalid user ID/email or password')}`);
  }

  const user = await login(parsed.data.identifier, parsed.data.password);
  if (!user) {
    redirect(`/login?err=${encodeURIComponent('Invalid user ID/email or password')}`);
  }

  await setSessionCookie(sessionPayloadFor(user));

  if (user.mustChangePassword) redirect('/password-setup');
  redirect(user.role === 'owner' ? '/owner' : '/manager');
}
