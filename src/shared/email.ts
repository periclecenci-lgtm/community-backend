const RESEND_API_URL = "https://api.resend.com/emails";
const RESEND_API_KEY = process.env.RESEND_API_KEY;

const EMAIL_FROM =
  process.env.EMAIL_FROM ??
  "SBELM Community <no-reply@community.sbelm.xyz>";

const COMMUNITY_URL =
  process.env.PUBLIC_COMMUNITY_BASE_URL ??
  "http://localhost:3000";

type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

async function sendEmail(message: EmailMessage) {
  if (!RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY_NOT_CONFIGURED");
  }

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();

    throw new Error(
      `RESEND_REQUEST_FAILED:${response.status}:${errorBody}`
    );
  }
}

export async function sendVerificationEmail(
  recipient: string,
  token: string
) {
  const verifyUrl =
    `${COMMUNITY_URL}/community/verify-email` +
    `?token=${encodeURIComponent(token)}`;

  await sendEmail({
    to: recipient,
    subject: "Verify your SBELM Community account",
    text: [
      "Welcome to SBELM Community.",
      "",
      "Verify your email address using this link:",
      verifyUrl,
      "",
      "This link expires in 24 hours.",
      "If you did not create this account, ignore this email.",
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
        <h2>Verify your SBELM Community account</h2>

        <p>
          Welcome to SBELM Community. Confirm your email address
          by clicking the button below.
        </p>

        <p>
          <a
            href="${verifyUrl}"
            style="
              display:inline-block;
              padding:12px 20px;
              border-radius:6px;
              background:#111;
              color:#fff;
              text-decoration:none;
            "
          >
            Verify email
          </a>
        </p>

        <p>This link expires in 24 hours.</p>

        <p style="font-size:12px;color:#666">
          If you did not create this account, you can ignore this email.
        </p>
      </div>
    `,
  });
}

export async function sendPasswordResetEmail(
  recipient: string,
  token: string
) {
  const resetUrl =
    `${COMMUNITY_URL}/community/reset-password` +
    `?token=${encodeURIComponent(token)}`;

  await sendEmail({
    to: recipient,
    subject: "Reset your SBELM Community password",
    text: [
      "A password reset was requested for your account.",
      "",
      "Choose a new password using this link:",
      resetUrl,
      "",
      "This link expires in 1 hour.",
      "If you did not request this reset, ignore this email.",
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
        <h2>Reset your SBELM Community password</h2>

        <p>
          A password reset was requested for your account.
          Click the button below to choose a new password.
        </p>

        <p>
          <a
            href="${resetUrl}"
            style="
              display:inline-block;
              padding:12px 20px;
              border-radius:6px;
              background:#111;
              color:#fff;
              text-decoration:none;
            "
          >
            Reset password
          </a>
        </p>

        <p>This link expires in 1 hour.</p>

        <p style="font-size:12px;color:#666">
          If you did not request this reset, you can ignore this email.
        </p>
      </div>
    `,
  });
}