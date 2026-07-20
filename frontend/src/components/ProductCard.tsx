import Link from "next/link";

import type { InventoryItem } from "@/lib/types";
import { coverGradient, formatPrice } from "@/lib/format";
import { StarRating } from "@/components/StarRating";

type ProductCardProps = {
  item: InventoryItem;
};

export function ProductCard({ item }: ProductCardProps) {
  return (
    <Link href={`/catalog/${item.id}`} className="product-card">
      <div
        className="product-cover"
        style={
          item.image_url
            ? { backgroundImage: `url(${item.image_url})` }
            : { backgroundImage: coverGradient(item.department) }
        }
      >
        {!item.image_url ? (
          <span className="cover-title">{item.name}</span>
        ) : null}
      </div>
      <div className="product-body">
        <h2>{item.name}</h2>
        <StarRating value={item.rating_stars} count={item.rating_count} />
        <p className="price">{formatPrice(item.price)}</p>
        {item.stock > 0 ? (
          <p className="availability">In stock</p>
        ) : (
          <p className="availability out">Out of stock</p>
        )}
      </div>
    </Link>
  );
}
