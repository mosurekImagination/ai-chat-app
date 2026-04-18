import { cn } from "@/lib/utils";
import type { Presence } from "@/lib/types";

interface PresenceDotProps {
  status: Presence;
  className?: string;
}

export function PresenceDot({ status, className }: PresenceDotProps) {
  const base = "inline-block w-2.5 h-2.5 rounded-full shrink-0";
  if (status === "ONLINE") {
    return <span className={cn(base, "bg-online", className)} aria-label="Online" />;
  }
  if (status === "AFK") {
    return <span className={cn(base, "bg-afk", className)} aria-label="Away" />;
  }
  return (
    <span
      className={cn(base, "border-2 border-offline bg-transparent", className)}
      aria-label="Offline"
    />
  );
}
