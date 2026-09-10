"use client";

import { Suspense, useCallback, useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  adjacentTourStep,
  isTourStepId,
  TOUR_PARAM,
  TOUR_STEPS,
  tourHref,
  tourStepById,
  tourStepNumber,
  type TourStep,
} from "@/lib/tour/steps";

type SpotlightRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

const PAD = 10;
const WAIT_MS = 2800;

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function measureTarget(el: Element): SpotlightRect {
  const box = el.getBoundingClientRect();
  const top = Math.max(8, box.top - PAD);
  const left = Math.max(8, box.left - PAD);
  const right = Math.min(window.innerWidth - 8, box.right + PAD);
  const bottom = Math.min(window.innerHeight - 8, box.bottom + PAD);
  return {
    top,
    left,
    width: Math.max(48, right - left),
    height: Math.max(48, bottom - top),
  };
}

function computeCardStyle(rect: SpotlightRect | null, cardHeight: number): CSSProperties {
  const width = Math.min(416, window.innerWidth - 24);
  if (!rect || window.innerWidth < 720) {
    return {};
  }
  const height = cardHeight || 280;
  const below = rect.top + rect.height + 16;
  const fitsBelow = below + height < window.innerHeight - 16;
  const top = fitsBelow ? below : Math.max(16, rect.top - height - 16);
  const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);
  return { width, top, left, bottom: "auto", transform: "none" };
}

export function ProductTour() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const titleId = useId();
  const bodyId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<SpotlightRect | null>(null);
  const [missing, setMissing] = useState(false);
  const [cardStyle, setCardStyle] = useState<CSSProperties>({});

  const stepId = searchParams.get(TOUR_PARAM);
  const step = isTourStepId(stepId) ? tourStepById(stepId) : null;
  const printRoute = pathname.includes("/print");
  const active = Boolean(step) && !printRoute;

  const go = useCallback(
    (next: TourStep | null) => {
      if (!next) {
        const params = new URLSearchParams(searchParams.toString());
        params.delete(TOUR_PARAM);
        const query = params.toString();
        router.replace(query ? `${pathname}?${query}` : pathname);
        return;
      }
      router.push(tourHref(next));
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    if (!active || !step || pathname !== step.path) {
      return;
    }

    let cancelled = false;
    let observer: MutationObserver | null = null;
    let waitTimer = 0;
    let scrollTimer = 0;

    const apply = (nextRect: SpotlightRect | null) => {
      setRect(nextRect);
      setCardStyle(computeCardStyle(nextRect, cardRef.current?.offsetHeight ?? 280));
    };

    const place = (el: Element) => {
      if (cancelled) {
        return;
      }
      el.scrollIntoView({
        block: "center",
        inline: "nearest",
        behavior: reducedMotion() ? "auto" : "smooth",
      });
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(
        () => {
          if (!cancelled) {
            apply(measureTarget(el));
            setMissing(false);
          }
        },
        reducedMotion() ? 40 : 320,
      );
    };

    const find = () => {
      const el = document.querySelector(step.target);
      if (el) {
        place(el);
        return true;
      }
      return false;
    };

    if (!find()) {
      observer = new MutationObserver(() => {
        if (find() && observer) {
          observer.disconnect();
          observer = null;
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      waitTimer = window.setTimeout(() => {
        if (!cancelled && !document.querySelector(step.target)) {
          apply(null);
          setMissing(true);
        }
      }, WAIT_MS);
    }

    const onShift = () => {
      const el = document.querySelector(step.target);
      if (el) {
        apply(measureTarget(el));
      }
    };

    window.addEventListener("resize", onShift);
    window.addEventListener("scroll", onShift, true);

    return () => {
      cancelled = true;
      observer?.disconnect();
      window.clearTimeout(waitTimer);
      window.clearTimeout(scrollTimer);
      window.removeEventListener("resize", onShift);
      window.removeEventListener("scroll", onShift, true);
    };
  }, [active, pathname, step]);

  useEffect(() => {
    if (!active || !step || pathname === step.path) {
      return;
    }
    router.replace(tourHref(step));
  }, [active, pathname, router, step]);

  useEffect(() => {
    if (!active || !step) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        go(null);
        return;
      }
      if (event.key === "ArrowRight" || event.key === "Enter") {
        event.preventDefault();
        go(adjacentTourStep(step.id, 1));
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        go(adjacentTourStep(step.id, -1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, go, step]);

  useEffect(() => {
    if (!active) {
      return;
    }
    cardRef.current?.focus();
  }, [active, step?.id]);

  if (!active || !step) {
    return null;
  }

  const index = tourStepNumber(step.id);
  const total = TOUR_STEPS.length;
  const prev = adjacentTourStep(step.id, -1);
  const next = adjacentTourStep(step.id, 1);

  return (
    <div
      className={`tour-root print:hidden${rect ? "" : " is-missing"}`}
      role="presentation"
    >
      <div className="tour-catch" aria-hidden="true" />
      {rect ? (
        <div
          className="tour-spot"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          }}
        />
      ) : null}
      <div
        ref={cardRef}
        className="tour-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        style={cardStyle}
      >
        <p className="kicker">
          Step {index} of {total}
        </p>
        <h2 id={titleId} className="mt-2 font-display text-2xl tracking-tight">
          {step.title}
        </h2>
        <p id={bodyId} className="mt-3 text-sm leading-relaxed text-muted">
          {missing ? step.missing : step.body}
        </p>
        <ol className="tour-dots" aria-label="Walkthrough steps">
          {TOUR_STEPS.map((item, i) => (
            <li key={item.id}>
              <button
                type="button"
                className={item.id === step.id ? "is-current" : undefined}
                aria-current={item.id === step.id ? "step" : undefined}
                aria-label={`${item.title}, step ${i + 1}`}
                onClick={() => go(item)}
              />
            </li>
          ))}
        </ol>
        <div className="tour-actions">
          <button type="button" className="btn btn-ghost" onClick={() => go(null)}>
            Close
          </button>
          <div className="flex flex-wrap gap-2">
            {prev ? (
              <button type="button" className="btn btn-ghost" onClick={() => go(prev)}>
                Back
              </button>
            ) : null}
            <button type="button" className="btn btn-primary" onClick={() => go(next)}>
              {next ? "Next" : "Done"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProductTourHost() {
  return (
    <Suspense fallback={null}>
      <ProductTour />
    </Suspense>
  );
}
