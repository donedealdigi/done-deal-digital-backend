/**
 * EmailService — sends transactional emails via SendGrid SMTP using nodemailer.
 * Uses the SMTP_* env vars already provisioned in AWS Secrets Manager.
 *
 * If SMTP credentials aren't configured, logs the email body to console
 * (graceful fallback so service deposit flow doesn't break on misconfig).
 */

const nodemailer = require('nodemailer');

let transporterPromise = null;

function getTransporter() {
  if (transporterPromise) return transporterPromise;

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;

  if (!host || !user || !pass) {
    transporterPromise = Promise.resolve(null);
    return transporterPromise;
  }

  const t = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });

  transporterPromise = t.verify().then(() => t).catch((err) => {
    console.warn('⚠️  Email transporter verify failed:', err.message);
    return null;
  });
  return transporterPromise;
}

async function sendMail({ to, subject, html, text, replyTo }) {
  const transporter = await getTransporter();
  const from = process.env.SMTP_FROM_EMAIL || 'noreply@donedealdigital.com';

  if (!transporter) {
    console.log(`📭 Email skipped (SMTP not configured). To: ${to} | Subject: ${subject}`);
    return { sent: false, reason: 'transporter unavailable' };
  }

  try {
    const info = await transporter.sendMail({
      from: `"Done Deal Digital" <${from}>`,
      to,
      subject,
      html,
      text,
      replyTo: replyTo || from
    });
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    console.error('❌ sendMail error:', err.message);
    return { sent: false, error: err.message };
  }
}

// ----- Templates -----

function depositReceipt({ customerName, customerEmail, serviceName, amount, paymentIntentId }) {
  const greeting = customerName ? `Hi ${customerName}` : 'Hi there';
  const amountStr = `$${Number(amount).toFixed(2)}`;
  return {
    to: customerEmail,
    subject: `Deposit received — ${serviceName} | Done Deal Digital`,
    text: `${greeting},

Thanks for your deposit of ${amountStr} for ${serviceName}.
We've received it and someone from the Done Deal Digital team will reach out within 24 hours to confirm next steps for your project.

Reference: ${paymentIntentId}

— Done Deal Digital LLC
San Francisco Bay Area
donedealdigital.com
`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; max-width: 580px; margin: 0 auto; background: #0a0a0a; color: #f3f3f3; border-radius: 12px; overflow: hidden;">
        <div style="padding: 28px 28px 0; text-align: center;">
          <h1 style="font-size: 22px; margin: 0 0 6px 0; color: #fff; letter-spacing: 1px;">DEPOSIT RECEIVED</h1>
          <p style="color: #888; font-size: 14px; margin: 0;">Done Deal Digital · ${new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' })}</p>
        </div>
        <div style="padding: 24px 28px; line-height: 1.6;">
          <p style="margin: 0 0 16px 0;">${greeting},</p>
          <p style="margin: 0 0 16px 0;">Thanks for your deposit. Here are the details on file:</p>
          <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <tr><td style="padding: 8px 0; color: #999;">Service</td><td style="padding: 8px 0; text-align: right; color: #fff;">${serviceName}</td></tr>
            <tr><td style="padding: 8px 0; color: #999; border-top: 1px solid #222;">Deposit amount</td><td style="padding: 8px 0; text-align: right; color: #fff; border-top: 1px solid #222; font-weight: 600;">${amountStr} USD</td></tr>
            <tr><td style="padding: 8px 0; color: #999; border-top: 1px solid #222;">Reference</td><td style="padding: 8px 0; text-align: right; color: #888; font-size: 12px; border-top: 1px solid #222;">${paymentIntentId}</td></tr>
          </table>
          <p style="margin: 16px 0 0 0;">Someone from the team will reach out within 24 hours to confirm scope, scheduling, and next steps for your project.</p>
        </div>
        <div style="padding: 16px 28px; border-top: 1px solid #222; text-align: center; color: #666; font-size: 12px;">
          Done Deal Digital LLC · San Francisco Bay Area · <a href="https://donedealdigital.com" style="color: #e63946;">donedealdigital.com</a>
        </div>
      </div>
    `
  };
}

function depositNotification({ customerName, customerEmail, serviceName, amount, paymentIntentId, notes }) {
  const amountStr = `$${Number(amount).toFixed(2)}`;
  return {
    to: process.env.NOTIFY_EMAIL || 'donedealdigital@gmail.com',
    replyTo: customerEmail,
    subject: `NEW deposit: ${amountStr} — ${serviceName} (${customerEmail})`,
    text: `New service deposit received.

Customer: ${customerName || '(no name provided)'}
Email: ${customerEmail}
Service: ${serviceName}
Amount: ${amountStr} USD
Stripe PaymentIntent: ${paymentIntentId}
Notes: ${notes || '(none)'}

Reply to this email to contact the customer directly.
`,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 580px;">
        <h2>New service deposit received</h2>
        <table style="border-collapse: collapse; margin: 12px 0;">
          <tr><td><strong>Customer:</strong></td><td>${customerName || '(no name provided)'}</td></tr>
          <tr><td><strong>Email:</strong></td><td><a href="mailto:${customerEmail}">${customerEmail}</a></td></tr>
          <tr><td><strong>Service:</strong></td><td>${serviceName}</td></tr>
          <tr><td><strong>Amount:</strong></td><td><strong>${amountStr} USD</strong></td></tr>
          <tr><td><strong>Stripe ref:</strong></td><td style="font-size: 12px; color: #666;">${paymentIntentId}</td></tr>
          <tr><td><strong>Notes:</strong></td><td>${notes || '(none)'}</td></tr>
        </table>
        <p>Reply to this email to contact the customer directly.</p>
      </div>
    `
  };
}

module.exports = {
  sendMail,
  templates: {
    depositReceipt,
    depositNotification
  }
};
