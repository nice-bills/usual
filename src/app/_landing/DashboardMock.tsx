import { Mark } from "./Logo";
import s from "./landing.module.css";

const WEEK = [["Mon", 38], ["Tue", 62], ["Wed", 24], ["Thu", 80], ["Fri", 46], ["Sat", 30], ["Sun", 55]] as const;

const AGENTS = [
  { name: "claude", rule: "Up to $2, then asks", used: "$2.00", of: "of $3", status: "Active" },
  { name: "codex", rule: "Pays up to $5", used: "$3.60", of: "of $10", status: "Active" },
  { name: "cursor", rule: "Asks every time", used: "Line cut", of: "", status: "Revoked" },
];

const ACTIVITY = [
  { what: "claude paid Café Lumen", when: "2 min ago", amount: "−$1.80" },
  { what: "Refused codex: over its daily line", when: "18 min ago", amount: "$12.00", refused: true },
  { what: "You cut cursor's line", when: "1 h ago", amount: "" },
  { what: "You added to your wallet", when: "Today, 09:12", amount: "+$50.00", plus: true },
];

// An illustrative look inside Usual. Static markup: it is the hero image, not a live view.
export function DashboardMock() {
  return (
    <div className={s.mock} role="img" aria-label="Illustration of the Usual dashboard: a $184.20 wallet, and Claude asking to pay $5.00, over its $2 line, with 43 minutes left to decide.">
      <div className={s.mockCol}>
        <div className={s.mockTop}>
          <span className={s.mockBrand}><Mark className={s.mockMark} />Usual</span>
          <span className={s.chip}>Testnet</span>
          <span className={s.mockAccount}>0x7a…3f21</span>
        </div>

        <div className={s.panel}>
          <p className={s.panelLabel}>Wallet balance</p>
          <p className={s.balance}>$184.20 <span>USDC on Sui</span></p>
          <div className={s.spentRow}>
            <p><span className={s.dim}>Spent today</span> <b>$6.40</b> <span className={s.dim}>of $18 across agents</span></p>
            <div className={s.bars}>
              {WEEK.map(([d, h], k) => <span key={d} className={s.bar} data-today={k === 6}><i style={{ height: `${h}%` }} /><em>{d}</em></span>)}
            </div>
          </div>
        </div>

        <div className={`${s.panel} ${s.request}`}>
          <div className={s.requestHead}>
            <span><b>claude</b> wants to pay</span>
            <span className={s.over}>over $2 line</span>
          </div>
          <p className={s.requestAmount}>$5.00 <span>to Café Lumen</span></p>
          <p className={s.quote}>“Two flat whites and a croissant, for the 9:30.”</p>
          <dl className={s.rows}>
            <div><dt>claude may pay alone</dt><dd>up to $2.00</dd></div>
            <div><dt>Left today</dt><dd>$2.00 of $3.00</dd></div>
            <div><dt>Café Lumen</dt><dd>Paid 6 times before</dd></div>
            <div><dt>Approving</dt><dd>This payment only</dd></div>
          </dl>
          <div className={s.timer}><i /><span>43 min left to decide</span></div>
          <div className={s.requestActions}>
            <span className={s.btnGhost}>Deny</span>
            <span className={s.btnSolid}>Approve with wallet</span>
          </div>
        </div>
      </div>

      <div className={`${s.mockCol} ${s.mockSide}`}>
        <div className={s.panel}>
          <div className={s.panelHead}><b>Agents</b><span className={s.dim}>Lines reset daily</span></div>
          <ul className={s.list}>
            {AGENTS.map((a) => (
              <li key={a.name}>
                <span className={s.avatar}>{a.name[0]}</span>
                <span className={s.listMain}><b>{a.name}</b><span className={s.dim}>{a.rule}</span></span>
                <span className={s.listEnd}><b>{a.used}</b> <span className={s.dim}>{a.of}</span></span>
                <span className={s.status} data-off={a.status === "Revoked"}>{a.status}</span>
              </li>
            ))}
            <li className={s.addRow}><span className={s.avatar}>+</span><span className={s.listMain}><b>Add an agent</b><span className={s.dim}>Connect any MCP client</span></span></li>
          </ul>
        </div>

        <div className={s.panel}>
          <div className={s.panelHead}><b>Activity</b><span className={s.dim}>On chain</span></div>
          <ul className={s.list}>
            {ACTIVITY.map((a) => (
              <li key={a.what}>
                <span className={s.listMain}><b className={s.normal}>{a.what}</b><span className={s.dim}>{a.when}</span></span>
                <span className={s.amount} data-refused={!!a.refused} data-plus={!!a.plus}>{a.amount}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
