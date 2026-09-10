"use client";

import { useFormStatus } from "react-dom";

export function PendingSubmit({
  idle,
  busy,
  className,
}: {
  idle: string;
  busy: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? busy : idle}
    </button>
  );
}
