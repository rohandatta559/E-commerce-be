import nodemailer from 'nodemailer';

const createTransporter = () => {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error('SMTP configuration missing (SMTP_HOST, SMTP_USER, SMTP_PASS)');
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });
};

export const sendEmailWithAttachment = async ({ to, subject, text, html, attachments = [] }) => {
  const transporter = createTransporter();
  const from = process.env.EMAIL_FROM || 'no-reply@commerce.com';

  const info = await transporter.sendMail({
    from,
    to,
    subject,
    text,
    html,
    attachments
  });

  return info;
};
