import "./fomo-logo.css";

/** Shared wordmark. The product name belongs to the mark and stays visible at every size. */
export default function FomoLogo({ product, hero = false }: { product: "terminal" | "spot"; hero?: boolean }) {
  const name = product === "terminal" ? "FOMO Terminal" : "FOMO Spot";
  return (
    <span className={`fomo-wordmark${hero ? " fomo-wordmark-hero" : ""}`} role="img" aria-label={name}>
      <span aria-hidden="true" className="fomo-wordmark-name"><span>F</span><span>O</span><span>M</span><span>O</span></span>
      <span aria-hidden="true" className="fomo-wordmark-product">{product}</span>
    </span>
  );
}
