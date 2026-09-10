import type { Metadata } from "next";
import { Figtree, Fraunces, IBM_Plex_Mono } from "next/font/google";
import { AppBackdrop } from "@/components/app-backdrop";
import { ProductTourHost } from "@/components/product-tour";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { clerkAuthConfigured } from "@/lib/ledger/auth";
import "./globals.css";

const display = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

const sans = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-ibm-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: {
    default: "OG Job Book",
    template: "%s | OG Job Book",
  },
  description:
    "Australian job → quote → invoice ledger with ABN checksum and GST totals. Not ServiceM8. Not tax advice.",
  robots: { index: true, follow: true },
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const body = clerkAuthConfigured()
    ? await clerkBody(children)
    : openBody(children);

  return (
    <html
      lang="en-AU"
      data-scroll-behavior="smooth"
      className={`${display.variable} ${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="relative flex min-h-full flex-col bg-paper font-sans text-ink">
        {body}
      </body>
    </html>
  );
}

function openBody(children: React.ReactNode) {
  return (
    <>
      <AppBackdrop />
      <a className="skip-link print:hidden" href="#main">
        Skip to jobs
      </a>
      <SiteHeader />
      <ProductTourHost />
      <main id="main" className="flex flex-1 flex-col">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}

async function clerkBody(children: React.ReactNode) {
  const { ClerkAppShell } = await import("@/components/clerk-app-shell");
  return <ClerkAppShell>{children}</ClerkAppShell>;
}
