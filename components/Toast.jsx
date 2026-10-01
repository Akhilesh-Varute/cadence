"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { reducedMotion } from "../lib/motion";

const Ctx = createContext(() => {});
export const useToast = () => useContext(Ctx);

// toast(content, undo?) - content is any React node. With `undo`, shows an Undo button.
export function ToastProvider({ children }) {
  const [t, setT] = useState(null);
  const timer = useRef();
  const el = useRef(null);

  const hide = useCallback(() => {
    clearTimeout(timer.current);
    if (el.current && !reducedMotion()) gsap.to(el.current, { y: -30, opacity: 0, duration: 0.2, onComplete: () => setT(null) });
    else setT(null);
  }, []);

  const toast = useCallback(
    (content, undo) => {
      setT({ content, undo, id: Date.now() });
      clearTimeout(timer.current);
      timer.current = setTimeout(hide, undo ? 4200 : 2600);
    },
    [hide]
  );

  useEffect(() => {
    if (t && el.current && !reducedMotion()) gsap.fromTo(el.current, { y: -30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, ease: "power3.out" });
  }, [t?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Ctx.Provider value={toast}>
      {children}
      {t && (
        <div id="toast" role="status" ref={el}>
          <span>{t.content}</span>
          {t.undo && (
            <button
              onClick={() => {
                t.undo();
                hide();
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}
    </Ctx.Provider>
  );
}
