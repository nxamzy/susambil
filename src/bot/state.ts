/** Xarajat kiritish jarayonidagi vaqtinchalik holat (faqat xotirada). */

export type XarajatHolat =
  | { qadam: "summa" }
  | { qadam: "izoh"; summa: number }
  | { qadam: "rasm"; summa: number; izoh: string };

const holatlar = new Map<number, { holat: XarajatHolat; vaqt: number }>();
const MUDDAT_MS = 10 * 60_000;

export function xarajatHolati(userId: number): XarajatHolat | null {
  const x = holatlar.get(userId);
  if (!x) return null;
  if (Date.now() - x.vaqt > MUDDAT_MS) {
    holatlar.delete(userId);
    return null;
  }
  return x.holat;
}

export function xarajatOrnat(userId: number, holat: XarajatHolat): void {
  holatlar.set(userId, { holat, vaqt: Date.now() });
}

export function xarajatTozala(userId: number): void {
  holatlar.delete(userId);
}
