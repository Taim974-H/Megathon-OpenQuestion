import "server-only";

import nodemailer from "nodemailer";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import {
  EMAIL_FROM_ADDRESS,
  EMAIL_FROM_NAME,
  MEGATHON_COPY,
  getModeAppName,
} from "@/lib/chat-config";
import type { ChatMessage, ChatMode } from "@/types/chat";

type Theme = {
  background: ReturnType<typeof rgb>;
  panel: ReturnType<typeof rgb>;
  accent: ReturnType<typeof rgb>;
  accentSoft: ReturnType<typeof rgb>;
  bubbleAssistant: ReturnType<typeof rgb>;
  bubbleUser: ReturnType<typeof rgb>;
  text: ReturnType<typeof rgb>;
  textMuted: ReturnType<typeof rgb>;
  chipText: ReturnType<typeof rgb>;
  headerBands: ReturnType<typeof rgb>[];
};

const PAGE = {
  width: 595,
  height: 842,
  margin: 42,
};

const FONT_SIZES = {
  title: 24,
  subtitle: 11,
  body: 11,
  label: 9,
  chip: 10,
  sectionTitle: 18,
};

const MEGATHON_COLORS = {
  black: rgb(0.07, 0.06, 0.05),
  gold: rgb(0.77, 0.64, 0.29),
  goldSoft: rgb(0.9, 0.82, 0.59),
  white: rgb(0.98, 0.97, 0.95),
  whiteMuted: rgb(0.9, 0.89, 0.85),
};

function getModeLabel(mode: ChatMode) {
  return mode === "unicorn" ? "Unicorn Mode" : "Horse Mode";
}

function getModeSubtitle(mode: ChatMode) {
  return mode === "unicorn"
    ? "Magenta sparkle chaos with rainbow overconfidence."
    : "Grounded hoofwork with dry stable confidence.";
}

function getTheme(mode: ChatMode): Theme {
  if (mode === "unicorn") {
    return {
      background: rgb(0.98, 0.94, 1),
      panel: rgb(1, 1, 1),
      accent: rgb(0.85, 0.12, 0.59),
      accentSoft: rgb(1, 0.86, 0.96),
      bubbleAssistant: rgb(1, 0.92, 0.98),
      bubbleUser: rgb(0.49, 0.1, 0.63),
      text: rgb(0.22, 0.08, 0.26),
      textMuted: rgb(0.46, 0.28, 0.5),
      chipText: rgb(1, 1, 1),
      headerBands: [
        rgb(0.98, 0.36, 0.44),
        rgb(1, 0.64, 0.29),
        rgb(1, 0.88, 0.25),
        rgb(0.42, 0.84, 0.47),
        rgb(0.28, 0.62, 0.96),
        rgb(0.61, 0.39, 0.9),
      ],
    };
  }

  return {
    background: rgb(0.98, 0.96, 0.93),
    panel: rgb(1, 1, 1),
    accent: rgb(0.54, 0.35, 0.24),
    accentSoft: rgb(0.94, 0.9, 0.85),
    bubbleAssistant: rgb(0.93, 0.89, 0.85),
    bubbleUser: rgb(0.54, 0.35, 0.24),
    text: rgb(0.14, 0.1, 0.07),
    textMuted: rgb(0.45, 0.36, 0.31),
    chipText: rgb(1, 0.97, 0.94),
    headerBands: [rgb(0.54, 0.35, 0.24), rgb(0.66, 0.48, 0.35), rgb(0.82, 0.74, 0.66)],
  };
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const lines: string[] = [];
  const paragraphs = text.replace(/\r/g, "").split("\n");

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);

    if (words.length === 0) {
      lines.push("");
      continue;
    }

    let currentLine = words[0];

    for (const word of words.slice(1)) {
      const next = `${currentLine} ${word}`;

      if (font.widthOfTextAtSize(next, size) <= maxWidth) {
        currentLine = next;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }

    lines.push(currentLine);
  }

  return lines;
}

function drawWrappedText({
  page,
  text,
  font,
  size,
  color,
  x,
  y,
  width,
  lineHeight,
}: {
  page: PDFPage;
  text: string;
  font: PDFFont;
  size: number;
  color: ReturnType<typeof rgb>;
  x: number;
  y: number;
  width: number;
  lineHeight: number;
}) {
  const lines = wrapText(text, font, size, width);

  for (const [index, line] of lines.entries()) {
    page.drawText(line, {
      x,
      y: y - index * lineHeight,
      size,
      font,
      color,
    });
  }

  return lines.length * lineHeight;
}

