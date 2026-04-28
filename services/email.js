const nodemailer = require('nodemailer');

// ─── TRANSPORT ────────────────────────────────────────────────────────────────
// Uses Gmail by default. You can also use any SMTP provider (Outlook, Yandex, etc.)
function createTransport() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,   // your Gmail address
      pass: process.env.EMAIL_PASS,   // Gmail App Password (not your real password!)
    },
  });
}

// ─── GENERATE CODE ────────────────────────────────────────────────────────────
function generateCode() {
  // 6-digit numeric code
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ─── SEND VERIFICATION EMAIL ─────────────────────────────────────────────────
async function sendVerificationEmail(toEmail, userName, code) {
  const transporter = createTransport();

  const html = `
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>EcoSen — Email подтверждение</title>
</head>
<body style="margin:0;padding:0;background:#f7f6f3;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f6f3;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e3dd;">
          
          <!-- Header -->
          <tr>
            <td style="background:#3a7d44;padding:28px 32px;text-align:center;">
              <span style="font-size:32px;">🌿</span>
              <h1 style="margin:8px 0 0;color:#ffffff;font-size:22px;font-weight:600;letter-spacing:-0.3px;">EcoSen</h1>
              <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">AI система учёта переработки отходов</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 32px;">
              <p style="margin:0 0 8px;color:#7a7870;font-size:14px;font-weight:500;text-transform:uppercase;letter-spacing:0.5px;">Привет, ${userName}!</p>
              <h2 style="margin:0 0 16px;color:#1a1a18;font-size:20px;font-weight:600;line-height:1.3;">
                Подтверди свой email-адрес
              </h2>
              <p style="margin:0 0 28px;color:#5a5850;font-size:15px;line-height:1.6;">
                Для завершения регистрации в EcoSen введи этот код подтверждения в приложении. Код действует <strong>15 минут</strong>.
              </p>

              <!-- Code block -->
              <div style="background:#eaf2ec;border:1px solid #c6e0ca;border-radius:12px;padding:24px;text-align:center;margin-bottom:28px;">
                <p style="margin:0 0 8px;color:#3a7d44;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;">Код подтверждения</p>
                <span style="font-family:'Courier New',monospace;font-size:40px;font-weight:700;color:#1a1a18;letter-spacing:10px;">${code}</span>
              </div>

              <p style="margin:0 0 0;color:#7a7870;font-size:13px;line-height:1.5;">
                Если ты не регистрировался в EcoSen — просто проигнорируй это письмо.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="border-top:1px solid #e5e3dd;padding:20px 32px;text-align:center;">
              <p style="margin:0;color:#aaa8a0;font-size:12px;">© 2026 EcoSen · Актау, Казахстан</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  await transporter.sendMail({
    from: `"EcoSen 🌿" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: `${code} — ваш код подтверждения EcoSen`,
    html,
    text: `Привет, ${userName}!\n\nВаш код подтверждения EcoSen: ${code}\n\nКод действует 15 минут.\n\nЕсли вы не регистрировались — проигнорируйте письмо.`,
  });
}

module.exports = { generateCode, sendVerificationEmail };
