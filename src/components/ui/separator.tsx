import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils.js";

export function Separator({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn("h-px w-full bg-slate-200 dark:bg-white/10", className)}
      {...props}
    />
  );
}
