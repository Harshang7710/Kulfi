'use server';

import bcrypt from 'bcryptjs';
import { redirect } from 'next/navigation';
import { getCurrentUser, sessionPayloadFor, setSessionCookie } from '@/lib/auth';
import { getCollections, objectId } from '@/lib/db';
import { passwordSetupSchema } from '@/lib/validation';

export async function passwordSetupAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const parsed = passwordSetupSchema.safeParse({
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword')
  });
  if (!parsed.success) {
    redirect(`/password-setup?err=${encodeURIComponent(parsed.error.issues[0]?.message || 'Invalid password')}`);
  }
  if (parsed.data.password !== parsed.data.confirmPassword) {
    redirect(`/password-setup?err=${encodeURIComponent('New password and confirmation do not match')}`);
  }

  const { users } = await getCollections();
  await users.updateOne(
    { _id: objectId(user.id) },
    { $set: { passwordHash: bcrypt.hashSync(parsed.data.password, 12), mustChangePassword: false, updatedAt: new Date() } }
  );

  await setSessionCookie(sessionPayloadFor({ ...user, mustChangePassword: false }));
  redirect(user.role === 'owner' ? '/owner' : '/manager');
}
