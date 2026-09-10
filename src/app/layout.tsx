import type { Metadata } from "next";
import { Roboto } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";

const roboto = Roboto({
  weight: ["400", "700", "900"],
  subsets: ["latin"],
  variable: "--font-roboto",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Utlägg – Maskinteknologsektionen",
    template: "%s – Utlägg – M-sektionen",
  },
  description: "Gör utlägg till Maskinteknologsektionen vid Chalmers.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="sv" className={roboto.variable}>
      <body>
        <SiteHeader />
        {children}
        <footer className="site-footer">
          <a href="https://mtek.chalmers.se/">Maskinteknologsektionen</a> · Frågor om utlägg:{" "}
          <a href="mailto:ekonomi@mtek.chalmers.se">ekonomi@mtek.chalmers.se</a>
        </footer>
      </body>
    </html>
  );
}
