"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

const CLIENT_KEY = process.env.NEXT_PUBLIC_SMARTCAPTCHA_CLIENT_KEY;

declare global {
  interface Window {
    smartCaptcha?: {
      render: (
        container: HTMLElement | string,
        params: {
          sitekey: string;
          callback?: (token: string) => void;
          "expired-callback"?: () => void;
          hl?: string;
          invisible?: boolean;
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
 * Yandex SmartCaptcha widget.
 *
 * Renders nothing when no client key is configured, so the form still works on
 * a machine without the keys — the server side degrades the same way.
 */
export default function SmartCaptcha({ onToken }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);

  useEffect(() => {
    if (!CLIENT_KEY || !scriptReady || !containerRef.current) return;
    if (widgetId.current !== null) return;
    if (!window.smartCaptcha) return;

    widgetId.current = window.smartCaptcha.render(containerRef.current, {
      sitekey: CLIENT_KEY,
      hl: "ru",
      callback: (token) => onToken(token),
      "expired-callback": () => onToken(""),
    });
  }, [scriptReady, onToken]);

  if (!CLIENT_KEY) return null;

  return (
    <>
      <Script
        src="https://smartcaptcha.yandexcloud.net/captcha.js"
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
      />
      <div ref={containerRef} className="flex justify-center" />
    </>
  );
}
