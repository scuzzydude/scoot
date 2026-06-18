export function currentTimeContext(): string {
  return new Date().toLocaleString("en-US", {
    timeZone: "America/Chicago",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export function withTimeContext(systemPrompt: string): string {
  return `${systemPrompt}\n\n## Current Date & Time\n${currentTimeContext()} — all times are Central.`;
}
