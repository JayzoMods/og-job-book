const TONES: Record<string, "navy" | "copper" | "ok" | "warn" | "muted"> = {
  paid: "ok",
  accepted: "ok",
  invoiced: "navy",
  sent: "navy",
  quoted: "copper",
  draft: "copper",
  enquiry: "navy",
  cancelled: "muted",
  void: "muted",
  declined: "muted",
  superseded: "muted",
  overdue: "warn",
};

export function statusTone(status: string) {
  const key = status.split(/[\s·/,]/)[0]?.toLowerCase() ?? "";
  return TONES[key] ?? "navy";
}

export function StatusPill({ status }: { status: string }) {
  return <span className={`pill pill-${statusTone(status)}`}>{status}</span>;
}

export function jobAccent(status: string) {
  switch (statusTone(status)) {
    case "ok":
      return "var(--ok)";
    case "navy":
      return "var(--navy)";
    case "warn":
      return "var(--warn)";
    case "muted":
      return "var(--muted)";
    default:
      return "var(--copper)";
  }
}
