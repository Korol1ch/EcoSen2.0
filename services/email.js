// ─── EMAIL SERVICE ────────────────────────────────────────────────────────────
// Uses Resend (resend.com) if RESEND_API_KEY is set — free, 100 emails/day.
// Falls back to nodemailer/Gmail if EMAIL_USER + EMAIL_PASS are set.
// If neither is configured → logs the code to console (dev mode).

const nodemailer = require('nodemailer');

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function buildHtml(userName, code) {
  return `<!DOCTYPE html>
<html lang="ru">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f7f6f3;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f6f3;padding:40px 20px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e3dd;">
        <tr><td style="background:#3a7d44;padding:28px 32px;text-align:center;">
          <span style="font-size:32px;">🌿</span>
          <h1 style="margin:8px 0 0;color:#fff;font-size:22px;font-weight:600;">EcoSen</h1>
          <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">AI система учёта переработки отходов</p>
        </td></tr>
        <tr><td style="padding:36px 32px;">
          <p style="margin:0 0 8px;color:#7a7870;font-size:14px;font-weight:500;">Привет, ${userName}!</p>
          <h2 style="margin:0 0 16px;color:#1a1a18;font-size:20px;font-weight:600;">Подтверди свой email-адрес</h2>
          <p style="margin:0 0 28px;color:#5a5850;font-size:15px;line-height:1.6;">
            Введи этот код в приложении. Код действует <strong>15 минут</strong>.
          </p>
          <div style="background:#eaf2ec;border:1px solid #c6e0ca;border-radius:12px;padding:24px;text-align:center;margin-bottom:28px;">
            <p style="margin:0 0 8px;color:#3a7d44;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;">Код подтверждения</p>
            <span style="font-family:'Courier New',monospace;font-size:40px;font-weight:700;color:#1a1a18;letter-spacing:10px;">${code}</span>
          </div>
          <p style="margin:0;color:#7a7870;font-size:13px;">Если ты не регистрировался — проигнори это письмо.</p>
        </td></tr>
        <tr><td style="border-top:1px solid #e5e3dd;padding:20px 32px;text-align:center;">
          <p style="margin:0;color:#aaa8a0;font-size:12px;">© 2026 EcoSen · Актау, Казахстан</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

async function sendVerificationEmail(toEmail, userName, code) {
  const html = buildHtml(userName, code);
  const subject = `${code} — ваш код подтверждения EcoSen`;
  const text = `Привет, ${userName}!\n\nВаш код EcoSen: ${code}\n\nДействует 15 минут.`;

  // ── Option 1: Resend ──────────────────────────────────────────────────────
  if (process.env.RESEND_API_KEY) {
    const { Resend } = require('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    const from = process.env.EMAIL_FROM || 'EcoSen <onboarding@resend.dev>';
    const { error } = await resend.emails.send({ from, to: toEmail, subject, html, text });
    if (error) throw new Error('Resend error: ' + JSON.stringify(error));
    console.log(`[email] Sent via Resend to ${toEmail}`);
    return;
  }

  // ── Option 2: Gmail / nodemailer ──────────────────────────────────────────
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });
    await transporter.sendMail({
      from: `"EcoSen 🌿" <${process.env.EMAIL_USER}>`,
      to: toEmail, subject, html, text,
    });
    console.log(`[email] Sent via Gmail to ${toEmail}`);
    return;
  }

  // ── Option 3: Dev mode — just log the code ────────────────────────────────
  console.warn('⚠️  [email] No email provider configured!');
  console.warn(`   → CODE for ${toEmail}: ${code}`);
  // Don't throw — registration proceeds, admin sees code in server logs
}

module.exports = { generateCode, sendVerificationEmail };
