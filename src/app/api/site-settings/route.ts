import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  let settings = await prisma.siteSettings.findUnique({ where: { id: "singleton" } });
  if (!settings) {
    settings = await prisma.siteSettings.create({ data: { id: "singleton" } });
  }
  return NextResponse.json({
    metaTitle: settings.metaTitle,
    metaDescription: settings.metaDescription,
    faviconUrl: settings.faviconUrl,
    headerCode: settings.headerCode,
    footerCode: settings.footerCode,
    headerCodePages: settings.headerCodePages,
    footerCodePages: settings.footerCodePages,
    hiddenPages: (settings as any).hiddenPages || [],
  }, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30" },
  });
}
