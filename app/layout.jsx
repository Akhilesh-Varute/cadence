import "./globals.css";
import NavBar from "../components/NavBar";

export const metadata = {
  title: "Sharpen",
  description: "Todos and reminders for you, not for work.",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Sharpen",
  },
};

export const viewport = {
  themeColor: "#a8611f",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col bg-bg dark:bg-dbg text-ink dark:text-dink">
        <main
          className="flex-1 max-w-2xl w-full mx-auto px-4 pb-28"
          style={{
            paddingTop: "calc(1.25rem + env(safe-area-inset-top, 0px))",
          }}
        >
          {children}
        </main>
        <NavBar />
      </body>
    </html>
  );
}
