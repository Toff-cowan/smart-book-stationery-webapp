import { LandingPage } from "@/components/landing/LandingPage";
import { OAuthErrorRedirect } from "@/components/OAuthErrorRedirect";

export default function HomePage() {
  return (
    <>
      <OAuthErrorRedirect />
      <LandingPage />
    </>
  );
}
