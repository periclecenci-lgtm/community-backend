import nodemailer from "nodemailer";

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT ?? 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const EMAIL_FROM =
  process.env.EMAIL_FROM ?? "SBELM Community <no-reply@sbelm.local>";
const BASE_URL =
  process.env.PUBLIC_COMMUNITY_BASE_URL ?? "http://localhost:3000";

// =========================
// VERIFY EMAIL
// =========================

export async function sendVerificationEmail(to: string, token: string) {
  const verifyUrl = `${BASE_URL}/community/verify?token=${token}`;

  console.log("=== EMAIL DEBUG ===");
  console.log("SMTP_HOST:", SMTP_HOST);
  console.log("SMTP_USER:", SMTP_USER);
  console.log("SMTP_PASS exists:", !!SMTP_PASS);
  console.log("TO:", to);
  console.log("VERIFY URL:", verifyUrl);

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.log("[EMAIL-DEV] Verify link:", verifyUrl);
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: false,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS
      }
    });

    const info = await transporter.sendMail({
      from: EMAIL_FROM,
      to,
      subject: "Verify your SBELM Community account",
      text: `Verify your account by clicking:\n\n${verifyUrl}`
    });

    console.log("EMAIL SENT:", info.messageId);
  } catch (err) {
    console.error("EMAIL ERROR:", err);
  }
}

// =========================
// RESET PASSWORD
// =========================

export async function sendPasswordResetEmail(to: string, token: string) {
  const resetUrl = `${BASE_URL}/community/reset-password?token=${token}`;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.log("[EMAIL-DEV] Reset password link:", resetUrl);
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: false,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS
      }
    });

    const info = await transporter.sendMail({
      from: EMAIL_FROM,
      to,
      subject: "Reset your SBELM Community password",
      text: `Reset your password by clicking:\n\n${resetUrl}`
    });

    console.log("RESET EMAIL SENT:", info.messageId);
  } catch (err) {
    console.error("RESET EMAIL ERROR:", err);
  }
}