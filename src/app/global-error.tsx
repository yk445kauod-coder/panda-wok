"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { en } from "@/lib/i18n/dictionaries/en";
import { ar } from "@/lib/i18n/dictionaries/ar";

/**
 * Last-resort boundary, used when the root layout itself could not render — most
 * often because a JS chunk failed to arrive (a flaky network, or a deployment
 * that replaced the chunk hashes under an open tab). Next's own fallback for
 * that is the bare "This page couldn't load. Reload to try again." screen with
 * no branding and no way to recover.
 *
 * This boundary cannot use the i18n provider or the design-system Button: it
 * renders outside the root layout, so those providers are gone. It reads the
 * locale cookie directly and hard-reloads, which re-fetches the chunk list
 * rather than re-rendering against the stale one.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const arabic =
    typeof document !== "undefined" && document.documentElement.lang === "ar";
  const t = arabic ? ar.errors : en.errors;
  const offline = typeof navigator !== "undefined" && !navigator.onLine;

  useEffect(() => {
    console.error("Panda Wok fatal error", error.digest ?? error.message);
  }, [error]);

  // A chunk-load failure is not recoverable by re-rendering the same tree; the
  // browser still holds the old asset manifest. A full reload re-fetches it.
  const recover = () => {
    if (typeof window !== "undefined") window.location.reload();
    else reset();
  };

  return (
    <html lang={arabic ? "ar" : "en"} dir={arabic ? "rtl" : "ltr"}>
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f7f3e8",
          color: "#17130f",
          fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
          padding: "1.5rem",
        }}
      >
        <main style={{ maxWidth: "28rem", textAlign: "center" }}>
          <AlertTriangle
            aria-hidden="true"
            style={{ width: 40, height: 40, color: "#9d6620", margin: "0 auto" }}
          />
          <h1 style={{ marginTop: "1rem", fontSize: "1.25rem", fontWeight: 600 }}>
            {offline ? t.offlineTitle : t.serverTitle}
          </h1>
          <p style={{ marginTop: "0.5rem", fontSize: "0.875rem", lineHeight: 1.6 }}>
            {offline ? t.offlineBody : t.serverBody}
          </p>
          <button
            type="button"
            onClick={recover}
            style={{
              marginTop: "1.5rem",
              height: "2.75rem",
              padding: "0 1.25rem",
              border: 0,
              borderRadius: "0.75rem",
              background: "#274559",
              color: "#fdfbf5",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {en.common.tryAgain}
          </button>
          {error.digest ? (
            <p style={{ marginTop: "1rem", fontSize: "0.6875rem", opacity: 0.55 }}>
              {t.reference.replace("{digest}", error.digest)}
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
