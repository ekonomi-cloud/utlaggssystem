// Typer som delas mellan server och klient (inga server-only-importer här).

export type FormFile = {
  id: string;
  originalName: string;
  mimeType: string;
  pageCount: number | null;
  previewUrl: string | null;
  lowResolution?: boolean;
};

export type FormReceipt = {
  id: string;
  /** Belopp som användaren skrivit, t.ex. "249,90". */
  amount: string;
  /** Kvittots datum som ÅÅÅÅ-MM-DD. Varje kvitto har sitt eget. */
  date: string;
  note: string;
  files: FormFile[];
};

export type FormState = {
  committee: string;
  committeeOther: string;
  title: string;
  description: string;
  payeeName: string;
  payeeEmail: string;
  clearing: string;
  bankName: string;
  accountNumber: string;
  receipts: FormReceipt[];
  signatureData: string;
  attest: boolean;
};

/** Det som skickas från formuläret till servern. */
export type FormPayload = Omit<FormState, "receipts"> & {
  receipts: { id: string; amountOre: number | null; date: string; note: string }[];
};

export type ActionResult =
  | { ok: true }
  | { ok: false; errors: Record<string, string>; message?: string };
