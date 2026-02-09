export function linesToArray(text) {
  if (!text) return [];
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function arrayToLines(arr) {
  if (!arr || !arr.length) return "";
  return arr.join("\n");
}

export function csvToArray(text) {
  if (!text) return [];
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function arrayToCsv(arr) {
  if (!arr || !arr.length) return "";
  return arr.join(", ");
}
