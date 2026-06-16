import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchPendingSignups } from '../utils/adminApi';

const FILTERS = [
  { value: 'pending', label: 'Abandoned' },
  { value: 'all', label: 'All' },
  { value: 'completed', label: 'Completed' },
];

function formatDateTime(value) {
  if (!value) {
    return '—';
  }

  return new Date(value).toLocaleString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatPlanLabel(signup) {
  const parts = [signup.planKey, signup.billingCycle].filter(Boolean);
  return parts.join(' · ') || '—';
}

export default function SignupsPage() {
  const [signups, setSignups] = useState([]);
  const [stats, setStats] = useState(null);
  const [filter, setFilter] = useState('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadSignups = useCallback(async ({ silent = false, nextFilter = filter } = {}) => {
    if (!silent) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }

    setErrorMessage('');

    try {
      const result = await fetchPendingSignups(nextFilter);
      setSignups(result.signups || []);
      setStats(result.stats || null);
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [filter]);

  useEffect(() => {
    void loadSignups({ nextFilter: filter });
  }, [filter, loadSignups]);

  const filteredSignups = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    if (!search) {
      return signups;
    }

    return signups.filter((signup) =>
      [
        signup.businessName,
        signup.firstName,
        signup.lastName,
        signup.email,
        signup.planKey,
      ]
        .join(' ')
        .toLowerCase()
        .includes(search),
    );
  }, [searchTerm, signups]);

  return (
    <>
      <header className="admin-page-header">
        <div>
          <p className="admin-kicker">Sales follow-up</p>
          <h1>Pending signups</h1>
          <span>
            People who started checkout on cosa.net.au but did not finish onboarding.
          </span>
        </div>
        <button
          className="admin-secondary-button admin-refresh-button"
          disabled={isRefreshing}
          type="button"
          onClick={() => loadSignups({ silent: true })}
        >
          <RefreshCw className={isRefreshing ? 'is-spinning' : ''} size={16} />
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </header>

      {errorMessage ? <div className="form-error">{errorMessage}</div> : null}

      {stats ? (
        <div className="admin-stats-grid">
          <div className="admin-stat-card">
            <span>Showing</span>
            <strong>{stats.total}</strong>
          </div>
          <div className="admin-stat-card">
            <span>Still pending</span>
            <strong>{stats.pending}</strong>
          </div>
          <div className="admin-stat-card">
            <span>Abandoned (24h)</span>
            <strong>{stats.last24Hours}</strong>
          </div>
        </div>
      ) : null}

      <section className="admin-table-card">
        <div className="admin-panel" style={{ border: 'none', boxShadow: 'none' }}>
          <div className="admin-filter-row">
            {FILTERS.map((option) => (
              <button
                className={`admin-filter-button${filter === option.value ? ' is-active' : ''}`}
                key={option.value}
                type="button"
                onClick={() => setFilter(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <label style={{ marginTop: 16 }}>
            Search signups
            <input
              placeholder="Business, name, email, plan..."
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </label>
        </div>

        {isLoading ? (
          <div className="admin-loading">Loading signups...</div>
        ) : filteredSignups.length === 0 ? (
          <div className="admin-empty">No signups match this view.</div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Contact</th>
                  <th>Business</th>
                  <th>Plan</th>
                  <th>Status</th>
                  <th>Started</th>
                </tr>
              </thead>
              <tbody>
                {filteredSignups.map((signup) => (
                  <tr key={signup.id}>
                    <td>
                      <strong>
                        {[signup.firstName, signup.lastName].filter(Boolean).join(' ') || '—'}
                      </strong>
                      <div style={{ color: '#6b7280', fontSize: '0.84rem', marginTop: 4 }}>
                        {signup.email || 'No email'}
                      </div>
                    </td>
                    <td>{signup.businessName || '—'}</td>
                    <td>
                      {formatPlanLabel(signup)}
                      {signup.userLimit ? (
                        <div style={{ color: '#6b7280', fontSize: '0.84rem', marginTop: 4 }}>
                          {signup.userLimit} users
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <span
                        className={`admin-badge ${
                          signup.status === 'pending' ? 'is-warning' : 'is-active'
                        }`}
                      >
                        {signup.status}
                      </span>
                    </td>
                    <td>{formatDateTime(signup.createdAt)}</td>
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
