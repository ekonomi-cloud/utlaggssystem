"use client";

import { useEffect, useRef, useState } from "react";
import SignaturePadLib from "signature_pad";

type Props = {
  value: string;
  onChange: (dataUrl: string) => void;
  disabled?: boolean;
};

/** Minsta antal punkter för att en signatur ska räknas som riktig (inte bara en prick). */
const MIN_POINTS = 25;

/**
 * Beskär bilden till själva namnteckningen.
 *
 * Signaturrutan är bred och mestadels tom, och sparar man hela rutan blir
 * resultatet en stor bild där bläcket ligger i ett hörn. Det ser fel ut i
 * förhandsgranskningen och gör signaturen onödigt liten på blanketten.
 * Här letas ytterkanterna på det som faktiskt ritats upp, med lite luft runt om.
 */
function trimToInk(canvas: HTMLCanvasElement): string {
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas.toDataURL("image/png");
  const { width, height } = canvas;
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, width, height).data;
  } catch {
    return canvas.toDataURL("image/png");
  }

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let yy = 0; yy < height; yy++) {
    for (let xx = 0; xx < width; xx++) {
      // Alfakanalen: allt som inte är genomskinligt räknas som bläck.
      if (data[(yy * width + xx) * 4 + 3] > 12) {
        if (xx < minX) minX = xx;
        if (xx > maxX) maxX = xx;
        if (yy < minY) minY = yy;
        if (yy > maxY) maxY = yy;
      }
    }
  }
  if (maxX < 0) return canvas.toDataURL("image/png"); // inget ritat

  const padding = Math.round(Math.max(width, height) * 0.02) + 6;
  const x = Math.max(0, minX - padding);
  const y = Math.max(0, minY - padding);
  const w = Math.min(width, maxX + padding) - x;
  const h = Math.min(height, maxY + padding) - y;

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const octx = out.getContext("2d");
  if (!octx) return canvas.toDataURL("image/png");
  octx.drawImage(canvas, x, y, w, h, 0, 0, w, h);
  return out.toDataURL("image/png");
}

export function SignaturePad({ value, onChange, disabled }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePadLib | null>(null);
  const [empty, setEmpty] = useState(!value);
  const [strokes, setStrokes] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pad = new SignaturePadLib(canvas, {
      penColor: "#1a1a1a",
      minWidth: 1,
      maxWidth: 2.5,
      backgroundColor: "rgba(0,0,0,0)",
    });
    padRef.current = pad;

    const resize = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const data = pad.toData();
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext("2d")?.scale(ratio, ratio);
      pad.clear();
      if (data.length) pad.fromData(data);
    };
    resize();
    window.addEventListener("resize", resize);

    if (value) {
      pad.fromDataURL(value, { ratio: 1 }).catch(() => {});
    }

    const publish = () => {
      const data = pad.toData();
      const points = data.reduce((n, s) => n + s.points.length, 0);
      setStrokes(data.length);
      if (points < MIN_POINTS) {
        setEmpty(true);
        onChange("");
        return;
      }
      setEmpty(false);
      onChange(trimToInk(canvas));
    };
    pad.addEventListener("endStroke", publish);
    if (disabled) pad.off();

    return () => {
      pad.removeEventListener("endStroke", publish);
      window.removeEventListener("resize", resize);
      pad.off();
    };
    // Vi vill bara initiera en gång.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (disabled) padRef.current?.off();
    else padRef.current?.on();
  }, [disabled]);

  const republish = () => {
    const pad = padRef.current;
    const canvas = canvasRef.current;
    if (!pad || !canvas) return;
    const data = pad.toData();
    const points = data.reduce((n, s) => n + s.points.length, 0);
    setStrokes(data.length);
    if (points < MIN_POINTS) {
      setEmpty(true);
      onChange("");
    } else {
      setEmpty(false);
      onChange(trimToInk(canvas));
    }
  };

  /** Ångrar det senaste penseldraget. */
  const undo = () => {
    const pad = padRef.current;
    if (!pad) return;
    const data = pad.toData();
    if (data.length === 0) return;
    data.pop();
    pad.clear();
    if (data.length) pad.fromData(data);
    republish();
  };

  const clear = () => {
    padRef.current?.clear();
    setStrokes(0);
    setEmpty(true);
    onChange("");
  };

  return (
    <div>
      <div className="signature-box">
        <canvas ref={canvasRef} aria-label="Signaturruta" />
        <div className="line" />
        {empty && strokes === 0 && <div className="hint">Signera här med fingret eller musen</div>}
      </div>
      <div className="btn-row" style={{ marginTop: "0.5rem" }}>
        <button type="button" className="btn small" onClick={undo} disabled={disabled || strokes === 0}>
          ↶ Ångra senaste draget
        </button>
        <button type="button" className="btn small ghost" onClick={clear} disabled={disabled || strokes === 0}>
          Rensa allt
        </button>
        {!empty && <span className="ok">Signatur registrerad</span>}
        {empty && strokes > 0 && <span className="muted small">Fortsätt skriva, signaturen är för kort.</span>}
      </div>
    </div>
  );
}
