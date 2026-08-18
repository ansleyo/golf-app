import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Card Night",
  description: "Golf and Phase 10 card games for friends."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
