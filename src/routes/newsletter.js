const express = require('express');
const router = express.Router();
const NewsletterSubscriber = require('../models/NewsletterSubscriber');
const EmailService = require('../services/EmailService');

/**
 * POST /api/newsletter/subscribe
 * Body: { email, name?, source? }
 * Captures email into newsletter_subscribers, sends a "welcome" email
 * (best-effort via SES, errors logged but don't fail the request).
 */
router.post('/subscribe', async (req, res) => {
  try {
    const { email, name, source } = req.body || {};
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ success: false, error: 'valid email required' });
    }
    if (email.length > 255) {
      return res.status(400).json({ success: false, error: 'email too long' });
    }

    const ipAddress = (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim().slice(0, 64);
    const userAgent = (req.headers['user-agent'] || '').slice(0, 1024);

    const { subscriber, isNew, alreadySubscribed, reactivated } = await NewsletterSubscriber.subscribe({
      email,
      name,
      source: source || 'donedealdigital.com',
      ipAddress,
      userAgent
    });

    // Send welcome email (best-effort, doesn't block response)
    if (isNew || reactivated) {
      EmailService.sendMail({
        to: subscriber.email,
        replyTo: process.env.REPLY_TO_EMAIL || 'donedealdigital@gmail.com',
        subject: 'You\'re in — Done Deal Digital',
        text: `Thanks for subscribing.

You'll hear from us when we drop new music, new merch, new beats, or have something worth your inbox. No spam. Pinky promise.

If you didn't sign up for this, ignore this email or unsubscribe here:
https://api.donedealdigital.com/api/newsletter/unsubscribe?token=${subscriber.unsubscribe_token}

— Done Deal Digital LLC
donedealdigital.com
`,
        html: `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif; max-width:580px; margin:0 auto; background:#0a0a0a; color:#f3f3f3; border-radius:12px; overflow:hidden;">
            <div style="padding:32px 28px; text-align:center;">
              <h1 style="font-size:24px; margin:0 0 8px 0; color:#fff; letter-spacing:2px;">YOU'RE IN</h1>
              <p style="color:#888; font-size:13px; margin:0;">Done Deal Digital · ${new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' })}</p>
            </div>
            <div style="padding:8px 28px 24px; line-height:1.7;">
              <p style="margin:0 0 16px 0;">Thanks for subscribing.</p>
              <p style="margin:0 0 16px 0;">You'll hear from us when we drop new music, new merch, new beats, or have something worth your inbox. No spam. Pinky promise.</p>
            </div>
            <div style="padding:16px 28px; border-top:1px solid #222; text-align:center; color:#666; font-size:11px;">
              Done Deal Digital LLC · San Francisco Bay Area · <a href="https://donedealdigital.com" style="color:#e63946;">donedealdigital.com</a><br />
              <a href="https://api.donedealdigital.com/api/newsletter/unsubscribe?token=${subscriber.unsubscribe_token}" style="color:#666;">Unsubscribe</a>
            </div>
          </div>
        `
      }).catch(e => console.error('newsletter welcome email failed:', e.message));
    }

    res.json({
      success: true,
      data: {
        email: subscriber.email,
        status: subscriber.status,
        isNew: !!isNew,
        alreadySubscribed: !!alreadySubscribed,
        reactivated: !!reactivated
      }
    });
  } catch (err) {
    console.error('Newsletter subscribe error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to subscribe' });
  }
});

/**
 * GET /api/newsletter/unsubscribe?token=...
 * Returns a simple confirmation page (so we can put this in email footers).
 */
router.get('/unsubscribe', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res.status(400).send('<h1>Missing token</h1>');
    }
    const result = await NewsletterSubscriber.unsubscribeByToken(token);
    if (!result) {
      return res.status(404).send(`
        <!doctype html><html><head><meta charset="utf-8"><title>Unsubscribe</title>
        <style>body{font-family:sans-serif;background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:2rem;}a{color:#e63946;}</style></head>
        <body><div><h1>Unsubscribe link not found</h1><p>This link may have expired or you may already be unsubscribed.</p><p><a href="https://donedealdigital.com">← Back to donedealdigital.com</a></p></div></body></html>
      `);
    }
    res.send(`
      <!doctype html><html><head><meta charset="utf-8"><title>Unsubscribed</title>
      <style>body{font-family:sans-serif;background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:2rem;}a{color:#e63946;}</style></head>
      <body><div><h1>You're unsubscribed</h1><p>${result.email} won't receive newsletter emails from us anymore. Sorry to see you go.</p><p><a href="https://donedealdigital.com">← Back to donedealdigital.com</a></p></div></body></html>
    `);
  } catch (err) {
    console.error('Newsletter unsubscribe error:', err.message);
    res.status(500).send('<h1>Something went wrong</h1>');
  }
});

module.exports = router;
