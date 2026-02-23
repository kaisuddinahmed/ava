import { useMemo } from "react";
import type { InterventionData, OverviewAnalytics } from "../types";
import { fmtTime, fmtNum, fmtPct, fmtScore } from "../lib/format";

interface Props {
  interventions: InterventionData[];
  selectedSession: string | null;
  overview: OverviewAnalytics | null;
}

export function InterveneTab({ interventions, selectedSession, overview }: Props) {
  const filtered = useMemo(
    () =>
      selectedSession
        ? interventions.filter((i) => i.session_id === selectedSession)
        : interventions,
    [interventions, selectedSession]
  );

  const eff = overview?.interventionEfficiency;

  // Local outcome counts from real-time data
  const outcomeCounts = useMemo(() => {
    const counts = { converted: 0, delivered: 0, dismissed: 0, ignored: 0, sent: 0 };
    for (const i of filtered) {
      const s = i.status ?? "sent";
      if (s in counts) counts[s as keyof typeof counts]++;
    }
    return counts;
  }, [filtered]);

  // Type distribution
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const i of filtered) {
      counts[i.type] = (counts[i.type] ?? 0) + 1;
    }
    return counts;
  }, [filtered]);

  const totalOutcomes =
    (eff?.fired ?? 0) ||
    Object.values(outcomeCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="tab-content">
      {/* ── Overview Metrics ────────────────────────────────── */}
      <div className="grid-4" style={{ marginBottom: 12 }}>
        <div className="metric-box">
          <div className="label">Interventions</div>
          <div className="value">{fmtNum(overview?.totalInterventions ?? filtered.length)}</div>
          <div className="sub">fired</div>
        </div>
        <div className="metric-box">
          <div className="label">Conversion Rate</div>
          <div className="value accent">
            {eff ? fmtPct(eff.conversionRate) : filtered.length > 0
              ? fmtPct(outcomeCounts.converted / Math.max(1, totalOutcomes))
              : "—"}
          </div>
          <div className="sub">{eff ? `${eff.converted} converted` : "target"}</div>
        </div>
        <div className="metric-box">
          <div className="label">Dismissal Rate</div>
          <div className="value warn">
            {eff ? fmtPct(eff.dismissalRate) : filtered.length > 0
              ? fmtPct(outcomeCounts.dismissed / Math.max(1, totalOutcomes))
              : "—"}
          </div>
          <div className="sub">{eff ? `${eff.dismissed} dismissed` : "monitor"}</div>
        </div>
        <div className="metric-box">
          <div className="label">Delivered</div>
          <div className="value">{fmtNum(eff?.delivered ?? outcomeCounts.delivered)}</div>
          <div className="sub">reached user</div>
        </div>
      </div>

      {/* ── Outcome Bar + Type Distribution ──────────────────── */}
      <div className="grid-2" style={{ marginBottom: 12 }}>
        <div className="card">
          <div className="card-head">Outcome Distribution</div>
          <div className="card-body">
            {totalOutcomes === 0 ? (
              <div className="empty-state" style={{ padding: 16 }}>
                <p className="muted">No outcomes yet</p>
              </div>
            ) : (
              <>
                <div className="outcome-bar">
                  {(["converted", "delivered", "dismissed", "ignored"] as const).map((key) => {
                    const val = eff?.[key] ?? outcomeCounts[key] ?? 0;
                    const pct = totalOutcomes > 0 ? (val / totalOutcomes) * 100 : 0;
                    return (
                      <div
                        key={key}
                        className={`seg ${key}`}
                        style={{ width: `${pct}%` }}
                      />
                    );
                  })}
                </div>
                <div className="outcome-legend">
                  {(["converted", "delivered", "dismissed", "ignored"] as const).map((key) => {
                    const val = eff?.[key] ?? outcomeCounts[key] ?? 0;
                    return (
                      <div key={key} className="leg-item">
                        <span className={`leg-dot`} style={{ background: outcomeColor(key) }} />
                        <span>{key} ({val})</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head">Intervention Types</div>
          <div className="card-body">
            {Object.keys(typeCounts).length === 0 ? (
              <div className="empty-state" style={{ padding: 16 }}>
                <p className="muted">No interventions yet</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {Object.entries(typeCounts)
                  .sort((a, b) => b[1] - a[1])
                  .map(([type, count]) => {
                    const total = filtered.length;
                    const pct = total > 0 ? (count / total) * 100 : 0;
                    return (
                      <div key={type} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span
                          className="mono"
                          style={{ minWidth: 64, fontSize: 10, textTransform: "uppercase", color: "var(--info)" }}
                        >
                          {type}
                        </span>
                        <div
                          style={{
                            flex: 1,
                            height: 6,
                            background: "rgba(8,26,34,0.6)",
                            borderRadius: 3,
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${pct}%`,
                              height: "100%",
                              background: "var(--info)",
                              borderRadius: 3,
                              transition: "width 400ms ease",
                            }}
                          />
                        </div>
                        <span className="mono muted" style={{ fontSize: 10, minWidth: 20, textAlign: "right" }}>
                          {count}
                        </span>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Intervention Feed ──────────────────────────────── */}
      <div className="card">
        <div className="card-head">
          <span>Intervention Feed</span>
          <span style={{ fontWeight: 400, textTransform: "none", fontSize: 10 }}>
            {filtered.length} interventions
          </span>
        </div>

        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">&#x1F3AF;</div>
            <p>Waiting for interventions...</p>
            <p className="muted" style={{ fontSize: 11 }}>
              Interventions fire when MSWIM composite crosses tier thresholds
            </p>
          </div>
        ) : (
          <div className="scroll-list">
            {filtered.map((iv, i) => (
              <div className="interv-row" key={iv.intervention_id ?? i}>
                <span className="time">{fmtTime(iv.timestamp)}</span>
                <span className="itype" style={{ color: typeColor(iv.type) }}>
                  {iv.type}
                </span>
                <span className="desc">
                  {iv.friction_id && (
                    <span className="friction-tag" style={{ marginRight: 6 }}>
                      {iv.friction_id}
                    </span>
                  )}
                  {iv.message || iv.action_code}
                </span>
                <span className="score-chip">
                  {fmtScore(iv.mswim_score)}
                </span>
                {iv.status && (
                  <span className={`status-badge ${iv.status}`}>{iv.status}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function typeColor(type: string): string {
  const map: Record<string, string> = {
    passive: "var(--tier-passive)",
    nudge: "var(--tier-nudge)",
    active: "var(--tier-active)",
    escalate: "var(--tier-escalate)",
  };
  return map[type] ?? "var(--muted)";
}

function outcomeColor(key: string): string {
  const map: Record<string, string> = {
    converted: "var(--accent)",
    delivered: "var(--info)",
    dismissed: "var(--warn)",
    ignored: "#8b7ea8",
  };
  return map[key] ?? "var(--muted)";
}
