import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils.js";

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-xl bg-slate-200 dark:bg-white/[0.08]", className)}
      {...props}
    />
  );
}
