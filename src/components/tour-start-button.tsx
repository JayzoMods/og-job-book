"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  detectTourCatalog,
  pushTourUrl,
  tourCatalogSteps,
  tourHref,
} from "@/lib/tour/steps";

export function TourStartButton({
  label = "Walkthrough",
  className = "btn btn-ghost",
}: {
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        const first = tourCatalogSteps(detectTourCatalog())[0];
        if (!first) {
          return;
        }
        if (pathname === first.path) {
          pushTourUrl(tourHref(first));
          return;
        }
        router.push(tourHref(first));
      }}
    >
      {label}
    </button>
  );
}
