const COUNT_TABLES = ['customers', 'bookings', 'invoices', 'vehicles'];

const WORKSHOP_SELECT_BASE =
  'id, name, slug, created_at, plan_key, stripe_customer_id, stripe_subscription_id, subscription_status, billing_exempt';

function isMissingLastSeenColumnError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('last_seen_at') && message.includes('does not exist');
}

async function fetchAllWorkshops(supabaseAdmin) {
  let { data, error } = await supabaseAdmin
    .from('workshops')
    .select(`${WORKSHOP_SELECT_BASE}, last_seen_at`)
    .order('created_at', { ascending: false });

  if (error && isMissingLastSeenColumnError(error)) {
    ({ data, error } = await supabaseAdmin
      .from('workshops')
      .select(WORKSHOP_SELECT_BASE)
      .order('created_at', { ascending: false }));
  }

  if (error) {
    throw new Error(error.message);
  }

  return (data || []).map((workshop) => ({
    ...workshop,
    last_seen_at: workshop.last_seen_at || null,
  }));
}

async function fetchWorkshopRow(supabaseAdmin, workshopId) {
  let { data, error } = await supabaseAdmin
    .from('workshops')
    .select(`${WORKSHOP_SELECT_BASE}, last_seen_at`)
    .eq('id', workshopId)
    .maybeSingle();

  if (error && isMissingLastSeenColumnError(error)) {
    ({ data, error } = await supabaseAdmin
      .from('workshops')
      .select(WORKSHOP_SELECT_BASE)
      .eq('id', workshopId)
      .maybeSingle());
  }

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  return {
    ...data,
    last_seen_at: data.last_seen_at || null,
  };
}

function groupCountRows(rows, workshopIdKey = 'workshop_id') {
  const counts = {};

  for (const row of rows || []) {
    const workshopId = row[workshopIdKey];
    if (!workshopId) {
      continue;
    }

    counts[workshopId] = (counts[workshopId] || 0) + 1;
  }

  return counts;
}

function buildStaffSummary(staffRows) {
  const summary = {};

  for (const row of staffRows || []) {
    const workshopId = row.workshop_id;
    if (!workshopId) {
      continue;
    }

    if (!summary[workshopId]) {
      summary[workshopId] = {
        billableCount: 0,
        technicianCount: 0,
        mainControllerEmails: [],
      };
    }

    const entry = summary[workshopId];
    const role = String(row.role || '').toLowerCase();

    if (role === 'technician') {
      entry.technicianCount += 1;
    } else {
      entry.billableCount += 1;
    }

    if (role === 'main_controller' && row.email) {
      entry.mainControllerEmails.push(row.email);
    }
  }

  return summary;
}

function buildIntegrationMap(rows, workshopIdKey = 'workshop_id') {
  const map = {};

  for (const row of rows || []) {
    const workshopId = row[workshopIdKey];
    if (workshopId) {
      map[workshopId] = true;
    }
  }

  return map;
}

function buildSettingsMap(settingsRows) {
  const map = {};

  for (const row of settingsRows || []) {
    if (!row.workshop_id) {
      continue;
    }

    map[row.workshop_id] = row;
  }

  return map;
}

const STALE_ACTIVITY_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

function getWorkshopAlerts(workshop, staffSummary, settingsRow) {
  const alerts = [];
  const status = String(workshop.subscription_status || '').toLowerCase();

  if (['past_due', 'unpaid'].includes(status)) {
    alerts.push({
      type: 'billing',
      level: 'warning',
      message: `Subscription is ${status.replace('_', ' ')}`,
    });
  }

  if (['canceled', 'suspended'].includes(status)) {
    alerts.push({
      type: 'billing',
      level: 'critical',
      message: `Subscription is ${status}`,
    });
  }

  const userLimit = Number(settingsRow?.user_limit || 5);
  const billableCount = staffSummary?.billableCount || 0;

  if (billableCount > userLimit) {
    alerts.push({
      type: 'staff',
      level: 'warning',
      message: `${billableCount} billable staff over ${userLimit} user limit`,
    });
  }

  const createdAt = workshop.created_at ? new Date(workshop.created_at) : null;
  if (createdAt) {
    const ageMs = Date.now() - createdAt.getTime();
    if (ageMs >= 0 && ageMs <= 7 * DAY_MS) {
      alerts.push({
        type: 'signup',
        level: 'info',
        message: 'New signup in the last 7 days',
      });
    }
  }

  const lastSeenAt = workshop.last_seen_at ? new Date(workshop.last_seen_at) : null;
  const activityReference = lastSeenAt || createdAt;

  if (activityReference && createdAt) {
    const accountAgeMs = Date.now() - createdAt.getTime();
    const quietMs = Date.now() - activityReference.getTime();

    if (accountAgeMs >= 7 * DAY_MS && quietMs >= STALE_ACTIVITY_DAYS * DAY_MS) {
      const quietDays = Math.floor(quietMs / DAY_MS);
      alerts.push({
        type: 'activity',
        level: 'warning',
        message: lastSeenAt
          ? `No activity for ${quietDays} days`
          : 'No recorded activity yet',
      });
    }
  }

  return alerts;
}

