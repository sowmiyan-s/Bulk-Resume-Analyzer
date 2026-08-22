type Props = { value: number; label?: string; size?: number; className?: string };

function toneFor(value: number) {
  if (value >= 75)
    return {
      stroke: "var(--color-success)",
      text: "text-success",
      badge: "border-success/30 bg-success/10 text-success",
    };
  if (value >= 55)
    return {
      stroke: "var(--color-warning)",
      text: "text-warning",
      badge: "border-warning/30 bg-warning/10 text-warning",
    };
  return {
    stroke: "var(--color-destructive)",
    text: "text-destructive",
    badge: "border-destructive/30 bg-destructive/10 text-destructive",
  };
}

export function ScoreRing({ value, label = "ATS SCORE", size = 76, className = "" }: Props) {
  const stroke = Math.max(5, Math.round(size * 0.085));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));
  const offset = circumference * (1 - clamped / 100);
  const tone = toneFor(clamped);

  return (
    <div className={`flex flex-col items-center justify-center shrink-0 ${className}`}>
      <div
        className="relative shrink-0 flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            className="stroke-secondary/80"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            stroke={tone.stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 600ms cubic-bezier(0.4, 0, 0.2, 1)" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span
            className="font-mono font-extrabold tracking-tight leading-none"
            style={{ fontSize: `${Math.round(size * 0.34)}px`, color: tone.stroke }}
          >
            {Math.round(clamped)}
          </span>
        </div>
      </div>
      {label && (
        <span className="mt-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground text-center">
          {label}
        </span>
      )}
    </div>
  );
}
