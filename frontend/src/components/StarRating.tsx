type StarRatingProps = {
  value: number | null;
  count?: number | null;
  size?: "sm" | "md";
};

export function StarRating({ value, count, size = "sm" }: StarRatingProps) {
  const stars = value ?? 0;
  const full = Math.floor(stars);
  const half = stars - full >= 0.5;
  const dim = size === "md" ? "1.15rem" : "0.95rem";

  return (
    <div className="star-rating" aria-label={value == null ? "No ratings yet" : `${value} out of 5 stars`}>
      <span className="stars" style={{ fontSize: dim }}>
        {[0, 1, 2, 3, 4].map((i) => {
          const filled = i < full || (i === full && half);
          return (
            <span key={i} className={filled ? "star on" : "star"}>
              ★
            </span>
          );
        })}
      </span>
      <span className="star-meta">
        {value != null ? value.toFixed(1) : "—"}
        {typeof count === "number" ? ` (${count})` : null}
      </span>
    </div>
  );
}
