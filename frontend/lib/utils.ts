import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString();
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateShort(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
  });
}

export function confidenceLabel(c: string): string {
  switch (c) {
    case "high":
      return "High";
    case "medium":
      return "Medium";
    case "low":
      return "Low";
    case "known":
      return "Known";
    case "likely":
      return "Likely";
    case "possible":
      return "Possible";
    case "unknown":
      return "Unknown";
    default:
      return c;
  }
}

export function confidenceColor(c: string): string {
  switch (c) {
    case "high":
    case "known":
      return "emerald";
    case "medium":
    case "likely":
      return "amber";
    case "low":
    case "possible":
      return "orange";
    case "unknown":
      return "slate";
    default:
      return "slate";
  }
}

export function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 3) + "...";
}

export function pluralize(n: number, singular: string, plural?: string): string {
  return n === 1 ? singular : (plural ?? `${singular}s`);
}

export function eventPhaseLabel(name: string): string {
  return name.toUpperCase();
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
