import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { rateLimit, resetRateLimit, clientIp } from "./rate-limit";

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Пароль", type: "password" },
      },
      async authorize(credentials, request) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = (credentials.email as string).toLowerCase();
        const ip = request ? clientIp(request as Request) : "unknown";

        // Login used to be a free-for-all: unlimited guesses against a password
        // that only had to be six characters. Two windows — one per account so
        // a single victim can't be ground down, one per source so a botnet-free
        // attacker can't spray across many accounts.
        const [byAccount, bySource] = await Promise.all([
          rateLimit(`login:email:${email}`, 10, 15 * 60 * 1000),
          rateLimit(`login:ip:${ip}`, 50, 15 * 60 * 1000),
        ]);
        if (!byAccount.allowed || !bySource.allowed) {
          throw new Error("RATE_LIMITED");
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        });

        if (!user) return null;

        const isValid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        );
        if (!isValid) return null;

        if (user.status === "BANNED") {
          throw new Error("BANNED");
        }

        // Honest users shouldn't inherit the counter left by someone guessing
        // at their address.
        await resetRateLimit(`login:email:${email}`);

        return {
          id: user.id,
          email: user.email,
          name: user.displayName,
          image: user.avatarUrl || null,
          role: user.role,
          status: user.status,
          fomoId: user.fomoId || null,
          sessionVersion: user.sessionVersion,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
        token.status = (user as any).status;
        token.fomoId = (user as any).fomoId;
        token.picture = user.image;
        token.sessionVersion = (user as any).sessionVersion ?? 0;
        token.refreshedAt = Date.now();
      }

      // Refresh from DB only every 5 minutes, NOT every request
      const refreshedAt = (token.refreshedAt as number) || 0;
      const fiveMinutes = 5 * 60 * 1000;

      if (token.id && Date.now() - refreshedAt > fiveMinutes) {
        try {
          const fresh = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: {
              avatarUrl: true,
              role: true,
              status: true,
              fomoId: true,
              sessionVersion: true,
            },
          });
          if (fresh) {
            // Password changed since this token was issued, or the account was
            // banned — either way the session is over. Returning null here is
            // what actually ends it.
            if (fresh.sessionVersion !== (token.sessionVersion ?? 0)) return null;
            if (fresh.status === "BANNED") return null;

            token.picture = fresh.avatarUrl || null;
            token.role = fresh.role;
            token.status = fresh.status;
            token.fomoId = fresh.fomoId;
            token.refreshedAt = Date.now();
          }
        } catch {
          // DB query failed — keep existing token, don't invalidate session
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        (session.user as any).role = token.role;
        (session.user as any).status = token.status;
        (session.user as any).fomoId = token.fomoId;
        session.user.image = token.picture as string;
      }
      return session;
    },
  },
});
