import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";

async function getSettings() {
  let settings = await prisma.siteSettings.findUnique({ where: { id: "singleton" } });
  if (!settings) {
    settings = await prisma.siteSettings.create({ data: { id: "singleton" } });
  }
  return settings;
}

export async function GET() {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const settings = await getSettings();
  return NextResponse.json(settings);
}

export async function PUT(request: NextRequest) {
  const sess = await auth();
  if (!sess?.user || !isAdmin(sess.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { metaTitle, metaDescription, faviconUrl, headerCode, footerCode, headerCodePages, footerCodePages, hiddenPages } = body;

  const settings = await prisma.siteSettings.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      metaTitle: metaTitle || "FOMO — Find Opportunities, Manage Outcomes",
      metaDescription,
      faviconUrl,
      headerCode,
      footerCode,
      headerCodePages: headerCodePages || [],
      footerCodePages: footerCodePages || [],
      hiddenPages: hiddenPages || [],
    },
    update: {
      ...(metaTitle !== undefined && { metaTitle }),
      ...(metaDescription !== undefined && { metaDescription }),
      ...(faviconUrl !== undefined && { faviconUrl }),
      ...(headerCode !== undefined && { headerCode }),
      ...(footerCode !== undefined && { footerCode }),
      ...(headerCodePages !== undefined && { headerCodePages }),
      ...(footerCodePages !== undefined && { footerCodePages }),
      ...(hiddenPages !== undefined && { hiddenPages }),
    },
  });

  return NextResponse.json(settings);
}
