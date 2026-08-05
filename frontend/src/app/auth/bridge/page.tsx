"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";

import { ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { getSupabaseBrowserClient } from "@/lib/supabase";

function readOAuthNext(): string {
  try {
    const stored = sessionStorage.getItem("sbs_oauth_next");
    if (stored) {
      sessionStorage.removeItem("sbs_oauth_next");
      if (stored.startsWith("/")) return stored;
    }
  } catch {
    /* ignore */
  }
  return "/catalog";
}

async function waitForAccessToken(timeoutMs = 8000): Promise<string> {
  const supabase = getSupabaseBrowserClient();

  const existing = await supabase.auth.getSession();
  if (existing.data.session?.access_token) {
    return existing.data.session.access_token;
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      void subscription.then((sub) => sub.data.subscription.unsubscribe());
      reject(
        new Error(
          "Google sign-in session missing. Try signing in again.",
        ),
      );
    }, timeoutMs);

    const subscription = supabase.auth.onAuthStateChange((_event, session) => {
      if (settled) return;
      if (session?.access_token) {
        settled = true;
        window.clearTimeout(timer);
        void subscription.then((sub) => sub.data.subscription.unsubscribe());
        resolve(session.access_token);
      }
    });

    // One more poll in case the cookie landed after first getSession.
    void supabase.auth.getSession().then(({ data }) => {
      if (settled) return;
      if (data.session?.access_token) {
        settled = true;
        window.clearTimeout(timer);
        void subscription.then((sub) => sub.data.subscription.unsubscribe());
        resolve(data.session.access_token);
      }
    });
  });
}

function AuthBridgeInner() {
  const { loginWithGoogleAccessToken, ready } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;

    let cancelled = false;

    async function finish() {
      const next = readOAuthNext();
      try {
        const accessToken = await waitForAccessToken();
        await loginWithGoogleAccessToken(accessToken);
        // Drop Supabase session — app auth is Flask JWT from here.
        try {
          const supabase = getSupabaseBrowserClient();
          await supabase.auth.signOut({ scope: "local" });
        } catch {
          /* ignore */
        }
        if (!cancelled) {
          // Hard navigation so the header remounts with the saved session.
          window.location.replace(next);
        }
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Google sign-in failed";
        // CORS / blocked API usually surfaces as a network TypeError.
        if (
          err instanceof TypeError ||
          /failed to fetch|networkerror|cors/i.test(message)
        ) {
          setError(
            "Could not reach the store API to finish Google sign-in (often a CORS / API URL issue). Ask the site owner to allow this domain on the API, then try again.",
          );
        } else {
          setError(message);
        }
      }
    }

    void finish();
    return () => {
      cancelled = true;
    };
  }, [ready, loginWithGoogleAccessToken]);

  if (error) {
    return (
      <section className="auth-panel">
        <h1>Google sign-in</h1>
        <p className="msg error">{error}</p>
        <Link href="/login" className="back-link">
          ← Back to sign in
        </Link>
      </section>
    );
  }

  return (
    <section className="auth-panel">
      <h1>Signing you in…</h1>
      <p className="auth-lead">Finishing Google sign-in. One moment.</p>
    </section>
  );
}

export default function AuthBridgePage() {
  return (
    <Suspense fallback={<p className="catalog-status">Loading…</p>}>
      <AuthBridgeInner />
    </Suspense>
  );
}
