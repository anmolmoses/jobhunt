import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function parseIdParam(id: string): number | null {
  const num = parseInt(id, 10);
  if (isNaN(num) || num <= 0 || !Number.isInteger(num)) return null;
  return num;
}
