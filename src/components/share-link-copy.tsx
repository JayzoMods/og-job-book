"use client";

import { useId, useState } from "react";

export function ShareLinkCopy({ path }: { path: string }) {
  const inputId = useId();
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex min-w-[12rem] flex-1 flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={inputId}>
        Share link
      </label>
      <input
        id={inputId}
        className="field min-w-[12rem] flex-1 font-mono text-sm"
        readOnly
        value={path}
      />
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => {
          const url = `${window.location.origin}${path}`;
          void navigator.clipboard.writeText(url).then(
            () => setCopied(true),
            () => setCopied(false),
          );
        }}
      >
        {copied ? "Copied" : "Copy share link"}
      </button>
    </div>
  );
}
