type ClassValue = string | number | null | undefined | false | ClassValue[];

function flatten(value: ClassValue, out: string[]) {
  if (!value && value !== 0) return;
  if (Array.isArray(value)) {
    value.forEach((v) => flatten(v, out));
    return;
  }
  out.push(String(value));
}

/** Concaténation conditionnelle de classes, sans dépendance externe. */
export function cn(...values: ClassValue[]): string {
  const out: string[] = [];
  flatten(values, out);
  return out.join(" ");
}
