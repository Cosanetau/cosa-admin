import Stripe from 'stripe';
import { requireCosAdmin } from './shared/adminAuth.js';
import {
  addAdminTicketReply,
  getAdminTicketDetail,
  getAdminTicketStats,
  listAdminTickets,
  updateAdminTicket,
} from './shared/supportTickets.js';
import {
  getAdminDashboardStats,
  getWorkshopOverview,
  listWorkshopsOverview,
} from './shared/workshopOverview.js';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';

function getAction(request) {
  if (request.query?.action) {
    return String(request.query.action).trim();
  }

  if (request.url) {
    try {
      const url = new URL(request.url, 'https://admin.cosa.net.au');
      const action = url.searchParams.get('action')?.trim();
      if (action) {
        return action;
      }
    } catch {
      // Fall through to body lookup for POST requests.
    }
  }

  if (request.method === 'GET' || request.method === 'HEAD') {
    return '';
  }

  return String(request.body?.action || '').trim();
}

function getStripeClient() {
  if (!stripeSecretKey) {
    return null;
  }

  return new Stripe(stripeSecretKey);
}

function getFilterValue(request, key) {
  return String(request.query?.[key] || request.body?.[key] || '').trim();
}

export default async function handler(request, response) {
  const action = getAction(request);

  if (action === 'me') {
    const auth = await requireCosAdmin(request);

    if (auth.error) {
      return response.status(auth.status).json({ error: auth.error });
    }

    return response.status(200).json({
      email: auth.user.email || '',
      userId: auth.user.id,
    });
  }

  if (action === 'workshops') {
    const auth = await requireCosAdmin(request);

    if (auth.error) {
      return response.status(auth.status).json({ error: auth.error });
    }

    try {
      const workshops = await listWorkshopsOverview(auth.supabaseAdmin);
      const stats = await getAdminDashboardStats(workshops);

      return response.status(200).json({ workshops, stats });
    } catch (error) {
      return response.status(500).json({ error: error.message || 'Could not load workshops.' });
    }
  }

  if (action === 'workshop') {
    const auth = await requireCosAdmin(request);

    if (auth.error) {
      return response.status(auth.status).json({ error: auth.error });
    }

    const workshopId = getFilterValue(request, 'workshopId');

    if (!workshopId) {
      return response.status(400).json({ error: 'workshopId is required.' });
    }

    try {
      const workshop = await getWorkshopOverview(
        auth.supabaseAdmin,
        workshopId,
        getStripeClient(),
      );

      if (!workshop) {
        return response.status(404).json({ error: 'Workshop not found.' });
      }

      const tickets = await listAdminTickets(auth.supabaseAdmin, { workshopId });

      return response.status(200).json({ workshop, tickets });
    } catch (error) {
      return response.status(500).json({ error: error.message || 'Could not load workshop.' });
    }
  }

  if (action === 'tickets') {
    const auth = await requireCosAdmin(request);

    if (auth.error) {
      return response.status(auth.status).json({ error: auth.error });
    }

    const filter = getFilterValue(request, 'filter');
    const workshopId = getFilterValue(request, 'workshopId');

    try {
      const tickets = await listAdminTickets(auth.supabaseAdmin, {
        workshopId: workshopId || '',
        needsReply: filter === 'needs_reply',
        openOnly: filter === 'open',
      });
      const stats = getAdminTicketStats(tickets);

      return response.status(200).json({ tickets, stats });
    } catch (error) {
      return response.status(500).json({ error: error.message || 'Could not load tickets.' });
    }
  }

  if (action === 'ticket') {
    const auth = await requireCosAdmin(request);

    if (auth.error) {
      return response.status(auth.status).json({ error: auth.error });
    }

    const ticketId = getFilterValue(request, 'ticketId');

    if (!ticketId) {
      return response.status(400).json({ error: 'ticketId is required.' });
    }

    try {
      const detail = await getAdminTicketDetail(auth.supabaseAdmin, ticketId);

      if (!detail) {
        return response.status(404).json({ error: 'Support ticket not found.' });
      }

      return response.status(200).json(detail);
    } catch (error) {
      return response.status(500).json({ error: error.message || 'Could not load ticket.' });
    }
  }

  if (action === 'reply-ticket') {
    const auth = await requireCosAdmin(request);

    if (auth.error) {
      return response.status(auth.status).json({ error: auth.error });
    }

    const ticketId = getFilterValue(request, 'ticketId');
    const body = String(request.body?.body || '').trim();

    if (!ticketId || !body) {
      return response.status(400).json({ error: 'ticketId and body are required.' });
    }

    try {
      const result = await addAdminTicketReply({
        supabaseAdmin: auth.supabaseAdmin,
        ticketId,
        authorEmail: auth.user.email || '',
        authorName: 'COSA Support',
        body,
        isInternal: false,
      });

      return response.status(200).json(result);
    } catch (error) {
      return response.status(500).json({ error: error.message || 'Could not reply to ticket.' });
    }
  }

  if (action === 'internal-note') {
    const auth = await requireCosAdmin(request);

    if (auth.error) {
      return response.status(auth.status).json({ error: auth.error });
    }

    const ticketId = getFilterValue(request, 'ticketId');
    const body = String(request.body?.body || '').trim();

    if (!ticketId || !body) {
      return response.status(400).json({ error: 'ticketId and body are required.' });
    }

    try {
      const result = await addAdminTicketReply({
        supabaseAdmin: auth.supabaseAdmin,
        ticketId,
        authorEmail: auth.user.email || '',
        authorName: 'COSA Support',
        body,
        isInternal: true,
      });

      return response.status(200).json(result);
    } catch (error) {
      return response.status(500).json({ error: error.message || 'Could not add internal note.' });
    }
  }

  if (action === 'update-ticket') {
    const auth = await requireCosAdmin(request);

    if (auth.error) {
      return response.status(auth.status).json({ error: auth.error });
    }

    const ticketId = getFilterValue(request, 'ticketId');

    if (!ticketId) {
      return response.status(400).json({ error: 'ticketId is required.' });
    }

    try {
      const ticket = await updateAdminTicket(auth.supabaseAdmin, ticketId, {
        status: request.body?.status,
        priority: request.body?.priority,
      });

      return response.status(200).json({ ticket });
    } catch (error) {
      return response.status(500).json({ error: error.message || 'Could not update ticket.' });
    }
  }

  return response.status(400).json({
    error:
      'Unknown action. Use me, workshops, workshop, tickets, ticket, reply-ticket, internal-note, or update-ticket.',
  });
}
