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

export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light" />
        <Meta />
        <Links />
        <script dangerouslySetInnerHTML={{ __html: CHROME_BOOT }} />
        <script src="https://ampcode.com/w/client_01M6S1DKD5DC3TCVZKCAKZSC0D.js" async></script>
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
  useEffect(() => trackInputModality(), []);
  return (
    <Providers>
      <TooltipProvider>
        <Outlet />
      </TooltipProvider>
      <Toaster richColors theme="light" />
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
