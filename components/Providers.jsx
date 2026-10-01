"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { StoreProvider } from "../lib/store";
import { ToastProvider } from "./Toast";
import { EditorProvider } from "./Editor";
import Shell from "./Shell";

export default function Providers({ children }) {
  const path = usePathname();
  const signedOutPage = path === "/login";

  useEffect(() => {
    if (!signedOutPage && "serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, [signedOutPage]);

  return (
    <StoreProvider enabled={!signedOutPage}>
      <ToastProvider>
        <EditorProvider>{signedOutPage ? children : <Shell>{children}</Shell>}</EditorProvider>
      </ToastProvider>
    </StoreProvider>
  );
}
