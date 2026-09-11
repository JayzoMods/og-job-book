"use client";

import { Suspense, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  adjacentTourStep,
  detectTourCatalog,
  isTourStepId,
  pushTourUrl,
  replaceTourUrl,
  TOUR_PARAM,
  TOUR_SYNC_EVENT,
  tourCatalogSteps,
  tourHref,
  tourStepNumber,
  type TourCatalog,
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

function readTourId(): string | null {
  return new URLSearchParams(window.location.search).get(TOUR_PARAM);
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

function shouldScrollToTarget(step: TourStep, el: Element): boolean {
  if (step.id === "welcome" || step.id === "wrap") {
    return false;
  }
  const box = el.getBoundingClientRect();
  const header = 88;
  return box.top < header || box.bottom > window.innerHeight - 24;
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
  const urlStepId = searchParams.get(TOUR_PARAM);
  const [stepId, setStepId] = useState<string | null>(() => urlStepId);
  const [seenUrlStepId, setSeenUrlStepId] = useState(urlStepId);
  if (urlStepId !== seenUrlStepId) {
    setSeenUrlStepId(urlStepId);
    setStepId(urlStepId);
  }
  const [catalog, setCatalog] = useState<TourCatalog>("demo");
  const [ready, setReady] = useState(false);

  // Catalog reads the live DOM (demo form vs account glance). Schedule after layout
  // so setState is not synchronous inside the effect body (react-hooks/set-state-in-effect).
  useLayoutEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) {
        return;
      }
      setCatalog(detectTourCatalog());
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [pathname, stepId]);

  const catalogSteps = tourCatalogSteps(catalog);
  const matched = catalogSteps.find((item) => item.id === stepId);
  const step = matched ?? (stepId && isTourStepId(stepId) ? catalogSteps[0] ?? null : null);
  const printRoute = pathname.includes("/print");
  const active = ready && Boolean(step) && !printRoute;

  const go = useCallback(
    (next: TourStep | null) => {
      if (!next) {
        const params = new URLSearchParams(window.location.search);
        params.delete(TOUR_PARAM);
        const query = params.toString();
        replaceTourUrl(query ? `${pathname}?${query}` : pathname);
        setStepId(null);
        setRect(null);
        return;
      }
      if (next.path === pathname) {
        pushTourUrl(tourHref(next));
        setStepId(next.id);
        return;
      }
      router.push(tourHref(next));
    },
    [pathname, router],
  );

  useEffect(() => {
    const sync = () => setStepId(readTourId());
    window.addEventListener(TOUR_SYNC_EVENT, sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener(TOUR_SYNC_EVENT, sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);

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
      if (shouldScrollToTarget(step, el)) {
        el.scrollIntoView({
          block: "center",
          inline: "nearest",
          behavior: reducedMotion() ? "auto" : "smooth",
        });
      }
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(
        () => {
          if (!cancelled) {
            apply(measureTarget(el));
            setMissing(false);
          }
        },
        reducedMotion() || !shouldScrollToTarget(step, el) ? 40 : 320,
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
        go(adjacentTourStep(step.id, 1, catalogSteps));
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        go(adjacentTourStep(step.id, -1, catalogSteps));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, catalogSteps, go, step]);

  useEffect(() => {
    if (!active) {
      return;
    }
    cardRef.current?.focus();
  }, [active, step?.id]);

  if (!active || !step) {
    return null;
  }

  const index = tourStepNumber(step.id, catalogSteps);
  const total = catalogSteps.length;
  const prev = adjacentTourStep(step.id, -1, catalogSteps);
  const next = adjacentTourStep(step.id, 1, catalogSteps);

  return (
    <div
      className={`tour-root print:hidden${rect ? "" : " is-missing"}`}
      role="presentation"
    >
      {rect ? (
        <>
          <div className="tour-dim" style={{ top: 0, left: 0, right: 0, height: rect.top }} />
          <div
            className="tour-dim"
            style={{ top: rect.top, left: 0, width: rect.left, height: rect.height }}
          />
          <div
            className="tour-dim"
            style={{
              top: rect.top,
              left: rect.left + rect.width,
              right: 0,
              height: rect.height,
            }}
          />
          <div
            className="tour-dim"
            style={{ top: rect.top + rect.height, left: 0, right: 0, bottom: 0 }}
          />
          <div
            className="tour-spot"
            style={{
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
            }}
          />
        </>
      ) : (
        <div className="tour-catch" aria-hidden="true" />
      )}
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
          {catalogSteps.map((item, i) => (
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
