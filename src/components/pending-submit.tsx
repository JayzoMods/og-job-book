"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

export function PendingSubmit({
  idle,
  busy,
  className,
  name,
  value,
  awaitNavigation = false,
}: {
  idle: string;
  busy: string;
  className?: string;
  name?: string;
  value?: string;
  /** Native GET/POST string actions do not flip useFormStatus — keep busy until leave. */
  awaitNavigation?: boolean;
}) {
  const { pending, data } = useFormStatus();
  const [navPending, setNavPending] = useState(false);

  const actionBusy =
    pending &&
    (name == null ||
      value == null ||
      data == null ||
      String(data.get(name)) === value);

  const showBusy = actionBusy || navPending;

  return (
    <button
      type="submit"
      className={className}
      disabled={showBusy}
      name={name}
      value={value}
      aria-busy={showBusy}
      onClick={() => {
        if (awaitNavigation) {
          setNavPending(true);
        }
      }}
    >
      {showBusy ? busy : idle}
    </button>
  );
}