function drawPageBackground(page: PDFPage, theme: Theme, mode: ChatMode) {
  page.drawRectangle({
    x: 0,
    y: 0,
    width: PAGE.width,
    height: PAGE.height,
    color: theme.background,
  });

  const bandHeight = mode === "unicorn" ? 10 : 16;

  theme.headerBands.forEach((color, index) => {
    page.drawRectangle({
      x: 0,
      y: PAGE.height - (index + 1) * bandHeight,
      width: PAGE.width,
      height: bandHeight,
      color,
      opacity: mode === "unicorn" ? 0.9 : 0.95,
    });
  });

  page.drawRectangle({
    x: PAGE.margin,
    y: PAGE.margin,
    width: PAGE.width - PAGE.margin * 2,
    height: PAGE.height - PAGE.margin * 2 - 18,
    color: theme.panel,
    opacity: 0.96,
  });

  if (mode === "unicorn") {
    for (let index = 0; index < 20; index += 1) {
      page.drawCircle({
        x: 70 + (index * 23) % 470,
        y: 660 - (index * 29) % 520,
        size: 4 + (index % 3),
        color: theme.headerBands[index % theme.headerBands.length],
        opacity: 0.18,
      });
    }
  }
}

function drawChip(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  font: PDFFont,
  theme: Theme,
) {
  const paddingX = 10;
  const width = font.widthOfTextAtSize(text, FONT_SIZES.chip) + paddingX * 2;

  page.drawRectangle({
    x,
    y: y - 4,
    width,
    height: 22,
    color: theme.accent,
  });

  page.drawText(text, {
    x: x + paddingX,
    y: y + 3,
    size: FONT_SIZES.chip,
    font,
    color: theme.chipText,
  });

  return width;
}

function drawRoundedRect(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  color: ReturnType<typeof rgb>,
  opacity = 1,
) {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));

  page.drawRectangle({
    x: x + safeRadius,
    y,
    width: width - safeRadius * 2,
    height,
    color,
    opacity,
  });

  page.drawRectangle({
    x,
    y: y + safeRadius,
    width,
    height: height - safeRadius * 2,
    color,
    opacity,
  });

  page.drawCircle({
    x: x + safeRadius,
    y: y + safeRadius,
    size: safeRadius,
    color,
    opacity,
  });
  page.drawCircle({
    x: x + width - safeRadius,
    y: y + safeRadius,
    size: safeRadius,
    color,
    opacity,
  });
  page.drawCircle({
    x: x + safeRadius,
    y: y + height - safeRadius,
    size: safeRadius,
    color,
    opacity,
  });
  page.drawCircle({
    x: x + width - safeRadius,
    y: y + height - safeRadius,
    size: safeRadius,
    color,
    opacity,
  });
}

function getFileName(mode: ChatMode) {
  const stamp = new Date().toISOString().slice(0, 10);
  return `${getModeAppName(mode).toLowerCase()}-${mode}-${stamp}.pdf`;
}

function drawTranscriptHeader(
  page: PDFPage,
  theme: Theme,
  font: PDFFont,
  y: number,
) {
  page.drawText("Transcript", {
    x: PAGE.margin + 18,
    y,
    size: FONT_SIZES.sectionTitle,
    font,
    color: theme.text,
  });

  page.drawRectangle({
    x: PAGE.margin + 18,
    y: y - 10,
    width: 96,
    height: 2,
    color: theme.accent,
    opacity: 0.72,
  });
}

