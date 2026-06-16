import { ArrowLeft, ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  addWorkshopNote,
  applyBillingGrant,
  fetchWorkshopDetail,
} from '../utils/adminApi';

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

function DetailItem({ label, value }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value || '—'}</dd>
    </div>
  );
}

export default function WorkshopDetailPage() {
  const { workshopId } = useParams();
  const [workshop, setWorkshop] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [billingGrants, setBillingGrants] = useState([]);
  const [adminNotes, setAdminNotes] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [grantMonths, setGrantMonths] = useState('1');
  const [grantReason, setGrantReason] = useState('');
  const [grantTicketId, setGrantTicketId] = useState('');
  const [noteBody, setNoteBody] = useState('');

  async function loadWorkshop() {
    const result = await fetchWorkshopDetail(workshopId);
    setWorkshop(result.workshop || null);
    setTickets(result.tickets || []);
    setBillingGrants(result.billingGrants || []);
    setAdminNotes(result.adminNotes || []);
  }

  useEffect(() => {
    if (!workshopId) {
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    loadWorkshop()
      .catch((error) => {
        setErrorMessage(error.message);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [workshopId]);

  async function handleApplyGrant(event) {
    event.preventDefault();

    if (isBusy || !workshopId) {
      return;
    }

    setIsBusy(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const result = await applyBillingGrant(workshopId, {
        months: Number(grantMonths),
        reason: grantReason,
        supportTicketId: grantTicketId,
      });
      setBillingGrants((current) => [result.grant, ...current]);
      setGrantReason('');
      setGrantTicketId('');
      setSuccessMessage(`Granted ${result.grant.months} free month(s) via Stripe.`);
      await loadWorkshop();
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsBusy(false);
    }
  }

  async function handleAddNote(event) {
    event.preventDefault();

    if (isBusy || !workshopId || !noteBody.trim()) {
      return;
    }

    setIsBusy(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const result = await addWorkshopNote(workshopId, noteBody);
      setAdminNotes((current) => [result.note, ...current]);
      setNoteBody('');
      setSuccessMessage('Internal note added.');
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsBusy(false);
    }
  }

  if (isLoading) {
    return <div className="admin-loading">Loading workshop...</div>;
  }

  if (errorMessage) {
    return <div className="form-error">{errorMessage}</div>;
  }

  if (!workshop) {
    return <div className="admin-empty">Workshop not found.</div>;
  }

  const integrationEntries = [
    ['Xero', workshop.integrations.xero],
    ['QuickBooks', workshop.integrations.quickbooks],
    ['Podium', workshop.integrations.podium],
    ['GoHighLevel', workshop.integrations.gohighlevel],
  ];

  return (
    <>
      <header className="admin-page-header">
        <div>
          <Link className="admin-link-button" to="/">
            <ArrowLeft size={16} />
            Back to workshops
          </Link>
          <p className="admin-kicker">Workshop detail</p>
          <h1>{workshop.name}</h1>
          <span>{workshop.slug || workshop.id}</span>
        </div>
      </header>

      {successMessage ? <div className="admin-success-banner">{successMessage}</div> : null}
      {errorMessage ? <div className="form-error">{errorMessage}</div> : null}

      {workshop.alerts.length ? (
        <div className="admin-panel">
          <h2>Alerts</h2>
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
                key={`${alert.type}-${alert.message}`}
              >
                {alert.message}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="admin-detail-grid">
        <section className="admin-panel">
          <h2>Account</h2>
          <dl>
            <DetailItem label="Signup date" value={formatDate(workshop.createdAt)} />
            <DetailItem label="Last seen" value={formatDateTime(workshop.lastSeenAt)} />
            <DetailItem label="Plan" value={workshop.planKey} />
            <DetailItem
              label="Subscription"
              value={
                workshop.billingExempt
                  ? 'Complimentary (billing exempt)'
                  : workshop.subscriptionStatus
              }
            />
            <DetailItem label="Primary contact" value={workshop.primaryContact} />
            <DetailItem
              label="Main controllers"
              value={workshop.staff.mainControllerEmails.join(', ')}
            />
          </dl>
        </section>

        <section className="admin-panel">
          <h2>Business</h2>
          <dl>
            <DetailItem label="Business name" value={workshop.business.name} />
            <DetailItem label="ABN" value={workshop.business.abn} />
            <DetailItem label="Phone" value={workshop.business.phone} />
            <DetailItem label="Email" value={workshop.business.email} />
            <DetailItem label="Address" value={workshop.business.address} />
          </dl>
        </section>

        <section className="admin-panel">
          <h2>Staff</h2>
          <dl>
            <DetailItem
              label="Billable staff"
              value={`${workshop.staff.billableCount} / ${workshop.staff.userLimit}`}
            />
            <DetailItem label="Technicians" value={String(workshop.staff.technicianCount)} />
          </dl>
        </section>

        <section className="admin-panel">
          <h2>Usage</h2>
          <dl>
            <DetailItem label="Customers" value={String(workshop.usage.customers)} />
            <DetailItem label="Bookings" value={String(workshop.usage.bookings)} />
            <DetailItem label="Invoices" value={String(workshop.usage.invoices)} />
            <DetailItem label="Vehicles" value={String(workshop.usage.vehicles)} />
          </dl>
        </section>

        <section className="admin-panel">
          <h2>Billing</h2>
          <dl>
            <DetailItem label="Next payment" value={formatDateTime(workshop.billing?.nextPaymentAt)} />
            <DetailItem label="Billing cycle" value={workshop.billing?.billingCycle} />
            <DetailItem label="Stripe status" value={workshop.billing?.stripeStatus} />
            {workshop.billing?.stripeError ? (
              <DetailItem label="Stripe error" value={workshop.billing.stripeError} />
            ) : null}
          </dl>
          <div className="admin-chip-row" style={{ marginTop: 16 }}>
            {workshop.billing?.stripeDashboardCustomerUrl ? (
              <a
                className="admin-link-button"
                href={workshop.billing.stripeDashboardCustomerUrl}
                rel="noreferrer"
                target="_blank"
              >
                Stripe customer
                <ExternalLink size={14} />
              </a>
            ) : null}
            {workshop.billing?.stripeDashboardSubscriptionUrl ? (
              <a
                className="admin-link-button"
                href={workshop.billing.stripeDashboardSubscriptionUrl}
                rel="noreferrer"
                target="_blank"
              >
                Stripe subscription
                <ExternalLink size={14} />
              </a>
            ) : null}
          </div>
        </section>

        <section className="admin-panel">
          <h2>Integrations</h2>
          <div className="admin-chip-row">
            {integrationEntries.map(([label, connected]) => (
              <span className={`admin-chip ${connected ? 'is-on' : 'is-off'}`} key={label}>
                {label}: {connected ? 'Connected' : 'Not connected'}
              </span>
            ))}
          </div>
        </section>
      </div>

      <section className="admin-panel" style={{ marginTop: 16 }}>
        <h2>Internal notes</h2>
        {adminNotes.length === 0 ? (
          <p className="admin-empty" style={{ padding: '12px 0' }}>
            No internal notes yet.
          </p>
        ) : (
          <div className="admin-message-list">
            {adminNotes.map((note) => (
              <article className="admin-message is-internal" key={note.id}>
                <header>
                  <strong>{note.authorEmail || 'COSA team'}</strong>
                  <span>{formatDateTime(note.createdAt)}</span>
                </header>
                <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{note.body}</p>
              </article>
            ))}
          </div>
        )}

        <form className="admin-form-block" onSubmit={handleAddNote}>
          <label>
            Add note
            <textarea
              placeholder="Spoke to owner Tuesday, onboarding call booked..."
              rows={3}
              value={noteBody}
              onChange={(event) => setNoteBody(event.target.value)}
            />
          </label>
          <button disabled={isBusy || !noteBody.trim()} type="submit">
            {isBusy ? 'Saving...' : 'Add note'}
          </button>
        </form>
      </section>

      <section className="admin-panel" style={{ marginTop: 16 }}>
        <h2>Billing grants</h2>
        <p style={{ color: '#6b7280', marginTop: 0 }}>
          Apply 1–3 free months via Stripe coupon. Recorded in the audit log below.
        </p>

        {billingGrants.length ? (
          <div className="admin-table-wrap" style={{ marginBottom: 20 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Months</th>
                  <th>Reason</th>
                  <th>Granted</th>
                  <th>Until</th>
                  <th>Ticket</th>
                </tr>
              </thead>
              <tbody>
                {billingGrants.map((grant) => (
                  <tr key={grant.id}>
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
                          View ticket
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
        ) : (
          <p className="admin-empty" style={{ padding: '12px 0' }}>
            No billing grants recorded yet.
          </p>
        )}

        {!workshop.billingExempt && workshop.stripeSubscriptionId ? (
          <form className="admin-form-block" onSubmit={handleApplyGrant}>
            <label>
              Free months
              <select value={grantMonths} onChange={(event) => setGrantMonths(event.target.value)}>
                <option value="1">1 month</option>
                <option value="2">2 months</option>
                <option value="3">3 months</option>
              </select>
            </label>
            <label>
              Reason
              <textarea
                placeholder="Goodwill comp, onboarding issue, etc."
                rows={3}
                value={grantReason}
                onChange={(event) => setGrantReason(event.target.value)}
              />
            </label>
            <label>
              Linked ticket (optional)
              <input
                placeholder="Ticket UUID"
                type="text"
                value={grantTicketId}
                onChange={(event) => setGrantTicketId(event.target.value)}
              />
            </label>
            <button disabled={isBusy || !grantReason.trim()} type="submit">
              {isBusy ? 'Applying grant...' : 'Grant free months'}
            </button>
          </form>
        ) : (
          <p className="admin-empty" style={{ padding: '12px 0' }}>
            Billing grants require an active Stripe subscription and non-complimentary billing.
          </p>
        )}
      </section>

      <section className="admin-table-card" style={{ marginTop: 16 }}>
        <div className="admin-panel">
          <h2>Support tickets ({tickets.length})</h2>
        </div>
        {tickets.length === 0 ? (
          <div className="admin-empty">No support tickets for this workshop.</div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Status</th>
                  <th>Category</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => (
                  <tr key={ticket.id}>
                    <td>
                      <Link className="admin-table-link" to={`/tickets/${ticket.id}`}>
                        {ticket.ticketNumber}
                      </Link>
                      <div style={{ color: '#6b7280', fontSize: '0.84rem', marginTop: 4 }}>
                        {ticket.subject}
                      </div>
                    </td>
                    <td>{String(ticket.status).replaceAll('_', ' ')}</td>
                    <td>{ticket.category}</td>
                    <td>{formatDateTime(ticket.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="admin-table-card" style={{ marginTop: 16 }}>
        <div className="admin-panel">
          <h2>Staff members</h2>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {(workshop.staffMembers || []).map((member) => (
                <tr key={member.id}>
                  <td>{member.name}</td>
                  <td>{member.email || '—'}</td>
                  <td>{member.role}</td>
                  <td>
                    <span className={`admin-badge ${member.active ? 'is-active' : 'is-muted'}`}>
                      {member.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
