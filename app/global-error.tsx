"use client";

import { useEffect } from "react";

// Last-resort boundary: catches errors thrown by a root layout itself, where
// the (app)/error.tsx segment boundary cannot help. Next.js renders this in
// place of the whole document, so it must provide its own <html>/<body> and
// cannot use next-intl (the provider lives inside the layout that just
// failed). The hardcoded copy is the one deliberate exception to the i18n
// rule, forced by that constraint; it stays minimal and is rarely reached.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error.digest ?? "", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: 0,
          padding: "1.5rem",
          fontFamily: "system-ui, -apple-system, sans-serif",
          background: "#faf9f7",
          color: "#1a1a1a",
        }}
      >
        <div style={{ maxWidth: "28rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0 }}>The app hit a problem</h1>
          <p style={{ marginTop: "0.5rem", fontSize: "0.875rem", color: "#666" }}>
            Reload the page to keep going. If it keeps happening, tell us.
          </p>
          <div style={{ marginTop: "1.25rem", display: "flex", gap: "0.5rem", justifyContent: "center" }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                minHeight: "2.75rem",
                padding: "0 1rem",
                borderRadius: "0.5rem",
                border: "none",
                background: "#1a1a1a",
                color: "#fff",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                minHeight: "2.75rem",
                padding: "0 1rem",
                borderRadius: "0.5rem",
                border: "1px solid #d4d0c8",
                background: "transparent",
                color: "#1a1a1a",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Reload the page
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
