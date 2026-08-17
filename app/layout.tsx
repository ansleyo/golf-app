import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Golf Night",
  description: "A four-card game of Golf for friends."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