export function shouldHideFromAdminOverview(workshop) {
  if (workshop.slug === 'default') {
    return true;
  }

  const staffCount = workshop.staff.billableCount + workshop.staff.technicianCount;
  const usageCount =
    workshop.usage.customers +
    workshop.usage.bookings +
    workshop.usage.invoices +
    workshop.usage.vehicles;
  const hasBilling =
    workshop.stripeCustomerId || workshop.stripeSubscriptionId || workshop.planKey;

  if (
    staffCount > 0 ||
    usageCount > 0 ||
    hasBilling ||
    workshop.primaryContact ||
    workshop.billingExempt
  ) {
    return false;
  }

  return true;
}

function mapWorkshopSummary(workshop, context) {
  const settingsRow = context.settingsMap[workshop.id] || null;
  const staffSummary = context.staffSummary[workshop.id] || {
    billableCount: 0,
    technicianCount: 0,
    mainControllerEmails: [],
  };

  const primaryContact =
    staffSummary.mainControllerEmails[0] ||
    settingsRow?.business_email ||
    '';

  return {
    id: workshop.id,
    name: workshop.name || settingsRow?.business_name || 'Unnamed workshop',
    slug: workshop.slug || '',
    createdAt: workshop.created_at || null,
    lastSeenAt: workshop.last_seen_at || null,
    planKey: workshop.plan_key || '',
    subscriptionStatus: workshop.subscription_status || 'active',
    billingExempt: Boolean(workshop.billing_exempt),
    stripeCustomerId: workshop.stripe_customer_id || '',
    stripeSubscriptionId: workshop.stripe_subscription_id || '',
    primaryContact,
    business: {
      name: settingsRow?.business_name || workshop.name || '',
      abn: settingsRow?.business_abn || '',
      phone: settingsRow?.business_phone || '',
      email: settingsRow?.business_email || '',
      address: settingsRow?.business_address || '',
    },
    staff: {
      billableCount: staffSummary.billableCount,
      technicianCount: staffSummary.technicianCount,
      userLimit: Number(settingsRow?.user_limit || 5),
      mainControllerEmails: staffSummary.mainControllerEmails,
    },
    usage: {
      customers: context.counts.customers[workshop.id] || 0,
      bookings: context.counts.bookings[workshop.id] || 0,
      invoices: context.counts.invoices[workshop.id] || 0,
      vehicles: context.counts.vehicles[workshop.id] || 0,
    },
    integrations: {
      xero: Boolean(context.integrations.xero[workshop.id]),
      quickbooks: Boolean(context.integrations.quickbooks[workshop.id]),
      podium: Boolean(context.integrations.podium[workshop.id]),
      gohighlevel: Boolean(context.integrations.gohighlevel[workshop.id]),
    },
    alerts: getWorkshopAlerts(workshop, staffSummary, settingsRow),
  };
}

async function fetchWorkshopContext(supabaseAdmin, workshopIds) {
  const [
    settingsResult,
    staffResult,
    xeroResult,
    quickbooksResult,
    podiumResult,
    ghlResult,
    ...countResults
  ] = await Promise.all([
    supabaseAdmin
      .from('settings')
      .select(
        'workshop_id, business_name, business_abn, business_phone, business_email, business_address, user_limit',
      )
      .in('workshop_id', workshopIds),
    supabaseAdmin
      .from('staff')
      .select('workshop_id, role, email')
      .in('workshop_id', workshopIds)
      .or('active.is.null,active.eq.true'),
    supabaseAdmin.from('workshop_xero_connections').select('workshop_id').in('workshop_id', workshopIds),
    supabaseAdmin
      .from('workshop_quickbooks_connections')
      .select('workshop_id')
      .in('workshop_id', workshopIds),
    supabaseAdmin.from('workshop_podium_connections').select('workshop_id').in('workshop_id', workshopIds),
    supabaseAdmin.from('workshop_ghl_connections').select('workshop_id').in('workshop_id', workshopIds),
    ...COUNT_TABLES.map((tableName) =>
      workshopIds.length
        ? supabaseAdmin.from(tableName).select('workshop_id').in('workshop_id', workshopIds)
        : Promise.resolve({ data: [], error: null }),
    ),
  ]);

  for (const result of [
    settingsResult,
    staffResult,
    xeroResult,
    quickbooksResult,
    podiumResult,
    ghlResult,
    ...countResults,
  ]) {
    if (result.error) {
      throw new Error(result.error.message);
    }
  }

  const counts = {};
  COUNT_TABLES.forEach((tableName, index) => {
    counts[tableName] = groupCountRows(countResults[index].data);
  });

  return {
    settingsMap: buildSettingsMap(settingsResult.data),
    staffSummary: buildStaffSummary(staffResult.data),
    counts,
    integrations: {
      xero: buildIntegrationMap(xeroResult.data),
      quickbooks: buildIntegrationMap(quickbooksResult.data),
      podium: buildIntegrationMap(podiumResult.data),
      gohighlevel: buildIntegrationMap(ghlResult.data),
    },
  };
}

