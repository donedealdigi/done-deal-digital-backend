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
    replyTo: process.env.REPLY_TO_EMAIL || 'donedealdigital@gmail.com',
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

function digitalProductDelivery({ customerName, customerEmail, productName, signedUrl, ttlDays }) {
  const greeting = customerName ? `Hi ${customerName}` : 'Hi there';
  const expires = ttlDays ? `This download link is active for ${ttlDays} days.` : '';
  return {
    to: customerEmail,
    replyTo: process.env.REPLY_TO_EMAIL || 'donedealdigital@gmail.com',
    subject: `Your download is ready — ${productName} | Done Deal Digital`,
    text: `${greeting},

Thanks for your purchase. Your download is ready:

${productName}
${signedUrl}

${expires}

You can also access this file any time from your account at
https://donedealdigital.com/#account — sign in with this email
address to see all your purchases.

— Done Deal Digital LLC
San Francisco Bay Area
donedealdigital.com
`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; max-width: 580px; margin: 0 auto; background: #0a0a0a; color: #f3f3f3; border-radius: 12px; overflow: hidden;">
        <div style="padding: 28px 28px 0; text-align: center;">
          <h1 style="font-size: 22px; margin: 0 0 6px 0; color: #fff; letter-spacing: 1px;">YOUR DOWNLOAD IS READY</h1>
          <p style="color: #888; font-size: 14px; margin: 0;">Done Deal Digital · ${new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' })}</p>
        </div>
        <div style="padding: 24px 28px; line-height: 1.6;">
          <p style="margin: 0 0 16px 0;">${greeting},</p>
          <p style="margin: 0 0 20px 0;">Thanks for your purchase. Your file is ready to download:</p>
          <div style="background: #161616; border: 1px solid #2a2a2a; border-radius: 8px; padding: 20px; margin: 0 0 20px 0;">
            <p style="margin: 0 0 14px 0; color: #c9a84c; font-size: 13px; letter-spacing: 1px; text-transform: uppercase;">PRODUCT</p>
            <p style="margin: 0 0 18px 0; color: #fff; font-size: 18px; font-weight: 600;">${productName}</p>
            <a href="${signedUrl}" style="display: inline-block; background: #c9a84c; color: #0a0a0a; padding: 12px 22px; border-radius: 4px; text-decoration: none; font-weight: 700; letter-spacing: 0.06em;">Download now</a>
          </div>
          ${expires ? `<p style="color: #888; font-size: 13px; margin: 0 0 16px 0;">${expires}</p>` : ''}
          <p style="margin: 0; color: #aaa; font-size: 14px;">You can also access this file any time from your <a href="https://donedealdigital.com/#account" style="color: #c9a84c;">account dashboard</a> — sign in with this email address.</p>
        </div>
        <div style="padding: 16px 28px; border-top: 1px solid #222; text-align: center; color: #666; font-size: 12px;">
          Done Deal Digital LLC · San Francisco Bay Area · <a href="https://donedealdigital.com" style="color: #e63946;">donedealdigital.com</a>
        </div>
      </div>
    `
  };
}

/**
 * Sent to the admin (NOTIFY_EMAIL) when an automatic digital-delivery
 * email to the customer fails — most commonly because SES is still in
 * sandbox and the customer's address isn't on the verified list.
 *
 * Goes to a verified address so it always lands, even in sandbox.
 */
function digitalDeliveryFailureAlert({ customerName, customerEmail, productName, signedUrl, paymentIntentId, failureReason, amount }) {
  const to = process.env.NOTIFY_EMAIL || 'donedealdigital@gmail.com';
  const amountStr = amount != null ? `$${Number(amount).toFixed(2)}` : '(unknown)';
  return {
    to,
    replyTo: customerEmail,
    subject: `⚠️ Manual fulfillment needed: ${productName} (${customerEmail})`,
    text: `MANUAL FULFILLMENT REQUIRED

A paid digital download could not be auto-delivered because the
customer-facing email failed to send.

Product:     ${productName}
Customer:    ${customerName || '(no name)'} <${customerEmail}>
Amount paid: ${amountStr}
Payment ref: ${paymentIntentId || '(none)'}
Failure:     ${failureReason || 'unknown'}

Download link to forward to the customer (active 7 days from purchase):

${signedUrl || '(no link available — generate from account dashboard)'}

The file is also attached to their account dashboard — they can sign in
with the email above and download from there.

Reply to this email to message the customer directly (Reply-To is set
to their address).
`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; max-width: 620px; margin: 0 auto;">
        <div style="background: #2a0e10; border: 1px solid #e63946; border-radius: 12px; padding: 24px 28px;">
          <h2 style="color: #fff; margin: 0 0 8px 0; font-size: 18px;">⚠️ Manual fulfillment needed</h2>
          <p style="color: #ddb; margin: 0 0 16px 0; font-size: 14px;">A digital-download purchase succeeded, but the auto-delivery email to the customer failed to send.</p>
          <table style="width:100%; border-collapse: collapse; margin: 0 0 16px 0; font-size:14px;">
            <tr><td style="padding: 6px 0; color:#aaa;">Product</td><td style="padding:6px 0; color:#fff; text-align:right;">${productName}</td></tr>
            <tr><td style="padding: 6px 0; color:#aaa; border-top:1px solid #4a1418;">Customer</td><td style="padding:6px 0; color:#fff; text-align:right; border-top:1px solid #4a1418;">${customerName || '(no name)'}</td></tr>
            <tr><td style="padding: 6px 0; color:#aaa; border-top:1px solid #4a1418;">Email</td><td style="padding:6px 0; color:#fff; text-align:right; border-top:1px solid #4a1418;"><a href="mailto:${customerEmail}" style="color:#c9a84c;">${customerEmail}</a></td></tr>
            <tr><td style="padding: 6px 0; color:#aaa; border-top:1px solid #4a1418;">Amount</td><td style="padding:6px 0; color:#fff; text-align:right; border-top:1px solid #4a1418;"><strong>${amountStr}</strong></td></tr>
            <tr><td style="padding: 6px 0; color:#aaa; border-top:1px solid #4a1418;">Payment ref</td><td style="padding:6px 0; color:#888; text-align:right; font-size:12px; border-top:1px solid #4a1418;">${paymentIntentId || '(none)'}</td></tr>
            <tr><td style="padding: 6px 0; color:#aaa; border-top:1px solid #4a1418;">Failure reason</td><td style="padding:6px 0; color:#e63946; text-align:right; font-size:13px; border-top:1px solid #4a1418;">${failureReason || 'unknown'}</td></tr>
          </table>
          ${signedUrl ? `
          <p style="color:#aaa; font-size:13px; margin:16px 0 6px 0;">Download link to forward to the customer:</p>
          <div style="background:#0a0a0a; border:1px solid #333; border-radius:6px; padding:10px 12px; margin: 0 0 14px 0;">
            <a href="${signedUrl}" style="color:#c9a84c; word-break:break-all; font-size:12px;">${signedUrl}</a>
          </div>` : '<p style="color:#888; font-style:italic;">No download link available — re-generate from the account dashboard.</p>'}
          <p style="color:#aaa; font-size:13px; margin:0;">Reply to this email to contact the customer directly.</p>
        </div>
      </div>
    `
  };
}

function merchShipped({ customerName, customerEmail, items, trackingNumber, trackingUrl, orderId }) {
  const greeting = customerName ? `Hi ${customerName}` : 'Hi there';
  const itemList = (items || []).map(it => `${it.quantity || 1} × ${it.name || 'Item'}`).join(', ');
  return {
    to: customerEmail,
    replyTo: process.env.REPLY_TO_EMAIL || 'donedealdigital@gmail.com',
    subject: `Your Done Deal Digital order has shipped 🚚`,
    text: `${greeting},

Great news — your order is on the way!

Items: ${itemList}
Tracking: ${trackingNumber || '(pending)'}
${trackingUrl ? 'Track package: ' + trackingUrl : ''}

You can check status any time at https://donedealdigital.com/track-order.html
(Order ID: ${orderId})

— Done Deal Digital LLC
`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; max-width: 580px; margin: 0 auto; background: #0a0a0a; color: #f3f3f3; border-radius: 12px; overflow: hidden;">
        <div style="padding: 28px 28px 0; text-align: center;">
          <h1 style="font-size: 22px; margin: 0 0 6px 0; color: #fff; letter-spacing: 1px;">YOUR ORDER HAS SHIPPED 🚚</h1>
          <p style="color: #888; font-size: 14px; margin: 0;">Done Deal Digital · ${new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' })}</p>
        </div>
        <div style="padding: 24px 28px; line-height: 1.6;">
          <p style="margin: 0 0 16px 0;">${greeting},</p>
          <p style="margin: 0 0 18px 0;">Great news — your order is on its way!</p>
          <div style="background: #161616; border: 1px solid #2a2a2a; border-radius: 8px; padding: 16px 18px; margin: 0 0 18px 0;">
            <p style="margin: 0 0 6px 0; color: #c9a84c; font-size: 11px; letter-spacing: 1.4px; text-transform: uppercase;">Items</p>
            <p style="margin: 0 0 14px 0; color: #fff;">${itemList || '(see receipt)'}</p>
            <p style="margin: 0 0 6px 0; color: #c9a84c; font-size: 11px; letter-spacing: 1.4px; text-transform: uppercase;">Tracking</p>
            <p style="margin: 0 0 12px 0; color: #fff; font-family: monospace; font-size: 13px;">${trackingNumber || '(pending)'}</p>
            ${trackingUrl ? `<a href="${trackingUrl}" style="display: inline-block; background: #c9a84c; color: #0a0a0a; padding: 10px 20px; border-radius: 4px; text-decoration: none; font-weight: 700; letter-spacing: 0.06em; font-size: 13px;">Track package</a>` : ''}
          </div>
          <p style="margin: 0; color: #aaa; font-size: 14px;">Check status any time at <a href="https://donedealdigital.com/track-order.html" style="color: #c9a84c;">donedealdigital.com/track-order</a> (Order ID: <span style="font-family: monospace;">${orderId}</span>).</p>
        </div>
        <div style="padding: 16px 28px; border-top: 1px solid #222; text-align: center; color: #666; font-size: 12px;">
          Done Deal Digital LLC · San Francisco Bay Area · <a href="https://donedealdigital.com" style="color: #e63946;">donedealdigital.com</a>
        </div>
      </div>
    `
  };
}

/**
 * Sent to the admin when a paid merch order fails to submit to Printful.
 * Payment is already captured — this order needs to be created manually in
 * the Printful dashboard. Includes everything needed to do that.
 */
function merchFulfillmentFailureAlert({ order, failureReason }) {
  const to = process.env.NOTIFY_EMAIL || 'donedealdigital@gmail.com';
  const ship = order.shipping_address || {};
  let items = order.items || [];
  if (typeof items === 'string') { try { items = JSON.parse(items); } catch { items = []; } }

  const itemsText = items.map(it =>
    `  - ${it.quantity || 1} x ${it.name || 'Item'} (sync_variant_id: ${it.sync_variant_id || '?'})`
  ).join('\n');
  const itemsHtml = items.map(it =>
    `<tr><td style="padding:4px 0;color:#fff;">${it.quantity || 1} &times; ${it.name || 'Item'}</td><td style="padding:4px 0;text-align:right;color:#888;font-size:12px;">variant ${it.sync_variant_id || '?'}</td></tr>`
  ).join('');

  const addr = [
    ship.address1, ship.address2, `${ship.city || ''}, ${ship.state_code || ''} ${ship.zip || ''}`.trim(), ship.country_code
  ].filter(Boolean).join(', ');
  const paymentRef = order.payment_provider === 'paypal'
    ? `PayPal: ${order.paypal_order_id || '(none)'}`
    : `Stripe: ${order.stripe_payment_intent_id || '(none)'}`;
  const amountStr = order.total != null ? `$${Number(order.total).toFixed(2)}` : '(unknown)';

  return {
    to,
    replyTo: order.customer_email,
    subject: `⚠️ Merch order needs manual fulfillment: ${order.id}`,
    text: `MANUAL FULFILLMENT REQUIRED — MERCH ORDER

A merch order was PAID but failed to submit to Printful. The customer
has been charged; the order must be created manually in the Printful
dashboard.

Order ID:    ${order.id}
Customer:    ${order.customer_name || '(no name)'} <${order.customer_email}>
Amount paid: ${amountStr} (${order.payment_provider || 'stripe'})
Payment ref: ${paymentRef}
Failure:     ${failureReason || 'unknown'}

Items:
${itemsText || '  (none listed)'}

Ship to:
  ${order.customer_name || ''}
  ${addr}

ACTION: Log into Printful, create this order manually with the items
and address above, then it's handled. Reply to this email to contact
the customer if needed.
`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; max-width: 620px; margin: 0 auto;">
        <div style="background: #2a0e10; border: 1px solid #e63946; border-radius: 12px; padding: 24px 28px;">
          <h2 style="color:#fff; margin:0 0 8px 0; font-size:18px;">⚠️ Merch order needs manual fulfillment</h2>
          <p style="color:#ddb; margin:0 0 16px 0; font-size:14px;">This order was <strong>paid</strong> but failed to submit to Printful. The customer has been charged — create the order manually in the Printful dashboard.</p>
          <table style="width:100%; border-collapse:collapse; margin:0 0 14px 0; font-size:14px;">
            <tr><td style="padding:6px 0;color:#aaa;">Order ID</td><td style="padding:6px 0;color:#fff;text-align:right;font-family:monospace;font-size:12px;">${order.id}</td></tr>
            <tr><td style="padding:6px 0;color:#aaa;border-top:1px solid #4a1418;">Customer</td><td style="padding:6px 0;color:#fff;text-align:right;border-top:1px solid #4a1418;">${order.customer_name || '(no name)'}</td></tr>
            <tr><td style="padding:6px 0;color:#aaa;border-top:1px solid #4a1418;">Email</td><td style="padding:6px 0;text-align:right;border-top:1px solid #4a1418;"><a href="mailto:${order.customer_email}" style="color:#c9a84c;">${order.customer_email}</a></td></tr>
            <tr><td style="padding:6px 0;color:#aaa;border-top:1px solid #4a1418;">Amount paid</td><td style="padding:6px 0;color:#fff;text-align:right;border-top:1px solid #4a1418;"><strong>${amountStr}</strong> (${order.payment_provider || 'stripe'})</td></tr>
            <tr><td style="padding:6px 0;color:#aaa;border-top:1px solid #4a1418;">Payment ref</td><td style="padding:6px 0;color:#888;text-align:right;font-size:12px;border-top:1px solid #4a1418;">${paymentRef}</td></tr>
            <tr><td style="padding:6px 0;color:#aaa;border-top:1px solid #4a1418;">Failure</td><td style="padding:6px 0;color:#e63946;text-align:right;font-size:13px;border-top:1px solid #4a1418;">${failureReason || 'unknown'}</td></tr>
          </table>
          <p style="color:#aaa;font-size:13px;margin:0 0 4px 0;">Items to order:</p>
          <table style="width:100%;border-collapse:collapse;background:#0a0a0a;border:1px solid #333;border-radius:6px;padding:8px;margin:0 0 12px 0;">
            ${itemsHtml || '<tr><td style="padding:4px 8px;color:#888;">(none listed)</td></tr>'}
          </table>
          <p style="color:#aaa;font-size:13px;margin:0 0 4px 0;">Ship to:</p>
          <p style="color:#fff;font-size:14px;margin:0 0 14px 0;">${order.customer_name || ''}<br/>${addr}</p>
          <p style="color:#aaa;font-size:13px;margin:0;">Create this order in Printful manually. Reply to this email to reach the customer.</p>
        </div>
      </div>
    `
  };
}

module.exports = {
  sendMail,
  templates: {
    depositReceipt,
    depositNotification,
    digitalProductDelivery,
    digitalDeliveryFailureAlert,
    merchShipped,
    merchFulfillmentFailureAlert
  }
};
