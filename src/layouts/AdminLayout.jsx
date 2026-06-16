import { LayoutDashboard, LogOut } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';

export default function AdminLayout() {
  const { adminUser, logout } = useAuth();

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <span className="admin-brand-main">COSA</span>
          <span className="admin-brand-sub">ADMIN</span>
        </div>

        <nav className="admin-nav">
          <NavLink
            className={({ isActive }) => `admin-nav-link${isActive ? ' is-active' : ''}`}
            end
            to="/"
          >
            <LayoutDashboard size={18} />
            Workshops
          </NavLink>
        </nav>

        <div className="admin-sidebar-foot">
          <div>{adminUser?.email || 'COSA team'}</div>
          <button type="button" onClick={() => logout()}>
            <LogOut size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
            Sign out
          </button>
        </div>
      </aside>

      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}
