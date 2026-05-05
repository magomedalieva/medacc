export function getLocalTodayIso(): string {
  const value = new Date();
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function shiftIsoDate(value: string, days: number): string {
  const nextValue = new Date(`${value}T00:00:00`);
  nextValue.setDate(nextValue.getDate() + days);

  const year = nextValue.getFullYear();
  const month = String(nextValue.getMonth() + 1).padStart(2, "0");
  const day = String(nextValue.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
