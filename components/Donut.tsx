interface Segment {
  label: string;
  value: number;
  className: string;
}

function money(n: number): string {
  return Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

/**
 * Donut chart built from stacked stroke-dasharray rings. Geometry only, no
 * inline styles (CSP-safe). `centerLabel`/`centerValue` fill the hole.
 */
export default function Donut({
  segments,
  centerLabel,
  centerValue
}: {
  segments: Segment[];
  centerLabel: string;
  centerValue: string;
}) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const r = 60;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="donut-chart">
      <div className="donut-ring">
        <svg viewBox="0 0 160 160" role="img" aria-label="Payment mode breakdown">
          <g className="donut-rings">
            <circle className="donut-track" cx="80" cy="80" r={r} fill="none" />
            {total > 0 &&
              segments.map((s) => {
                const len = (s.value / total) * c;
                const dash = `${len} ${c - len}`;
                const el = (
                  <circle
                    key={s.label}
                    className={`donut-seg ${s.className}`}
                    cx="80"
                    cy="80"
                    r={r}
                    fill="none"
                    strokeDasharray={dash}
                    strokeDashoffset={-offset}
                    strokeLinecap="butt"
                  />
                );
                offset += len;
                return el;
              })}
          </g>
          <text className="donut-center-value" x="80" y="76" textAnchor="middle">
            {centerValue}
          </text>
          <text className="donut-center-label" x="80" y="96" textAnchor="middle">
            {centerLabel}
          </text>
        </svg>
      </div>
      <ul className="donut-legend">
        {segments.map((s) => {
          const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
          return (
            <li key={s.label}>
              <span className={`legend-dot ${s.className}`} aria-hidden="true" />
              <span className="legend-label">{s.label}</span>
              <span className="legend-value">
                ₹{money(s.value)} <small>{pct}%</small>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
