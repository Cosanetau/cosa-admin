const DEFAULT_FROM =
  process.env.COSA_FROM_EMAIL || 'COSA Core <notifications@cosa.net.au>';

export async function sendEmail({ to, subject, html, text }) {
  const apiKey = process.env.RESEND_API_KEY || '';
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);

  if (!apiKey || recipients.length === 0) {
    return { sent: false, skipped: true };
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: DEFAULT_FROM,
      to: recipients,
      subject,
      html,
      text: text || html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.message || payload.error || 'Email could not be sent.');
  }

  return { sent: true, id: payload.id || null };
}

export async function notifyWorkshopTicketReply({
  to,
  ticketNumber,
  subject,
  body,
}) {
  if (!to) {
    return { sent: false, skipped: true };
  }

  return sendEmail({
    to,
    subject: `[COSA Support] Reply on ${ticketNumber}`,
    html: `
      <p>COSA replied to your support ticket <strong>${ticketNumber}</strong>.</p>
      <p><strong>${subject}</strong></p>
      <p>${body.replace(/\n/g, '<br />')}</p>
      <p>Sign in to COSA Core to view the full thread.</p>
    `,
  });
}
