"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";

// Full-bleed background of the terminal landing hero: screenshots of the terminal that crossfade every ~5.5 s with a slow
// Ken-Burns zoom (CSS, see terminal-landing.css). Rules:
//  - the first image loads with high priority, the others are mounted one step ahead of the slideshow (lazy);
//  - the slideshow stops while the tab is hidden and does not run at all for prefers-reduced-motion (the first image stays);
//  - on a wide screen without data-saver / reduced motion / slow connection a short muted looping video (hero.mp4, poster = the
//    first image) is laid over the images and the slideshow pauses; if the video fails the images simply stay.
// The text of the hero is not in this component: it only paints the background, so nothing here matters to crawlers.

const BASE = "/landing/terminal";
const SLIDES = [
  { src: `${BASE}/chart-1.webp`, altKey: "termsite.c1.alt1", pos: "25% 40%", origin: "30% 40%" },
  { src: `${BASE}/chart-2.webp`, altKey: "termsite.c1.alt2", pos: "35% 45%", origin: "60% 50%" },
  { src: `${BASE}/calendar.webp`, altKey: "termsite.c2.alt", pos: "50% 30%", origin: "50% 30%" },
] as const;
const VIDEO = `${BASE}/hero.mp4`;
const POSTER = SLIDES[0].src;
const INTERVAL_MS = 5500;

interface NetInfo {
  saveData?: boolean;
  effectiveType?: string;
}

export default function TerminalHeroBackdrop() {
  const { t } = useT();
  const [active, setActive] = useState(0);
  const [loaded, setLoaded] = useState(1); // slides 0..loaded-1 are mounted
  const [reduced, setReduced] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [useVideo, setUseVideo] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // reduced motion
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);

  // tab visibility
  useEffect(() => {
    const apply = () => setHidden(document.hidden);
    apply();
    document.addEventListener("visibilitychange", apply);
    return () => document.removeEventListener("visibilitychange", apply);
  }, []);

  // is the video allowed here? decided once after mount (never on the server, so the HTML is the same for everybody)
  useEffect(() => {
    // read the media query directly: the reduced state is still false on the first run
    if (reduced || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setUseVideo(false);
      return;
    }
    const conn = (navigator as Navigator & { connection?: NetInfo }).connection;
    const slow = !!conn && (conn.saveData === true || conn.effectiveType === "slow-2g" || conn.effectiveType === "2g" || conn.effectiveType === "3g");
    setUseVideo(window.matchMedia("(min-width: 768px)").matches && !slow);
  }, [reduced]);

  // slideshow
  const running = !reduced && !hidden && !(useVideo && videoReady);
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setActive((a) => (a + 1) % SLIDES.length), INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [running]);

  // the second slide is mounted a moment after the first one is on screen (never for reduced motion: the first image stays)
  useEffect(() => {
    if (reduced) return;
    const id = window.setTimeout(() => setLoaded((n) => Math.max(n, 2)), 1500);
    return () => window.clearTimeout(id);
  }, [reduced]);

  // keep one slide ahead mounted
  useEffect(() => {
    if (active > 0) setLoaded((n) => Math.max(n, Math.min(SLIDES.length, active + 2)));
  }, [active]);

  // pause the video with the tab
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (hidden) v.pause();
    else v.play().catch(() => {});
  }, [hidden, useVideo]);

  return (
    <>
      <div className="tl-bg" aria-hidden="true" data-testid="tl-bg" data-active={active} data-video={useVideo && videoReady ? "1" : "0"}>
        {SLIDES.slice(0, loaded).map((s, i) => (
          <div key={s.src} className={`tl-slide${i === active ? " is-active" : ""}`} style={{ ["--tl-pos" as string]: s.pos, ["--tl-origin" as string]: s.origin }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={s.src}
              alt=""
              width={1440}
              height={900}
              decoding="async"
              loading={i === 0 ? "eager" : "lazy"}
              {...(i === 0 ? { fetchPriority: "high" as const } : {})}
            />
          </div>
        ))}
        {useVideo && (
          <video
            ref={videoRef}
            className={`tl-video${videoReady ? " is-ready" : ""}`}
            src={VIDEO}
            poster={POSTER}
            muted
            loop
            autoPlay
            playsInline
            preload="metadata"
            onCanPlay={() => setVideoReady(true)}
            onError={() => setUseVideo(false)}
            tabIndex={-1}
          />
        )}
      </div>
      <div className="tl-veil" aria-hidden="true" />
      {!reduced && !(useVideo && videoReady) && (
        <div className="tl-dots absolute bottom-3 left-0 right-0 z-10" role="group" aria-label="Slides">
          {SLIDES.map((s, i) => (
            <button key={s.src} type="button" className={`tl-dot${i === active ? " is-active" : ""}`} aria-label={t(s.altKey)} aria-current={i === active} onClick={() => { setLoaded((n) => Math.max(n, i + 2)); setActive(i); }} />
          ))}
        </div>
      )}
    </>
  );
}
