"use client";
import qrcode from "qrcode-generator";
import { useState } from "react";

/** Your wallet is the account: anyone, or any exchange, can send to this address on Sui. */
export function AddMoney({ address, symbol, network }: { address: string; symbol: string; network: string }) {
  const [copied, setCopied] = useState(false);
  const qr = qrcode(0, "M");
  qr.addData(address);
  qr.make();
  return (
    <section>
      <h3>Add money</h3>
      <p className="fine">Send {symbol} on Sui {network} to your wallet. It stays yours: Usual only spends inside limits you sign.</p>
      <div className="qr" role="img" aria-label="QR code of your wallet address" dangerouslySetInnerHTML={{ __html: qr.createSvgTag({ cellSize: 6, margin: 0, scalable: true }) }} />
      <button className="row-button" onClick={() => navigator.clipboard.writeText(address).then(() => setCopied(true))}>
        {copied ? "Copied" : `${address.slice(0, 8)}…${address.slice(-6)}`}
      </button>
    </section>
  );
}
