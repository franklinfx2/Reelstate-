import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Reelstate — Property marketing, done for you",
  description:
    "Turn raw property photos and video into professional marketing content in minutes.",
};

const SYSTEM_FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
      style={{ ["--font-system" as string]: SYSTEM_FONT_STACK }}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
