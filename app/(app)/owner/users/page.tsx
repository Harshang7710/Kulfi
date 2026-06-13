import PageHeader from '@/components/PageHeader';
import { getCollections } from '@/lib/db';
import { mapDoc } from '@/lib/helpers';
import { createUserAction, toggleUserAction } from './actions';

export default async function OwnerUsersPage() {
  const { users } = await getCollections();
  const rows = (await users.find({}, { projection: { passwordHash: 0 } }).sort({ createdAt: -1 }).toArray()).map((r) =>
    mapDoc(r)
  );

  return (
    <>
      <PageHeader title="User Management" />

      <article className="card">
        <h2>Create user</h2>
        <form action={createUserAction} className="form-grid">
          <label>
            Unique User ID
            <input name="userId" required placeholder="Numeric or staff code" />
          </label>
          <label>
            Name
            <input name="name" required />
          </label>
          <label>
            Email
            <input name="email" type="email" required />
          </label>
          <label>
            Role
            <select name="role">
              <option value="manager">Cart Manager</option>
              <option value="owner">Owner</option>
            </select>
          </label>
          <label>
            Temporary password
            <input name="password" type="password" minLength={8} required />
          </label>
          <button className="primary">Create user</button>
        </form>
      </article>

      <article className="card">
        <h2>Users</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>User ID</th>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Password setup</th>
                <th>Active</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.userId || '—'}</td>
                  <td>{r.name}</td>
                  <td>{r.email}</td>
                  <td>{r.role}</td>
                  <td>
                    <span className={`badge ${r.mustChangePassword ? 'warn' : 'ok'}`}>
                      {r.mustChangePassword ? 'Required' : 'Complete'}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${r.active ? 'ok' : 'danger'}`}>{r.active ? 'Active' : 'Inactive'}</span>
                  </td>
                  <td>
                    <form className="actions" action={toggleUserAction.bind(null, r.id)}>
                      <button className="btn secondary">Activate/deactivate</button>
                    </form>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={7} className="empty">
                    No users yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>
    </>
  );
}
