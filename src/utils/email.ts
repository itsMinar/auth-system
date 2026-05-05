import nodemailer, { Transporter } from "nodemailer";
import { env } from "../config/env";
import { AppError } from "../utils/errors";

// ── Transporter ───────────────────────────────────────────────────────────────

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (transporter) return transporter;

  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
    // In dev, use Ethereal (or just log)
    console.warn("⚠️  SMTP not configured — emails will be logged to console");
    return nodemailer.createTransport({ jsonTransport: true });
  }

  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ?? 587,
    secure: env.SMTP_SECURE ?? false,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  });

  return transporter;
}

// ── Email Templates ───────────────────────────────────────────────────────────

function baseTemplate(title: string, body: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f4f4f5; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 40px auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
    .header { background: #18181b; padding: 32px; text-align: center; }
    .header h1 { color: #fff; margin: 0; font-size: 20px; font-weight: 600; letter-spacing: -0.5px; }
    .body { padding: 32px; color: #3f3f46; line-height: 1.6; }
    .body p { margin: 0 0 16px; }
    .button { display: inline-block; background: #18181b; color: #fff !important; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500; font-size: 14px; margin: 8px 0; }
    .footer { padding: 24px 32px; background: #fafafa; border-top: 1px solid #e4e4e7; font-size: 12px; color: #a1a1aa; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>Auth System</h1></div>
    <div class="body">${body}</div>
    <div class="footer">
      <p>If you did not request this email, you can safely ignore it.</p>
      <p>© ${new Date().getFullYear()} Auth System. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;
}

// ── Send Helpers ──────────────────────────────────────────────────────────────

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

async function sendEmail(options: SendEmailOptions): Promise<void> {
  const t = getTransporter();
  try {
    const info = await t.sendMail({
      from: env.SMTP_FROM ?? '"Auth System" <no-reply@example.com>',
      ...options,
    });

    // In dev with jsonTransport, log the message
    if ((info as any).message) {
      console.log("📧  Email (dev mode):", JSON.parse((info as any).message));
    }
  } catch (err) {
    console.error("Email send error:", err);
    throw new AppError("EMAIL_SEND_FAILED", "Failed to send email", 500);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function sendVerificationEmail(
  to: string,
  name: string,
  token: string
): Promise<void> {
  const link = `${env.APP_URL}/api/auth/verify-email?token=${token}`;

  await sendEmail({
    to,
    subject: "Verify your email address",
    html: baseTemplate(
      "Verify your email",
      `
      <p>Hi ${name},</p>
      <p>Thanks for signing up. Please verify your email address to get started.</p>
      <p><a href="${link}" class="button">Verify Email Address</a></p>
      <p>Or copy and paste this link:<br/><a href="${link}">${link}</a></p>
      <p>This link expires in <strong>24 hours</strong>.</p>
    `
    ),
  });
}

export async function sendPasswordResetEmail(
  to: string,
  name: string,
  token: string
): Promise<void> {
  const link = `${env.CLIENT_URL}/reset-password?token=${token}`;

  await sendEmail({
    to,
    subject: "Reset your password",
    html: baseTemplate(
      "Reset your password",
      `
      <p>Hi ${name},</p>
      <p>We received a request to reset the password for your account.</p>
      <p><a href="${link}" class="button">Reset Password</a></p>
      <p>Or copy and paste this link:<br/><a href="${link}">${link}</a></p>
      <p>This link expires in <strong>1 hour</strong>. If you did not request a password reset, please ignore this email — your password will not be changed.</p>
    `
    ),
  });
}
