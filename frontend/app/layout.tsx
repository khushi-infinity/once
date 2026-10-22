import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Geist_Mono, Nunito } from "next/font/google";

import { AppHeader, AppNav } from "@/components/app-nav";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ONCE: Teach once. Let it teach anyone, forever.",
  description:
    "A multimodal personal skill-memory app: teach by voice, text or photo, then recall what you need and guide someone else.",
};

export const viewport: Viewport = {
  themeColor: "#f8f2e8",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${nunito.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col pb-[84px] md:pb-0">
        <Suspense fallback={<div className="h-[68px]" />}>
          <AppHeader />
        </Suspense>
        <main className="flex-1">{children}</main>
        <footer className="mx-auto hidden w-full max-w-5xl px-6 pb-8 pt-6 text-center text-xs font-semibold text-muted md:block">
          ONCE: personal skill memory. Built for the Amazon Developer Hackathon 2026.
          <span className="mt-1 block text-[10px] font-bold text-muted/80">
            A hackathon demo. Family names are examples, not real accounts. Sharing rules are
            checked by the service, and cloud keys never reach your browser.
          </span>
        </footer>
        <Suspense fallback={null}>
          <AppNav />
        </Suspense>
      </body>
    </html>
  );
}
