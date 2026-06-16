import {
  getTicketSlaMeta,
  loadMessageAttachmentsMap,
} from './supportTicketAttachments.js';

export const SUPPORT_TICKET_STATUSES = [
  'open',
  'in_progress',
  'waiting_on_customer',
  'resolved',
  'closed',
];

export function normalizeSupportStatus(value) {
  const normalized = String(value || 'open').trim().toLowerCase();
  return SUPPORT_TICKET_STATUSES.includes(normalized) ? normalized : 'open';
}

export function normalizeSupportPriority(value) {
  const normalized = String(value || 'normal').trim().toLowerCase();
  return ['low', 'normal', 'high'].includes(normalized) ? normalized : 'normal';
}

export function mapSupportTicketRow(row, extras = {}) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    workshopId: row.workshop_id,
    ticketNumber: row.ticket_number,
    subject: row.subject,
    category: row.category,
    priority: row.priority,
    status: row.status,
    context: row.context || {},
    createdByStaffId: row.created_by_staff_id || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastCustomerReplyAt: row.last_customer_reply_at,
    lastCosaReplyAt: row.last_cosa_reply_at,
    needsCosaReply: Boolean(row.needs_cosa_reply),
    ...extras,
  };
}

export function mapSupportMessageRow(row, extras = {}) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    ticketId: row.ticket_id,
    workshopId: row.workshop_id,
    authorStaffId: row.author_staff_id || '',
    authorEmail: row.author_email || '',
    authorName: row.author_name || 'Support',
    body: row.body,
    isInternal: Boolean(row.is_internal),
    createdAt: row.created_at,
    ...extras,
  };
}

function mapTicketWithSla(row, extras = {}) {
  const ticket = mapSupportTicketRow(row, extras);
  const sla = getTicketSlaMeta(row);

  return {
    ...ticket,
    slaOverdue: sla.slaOverdue,
    slaHoursWaiting: sla.slaHoursWaiting,
  };
}

export async function fetchWorkshopTicketContext(supabaseAdmin, workshopId) {
  const [workshopResult, settingsResult] = await Promise.all([
    supabaseAdmin.from('workshops').select('id, name, slug, plan_key').eq('id', workshopId).maybeSingle(),
    supabaseAdmin
      .from('settings')
      .select('business_name, business_email, business_phone')
      .eq('workshop_id', workshopId)
      .maybeSingle(),
  ]);

  if (workshopResult.error) {
    throw new Error(workshopResult.error.message);
  }

  if (settingsResult.error) {
    throw new Error(settingsResult.error.message);
  }

  const workshop = workshopResult.data;
  const settings = settingsResult.data;

  if (!workshop) {
    return null;
  }

  return {
    id: workshop.id,
    name: settings?.business_name || workshop.name || 'Workshop',
    slug: workshop.slug || '',
    planKey: workshop.plan_key || '',
    businessEmail: settings?.business_email || '',
    businessPhone: settings?.business_phone || '',
  };
}

export async function listAdminTickets(supabaseAdmin, filters = {}) {
  let query = supabaseAdmin
    .from('support_tickets')
    .select('*')
    .order('updated_at', { ascending: false });

  if (filters.workshopId) {
    query = query.eq('workshop_id', filters.workshopId);
  }

  if (filters.needsReply) {
    query = query.eq('needs_cosa_reply', true);
  }

  if (filters.openOnly) {
    query = query.in('status', ['open', 'in_progress', 'waiting_on_customer']);
  }

  if (filters.closedOnly) {
    query = query.in('status', ['closed', 'resolved']);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  const tickets = data || [];
  const workshopIds = [...new Set(tickets.map((ticket) => ticket.workshop_id))];
  const workshopMap = {};

  await Promise.all(
    workshopIds.map(async (workshopId) => {
      workshopMap[workshopId] = await fetchWorkshopTicketContext(supabaseAdmin, workshopId);
    }),
  );

  return tickets
    .map((row) =>
      mapTicketWithSla(row, {
        workshop: workshopMap[row.workshop_id] || null,
      }),
    )
    .filter((ticket) => {
      if (!filters.overdueOnly) {
        return true;
      }

      return ticket.slaOverdue;
    });
}

export async function getAdminTicketDetail(supabaseAdmin, ticketId) {
  const { data: ticket, error } = await supabaseAdmin
    .from('support_tickets')
    .select('*')
    .eq('id', ticketId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!ticket) {
    return null;
  }

  const [messagesResult, workshop] = await Promise.all([
    supabaseAdmin
      .from('support_ticket_messages')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true }),
    fetchWorkshopTicketContext(supabaseAdmin, ticket.workshop_id),
  ]);

  if (messagesResult.error) {
    throw new Error(messagesResult.error.message);
  }

  const messageIds = (messagesResult.data || []).map((message) => message.id);
  const attachmentMap = await loadMessageAttachmentsMap(supabaseAdmin, messageIds);

  return {
    ticket: mapTicketWithSla(ticket, { workshop }),
    messages: (messagesResult.data || []).map((message) =>
      mapSupportMessageRow(message, {
        attachments: attachmentMap[message.id] || [],
      }),
    ),
  };
}