export async function listWorkshopsOverview(supabaseAdmin) {
  const workshops = await fetchAllWorkshops(supabaseAdmin);
  const workshopIds = workshops.map((workshop) => workshop.id);
  const context = await fetchWorkshopContext(supabaseAdmin, workshopIds);

  return workshops
    .map((workshop) => mapWorkshopSummary(workshop, context))
    .filter((workshop) => !shouldHideFromAdminOverview(workshop));
}

async function fetchStripeBilling(stripe, workshop) {
  if (!stripe || !workshop.stripe_subscription_id) {
    return {
      nextPaymentAt: null,
      billingCycle: '',
      stripeStatus: '',
      stripeDashboardCustomerUrl: workshop.stripe_customer_id
        ? `https://dashboard.stripe.com/customers/${workshop.stripe_customer_id}`
        : '',
      stripeDashboardSubscriptionUrl: '',
    };
  }

  try {
    const subscription = await stripe.subscriptions.retrieve(workshop.stripe_subscription_id);
    const interval = subscription.items?.data?.[0]?.price?.recurring?.interval || '';

    return {
      nextPaymentAt: subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000).toISOString()
        : null,
      billingCycle: interval === 'year' ? 'yearly' : interval === 'month' ? 'monthly' : interval,
      stripeStatus: subscription.status || '',
      stripeDashboardCustomerUrl: workshop.stripe_customer_id
        ? `https://dashboard.stripe.com/customers/${workshop.stripe_customer_id}`
        : '',
      stripeDashboardSubscriptionUrl: `https://dashboard.stripe.com/subscriptions/${workshop.stripe_subscription_id}`,
    };
  } catch (error) {
    return {
      nextPaymentAt: null,
      billingCycle: '',
      stripeStatus: '',
      stripeError: error.message || 'Could not load Stripe subscription.',
      stripeDashboardCustomerUrl: workshop.stripe_customer_id
        ? `https://dashboard.stripe.com/customers/${workshop.stripe_customer_id}`
        : '',
      stripeDashboardSubscriptionUrl: workshop.stripe_subscription_id
        ? `https://dashboard.stripe.com/subscriptions/${workshop.stripe_subscription_id}`
        : '',
    };
  }
}

export async function getWorkshopOverview(supabaseAdmin, workshopId, stripe) {
  const workshop = await fetchWorkshopRow(supabaseAdmin, workshopId);

  if (!workshop) {
    return null;
  }

  const context = await fetchWorkshopContext(supabaseAdmin, [workshop.id]);
  const summary = mapWorkshopSummary(workshop, context);
  const billing = await fetchStripeBilling(stripe, workshop);

  const { data: staffRows, error: staffError } = await supabaseAdmin
    .from('staff')
    .select('id, first_name, last_name, email, role, active, created_at')
    .eq('workshop_id', workshop.id)
    .order('created_at', { ascending: true });

  if (staffError) {
    throw new Error(staffError.message);
  }

  return {
    ...summary,
    billing,
    staffMembers: (staffRows || []).map((row) => ({
      id: row.id,
      name: [row.first_name, row.last_name].filter(Boolean).join(' ') || row.email || 'Staff',
      email: row.email || '',
      role: row.role || 'staff',
      active: Boolean(row.active),
    })),
  };
}

export async function getAdminDashboardStats(workshops) {
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;

  return {
    totalWorkshops: workshops.length,
    activeSubscriptions: workshops.filter(
      (workshop) =>
        !workshop.billingExempt &&
        !['canceled', 'suspended', 'unpaid'].includes(workshop.subscriptionStatus),
    ).length,
    billingIssues: workshops.filter((workshop) =>
      ['past_due', 'unpaid', 'canceled', 'suspended'].includes(workshop.subscriptionStatus),
    ).length,
    newSignups: workshops.filter((workshop) => {
      if (!workshop.createdAt) {
        return false;
      }

      const createdAt = new Date(workshop.createdAt).getTime();
      return now - createdAt <= weekMs;
    }).length,
    overUserLimit: workshops.filter((workshop) =>
      workshop.alerts.some((alert) => alert.type === 'staff'),
    ).length,
    staleActivity: workshops.filter((workshop) =>
      workshop.alerts.some((alert) => alert.type === 'activity'),
    ).length,
  };
}
