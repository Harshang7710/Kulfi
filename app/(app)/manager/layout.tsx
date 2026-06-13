import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';

export default async function ManagerLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.role !== 'manager') redirect('/owner');
  return <>{children}</>;
}
