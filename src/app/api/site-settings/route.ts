import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
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
      headerCodePages: (settings as any).headerCodePages || [],
      footerCodePages: (settings as any).footerCodePages || [],
      hiddenPages: (settings as any).hiddenPages || [],
    }, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30" },
    });
  } catch (err) {
    // Fallback: columns may not exist yet in DB (migration pending).
    // Return empty defaults so client layout does not crash.
    return NextResponse.json({
      metaTitle: "FOMO",
      metaDescription: null,
      faviconUrl: null,
      headerCode: null,
      footerCode: null,
      headerCodePages: [],
      footerCodePages: [],
      hiddenPages: [],
    });
  }
}
