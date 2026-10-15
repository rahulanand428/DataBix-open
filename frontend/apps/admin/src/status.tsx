import { Badge } from "@databix/ui";
import { CheckCircle2, Clock, XCircle } from "lucide-react";

/** Status colours carry meaning only with an icon and a label. */
export function RunStatus({ status }: { status: string }) {
  if (status === "succeeded") return <Badge tone="good" icon={CheckCircle2}>Succeeded</Badge>;
  if (status === "failed") return <Badge tone="critical" icon={XCircle}>Failed</Badge>;
  return <Badge tone="warning" icon={Clock}>Running</Badge>;
}

export function HealthBadge({ status }: { status: string }) {
  return status === "ok" ? (
    <Badge tone="good" icon={CheckCircle2}>Healthy</Badge>
  ) : (
    <Badge tone="critical" icon={XCircle}>Unavailable</Badge>
  );
}
