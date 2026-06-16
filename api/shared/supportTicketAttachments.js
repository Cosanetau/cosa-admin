export const SUPPORT_ATTACHMENT_BUCKET = 'support-ticket-attachments';
export const SUPPORT_ATTACHMENT_SIGNED_URL_TTL = 60 * 60;

export function getSupportSlaHours() {
  const parsed = Number(process.env.COSA_SUPPORT_SLA_HOURS || 24);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 24;
}

export function mapSupportAttachmentRow(row, extras = {}) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    ticketId: row.ticket_id,
    messageId: row.message_id,
    workshopId: row.workshop_id,
    storagePath: row.storage_path,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes || 0),
    createdAt: row.created_at,
    ...extras,
  };
}

export function isMissingSupportAttachmentsTableError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('support_ticket_attachments') && message.includes('does not exist');
}

export function getTicketSlaMeta(ticket, slaHours = getSupportSlaHours()) {
  if (!ticket?.needs_cosa_reply || !ticket?.last_customer_reply_at) {
    return {
      slaOverdue: false,
      slaHoursWaiting: 0,
    };
  }

  if (['closed', 'resolved'].includes(String(ticket.status || '').toLowerCase())) {
    return {
      slaOverdue: false,
      slaHoursWaiting: 0,
    };
  }

  const ageMs = Date.now() - new Date(ticket.last_customer_reply_at).getTime();
  const slaMs = slaHours * 60 * 60 * 1000;

  return {
    slaOverdue: ageMs >= slaMs,
    slaHoursWaiting: Math.max(0, Math.floor(ageMs / (60 * 60 * 1000))),
  };
}

export function enrichSupportTicketRow(row, extras = {}) {
  const ticket = {
    id: row.id,
    workshop_id: row.workshop_id,
    ticket_number: row.ticket_number,
    subject: row.subject,
    category: row.category,
    priority: row.priority,
    status: row.status,
    context: row.context,
    created_by_staff_id: row.created_by_staff_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_customer_reply_at: row.last_customer_reply_at,
    last_cosa_reply_at: row.last_cosa_reply_at,
    needs_cosa_reply: row.needs_cosa_reply,
    sla_reminded_at: row.sla_reminded_at,
  };

  return {
    ticket,
    sla: getTicketSlaMeta(ticket),
    ...extras,
  };
}

function sanitizeFileName(fileName) {
  return String(fileName || 'attachment')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 180);
}

export function buildSupportAttachmentPath({
  workshopId,
  ticketId,
  messageId,
  fileName,
}) {
  return `${workshopId}/${ticketId}/${messageId}/${Date.now()}-${sanitizeFileName(fileName)}`;
}

export function validateSupportAttachmentPath({
  workshopId,
  ticketId,
  messageId,
  storagePath,
}) {
  const normalizedPath = String(storagePath || '').trim();
  const expectedPrefix = `${workshopId}/${ticketId}/${messageId}/`;

  if (!normalizedPath.startsWith(expectedPrefix)) {
    throw new Error('Attachment path is not valid for this ticket.');
  }

  if (normalizedPath.includes('..')) {
    throw new Error('Attachment path is not valid.');
  }

  return normalizedPath;
}

export async function listAttachmentsForMessages(supabaseAdmin, messageIds) {
  if (!messageIds.length) {
    return [];
  }

  const { data, error } = await supabaseAdmin
    .from('support_ticket_attachments')
    .select('*')
    .in('message_id', messageIds)
    .order('created_at', { ascending: true });

  if (error) {
    if (isMissingSupportAttachmentsTableError(error)) {
      return [];
    }

    throw new Error(error.message);
  }

  return (data || []).map((row) => mapSupportAttachmentRow(row));
}

export async function attachSignedUrls(supabaseAdmin, attachments) {
  const results = [];

  for (const attachment of attachments) {
    const { data, error } = await supabaseAdmin.storage
      .from(SUPPORT_ATTACHMENT_BUCKET)
      .createSignedUrl(attachment.storagePath, SUPPORT_ATTACHMENT_SIGNED_URL_TTL);

    results.push(
      mapSupportAttachmentRow(
        {
          id: attachment.id,
          ticket_id: attachment.ticketId,
          message_id: attachment.messageId,
          workshop_id: attachment.workshopId,
          storage_path: attachment.storagePath,
          file_name: attachment.fileName,
          mime_type: attachment.mimeType,
          size_bytes: attachment.sizeBytes,
          created_at: attachment.createdAt,
        },
        {
          url: error ? '' : data?.signedUrl || '',
        },
      ),
    );
  }

  return results;
}

export async function registerSupportTicketAttachments({
  supabaseAdmin,
  workshopId,
  ticketId,
  messageId,
  attachments,
}) {
  if (!attachments?.length) {
    return [];
  }

  const rows = attachments.map((attachment) => {
    const storagePath = validateSupportAttachmentPath({
      workshopId,
      ticketId,
      messageId,
      storagePath: attachment.storagePath,
    });

    return {
      ticket_id: ticketId,
      message_id: messageId,
      workshop_id: workshopId,
      storage_path: storagePath,
      file_name: String(attachment.fileName || 'attachment').slice(0, 255),
      mime_type: String(attachment.mimeType || 'application/octet-stream').slice(0, 120),
      size_bytes: Number(attachment.sizeBytes || 0),
    };
  });

  const { data, error } = await supabaseAdmin
    .from('support_ticket_attachments')
    .insert(rows)
    .select('*');

  if (error) {
    throw new Error(error.message);
  }

  return attachSignedUrls(supabaseAdmin, (data || []).map(mapSupportAttachmentRow));
}

export function groupAttachmentsByMessageId(attachments) {
  const grouped = {};

  for (const attachment of attachments) {
    if (!grouped[attachment.messageId]) {
      grouped[attachment.messageId] = [];
    }

    grouped[attachment.messageId].push(attachment);
  }

  return grouped;
}

export async function loadMessageAttachmentsMap(supabaseAdmin, messageIds) {
  const attachments = await listAttachmentsForMessages(supabaseAdmin, messageIds);
  const withUrls = await attachSignedUrls(supabaseAdmin, attachments);
  return groupAttachmentsByMessageId(withUrls);
}
