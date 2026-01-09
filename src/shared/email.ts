import nodemailer from "nodemailer";

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT ?? 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const EMAIL_FROM = process.env.EMAIL_FROM ?? "SBELM Community <no-reply@sbelm.local>";
const BASE_URL = process.env.PUBLIC_COMMUNITY_BASE_URL ?? "http://localhost:3000";

export async function sendVerificationEmail(to: string, token: string) {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    // DEV MODE: log instead of sending
    console.log("[EMAIL-DEV] Verify link:", `${BASE_URL}/community/verify?token=${token}`);
    return;
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: false,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    }
  });

  await transporter.sendMail({
    from: EMAIL_FROM,
    to,
    subject: "Verify your SBELM Community account",
    text: `Verify your account by clicking:\n\n${BASE_URL}/community/verify?token=${token}`
  });
}
