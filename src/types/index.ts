/* eslint-disable @typescript-eslint/no-unused-vars */
import { UserRole, UserStatus } from "@prisma/client";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    id: string;
    role: UserRole;
    status: UserStatus;
  }

  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: UserRole;
      status: UserStatus;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
    status: UserStatus;
  }
}

export interface PaidTier {
  min: number;
  max: number;
  maxPaid: number;
}
