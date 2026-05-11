// =============================================
// server/lib/email.js — Resend Email Helper
// =============================================
const { Resend } = require('resend');
const supabase = require('./supabase');

const APP_URL = 'https://lgu-system-eight.vercel.app';

// Lazy init — prevents startup crash if env var is not yet set
let _resend = null;
function getResend() {
  if (!_resend) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY environment variable is not set.');
    }
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

/**
 * Fetches all registered student emails from the profiles table.
 */
async function getAllStudentEmails() {
  const { data, error } = await supabase
    .from('profiles')
    .select('email:id, full_name')
    .neq('role', 'admin');

  if (error) {
    // Fallback: get from auth users via service role
    const { data: users } = await supabase.auth.admin.listUsers();
    return (users?.users || []).map(u => u.email).filter(Boolean);
  }

  // Get emails via auth admin
  const { data: users } = await supabase.auth.admin.listUsers();
  return (users?.users || []).map(u => u.email).filter(Boolean);
}

/**
 * Sends an announcement notification email to all students.
 */
async function sendAnnouncementEmail(title, body) {
  try {
    const emails = await getAllStudentEmails();
    if (!emails.length) return { sent: 0 };

    const html = buildEmailTemplate({
      subject: `📢 ${title}`,
      preheader: body.slice(0, 100),
      content: `
        <h2 style="margin:0 0 12px;color:#1a1f35;font-size:20px;">${title}</h2>
        <p style="margin:0 0 20px;color:#4a5568;line-height:1.7;white-space:pre-wrap;">${body}</p>
        <a href="${APP_URL}" style="display:inline-block;background:#6384ff;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">
          View Dashboard →
        </a>
      `
    });

    // Resend supports batch up to 100 recipients
    const batches = chunkArray(emails, 50);
    let sent = 0;
    for (const batch of batches) {
      await getResend().emails.send({
        from: process.env.RESEND_FROM || 'COE Budget System <onboarding@resend.dev>',
        to: batch,
        subject: `[COE LGU] ${title}`,
        html
      });
      sent += batch.length;
    }
    console.log(`[Email] Announcement sent to ${sent} recipients.`);
    return { sent };
  } catch (err) {
    console.error('[Email] Failed to send announcement:', err.message);
    return { sent: 0, error: err.message };
  }
}

/**
 * Sends a new event notification email to all students.
 */
async function sendNewEventEmail(event) {
  try {
    const emails = await getAllStudentEmails();
    if (!emails.length) return { sent: 0 };

    const html = buildEmailTemplate({
      subject: `🎯 New Event: ${event.event_name}`,
      preheader: `A new event has been added to the COE LGU system.`,
      content: `
        <h2 style="margin:0 0 8px;color:#1a1f35;font-size:20px;">${event.event_name}</h2>
        ${event.event_date ? `<p style="margin:0 0 8px;color:#6384ff;font-size:0.9rem;">📅 ${new Date(event.event_date).toLocaleDateString('en-PH', { year:'numeric', month:'long', day:'numeric' })}</p>` : ''}
        ${event.description ? `<p style="margin:0 0 16px;color:#4a5568;line-height:1.7;">${event.description}</p>` : ''}
        <p style="margin:0 0 20px;color:#4a5568;">Allocated Budget: <strong>₱${Number(event.allocated_budget || 0).toLocaleString('en-PH', {minimumFractionDigits:2})}</strong></p>
        <a href="${APP_URL}" style="display:inline-block;background:#6384ff;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">
          View Event →
        </a>
      `
    });

    const batches = chunkArray(emails, 50);
    let sent = 0;
    for (const batch of batches) {
      await getResend().emails.send({
        from: process.env.RESEND_FROM || 'COE Budget System <onboarding@resend.dev>',
        to: batch,
        subject: `[COE LGU] New Event: ${event.event_name}`,
        html
      });
      sent += batch.length;
    }
    console.log(`[Email] New event notification sent to ${sent} recipients.`);
    return { sent };
  } catch (err) {
    console.error('[Email] Failed to send event notification:', err.message);
    return { sent: 0, error: err.message };
  }
}

// ---- Helpers ----
function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

function buildEmailTemplate({ subject, preheader, content }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:'Inter',Arial,sans-serif;">
  <span style="display:none;max-height:0;overflow:hidden;">${preheader}</span>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <!-- Header -->
        <tr>
          <td style="background:#1a1f35;border-radius:16px 16px 0 0;padding:28px 32px;text-align:center;">
            <p style="margin:0;font-size:13px;color:#6384ff;font-weight:600;letter-spacing:1px;text-transform:uppercase;">College of Engineering · Cor Jesu College</p>
            <h1 style="margin:8px 0 0;color:#ffffff;font-size:22px;font-weight:700;">COE LGU Budget System</h1>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="background:#ffffff;padding:32px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
            ${content}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;border-radius:0 0 16px 16px;border:1px solid #e2e8f0;border-top:none;padding:20px 32px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#8892a4;">You received this because you are a registered member of the COE LGU Budget Transparency System.</p>
            <p style="margin:8px 0 0;font-size:12px;color:#8892a4;">
              <a href="${APP_URL}" style="color:#6384ff;text-decoration:none;">Visit Dashboard</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

module.exports = { sendAnnouncementEmail, sendNewEventEmail };
