/* First start of a terminal instance (terminal.fomo.spot): the languages the language switcher reads, the site-settings row, and the
   first OWNER account on the EMPTY instance database. Idempotent: run it again to reset the owner's password.

   Credentials come from the environment, never from the repo:
     OWNER_EMAIL=...  OWNER_PASSWORD=...  [OWNER_NAME="Имя"]  npx tsx scripts/terminal-instance-init.ts
   (scripts/terminal-instance-setup.sh asks for them and calls this file.)

   NOT prisma/seed.ts: that one creates test users with known passwords and the demo content of fomo.spot.

   Safety: the database name of DATABASE_URL must contain "terminal" (or pass --force), so this cannot be pointed at the
   fomo.spot database by mistake. */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { checkPassword } from "../src/lib/account-security";
import { generateFomoId } from "../src/lib/fomoId";

const prisma = new PrismaClient();

function dbName(url: string | undefined): string {
  if (!url) return "";
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  } catch {
    return "";
  }
}

async function main() {
  const force = process.argv.includes("--force");
  const name = dbName(process.env.DATABASE_URL);
  if (!name) throw new Error("DATABASE_URL is not set (source the instance .env first)");
  if (!force && !/terminal/i.test(name)) {
    throw new Error(`database "${name}" does not look like the terminal instance database (no "terminal" in its name); pass --force if it really is`);
  }

  const email = (process.env.OWNER_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.OWNER_PASSWORD ?? "";
  const displayName = (process.env.OWNER_NAME ?? "").trim() || "Owner";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("OWNER_EMAIL is missing or is not an e-mail address");
  const strength = checkPassword(password, "en");
  if (!strength.ok) throw new Error(`OWNER_PASSWORD rejected: ${strength.error}`);

  // languages of the switcher (ru / en / cn), like prisma/seed.ts but without any demo data
  for (const lang of [
    { code: "ru", name: "Русский", enabled: true, sortOrder: 1 },
    { code: "en", name: "English", enabled: true, sortOrder: 2 },
    { code: "cn", name: "中文", enabled: true, sortOrder: 3 },
  ]) {
    await prisma.language.upsert({ where: { code: lang.code }, update: {}, create: lang });
  }

  await prisma.siteSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton", metaTitle: "FOMO Terminal", metaDescription: null },
  });

  const passwordHash = await bcrypt.hash(password, 10); // same cost as registration (src/app/api/auth/register/route.ts)
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash, role: "OWNER", status: "APPROVED", sessionVersion: { increment: 1 } },
    });
    console.log(`updated existing user ${email}: role OWNER, status APPROVED, password reset, old sessions revoked`);
  } else {
    let fomoId = generateFomoId();
    for (let i = 0; i < 10 && (await prisma.user.findUnique({ where: { fomoId } })); i++) fomoId = generateFomoId();
    await prisma.user.create({ data: { email, passwordHash, displayName, fomoId, role: "OWNER", status: "APPROVED" } });
    console.log(`created OWNER ${email}`);
  }
  console.log(`database "${name}": languages and site settings are in place.`);
}

main()
  .catch((e) => {
    console.error("init failed:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
