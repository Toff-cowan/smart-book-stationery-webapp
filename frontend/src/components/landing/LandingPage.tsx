import { BestSellers } from "@/components/landing/BestSellers";
import { BooklistPromptCard } from "@/components/landing/BooklistPromptCard";
import { DealsCarousel } from "@/components/landing/DealsCarousel";
import { FeaturedBooks } from "@/components/landing/FeaturedBooks";

export function LandingPage() {
  return (
    <div className="landing-root">
      <DealsCarousel />
      <BooklistPromptCard />
      <FeaturedBooks />
      <BestSellers />
    </div>
  );
}
