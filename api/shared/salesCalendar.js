const APPOINTMENT_TYPES = new Set(['demo', 'call', 'site_visit', 'other']);
const APPOINTMENT_STATUSES = new Set(['scheduled', 'completed', 'cancelled']);
const FOLLOW_UP_STATUSES = new Set(['pending', 'done', 'skipped']);

function sanitizeText(value, maxLength = 500) {
  return String(value ?? '')
    .replace(/\0/g, '')
    .trim()
    .slice(0, maxLength);
}

function mapAppointmentRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    title: row.title || '',
    businessName: row.business_name || '',
    contactName: row.contact_name || '',
    contactEmail: row.contact_email || '',
    contactPhone: row.contact_phone || '',
    workshopId: row.workshop_id || '',
    pendingSignupId: row.pending_signup_id || '',
    appointmentType: row.appointment_type || 'demo',
    startsAt: row.starts_at,
    durationMinutes: Number(row.duration_minutes || 30),
    notes: row.notes || '',
    status: row.status || 'scheduled',
    createdByEmail: row.created_by_email || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapFollowUpRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    title: row.title || '',
    businessName: row.business_name || '',
    contactName: row.contact_name || '',
    contactEmail: row.contact_email || '',
    contactPhone: row.contact_phone || '',
    workshopId: row.workshop_id || '',
    pendingSignupId: row.pending_signup_id || '',
    dueAt: row.due_at,
    notes: row.notes || '',
    status: row.status || 'pending',
    completedAt: row.completed_at || null,
    createdByEmail: row.created_by_email || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseIsoDate(value, fieldName) {
  const raw = String(value || '').trim();

  if (!raw) {
    throw new Error(`${fieldName} is required.`);
  }

  const date = new Date(raw);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} is invalid.`);
  }

  return date.toISOString();
}

export async function listSalesAppointments(supabaseAdmin, { startAt, endAt }) {
  if (!startAt || !endAt) {
    throw new Error('startAt and endAt are required.');
  }

  const { data, error } = await supabaseAdmin
    .from('admin_sales_appointments')
    .select('*')
    .gte('starts_at', startAt)
    .lte('starts_at', endAt)
    .order('starts_at', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data || []).map(mapAppointmentRow);
}

export async function saveSalesAppointment({
  supabaseAdmin,
  appointmentId,
  payload,
  createdByEmail,
}) {
  const title = sanitizeText(payload.title, 120);
  const businessName = sanitizeText(payload.businessName, 120);
  const contactName = sanitizeText(payload.contactName, 120);
  const contactEmail = sanitizeText(payload.contactEmail, 254).toLowerCase();
  const contactPhone = sanitizeText(payload.contactPhone, 40);
  const appointmentType = APPOINTMENT_TYPES.has(payload.appointmentType)
    ? payload.appointmentType
    : 'demo';
  const status = APPOINTMENT_STATUSES.has(payload.status) ? payload.status : 'scheduled';
  const startsAt = parseIsoDate(payload.startsAt, 'Start time');
  const durationMinutes = Math.min(
    480,
    Math.max(5, Number(payload.durationMinutes || 30) || 30),
  );
  const notes = sanitizeText(payload.notes, 2000);
  const workshopId = sanitizeText(payload.workshopId, 64) || null;
  const pendingSignupId = sanitizeText(payload.pendingSignupId, 64) || null;

  if (!title && !businessName) {
    throw new Error('Title or business name is required.');
  }

  const row = {
    title: title || `${businessName} ${appointmentType}`,
    business_name: businessName || null,
    contact_name: contactName || null,
    contact_email: contactEmail || null,
    contact_phone: contactPhone || null,
    workshop_id: workshopId,
    pending_signup_id: pendingSignupId,
    appointment_type: appointmentType,
    starts_at: startsAt,
    duration_minutes: durationMinutes,
    notes: notes || null,
    status,
    updated_at: new Date().toISOString(),
  };

  if (appointmentId) {
    const { data, error } = await supabaseAdmin
      .from('admin_sales_appointments')
      .update(row)
      .eq('id', appointmentId)
      .select('*')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return mapAppointmentRow(data);
  }

  const { data, error } = await supabaseAdmin
    .from('admin_sales_appointments')
    .insert({
      ...row,
      created_by_email: createdByEmail,
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapAppointmentRow(data);
}

export async function deleteSalesAppointment(supabaseAdmin, appointmentId) {
  const targetId = sanitizeText(appointmentId, 64);

  if (!targetId) {
    throw new Error('appointmentId is required.');
  }

  const { error } = await supabaseAdmin
    .from('admin_sales_appointments')
    .delete()
    .eq('id', targetId);

  if (error) {
    throw new Error(error.message);
  }

  return { deleted: true };
}

export async function listSalesFollowUps(supabaseAdmin, { status = '' } = {}) {
  let query = supabaseAdmin
    .from('admin_sales_follow_ups')
    .select('*')
    .order('due_at', { ascending: true });

  if (status && FOLLOW_UP_STATUSES.has(status)) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return (data || []).map(mapFollowUpRow);
}

export async function saveSalesFollowUp({
  supabaseAdmin,
  followUpId,
  payload,
  createdByEmail,
}) {
  const title = sanitizeText(payload.title, 120);
  const businessName = sanitizeText(payload.businessName, 120);
  const contactName = sanitizeText(payload.contactName, 120);
  const contactEmail = sanitizeText(payload.contactEmail, 254).toLowerCase();
  const contactPhone = sanitizeText(payload.contactPhone, 40);
  const status = FOLLOW_UP_STATUSES.has(payload.status) ? payload.status : 'pending';
  const dueAt = parseIsoDate(payload.dueAt, 'Due date');
  const notes = sanitizeText(payload.notes, 2000);
  const workshopId = sanitizeText(payload.workshopId, 64) || null;
  const pendingSignupId = sanitizeText(payload.pendingSignupId, 64) || null;

  if (!title && !businessName) {
    throw new Error('Title or business name is required.');
  }

  const row = {
    title: title || `${businessName} follow-up`,
    business_name: businessName || null,
    contact_name: contactName || null,
    contact_email: contactEmail || null,
    contact_phone: contactPhone || null,
    workshop_id: workshopId,
    pending_signup_id: pendingSignupId,
    due_at: dueAt,
    notes: notes || null,
    status,
    completed_at: status === 'done' ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };

  if (followUpId) {
    const { data, error } = await supabaseAdmin
      .from('admin_sales_follow_ups')
      .update(row)
      .eq('id', followUpId)
      .select('*')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return mapFollowUpRow(data);
  }

  const { data, error } = await supabaseAdmin
    .from('admin_sales_follow_ups')
    .insert({
      ...row,
      created_by_email: createdByEmail,
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapFollowUpRow(data);
}

export async function completeSalesFollowUp(supabaseAdmin, followUpId) {
  const targetId = sanitizeText(followUpId, 64);

  if (!targetId) {
    throw new Error('followUpId is required.');
  }

  const { data, error } = await supabaseAdmin
    .from('admin_sales_follow_ups')
    .update({
      status: 'done',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', targetId)
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapFollowUpRow(data);
}

export async function deleteSalesFollowUp(supabaseAdmin, followUpId) {
  const targetId = sanitizeText(followUpId, 64);

  if (!targetId) {
    throw new Error('followUpId is required.');
  }

  const { error } = await supabaseAdmin
    .from('admin_sales_follow_ups')
    .delete()
    .eq('id', targetId);

  if (error) {
    throw new Error(error.message);
  }

  return { deleted: true };
}

export function getSalesCalendarStats(appointments, followUps) {
  const now = Date.now();
  const weekAhead = now + 7 * 24 * 60 * 60 * 1000;

  const scheduledAppointments = appointments.filter((entry) => entry.status === 'scheduled');
  const pendingFollowUps = followUps.filter((entry) => entry.status === 'pending');

  return {
    appointmentsThisWeek: scheduledAppointments.filter((entry) => {
      const time = new Date(entry.startsAt).getTime();
      return time >= now && time <= weekAhead;
    }).length,
    overdueFollowUps: pendingFollowUps.filter(
      (entry) => new Date(entry.dueAt).getTime() < now,
    ).length,
    pendingFollowUps: pendingFollowUps.length,
  };
}
