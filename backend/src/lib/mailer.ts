import nodemailer, { Transporter } from "nodemailer";

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const MAIL_FROM_NAME = process.env.MAIL_FROM_NAME || "Flodata Digital Twin";

let transporter: Transporter | null = null;
let warnedMissingConfig = false;

// Lazily created (and only if credentials are configured) so local/dev
// environments without GMAIL_USER/GMAIL_APP_PASSWORD set can still boot and
// run normally — email just silently no-ops instead of crashing the server.
function getTransporter(): Transporter | null {
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    if (!warnedMissingConfig) {
      console.warn("[mailer] GMAIL_USER / GMAIL_APP_PASSWORD not set — emails will not be sent.");
      warnedMissingConfig = true;
    }
    return null;
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD }
    });
  }
  return transporter;
}

export interface MailMessage {
  to?: string | string[];
  // For broadcasts to many recipients (e.g. an announcement to every active
  // user), use bcc so recipients don't see each other's addresses.
  bcc?: string | string[];
  // GMAIL_USER is a fixed sending mailbox, not any particular person — set
  // replyTo to the actual human on the other side of the conversation (the
  // reporter for admin-facing emails, the acting admin for reporter-facing
  // ones) so hitting "Reply" in Gmail reaches them directly.
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Best-effort email send. Never throws — a broken/unconfigured mail server
 * should never take down the underlying complaint/announcement action, the
 * same way the in-app notification side-channel degrades gracefully.
 */
export async function sendMail(message: MailMessage): Promise<void> {
  const to = Array.isArray(message.to) ? message.to.filter(Boolean) : message.to;
  const bcc = Array.isArray(message.bcc) ? message.bcc.filter(Boolean) : message.bcc;
  const hasTo = Boolean(to) && !(Array.isArray(to) && to.length === 0);
  const hasBcc = Boolean(bcc) && !(Array.isArray(bcc) && bcc.length === 0);
  if (!hasTo && !hasBcc) return;

  const client = getTransporter();
  if (!client) return;

  try {
    await client.sendMail({
      from: `"${MAIL_FROM_NAME}" <${GMAIL_USER}>`,
      // A bcc-only broadcast still needs a "to" for the message to be valid —
      // address it to the sender itself.
      to: hasTo ? to : `"${MAIL_FROM_NAME}" <${GMAIL_USER}>`,
      bcc: hasBcc ? bcc : undefined,
      replyTo: message.replyTo || undefined,
      subject: message.subject,
      html: message.html,
      text: message.text
    });
  } catch (err) {
    console.error("[mailer] Failed to send email:", (err as Error).message);
  }
}
