import nodemailer from "nodemailer";

export const mailer = nodemailer.createTransport({
  host: "mail.privateemail.com",
  port: 587,
  secure: false, // TLS
  auth: {
    user: "info@sbelm.xyz",
    pass: "Pericle75!",
  },
});

export async function sendVerificationEmail({
  to,
  token,
}: {
  to: string;
  token: string;
}) {
  const verifyUrl = `http://localhost:3000/community/verify?token=${token}`;

  await mailer.sendMail({
    from: '"SBELM" <info@sbelm.xyz>',
    to,
    subject: "Verify your SBELM account",
    html: `
      <div style="font-family:Arial,sans-serif;">
        <h2>Verify your account</h2>
        <p>Click the button below to verify your email:</p>
        <a href="${verifyUrl}" 
           style="display:inline-block;padding:12px 20px;background:#111;color:#fff;text-decoration:none;border-radius:6px;">
           Verify Account
        </a>
        <p style="margin-top:20px;font-size:12px;color:#666;">
          If you did not request this, ignore this email.
        </p>
      </div>
    `,
  });
}