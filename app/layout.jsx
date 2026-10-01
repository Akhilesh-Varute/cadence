import "./globals.css";
import { Bricolage_Grotesque, Instrument_Sans } from "next/font/google";
import Providers from "../components/Providers";

const display = Bricolage_Grotesque({ subsets: ["latin"], axes: ["opsz"], variable: "--font-display", display: "swap" });
const body = Instrument_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-body", display: "swap" });

export const metadata = {
  title: "Cadence",
  description: "Reminders and tasks that keep you on a daily cadence.",
  manifest: "/manifest.json",
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Cadence" },
};

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#EDF0F7" },
    { media: "(prefers-color-scheme: dark)", color: "#14131A" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

// Applies the saved theme, accent and density before first paint so there is
// no flash. The store keeps this key up to date (see components/Providers.jsx).
const initUi = `try{var u=JSON.parse(localStorage.getItem("sharpen:ui")||"{}"),r=document.documentElement;
if(u.theme&&u.theme!=="system")r.setAttribute("data-theme",u.theme);
if(u.accent)r.style.setProperty("--accent-base",u.accent);
if(u.density)r.setAttribute("data-density",u.density)}catch(e){}`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: initUi }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
