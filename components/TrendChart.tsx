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
 * Dashboard revenue chart: compact SVG with bars for daily totals plus a smooth
 * trend line. Uses attributes/classes only so it stays CSP-safe.
 */
export default function TrendChart({ points }: { points: Point[] }) {
  const W = 760;
  const H = 280;
  const padX = 34;
  const padTop = 34;
  const padBottom = 54;
  const max = Math.max(...points.map((p) => p.amount), 1);
  const innerW = W - padX * 2;
  const innerH = H - padTop - padBottom;
  const step = points.length > 1 ? innerW / (points.length - 1) : innerW;
  const barW = Math.min(58, Math.max(28, step * 0.42));
  const baseY = padTop + innerH;

  const xy = points.map((p, i) => {
    const x = padX + step * i;
    const y = padTop + innerH * (1 - p.amount / max);
    return { ...p, x, y, barH: Math.max(2, baseY - y) };
  });

  const line = xy.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const area = `${line} L${xy[xy.length - 1].x.toFixed(1)} ${baseY} L${xy[0].x.toFixed(1)} ${baseY} Z`;
  const peak = xy.reduce((a, b) => (b.amount > a.amount ? b : a), xy[0]);
  const grid = [0, 0.33, 0.66, 1].map((t) => ({ y: padTop + innerH * t, value: max * (1 - t) }));

  return (
    <div className="trend-chart trend-chart-redesign">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Seven-day revenue trend">
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" className="trend-stop-top" />
            <stop offset="100%" className="trend-stop-bottom" />
          </linearGradient>
          <linearGradient id="trendBarFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" className="trend-bar-stop-top" />
            <stop offset="100%" className="trend-bar-stop-bottom" />
          </linearGradient>
        </defs>

        {grid.map((g, i) => (
          <g key={i}>
            <line className="trend-grid" x1={padX} y1={g.y} x2={W - padX} y2={g.y} />
            <text className="trend-y" x={padX - 10} y={g.y + 4} textAnchor="end">
              {compact(g.value)}
            </text>
          </g>
        ))}

        {xy.map((p) => (
          <rect
            key={p.day}
            className={`trend-bar${p === peak ? ' peak' : ''}`}
            x={p.x - barW / 2}
            y={baseY - p.barH}
            width={barW}
            height={p.barH}
            rx="12"
            fill="url(#trendBarFill)"
          />
        ))}

        <path className="trend-area" d={area} fill="url(#trendFill)" />
        <path className="trend-line" d={line} fill="none" vectorEffect="non-scaling-stroke" />

        {xy.map((p) => (
          <g key={`${p.day}-dot`}>
            <circle className={`trend-dot${p === peak ? ' peak' : ''}`} cx={p.x} cy={p.y} r={p === peak ? 6 : 4} />
            <text className="trend-x" x={p.x} y={H - 16} textAnchor="middle">
              {label(p.day)}
            </text>
            <text className="trend-day-amount" x={p.x} y={H - 34} textAnchor="middle">
              {compact(p.amount)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
