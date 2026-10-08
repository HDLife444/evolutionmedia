import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Evolution Media · Sound Vector",
  description: "Your personal development music library.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
