/* Runs once when the Next.js server starts. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // the ISS / ALGOPACK / T-Invest hosts are signed by the Russian root CA: give exactly those hosts the extra trust (see src/lib/algopack-tls.ts)
    const { installRuCaFetch } = await import("./lib/algopack-tls");
    installRuCaFetch();
  }
}
