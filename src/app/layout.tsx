import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OpenSkies — Kampf-Flug-Sandbox",
  description: "Data-driven 3D-Kampf-Flug-Sandbox als Lernprojekt: Flugphysik, Dogfights gegen KI, Schiffe, Panzer und drei wechselbare Welten. Next.js + Three.js.",
  keywords: ["Flugphysik", "Dogfight", "Three.js", "Next.js", "Lernprojekt", "Spieleentwicklung"],
  authors: [{ name: "OpenSkies Lernprojekt" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "OpenSkies — Kampf-Flug-Sandbox",
    description: "Flugphysik, Dogfights, Schiffe, Panzer & drei Welten — ein Lernprojekt",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
