export function mapPendingSignupRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    stripeSessionId: row.stripe_session_id || '',
    businessName: row.business_name || '',
    firstName: row.first_name || '',
    lastName: row.last_name || '',
    email: row.email || '',
    planKey: row.plan_key || '',
    userLimit: row.user_limit || 0,
    billingCycle: row.billing_cycle || '',
    status: row.status || 'pending',
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

export async function listPendingSignups(supabaseAdmin, filter = 'pending') {
  let query = supabaseAdmin
    .from('pending_signups')
    .select('*')
    .order('created_at', { ascending: false });

  if (filter === 'pending') {
    query = query.eq('status', 'pending');
  } else if (filter === 'completed') {
    query = query.eq('status', 'completed');
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return (data || []).map(mapPendingSignupRow);
}

export function getPendingSignupStats(signups) {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  return {
    total: signups.length,
    pending: signups.filter((signup) => signup.status === 'pending').length,
    last24Hours: signups.filter((signup) => {
      const createdAt = signup.createdAt ? new Date(signup.createdAt).getTime() : 0;
      return signup.status === 'pending' && now - createdAt <= dayMs;
    }).length,
  };
}
