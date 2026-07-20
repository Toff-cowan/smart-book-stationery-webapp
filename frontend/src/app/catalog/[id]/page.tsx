import { ProductDetailClient } from "@/components/ProductDetailClient";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProductPage({ params }: PageProps) {
  const { id } = await params;
  const numericId = Number(id);
  return <ProductDetailClient id={Number.isFinite(numericId) ? numericId : 0} />;
}
