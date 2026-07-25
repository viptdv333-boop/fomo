/**
 * SiteSettings.metaTitle / metaDescription override the code defaults in
 * src/app/layout.tsx, and production still held the old English title
 * ("FOMO — Find Opportunities, Manage Outcomes") plus a 53-char description.
 * Both are bad for ru-RU search — this rewrites them to the keyword-led
 * versions that match the code defaults.
 *
 * Usage on the VPS:
 *   DRY_RUN=1 npx tsx prisma/seo-update-site-settings.ts   # preview
 *   DRY_RUN=0 npx tsx prisma/seo-update-site-settings.ts   # apply
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const META_TITLE = "Торговые идеи и аналитика фондового рынка — FOMO";
const META_DESCRIPTION =
  "Торговые идеи и прогнозы от трейдеров: акции, фьючерсы МосБиржи, криптовалюта, форекс. Технический анализ, сигналы, подписки на авторов. Публикуйте свои идеи.";

async function main() {
  const DRY_RUN = process.env.DRY_RUN !== "0";
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "APPLY"}\n`);

  const current = await prisma.siteSettings.findUnique({ where: { id: "singleton" } });

  console.log("--- current ---");
  console.log(`title:       ${current?.metaTitle ?? "(none)"}`);
  console.log(`description: ${current?.metaDescription ?? "(none)"}`);
  console.log(`             (${(current?.metaDescription ?? "").length} chars)\n`);

  console.log("--- new ---");
  console.log(`title:       ${META_TITLE}`);
  console.log(`             (${META_TITLE.length} chars)`);
  console.log(`description: ${META_DESCRIPTION}`);
  console.log(`             (${META_DESCRIPTION.length} chars)\n`);

  if (DRY_RUN) {
    console.log("DRY RUN — nothing written. Re-run with DRY_RUN=0 to apply.");
    return;
  }

  await prisma.siteSettings.upsert({
    where: { id: "singleton" },
    update: { metaTitle: META_TITLE, metaDescription: META_DESCRIPTION },
    create: {
      id: "singleton",
      metaTitle: META_TITLE,
      metaDescription: META_DESCRIPTION,
    },
  });
  console.log("SiteSettings updated.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
