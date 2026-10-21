"use client";

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * shadcn's toaster on Kay's tokens, shaped as a menu is: its 8px corners and its shadow
 * (globals.css), since both float over the page. The app passes the theme it applied to the root.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={{
        ["--normal-bg" as string]: "var(--popover)",
        ["--normal-text" as string]: "var(--popover-foreground)",
        ["--normal-border" as string]: "var(--border)",
        ["--border-radius" as string]: "var(--radius-xl)",
      }}
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
