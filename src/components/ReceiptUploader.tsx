"use client";

import { useRef, useState, type DragEvent } from "react";
import type { FormFile } from "@/lib/expense-types";
import { MAX_FILES_PER_RECEIPT } from "@/lib/config";

type Props = {
  receiptId: string;
  files: FormFile[];
  onChange: (files: FormFile[]) => void;
  disabled?: boolean;
};

type Pending = { key: string; name: string; progress: "laddar upp" | "fel"; error?: string };

export function ReceiptUploader({ receiptId, files, onChange, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [over, setOver] = useState(false);

  const upload = async (list: FileList | File[]) => {
    const arr = Array.from(list);
    const room = MAX_FILES_PER_RECEIPT - files.length;
    if (arr.length > room) {
      alert(`Du kan ladda upp högst ${MAX_FILES_PER_RECEIPT} filer per kvitto.`);
      arr.splice(room);
    }
    let current = files;
    for (const file of arr) {
      const key = `${Date.now()}-${Math.random()}`;
      setPending((p) => [...p, { key, name: file.name, progress: "laddar upp" }]);
      try {
        const fd = new FormData();
        fd.append("receiptId", receiptId);
        fd.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Uppladdningen misslyckades");
        current = [...current, json as FormFile];
        onChange(current);
        setPending((p) => p.filter((x) => x.key !== key));
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Uppladdningen misslyckades";
        setPending((p) => p.map((x) => (x.key === key ? { ...x, progress: "fel", error: msg } : x)));
      }
    }
  };

  const remove = async (id: string) => {
    const res = await fetch(`/api/files/${id}`, { method: "DELETE" });
    if (!res.ok) {
      alert("Filen kunde inte tas bort");
      return;
    }
    onChange(files.filter((f) => f.id !== id));
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setOver(false);
    if (disabled) return;
    if (e.dataTransfer.files?.length) void upload(e.dataTransfer.files);
  };

  return (
    <div>
      <div
        className={`dropzone${over ? " over" : ""}`}
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
      >
        <strong>Ladda upp kvitto</strong>
        <div className="small muted">Dra hit filen eller klicka för att välja. JPG, PNG, HEIC eller PDF, max 20 MB.</div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.heic,.heif,application/pdf"
          multiple
          onChange={(e) => {
            if (e.target.files?.length) void upload(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => {
            if (e.target.files?.length) void upload(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      <div className="btn-row" style={{ marginTop: "0.5rem" }}>
        <button type="button" className="btn small" disabled={disabled} onClick={() => cameraRef.current?.click()}>
          📷 Fota kvitto
        </button>
        <button type="button" className="btn small" disabled={disabled} onClick={() => inputRef.current?.click()}>
          Välj fil
        </button>
      </div>

      {(files.length > 0 || pending.length > 0) && (
        <div className="thumbs">
          {files.map((f) => (
            <div className="thumb" key={f.id}>
              {f.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.previewUrl} alt={f.originalName} />
              ) : (
                <div className="pdf">PDF{f.pageCount ? ` · ${f.pageCount} s` : ""}</div>
              )}
              {f.lowResolution && <div className="warn">Låg upplösning</div>}
              <div className="name" title={f.originalName}>
                {f.originalName}
              </div>
              {!disabled && (
                <button type="button" className="remove" title="Ta bort" onClick={() => remove(f.id)}>
                  ×
                </button>
              )}
            </div>
          ))}
          {pending.map((p) => (
            <div className="thumb uploading" key={p.key}>
              <div className="pdf" style={{ color: p.progress === "fel" ? "#c62828" : "#795548", fontSize: "0.8rem", padding: "0.5rem", textAlign: "center" }}>
                {p.progress === "fel" ? p.error : "Laddar upp…"}
              </div>
              <div className="name">{p.name}</div>
              {p.progress === "fel" && (
                <button type="button" className="remove" onClick={() => setPending((x) => x.filter((y) => y.key !== p.key))}>
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {files.some((f) => f.lowResolution) && (
        <div className="alert warn small" style={{ marginTop: "0.6rem" }}>
          <p>
            En bild har låg upplösning och kan vara svår att läsa. Kontrollera att belopp, datum och butik syns
            tydligt, annars fota om kvittot.
          </p>
        </div>
      )}
    </div>
  );
}
