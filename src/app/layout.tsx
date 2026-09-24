import type { Metadata, Viewport } from "next";
import { DM_Sans, Poppins } from "next/font/google";

import { AnimatedToaster } from "@/components/motion/animated-toast";
import { ServiceWorkerRegistration } from "@/components/shared/pwa";

import "./globals.css";

const body = DM_Sans({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const heading = Poppins({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-heading", display: "swap" });

export const metadata: Metadata = {
  title: { default: "NéoScol", template: "%s · NéoScol" },
  description: "Plus qu'un logiciel, une vision pour l'éducation. Gestion scolaire et de formation.",
  applicationName: "NéoScol",
  appleWebApp: { capable: true, title: "NéoScol", statusBarStyle: "black-translucent" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f7fc" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1020" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className={`${body.variable} ${heading.variable}`}>
      <body className="min-h-dvh">
        {children}
        <AnimatedToaster />
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
