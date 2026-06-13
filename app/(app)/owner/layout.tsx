import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.role !== 'owner') redirect('/manager');
  return <>{children}</>;
}
