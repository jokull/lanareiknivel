export function fmtISK(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(Math.round(n));
  return sign + abs.toLocaleString("de-DE");
}

export function fmtISKShort(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) {
    return sign + (abs / 1_000_000).toFixed(1) + "M";
  }
  return sign + Math.round(abs / 1000) + "k";
}

export function fmtPct(n: number, decimals: number = 1): string {
  return n.toFixed(decimals) + "%";
}
