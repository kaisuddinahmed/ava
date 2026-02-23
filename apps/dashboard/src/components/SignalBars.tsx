import type { MSWIMSignals } from "../types";

interface Props {
  signals: MSWIMSignals;
}

const SIGNAL_KEYS: { key: keyof MSWIMSignals; label: string; color: string }[] = [
  { key: "intent", label: "INT", color: "#59b8e6" },
  { key: "friction", label: "FRI", color: "#ff9d65" },
  { key: "clarity", label: "CLR", color: "#35d3a1" },
  { key: "receptivity", label: "REC", color: "#f0c75e" },
  { key: "value", label: "VAL", color: "#c888e5" },
];

export function SignalBars({ signals }: Props) {
  return (
    <div className="signal-bars">
      {SIGNAL_KEYS.map(({ key, label, color }) => {
        const val = signals[key] ?? 0;
        const pct = Math.min(100, Math.max(0, val));
        return (
          <div className="signal-bar-item" key={key}>
            <div className="bar-value">{Math.round(val)}</div>
            <div className="bar-track">
              <div
                className="bar-fill"
                style={{ height: `${pct}%`, background: color }}
              />
            </div>
            <div className="bar-label">{label}</div>
          </div>
        );
      })}
    </div>
  );
}
