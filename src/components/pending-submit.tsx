"use client";

import { useFormStatus } from "react-dom";

export function PendingSubmit({
  idle,
  busy,
  className,
  name,
  value,
}: {
  idle: string;
  busy: string;
  className?: string;
  name?: string;
  value?: string;
}) {
  const { pending, data } = useFormStatus();
  const showBusy =
    pending &&
    (name == null ||
      value == null ||
      data == null ||
      String(data.get(name)) === value);

  return (
    <button
      type="submit"
      className={className}
      disabled={showBusy}
      name={name}
      value={value}
      aria-busy={showBusy}
    >
      {showBusy ? busy : idle}
    </button>
  );
}
