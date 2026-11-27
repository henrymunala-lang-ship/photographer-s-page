import type { Metadata } from "next";
import "./globals.css";
import "./marketplace.css";
import { FeedbackProvider } from "@/components/feedback-provider";

export const metadata: Metadata = {
  title: "LENS & LIGHT — Make a shot, Keep memory",
  description: "LENS & LIGHT — Make a shot, Keep memory. Discover photographers for the moments you want to remember.",
  keywords: ["photographer", "wedding photography", "portrait photography", "portfolio"],
  openGraph: {
    title: "LENS & LIGHT — Make a shot, Keep memory",
    description: "Make a shot, Keep memory. Photography for people, stories and places.",
    type: "website"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><FeedbackProvider>{children}</FeedbackProvider></body></html>;
}