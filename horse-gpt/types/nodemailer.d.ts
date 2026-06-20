declare module "nodemailer" {
  interface Attachment {
    filename?: string;
    content?: Buffer | string;
    contentType?: string;
  }

  interface SendMailOptions {
    from?: string;
    to?: string | string[];
    subject?: string;
    text?: string;
    html?: string;
    attachments?: Attachment[];
  }

  interface SmtpAuth {
    user: string;
    pass: string;
  }

  interface SmtpTransportOptions {
    host?: string;
    port?: number;
    secure?: boolean;
    auth?: SmtpAuth;
  }

  interface Transporter {
    sendMail(options: SendMailOptions): Promise<{ messageId: string }>;
    verify(): Promise<true>;
  }

  export function createTransport(options: SmtpTransportOptions): Transporter;

  const nodemailer: {
    createTransport(options: SmtpTransportOptions): Transporter;
  };

  export default nodemailer;
}
