import { BestSellers } from "@/components/landing/BestSellers";
import { BooklistPromptCard } from "@/components/landing/BooklistPromptCard";
import { DealsCarousel } from "@/components/landing/DealsCarousel";
import { FeaturedBooks } from "@/components/landing/FeaturedBooks";
import { NewsletterSignup } from "@/components/landing/NewsletterSignup";
import { Recommended } from "@/components/landing/Recommended";
import { StoreFeatures } from "@/components/landing/StoreFeatures";

export function LandingPage() {
  return (
    <div className="landing-root">
      <DealsCarousel />
      <StoreFeatures />
      <FeaturedBooks />
      <div id="booklists">
        <BooklistPromptCard />
      </div>
      <BestSellers />
      <Recommended />
      <NewsletterSignup />
    </div>
  );
}
