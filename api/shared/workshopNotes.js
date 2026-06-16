export function mapWorkshopNoteRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    workshopId: row.workshop_id,
    authorEmail: row.author_email || '',
    body: row.body || '',
    createdAt: row.created_at,
  };
}

export async function listWorkshopNotes(supabaseAdmin, workshopId) {
  const { data, error } = await supabaseAdmin
    .from('workshop_admin_notes')
    .select('*')
    .eq('workshop_id', workshopId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data || []).map(mapWorkshopNoteRow);
}

export async function addWorkshopNote({
  supabaseAdmin,
  workshopId,
  authorEmail,
  body,
}) {
  const trimmedBody = String(body || '').trim();

  if (!trimmedBody) {
    throw new Error('Note text is required.');
  }

  const { data, error } = await supabaseAdmin
    .from('workshop_admin_notes')
    .insert({
      workshop_id: workshopId,
      author_email: authorEmail,
      body: trimmedBody,
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapWorkshopNoteRow(data);
}