export async function addAdminTicketReply({
  supabaseAdmin,
  ticketId,
  authorEmail,
  authorName,
  body,
  isInternal = false,
}) {
  const { data: ticket, error: ticketError } = await supabaseAdmin
    .from('support_tickets')
    .select('*')
    .eq('id', ticketId)
    .maybeSingle();

  if (ticketError) {
    throw new Error(ticketError.message);
  }

  if (!ticket) {
    throw new Error('Support ticket not found.');
  }

  const now = new Date().toISOString();

  const { data: message, error: messageError } = await supabaseAdmin
    .from('support_ticket_messages')
    .insert({
      ticket_id: ticketId,
      workshop_id: ticket.workshop_id,
      author_email: authorEmail,
      author_name: authorName || 'COSA Support',
      body,
      is_internal: isInternal,
    })
    .select('*')
    .single();

  if (messageError) {
    throw new Error(messageError.message);
  }

  const ticketUpdate = {
    updated_at: now,
  };

  if (isInternal) {
    ticketUpdate.updated_at = now;
  } else {
    ticketUpdate.last_cosa_reply_at = now;
    ticketUpdate.needs_cosa_reply = false;
    ticketUpdate.sla_reminded_at = null;
    ticketUpdate.status =
      ticket.status === 'open' ||
      ticket.status === 'in_progress' ||
      ticket.status === 'closed' ||
      ticket.status === 'resolved'
        ? 'waiting_on_customer'
        : ticket.status;
  }

  const { data: updatedTicket, error: updateError } = await supabaseAdmin
    .from('support_tickets')
    .update(ticketUpdate)
    .eq('id', ticketId)
    .select('*')
    .single();

  if (updateError) {
    throw new Error(updateError.message);
  }

  return {
    ticket: mapSupportTicketRow(updatedTicket),
    message: mapSupportMessageRow(message),
  };
}

export async function updateAdminTicket(supabaseAdmin, ticketId, updates) {
  const payload = {
    updated_at: new Date().toISOString(),
  };

  if (updates.status) {
    payload.status = normalizeSupportStatus(updates.status);

    if (['closed', 'resolved'].includes(payload.status)) {
      payload.needs_cosa_reply = false;
    }
  }

  if (updates.priority) {
    payload.priority = normalizeSupportPriority(updates.priority);
  }

  if (typeof updates.needsCosaReply === 'boolean') {
    payload.needs_cosa_reply = updates.needsCosaReply;
  }

  const { data, error } = await supabaseAdmin
    .from('support_tickets')
    .update(payload)
    .eq('id', ticketId)
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapSupportTicketRow(data);
}

export function getAdminTicketStats(tickets) {
  return {
    total: tickets.length,
    needsReply: tickets.filter((ticket) => ticket.needsCosaReply).length,
    overdue: tickets.filter((ticket) => ticket.slaOverdue).length,
    open: tickets.filter((ticket) => !['closed', 'resolved'].includes(ticket.status)).length,
  };
}
