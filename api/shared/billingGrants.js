const COUPON_BY_MONTHS = {
  1: process.env.STRIPE_COUPON_FREE_1MO || 'COSA_FREE_1MO',
  2: process.env.STRIPE_COUPON_FREE_2MO || 'COSA_FREE_2MO',
  3: process.env.STRIPE_COUPON_FREE_3MO || 'COSA_FREE_3MO',
};

function addMonths(date, months) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

export function getBillingGrantCouponId(months) {
  return COUPON_BY_MONTHS[Number(months)] || '';
}

export function mapBillingGrantRow(row, extras = {}) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    workshopId: row.workshop_id,
    months: row.months,
    reason: row.reason,
    supportTicketId: row.support_ticket_id || '',
    stripeCouponId: row.stripe_coupon_id || '',
    grantedByEmail: row.granted_by_email || '',
    grantedAt: row.granted_at,
    effectiveUntil: row.effective_until,
    status: row.status || 'active',
    ...extras,
  };
}

export function isMissingBillingGrantsTableError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('workshop_billing_grants') && message.includes('does not exist');
}

export async function listBillingGrantsSafe(supabaseAdmin, workshopId) {
  try {
    return await listBillingGrants(supabaseAdmin, workshopId);
  } catch (error) {
    if (isMissingBillingGrantsTableError(error)) {
      return [];
    }

    throw error;
  }
}

export async function listBillingGrants(supabaseAdmin, workshopId) {
  const { data, error } = await supabaseAdmin
    .from('workshop_billing_grants')
    .select('*')
    .eq('workshop_id', workshopId)
    .order('granted_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data || []).map(mapBillingGrantRow);
}

export async function applyBillingGrant({
  supabaseAdmin,
  stripe,
  workshopId,
  months,
  reason,
  supportTicketId,
  grantedByEmail,
}) {
  const parsedMonths = Number(months);

  if (![1, 2, 3].includes(parsedMonths)) {
    throw new Error('Free months must be 1, 2, or 3.');
  }

  const trimmedReason = String(reason || '').trim();
  if (!trimmedReason) {
    throw new Error('A reason is required for billing grants.');
  }

  const { data: workshop, error: workshopError } = await supabaseAdmin
    .from('workshops')
    .select('id, stripe_subscription_id, billing_exempt, subscription_status')
    .eq('id', workshopId)
    .maybeSingle();

  if (workshopError) {
    throw new Error(workshopError.message);
  }

  if (!workshop) {
    throw new Error('Workshop not found.');
  }

  if (workshop.billing_exempt || workshop.subscription_status === 'complimentary') {
    throw new Error('This workshop is already billing exempt.');
  }

  if (!workshop.stripe_subscription_id) {
    throw new Error('This workshop has no Stripe subscription to grant free months on.');
  }

  if (!stripe) {
    throw new Error('Stripe is not configured.');
  }

  const couponId = getBillingGrantCouponId(parsedMonths);
  if (!couponId) {
    throw new Error('Stripe coupon is not configured for this grant length.');
  }

  const subscription = await stripe.subscriptions.update(workshop.stripe_subscription_id, {
    discounts: [{ coupon: couponId }],
  });

  const effectiveUntil = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : addMonths(new Date(), parsedMonths).toISOString();

  const { data: grant, error: grantError } = await supabaseAdmin
    .from('workshop_billing_grants')
    .insert({
      workshop_id: workshopId,
      months: parsedMonths,
      reason: trimmedReason,
      support_ticket_id: supportTicketId || null,
      stripe_coupon_id: couponId,
      granted_by_email: grantedByEmail,
      effective_until: effectiveUntil,
      status: 'active',
    })
    .select('*')
    .single();

  if (grantError) {
    throw new Error(grantError.message);
  }

  return mapBillingGrantRow(grant);
}

export async function listRecentBillingGrants(supabaseAdmin, limit = 40) {
  const { data, error } = await supabaseAdmin
    .from('workshop_billing_grants')
    .select('*')
    .order('granted_at', { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingBillingGrantsTableError(error)) {
      return { grants: [], tableReady: false };
    }

    throw new Error(error.message);
  }

  const grants = (data || []).map((row) => mapBillingGrantRow(row));
  const workshopIds = [...new Set(grants.map((grant) => grant.workshopId).filter(Boolean))];
  const workshopNames = {};

  if (workshopIds.length) {
    const { data: workshops, error: workshopError } = await supabaseAdmin
      .from('workshops')
      .select('id, name')
      .in('id', workshopIds);

    if (workshopError) {
      throw new Error(workshopError.message);
    }

    for (const workshop of workshops || []) {
      workshopNames[workshop.id] = workshop.name || 'Workshop';
    }
  }

  return {
    tableReady: true,
    grants: grants.map((grant) => ({
      ...grant,
      workshopName: workshopNames[grant.workshopId] || 'Workshop',
    })),
  };
}
