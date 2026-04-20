import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FOMO — preview",
};

export default function PreviewLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,700;0,900&family=Crimson+Pro:ital,wght@0,400;0,600&display=swap"
        rel="stylesheet"
      />
      {children}
    </>
  );
}
