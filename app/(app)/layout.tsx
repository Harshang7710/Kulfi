import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import TopNav from '@/components/TopNav';
import { logoutAction } from './logout/actions';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.mustChangePassword) redirect('/password-setup');

  return (
    <div className="app">
      <TopNav
        user={{ name: user.name, email: user.email, role: user.role, userId: user.userId }}
        logoutAction={logoutAction}
      />
      <main className="content" id="main">
        {children}
      </main>
    </div>
  );
}
