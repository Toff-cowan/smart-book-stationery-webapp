"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { addToCart, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

type AddToCartButtonProps = {
  productId: number;
  disabled?: boolean;
};

export function AddToCartButton({ productId, disabled }: AddToCartButtonProps) {
  const { token, ready } = useAuth();
  const router = useRouter();
  const [quantity, setQuantity] = useState(1);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle",
  );
  const [message, setMessage] = useState<string | null>(null);

  async function handleAdd() {
    if (!ready) return;
    if (!token) {
      router.push(`/login?next=/catalog/${productId}`);
      return;
    }

    setStatus("loading");
    setMessage(null);
    try {
      await addToCart(productId, quantity, token);
      setStatus("done");
      setMessage("Added to cart");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof ApiError ? err.message : "Could not add to cart");
    }
  }

  return (
    <div className="add-to-cart">
      <label className="qty">
        <span>Qty</span>
        <input
          type="number"
          min={1}
          max={99}
          value={quantity}
          onChange={(e) =>
            setQuantity(Math.max(1, Math.min(99, Number(e.target.value) || 1)))
          }
        />
      </label>
      <button
        type="button"
        className="btn-primary"
        onClick={handleAdd}
        disabled={disabled || status === "loading"}
      >
        {status === "loading" ? "Adding…" : "Add to cart"}
      </button>
      {message ? (
        <p className={status === "error" ? "msg error" : "msg ok"}>
          {message}
          {status === "done" ? (
            <>
              {" "}
              <Link href="/cart">View cart</Link>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