export async function buildChatPdf(messages: ChatMessage[], mode: ChatMode) {
  const pdf = await PDFDocument.create();
  const theme = getTheme(mode);
  const regularFont = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([PAGE.width, PAGE.height]);
  let cursorY = PAGE.height - PAGE.margin - 42;

  const addPage = () => {
    page = pdf.addPage([PAGE.width, PAGE.height]);
    drawPageBackground(page, theme, mode);
    cursorY = PAGE.height - PAGE.margin - 42;
  };

  drawPageBackground(page, theme, mode);

  const appName = getModeAppName(mode);

  page.drawText(appName, {
    x: PAGE.margin + 18,
    y: cursorY,
    size: FONT_SIZES.title,
    font: boldFont,
    color: theme.text,
  });

  cursorY -= 20;

  page.drawText(getModeSubtitle(mode), {
    x: PAGE.margin + 18,
    y: cursorY,
    size: FONT_SIZES.subtitle,
    font: regularFont,
    color: theme.textMuted,
  });

  cursorY -= 28;

  const chipStartX = PAGE.margin + 18;
  const firstChipWidth = drawChip(
    page,
    getModeLabel(mode),
    chipStartX,
    cursorY,
    boldFont,
    theme,
  );

  drawChip(
    page,
    "MEGATHON",
    chipStartX + firstChipWidth + 10,
    cursorY,
    boldFont,
    theme,
  );

  cursorY -= 44;

  const cardX = PAGE.margin + 18;
  const cardWidth = PAGE.width - PAGE.margin * 2 - 36;
  const cardInnerX = cardX + 36;
  const cardInnerWidth = cardWidth - 72;
  const builtWithText = MEGATHON_COPY.builtWith.join("  •  ");
  const statsText = MEGATHON_COPY.stats.join("  •  ");
  const manifestoText = MEGATHON_COPY.manifesto.join("\n");
  const builtWithLabelSize = 11;
  const builtWithValueSize = 12;
  const builtWithLineHeight = 14;
  const statsLineHeight = 12;
  const manifestoLineHeight = 14;
  const builtWithLines = wrapText(
    builtWithText,
    regularFont,
    builtWithValueSize,
    cardInnerWidth,
  );
  const statsLines = wrapText(statsText, regularFont, 9.5, cardInnerWidth);
  const manifestoLines = wrapText(
    manifestoText,
    regularFont,
    10.5,
    cardInnerWidth,
  );
  const builtWithBlockHeight =
    20 + builtWithLines.length * builtWithLineHeight;
  const cardHeight =
    34 +
    26 +
    20 +
    18 +
    statsLines.length * statsLineHeight +
    18 +
    manifestoLines.length * manifestoLineHeight +
    28 +
    builtWithBlockHeight +
    28;

  drawRoundedRect(
    page,
    cardX,
    cursorY - cardHeight,
    cardWidth,
    cardHeight,
    20,
    MEGATHON_COLORS.black,
  );

  page.drawText(MEGATHON_COPY.title, {
    x: cardInnerX,
    y: cursorY - 40,
    size: 21,
    font: boldFont,
    color: MEGATHON_COLORS.goldSoft,
  });

  page.drawText(MEGATHON_COPY.subtitle, {
    x: cardInnerX,
    y: cursorY - 68,
    size: FONT_SIZES.body,
    font: regularFont,
    color: MEGATHON_COLORS.whiteMuted,
  });
  const statsStartY = cursorY - 98;

  drawWrappedText({
    page,
    text: statsText,
    font: regularFont,
    size: 9.5,
    color: MEGATHON_COLORS.white,
    x: cardInnerX,
    y: statsStartY,
    width: cardInnerWidth,
    lineHeight: statsLineHeight,
  });

  const manifestoStartY =
    statsStartY - statsLines.length * statsLineHeight - 22;

  drawWrappedText({
    page,
    text: manifestoText,
    font: regularFont,
    size: 10.5,
    color: MEGATHON_COLORS.whiteMuted,
    x: cardInnerX,
    y: manifestoStartY,
    width: cardInnerWidth,
    lineHeight: manifestoLineHeight,
  });

  const builtWithLabelY = cursorY - cardHeight + 44;

  page.drawText("Built with", {
    x: cardInnerX,
    y: builtWithLabelY,
    size: builtWithLabelSize,
    font: boldFont,
    color: MEGATHON_COLORS.goldSoft,
  });

  drawWrappedText({
    page,
    text: builtWithText,
    font: regularFont,
    size: builtWithValueSize,
    color: MEGATHON_COLORS.white,
    x: cardInnerX,
    y: builtWithLabelY - 18,
    width: cardInnerWidth,
    lineHeight: builtWithLineHeight,
  });

  cursorY -= cardHeight + 36;

  drawTranscriptHeader(page, theme, boldFont, cursorY);

  cursorY -= 34;

  const transcriptX = PAGE.margin + 18;
  const transcriptWidth = PAGE.width - PAGE.margin * 2 - 36;
  const bubbleMaxWidth = transcriptWidth * 0.66;
  const bubbleMinWidth = 164;
  const bubblePaddingX = 18;
  const bubblePaddingY = 15;
  const lineHeight = 15;
  const bubbleGap = 18;
  const sideInset = 10;
  const roleGap = 10;
  const textWidth = bubbleMaxWidth - bubblePaddingX * 2;

  for (const message of messages) {
    const isUser = message.role === "user";
    const bubbleColor = isUser ? theme.bubbleUser : theme.bubbleAssistant;
    const textColor = isUser ? rgb(1, 0.98, 0.97) : theme.text;
    const allLines = wrapText(
      message.content,
      regularFont,
      FONT_SIZES.body,
      textWidth,
    );
    let lineIndex = 0;

    while (lineIndex < allLines.length) {
      const minChunkHeight = bubblePaddingY * 2 + lineHeight;

      if (cursorY - minChunkHeight < PAGE.margin + 24) {
        addPage();
        drawTranscriptHeader(page, theme, boldFont, cursorY);
        cursorY -= 34;
      }

      const availableHeight = cursorY - (PAGE.margin + 24) - bubblePaddingY * 2;
      const linesPerPage = Math.max(1, Math.floor(availableHeight / lineHeight));
      const chunkLines = allLines.slice(lineIndex, lineIndex + linesPerPage);
      const longestLineWidth = chunkLines.reduce((max, line) => {
        return Math.max(max, regularFont.widthOfTextAtSize(line, FONT_SIZES.body));
      }, 0);
      const bubbleWidth = Math.min(
        bubbleMaxWidth,
        Math.max(bubbleMinWidth, longestLineWidth + bubblePaddingX * 2),
      );
      const bubbleHeight = bubblePaddingY * 2 + chunkLines.length * lineHeight;
      const bubbleX = isUser
        ? transcriptX + transcriptWidth - bubbleWidth - sideInset
        : transcriptX + sideInset;

      drawRoundedRect(
        page,
        bubbleX,
        cursorY - bubbleHeight,
        bubbleWidth,
        bubbleHeight,
        18,
        bubbleColor,
      );

      drawWrappedText({
        page,
        text: chunkLines.join("\n"),
        font: regularFont,
        size: FONT_SIZES.body,
        color: textColor,
        x: bubbleX + bubblePaddingX,
        y: cursorY - bubblePaddingY - FONT_SIZES.body,
        width: bubbleWidth - bubblePaddingX * 2,
        lineHeight,
      });

      cursorY -= bubbleHeight + bubbleGap;
      lineIndex += chunkLines.length;

      if (lineIndex < allLines.length) {
        cursorY -= roleGap;
        addPage();
        drawTranscriptHeader(page, theme, boldFont, cursorY);
        cursorY -= 34;
      }
    }
  }

  return Buffer.from(await pdf.save());
}

