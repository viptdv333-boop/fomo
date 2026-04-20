-- Ensure SiteSettings table exists (created via prisma db push in older deployments)
CREATE TABLE IF NOT EXISTS "SiteSettings" (
  "id" TEXT NOT NULL DEFAULT 'singleton',
  "metaTitle" TEXT NOT NULL DEFAULT 'FOMO — Find Opportunities, Manage Outcomes',
  "metaDescription" TEXT DEFAULT 'Торговая платформа нового поколения',
  "faviconUrl" TEXT,
  "headerCode" TEXT,
  "footerCode" TEXT,
  CONSTRAINT "SiteSettings_pkey" PRIMARY KEY ("id")
);

-- Add page-scope columns (header/footer code can be targeted to specific paths)
ALTER TABLE "SiteSettings" ADD COLUMN IF NOT EXISTS "headerCodePages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "SiteSettings" ADD COLUMN IF NOT EXISTS "footerCodePages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Add hiddenPages column — list of nav paths to hide
ALTER TABLE "SiteSettings" ADD COLUMN IF NOT EXISTS "hiddenPages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
