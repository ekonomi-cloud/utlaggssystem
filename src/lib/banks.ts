// Clearingnummerserier för svenska banker (Bankgirots förteckning).
// Används för att fylla i banken automatiskt utifrån clearingnumret.

type Range = { from: number; to: number; bank: string; digits?: 4 | 5 };

const RANGES: Range[] = [
  { from: 1100, to: 1199, bank: "Nordea" },
  { from: 1200, to: 1399, bank: "Danske Bank" },
  { from: 1400, to: 2099, bank: "Nordea" },
  { from: 2300, to: 2399, bank: "Ålandsbanken" },
  { from: 2400, to: 2499, bank: "Danske Bank" },
  { from: 3000, to: 3299, bank: "Nordea" },
  { from: 3300, to: 3300, bank: "Nordea (personkonto)" },
  { from: 3301, to: 3399, bank: "Nordea" },
  { from: 3400, to: 3409, bank: "Länsförsäkringar Bank" },
  { from: 3410, to: 3781, bank: "Nordea" },
  { from: 3782, to: 3782, bank: "Nordea (personkonto)" },
  { from: 3783, to: 4999, bank: "Nordea" },
  { from: 5000, to: 5999, bank: "SEB" },
  { from: 6000, to: 6999, bank: "Handelsbanken" },
  { from: 7000, to: 7999, bank: "Swedbank" },
  { from: 8000, to: 8999, bank: "Swedbank", digits: 5 },
  { from: 9020, to: 9029, bank: "Länsförsäkringar Bank" },
  { from: 9040, to: 9049, bank: "Citibank" },
  { from: 9060, to: 9069, bank: "Länsförsäkringar Bank" },
  { from: 9100, to: 9109, bank: "Nordnet Bank" },
  { from: 9120, to: 9124, bank: "SEB" },
  { from: 9130, to: 9149, bank: "SEB" },
  { from: 9150, to: 9169, bank: "Skandiabanken" },
  { from: 9170, to: 9179, bank: "Ikano Bank" },
  { from: 9180, to: 9189, bank: "Danske Bank" },
  { from: 9190, to: 9199, bank: "DNB Bank" },
  { from: 9230, to: 9239, bank: "Marginalen Bank" },
  { from: 9250, to: 9259, bank: "SBAB" },
  { from: 9260, to: 9269, bank: "DNB Bank" },
  { from: 9270, to: 9279, bank: "ICA Banken" },
  { from: 9280, to: 9289, bank: "Resurs Bank" },
  { from: 9300, to: 9349, bank: "Swedbank (f.d. Sparbanken Öresund)" },
  { from: 9390, to: 9399, bank: "Landshypotek Bank" },
  { from: 9400, to: 9449, bank: "Forex Bank" },
  { from: 9460, to: 9469, bank: "Santander Consumer Bank" },
  { from: 9470, to: 9479, bank: "BNP Paribas" },
  { from: 9500, to: 9549, bank: "Nordea (Plusgirot)" },
  { from: 9550, to: 9569, bank: "Avanza Bank" },
  { from: 9570, to: 9579, bank: "Sparbanken Syd" },
  { from: 9580, to: 9589, bank: "AION Bank" },
  { from: 9590, to: 9599, bank: "Erik Penser Bank" },
  { from: 9630, to: 9639, bank: "Lån & Spar Bank" },
  { from: 9640, to: 9649, bank: "Nordax Bank" },
  { from: 9660, to: 9669, bank: "Svea Bank" },
  { from: 9670, to: 9679, bank: "JAK Medlemsbank" },
  { from: 9680, to: 9689, bank: "Bluestep Finans" },
  { from: 9700, to: 9709, bank: "Ekobanken" },
  { from: 9710, to: 9719, bank: "Lunar Bank" },
  { from: 9750, to: 9759, bank: "Northmill Bank" },
  { from: 9780, to: 9789, bank: "Klarna Bank" },
  { from: 9880, to: 9889, bank: "Riksgälden" },
  { from: 9890, to: 9899, bank: "Riksgälden" },
  { from: 9960, to: 9969, bank: "Nordea (Plusgirot)" },
];

export type ClearingInfo = {
  bank: string;
  /** Antal siffror clearingnumret ska ha (Swedbank 8xxx har fem). */
  expectedDigits: 4 | 5;
};

/** Slår upp banken från de fyra första siffrorna i ett clearingnummer. */
export function lookupClearing(clearing: string): ClearingInfo | null {
  const digits = clearing.replace(/\D/g, "");
  if (digits.length < 4) return null;
  const n = Number(digits.slice(0, 4));
  const r = RANGES.find((x) => n >= x.from && n <= x.to);
  if (!r) return null;
  return { bank: r.bank, expectedDigits: r.digits ?? 4 };
}

/** Normaliserar ett clearingnummer: bara siffror. Swedbank 8xxx-x behåller fem siffror. */
export function normalizeClearing(clearing: string): string {
  return clearing.replace(/\D/g, "");
}

/** Normaliserar ett kontonummer: bara siffror. */
export function normalizeAccount(account: string): string {
  return account.replace(/\D/g, "");
}
