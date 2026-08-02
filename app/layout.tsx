import type { Metadata } from "next";

import "./globals.css";
import { WavyBackground } from "@/components/ui/wavy-background";
import { ServiceWorkerRegister } from "@/components/pwa/sw-register";

export const metadata: Metadata = {
  title: { default: "Zoosh | Group expenses, thoughtfully settled", template: "%s | Zoosh" },
  description: "A clear, human-approved way to track and settle group expenses.",
  manifest: "/manifest.webmanifest",
};

export const viewport = {
  themeColor: "#0a0a0d",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="relative isolate font-[family-name:var(--font-sans)] antialiased">
        <WavyBackground />
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
