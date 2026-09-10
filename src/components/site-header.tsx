import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { TourStartButton } from "@/components/tour-start-button";

const NAV = [
  { href: "/how-to-use", label: "How to use" },
  { href: "/#jobs", label: "Jobs" },
  { href: "/#customers", label: "Customers" },
  { href: "/#rates", label: "Rate card" },
  { href: "/#gst-quarter", label: "GST" },
  { href: "/#export", label: "Export" },
  { href: "/#organisation", label: "Organisation" },
] as const;

function NavLinks({ className }: { className?: string }) {
  return (
    <div className={className}>
      {NAV.map((item) => (
        <Link key={item.href} href={item.href} className="nav-link">
          {item.label}
        </Link>
      ))}
    </div>
  );
}

export function SiteHeader({ trailing }: { trailing?: React.ReactNode }) {
  return (
    <header className="site-header print:hidden">
      <div className="page-gutter flex min-h-16 items-center justify-between gap-3 py-3">
        <Link href="/" className="brand-lockup">
          <BrandMark />
          <span className="brand-word">OG Job Book</span>
        </Link>
        <div className="flex items-center gap-2">
          <nav className="hidden xl:block" aria-label="Ledger">
            <NavLinks className="site-nav-links" />
          </nav>
          <details className="nav-drawer xl:hidden">
            <summary className="btn btn-ghost">Menu</summary>
            <nav className="nav-drawer-panel" aria-label="Ledger">
              <NavLinks className="grid" />
            </nav>
          </details>
          <TourStartButton />
          {trailing}
        </div>
      </div>
    </header>
  );
}
