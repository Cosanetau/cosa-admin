import { ArrowLeft, CheckCircle2, Gift, MessageSquare, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  addTicketInternalNote,
  closeTicket,
  fetchTicketDetail,
  reopenTicket,
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

function formatAttachmentSize(bytes) {
  const size = Number(bytes || 0);
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function TicketAttachmentList({ attachments }) {
  if (!attachments?.length) {
    return null;
  }

  return (
    <div className="admin-attachment-list">
      {attachments.map((attachment) => {
        const isImage = String(attachment.mimeType || '').startsWith('image/');

        return (
          <a
            className="admin-attachment-chip"
            href={attachment.url}
            key={attachment.id}
            rel="noreferrer"
            target="_blank"
          >
            {isImage && attachment.url ? (
              <img alt={attachment.fileName} src={attachment.url} />
            ) : null}
            <span>
              {attachment.fileName}
              <br />
              {formatAttachmentSize(attachment.sizeBytes)}
            </span>
          </a>
        );
      })}
    </div>
  );
}

function isTicketClosed(status) {
  return ['closed', 'resolved'].includes(String(status || '').toLowerCase());
}

export default function TicketDetailPage() {
  const { ticketId } = useParams();
  const [ticket, setTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [replyBody, setReplyBody] = useState('');
  const [closeAfterReply, setCloseAfterReply] = useState(false);
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

  function applyTicketUpdate(nextTicket) {
    setTicket((current) => ({ ...current, ...nextTicket }));
    setStatus(nextTicket.status || 'open');
    setPriority(nextTicket.priority || 'normal');
  }

  async function handleReply(event) {
    event.preventDefault();

    if (isBusy || !ticket || !replyBody.trim()) {
      return;
    }

    setIsBusy(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const result = await replyToTicket(ticket.id, replyBody, {
        closeAfterReply,
        closeStatus: 'resolved',
      });
      applyTicketUpdate(result.ticket);
      setMessages((current) => [...current, result.message]);
      setReplyBody('');
      setCloseAfterReply(false);
      setSuccessMessage(
        closeAfterReply ? 'Reply sent and ticket resolved.' : 'Reply sent to workshop.',
      );
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsBusy(false);
    }
  }

  async function handleReplyAndResolve(event) {
    event.preventDefault();

    if (isBusy || !ticket || !replyBody.trim()) {
      return;
    }

    setIsBusy(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const result = await replyToTicket(ticket.id, replyBody, {
        closeAfterReply: true,
        closeStatus: 'resolved',
      });
      applyTicketUpdate(result.ticket);
      setMessages((current) => [...current, result.message]);
      setReplyBody('');
      setCloseAfterReply(false);
      setSuccessMessage('Reply sent and ticket resolved.');
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsBusy(false);
    }
  }

  async function handleInternalNote(event) {
    event.preventDefault();

    if (isBusy || !ticket || !internalBody.trim()) {
      return;
    }

    setIsBusy(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const result = await addTicketInternalNote(ticket.id, internalBody);
      applyTicketUpdate(result.ticket);
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
      applyTicketUpdate(result.ticket);
      setSuccessMessage('Ticket updated.');
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsBusy(false);
    }
  }

  async function handleCloseTicket(nextStatus = 'closed') {
    if (isBusy || !ticket) {
      return;
    }

    const label = nextStatus === 'resolved' ? 'resolve' : 'close';

    if (!window.confirm(`${label.charAt(0).toUpperCase()}${label.slice(1)} this ticket?`)) {
      return;
    }

    setIsBusy(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const result = await closeTicket(ticket.id, nextStatus);
      applyTicketUpdate(result.ticket);
      setSuccessMessage(nextStatus === 'resolved' ? 'Ticket resolved.' : 'Ticket closed.');
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsBusy(false);
    }
  }

  async function handleReopenTicket() {
    if (isBusy || !ticket) {
      return;
    }

    setIsBusy(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const result = await reopenTicket(ticket.id);
      applyTicketUpdate(result.ticket);
      setSuccessMessage('Ticket reopened.');
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

  const ticketClosed = isTicketClosed(ticket.status);

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

      <section className="admin-ticket-action-bar">
        {ticketClosed ? (
          <button
            className="admin-secondary-button"
            disabled={isBusy}
            type="button"
            onClick={handleReopenTicket}
          >
            <RotateCcw size={16} style={{ marginRight: 6, verticalAlign: -2 }} />
            Reopen ticket
          </button>
        ) : (
          <>
            <button
              className="admin-primary-button"
              disabled={isBusy}
              type="button"
              onClick={() => document.getElementById('admin-ticket-reply')?.focus()}
            >
              <MessageSquare size={16} style={{ marginRight: 6, verticalAlign: -2 }} />
              Reply
            </button>
            <button
              className="admin-secondary-button"
              disabled={isBusy}
              type="button"
              onClick={() => handleCloseTicket('resolved')}
            >
              <CheckCircle2 size={16} style={{ marginRight: 6, verticalAlign: -2 }} />
              Resolve
            </button>
            <button
              className="admin-danger-button"
              disabled={isBusy}
              type="button"
              onClick={() => handleCloseTicket('closed')}
            >
              Close ticket
            </button>
          </>
        )}
      </section>

      <div className="admin-ticket-layout">
        <section className="admin-panel">
          <div className="admin-chip-row" style={{ marginBottom: 16 }}>
            <span className={`admin-badge ${ticket.needsCosaReply ? 'is-warning' : 'is-active'}`}>
              {ticket.needsCosaReply ? 'Needs COSA reply' : 'Awaiting customer'}
            </span>
            {ticket.slaOverdue ? (
              <span className="admin-badge is-critical">
                SLA overdue ({ticket.slaHoursWaiting}h)
              </span>
            ) : null}
            <span
              className={`admin-badge ${
                ticketClosed ? 'is-muted' : ticket.status === 'in_progress' ? 'is-warning' : 'is-active'
              }`}
            >
              {formatStatusLabel(ticket.status)}
            </span>
            <span className="admin-badge is-muted">{ticket.category}</span>
          </div>

          <div className="admin-message-list">
            {messages.length === 0 ? (
              <div className="admin-empty">No messages on this ticket yet.</div>
            ) : (
              messages.map((message) => (
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
                  <p style={{ whiteSpace: 'pre-wrap' }}>{message.body}</p>
                  <TicketAttachmentList attachments={message.attachments} />
                </article>
              ))
            )}
          </div>

          <form className="admin-form-block admin-ticket-reply-form" onSubmit={handleReply}>
            <h3>Reply to workshop</h3>
            <p className="admin-form-hint">
              Your reply is visible to the workshop in COSA Core and emailed to the submitter.
            </p>
            <textarea
              id="admin-ticket-reply"
              placeholder="Type your reply to the workshop..."
              required
              rows={5}
              value={replyBody}
              onChange={(event) => setReplyBody(event.target.value)}
            />
            <label className="admin-checkbox-label">
              <input
                checked={closeAfterReply}
                type="checkbox"
                onChange={(event) => setCloseAfterReply(event.target.checked)}
              />
              Resolve ticket after sending this reply
            </label>
            <div className="admin-form-actions">
              <button className="admin-primary-button" disabled={isBusy || !replyBody.trim()} type="submit">
                {isBusy ? 'Sending...' : 'Send reply'}
              </button>
              {!ticketClosed ? (
                <button
                  className="admin-secondary-button"
                  disabled={isBusy || !replyBody.trim()}
                  type="button"
                  onClick={handleReplyAndResolve}
                >
                  Send &amp; resolve
                </button>
              ) : null}
            </div>
          </form>

          <form className="admin-form-block" onSubmit={handleInternalNote}>
            <h3>Internal note</h3>
            <p className="admin-form-hint">Only visible to COSA team — not sent to the workshop.</p>
            <textarea
              placeholder="Billing context, callback notes, etc."
              required
              rows={4}
              value={internalBody}
              onChange={(event) => setInternalBody(event.target.value)}
            />
            <button className="admin-secondary-button" disabled={isBusy || !internalBody.trim()} type="submit">
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
            {ticket.needsCosaReply && ticket.slaHoursWaiting > 0 ? (
              <div>
                <dt>Waiting on COSA</dt>
                <dd>{ticket.slaHoursWaiting}h since last customer reply</dd>
              </div>
            ) : null}
          </dl>

          <div className="admin-form-block">
            <h3>Billing comp</h3>
            <p className="admin-form-hint">
              Grant 1–3 free months on this workshop&apos;s Stripe subscription.
            </p>
            <Link
              className="admin-secondary-button"
              to={`/free-months?workshopId=${ticket.workshopId}&ticketId=${ticket.id}`}
            >
              <Gift size={16} style={{ marginRight: 6, verticalAlign: -2 }} />
              Grant free months
            </Link>
          </div>

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
              {isBusy ? 'Saving...' : 'Save status'}
            </button>
          </form>
        </aside>
      </div>
    </>
  );
}
