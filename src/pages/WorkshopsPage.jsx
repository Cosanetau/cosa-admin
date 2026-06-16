import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchWorkshopsOverview } from '../utils/adminApi';

const AUTO_REFRESH_MS = 60_000;

function formatDate(value) {
  if (!value) {
    return '—';
  }

  return new Date(value).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatTime(value) {
  if (!value) {
    return '';
  }

  return new Date(value).toLocaleTimeString('en-AU', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getStatusBadgeClass(status) {
  const normalized = String(status || '').toLowerCase();

  if (['active', 'complimentary', 'trialing'].includes(normalized)) {
    return 'is-active';
  }

  if (['past_due', 'unpaid'].includes(normalized)) {
    return 'is-warning';
  }

  if (['canceled', 'suspended'].includes(normalized)) {
    return 'is-critical';
  }

  return 'is-muted';
}

function formatStatusLabel(status, billingExempt) {
  if (billingExempt) {
    return 'Complimentary';
  }

  return String(status || 'active').replaceAll('_', ' ');
}

export default function WorkshopsPage() {
  const [workshops, setWorkshops] = useState([]);
  const [stats, setStats] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);

  const loadWorkshops = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }

    setErrorMessage('');

    try {
      const result = await fetchWorkshopsOverview();
      setWorkshops(result.workshops || []);
      setStats(result.stats || null);
      setLastUpdatedAt(new Date().toISOString());
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadWorkshops();

    const intervalId = window.setInterval(() => {
      void loadWorkshops({ silent: true });
    }, AUTO_REFRESH_MS);

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        void loadWorkshops({ silent: true });
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loadWorkshops]);

  const filteredWorkshops = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    if (!search) {
      return workshops;
    }

    return workshops.filter((workshop) =>
      [
        workshop.name,
        workshop.slug,
        workshop.primaryContact,
        workshop.planKey,
        workshop.subscriptionStatus,
      ]
        .join(' ')
        .toLowerCase()
        .includes(search),
    );
  }, [searchTerm, workshops]);

  return (
    <>
      <header className="admin-page-header">
        <div>
          <p className="admin-kicker">Workshops</p>
          <h1>All workshops</h1>
          <span>
            Live workshop accounts with billing, staff, or usage. Refreshes every minute
            {lastUpdatedAt ? ` · updated ${formatTime(lastUpdatedAt)}` : ''}.
          </span>
        </div>
        <button
          className="admin-secondary-button admin-refresh-button"
          disabled={isRefreshing}
          type="button"
          onClick={() => loadWorkshops({ silent: true })}
        >
          <RefreshCw className={isRefreshing ? 'is-spinning' : ''} size={16} />
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </header>

      {errorMessage ? <div className="form-error">{errorMessage}</div> : null}

      {stats ? (
        <div className="admin-stats-grid">
          <div className="admin-stat-card">
            <span>Total workshops</span>
            <strong>{stats.totalWorkshops}</strong>
          </div>
          <div className="admin-stat-card">
            <span>Active subscriptions</span>
            <strong>{stats.activeSubscriptions}</strong>
          </div>
          <div className="admin-stat-card">
            <span>Billing issues</span>
            <strong>{stats.billingIssues}</strong>
          </div>
          <div className="admin-stat-card">
            <span>New signups (7d)</span>
            <strong>{stats.newSignups}</strong>
          </div>
          <div className="admin-stat-card">
            <span>Over user limit</span>
            <strong>{stats.overUserLimit}</strong>
          </div>
        </div>
      ) : null}

      <section className="admin-table-card">
        <div className="admin-panel" style={{ border: 'none', boxShadow: 'none' }}>
          <label>
            Search workshops
            <input
              placeholder="Name, slug, contact, plan..."
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </label>
        </div>

        {isLoading ? (
          <div className="admin-loading">Loading workshops...</div>
        ) : filteredWorkshops.length === 0 ? (
          <div className="admin-empty">No workshops match your search.</div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Workshop</th>
                  <th>Plan</th>
                  <th>Billing</th>
                  <th>Staff</th>
                  <th>Usage</th>
                  <th>Alerts</th>
                </tr>
              </thead>
              <tbody>
                {filteredWorkshops.map((workshop) => (
                  <tr key={workshop.id}>
                    <td>
                      <Link className="admin-table-link" to={`/workshops/${workshop.id}`}>
                        {workshop.name}
                      </Link>
                      <div style={{ color: '#6b7280', fontSize: '0.84rem', marginTop: 4 }}>
                        {workshop.primaryContact || 'No contact'} · joined {formatDate(workshop.createdAt)}
                      </div>
                    </td>
                    <td>{workshop.planKey || '—'}</td>
                    <td>
                      <span
                        className={`admin-badge ${getStatusBadgeClass(
                          workshop.billingExempt ? 'complimentary' : workshop.subscriptionStatus,
                        )}`}
                      >
                        {formatStatusLabel(workshop.subscriptionStatus, workshop.billingExempt)}
                      </span>
                    </td>
                    <td>
                      {workshop.staff.billableCount}/{workshop.staff.userLimit}
                      <div style={{ color: '#6b7280', fontSize: '0.84rem', marginTop: 4 }}>
                        {workshop.staff.technicianCount} technicians
                      </div>
                    </td>
                    <td>
                      {workshop.usage.customers} customers
                      <div style={{ color: '#6b7280', fontSize: '0.84rem', marginTop: 4 }}>
                        {workshop.usage.bookings} bookings · {workshop.usage.invoices} invoices
                      </div>
                    </td>
                    <td>
                      {workshop.alerts.length ? (
                        <div className="admin-alert-list">
                          {workshop.alerts.map((alert) => (
                            <span
                              className={`admin-badge ${
                                alert.level === 'critical'
                                  ? 'is-critical'
                                  : alert.level === 'warning'
                                    ? 'is-warning'
                                    : 'is-muted'
                              }`}
                              key={`${workshop.id}-${alert.type}-${alert.message}`}
                            >
                              {alert.message}
                            </span>
                          ))}
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
