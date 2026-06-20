import "server-only";

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import {
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
  const cardHeight = 138;

  drawRoundedRect(
    page,
    cardX,
    cursorY - cardHeight,
    cardWidth,
    cardHeight,
    20,
    MEGATHON_COLORS.black,
  );

  page.drawRectangle({
    x: cardX,
    y: cursorY - 7,
    width: cardWidth,
    height: 7,
    color: MEGATHON_COLORS.gold,
  });

  page.drawText(MEGATHON_COPY.title, {
    x: PAGE.margin + 32,
    y: cursorY - 18,
    size: 21,
    font: boldFont,
    color: MEGATHON_COLORS.white,
  });

  page.drawText(MEGATHON_COPY.subtitle, {
    x: PAGE.margin + 32,
    y: cursorY - 41,
    size: FONT_SIZES.body,
    font: regularFont,
    color: MEGATHON_COLORS.whiteMuted,
  });

  page.drawText("Built with", {
    x: PAGE.margin + 32,
    y: cursorY - 64,
    size: 9,
    font: boldFont,
    color: MEGATHON_COLORS.goldSoft,
  });

  page.drawText(MEGATHON_COPY.builtWith.join("  •  "), {
    x: PAGE.margin + 32,
    y: cursorY - 79,
    size: 10,
    font: regularFont,
    color: MEGATHON_COLORS.white,
  });

  const partnerText = [
    MEGATHON_COPY.stats.join("  •  "),
    "",
    ...MEGATHON_COPY.manifesto,
  ].join("\n");

  drawWrappedText({
    page,
    text: partnerText,
    font: regularFont,
    size: 9.5,
    color: MEGATHON_COLORS.whiteMuted,
    x: PAGE.margin + 32,
    y: cursorY - 100,
    width: PAGE.width - PAGE.margin * 2 - 64,
    lineHeight: 12,
  });

  cursorY -= 160;

  page.drawText("Transcript", {
    x: PAGE.margin + 18,
    y: cursorY,
    size: 10,
    font: boldFont,
    color: theme.textMuted,
  });

  cursorY -= 18;

  const transcriptX = PAGE.margin + 18;
  const transcriptWidth = PAGE.width - PAGE.margin * 2 - 36;
  const maxTextWidth = transcriptWidth * 0.62;
  const minBubbleWidth = 140;
  const paddingX = 16;
  const paddingY = 14;
  const lineHeight = 15;

  for (const message of messages) {
    const isUser = message.role === "user";
    const bubbleColor = isUser ? theme.bubbleUser : theme.bubbleAssistant;
    const textColor = isUser ? rgb(1, 0.98, 0.97) : theme.text;
    const allLines = wrapText(
      message.content,
      regularFont,
      FONT_SIZES.body,
      maxTextWidth,
    );
    let lineIndex = 0;

    while (lineIndex < allLines.length) {
      const minChunkHeight = paddingY * 2 + lineHeight;

      if (cursorY - minChunkHeight < PAGE.margin + 24) {
        addPage();
      }

      const availableHeight = cursorY - (PAGE.margin + 24) - paddingY * 2;
      const linesPerPage = Math.max(1, Math.floor(availableHeight / lineHeight));
      const chunkLines = allLines.slice(lineIndex, lineIndex + linesPerPage);
      const longestLineWidth = chunkLines.reduce((max, line) => {
        return Math.max(max, regularFont.widthOfTextAtSize(line, FONT_SIZES.body));
      }, 0);
      const bubbleWidth = Math.min(
        transcriptWidth * 0.74,
        Math.max(minBubbleWidth, longestLineWidth + paddingX * 2),
      );
      const bubbleHeight = paddingY * 2 + chunkLines.length * lineHeight;
      const bubbleX = isUser
        ? transcriptX + transcriptWidth - bubbleWidth
        : transcriptX;

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
        x: bubbleX + paddingX,
        y: cursorY - paddingY - FONT_SIZES.body,
        width: bubbleWidth - paddingX * 2,
        lineHeight,
      });

      cursorY -= bubbleHeight + 12;
      lineIndex += chunkLines.length;

      if (lineIndex < allLines.length) {
        addPage();
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
  const apiKey = process.env.RESEND_API_KEY ?? "";
  const from = process.env.RESEND_FROM ?? "";

  if (!apiKey) {
    return {
      sent: false,
      error: "Email sending is not configured yet. Set RESEND_API_KEY on the server.",
    };
  }

  if (!from) {
    return {
      sent: false,
      error: "Email sending is not configured yet. Set RESEND_FROM to a verified Resend sender.",
    };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [email],
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
            content: pdfBytes.toString("base64"),
          },
        ],
      }),
    });

    if (!response.ok) {
      let message = "Email delivery failed.";

      try {
        const data = (await response.json()) as {
          message?: string;
          error?: string;
          name?: string;
        };
        message = data.message ?? data.error ?? data.name ?? message;
      } catch {
        const text = await response.text();
        if (text) {
          message = text;
        }
      }

      return {
        sent: false,
        error: message,
      };
    }
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
