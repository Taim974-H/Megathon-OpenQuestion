import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HorseGPT / UnicornGPT",
  description: "A GPT wrapper that responds in a horse persona with server-side guardrails.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
