import type { Metadata, Viewport } from "next";
import { Fraunces, IBM_Plex_Mono, Instrument_Sans } from "next/font/google";
import "@mysten/dapp-kit/dist/index.css";
import "./globals.css";
import { Providers } from "./providers";

const sans = Instrument_Sans({ subsets: ["latin"], variable: "--font-sans" });
const serif = Fraunces({ subsets: ["latin"], variable: "--font-serif", axes: ["SOFT", "opsz"] });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });

export const viewport: Viewport = { themeColor: "#0a3a2a" };

export const metadata: Metadata = {
  title: "Usual",
  description: "A wallet with no buttons that learns how you talk about money.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} ${mono.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
