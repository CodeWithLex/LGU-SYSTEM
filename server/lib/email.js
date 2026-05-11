// =============================================
// server/lib/email.js — Brevo API Helper
// =============================================
const SibApiV3Sdk = require('sib-api-v3-sdk');
const supabase = require('./supabase');

const APP_URL = 'https://lgu-system-eight.vercel.app';

// Lazy init Brevo client
let _brevoApi = null;
function getBrevoApi() {
  if (!_brevoApi) {
    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) {
      console.warn('[Email] Skipping: BREVO_API_KEY missing. Please add it to Render Environment settings.');
      return null;
    }

    const defaultClient = SibApiV3Sdk.ApiClient.instance;
    const apiKeyInstance = defaultClient.authentications['api-key'];
    apiKeyInstance.apiKey = apiKey;

    _brevoApi = new SibApiV3Sdk.TransactionalEmailsApi();
    
    // Add timeouts
    defaultClient.timeout = 10000;
  }
  return _brevoApi;
}

/**
 * Fetches all registered student emails via the profiles table.
 */
async function getAllStudentEmails() {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('email')
      .neq('role', 'admin');

    if (error) throw error;
    
    // Extract emails and filter out nulls
    return (data || []).map(p => p.email).filter(Boolean);
  } catch (err) {
    console.error('[Email] Failed to fetch student emails:', err.message);
    return [];
  }
}

/**
 * Sends an announcement notification email via Brevo API (HTTP).
 */
async function sendAnnouncementEmail(title, body) {
  try {
    const apiInstance = getBrevoApi();
    if (!apiInstance) return { sent: 0 };

    const emails = await getAllStudentEmails();
    if (!emails.length) return { sent: 0 };

    // Format recipients for Brevo: [{email: "x@y.com"}, ...]
    // Note: To keep privacy, we can send to a single list with BCC, 
    // but Brevo API handles 'to' as a list. We'll use one 'to' per student 
    // or use a BCC strategy if preferred.
    // For simplicity and standard behavior, we'll send a single email with multiple 'to' or 'bcc'.
    
    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
    sendSmtpEmail.subject = `[COE LGU] ${title}`;
    sendSmtpEmail.htmlContent = buildEmailTemplate({
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

    sendSmtpEmail.sender = { 
      name: "COE Budget System", 
      email: process.env.BREVO_SENDER_EMAIL || "coebudget@gmail.com" 
    };
    
    // Send to admin, BCC to students
    sendSmtpEmail.to = [{ email: process.env.BREVO_SENDER_EMAIL || "coebudget@gmail.com" }];
    sendSmtpEmail.bcc = emails.map(email => ({ email }));

    const data = await apiInstance.sendTransacEmail(sendSmtpEmail);
    console.log(`[Email] Announcement sent via Brevo: ${data.messageId}`);
    return { sent: emails.length };
  } catch (err) {
    console.error('[Email] ERROR sending announcement:', err);
    return { sent: 0, error: err.message };
  }
}

/**
 * Sends a new event notification email via Brevo API (HTTP).
 */
async function sendNewEventEmail(event) {
  try {
    const apiInstance = getBrevoApi();
    if (!apiInstance) return { sent: 0 };

    const emails = await getAllStudentEmails();
    if (!emails.length) return { sent: 0 };

    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
    sendSmtpEmail.subject = `[COE LGU] New Event: ${event.event_name}`;
    sendSmtpEmail.htmlContent = buildEmailTemplate({
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

    sendSmtpEmail.sender = { 
      name: "COE Budget System", 
      email: process.env.BREVO_SENDER_EMAIL || "coebudget@gmail.com" 
    };
    
    sendSmtpEmail.to = [{ email: process.env.BREVO_SENDER_EMAIL || "coebudget@gmail.com" }];
    sendSmtpEmail.bcc = emails.map(email => ({ email }));

    const data = await apiInstance.sendTransacEmail(sendSmtpEmail);
    console.log(`[Email] Event notification sent via Brevo: ${data.messageId}`);
    return { sent: emails.length };
  } catch (err) {
    console.error('[Email] ERROR sending event notification:', err);
    return { sent: 0, error: err.message };
  }
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
