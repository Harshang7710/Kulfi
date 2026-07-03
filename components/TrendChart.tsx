interface Point {
  day: string;
  amount: number;
}

function compact(n: number): string {
  if (n >= 100000) return `₹${(n / 100000).toFixed(n >= 1000000 ? 0 : 1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return `₹${Math.round(n)}`;
}

function label(day: string): string {
  const d = new Date(`${day}T00:00:00`);
  return d.toLocaleDateString('en-IN', { weekday: 'short' });
}

/**
 * Pure-SVG revenue trend (area + line). Uses geometry/presentation attributes
 * only — no inline `style` — so it stays within the app's strict CSP.
 */
export default function TrendChart({ points }: { points: Point[] }) {
  const W = 720;
  const H = 240;
  const padX = 18;
  const padTop = 22;
  const padBottom = 34;
  const max = Math.max(...points.map((p) => p.amount), 1);
  const innerW = W - padX * 2;
  const innerH = H - padTop - padBottom;
  const step = points.length > 1 ? innerW / (points.length - 1) : 0;

  const xy = points.map((p, i) => {
    const x = padX + step * i;
    const y = padTop + innerH * (1 - p.amount / max);
    return { ...p, x, y };
  });

  const line = xy.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const area = `${line} L${xy[xy.length - 1].x.toFixed(1)} ${padTop + innerH} L${xy[0].x.toFixed(1)} ${padTop + innerH} Z`;
  const peak = xy.reduce((a, b) => (b.amount > a.amount ? b : a), xy[0]);
  const gridYs = [0, 0.5, 1].map((t) => padTop + innerH * t);

  return (
    <div className="trend-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Seven-day revenue trend">
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" className="trend-stop-top" />
            <stop offset="100%" className="trend-stop-bottom" />
          </linearGradient>
        </defs>

        {gridYs.map((y, i) => (
          <line key={i} className="trend-grid" x1={padX} y1={y} x2={W - padX} y2={y} />
        ))}

        <path className="trend-area" d={area} fill="url(#trendFill)" />
        <path className="trend-line" d={line} fill="none" vectorEffect="non-scaling-stroke" />

        {xy.map((p, i) => (
          <g key={i}>
            <circle className={`trend-dot${p === peak ? ' peak' : ''}`} cx={p.x} cy={p.y} r={p === peak ? 5 : 3.5} />
            <text className="trend-x" x={p.x} y={H - 12} textAnchor="middle">
              {label(p.day)}
            </text>
          </g>
        ))}

        <text className="trend-peak-label" x={peak.x} y={Math.max(peak.y - 12, 14)} textAnchor="middle">
          {compact(peak.amount)}
        </text>
      </svg>
    </div>
  );
}
