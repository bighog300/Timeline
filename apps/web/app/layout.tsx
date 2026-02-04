import type { ReactNode } from "react";

export const metadata = {
  title: "Timeline",
  description: "Timeline app"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
