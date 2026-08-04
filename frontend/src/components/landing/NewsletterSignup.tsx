"use client";

import { useState, type FormEvent } from "react";

import { ApiError, subscribeNewsletter } from "@/lib/api";

export function NewsletterSignup() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle",
  );
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!value) {
      setStatus("error");
      setMessage("Enter your email address.");
      return;
    }

    setStatus("loading");
    setMessage(null);
    try {
      const res = await subscribeNewsletter(value);
      setStatus("done");
      setMessage(res.message || "Subscribed.");
      setEmail("");
    } catch (err) {
      setStatus("error");
      setMessage(
        err instanceof ApiError
          ? err.message
          : "Could not subscribe. Try again.",
      );
    }
  }

  return (
    <section className="newsletter-section" aria-labelledby="newsletter-heading">
      <div className="newsletter-inner">
        <div className="newsletter-copy">
          <p className="newsletter-kicker">Mail service</p>
          <h2 id="newsletter-heading">Stay on the list</h2>
          <p>
            Get term reminders, new stock alerts, and school booklist updates
            by email. You’ll get an automatic welcome message when you
            subscribe.
          </p>
        </div>

        <form className="newsletter-form" onSubmit={onSubmit}>
          <label className="sr-only" htmlFor="newsletter-email">
            Email address
          </label>
          <input
            id="newsletter-email"
            type="email"
            name="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <button type="submit" disabled={status === "loading"}>
            {status === "loading" ? "Sending…" : "Subscribe"}
          </button>
        </form>

        {message ? (
          <p className={status === "error" ? "newsletter-msg error" : "newsletter-msg"}>
            {message}
          </p>
        ) : null}
      </div>
    </section>
  );
}
