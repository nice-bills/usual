"use client";
import { useEffect, useRef, useState } from "react";
import { addressIn } from "./qr";

/** Point the camera at someone's wallet QR. The stream stops the moment this closes. */
export function Scanner({ name, onAddress, onClose }: { name: string; onAddress: (address: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [problem, setProblem] = useState("");
  const [wrongCode, setWrongCode] = useState(false);

  useEffect(() => {
    let stream: MediaStream | undefined;
    let frame = 0;
    let stopped = false;
    const canvas = document.createElement("canvas");
    (async () => {
      const { default: jsQR } = await import("jsqr");
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      if (stopped) return stream.getTracks().forEach((t) => t.stop());
      const v = video.current!;
      v.srcObject = stream;
      await v.play();
      const read = () => {
        if (stopped) return;
        if (v.videoWidth) {
          canvas.width = v.videoWidth;
          canvas.height = v.videoHeight;
          const context = canvas.getContext("2d", { willReadFrequently: true })!;
          context.drawImage(v, 0, 0);
          const code = jsQR(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
          const address = code && addressIn(code.data);
          if (address) return onAddress(address);
          if (code) setWrongCode(true);
        }
        frame = requestAnimationFrame(read);
      };
      read();
    })().catch(() => setProblem("I can't use the camera. Allow it, or paste the address instead."));
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onAddress]);

  return (
    <div className="scanner" role="dialog" aria-label={`Scan ${name}'s wallet QR`}>
      <video ref={video} muted playsInline aria-hidden="true" />
      <div className="scanner-frame" aria-hidden="true" />
      <p className="say" role="status">{problem || (wrongCode ? "That QR isn't a wallet address." : `Point at ${name}'s wallet QR`)}</p>
      <button className="ghost" onClick={onClose}>Close</button>
    </div>
  );
}
