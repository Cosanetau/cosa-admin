import { Gift } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  applyBillingGrant,
  fetchBillingGrantHistory,
  fetchWorkshopsOverview,
} from '../utils/adminApi';

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

function canGrantFreeMonths(workshop) {
  return Boolean(
    workshop &&
      !workshop.billingExempt &&
      workshop.stripeSubscriptionId &&
      !['complimentary'].includes(String(workshop.subscriptionStatus || '').toLowerCase()),
  );
}

export default function FreeMonthsPage() {
  const [searchParams] = useSearchParams();
  const [workshops, setWorkshops] = useState([]);
  const [recentGrants, setRecentGrants] = useState([]);
  const [tableReady, setTableReady] = useState(true);
  const [selectedWorkshopId, setSelectedWorkshopId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [grantMonths, setGrantMonths] = useState('1');
  const [grantReason, setGrantReason] = useState('');
  const [grantTicketId, setGrantTicketId] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);

  const loadPage = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');

    try {
      const [workshopsResult, grantsResult] = await Promise.all([
        fetchWorkshopsOverview(),
        fetchBillingGrantHistory(),
      ]);

      setWorkshops(workshopsResult.workshops || []);
      setRecentGrants(grantsResult.grants || []);
      setTableReady(grantsResult.tableReady !== false);
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  useEffect(() => {
    const workshopId = searchParams.get('workshopId') || '';
    const ticketId = searchParams.get('ticketId') || '';

    if (workshopId) {
      setSelectedWorkshopId(workshopId);
    }

    if (ticketId) {
      setGrantTicketId(ticketId);
    }
  }, [searchParams]);

  const filteredWorkshops = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    if (!search) {
      return workshops;
    }

    return workshops.filter((workshop) =>
      [workshop.name, workshop.slug, workshop.primaryContact, workshop.planKey]
        .join(' ')
        .toLowerCase()
        .includes(search),
    );
  }, [searchTerm, workshops]);

  const selectedWorkshop = useMemo(
    () => workshops.find((workshop) => workshop.id === selectedWorkshopId) || null,
    [selectedWorkshopId, workshops],
  );

  async function handleApplyGrant(event) {
    event.preventDefault();

    if (isBusy || !selectedWorkshopId || !grantReason.trim()) {
      return;
    }

    setIsBusy(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const result = await applyBillingGrant(selectedWorkshopId, {
        months: Number(grantMonths),
        reason: grantReason,
        supportTicketId: grantTicketId,
      });

      setRecentGrants((current) => [
        {
          ...result.grant,
          workshopName: selectedWorkshop?.name || 'Workshop',
        },
        ...current,
      ]);
      setGrantReason('');
      setGrantTicketId('');
      setSuccessMessage(
        `Granted ${result.grant.months} free month(s) to ${selectedWorkshop?.name || 'workshop'}.`,
      );
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <>
      <header className="admin-page-header">
        <div>
          <p className="admin-kicker">Billing comps</p>
          <h1>Free months</h1>
          <span>
            Apply 1–3 free months on a workshop Stripe subscription. Requires Stripe coupons
            COSA_FREE_1MO, COSA_FREE_2MO, and COSA_FREE_3MO.
          </span>
        </div>
      </header>

      {!tableReady ? (
        <div className="admin-panel admin-setup-note">
          <strong>Billing grants table not set up</strong>
          <p>
            Run <code>supabase/add-admin-features.sql</code> in Supabase before granting free months.
          </p>
        </div>
      ) : null}

      {successMessage ? <div className="admin-success-banner">{successMessage}</div> : null}
      {errorMessage ? <div className="form-error">{errorMessage}</div> : null}

      <div className="admin-free-months-layout">
        <section className="admin-panel">
          <h2>Select workshop</h2>
          <label>
            Search
            <input
              placeholder="Workshop name, slug, contact..."
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </label>

          {isLoading ? (
            <div className="admin-loading">Loading workshops...</div>
          ) : (
            <div className="admin-workshop-picker">
              {filteredWorkshops.length === 0 ? (
                <div className="admin-empty">No workshops match your search.</div>
              ) : (
                filteredWorkshops.map((workshop) => (
                  <button
                    className={`admin-workshop-picker-item${
                      selectedWorkshopId === workshop.id ? ' is-selected' : ''
                    }`}
                    key={workshop.id}
                    type="button"
                    onClick={() => setSelectedWorkshopId(workshop.id)}
                  >
                    <strong>{workshop.name}</strong>
                    <span>{workshop.primaryContact || 'No contact'}</span>
                    <span>
                      {workshop.planKey || 'No plan'}
                      {workshop.billingExempt ? ' · Complimentary' : ''}
                      {!workshop.stripeSubscriptionId ? ' · No Stripe sub' : ''}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </section>

        <section className="admin-panel">
          <h2>Grant free months</h2>

          {!selectedWorkshop ? (
            <div className="admin-empty">Select a workshop on the left to grant free months.</div>
          ) : (
            <>
              <div className="admin-chip-row" style={{ marginBottom: 16 }}>
                <Link className="admin-table-link" to={`/workshops/${selectedWorkshop.id}`}>
                  {selectedWorkshop.name}
                </Link>
                {canGrantFreeMonths(selectedWorkshop) ? (
                  <span className="admin-badge is-active">Stripe subscription linked</span>
                ) : (
                  <span className="admin-badge is-warning">Cannot grant on this account</span>
                )}
              </div>

              {canGrantFreeMonths(selectedWorkshop) ? (
                <form className="admin-form-block" onSubmit={handleApplyGrant}>
                  <label>
                    Free months
                    <select
                      value={grantMonths}
                      onChange={(event) => setGrantMonths(event.target.value)}
                    >
                      <option value="1">1 month</option>
                      <option value="2">2 months</option>
                      <option value="3">3 months</option>
                    </select>
                  </label>
                  <label>
                    Reason
                    <textarea
                      placeholder="Goodwill comp, onboarding issue, support resolution..."
                      required
                      rows={4}
                      value={grantReason}
                      onChange={(event) => setGrantReason(event.target.value)}
                    />
                  </label>
                  <label>
                    Linked ticket ID (optional)
                    <input
                      placeholder="Support ticket UUID"
                      type="text"
                      value={grantTicketId}
                      onChange={(event) => setGrantTicketId(event.target.value)}
                    />
                  </label>
                  <button className="admin-primary-button" disabled={isBusy || !grantReason.trim()} type="submit">
                    <Gift size={16} style={{ marginRight: 6, verticalAlign: -2 }} />
                    {isBusy ? 'Applying grant...' : 'Grant free months'}
                  </button>
                </form>
              ) : (
                <p className="admin-form-hint">
                  Free months can only be applied to workshops with an active Stripe subscription
                  that are not already complimentary or billing exempt.
                </p>
              )}
            </>
          )}
        </section>
      </div>

      <section className="admin-table-card" style={{ marginTop: 16 }}>
        <div className="admin-panel" style={{ border: 'none', boxShadow: 'none' }}>
          <h2>Recent grants</h2>
        </div>

        {recentGrants.length === 0 ? (
          <div className="admin-empty">No billing grants recorded yet.</div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Workshop</th>
                  <th>Months</th>
                  <th>Reason</th>
                  <th>Granted</th>
                  <th>Until</th>
                  <th>Ticket</th>
                </tr>
              </thead>
              <tbody>
                {recentGrants.map((grant) => (
                  <tr key={grant.id}>
                    <td>
                      <Link className="admin-table-link" to={`/workshops/${grant.workshopId}`}>
                        {grant.workshopName || 'Workshop'}
                      </Link>
                    </td>
                    <td>{grant.months}</td>
                    <td>{grant.reason}</td>
                    <td>
                      {formatDateTime(grant.grantedAt)}
                      <div style={{ color: '#6b7280', fontSize: '0.84rem', marginTop: 4 }}>
                        {grant.grantedByEmail || '—'}
                      </div>
                    </td>
                    <td>{formatDateTime(grant.effectiveUntil)}</td>
                    <td>
                      {grant.supportTicketId ? (
                        <Link className="admin-table-link" to={`/tickets/${grant.supportTicketId}`}>
                          View
                        </Link>
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
