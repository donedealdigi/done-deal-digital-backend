/**
 * DigitalDeliveryService
 *
 * When a service-deposit payment succeeds and the slug matches an item in
 * the digital products catalog, this service:
 *   1. Creates an account_files row pointing at the catalog's S3 object
 *      (so the file shows up in the customer's account dashboard).
 *   2. Generates a long-lived signed download URL.
 *   3. Sends a delivery email with the link.
 *
 * Idempotent — safe to call multiple times for the same deposit (Stripe
 * webhooks retry on 5xx, and PayPal capture might race the webhook).
 */

const pool = require('../config/database');
const digitalProducts = require('../config/digitalProducts');
const AccountFile = require('../models/AccountFile');
const S3Service = require('./S3Service');
const EmailService = require('./EmailService');

const SIGNED_URL_TTL_SEC = 7 * 24 * 60 * 60; // 7 days, the S3 max

/**
 * Check if an account_files row already exists for this email + s3_key.
 * Lets us skip duplicate inserts on webhook retries.
 */
async function alreadyDelivered({ customerEmail, s3Key }) {
  const r = await pool.query(
    `SELECT id FROM account_files
      WHERE deleted_at IS NULL
        AND LOWER(customer_email) = LOWER($1)
        AND s3_key = $2
      LIMIT 1`,
    [customerEmail, s3Key]
  );
  return r.rowCount > 0;
}

/**
 * Inspect a paid deposit; if its slug is in the catalog, fulfill it.
 * Returns { delivered: true|false, reason?: string } for logging.
 *
 * @param {object} deposit  Row from service_deposits (after markPaid)
 */
async function deliverIfDigital(deposit) {
  if (!deposit) return { delivered: false, reason: 'no deposit row' };

  const product = digitalProducts.get(deposit.service_slug);
  if (!product) return { delivered: false, reason: 'slug not in catalog' };

  const customerEmail = deposit.customer_email;
  if (!customerEmail) return { delivered: false, reason: 'no customer email' };

  // Idempotency: skip if this customer already has this file attached.
  if (await alreadyDelivered({ customerEmail, s3Key: product.s3Key })) {
    return { delivered: false, reason: 'already delivered (idempotent skip)' };
  }

  // 1. Record the file in the customer's account.
  //    user_id is null here — customer may not have an account yet.
  //    AccountFile.listForUser also matches by email, so when they sign up
  //    with the same email, the file appears in their dashboard.
  await AccountFile.create({
    userId: null,
    customerEmail,
    s3Bucket: product.s3Bucket,
    s3Key: product.s3Key,
    filename: product.filename,
    contentType: product.contentType,
    sizeBytes: null,
    category: product.category || 'digital-product',
    description: product.name,
    uploadedByAdminEmail: 'auto-delivery@donedealdigital.com'
  });

  // 2. Generate a long-lived signed URL for the delivery email.
  let signedUrl = null;
  try {
    signedUrl = await S3Service.getSignedDownloadUrl({
      bucket: product.s3Bucket,
      key: product.s3Key,
      filename: product.filename,
      expiresSec: SIGNED_URL_TTL_SEC
    });
  } catch (err) {
    console.error(`⚠️ Failed to sign URL for ${product.s3Key}: ${err.message}`);
    // Continue — the file is still in their account dashboard.
  }

  // 3. Send the delivery email (best-effort). If it fails for any reason
  //    (transient SES/SMTP error, bad address, throttling), fall back to an
  //    admin alert so manual fulfillment can happen quickly.
  let customerEmailResult = { sent: false, reason: 'not attempted (no signed URL)' };
  if (signedUrl) {
    try {
      customerEmailResult = await EmailService.sendMail(EmailService.templates.digitalProductDelivery({
        customerName: deposit.customer_name,
        customerEmail,
        productName: product.name,
        signedUrl,
        ttlDays: Math.floor(SIGNED_URL_TTL_SEC / 86400)
      }));
    } catch (err) {
      customerEmailResult = { sent: false, error: err.message };
    }
  }

  if (customerEmailResult && customerEmailResult.sent === true) {
    console.log(`✅ Digital delivery: ${product.name} -> ${customerEmail} (email sent)`);
  } else {
    // Customer-facing email failed. Alert the admin so they can fulfill manually.
    const reason = (customerEmailResult && (customerEmailResult.error || customerEmailResult.reason)) || 'unknown';
    console.warn(`⚠️ Customer delivery email failed for ${customerEmail}: ${reason}. Sending admin fallback alert.`);
    EmailService.sendMail(EmailService.templates.digitalDeliveryFailureAlert({
      customerName: deposit.customer_name,
      customerEmail,
      productName: product.name,
      signedUrl,
      paymentIntentId: deposit.stripe_payment_intent_id,
      failureReason: reason,
      amount: deposit.amount
    })).catch(e => console.error('admin fallback alert ALSO failed:', e.message));
  }

  return {
    delivered: true,
    productSlug: deposit.service_slug,
    customerEmailSent: customerEmailResult && customerEmailResult.sent === true
  };
}

module.exports = { deliverIfDigital };
