"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";

function PendingLinkLabel({ idle, busy }: { idle: string; busy: string }) {
  const { pending } = useLinkStatus();
  return (
    <span aria-busy={pending} className={pending ? "opacity-70" : undefined}>
      {pending ? busy : idle}
    </span>
  );
}

/** Next.js Link with busy label while the destination route loads. */
export function PendingLink({
  href,
  idle,
  busy,
  className,
}: {
  href: string;
  idle: string;
  busy: string;
  className?: string;
}) {
  return (
    <Link href={href} prefetch={false} className={className}>
      <PendingLinkLabel idle={idle} busy={busy} />
    </Link>
  );
}
