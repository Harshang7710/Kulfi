import { redirect } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import { getCurrentUser } from '@/lib/auth';
import { money } from '@/lib/format';
import { todaySummary } from '@/lib/helpers';

export default async function ManagerHomePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const s = await todaySummary(user.id);

  return (
    <>
      <PageHeader title="Manager Home" />

      <section className="grid stats">
        <article className="card stat">
          <span>Today’s pieces sold</span>
          <span className="stat-value">{s.pieces}</span>
        </article>
        <article className="card stat">
          <span>Today’s sales amount</span>
          <span className="stat-value">₹{money(s.total)}</span>
        </article>
        <article className="card stat">
          <span>Cash amount</span>
          <span className="stat-value">₹{money(s.cash)}</span>
        </article>
        <article className="card stat">
          <span>Online amount</span>
          <span className="stat-value">₹{money(s.online)}</span>
        </article>
      </section>
    </>
  );
}
