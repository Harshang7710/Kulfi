import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import Sidebar from '@/components/Sidebar';
import { logoutAction } from './logout/actions';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.mustChangePassword) redirect('/password-setup');

  return (
    <div className="app">
      <Sidebar role={user.role} logoutAction={logoutAction} />
      <main className="content" id="main">
        {children}
      </main>
    </div>
  );
}
