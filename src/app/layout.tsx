import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Duet — A second perspective",
  description:
    "A thoughtful chat workspace powered by a Writer → Reviewer pipeline.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
