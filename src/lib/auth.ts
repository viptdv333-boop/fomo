import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Пароль", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

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

        return {
          id: user.id,
          email: user.email,
          name: user.displayName,
          image: user.avatarUrl || null,
          role: user.role,
          status: user.status,
          fomoId: user.fomoId || null,
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
        token.refreshedAt = Date.now();
      }

      // Refresh from DB only every 5 minutes, NOT every request
      const refreshedAt = (token.refreshedAt as number) || 0;
      const fiveMinutes = 5 * 60 * 1000;

      if (token.id && Date.now() - refreshedAt > fiveMinutes) {
        try {
          const fresh = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { avatarUrl: true, role: true, status: true, fomoId: true },
          });
          if (fresh) {
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
