export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line print:hidden">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          Built by{" "}
          <a className="text-navy underline-offset-2 hover:underline" href="https://ogdigitaldesigns.com.au">
            OG Digital Designs
          </a>
          . Public hire repo — not a field-service platform.
        </p>
        <p>
          Live ABR lookup of the organisation ABN only when ABR_GUID is set. This is not tax
          advice and does not lodge a BAS.
        </p>
      </div>
    </footer>
  );
}
