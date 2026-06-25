import { CalendarDays, ChevronLeft, ChevronRight, Phone, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  completeSalesFollowUp,
  deleteSalesAppointment,
  deleteSalesFollowUp,
  fetchSalesCalendar,
  saveSalesAppointment,
  saveSalesFollowUp,
} from '../utils/adminApi';

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const APPOINTMENT_TYPES = [
  { value: 'demo', label: 'Demo' },
  { value: 'call', label: 'Call' },
  { value: 'site_visit', label: 'Site visit' },
  { value: 'other', label: 'Other' },
];

const emptyAppointmentForm = {
  appointmentId: '',
  title: '',
  businessName: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  appointmentType: 'demo',
  startsAt: '',
  durationMinutes: '30',
  notes: '',
  status: 'scheduled',
};

const emptyFollowUpForm = {
  followUpId: '',
  title: '',
  businessName: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  dueAt: '',
  notes: '',
};

function pad(value) {
  return String(value).padStart(2, '0');
}

function toDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toDateTimeLocalValue(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatTime(value) {
  if (!value) {
    return '—';
  }

  return new Date(value).toLocaleString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatShortTime(value) {
  if (!value) {
    return '';
  }

  return new Date(value).toLocaleTimeString('en-AU', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getMonthRange(year, month) {
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 41);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

function buildMonthGrid(year, month) {
  const { start } = getMonthRange(year, month);
  const days = [];

  for (let index = 0; index < 42; index += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    days.push(date);
  }

  return days;
}

function isSameDay(left, right) {
  return toDateKey(left) === toDateKey(right);
}

function mapAppointmentToForm(appointment) {
  return {
    appointmentId: appointment.id,
    title: appointment.title || '',
    businessName: appointment.businessName || '',
    contactName: appointment.contactName || '',
    contactEmail: appointment.contactEmail || '',
    contactPhone: appointment.contactPhone || '',
    appointmentType: appointment.appointmentType || 'demo',
    startsAt: toDateTimeLocalValue(new Date(appointment.startsAt)),
    durationMinutes: String(appointment.durationMinutes || 30),
    notes: appointment.notes || '',
    status: appointment.status || 'scheduled',
  };
}

function mapFollowUpToForm(followUp) {
  return {
    followUpId: followUp.id,
    title: followUp.title || '',
    businessName: followUp.businessName || '',
    contactName: followUp.contactName || '',
    contactEmail: followUp.contactEmail || '',
    contactPhone: followUp.contactPhone || '',
    dueAt: toDateTimeLocalValue(new Date(followUp.dueAt)),
    notes: followUp.notes || '',
  };
}

export default function CalendarPage() {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState(today);
  const [appointments, setAppointments] = useState([]);
  const [followUps, setFollowUps] = useState([]);
  const [stats, setStats] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [appointmentForm, setAppointmentForm] = useState(emptyAppointmentForm);
  const [followUpForm, setFollowUpForm] = useState(emptyFollowUpForm);
  const [isAppointmentModalOpen, setIsAppointmentModalOpen] = useState(false);
  const [isFollowUpModalOpen, setIsFollowUpModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const monthDays = useMemo(
    () => buildMonthGrid(viewYear, viewMonth),
    [viewMonth, viewYear],
  );

  const appointmentsByDay = useMemo(() => {
    const map = new Map();

    for (const appointment of appointments) {
      const key = toDateKey(new Date(appointment.startsAt));
      const entries = map.get(key) || [];
      entries.push(appointment);
      map.set(key, entries);
    }

    return map;
  }, [appointments]);

  const selectedDayAppointments = useMemo(() => {
    const key = toDateKey(selectedDate);
    return (appointmentsByDay.get(key) || []).filter((entry) => entry.status !== 'cancelled');
  }, [appointmentsByDay, selectedDate]);

  const sortedFollowUps = useMemo(() => {
    const now = Date.now();

    return [...followUps].sort((left, right) => {
      const leftOverdue = new Date(left.dueAt).getTime() < now;
      const rightOverdue = new Date(right.dueAt).getTime() < now;

      if (leftOverdue !== rightOverdue) {
        return leftOverdue ? -1 : 1;
      }

      return new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime();
    });
  }, [followUps]);

  const loadCalendar = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');

    const { start, end } = getMonthRange(viewYear, viewMonth);

    try {
      const result = await fetchSalesCalendar({
        startAt: start.toISOString(),
        endAt: end.toISOString(),
      });

      setAppointments(result.appointments || []);
      setFollowUps(result.followUps || []);
      setStats(result.stats || null);
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsLoading(false);
    }
  }, [viewMonth, viewYear]);

  useEffect(() => {
    void loadCalendar();
  }, [loadCalendar]);

  function shiftMonth(delta) {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  }

  function openNewAppointment(date = selectedDate) {
    const start = new Date(date);
    start.setHours(9, 0, 0, 0);

    setAppointmentForm({
      ...emptyAppointmentForm,
      startsAt: toDateTimeLocalValue(start),
    });
    setIsAppointmentModalOpen(true);
  }

  function openEditAppointment(appointment) {
    setAppointmentForm(mapAppointmentToForm(appointment));
    setIsAppointmentModalOpen(true);
  }

  function openNewFollowUp(date = selectedDate) {
    const due = new Date(date);
    due.setHours(10, 0, 0, 0);

    setFollowUpForm({
      ...emptyFollowUpForm,
      dueAt: toDateTimeLocalValue(due),
    });
    setIsFollowUpModalOpen(true);
  }

  function openEditFollowUp(followUp) {
    setFollowUpForm(mapFollowUpToForm(followUp));
    setIsFollowUpModalOpen(true);
  }

  async function handleSaveAppointment(event) {
    event.preventDefault();
    setIsSaving(true);
    setErrorMessage('');

    try {
      await saveSalesAppointment({
        appointmentId: appointmentForm.appointmentId || undefined,
        title: appointmentForm.title,
        businessName: appointmentForm.businessName,
        contactName: appointmentForm.contactName,
        contactEmail: appointmentForm.contactEmail,
        contactPhone: appointmentForm.contactPhone,
        appointmentType: appointmentForm.appointmentType,
        startsAt: new Date(appointmentForm.startsAt).toISOString(),
        durationMinutes: Number(appointmentForm.durationMinutes || 30),
        notes: appointmentForm.notes,
        status: appointmentForm.status,
      });

      setIsAppointmentModalOpen(false);
      setAppointmentForm(emptyAppointmentForm);
      await loadCalendar();
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteAppointment(appointmentId) {
    if (!window.confirm('Delete this booking?')) {
      return;
    }

    setErrorMessage('');

    try {
      await deleteSalesAppointment(appointmentId);
      await loadCalendar();
    } catch (error) {
      setErrorMessage(error.message);
    }
  }

  async function handleSaveFollowUp(event) {
    event.preventDefault();
    setIsSaving(true);
    setErrorMessage('');

    try {
      await saveSalesFollowUp({
        followUpId: followUpForm.followUpId || undefined,
        title: followUpForm.title,
        businessName: followUpForm.businessName,
        contactName: followUpForm.contactName,
        contactEmail: followUpForm.contactEmail,
        contactPhone: followUpForm.contactPhone,
        dueAt: new Date(followUpForm.dueAt).toISOString(),
        notes: followUpForm.notes,
      });

      setIsFollowUpModalOpen(false);
      setFollowUpForm(emptyFollowUpForm);
      await loadCalendar();
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCompleteFollowUp(followUpId) {
    setErrorMessage('');

    try {
      await completeSalesFollowUp(followUpId);
      await loadCalendar();
    } catch (error) {
      setErrorMessage(error.message);
    }
  }

  async function handleDeleteFollowUp(followUpId) {
    if (!window.confirm('Delete this follow-up?')) {
      return;
    }

    setErrorMessage('');

    try {
      await deleteSalesFollowUp(followUpId);
      await loadCalendar();
    } catch (error) {
      setErrorMessage(error.message);
    }
  }

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString('en-AU', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="admin-calendar-page">
      <header className="admin-page-header">
        <div>
          <p className="admin-kicker">Sales</p>
          <h1>Calendar & follow-ups</h1>
          <span>Book demos and calls, then track who to chase.</span>
        </div>
        <div className="admin-form-actions">
          <button className="admin-secondary-button" type="button" onClick={() => openNewFollowUp()}>
            <Plus size={16} />
            Add follow-up
          </button>
          <button className="admin-primary-button" type="button" onClick={() => openNewAppointment()}>
            <Plus size={16} />
            Add booking
          </button>
        </div>
      </header>

      {errorMessage ? <div className="admin-error-banner">{errorMessage}</div> : null}

      <div className="admin-stats-grid">
        <div className="admin-stat-card">
          <span>Bookings this week</span>
          <strong>{stats?.appointmentsThisWeek ?? '—'}</strong>
        </div>
        <div className="admin-stat-card">
          <span>Pending follow-ups</span>
          <strong>{stats?.pendingFollowUps ?? '—'}</strong>
        </div>
        <div className="admin-stat-card">
          <span>Overdue follow-ups</span>
          <strong>{stats?.overdueFollowUps ?? '—'}</strong>
        </div>
      </div>

      <div className="admin-calendar-layout">
        <section className="admin-panel admin-calendar-panel">
          <div className="admin-calendar-toolbar">
            <button className="admin-icon-button" type="button" onClick={() => shiftMonth(-1)}>
              <ChevronLeft size={18} />
            </button>
            <h2>{monthLabel}</h2>
            <button className="admin-icon-button" type="button" onClick={() => shiftMonth(1)}>
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="admin-calendar-weekdays">
            {WEEKDAY_LABELS.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>

          <div className="admin-calendar-grid">
            {monthDays.map((date) => {
              const key = toDateKey(date);
              const dayAppointments = appointmentsByDay.get(key) || [];
              const inMonth = date.getMonth() === viewMonth;
              const isSelected = isSameDay(date, selectedDate);
              const isToday = isSameDay(date, today);

              return (
                <button
                  key={key}
                  className={[
                    'admin-calendar-day',
                    inMonth ? '' : 'is-outside',
                    isSelected ? 'is-selected' : '',
                    isToday ? 'is-today' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  type="button"
                  onClick={() => setSelectedDate(date)}
                  onDoubleClick={() => openNewAppointment(date)}
                >
                  <span className="admin-calendar-day-number">{date.getDate()}</span>
                  {dayAppointments.length > 0 ? (
                    <span className="admin-calendar-day-count">
                      {dayAppointments.length} booking{dayAppointments.length === 1 ? '' : 's'}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </section>

        <section className="admin-panel admin-calendar-side">
          <div className="admin-calendar-side-header">
            <h2>
              <CalendarDays size={18} />
              {selectedDate.toLocaleDateString('en-AU', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
            </h2>
            <button className="admin-secondary-button" type="button" onClick={() => openNewAppointment()}>
              Add booking
            </button>
          </div>

          {isLoading ? (
            <p className="admin-muted">Loading...</p>
          ) : selectedDayAppointments.length === 0 ? (
            <p className="admin-muted">No bookings on this day.</p>
          ) : (
            <div className="admin-calendar-list">
              {selectedDayAppointments.map((appointment) => (
                <article className="admin-calendar-item" key={appointment.id}>
                  <div>
                    <strong>{appointment.businessName || appointment.title}</strong>
                    <p>
                      {formatShortTime(appointment.startsAt)} ·{' '}
                      {APPOINTMENT_TYPES.find((entry) => entry.value === appointment.appointmentType)
                        ?.label || 'Booking'}
                    </p>
                    {appointment.contactName ? <p>{appointment.contactName}</p> : null}
                    {appointment.contactPhone ? (
                      <p>
                        <Phone size={14} /> {appointment.contactPhone}
                      </p>
                    ) : null}
                    {appointment.notes ? <p className="admin-muted">{appointment.notes}</p> : null}
                  </div>
                  <div className="admin-table-actions">
                    <button type="button" onClick={() => openEditAppointment(appointment)}>
                      Edit
                    </button>
                    <button
                      className="admin-danger-text"
                      type="button"
                      onClick={() => handleDeleteAppointment(appointment.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}

          <div className="admin-calendar-side-header admin-calendar-followups-header">
            <h2>Follow-ups</h2>
            <button className="admin-secondary-button" type="button" onClick={() => openNewFollowUp()}>
              Add follow-up
            </button>
          </div>

          {sortedFollowUps.length === 0 ? (
            <p className="admin-muted">No pending follow-ups.</p>
          ) : (
            <div className="admin-calendar-list">
              {sortedFollowUps.map((followUp) => {
                const overdue = new Date(followUp.dueAt).getTime() < Date.now();

                return (
                  <article
                    className={`admin-calendar-item${overdue ? ' is-overdue' : ''}`}
                    key={followUp.id}
                  >
                    <div>
                      <strong>{followUp.businessName || followUp.title}</strong>
                      <p>{formatTime(followUp.dueAt)}</p>
                      {followUp.contactPhone ? <p>{followUp.contactPhone}</p> : null}
                      {followUp.notes ? <p className="admin-muted">{followUp.notes}</p> : null}
                    </div>
                    <div className="admin-table-actions">
                      <button type="button" onClick={() => handleCompleteFollowUp(followUp.id)}>
                        Done
                      </button>
                      <button type="button" onClick={() => openEditFollowUp(followUp)}>
                        Edit
                      </button>
                      <button
                        className="admin-danger-text"
                        type="button"
                        onClick={() => handleDeleteFollowUp(followUp.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {isAppointmentModalOpen ? (
        <div className="admin-modal-backdrop">
          <form className="admin-modal" onSubmit={handleSaveAppointment}>
            <h2>{appointmentForm.appointmentId ? 'Edit booking' : 'Add booking'}</h2>

            <label className="admin-form-block">
              Business name
              <input
                value={appointmentForm.businessName}
                onChange={(event) =>
                  setAppointmentForm((current) => ({
                    ...current,
                    businessName: event.target.value,
                  }))
                }
              />
            </label>

            <label className="admin-form-block">
              Title
              <input
                value={appointmentForm.title}
                onChange={(event) =>
                  setAppointmentForm((current) => ({ ...current, title: event.target.value }))
                }
              />
            </label>

            <div className="admin-form-grid">
              <label className="admin-form-block">
                Contact name
                <input
                  value={appointmentForm.contactName}
                  onChange={(event) =>
                    setAppointmentForm((current) => ({
                      ...current,
                      contactName: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="admin-form-block">
                Phone
                <input
                  value={appointmentForm.contactPhone}
                  onChange={(event) =>
                    setAppointmentForm((current) => ({
                      ...current,
                      contactPhone: event.target.value,
                    }))
                  }
                />
              </label>
            </div>

            <label className="admin-form-block">
              Email
              <input
                type="email"
                value={appointmentForm.contactEmail}
                onChange={(event) =>
                  setAppointmentForm((current) => ({
                    ...current,
                    contactEmail: event.target.value,
                  }))
                }
              />
            </label>

            <div className="admin-form-grid">
              <label className="admin-form-block">
                Type
                <select
                  value={appointmentForm.appointmentType}
                  onChange={(event) =>
                    setAppointmentForm((current) => ({
                      ...current,
                      appointmentType: event.target.value,
                    }))
                  }
                >
                  {APPOINTMENT_TYPES.map((entry) => (
                    <option key={entry.value} value={entry.value}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="admin-form-block">
                Duration (mins)
                <input
                  type="number"
                  min="5"
                  max="480"
                  value={appointmentForm.durationMinutes}
                  onChange={(event) =>
                    setAppointmentForm((current) => ({
                      ...current,
                      durationMinutes: event.target.value,
                    }))
                  }
                />
              </label>
            </div>

            <label className="admin-form-block">
              Start
              <input
                type="datetime-local"
                required
                value={appointmentForm.startsAt}
                onChange={(event) =>
                  setAppointmentForm((current) => ({
                    ...current,
                    startsAt: event.target.value,
                  }))
                }
              />
            </label>

            <label className="admin-form-block">
              Notes
              <textarea
                rows={3}
                value={appointmentForm.notes}
                onChange={(event) =>
                  setAppointmentForm((current) => ({ ...current, notes: event.target.value }))
                }
              />
            </label>

            <div className="admin-form-actions">
              <button className="admin-primary-button" disabled={isSaving} type="submit">
                {isSaving ? 'Saving...' : 'Save booking'}
              </button>
              <button
                className="admin-secondary-button"
                type="button"
                onClick={() => {
                  setIsAppointmentModalOpen(false);
                  setAppointmentForm(emptyAppointmentForm);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {isFollowUpModalOpen ? (
        <div className="admin-modal-backdrop">
          <form className="admin-modal" onSubmit={handleSaveFollowUp}>
            <h2>{followUpForm.followUpId ? 'Edit follow-up' : 'Add follow-up'}</h2>

            <label className="admin-form-block">
              Business name
              <input
                value={followUpForm.businessName}
                onChange={(event) =>
                  setFollowUpForm((current) => ({
                    ...current,
                    businessName: event.target.value,
                  }))
                }
              />
            </label>

            <label className="admin-form-block">
              Title
              <input
                value={followUpForm.title}
                onChange={(event) =>
                  setFollowUpForm((current) => ({ ...current, title: event.target.value }))
                }
              />
            </label>

            <div className="admin-form-grid">
              <label className="admin-form-block">
                Contact name
                <input
                  value={followUpForm.contactName}
                  onChange={(event) =>
                    setFollowUpForm((current) => ({
                      ...current,
                      contactName: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="admin-form-block">
                Phone
                <input
                  value={followUpForm.contactPhone}
                  onChange={(event) =>
                    setFollowUpForm((current) => ({
                      ...current,
                      contactPhone: event.target.value,
                    }))
                  }
                />
              </label>
            </div>

            <label className="admin-form-block">
              Email
              <input
                type="email"
                value={followUpForm.contactEmail}
                onChange={(event) =>
                  setFollowUpForm((current) => ({
                    ...current,
                    contactEmail: event.target.value,
                  }))
                }
              />
            </label>

            <label className="admin-form-block">
              Due
              <input
                type="datetime-local"
                required
                value={followUpForm.dueAt}
                onChange={(event) =>
                  setFollowUpForm((current) => ({ ...current, dueAt: event.target.value }))
                }
              />
            </label>

            <label className="admin-form-block">
              Notes
              <textarea
                rows={3}
                value={followUpForm.notes}
                onChange={(event) =>
                  setFollowUpForm((current) => ({ ...current, notes: event.target.value }))
                }
              />
            </label>

            <div className="admin-form-actions">
              <button className="admin-primary-button" disabled={isSaving} type="submit">
                {isSaving ? 'Saving...' : 'Save follow-up'}
              </button>
              <button
                className="admin-secondary-button"
                type="button"
                onClick={() => {
                  setIsFollowUpModalOpen(false);
                  setFollowUpForm(emptyFollowUpForm);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
