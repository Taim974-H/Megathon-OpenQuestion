import type { Metadata } from "next";
import Script from "next/script";

import { MODE_STORAGE_KEY } from "@/lib/chat-config";
import "./globals.css";

export const metadata: Metadata = {
  title: "HorseGPT / UnicornGPT",
  description: "A GPT wrapper that responds in a horse persona with server-side guardrails.",
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon.png', type: 'image/png' },
    ],
    apple: '/apple-icon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initModeScript = `
    try {
      var mode = window.localStorage.getItem(${JSON.stringify(MODE_STORAGE_KEY)});
      document.documentElement.dataset.mode = mode === "unicorn" ? "unicorn" : "horse";
    } catch {}
  `;

  return (
    <html
      lang="en"
      className="h-full"
      data-mode="horse"
      suppressHydrationWarning
    >
      <head>
        <Script id="init-mode" strategy="beforeInteractive">
          {initModeScript}
        </Script>
      </head>
      <body className="min-h-full flex flex-col">
        {children}
      </body>
    </html>
  );
}
