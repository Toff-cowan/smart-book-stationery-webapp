"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import {
  getSupabaseBrowserClient,
  isSupabaseAuthConfigured,
} from "@/lib/supabase";

function LoginForm() {
  const { login, register } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/catalog";
  const googleEnabled = isSupabaseAuthConfigured();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "register") {
        await register(name, email, password);
      } else {
        await login(email, password);
      }
      router.push(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function onGoogleSignIn() {
    setGoogleBusy(true);
    setError(null);
    try {
      const supabase = getSupabaseBrowserClient();
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (oauthError) {
        setError(oauthError.message);
        setGoogleBusy(false);
      }
      // On success the browser redirects away to Google.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed");
      setGoogleBusy(false);
    }
  }

  return (
    <section className="auth-panel">
      <h1>{mode === "login" ? "Sign in" : "Create account"}</h1>
      <p className="auth-lead">
        Sign in to add titles to your cart and place a bookstore order.
      </p>

      {googleEnabled ? (
        <>
          <button
            type="button"
            className="btn-google"
            disabled={busy || googleBusy}
            onClick={() => void onGoogleSignIn()}
          >
            {googleBusy ? "Redirecting…" : "Sign in with Google"}
          </button>
          <p className="auth-divider">
            <span>or</span>
          </p>
        </>
      ) : null}

      <form onSubmit={onSubmit} className="auth-form">
        {mode === "register" ? (
          <label>
            Name
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </label>
        ) : null}
        <label>
          Email
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </label>
        <label>
          Password
          <input
            required
            type="password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
        </label>
        {error ? <p className="msg error">{error}</p> : null}
        <button type="submit" className="btn-primary" disabled={busy || googleBusy}>
          {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Register"}
        </button>
      </form>

      <p className="auth-switch">
        {mode === "login" ? (
          <>
            New here?{" "}
            <button type="button" className="link-btn" onClick={() => setMode("register")}>
              Create an account
            </button>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <button type="button" className="link-btn" onClick={() => setMode("login")}>
              Sign in
            </button>
          </>
        )}
      </p>
      <Link href="/catalog" className="back-link">
        ← Back to catalog
      </Link>
    </section>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<p className="catalog-status">Loading…</p>}>
      <LoginForm />
    </Suspense>
  );
}
