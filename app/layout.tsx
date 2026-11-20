import type { Metadata } from "next";
import "./globals.css";
import "./marketplace.css";

export const metadata: Metadata = {
  title: "Lens & Light — Photography that tells your story",
  description: "Thoughtful wedding, portrait and lifestyle photography. Explore the portfolio and enquire about your next session.",
  keywords: ["photographer", "wedding photography", "portrait photography", "portfolio"],
  openGraph: {
    title: "Lens & Light — Every frame tells a story",
    description: "A considered collection of stories, people and places.",
    type: "website"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}