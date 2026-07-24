import type { Metadata } from "next";
import { Merriweather, Poppins } from "next/font/google";

import { CurrencySwitcher } from "@/components/CurrencySwitcher";
import { Providers } from "@/components/Providers";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import "./globals.css";

/* Modern bookstore: Poppins headings + Merriweather body */
const display = Poppins({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-display",
});

const body = Merriweather({
  subsets: ["latin"],
  weight: ["300", "400", "700"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Smart Books Stationery and Supplies Ltd",
  description: "Browse textbooks, stationery, and gifts — build your booklist.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <Providers>
          <div className="page-shell">
            <SiteHeader />
            <main className="page-main">{children}</main>
            <SiteFooter />
          </div>
          <CurrencySwitcher />
        </Providers>
      </body>
    </html>
  );
}
