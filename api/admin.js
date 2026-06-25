import Stripe from 'stripe';
import { requireCosAdmin } from './shared/adminAuth.js';
import { applyBillingGrant, listBillingGrantsSafe, listRecentBillingGrants } from './shared/billingGrants.js';
import {
  deletePendingSignup,
  getPendingSignupStats,
  listPendingSignups,
} from './shared/pendingSignups.js';
import {
  completeSalesFollowUp,
  deleteSalesAppointment,
  deleteSalesFollowUp,
  getSalesCalendarStats,
  listSalesAppointments,
  listSalesFollowUps,
  saveSalesAppointment,
  saveSalesFollowUp,
} from './shared/salesCalendar.js';
import { notifyWorkshopTicketReply } from './shared/sendEmail.js';
import {
  addAdminTicketReply,
  getAdminTicketDetail,
  getAdminTicketStats,
  listAdminTickets,
  updateAdminTicket,
} from './shared/supportTickets.js';
import { addWorkshopNote, listWorkshopNotes } from './shared/workshopNotes.js';
import {
  getAdminDashboardStats,
  getWorkshopOverview,
  listWorkshopsOverview,
} from './shared/workshopOverview.js';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';

function normalizeSupportCloseStatus(value) {
  const normalized = String(value || 'closed').trim().toLowerCase();
  return normalized === 'resolved' ? 'resolved' : 'closed';
}

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
      const [billingGrants, adminNotes] = await Promise.all([
        listBillingGrantsSafe(auth.supabaseAdmin, workshopId),
        listWorkshopNotes(auth.supabaseAdmin, workshopId).catch((error) => {
          if (String(error.message || '').includes('workshop_admin_notes')) {
            return [];
          }

          throw error;
        }),
      ]);

      return response.status(200).json({ workshop, tickets, billingGrants, adminNotes });
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
        closedOnly: filter === 'closed',
        overdueOnly: filter === 'overdue',
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
    const closeAfterReply = Boolean(request.body?.closeAfterReply);
    const closeStatus = closeAfterReply
      ? normalizeSupportCloseStatus(request.body?.closeStatus)
      : '';

    if (!ticketId || !body) {
      return response.status(400).json({ error: 'ticketId and body are required.' });
    }

    try {
      let result = await addAdminTicketReply({
        supabaseAdmin: auth.supabaseAdmin,
        ticketId,
        authorEmail: auth.user.email || '',
        authorName: 'COSA Support',
        body,
        isInternal: false,
      });

      const submitterEmail =
        result.ticket?.context?.submitterEmail ||
        result.ticket?.context?.businessEmail ||
        result.ticket?.workshop?.businessEmail ||
        '';

      try {
        await notifyWorkshopTicketReply({
          to: submitterEmail,
          ticketNumber: result.ticket.ticketNumber,
          subject: result.ticket.subject,
          body,
        });
      } catch {
        // Email failure should not block ticket replies.
      }

      if (closeStatus) {
        const ticket = await updateAdminTicket(auth.supabaseAdmin, ticketId, {
          status: closeStatus,
        });
        result = { ...result, ticket };
      }

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
        needsCosaReply: request.body?.needsCosaReply,
      });

      return response.status(200).json({ ticket });
    } catch (error) {
      return response.status(500).json({ error: error.message || 'Could not update ticket.' });
    }
  }

  if (action === 'pending-signups') {
    const auth = await requireCosAdmin(request);

    if (auth.error) {
      return response.status(auth.status).json({ error: auth.error });
    }

    const filter = getFilterValue(request, 'filter') || 'pending';

    try {
      const signups = await listPendingSignups(auth.supabaseAdmin, filter);
      const stats = getPendingSignupStats(signups);

      return response.status(200).json({ signups, stats });
    } catch (error) {
      return response.status(500).json({ error: error.message || 'Could not load pending signups.' });
    }
  }

  if (action === 'delete-pending-signup') {
    const auth = await requireCosAdmin(request);

    if (auth.error) {
      return response.status(auth.status).json({ error: auth.error });
    }

    const signupId = getFilterValue(request, 'signupId');

    if (!signupId) {
      return response.status(400).json({ error: 'signupId is required.' });
    }

    try {
      await deletePendingSignup(auth.supabaseAdmin, signupId);
      return response.status(200).json({ ok: true });
    } catch (error) {
      return response.status(500).json({ error: error.message || 'Could not delete signup.' });
    }
  }

  if (action === 'billing-grants') {
    const auth = await requireCosAdmin(request);

    if (auth.error) {
      return response.status(auth.status).json({ error: auth.error });
    }

    try {
      const result = await listRecentBillingGrants(auth.supabaseAdmin);
      return response.status(200).json(result);
    } catch (error) {
      return response.status(500).json({ error: error.message || 'Could not load billing grants.' });
    }
  }

  if (action === 'apply-billing-grant') {
    const auth = await requireCosAdmin(request);

    if (auth.error) {
      return response.status(auth.status).json({ error: auth.error });
    }

    const workshopId = getFilterValue(request, 'workshopId');
    const months = request.body?.months;
    const reason = request.body?.reason;
    const supportTicketId = String(request.body?.supportTicketId || '').trim();

    if (!workshopId) {
      return response.status(400).json({ error: 'workshopId is required.' });
    }

    try {
      const grant = await applyBillingGrant({
        supabaseAdmin: auth.supabaseAdmin,
        stripe: getStripeClient(),
        workshopId,
        months,
        reason,
        supportTicketId,
        grantedByEmail: auth.user.email || '',
      });

      return response.status(200).json({ grant });
    } catch (error) {
      return response.status(500).json({ error: error.message || 'Could not apply billing grant.' });
    }
  }

  if (action === 'add-workshop-note') {
    const auth = await requireCosAdmin(request);

    if (auth.error) {
      return response.status(auth.status).json({ error: auth.error });
    }

    const workshopId = getFilterValue(request, 'workshopId');
    const body = String(request.body?.body || '').trim();

    if (!workshopId || !body) {
      return response.status(400).json({ error: 'workshopId and body are required.' });
    }

    try {
      const note = await addWorkshopNote({
        supabaseAdmin: auth.supabaseAdmin,
        workshopId,
        authorEmail: auth.user.email || '',
        body,
      });

      return response.status(200).json({ note });
    } catch (error) {
      return response.status(500).json({ error: error.message || 'Could not add workshop note.' });
    }
  }

  if (action === 'sales-calendar') {
    const auth = await requireCosAdmin(request);

    if (auth.error) {
      return response.status(auth.status).json({ error: auth.error });
    }

    const startAt = getFilterValue(request, 'startAt');
    const endAt = getFilterValue(request, 'endAt');

    try {
      const [appointments, followUps] = await Promise.all([
        listSalesAppointments(auth.supabaseAdmin, { startAt, endAt }),
        listSalesFollowUps(auth.supabaseAdmin, { status: 'pending' }),
      ]);

      return response.status(200).json({
        appointments,
        followUps,
        stats: getSalesCalendarStats(appointments, followUps),
      });
    } catch (error) {
      return response.status(500).json({
        error: error.message || 'Could not load sales calendar.',
      });
    }
  }

  if (action === 'save-sales-appointment') {
    const auth = await requireCosAdmin(request);

    if (auth.error) {
      return response.status(auth.status).json({ error: auth.error });
    }

    try {
      const appointment = await saveSalesAppointment({
        supabaseAdmin: auth.supabaseAdmin,
        appointmentId: String(request.body?.appointmentId || '').trim(),
        payload: request.body || {},
        createdByEmail: auth.user.email || '',
      });

      return response.status(200).json({ appointment });
    } catch (error) {
      return response.status(400).json({
        error: error.message || 'Could not save appointment.',
      });
    }
  }

  if (action === 'delete-sales-appointment') {
    const auth = await requireCosAdmin(request);

    if (auth.error) {
      return response.status(auth.status).json({ error: auth.error });
    }

    const appointmentId = String(request.body?.appointmentId || '').trim();

    try {
      await deleteSalesAppointment(auth.supabaseAdmin, appointmentId);
      return response.status(200).json({ success: true });
    } catch (error) {
      return response.status(400).json({
        error: error.message || 'Could not delete appointment.',
      });
    }
  }

  if (action === 'save-sales-follow-up') {
    const auth = await requireCosAdmin(request);

    if (auth.error) {
      return response.status(auth.status).json({ error: auth.error });
    }

    try {
      const followUp = await saveSalesFollowUp({
        supabaseAdmin: auth.supabaseAdmin,
        followUpId: String(request.body?.followUpId || '').trim(),
        payload: request.body || {},
        createdByEmail: auth.user.email || '',
      });

      return response.status(200).json({ followUp });
    } catch (error) {
      return response.status(400).json({
        error: error.message || 'Could not save follow-up.',
      });
    }
  }

  if (action === 'complete-sales-follow-up') {
    const auth = await requireCosAdmin(request);

    if (auth.error) {
      return response.status(auth.status).json({ error: auth.error });
    }

    const followUpId = String(request.body?.followUpId || '').trim();

    try {
      const followUp = await completeSalesFollowUp(auth.supabaseAdmin, followUpId);
      return response.status(200).json({ followUp });
    } catch (error) {
      return response.status(400).json({
        error: error.message || 'Could not complete follow-up.',
      });
    }
  }

  if (action === 'delete-sales-follow-up') {
    const auth = await requireCosAdmin(request);

    if (auth.error) {
      return response.status(auth.status).json({ error: auth.error });
    }

    const followUpId = String(request.body?.followUpId || '').trim();

    try {
      await deleteSalesFollowUp(auth.supabaseAdmin, followUpId);
      return response.status(200).json({ success: true });
    } catch (error) {
      return response.status(400).json({
        error: error.message || 'Could not delete follow-up.',
      });
    }
  }

  return response.status(400).json({
    error:
      'Unknown action. Use me, workshops, workshop, tickets, ticket, reply-ticket, internal-note, update-ticket, pending-signups, delete-pending-signup, billing-grants, apply-billing-grant, add-workshop-note, sales-calendar, save-sales-appointment, delete-sales-appointment, save-sales-follow-up, complete-sales-follow-up, or delete-sales-follow-up.',
  });
}
