export function generateFomoId(): string {
  const num = Math.floor(1000000 + Math.random() * 9000000);
  return `fomo_user${num}`;
}

export const FOMO_ID_REGEX = /^[a-zA-Z0-9_!?$%]{7,33}$/;

export function isValidCustomFomoId(id: string): boolean {
  return FOMO_ID_REGEX.test(id);
}
