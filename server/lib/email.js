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
      subject: `📢 Announcement: ${title}`,
      preheader: body.slice(0, 100),
      content: `
        <div style="text-align:center;margin-bottom:24px;">
          <span style="background:#eef2ff;color:#6384ff;padding:6px 12px;border-radius:20px;font-size:12px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;">New Announcement</span>
        </div>
        <h2 style="margin:0 0 16px;color:#1a1f35;font-size:24px;font-weight:800;line-height:1.3;text-align:center;">${title}</h2>
        <div style="background:#f8fafc;border-radius:12px;padding:20px;margin-bottom:24px;border:1px solid #e2e8f0;">
          <p style="margin:0;color:#4a5568;line-height:1.7;white-space:pre-wrap;font-size:15px;">${body}</p>
        </div>
        <div style="text-align:center;">
          <a href="${APP_URL}" style="display:inline-block;background:#6384ff;color:#ffffff;padding:14px 32px;border-radius:12px;text-decoration:none;font-weight:700;font-size:15px;box-shadow:0 4px 12px rgba(99,132,255,0.25);">
            Open Dashboard →
          </a>
        </div>
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
    sendSmtpEmail.subject = `🎯 New Event: ${event.event_name}`;
    sendSmtpEmail.htmlContent = buildEmailTemplate({
      subject: `🎯 New Event: ${event.event_name}`,
      preheader: `A new event has been added: ${event.event_name}`,
      content: `
        <div style="text-align:center;margin-bottom:20px;">
          <span style="background:#fff7ed;color:#ea580c;padding:6px 12px;border-radius:20px;font-size:12px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;">System Update</span>
        </div>
        <h2 style="margin:0 0 12px;color:#1a1f35;font-size:24px;font-weight:800;line-height:1.3;text-align:center;">${event.event_name}</h2>
        
        <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:24px;margin-bottom:24px;box-shadow:0 2px 4px rgba(0,0,0,0.02);">
           <table width="100%" cellpadding="0" cellspacing="0">
             ${event.event_date ? `
             <tr>
               <td style="padding-bottom:12px;">
                 <span style="color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;">Scheduled Date</span><br/>
                 <span style="color:#1a1f35;font-size:16px;font-weight:700;">📅 ${new Date(event.event_date).toLocaleDateString('en-PH', { year:'numeric', month:'long', day:'numeric' })}</span>
               </td>
             </tr>` : ''}
             <tr>
               <td style="padding-bottom:12px;">
                 <span style="color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;">Allocated Budget</span><br/>
                 <span style="color:#10b981;font-size:20px;font-weight:800;">₱${Number(event.allocated_budget || 0).toLocaleString('en-PH', {minimumFractionDigits:2})}</span>
               </td>
             </tr>
             ${event.description ? `
             <tr>
               <td style="border-top:1px solid #f1f5f9;padding-top:16px;">
                 <p style="margin:0;color:#4a5568;line-height:1.6;font-size:14px;">${event.description}</p>
               </td>
             </tr>` : ''}
           </table>
        </div>

        <div style="text-align:center;">
          <a href="${APP_URL}" style="display:inline-block;background:#1a1f35;color:#ffffff;padding:14px 32px;border-radius:12px;text-decoration:none;font-weight:700;font-size:15px;box-shadow:0 4px 12px rgba(26,31,53,0.2);">
            View Event Details
          </a>
        </div>
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
<html xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
  <title>${subject}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    @media only screen and (max-width: 620px) {
      .container { width: 100% !important; padding: 10px !important; }
      .card { padding: 24px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f4f7fa;-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;">${preheader}</div>
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f7fa;padding:40px 0;">
    <tr>
      <td align="center">
        <table class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;margin:0 auto;">
          <!-- Header Logo/Branding -->
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <table cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding:10px 20px;background:#1a1f35;border-radius:12px;">
                    <h1 style="margin:0;color:#ffffff;font-size:18px;font-weight:800;letter-spacing:1px;text-transform:uppercase;">COE Budget System</h1>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Main Content Card -->
          <tr>
            <td class="card" style="background-color:#ffffff;padding:48px;border-radius:24px;box-shadow:0 10px 25px rgba(0,0,0,0.05);border:1px solid #eef2f6;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:32px;">
              <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.5;">
                College of Engineering — Cor Jesu College<br/>
                Budget Transparency & Liquidation System
              </p>
              <p style="margin:16px 0 0;font-size:12px;color:#cbd5e1;">
                You received this because you are registered student member.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

module.exports = { sendAnnouncementEmail, sendNewEventEmail };
