import { useMemo } from "react";
import type { EvaluationData, InterventionData, OverviewAnalytics, ScoreTier } from "../types";
import { fmtTime, fmtNum, fmtPct, fmtScore, tierColor } from "../lib/format";
import { SignalBars } from "./SignalBars";
import { CompositeRing } from "./CompositeRing";

interface Props {
  evaluations: EvaluationData[];
  interventions: InterventionData[];
  selectedSession: string | null;
  overview: OverviewAnalytics | null;
  shadowStats: any | null;
  shadowDivergences: any[] | null;
}

const TIERS: ScoreTier[] = ["MONITOR", "PASSIVE", "NUDGE", "ACTIVE", "ESCALATE"];

export function EvaluateTab({ evaluations, interventions, selectedSession, overview, shadowStats, shadowDivergences }: Props) {
  const filtered = useMemo(
    () => selectedSession ? evaluations.filter((e) => e.session_id === selectedSession) : evaluations,
    [evaluations, selectedSession]
  );

  const filteredInterventions = useMemo(
    () => selectedSession ? interventions.filter((i) => i.session_id === selectedSession) : interventions,
    [interventions, selectedSession]
  );

  const tierDist = useMemo(() => {
    if (overview?.tierDistribution) return overview.tierDistribution;
    const dist: Record<string, number> = {};
    for (const e of filtered) {
      const t = e.mswim.tier;
      dist[t] = (dist[t] ?? 0) + 1;
    }
    return dist;
  }, [overview, filtered]);

  const totalTier = Object.values(tierDist).reduce((a, b) => a + b, 0);
  const latest = filtered[0] ?? null;

  const avgComposite = useMemo(() => {
    if (filtered.length === 0) return 0;
    return filtered.reduce((sum, e) => sum + e.mswim.composite_score, 0) / filtered.length;
  }, [filtered]);

  const eff = overview?.interventionEfficiency;

  const outcomeCounts = useMemo(() => {
    const counts = { converted: 0, delivered: 0, dismissed: 0, ignored: 0, sent: 0 };
    for (const i of filteredInterventions) {
      const s = i.status ?? "sent";
      if (s in counts) counts[s as keyof typeof counts]++;
    }
    return counts;
  }, [filteredInterventions]);

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const i of filteredInterventions) {
      counts[i.type] = (counts[i.type] ?? 0) + 1;
    }
    return counts;
  }, [filteredInterventions]);

  const totalOutcomes = (eff?.fired ?? 0) || Object.values(outcomeCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="tab-content">
      {/* ── Overview Metrics ────────────────────────────────── */}
      <div className="grid-4" style={{ marginBottom: 12 }}>
        <div className="metric-box">
          <div className="label">Evaluations</div>
          <div className="value">{fmtNum(overview?.totalEvaluations ?? filtered.length)}</div>
          <div className="sub">processed</div>
        </div>
        <div className="metric-box">
          <div className="label">Avg Composite</div>
          <div className="value" style={{ color: tierColor(compositeToTier(avgComposite)) }}>
            {fmtScore(avgComposite)}
          </div>
          <div className="sub">{compositeToTier(avgComposite)}</div>
        </div>
        <div className="metric-box">
          <div className="label">Latest Tier</div>
          <div className="value" style={{ color: latest ? tierColor(latest.mswim.tier) : undefined }}>
            {latest?.mswim.tier ?? "—"}
          </div>
          <div className="sub">{latest ? `score ${fmtScore(latest.mswim.composite_score)}` : "waiting"}</div>
        </div>
        <div className="metric-box">
          <div className="label">Engine</div>
          <div className="value" style={{ fontSize: 16 }}>
            {latest?.engine?.toUpperCase() ?? "—"}
          </div>
          <div className="sub">{latest ? "mode" : "waiting"}</div>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 12 }}>
        {/* ── Tier Distribution ─────────────────────────────── */}
        <div className="card">
          <div className="card-head">Tier Distribution</div>
          <div className="card-body">
            {totalTier === 0 ? (
              <div className="empty-state" style={{ padding: 20 }}>
                <p className="muted">No evaluations yet</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {TIERS.map((tier) => {
                  const count = (tierDist as Record<string, number>)[tier] ?? 0;
                  const pct = totalTier > 0 ? (count / totalTier) * 100 : 0;
                  return (
                    <div key={tier} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className="tier-badge" style={{ minWidth: 72, justifyContent: "center", color: tierColor(tier), borderColor: tierColor(tier) }}>
                        {tier}
                      </span>
                      <div style={{ flex: 1, height: 6, background: "rgba(8,26,34,0.6)", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: tierColor(tier), borderRadius: 3, transition: "width 400ms ease" }} />
                      </div>
                      <span className="mono muted" style={{ fontSize: 10, minWidth: 28, textAlign: "right" }}>{count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Latest MSWIM Signals ────────────────────────────── */}
        <div className="card">
          <div className="card-head">Latest MSWIM Signals</div>
          <div className="card-body">
            {latest ? (
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <CompositeRing score={latest.mswim.composite_score} tier={latest.mswim.tier} />
                <div style={{ flex: 1 }}>
                  <SignalBars signals={latest.mswim.signals} />
                </div>
              </div>
            ) : (
              <div className="empty-state" style={{ padding: 20 }}>
                <p className="muted">Waiting for first evaluation...</p>
              </div>
            )}
            {latest?.mswim.gate_override && (
              <div style={{ marginTop: 8 }}>
                <span className="gate-tag">{latest.mswim.gate_override}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Friction Hotspots ───────────────────────────────── */}
      {overview?.frictionHotspots && overview.frictionHotspots.length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="card-head">Friction Hotspots</div>
          <div className="card-body">
            {overview.frictionHotspots.slice(0, 8).map((f) => (
              <div className="friction-item" key={f.frictionId}>
                <span className="fid">{f.frictionId}</span>
                <span className="fcat">{f.category}</span>
                <span className="conf">{f.count}x</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Shadow Mode Card ────────────────────────────────── */}
      {shadowStats && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="card-head">Shadow Mode — MSWIM vs LLM+MSWIM</div>
          <div className="card-body">
            <div className="grid-4" style={{ marginBottom: 12 }}>
              <div className="metric-box">
                <div className="label">Tier Match</div>
                <div className="value">{fmtPct(shadowStats.tierMatchRate ?? 0)}</div>
                <div className="sub">agreement</div>
              </div>
              <div className="metric-box">
                <div className="label">Decision Match</div>
                <div className="value">{fmtPct(shadowStats.decisionMatchRate ?? 0)}</div>
                <div className="sub">agreement</div>
              </div>
              <div className="metric-box">
                <div className="label">Avg Divergence</div>
                <div className="value warn">{fmtScore(shadowStats.avgCompositeDivergence ?? 0)}</div>
                <div className="sub">composite pts</div>
              </div>
              <div className="metric-box">
                <div className="label">Comparisons</div>
                <div className="value">{fmtNum(shadowStats.totalComparisons ?? 0)}</div>
                <div className="sub">total</div>
              </div>
            </div>
            {shadowDivergences && shadowDivergences.length > 0 && (
              <div>
                <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 6, fontWeight: 600, textTransform: "uppercase" }}>Top Divergences</div>
                {shadowDivergences.slice(0, 5).map((d: any, i: number) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <span className="tier-badge" style={{ color: tierColor(d.prodTier), borderColor: tierColor(d.prodTier) }}>{d.prodTier}</span>
                    <span style={{ fontSize: 9, color: "var(--muted)" }}>→</span>
                    <span className="tier-badge" style={{ color: tierColor(d.shadowTier), borderColor: tierColor(d.shadowTier) }}>{d.shadowTier}</span>
                    <span className="mono" style={{ fontSize: 10, color: "var(--warn)", marginLeft: "auto" }}>Δ{fmtScore(d.compositeDivergence)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Evaluation Feed ──────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-head">
          <span>Evaluation Feed</span>
          <span style={{ fontWeight: 400, textTransform: "none", fontSize: 10 }}>{filtered.length} evaluations</span>
        </div>
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">&#x1F9E0;</div>
            <p>Waiting for evaluations...</p>
            <p className="muted" style={{ fontSize: 11 }}>Events are buffered and evaluated in batches</p>
          </div>
        ) : (
          <div className="scroll-list">
            {filtered.map((ev, i) => (
              <div className="eval-row" key={ev.evaluation_id ?? i}>
                <div className="eval-header">
                  <span className="time">{fmtTime(ev.timestamp)}</span>
                  <span className={`tier-badge ${ev.mswim.tier}`}>{ev.mswim.tier}</span>
                  <span className="mono muted" style={{ fontSize: 10 }}>composite {fmtScore(ev.mswim.composite_score)}</span>
                  {ev.mswim.gate_override && <span className="gate-tag">{ev.mswim.gate_override}</span>}
                  {ev.engine && (
                    <span className="signal-chip">
                      <span className="signal-label">engine</span>
                      <span className="signal-value">{ev.engine}</span>
                    </span>
                  )}
                </div>
                <div className="signal-bar">
                  {Object.entries(ev.mswim.signals).map(([key, val]) => (
                    <span className="signal-chip" key={key}>
                      <span className="signal-label">{key.slice(0, 3)}</span>
                      <span className="signal-value">{fmtScore(val)}</span>
                    </span>
                  ))}
                </div>
                {ev.frictions_found.length > 0 && (
                  <div style={{ marginTop: 4, display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {ev.frictions_found.map((f, fi) => (
                      <span key={fi} className="friction-tag" style={{ fontSize: 9 }}>
                        {f.friction_id} ({(f.confidence * 100).toFixed(0)}%)
                      </span>
                    ))}
                  </div>
                )}
                {ev.narrative && <div className="narrative">{ev.narrative}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Interventions (folded in from old Intervene tab) ──── */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-head">Intervention Performance</div>
        <div className="card-body">
          <div className="grid-4" style={{ marginBottom: 12 }}>
            <div className="metric-box">
              <div className="label">Interventions</div>
              <div className="value">{fmtNum(overview?.totalInterventions ?? filteredInterventions.length)}</div>
              <div className="sub">fired</div>
            </div>
            <div className="metric-box">
              <div className="label">Conversion Rate</div>
              <div className="value accent">
                {eff ? fmtPct(eff.conversionRate) : filteredInterventions.length > 0 ? fmtPct(outcomeCounts.converted / Math.max(1, totalOutcomes)) : "—"}
              </div>
              <div className="sub">{eff ? `${eff.converted} converted` : "target"}</div>
            </div>
            <div className="metric-box">
              <div className="label">Dismissal Rate</div>
              <div className="value warn">
                {eff ? fmtPct(eff.dismissalRate) : filteredInterventions.length > 0 ? fmtPct(outcomeCounts.dismissed / Math.max(1, totalOutcomes)) : "—"}
              </div>
              <div className="sub">{eff ? `${eff.dismissed} dismissed` : "monitor"}</div>
            </div>
            <div className="metric-box">
              <div className="label">Delivered</div>
              <div className="value">{fmtNum(eff?.delivered ?? outcomeCounts.delivered)}</div>
              <div className="sub">reached user</div>
            </div>
          </div>

          {totalOutcomes > 0 && (
            <>
              <div className="outcome-bar" style={{ marginBottom: 8 }}>
                {(["converted", "delivered", "dismissed", "ignored"] as const).map((key) => {
                  const val = eff?.[key] ?? outcomeCounts[key] ?? 0;
                  const pct = totalOutcomes > 0 ? (val / totalOutcomes) * 100 : 0;
                  return <div key={key} className={`seg ${key}`} style={{ width: `${pct}%` }} />;
                })}
              </div>
              <div className="outcome-legend">
                {(["converted", "delivered", "dismissed", "ignored"] as const).map((key) => {
                  const val = eff?.[key] ?? outcomeCounts[key] ?? 0;
                  return (
                    <div key={key} className="leg-item">
                      <span className="leg-dot" style={{ background: outcomeColor(key) }} />
                      <span>{key} ({val})</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Intervention Feed ──────────────────────────────── */}
      <div className="card">
        <div className="card-head">
          <span>Intervention Feed</span>
          <span style={{ fontWeight: 400, textTransform: "none", fontSize: 10 }}>{filteredInterventions.length} interventions</span>
        </div>
        {filteredInterventions.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">&#x1F3AF;</div>
            <p>Waiting for interventions...</p>
            <p className="muted" style={{ fontSize: 11 }}>Interventions fire when MSWIM composite crosses tier thresholds</p>
          </div>
        ) : (
          <div className="scroll-list">
            {filteredInterventions.map((iv, i) => (
              <div className="interv-row" key={iv.intervention_id ?? i}>
                <span className="time">{fmtTime(iv.timestamp)}</span>
                <span className="itype" style={{ color: typeColor(iv.type) }}>{iv.type}</span>
                <span className="desc">
                  {iv.friction_id && <span className="friction-tag" style={{ marginRight: 6 }}>{iv.friction_id}</span>}
                  {iv.message || iv.action_code}
                </span>
                <span className="score-chip">{fmtScore(iv.mswim_score)}</span>
                {iv.status && <span className={`status-badge ${iv.status}`}>{iv.status}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function compositeToTier(score: number): string {
  if (score >= 80) return "ESCALATE";
  if (score >= 65) return "ACTIVE";
  if (score >= 50) return "NUDGE";
  if (score >= 30) return "PASSIVE";
  return "MONITOR";
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
