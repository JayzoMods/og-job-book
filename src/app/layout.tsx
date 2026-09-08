import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Source_Serif_4 } from "next/font/google";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const display = Source_Serif_4({
  variable: "--font-source",
  subsets: ["latin"],
});

const sans = IBM_Plex_Sans({
  variable: "--font-ibm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-ibm-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: {
    default: "AU Job Book",
    template: "%s | AU Job Book",
  },
  description:
    "Australian job → quote → invoice ledger with ABN checksum and GST totals. Not ServiceM8. Not tax advice.",
  robots: { index: true, follow: true },
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en-AU"
      data-scroll-behavior="smooth"
      className={`${display.variable} ${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-paper font-sans text-ink">
        <a className="skip-link print:hidden" href="#main">
          Skip to jobs
        </a>
        <SiteHeader />
        <main id="main" className="flex flex-1 flex-col">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
