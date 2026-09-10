"use client";

import { useRouter } from "next/navigation";
import { TOUR_STEPS, tourHref } from "@/lib/tour/steps";

export function TourStartButton({
  label = "Walkthrough",
  className = "btn btn-ghost",
  tourId,
}: {
  label?: string;
  className?: string;
  tourId?: string;
}) {
  const router = useRouter();
  const first = TOUR_STEPS[0];

  return (
    <button
      type="button"
      className={className}
      {...(tourId ? { "data-tour": tourId } : {})}
      onClick={() => {
        router.push(tourHref(first));
      }}
    >
      {label}
    </button>
  );
}
