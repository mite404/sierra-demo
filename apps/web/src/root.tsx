import { trackInputModality } from "@yaklabs/catalog/inputModality";
import { Toaster } from "@yaklabs/ui/components/sonner";
import { TooltipProvider } from "@yaklabs/ui/components/tooltip";
import { useEffect, type ReactNode } from "react";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import "./index.css";
import type { Route } from "./+types/root";
import { CHROME_BOOT } from "./chrome";
import { Providers } from "./providers";
import { THEME_BOOT, useTheme, type ThemeChoice } from "./theme";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* Both looks, so the browser's own surfaces (scrollbars, form fields) follow the
            theme the root names (ADR-162). */}
        <meta name="color-scheme" content="light dark" />
        <Meta />
        <Links />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        <script dangerouslySetInnerHTML={{ __html: CHROME_BOOT }} />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  const theme = useTheme();
  useEffect(() => trackInputModality(), []);
  return (
    <Providers>
      <TooltipProvider>
        <Outlet context={theme satisfies ThemeChoice} />
      </TooltipProvider>
      <Toaster richColors theme={theme.preference} />
    </Providers>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  // React Router's own overlay carries the stack in development; the page stays plain.
  const missing = isRouteErrorResponse(error) && error.status === 404;
  return (
    <main className="container mx-auto p-4 pt-16">
      <h1>{missing ? "Page not found" : "Something went wrong"}</h1>
      <p>{missing ? "There is nothing at this address." : "Reload the page to try again."}</p>
    </main>
  );
}
