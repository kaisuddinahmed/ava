import type { SessionSummary } from "../types";
import { fmtTime } from "../lib/format";

interface Props {
  sessions: SessionSummary[];
  selected: string | null;
  onSelect: (id: string | null) => void;
}

export function SessionBar({ sessions, selected, onSelect }: Props) {
  return (
    <div className="session-bar">
      <span className="session-label">Session</span>
      <select
        value={selected ?? "__all__"}
        onChange={(e) =>
          onSelect(e.target.value === "__all__" ? null : e.target.value)
        }
      >
        <option value="__all__">All sessions ({sessions.length})</option>
        {sessions.map((s) => (
          <option key={s.id} value={s.id}>
            {s.id.slice(0, 8)}... &mdash; {s.status} &mdash; {fmtTime(s.startedAt)}
            {s.cartValue > 0 ? ` — $${s.cartValue.toFixed(2)}` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
