// 財務總覽的圖：伺服器端 SVG，不加圖表套件（2026-11-03 Jesse）。
// 顏色沿用 globals.css 的 design tokens（收入 --success、支出 --danger-fin，與整個財務區的 pos/neg 一致；
// 品牌色 --brand 給月訂閱、--ink-2 給年訂閱）。這組 token 彩度偏低，所以每張圖都有圖例、直接標籤、長條間距，
// 下面再附數字表，不靠顏色辨識。
import type { MonthRow } from "@/lib/finance/calc";
import type { MembershipMonth } from "@/lib/finance/members";

const fmt = (n: number) => Math.round(n).toLocaleString();
const short = (n: number) => (Math.abs(n) >= 10000 ? `${(n / 10000).toFixed(n % 10000 === 0 ? 0 : 1)} 萬` : fmt(n));

/** 好看的刻度上限：取 1/2/5 × 10^k 的倍數。 */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * p) return m * p;
  return 10 * p;
}

/** 每月收入／支出雙長條＋淨利折線（同一個軸，單位都是元）。 */
export function MonthlyChart({ rows }: { rows: MonthRow[] }) {
  const W = 640, H = 240, padL = 52, padR = 12, padT = 16, padB = 28;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const maxAbs = Math.max(...rows.map((r) => Math.max(r.income, r.expense, Math.abs(r.net))), 1);
  const top = niceMax(maxAbs);
  const minNet = Math.min(0, ...rows.map((r) => r.net));
  const bottom = minNet < 0 ? -niceMax(-minNet) : 0;
  const y = (v: number) => padT + ((top - v) / (top - bottom)) * innerH;
  const slot = innerW / 12;
  const barW = Math.max(6, (slot - 10) / 2);
  const ticks = [bottom, bottom / 2, 0, top / 2, top].filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b);
  const netPts = rows.map((r, i) => `${(padL + slot * i + slot / 2).toFixed(1)},${y(r.net).toFixed(1)}`).join(" ");
  const hasData = rows.some((r) => r.income || r.expense);
  return (
    <figure className="chart">
      <div className="chart-legend" aria-hidden="true">
        <span><i style={{ background: "var(--success)" }} />收入</span>
        <span><i style={{ background: "var(--danger-fin)" }} />支出</span>
        <span><i className="line" style={{ background: "var(--ink)" }} />淨利</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="每月收入、支出與淨利長條圖" className="chart-svg">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--line)" : "var(--line-2)"} strokeWidth={t === 0 ? 1.5 : 1} />
            <text x={padL - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--ink-3)">{short(t)}</text>
          </g>
        ))}
        {rows.map((r, i) => {
          const x0 = padL + slot * i + (slot - barW * 2 - 2) / 2;
          return (
            <g key={r.month}>
              {r.income > 0 ? <rect x={x0} y={y(r.income)} width={barW} height={Math.max(1, y(0) - y(r.income))} rx={2} fill="var(--success)" /> : null}
              {r.expense > 0 ? <rect x={x0 + barW + 2} y={y(r.expense)} width={barW} height={Math.max(1, y(0) - y(r.expense))} rx={2} fill="var(--danger-fin)" /> : null}
              <text x={padL + slot * i + slot / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--ink-2)">{r.month}月</text>
            </g>
          );
        })}
        {hasData ? <polyline points={netPts} fill="none" stroke="var(--ink)" strokeWidth={2} strokeLinejoin="round" /> : null}
        {hasData ? rows.map((r, i) => (
          <circle key={r.month} cx={padL + slot * i + slot / 2} cy={y(r.net)} r={3.5} fill="var(--surface)" stroke="var(--ink)" strokeWidth={2}><title>{r.month} 月淨利 {fmt(r.net)}</title></circle>
        )) : null}
      </svg>
      <details className="chart-table">
        <summary>看每月數字</summary>
        <table className="table mini">
          <thead><tr><th>月</th><th>收入</th><th>支出</th><th>淨利</th></tr></thead>
          <tbody>
            {rows.filter((r) => r.income || r.expense).map((r) => (
              <tr key={r.month}><td>{r.month} 月</td><td className="pos">{fmt(r.income)}</td><td className="neg">{fmt(r.expense)}</td><td className={r.net < 0 ? "neg" : ""}>{fmt(r.net)}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

const PART_COLORS: Record<string, string> = { 票房: "var(--brand)", 會員: "var(--success)", 周邊: "var(--warning)", 贊助: "var(--ink-2)", 其他: "var(--ink-3)" };

/** 收入組成：一條堆疊橫條＋逐項金額與百分比。 */
export function CompositionChart({ parts, total }: { parts: { name: string; amount: number; pct: number }[]; total: number }) {
  // 每段的起點 = 前面各段百分比的累計
  const offsets = parts.map((_, i) => parts.slice(0, i).reduce((s, q) => s + q.pct, 0));
  return (
    <figure className="chart">
      <div className="stack-bar" role="img" aria-label="收入組成堆疊條">
        {parts.map((p, i) => (
          <i key={p.name} style={{ left: `${offsets[i]}%`, width: `calc(${p.pct}% - 2px)`, background: PART_COLORS[p.name] ?? "var(--ink-3)" }} title={`${p.name} ${fmt(p.amount)}（${p.pct.toFixed(1)}%）`} />
        ))}
      </div>
      <ul className="part-list">
        {parts.map((p) => (
          <li key={p.name}>
            <i style={{ background: PART_COLORS[p.name] ?? "var(--ink-3)" }} />
            <span>{p.name}</span>
            <b>{fmt(p.amount)}</b>
            <small>{p.pct.toFixed(1)}%</small>
          </li>
        ))}
        <li className="total"><i /><span>合計</span><b>{fmt(total)}</b><small /></li>
      </ul>
    </figure>
  );
}

/** 付費會員：月訂閱與年訂閱有效各一根（分開、不堆疊），下附表。 */
export function MembershipChart({ rows, partialMonth }: { rows: MembershipMonth[]; partialMonth: string | null }) {
  const W = 640, H = 220, padL = 36, padR = 12, padT = 16, padB = 28;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const top = niceMax(Math.max(1, ...rows.map((r) => Math.max(r.monthly, r.annualActive))));
  const y = (v: number) => padT + ((top - v) / top) * innerH;
  const slot = innerW / Math.max(rows.length, 1);
  const barW = Math.max(4, Math.min(22, (slot - 8) / 2));
  const label = (m: string) => `${Number(m.slice(5, 7))}月${m === partialMonth ? "*" : ""}`;
  return (
    <figure className="chart">
      <div className="chart-legend" aria-hidden="true">
        <span><i style={{ background: "var(--brand)" }} />月訂閱（當月成功扣款）</span>
        <span><i style={{ background: "var(--ink-2)" }} />年訂閱有效（12 個月內扣款）</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="每月付費會員扣款數長條圖" className="chart-svg">
        {[0, top / 2, top].map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--line)" : "var(--line-2)"} />
            <text x={padL - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--ink-3)">{t}</text>
          </g>
        ))}
        {rows.map((r, i) => {
          const x0 = padL + slot * i + (slot - barW * 2 - 2) / 2;
          return (
            <g key={r.month}>
              <rect x={x0} y={y(r.monthly)} width={barW} height={Math.max(0, y(0) - y(r.monthly))} rx={2} fill="var(--brand)"><title>{label(r.month)} 月訂閱 {r.monthly}</title></rect>
              <rect x={x0 + barW + 2} y={y(r.annualActive)} width={barW} height={Math.max(0, y(0) - y(r.annualActive))} rx={2} fill="var(--ink-2)"><title>{label(r.month)} 年訂閱有效 {r.annualActive}</title></rect>
              {rows.length <= 14 ? <text x={padL + slot * i + slot / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--ink-2)">{label(r.month)}</text> : null}
            </g>
          );
        })}
      </svg>
      <div className="table-wrap flat">
        <table className="table mini">
          <thead><tr><th>月份</th><th>月訂閱</th><th>年訂閱有效</th><th>新增年訂閱</th><th>合計</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.month}>
                <td>{r.month.slice(0, 4)}/{label(r.month)}</td><td>{r.monthly}</td><td>{r.annualActive}</td><td>{r.annualNew}</td>
                <td>{r.month === partialMonth ? "—" : r.monthly + r.annualActive}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