export async function emailChatPdf({
  email,
  pdfBytes,
  mode,
}: {
  email: string;
  pdfBytes: Buffer;
  mode: ChatMode;
}) {
  // SMTP credentials. Defaults target Gmail SMTP, but the SMTP_* vars work for
  // any provider. Legacy OUTLOOK_* vars are still honored as a fallback.
  const user =
    process.env.SMTP_USER ?? process.env.OUTLOOK_USER ?? EMAIL_FROM_ADDRESS;
  const pass = process.env.SMTP_PASSWORD ?? process.env.OUTLOOK_PASSWORD ?? "";
  const host =
    process.env.SMTP_HOST ?? process.env.OUTLOOK_SMTP_HOST ?? "smtp.gmail.com";
  const port = Number(
    process.env.SMTP_PORT ?? process.env.OUTLOOK_SMTP_PORT ?? "465",
  );

  if (!pass) {
    return {
      sent: false,
      error:
        "Email sending is not configured yet. Set SMTP_PASSWORD on the server.",
    };
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    // 587 uses STARTTLS (secure=false); 465 uses implicit TLS (secure=true).
    secure: port === 465,
    auth: { user, pass },
  });

  try {
    await transporter.sendMail({
      // Gmail forces the From header to the authenticated account, so we send
      // as the SMTP user with the app's display name.
      from: `"${EMAIL_FROM_NAME}" <${user}>`,
      to: email,
      subject: `${getModeAppName(mode)} transcript from ${getModeLabel(mode)}`,
      text: [
        `Your ${getModeAppName(mode)} conversation is attached.`,
        "",
        MEGATHON_COPY.title,
        MEGATHON_COPY.subtitle,
        "",
        ...MEGATHON_COPY.manifesto,
      ].join("\n"),
      html: `
        <div style="font-family:Arial,sans-serif;color:#18120f;line-height:1.6">
          <h1 style="margin:0 0 12px;font-size:24px">${getModeAppName(mode)}</h1>
          <p style="margin:0 0 16px">Your conversation transcript is attached as a PDF.</p>
          <div style="padding:18px 20px;border-radius:18px;background:#0f0d0c;color:#f8f7f3">
            <div style="font-size:28px;font-weight:700;letter-spacing:0.04em">${MEGATHON_COPY.title}</div>
            <div style="margin-top:8px;color:#e7e2d9">${MEGATHON_COPY.subtitle}</div>
            <div style="margin-top:14px;color:#d8c26d;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase">Built with</div>
            <div style="margin-top:6px">${MEGATHON_COPY.builtWith.join(" • ")}</div>
          </div>
        </div>
      `,
      attachments: [
        {
          filename: getFileName(mode),
          content: pdfBytes,
          contentType: "application/pdf",
        },
      ],
    });
  } catch (error) {
    return {
      sent: false,
      error: error instanceof Error ? error.message : "Email delivery failed.",
    };
  }

  return { sent: true };
}

export function getPdfFileName(mode: ChatMode) {
  return getFileName(mode);
}
