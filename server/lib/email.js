// =============================================
// server/lib/email.js - Brevo API Helper
// =============================================
const SibApiV3Sdk = require('sib-api-v3-sdk');
const supabase = require('./supabase');
const { logError } = require('./logger');

const APP_URL = 'https://coelgu-system.engineer';

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
 * Specifically filters for Gmail/Google Workspace accounts as requested.
 */
async function getAllStudentEmails() {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('email')
      .neq('role', 'admin')
      .or('email.ilike.%@gmail.com,email.ilike.%@g.cjc.edu.ph');

    if (error) throw error;
    
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
      subject: `Announcement: ${title}`,
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
      name: "COE Financial Transparency System", 
      email: process.env.BREVO_SENDER_EMAIL || "noreply@coelgu-system.engineer" 
    };
    
    // Send to admin, BCC to students
    sendSmtpEmail.to = [{ email: process.env.BREVO_SENDER_EMAIL || "noreply@coelgu-system.engineer" }];
    sendSmtpEmail.bcc = emails.map(email => ({ email }));


    const data = await apiInstance.sendTransacEmail(sendSmtpEmail);
    console.log(`[Email] Announcement sent via Brevo: ${data.messageId}`);
    return { sent: emails.length };
  } catch (err) {
    logError('Email Announcement Error', err);
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
    sendSmtpEmail.subject = `New Event: ${event.event_name}`;
    sendSmtpEmail.htmlContent = buildEmailTemplate({
      subject: `New Event: ${event.event_name}`,
preheader: `A new event has been scheduled${event.event_date ? ` for ${new Date(event.event_date).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}` : ''} - view the full details inside.`,
content: `

  <!-- Badge -->
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr>
      <td align="center" style="padding-bottom: 20px;">
        <span style="
          display: inline-block;
          background: #fff3e0;
          color: #ea580c;
          padding: 5px 16px;
          border-radius: 100px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 1px;
          text-transform: uppercase;
          font-family: -apple-system, 'Segoe UI', Arial, sans-serif;
        ">New Event</span>
      </td>
    </tr>
  </table>

  <!-- Title -->
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr>
      <td align="center" style="padding-bottom: 28px;">
        <h2 style="
          margin: 0 0 6px;
          font-family: Georgia, 'Times New Roman', serif;
          font-size: 26px;
          font-weight: 700;
          line-height: 1.3;
          color: #0f172a;
        ">${event.event_name}</h2>
        <p style="
          margin: 0;
          font-family: -apple-system, 'Segoe UI', Arial, sans-serif;
          font-size: 13px;
          color: #94a3b8;
        ">A new event has been added to your calendar.</p>
      </td>
    </tr>
  </table>

  <!-- Detail Card -->
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    overflow: hidden;
    margin-bottom: 28px;
  ">

    <!-- Card Header -->
    <tr>
      <td style="
        background: #f8fafc;
        border-bottom: 1px solid #e2e8f0;
        padding: 11px 24px;
        font-family: -apple-system, 'Segoe UI', Arial, sans-serif;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.8px;
        text-transform: uppercase;
        color: #94a3b8;
      ">Event Details</td>
    </tr>

    <!-- Card Body -->
    <tr>
      <td style="padding: 24px; background: #ffffff;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">

          ${event.event_date ? `
          <!-- Scheduled Date Row -->
          <tr>
            <td style="padding-bottom: 18px;">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="width: 36px; vertical-align: top; padding-top: 2px;">
                    <div style="
                      width: 32px;
                      height: 32px;
                      background: #eff6ff;
                      border-radius: 8px;
                      text-align: center;
                      line-height: 32px;
                      font-size: 15px;
                    ">D</div>
                  </td>
                  <td style="padding-left: 12px; vertical-align: top;">
                    <p style="
                      margin: 0 0 3px;
                      font-family: -apple-system, 'Segoe UI', Arial, sans-serif;
                      font-size: 11px;
                      font-weight: 700;
                      letter-spacing: 0.6px;
                      text-transform: uppercase;
                      color: #94a3b8;
                    ">Scheduled Date</p>
                    <p style="
                      margin: 0;
                      font-family: -apple-system, 'Segoe UI', Arial, sans-serif;
                      font-size: 15px;
                      font-weight: 600;
                      color: #0f172a;
                    ">${new Date(event.event_date).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding-bottom: 18px;">
              <div style="height: 1px; background: #f1f5f9;"></div>
            </td>
          </tr>` : ''}

          <!-- Allocated Budget Row -->
          <tr>
            <td style="padding-bottom: ${event.description ? '18px' : '0'};">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="width: 36px; vertical-align: top; padding-top: 2px;">
                    <div style="
                      width: 32px;
                      height: 32px;
                      background: #f0fdf4;
                      border-radius: 8px;
                      text-align: center;
                      line-height: 32px;
                      font-size: 15px;
                    ">₱</div>
                  </td>
                  <td style="padding-left: 12px; vertical-align: top;">
                    <p style="
                      margin: 0 0 3px;
                      font-family: -apple-system, 'Segoe UI', Arial, sans-serif;
                      font-size: 11px;
                      font-weight: 700;
                      letter-spacing: 0.6px;
                      text-transform: uppercase;
                      color: #94a3b8;
                    ">Allocated Budget</p>
                    <p style="
                      margin: 0;
                      font-family: -apple-system, 'Segoe UI', Arial, sans-serif;
                      font-size: 22px;
                      font-weight: 800;
                      color: #059669;
                      letter-spacing: -0.5px;
                    ">&#8369;${Number(event.allocated_budget || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          ${event.description ? `
          <!-- Divider -->
          <tr>
            <td style="padding-bottom: 18px;">
              <div style="height: 1px; background: #f1f5f9;"></div>
            </td>
          </tr>

          <!-- Description Row -->
          <tr>
            <td>
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="width: 36px; vertical-align: top; padding-top: 2px;">
                    <div style="
                      width: 32px;
                      height: 32px;
                      background: #faf5ff;
                      border-radius: 8px;
                      text-align: center;
                      line-height: 32px;
                      font-size: 15px;
                    ">…</div>
                  </td>
                  <td style="padding-left: 12px; vertical-align: top;">
                    <p style="
                      margin: 0 0 3px;
                      font-family: -apple-system, 'Segoe UI', Arial, sans-serif;
                      font-size: 11px;
                      font-weight: 700;
                      letter-spacing: 0.6px;
                      text-transform: uppercase;
                      color: #94a3b8;
                    ">Description</p>
                    <p style="
                      margin: 0;
                      font-family: -apple-system, 'Segoe UI', Arial, sans-serif;
                      font-size: 14px;
                      line-height: 1.7;
                      color: #475569;
                    ">${event.description}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>` : ''}

        </table>
      </td>
    </tr>
  </table>

  <!-- CTA Button -->
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr>
      <td align="center" style="padding-bottom: 6px;">
        <a href="${APP_URL}" style="
          display: inline-block;
          background: #0f172a;
          color: #ffffff;
          padding: 14px 40px;
          border-radius: 10px;
          text-decoration: none;
          font-family: -apple-system, 'Segoe UI', Arial, sans-serif;
          font-size: 14px;
          font-weight: 700;
          letter-spacing: 0.3px;
        ">View Event Details &rarr;</a>
      </td>
    </tr>
  </table>

  <!-- Footer -->
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr>
      <td align="center" style="padding-top: 24px;">
        <p style="
          margin: 0;
          font-family: -apple-system, 'Segoe UI', Arial, sans-serif;
          font-size: 12px;
          color: #94a3b8;
          line-height: 1.6;
        ">You received this because you are subscribed to event notifications.<br/>Manage your account preferences in the student portal.</p>
      </td>
    </tr>
  </table>
`
    });

    sendSmtpEmail.sender = { 
      name: "COE Financial Transparency System", 
      email: process.env.BREVO_SENDER_EMAIL || "coebudget@gmail.com" 
    };
    
    sendSmtpEmail.to = [{ email: process.env.BREVO_SENDER_EMAIL || "coebudget@gmail.com" }];
    sendSmtpEmail.bcc = emails.map(email => ({ email }));

    const data = await apiInstance.sendTransacEmail(sendSmtpEmail);
    console.log(`[Email] Event notification sent via Brevo: ${data.messageId}`);
    return { sent: emails.length };
  } catch (err) {
    logError('Email Event Notification Error', err);
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
                    <h1 style="margin:0;color:#ffffff;font-size:18px;font-weight:800;letter-spacing:1px;text-transform:uppercase;">COE Financial Transparency System</h1>
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
                College of Engineering - Cor Jesu College<br/>
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

/**
 * Sends an account approval notification email via Brevo API (HTTP).
 */
async function sendAccountApprovalEmail(userEmail, userName = 'COE Member') {
  try {
    const apiInstance = getBrevoApi();
    if (!apiInstance) return { sent: 0, reason: 'Brevo API key missing' };
    if (!userEmail) return { sent: 0, reason: 'No recipient email provided' };

    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
    sendSmtpEmail.subject = `🎉 Account Verified: Welcome to COE Financial System`;
    sendSmtpEmail.htmlContent = buildEmailTemplate({
      subject: `Account Verified & Approved`,
      preheader: `Good news! Your account has been verified by the COE LGU Admin. You can now log into the portal.`,
      content: `
        <!-- Badge -->
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td align="center" style="padding-bottom: 20px;">
              <span style="
                display: inline-block;
                background: #dcfce7;
                color: #15803d;
                padding: 6px 18px;
                border-radius: 100px;
                font-size: 12px;
                font-weight: 700;
                letter-spacing: 0.5px;
                text-transform: uppercase;
              ">Account Verified</span>
            </td>
          </tr>
        </table>

        <!-- Greeting & Title -->
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td align="center" style="padding-bottom: 28px;">
              <h2 style="
                margin: 0 0 12px;
                color: #0f172a;
                font-size: 24px;
                font-weight: 800;
                line-height: 1.3;
              ">Welcome, ${userName}!</h2>
              <p style="
                margin: 0;
                color: #475569;
                font-size: 15px;
                line-height: 1.6;
              ">Your account has been officially <strong>verified and approved</strong> by the admin. You can now log into your account.</p>
            </td>
          </tr>
        </table>

        <!-- CTA Button -->
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td align="center">
              <a href="${APP_URL}" style="
                display: inline-block;
                background: #16a34a;
                color: #ffffff;
                padding: 14px 36px;
                border-radius: 12px;
                text-decoration: none;
                font-weight: 700;
                font-size: 15px;
                box-shadow: 0 4px 14px rgba(22, 163, 74, 0.25);
              ">Log In to Account &rarr;</a>
            </td>
          </tr>
        </table>
      `
    });

    sendSmtpEmail.sender = {
      name: "COE Financial Transparency System",
      email: process.env.BREVO_SENDER_EMAIL || "coebudget@gmail.com"
    };
    sendSmtpEmail.to = [{ email: userEmail, name: userName }];

    const data = await apiInstance.sendTransacEmail(sendSmtpEmail);
    console.log(`[Email] Approval email sent to ${userEmail} via Brevo: ${data.messageId}`);
    return { sent: 1, messageId: data.messageId };
  } catch (err) {
    logError('Email Approval Notification Error', err);
    return { sent: 0, error: err.message };
  }
}

module.exports = { sendAnnouncementEmail, sendNewEventEmail, sendAccountApprovalEmail };

