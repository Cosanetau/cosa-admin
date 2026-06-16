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

  const response = await fetch(`/api/admin?${params.toString()}`, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
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
  })
    .then(async (response) => {
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
