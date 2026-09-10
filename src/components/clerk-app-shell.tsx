import { OptionalClerkProvider } from "@/components/optional-clerk-provider";
import { ClerkHeaderControls } from "@/components/clerk-header";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export function ClerkAppShell({ children }: { children: React.ReactNode }) {
  return (
    <OptionalClerkProvider>
      <a className="skip-link print:hidden" href="#main">
        Skip to jobs
      </a>
      <SiteHeader trailing={<ClerkHeaderControls />} />
      <main id="main" className="flex flex-1 flex-col">
        {children}
      </main>
      <SiteFooter />
    </OptionalClerkProvider>
  );
}
