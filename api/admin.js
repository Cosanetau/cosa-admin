import Stripe from 'stripe';
import { requireCosAdmin } from './shared/adminAuth.js';
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

    const workshopId = String(
      request.query?.workshopId || request.body?.workshopId || '',
    ).trim();

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

      return response.status(200).json({ workshop });
    } catch (error) {
      return response.status(500).json({ error: error.message || 'Could not load workshop.' });
    }
  }

  return response.status(400).json({
    error: 'Unknown action. Use me, workshops, or workshop.',
  });
}
