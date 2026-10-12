import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { handleLimits, handleStreamUpload, type StreamDeps } from "@/lib/large-upload";

// Raw-body upload of a video (up to 500 MB for channel owners and staff), streamed to disk: see src/lib/large-upload.ts.
// The middleware does not match /api/upload (its matcher lists only the other API prefixes), so nothing buffers or cuts this body
// before the handler; auth is checked here, the same rule as /api/upload (APPROVED accounts only).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const deps: StreamDeps = {
  getUser: async () => {
    const session = await auth();
    const u = session?.user as any;
    return u?.id ? { id: u.id as string, role: u.role as string | undefined, status: u.status as string | undefined } : null;
  },
  // a database hiccup must not turn into a 500 here: the account then simply stays at the 10 MB of everybody else
  ownsChannel: async (userId) => {
    try {
      return (await prisma.subscriptionTariff.count({ where: { authorId: userId } })) > 0;
    } catch {
      return false;
    }
  },
  rateLimit,
  log: (m) => console.log(m),
};

/** What this account may upload: { maxMb } (the form shows the right hint and decides which path a file takes). */
export async function GET() {
  return handleLimits(deps);
}

export async function PUT(request: Request) {
  return handleStreamUpload(request, deps);
}

export async function POST(request: Request) {
  return handleStreamUpload(request, deps);
}
