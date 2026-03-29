import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: process.env.VERCEL_URL
    ? new URL(`https://${process.env.VERCEL_URL}`)
    : new URL("http://localhost:3000"),
  title: "AgentOS — Canva for AI Agents",
  description:
    "Describe what you want in plain English. Your AI agent team is built. No code, no configuration — just describe your workflow and watch it run.",
  keywords: [
    "AI agents",
    "multi-agent AI",
    "workflow automation",
    "no-code AI",
    "agent orchestration",
  ],
  authors: [{ name: "AgentOS" }],
  openGraph: {
    title: "AgentOS — Canva for AI Agents",
    description:
      "Describe what you want in plain English. Your AI agent team is built. No code, no configuration.",
    type: "website",
    locale: "en_US",
    siteName: "AgentOS",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "AgentOS — Visual AI Agent Builder",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AgentOS — Canva for AI Agents",
    description:
      "Describe what you want in plain English. Your AI agent team is built.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
