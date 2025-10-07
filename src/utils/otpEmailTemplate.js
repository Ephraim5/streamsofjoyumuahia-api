// Streams of Joy Umuahia Branded OTP Email Template
// Usage: buildOtpEmail({ code, minutesValid, supportEmail })

function buildOtpEmail({ code, minutesValid = 10, supportEmail = 'support@streamsofjoyumuahia.org' }) {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Your Verification Code</title>
  <style>
    :root { --brand:#0A4D8C; --accent:#FDB515; --bg:#f5f7fa; --card:#ffffff; --danger:#C62828; }
    * { box-sizing:border-box; font-family: 'Segoe UI', Roboto, Arial, sans-serif; }
    body { margin:0; background:var(--bg); padding:24px; color:#1a1f29; }
    .wrapper { max-width:560px; margin:0 auto; }
    .brand { text-align:center; margin-bottom:24px; }
    .brand h1 { margin:4px 0 0; font-size:20px; letter-spacing:.5px; color:var(--brand); }
    .card { background:var(--card); border-radius:16px; padding:32px 32px 40px; box-shadow:0 4px 14px rgba(15,35,90,.08); border:1px solid #e3e8ef; }
    h2 { margin:0 0 12px; font-size:19px; color:var(--brand); }
    p { line-height:1.5; margin:0 0 16px; font-size:15px; }
    .otp { letter-spacing:8px; font-size:40px; font-weight:700; text-align:center; color:var(--brand); padding:18px 8px; background:#f0f6fb; border:2px solid #d5e6f2; border-radius:14px; font-family:'Courier New',monospace; }
    .meta { font-size:12px; text-align:center; color:#5a6475; margin-top:12px; }
    .warn { margin-top:20px; background:#fff8f2; border:1px solid #ffe2c2; padding:12px 16px; border-radius:12px; font-size:13px; display:flex; gap:10px; align-items:flex-start; }
    .warn strong { color:#9c5a00; }
    .footer { margin-top:32px; text-align:center; font-size:12px; color:#6b7480; }
    .btn-row { text-align:center; margin-top:30px; }
    .btn { display:inline-block; background:var(--brand); color:#fff !important; padding:14px 28px; font-size:15px; text-decoration:none; border-radius:30px; box-shadow:0 4px 10px rgba(18,63,120,.25); font-weight:600; letter-spacing:.5px; }
    @media (max-width:520px){
      body { padding:12px; }
      .card { padding:28px 20px 36px; }
      .otp { font-size:34px; letter-spacing:6px; }
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="brand">
      <img src="https://streamsofjoyumuahia.org/logo.png" alt="Streams of Joy Umuahia" style="width:68px;height:auto;border-radius:14px;box-shadow:0 4px 10px rgba(0,0,0,.06);"/>
      <h1>Streams of Joy Umuahia</h1>
    </div>
    <div class="card">
      <h2>Your Verification Code</h2>
      <p>Use the one-time verification code below to continue your secure sign‑in.</p>
      <div class="otp" role="text" aria-label="One time code">${code}</div>
      <div class="meta">Code expires in ${minutesValid} minutes. Do not share it with anyone.</div>
      <div class="warn"><strong>Security Tip:</strong> Streams of Joy staff will never ask you for this code. If you didn’t request it, you can safely ignore this email.</div>
      <div class="btn-row">
        <a class="btn" href="https://streamsofjoyumuahia.org" target="_blank" rel="noopener noreferrer">Visit Website</a>
      </div>
    </div>
    <div class="footer">&copy; ${year} Streams of Joy Umuahia. All rights reserved.<br/>Need help? <a href="mailto:${supportEmail}" style="color:var(--brand);text-decoration:none;">${supportEmail}</a></div>
  </div>
</body>
</html>`;
}

module.exports = { buildOtpEmail };