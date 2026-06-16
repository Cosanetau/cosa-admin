import { supabase } from '../lib/supabase';

async function getAccessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('You must be logged in to use COSA Admin.');
  }

  return session.access_token;
}

async function adminRequest(action, options = {}) {
  const accessToken = await getAccessToken();
  const params = new URLSearchParams({ action });

  if (options.workshopId) {
    params.set('workshopId', options.workshopId);
  }

  if (options.ticketId) {
    params.set('ticketId', options.ticketId);
  }

  if (options.filter) {
    params.set('filter', options.filter);
  }

  if (options.signupId) {
    params.set('signupId', options.signupId);
  }

  const method = options.method || (options.body ? 'POST' : 'GET');

  const response = await fetch(`/api/admin?${params.toString()}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body:
      method === 'POST'
        ? JSON.stringify({
            action,
            ticketId: options.ticketId,
            workshopId: options.workshopId,
            signupId: options.signupId,
            ...options.body,
          })
        : undefined,
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || 'Admin request failed.');
  }

  return payload;
}

export function fetchAdminMe(accessToken) {
  const params = new URLSearchParams({ action: 'me' });

  return fetch(`/api/admin?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  }).then(async (response) => {
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.error || 'Admin access check failed.');
    }

    return payload;
  });
}

export function fetchWorkshopsOverview() {
  return adminRequest('workshops');
}

export function fetchWorkshopDetail(workshopId) {
  return adminRequest('workshop', { workshopId });
}

export function fetchTickets(filter = 'needs_reply') {
  return adminRequest('tickets', { filter });
}

export function fetchTicketDetail(ticketId) {
  return adminRequest('ticket', { ticketId });
}

export function replyToTicket(ticketId, body, options = {}) {
  return adminRequest('reply-ticket', {
    method: 'POST',
    ticketId,
    body: {
      body,
      closeAfterReply: Boolean(options.closeAfterReply),
      closeStatus: options.closeStatus || 'resolved',
    },
  });
}

export function closeTicket(ticketId, status = 'closed') {
  return adminRequest('update-ticket', {
    method: 'POST',
    ticketId,
    body: { status },
  });
}

export function reopenTicket(ticketId) {
  return adminRequest('update-ticket', {
    method: 'POST',
    ticketId,
    body: { status: 'open', needsCosaReply: false },
  });
}

export function addTicketInternalNote(ticketId, body) {
  return adminRequest('internal-note', {
    method: 'POST',
    ticketId,
    body: { body },
  });
}

export function updateTicket(ticketId, payload) {
  return adminRequest('update-ticket', {
    method: 'POST',
    ticketId,
    body: payload,
  });
}

export function fetchPendingSignups(filter = 'pending') {
  return adminRequest('pending-signups', { filter });
}

export function deletePendingSignup(signupId) {
  return adminRequest('delete-pending-signup', {
    method: 'POST',
    signupId,
  });
}

export function applyBillingGrant(workshopId, payload) {
  return adminRequest('apply-billing-grant', {
    method: 'POST',
    workshopId,
    body: payload,
  });
}

export function addWorkshopNote(workshopId, body) {
  return adminRequest('add-workshop-note', {
    method: 'POST',
    workshopId,
    body: { body },
  });
}
