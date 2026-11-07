"use client";
import { AgentCard } from "../../AgentCard";
import { MockApp } from "../_kit/MockApp";
import s from "./ledger.module.css";

// Banknote engraving, drawn once: lobed rings like the guilloche on a cheque.
function rosette(radius: number, lobes: number, depth: number) {
  const steps = 360;
  const pts = Array.from({ length: steps }, (_, i) => {
    const t = (i / steps) * Math.PI * 2;
    const r = radius + depth * Math.sin(lobes * t);
    return `${(r * Math.cos(t)).toFixed(1)} ${(r * Math.sin(t)).toFixed(1)}`;
  });
  return `M${pts.join("L")}Z`;
}
const BIG = Array.from({ length: 14 }, (_, i) => rosette(120 + i * 26, 18, 10 + i * 1.4));
const SMALL = Array.from({ length: 9 }, (_, i) => rosette(60 + i * 18, 11, 6 + i));

export default function LedgerMock() {
  return (
    <MockApp
      skin={s}
      name="Ledger"
      line={<div className={s.lineWrap}><AgentCard score={72} clean={6} line={{ category: "groceries", amount: "40", period: "week" }} suspended={false} symbol="USDC" /></div>}
      background={() => (
        <>
          <div className={s.rules} />
          <svg className={s.engrave} viewBox="-600 -600 1200 1200" aria-hidden="true">
            <g className={s.spinA}>{BIG.map((d) => <path key={d} d={d} />)}</g>
          </svg>
          <svg className={s.engraveSmall} viewBox="-260 -260 520 520" aria-hidden="true">
            <g className={s.spinB}>{SMALL.map((d) => <path key={d} d={d} />)}</g>
          </svg>
        </>
      )}
    />
  );
}
