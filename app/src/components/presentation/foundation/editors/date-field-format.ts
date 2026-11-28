type Part = 'day' | 'month' | 'year';

/** The order and separator of a numeric date in the device's locale: month/day/year in en-US. */
function localeDateShape(): { order: Part[]; separator: string } {
  const parts = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(
    new Date(2000, 0, 31),
  );
  const order = parts.map((p) => p.type).filter((t): t is Part => t === 'day' || t === 'month' || t === 'year');
  const separator = parts.find((p) => p.type === 'literal')?.value ?? '/';
  return { order, separator };
}

export function formatDateForField(date: Date): string {
  const { order, separator } = localeDateShape();
  const values = {
    day: String(date.getDate()).padStart(2, '0'),
    month: String(date.getMonth() + 1).padStart(2, '0'),
    year: String(date.getFullYear()),
  };
  return order.map((part) => values[part]).join(separator);
}

/** Reads a typed date in the locale's order. Anything that isn't a real calendar day is undefined. */
export function parseDateFromField(text: string): Date | undefined {
  const numbers = text.match(/\d+/g);
  const { order } = localeDateShape();
  if (!numbers || numbers.length !== 3) {
    return undefined;
  }
  const value = Object.fromEntries(order.map((part, i) => [part, Number(numbers[i])])) as Record<Part, number>;
  if (String(value.year).length !== 4) {
    return undefined;
  }
  const date = new Date(value.year, value.month - 1, value.day);
  return date.getFullYear() === value.year && date.getMonth() === value.month - 1 && date.getDate() === value.day
    ? date
    : undefined;
}
