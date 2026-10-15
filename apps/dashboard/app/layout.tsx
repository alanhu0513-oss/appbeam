import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Appbeam — binary in, live app out",
  description:
    "Reverse-engineer a binary with REA, reimagine it as Expo components with Gemini, and watch it deploy to Vercel inside a phone frame.",
};

export const viewport: Viewport = {
  themeColor: "#07080c",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
