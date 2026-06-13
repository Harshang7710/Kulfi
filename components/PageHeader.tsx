import { Suspense } from 'react';
import { getCurrentUser } from '@/lib/auth';
import Notice from './Notice';

export default async function PageHeader({ title }: { title: string }) {
  const user = await getCurrentUser();

  return (
    <>
      <header className="top">
        <div>
          <p className="eyebrow">{user?.role === 'owner' ? 'Owner Control Center' : 'Manager Workspace'}</p>
          <h1>{title}</h1>
        </div>
        <div className="userpill">
          {user?.name}
          {user?.userId ? ` · ID ${user.userId}` : ''}
        </div>
      </header>
      <Suspense fallback={null}>
        <Notice />
      </Suspense>
    </>
  );
}
