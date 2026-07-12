import type { RunEvent, DemoExample } from "./types";

export async function loadDemoExamples(): Promise<DemoExample[]> {
  const response = await fetch("/demo/examples.json");
  if (!response.ok) {
    throw new Error("Failed to load demo examples");
  }
  return response.json();
}

export async function loadRunLog(path: string): Promise<RunEvent[]> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load run log: ${response.statusText}`);
  }
  const text = await response.text();
  return text
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as RunEvent);
}
