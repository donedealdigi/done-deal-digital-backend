/**
 * AbandonedCartService
 *
 * Periodically sweeps for abandoned merch checkouts and emails the customer
 * a one-time "you left something behind" reminder.
 *
 * What counts as abandoned: a merch_orders row stuck in 'pending' — the
 * customer reached the payment step (which creates the row) but never
 * completed. The sweep targets rows 1 hour to 7 days old that haven't
 * already been emailed.
 *
 * Concurrency: MerchOrder.claimAbandonedForRecovery() does an atomic
 * UPDATE ... RETURNING, so even with multiple app instances running the
 * sweep, each abandoned order is claimed (and emailed) exactly once.
 *
 * One reminder per cart — recovery_email_sent_at is set on claim, so a
 * cart is never emailed twice.
 */

const MerchOrder = require('../models/MerchOrder');
const EmailService = require('./EmailService');

async function processAbandonedCarts() {
  let orders;
  try {
    orders = await MerchOrder.claimAbandonedForRecovery();
  } catch (err) {
    console.error('⚠️ Abandoned-cart sweep query failed:', err.message);
    return { processed: 0, error: err.message };
  }

  if (!orders || orders.length === 0) {
    return { processed: 0 };
  }

  let sent = 0;
  for (const order of orders) {
    if (!order.customer_email) continue;
    try {
      const result = await EmailService.sendMail(
        EmailService.templates.abandonedCartReminder({ order })
      );
      if (result && result.sent) sent++;
      else console.warn(`⚠️ Abandoned-cart email not sent for ${order.id}: ${(result && (result.error || result.reason)) || 'unknown'}`);
    } catch (err) {
      console.error(`⚠️ Abandoned-cart email error for ${order.id}:`, err.message);
    }
  }

  console.log(`📧 Abandoned-cart recovery: claimed ${orders.length}, emailed ${sent}`);
  return { processed: orders.length, emailed: sent };
}

/**
 * Start the periodic sweep. Called once from app.js after the server boots.
 * Runs every 30 minutes, with a first pass 2 minutes after boot.
 */
function startScheduler() {
  const INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
  const FIRST_RUN_MS = 2 * 60 * 1000; //  2 minutes after boot

  setTimeout(() => {
    processAbandonedCarts().catch(e => console.error('abandoned-cart sweep failed', e.message));
  }, FIRST_RUN_MS);

  const timer = setInterval(() => {
    processAbandonedCarts().catch(e => console.error('abandoned-cart sweep failed', e.message));
  }, INTERVAL_MS);
  // Don't let the interval keep the process alive on shutdown.
  if (timer.unref) timer.unref();

  console.log('🛒 Abandoned-cart recovery scheduler started (every 30 min)');
}

module.exports = { processAbandonedCarts, startScheduler };
