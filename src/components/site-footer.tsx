import { AGENCY_NAME, AGENCY_SITE, CONTACT_EMAIL, HOW_TO_USE_PATH } from "@/lib/agency";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line/80 print:hidden">
      <div className="page-gutter flex flex-col gap-2 py-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>
          Built by{" "}
          <a className="text-navy underline-offset-2 hover:underline" href={AGENCY_SITE}>
            {AGENCY_NAME}
          </a>
          .{" "}
          <a className="text-navy underline-offset-2 hover:underline" href={HOW_TO_USE_PATH}>
            How to use
          </a>
          . Contact{" "}
          <a className="text-navy underline-offset-2 hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          . Public hire repo — not a field-service platform.
        </p>
        <p>This is not tax advice and does not lodge a BAS.</p>
      </div>
    </footer>
  );
}
