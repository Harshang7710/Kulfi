'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import bcrypt from 'bcryptjs';
import { getCurrentUser } from '@/lib/auth';
import { getCollections, objectId } from '@/lib/db';
import { userSchema } from '@/lib/validation';
import type { UserDoc } from '@/lib/types';

export async function createUserAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'owner') redirect('/login');

  const parsed = userSchema.safeParse({
    userId: formData.get('userId'),
    name: formData.get('name'),
    email: formData.get('email'),
    role: formData.get('role'),
    password: formData.get('password')
  });
  if (!parsed.success) {
    redirect(`/owner/users?err=${encodeURIComponent(parsed.error.issues[0]?.message || 'Invalid user data')}`);
  }
  const data = parsed.data;

  try {
    const { users } = await getCollections();
    const now = new Date();
    await users.insertOne({
      userId: data.userId,
      name: data.name,
      email: data.email,
      role: data.role,
      passwordHash: bcrypt.hashSync(data.password, 12),
      mustChangePassword: true,
      active: true,
      createdAt: now,
      updatedAt: now
    } as UserDoc);
  } catch (e) {
    const error = e as Error & { code?: number };
    const message = error.code === 11000 ? 'Duplicate email or user ID not allowed' : error.message;
    redirect(`/owner/users?err=${encodeURIComponent(message)}`);
  }

  revalidatePath('/owner/users');
  redirect('/owner/users?ok=User%20created%20successfully');
}

export async function toggleUserAction(userId: string) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'owner') redirect('/login');

  const { users } = await getCollections();
  const target = await users.findOne({ _id: objectId(userId) });
  if (!target) redirect('/owner/users?err=User%20not%20found');

  await users.updateOne({ _id: target._id }, { $set: { active: !target.active, updatedAt: new Date() } });

  revalidatePath('/owner/users');
  redirect('/owner/users?ok=User%20updated');
}
