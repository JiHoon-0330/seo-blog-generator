type Step = "searching" | "crawling" | "analyzing" | "generating";

interface GenerationStatus {
  active: boolean;
  keyword?: string;
  step?: Step;
}

let currentStatus: GenerationStatus = { active: false };

export function setStatus(keyword: string, step: Step): void {
  currentStatus = { active: true, keyword, step };
}

export function clearStatus(): void {
  currentStatus = { active: false };
}

export function getStatus(): GenerationStatus {
  return { ...currentStatus };
}
