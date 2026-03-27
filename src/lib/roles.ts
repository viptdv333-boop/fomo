/** Check if user has admin privileges (ADMIN or OWNER) */
export function isAdmin(user: any): boolean {
  return user?.role === "ADMIN" || user?.role === "OWNER";
}

/** Check if user is the platform owner */
export function isOwner(user: any): boolean {
  return user?.role === "OWNER";
}

/** The owner email — cannot be deleted or demoted */
export const OWNER_EMAIL = "viptdv333@gmail.com";
