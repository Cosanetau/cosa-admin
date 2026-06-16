import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { closeTicket, fetchTickets } from '../utils/adminApi';

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

function formatStatusLabel(status) {
  return String(status || 'open').replaceAll('_', ' ');
}

const filters = [
  { value: 'needs_reply', label: 'Needs COSA reply' },
  { value: 'overdue', label: 'SLA overdue' },
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
  { value: 'all', label: 'All' },
];

function isTicketClosed(status) {
  return ['closed', 'resolved'].includes(String(status || '').toLowerCase());
}

export default function TicketsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tickets, setTickets] = useState([]);
  const [stats, setStats] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [closingId, setClosingId] = useState('');

  const filter = searchParams.get('filter') || 'needs_reply';

  useEffect(() => {
    setIsLoading(true);
    setErrorMessage('');

    fetchTickets(filter)
      .then((result) => {
        setTickets(result.tickets || []);
        setStats(result.stats || null);
      })
      .catch((error) => {
        setErrorMessage(error.message);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [filter]);

  const filteredTickets = useMemo(() => tickets, [tickets]);

  async function handleCloseFromList(ticket) {
    if (!window.confirm(`Close ${ticket.ticketNumber}?`)) {
      return;
    }

    setClosingId(ticket.id);
    setErrorMessage('');

    try {
      await closeTicket(ticket.id, 'closed');
      setTickets((current) =>
        filter === 'closed'
          ? current.map((row) =>
              row.id === ticket.id ? { ...row, status: 'closed', needsCosaReply: false } : row,
            )
          : current.filter((row) => row.id !== ticket.id),
      );
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setClosingId('');
    }
  }

  return (
    <>
      <header className="admin-page-header">
        <div>
          <p className="admin-kicker">Support</p>
          <h1>Tickets inbox</h1>
          <span>Workshop support requests from COSA Core.</span>
        </div>
      </header>

      {errorMessage ? <div className="form-error">{errorMessage}</div> : null}

      {stats ? (
        <div className="admin-stats-grid">
          <div className="admin-stat-card">
            <span>Showing</span>
            <strong>{stats.total}</strong>
          </div>
          <div className="admin-stat-card">
            <span>Needs reply</span>
            <strong>{stats.needsReply}</strong>
          </div>
          <div className="admin-stat-card">
            <span>SLA overdue</span>
            <strong>{stats.overdue ?? 0}</strong>
          </div>
          <div className="admin-stat-card">
            <span>Open</span>
            <strong>{stats.open}</strong>
          </div>
        </div>
      ) : null}

      <section className="admin-panel">
        <div className="admin-filter-row">
          {filters.map((entry) => (
            <button
              className={`admin-filter-button${filter === entry.value ? ' is-active' : ''}`}
              key={entry.value}
              type="button"
              onClick={() => setSearchParams({ filter: entry.value })}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </section>

      <section className="admin-table-card">
        {isLoading ? (
          <div className="admin-loading">Loading tickets...</div>
        ) : filteredTickets.length === 0 ? (
          <div className="admin-empty">No tickets in this view.</div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Workshop</th>
                  <th>Status</th>
                  <th>Category</th>
                  <th>Updated</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredTickets.map((ticket) => (
                  <tr key={ticket.id}>
                    <td>
                      <Link className="admin-table-link" to={`/tickets/${ticket.id}`}>
                        {ticket.ticketNumber}
                      </Link>
                      <div style={{ color: '#6b7280', fontSize: '0.84rem', marginTop: 4 }}>
                        {ticket.subject}
                      </div>
                      {ticket.needsCosaReply ? (
                        <span className="admin-badge is-warning" style={{ marginTop: 8 }}>
                          Needs reply
                        </span>
                      ) : null}
                      {ticket.slaOverdue ? (
                        <span className="admin-badge is-critical" style={{ marginTop: 8, marginLeft: ticket.needsCosaReply ? 6 : 0 }}>
                          SLA overdue ({ticket.slaHoursWaiting}h)
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <Link className="admin-table-link" to={`/workshops/${ticket.workshopId}`}>
                        {ticket.context?.businessName || ticket.workshop?.name || 'Workshop'}
                      </Link>
                    </td>
                    <td>{formatStatusLabel(ticket.status)}</td>
                    <td>{ticket.category}</td>
                    <td>{formatDateTime(ticket.updatedAt)}</td>
                    <td>
                      <div className="admin-table-actions">
                        <Link className="admin-table-link" to={`/tickets/${ticket.id}`}>
                          Reply
                        </Link>
                        {!isTicketClosed(ticket.status) ? (
                          <button
                            className="admin-danger-button"
                            disabled={closingId === ticket.id}
                            type="button"
                            onClick={() => handleCloseFromList(ticket)}
                          >
                            {closingId === ticket.id ? 'Closing...' : 'Close'}
                          </button>
                        ) : null}
                      </div>
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
