import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Slides each step in from the side it comes from: forward from the right, back from the left.
 * A new `stepKey` remounts the content, which replays the animation.
 */
export function StepTransition({
  stepKey,
  direction,
  className,
  children,
}: {
  stepKey: string;
  direction: "forward" | "back";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      key={stepKey}
      className={cn(
        "min-h-0 flex-1 animate-in fade-in [scrollbar-gutter:stable] duration-300 ease-out motion-reduce:animate-none",
        direction === "forward" ? "slide-in-from-right-12" : "slide-in-from-left-12",
        className,
      )}
    >
      {children}
    </div>
  );
}
