"use client";

// SVG flag icons that work in all browsers (emoji flags don't render on Windows Chrome/Opera)
export function FlagIcon({ code, size = 20 }: { code: string; size?: number }) {
  const w = size;
  const h = Math.round(size * 0.7);

  switch (code) {
    case "ru":
      return (
        <svg width={w} height={h} viewBox="0 0 30 21" className="inline-block rounded-sm overflow-hidden">
          <rect width="30" height="7" y="0" fill="#fff" />
          <rect width="30" height="7" y="7" fill="#0039A6" />
          <rect width="30" height="7" y="14" fill="#D52B1E" />
        </svg>
      );
    case "en":
      return (
        <svg width={w} height={h} viewBox="0 0 60 30" className="inline-block rounded-sm overflow-hidden">
          <rect width="60" height="30" fill="#012169" />
          <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
          <path d="M0,0 L60,30 M60,0 L0,30" stroke="#C8102E" strokeWidth="2" />
          <path d="M30,0 V30 M0,15 H60" stroke="#fff" strokeWidth="10" />
          <path d="M30,0 V30 M0,15 H60" stroke="#C8102E" strokeWidth="6" />
        </svg>
      );
    case "zh":
    case "cn":
      return (
        <svg width={w} height={h} viewBox="0 0 30 20" className="inline-block rounded-sm overflow-hidden">
          <rect width="30" height="20" fill="#DE2910" />
          <g fill="#FFDE00">
            <polygon points="5,2 5.9,4.8 3,3.5 7,3.5 4.1,4.8" />
            <polygon points="10,1 10.4,2.2 9.2,1.5 10.8,1.5 9.6,2.2" />
            <polygon points="12,3 12.4,4.2 11.2,3.5 12.8,3.5 11.6,4.2" />
            <polygon points="12,6 12.4,7.2 11.2,6.5 12.8,6.5 11.6,7.2" />
            <polygon points="10,8 10.4,9.2 9.2,8.5 10.8,8.5 9.6,9.2" />
          </g>
        </svg>
      );
    case "de":
      return (
        <svg width={w} height={h} viewBox="0 0 30 21" className="inline-block rounded-sm overflow-hidden">
          <rect width="30" height="7" y="0" fill="#000" />
          <rect width="30" height="7" y="7" fill="#DD0000" />
          <rect width="30" height="7" y="14" fill="#FFCC00" />
        </svg>
      );
    case "fr":
      return (
        <svg width={w} height={h} viewBox="0 0 30 21" className="inline-block rounded-sm overflow-hidden">
          <rect width="10" height="21" x="0" fill="#002395" />
          <rect width="10" height="21" x="10" fill="#fff" />
          <rect width="10" height="21" x="20" fill="#ED2939" />
        </svg>
      );
    case "es":
      return (
        <svg width={w} height={h} viewBox="0 0 30 21" className="inline-block rounded-sm overflow-hidden">
          <rect width="30" height="21" fill="#AA151B" />
          <rect width="30" height="10.5" y="5.25" fill="#F1BF00" />
        </svg>
      );
    case "ja":
      return (
        <svg width={w} height={h} viewBox="0 0 30 21" className="inline-block rounded-sm overflow-hidden">
          <rect width="30" height="21" fill="#fff" />
          <circle cx="15" cy="10.5" r="6" fill="#BC002D" />
        </svg>
      );
    case "ko":
      return (
        <svg width={w} height={h} viewBox="0 0 30 21" className="inline-block rounded-sm overflow-hidden">
          <rect width="30" height="21" fill="#fff" />
          <circle cx="15" cy="10.5" r="5" fill="#C60C30" />
          <path d="M15,5.5 a5,5 0 0,1 0,10" fill="#003478" />
        </svg>
      );
    case "ar":
      return (
        <svg width={w} height={h} viewBox="0 0 30 21" className="inline-block rounded-sm overflow-hidden">
          <rect width="30" height="7" y="0" fill="#007A3D" />
          <rect width="30" height="7" y="7" fill="#fff" />
          <rect width="30" height="7" y="14" fill="#000" />
        </svg>
      );
    case "pt":
      return (
        <svg width={w} height={h} viewBox="0 0 30 21" className="inline-block rounded-sm overflow-hidden">
          <rect width="12" height="21" x="0" fill="#006600" />
          <rect width="18" height="21" x="12" fill="#FF0000" />
          <circle cx="12" cy="10.5" r="4" fill="#FFCC00" />
        </svg>
      );
    case "it":
      return (
        <svg width={w} height={h} viewBox="0 0 30 21" className="inline-block rounded-sm overflow-hidden">
          <rect width="10" height="21" x="0" fill="#009246" />
          <rect width="10" height="21" x="10" fill="#fff" />
          <rect width="10" height="21" x="20" fill="#CE2B37" />
        </svg>
      );
    case "tr":
      return (
        <svg width={w} height={h} viewBox="0 0 30 21" className="inline-block rounded-sm overflow-hidden">
          <rect width="30" height="21" fill="#E30A17" />
          <circle cx="12" cy="10.5" r="5" fill="#fff" />
          <circle cx="13.5" cy="10.5" r="4" fill="#E30A17" />
          <polygon points="17,10.5 15.2,11.5 15.6,9.5 14.2,8.3 16.1,8 17,6.3 17.9,8 19.8,8.3 18.4,9.5 18.8,11.5" fill="#fff" transform="scale(0.6) translate(14,7)" />
        </svg>
      );
    default:
      // Globe icon fallback
      return (
        <svg width={w} height={h} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="inline-block">
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
        </svg>
      );
  }
}
