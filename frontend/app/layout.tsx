import type { Metadata } from "next";
import Link from "next/link";
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
  title: "ONCE",
  description: "Teach once. Let it teach anyone, forever.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="w-full">
          <nav
            aria-label="Main"
            className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5"
          >
            <Link href="/" className="text-lg font-semibold tracking-tight">
              once.
            </Link>
            <ul className="flex items-center gap-6 text-sm text-muted">
              <li className="font-medium text-foreground">Teach</li>
              <li>
                <Link href="/ask" className="hover:text-foreground">
                  Ask
                </Link>
              </li>
              <li>
                <Link href="/skills" className="hover:text-foreground">
                  My Skills
                </Link>
              </li>
            </ul>
          </nav>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="mx-auto w-full max-w-3xl px-6 pb-8 pt-4 text-xs text-muted">
          ONCE — personal skill memory. Built for the Amazon Developer Hackathon 2026.
        </footer>
      </body>
    </html>
  );
}
