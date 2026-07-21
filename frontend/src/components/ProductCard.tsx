import Link from "next/link";

import type { InventoryItem } from "@/lib/types";
import { coverGradient, mediaUrl } from "@/lib/format";
import { Price } from "@/components/Price";
import { StarRating } from "@/components/StarRating";

type ProductCardProps = {
  item: InventoryItem;
};

export function ProductCard({ item }: ProductCardProps) {
  const image = mediaUrl(item.image_url);
  return (
    <Link href={`/catalog/${item.id}`} className="product-card">
      <div
        className="product-cover"
        style={
          image
            ? { backgroundImage: `url(${image})` }
            : { backgroundImage: coverGradient(item.department) }
        }
      >
        {!image ? (
          <span className="cover-title">{item.name}</span>
        ) : null}
      </div>
      <div className="product-body">
        <h2>{item.name}</h2>
        <StarRating value={item.rating_stars} count={item.rating_count} />
        <p className="price">
          <Price value={item.price} />
        </p>
        {item.stock > 0 ? (
          <p className="availability">In stock</p>
        ) : (
          <p className="availability out">Out of stock</p>
        )}
      </div>
    </Link>
  );
}
