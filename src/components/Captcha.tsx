"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

const SITE_KEY = process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY;

declare global {
  interface Window {
    hcaptcha?: {
      render: (
        container: HTMLElement | string,
        params: {
          sitekey: string;
          callback?: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
          theme?: "light" | "dark";
          hl?: string;
          size?: "normal" | "compact" | "invisible";
        }
      ) => string;
      execute: (widgetId?: string) => void;
      reset: (widgetId?: string) => void;
    };
  }
}

interface Props {
  /** Receives the token to send along with the form, or "" when it expires. */
  onToken: (token: string) => void;
}

/**
 * hCaptcha widget.
 *
 * Renders nothing when no site key is configured, so the form still works on a
 * machine without the keys — the server side degrades the same way.
 */
export default function Captcha({ onToken }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);

  useEffect(() => {
    if (!SITE_KEY || !scriptReady || !containerRef.current) return;
    if (widgetId.current !== null) return;
    if (!window.hcaptcha) return;

    widgetId.current = window.hcaptcha.render(containerRef.current, {
      sitekey: SITE_KEY,
      hl: "ru",
      callback: (token) => onToken(token),
      "expired-callback": () => onToken(""),
      "error-callback": () => onToken(""),
    });
  }, [scriptReady, onToken]);

  if (!SITE_KEY) return null;

  return (
    <>
      <Script
        src="https://js.hcaptcha.com/1/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
      />
      <div ref={containerRef} className="flex justify-center" />
    </>
  );
}
