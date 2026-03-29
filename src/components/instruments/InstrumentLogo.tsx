"use client";

import Image from "next/image";
import { useState } from "react";

interface InstrumentLogoProps {
  slug: string;
  name: string;
  size?: number;
  className?: string;
}

/** Displays instrument SVG logo with fallback to colored initials */
export default function InstrumentLogo({ slug, name, size = 40, className = "" }: InstrumentLogoProps) {
  const [error, setError] = useState(false);

  if (error) {
    // Fallback: colored circle with first letter
    const colors = [
      "#E53E3E", "#DD6B20", "#D69E2E", "#38A169", "#319795",
      "#3182CE", "#5A67D8", "#805AD5", "#D53F8C", "#E53E3E",
    ];
    const colorIndex = slug.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % colors.length;
    const initials = name.slice(0, 2).toUpperCase();

    return (
      <div
        className={`inline-flex items-center justify-center rounded-full text-white font-bold ${className}`}
        style={{ width: size, height: size, fontSize: size * 0.4, backgroundColor: colors[colorIndex] }}
      >
        {initials}
      </div>
    );
  }

  return (
    <Image
      src={`/icons/instruments/${slug}.svg`}
      alt={name}
      width={size}
      height={size}
      className={`rounded-full ${className}`}
      onError={() => setError(true)}
    />
  );
}
