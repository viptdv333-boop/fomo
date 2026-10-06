"use client";

import { useEffect, useState } from "react";
import { stripLocale } from "@/lib/i18n/locale-url";
import { usePathname } from "next/navigation";
import { isTerminalSite } from "@/lib/site-mode";

interface SiteSettings {
  metaTitle: string;
  faviconUrl: string | null;
  headerCode: string | null;
  footerCode: string | null;
  headerCodePages: string[];
  footerCodePages: string[];
}

function shouldInject(pages: string[], pathname: string): boolean {
  // Empty array = all pages
  if (!pages || pages.length === 0) return true;
  return pages.some(p => pathname === p || pathname.startsWith(p + "/"));
}

export default function SiteSettingsInjector() {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const pathname = stripLocale(usePathname() || "/").path;

  useEffect(() => {
    fetch("/api/site-settings")
      .then(r => r.ok ? r.json() : null)
      .then(setSettings)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!settings) return;

    // Update document title
    // terminal.fomo.spot keeps its own title: a fresh instance database carries the main site's default metaTitle
    if (settings.metaTitle && !isTerminalSite()) {
      document.title = settings.metaTitle;
    }

    // Update favicon
    if (settings.faviconUrl) {
      let link = document.querySelector("link[rel='icon']") as HTMLLinkElement;
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.href = settings.faviconUrl;
    }
  }, [settings]);

  useEffect(() => {
    if (!settings) return;

    // Clean up previous injections
    document.querySelectorAll("[data-site-inject]").forEach(el => el.remove());

    // Header code
    if (settings.headerCode && shouldInject(settings.headerCodePages, pathname)) {
      const container = document.createElement("div");
      container.setAttribute("data-site-inject", "header");
      container.innerHTML = settings.headerCode;
      // Move scripts to head to execute them
      const scripts = container.querySelectorAll("script");
      scripts.forEach(s => {
        const ns = document.createElement("script");
        if (s.src) ns.src = s.src;
        if (s.type) ns.type = s.type;
        if (s.async) ns.async = true;
        if (s.textContent) ns.textContent = s.textContent;
        ns.setAttribute("data-site-inject", "header");
        document.head.appendChild(ns);
      });
      // Non-script elements (meta tags, links)
      const nonScripts = container.querySelectorAll(":not(script)");
      nonScripts.forEach(el => {
        const clone = el.cloneNode(true) as HTMLElement;
        clone.setAttribute("data-site-inject", "header");
        document.head.appendChild(clone);
      });
    }

    // Footer code
    if (settings.footerCode && shouldInject(settings.footerCodePages, pathname)) {
      const container = document.createElement("div");
      container.setAttribute("data-site-inject", "footer");
      container.innerHTML = settings.footerCode;
      const scripts = container.querySelectorAll("script");
      scripts.forEach(s => {
        const ns = document.createElement("script");
        if (s.src) ns.src = s.src;
        if (s.type) ns.type = s.type;
        if (s.async) ns.async = true;
        if (s.textContent) ns.textContent = s.textContent;
        ns.setAttribute("data-site-inject", "footer");
        document.body.appendChild(ns);
      });
    }
  }, [settings, pathname]);

  return null;
}
