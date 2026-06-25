import {
  CalendarDays,
  Gift,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  UserPlus,
} from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';

const NAV_ITEMS = [
  { to: '/', end: true, label: 'Workshops', icon: LayoutDashboard },
  { to: '/signups', label: 'Signups', icon: UserPlus },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/tickets', label: 'Tickets', icon: LifeBuoy },
  { to: '/free-months', label: 'Grants', icon: Gift },
];

function getMobileTitle(pathname) {
  if (pathname === '/') {
    return 'Workshops';
  }

  if (pathname.startsWith('/signups')) {
    return 'Signups';
  }

  if (pathname.startsWith('/calendar')) {
    return 'Calendar';
  }

  if (pathname.startsWith('/free-months')) {
    return 'Free months';
  }

  if (pathname.startsWith('/tickets/')) {
    return 'Ticket';
  }

  if (pathname.startsWith('/tickets')) {
    return 'Tickets';
  }

  if (pathname.startsWith('/workshops/')) {
    return 'Workshop';
  }

  return 'COSA Admin';
}

export default function AdminLayout() {
  const { adminUser, logout } = useAuth();
  const location = useLocation();
  const mobileTitle = getMobileTitle(location.pathname);

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar admin-sidebar-desktop">
        <div className="admin-brand">
          <span className="admin-brand-main">COSA</span>
          <span className="admin-brand-sub">ADMIN</span>
        </div>

        <nav className="admin-nav">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                className={({ isActive }) => `admin-nav-link${isActive ? ' is-active' : ''}`}
                end={item.end}
                key={item.to}
                to={item.to}
              >
                <Icon size={18} />
                {item.label === 'Grants' ? 'Free months' : item.label}
              </NavLink>
            );
          })}
        </nav>

        <div className="admin-sidebar-foot">
          <div>{adminUser?.email || 'COSA team'}</div>
          <button type="button" onClick={() => logout()}>
            <LogOut size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
            Sign out
          </button>
        </div>
      </aside>

      <div className="admin-content-column">
        <header className="admin-mobile-header">
          <div className="admin-mobile-brand">
            <span className="admin-mobile-brand-main">COSA</span>
            <span className="admin-mobile-title">{mobileTitle}</span>
          </div>
          <button
            aria-label="Sign out"
            className="admin-mobile-signout"
            type="button"
            onClick={() => logout()}
          >
            <LogOut size={18} />
          </button>
        </header>

        <main className="admin-main">
          <Outlet />
        </main>
      </div>

      <nav aria-label="Admin navigation" className="admin-bottom-nav">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              className={({ isActive }) =>
                `admin-bottom-nav-link${isActive ? ' is-active' : ''}`
              }
              end={item.end}
              key={item.to}
              to={item.to}
            >
              <Icon size={20} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
