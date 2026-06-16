import { ArrowLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  addTicketInternalNote,
  fetchTicketDetail,
  replyToTicket,
  updateTicket,
} from '../utils/adminApi';

const STATUS_OPTIONS = [
  'open',
  'in_progress',
  'waiting_on_customer',
  'resolved',
  'closed',
];

const PRIORITY_OPTIONS = ['low', 'normal', 'high'];

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

export default function TicketDetailPage() {
  const { ticketId } = useParams();
  const [ticket, setTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [replyBody, setReplyBody] = useState('');
  const [internalBody, setInternalBody] = useState('');
  const [status, setStatus] = useState('open');
  const [priority, setPriority] = useState('normal');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);

  async function loadTicket() {
    const result = await fetchTicketDetail(ticketId);
    setTicket(result.ticket || null);
    setMessages(result.messages || []);
    setStatus(result.ticket?.status || 'open');
    setPriority(result.ticket?.priority || 'normal');
  }

  useEffect(() => {
    if (!ticketId) {
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    loadTicket()
      .catch((error) => {
        setErrorMessage(error.message);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [ticketId]);

  async function handleReply(event) {
    event.preventDefault();

    if (isBusy || !ticket) {
      return;
    }

    setIsBusy(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const result = await replyToTicket(ticket.id, replyBody);
      setTicket(result.ticket);
      setMessages((current) => [...current, result.message]);
      setReplyBody('');
      setSuccessMessage('Reply sent to workshop.');
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsBusy(false);
    }
  }

  async function handleInternalNote(event) {
    event.preventDefault();

    if (isBusy || !ticket) {
      return;
    }

    setIsBusy(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const result = await addTicketInternalNote(ticket.id, internalBody);
      setTicket(result.ticket);
      setMessages((current) => [...current, result.message]);
      setInternalBody('');
      setSuccessMessage('Internal note added.');
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsBusy(false);
    }
  }

  async function handleUpdateTicket(event) {
    event.preventDefault();

    if (isBusy || !ticket) {
      return;
    }

    setIsBusy(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const result = await updateTicket(ticket.id, { status, priority });
      setTicket((current) => ({ ...current, ...result.ticket }));
      setSuccessMessage('Ticket updated.');
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsBusy(false);
    }
  }

  if (isLoading) {
    return <div className="admin-loading">Loading ticket...</div>;
  }

  if (!ticket) {
    return (
      <>
        <div className="form-error">{errorMessage || 'Ticket not found.'}</div>
        <Link className="admin-link-button" to="/tickets">
          <ArrowLeft size={16} />
          Back to tickets
        </Link>
      </>
    );
  }

  return (
    <>
      <header className="admin-page-header">
        <div>
          <Link className="admin-link-button" to="/tickets">
            <ArrowLeft size={16} />
            Back to tickets
          </Link>
          <p className="admin-kicker">Support ticket</p>
          <h1>{ticket.ticketNumber}</h1>
          <span>{ticket.subject}</span>
        </div>
      </header>

      {successMessage ? <div className="admin-success-banner">{successMessage}</div> : null}
      {errorMessage ? <div className="form-error">{errorMessage}</div> : null}

      <div className="admin-ticket-layout">
        <section className="admin-panel">
          <div className="admin-chip-row" style={{ marginBottom: 16 }}>
            <span className={`admin-badge ${ticket.needsCosaReply ? 'is-warning' : 'is-active'}`}>
              {ticket.needsCosaReply ? 'Needs COSA reply' : 'Awaiting customer'}
            </span>
            <span className="admin-badge is-muted">{formatStatusLabel(ticket.status)}</span>
            <span className="admin-badge is-muted">{ticket.category}</span>
          </div>

          <div className="admin-message-list">
            {messages.map((message) => (
              <article
                className={`admin-message${message.isInternal ? ' is-internal' : ''}`}
                key={message.id}
              >
                <header>
                  <strong>{message.authorName}</strong>
                  <span>{formatDateTime(message.createdAt)}</span>
                </header>
                {message.isInternal ? (
                  <span className="admin-badge is-warning">Internal note</span>
                ) : null}
                <p>{message.body}</p>
              </article>
            ))}
          </div>

          <form className="admin-form-block" onSubmit={handleReply}>
            <h3>Reply to workshop</h3>
            <textarea
              required
              rows={5}
              value={replyBody}
              onChange={(event) => setReplyBody(event.target.value)}
            />
            <button disabled={isBusy} type="submit">
              {isBusy ? 'Sending...' : 'Send reply'}
            </button>
          </form>

          <form className="admin-form-block" onSubmit={handleInternalNote}>
            <h3>Internal note</h3>
            <textarea
              required
              rows={4}
              value={internalBody}
              onChange={(event) => setInternalBody(event.target.value)}
            />
            <button className="admin-secondary-button" disabled={isBusy} type="submit">
              {isBusy ? 'Saving...' : 'Add internal note'}
            </button>
          </form>
        </section>

        <aside className="admin-panel admin-ticket-sidebar">
          <h2>Workshop</h2>
          <dl className="admin-sidebar-list">
            <div>
              <dt>Business</dt>
              <dd>
                <Link className="admin-table-link" to={`/workshops/${ticket.workshopId}`}>
                  {ticket.context?.businessName || ticket.workshop?.name || 'Workshop'}
                </Link>
              </dd>
            </div>
            <div>
              <dt>Submitted by</dt>
              <dd>{ticket.context?.submitterName || '—'}</dd>
            </div>
            <div>
              <dt>Submitter email</dt>
              <dd>{ticket.context?.submitterEmail || ticket.workshop?.businessEmail || '—'}</dd>
            </div>
            <div>
              <dt>Business email</dt>
              <dd>{ticket.workshop?.businessEmail || ticket.context?.businessEmail || '—'}</dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>{ticket.workshop?.businessPhone || '—'}</dd>
            </div>
            <div>
              <dt>Plan</dt>
              <dd>{ticket.workshop?.planKey || '—'}</dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{formatDateTime(ticket.createdAt)}</dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd>{formatDateTime(ticket.updatedAt)}</dd>
            </div>
          </dl>

          <form className="admin-form-block" onSubmit={handleUpdateTicket}>
            <h3>Ticket settings</h3>
            <label>
              Status
              <select value={status} onChange={(event) => setStatus(event.target.value)}>
                {STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {formatStatusLabel(option)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Priority
              <select value={priority} onChange={(event) => setPriority(event.target.value)}>
                {PRIORITY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <button className="admin-secondary-button" disabled={isBusy} type="submit">
              {isBusy ? 'Saving...' : 'Save changes'}
            </button>
          </form>
        </aside>
      </div>
    </>
  );
}
