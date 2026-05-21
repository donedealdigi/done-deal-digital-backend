const express = require('express');
const router = express.Router();
const EmailService = require('../services/EmailService');

/**
 * POST /api/internship/apply
 * Body: { name, email, phone?, school?, position, experience, availability, portfolio? }
 * Sends internship application via email to donedealdigital@gmail.com
 */
router.post('/apply', async (req, res) => {
  try {
    const { name, email, phone, school, position, experience, availability, portfolio } = req.body || {};

    // Validate required fields
    if (!name || !email || !position || !experience || !availability) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name, email, position, experience, availability'
      });
    }

    // Validate email format
    if (!email.includes('@')) {
      return res.status(400).json({ success: false, error: 'Invalid email address' });
    }

    // Build application details
    const applicationText = `New Internship Application

Name: ${name}
Email: ${email}
Phone: ${phone || '(not provided)'}
School: ${school || '(not provided)'}
Preferred Position: ${position}
Availability: ${availability}
Portfolio/Resume: ${portfolio || '(not provided)'}

Experience & Interest:
${experience}

---
Submitted: ${new Date().toLocaleString()}
`;

    const applicationHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #f3f3f3; border-radius: 12px; overflow: hidden;">
        <div style="padding: 28px 28px 0; text-align: center; border-bottom: 1px solid #222;">
          <h1 style="font-size: 22px; margin: 0 0 6px 0; color: #daa520; letter-spacing: 1px;">NEW INTERNSHIP APPLICATION</h1>
          <p style="color: #888; font-size: 14px; margin: 0;">Done Deal Digital</p>
        </div>
        <div style="padding: 24px 28px; line-height: 1.7;">
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <tr>
              <td style="padding: 8px 0; color: #999; font-weight: 600; width: 140px;">Name:</td>
              <td style="padding: 8px 0; color: #fff;">${name}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #999; font-weight: 600;">Email:</td>
              <td style="padding: 8px 0;"><a href="mailto:${email}" style="color: #daa520;">${email}</a></td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #999; font-weight: 600;">Phone:</td>
              <td style="padding: 8px 0; color: #ccc;">${phone || '(not provided)'}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #999; font-weight: 600;">School:</td>
              <td style="padding: 8px 0; color: #ccc;">${school || '(not provided)'}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #999; font-weight: 600;">Position:</td>
              <td style="padding: 8px 0; color: #fff;">${position}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #999; font-weight: 600;">Availability:</td>
              <td style="padding: 8px 0; color: #ccc;">${availability}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #999; font-weight: 600;">Portfolio:</td>
              <td style="padding: 8px 0;">
                ${portfolio ? `<a href="${portfolio}" style="color: #daa520;">View portfolio</a>` : '(not provided)'}
              </td>
            </tr>
          </table>
          <div style="background: #111; padding: 16px; border-radius: 6px; margin-bottom: 20px;">
            <p style="color: #999; font-size: 12px; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 1px;">Experience & Interest</p>
            <p style="margin: 0; white-space: pre-wrap; color: #ddd;">${experience}</p>
          </div>
        </div>
        <div style="padding: 16px 28px; border-top: 1px solid #222; text-align: center; color: #666; font-size: 12px;">
          <p style="margin: 0;">Reply to this email to contact the applicant directly.</p>
        </div>
      </div>
    `;

    // Send to admin
    await EmailService.sendMail({
      to: process.env.NOTIFY_EMAIL || 'donedealdigital@gmail.com',
      replyTo: email,
      subject: `NEW INTERNSHIP APPLICATION: ${name}`,
      text: applicationText,
      html: applicationHtml
    });

    // Send confirmation to applicant
    const confirmationHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; max-width: 580px; margin: 0 auto; background: #0a0a0a; color: #f3f3f3; border-radius: 12px; overflow: hidden;">
        <div style="padding: 28px 28px 0; text-align: center;">
          <h1 style="font-size: 24px; margin: 0 0 8px 0; color: #daa520; letter-spacing: 2px;">APPLICATION RECEIVED</h1>
          <p style="color: #888; font-size: 13px; margin: 0;">Done Deal Digital · ${new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' })}</p>
        </div>
        <div style="padding: 24px 28px; line-height: 1.7;">
          <p style="margin: 0 0 16px 0;">Hi ${name},</p>
          <p style="margin: 0 0 16px 0;">Thanks for applying for an internship at Done Deal Digital. We've received your application and will review it carefully.</p>
          <p style="margin: 0 0 16px 0;">If we think there's a good fit, someone from our team will reach out within the next 1-2 weeks.</p>
          <p style="margin: 0;">Good luck!</p>
        </div>
        <div style="padding: 16px 28px; border-top: 1px solid #222; text-align: center; color: #666; font-size: 11px;">
          Done Deal Digital LLC · San Francisco Bay Area · <a href="https://donedealdigital.com" style="color: #daa520;">donedealdigital.com</a>
        </div>
      </div>
    `;

    await EmailService.sendMail({
      to: email,
      replyTo: process.env.REPLY_TO_EMAIL || 'donedealdigital@gmail.com',
      subject: 'Application Received — Done Deal Digital Internship',
      html: confirmationHtml,
      text: `Thanks for applying for an internship at Done Deal Digital. We've received your application and will review it carefully. If there's a good fit, someone from our team will reach out within 1-2 weeks.`
    });

    res.json({
      success: true,
      message: 'Application submitted successfully. Check your email for confirmation.'
    });
  } catch (err) {
    console.error('Internship apply error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to submit application' });
  }
});

module.exports = router;
