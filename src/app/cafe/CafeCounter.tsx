"use client";
// The merchant's side of the demo: a counter screen with a payment request to scan or open.
import qrcode from "qrcode-generator";
import { useState, useSyncExternalStore } from "react";

const ITEMS = [
  { id: "flat-white", label: "Flat white" },
  { id: "croissant", label: "Croissant" },
  { id: "breakfast", label: "Breakfast set" },
];

const useOrigin = () => useSyncExternalStore(() => () => {}, () => window.location.origin, () => "");

export function CafeCounter() {
  const [item, setItem] = useState(ITEMS[0]);
  const origin = useOrigin();
  const href = `${origin}/?request=${item.id}`;
  const qr = qrcode(0, "M");
  qr.addData(href);
  qr.make();
  return (
    <main className="app counter">
      <h1>Café counter</h1>
      <div className="choices" role="group" aria-label="Choose an item">
        {ITEMS.map((i) => (
          <button key={i.id} className="row-button" aria-pressed={i.id === item.id} onClick={() => setItem(i)}>{i.label}</button>
        ))}
      </div>
      {origin && <div className="qr" role="img" aria-label={`QR code to pay for ${item.label}`} dangerouslySetInnerHTML={{ __html: qr.createSvgTag({ cellSize: 6, margin: 0, scalable: true }) }} />}
      <a className="approve as-link" href={href}>Open in Usual</a>
    </main>
  );
}
