import { useState, useCallback } from "react";
import { useApi, apiFetch } from "../hooks/use-api";
import { fmtTime, fmtNum, fmtPct, fmtScore, truncate } from "../lib/format";

/** Collapsible section */
function Section({ title, badge, children, defaultOpen = true }: {
  title: string;
  badge?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="card-head" style={{ cursor: "pointer", userSelect: "none" }} onClick={() => setOpen(o => !o)}>
        <span>{title}{badge && <span style={{ marginLeft: 8, fontSize: 9, background: "rgba(232,155,59,0.2)", color: "var(--accent)", borderRadius: 3, padding: "1px 5px" }}>{badge}</span>}</span>
        <span style={{ fontWeight: 400, textTransform: "none", fontSize: 10, opacity: 0.6 }}>{open ? "▲" : "▼"}</span>
      </div>
      {open && <div className="card-body">{children}</div>}
    </div>
  );
}

function severityColor(s: string) {
  return s === "critical" ? "var(--tier-escalate)" : "var(--warn)";
}

function statusColor(s: string) {
  return s === "completed" ? "var(--accent)" : s === "failed" ? "var(--tier-escalate)" : "var(--info)";
}

function rolloutStatusColor(s: string) {
  const m: Record<string, string> = { rolling: "var(--accent)", completed: "var(--tier-monitor)", rolled_back: "var(--tier-escalate)", paused: "var(--warn)", pending: "var(--muted)" };
  return m[s] ?? "var(--muted)";
}

export function OperateTab() {
  // ── Training ────────────────────────────────────────────────
  const { data: trainingStats } = useApi<any>("/training/stats", { pollMs: 30000 });
  const { data: trainingDist } = useApi<any>("/training/distribution", { pollMs: 30000 });
  const { data: qualityStats } = useApi<any>("/training/quality/stats", { pollMs: 30000 });

  // ── Drift ───────────────────────────────────────────────────
  const { data: driftStatus, reload: reloadDrift } = useApi<any>("/drift/status", { pollMs: 15000 });
  const { data: driftAlerts, reload: reloadAlerts } = useApi<any>("/drift/alerts?limit=20", { pollMs: 15000 });
  const { data: driftSnapshots } = useApi<any>("/drift/snapshots?limit=4", { pollMs: 30000 });

  // ── Jobs ────────────────────────────────────────────────────
  const { data: nextRun } = useApi<any>("/jobs/next-run", { pollMs: 30000 });
  const { data: jobRuns, reload: reloadJobs } = useApi<any>("/jobs/runs?limit=10", { pollMs: 15000 });

  // ── Experiments ─────────────────────────────────────────────
  const { data: experiments, reload: reloadExperiments } = useApi<any>("/experiments?limit=20", { pollMs: 20000 });

  // ── Rollouts ────────────────────────────────────────────────
  const { data: rollouts, reload: reloadRollouts } = useApi<any>("/rollouts?limit=10", { pollMs: 20000 });

  // Actions
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const triggerJob = useCallback(async (job: string) => {
    setActionLoading(`job_${job}`);
    try {
      await apiFetch(`/jobs/trigger`, { method: "POST", body: JSON.stringify({ job }), headers: { "Content-Type": "application/json" } });
      reloadJobs();
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(null);
    }
  }, [reloadJobs]);

  const ackAlert = useCallback(async (id: string) => {
    setActionLoading(`ack_${id}`);
    try {
      await apiFetch(`/drift/alerts/${id}/ack`, { method: "POST" });
      reloadAlerts();
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(null);
    }
  }, [reloadAlerts]);

  const triggerDriftCheck = useCallback(async () => {
    setActionLoading("drift_check");
    try {
      await apiFetch(`/drift/check`, { method: "POST", body: JSON.stringify({}), headers: { "Content-Type": "application/json" } });
      reloadDrift();
      reloadAlerts();
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(null);
    }
  }, [reloadDrift, reloadAlerts]);

  const experimentAction = useCallback(async (id: string, action: "start" | "pause" | "end") => {
    setActionLoading(`exp_${id}_${action}`);
    try {
      await apiFetch(`/experiments/${id}/${action}`, { method: "POST" });
      reloadExperiments();
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(null);
    }
  }, [reloadExperiments]);

  const rolloutAction = useCallback(async (id: string, action: "start" | "promote" | "rollback" | "pause") => {
    setActionLoading(`rollout_${id}_${action}`);
    try {
      await apiFetch(`/rollouts/${id}/${action}`, { method: "POST", body: JSON.stringify({}), headers: { "Content-Type": "application/json" } });
      reloadRollouts();
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(null);
    }
  }, [reloadRollouts]);

  const activeAlerts = driftAlerts?.alerts?.filter((a: any) => !a.acknowledged) ?? [];

  return (
    <div className="tab-content">

      {/* ══════════════════ TRAINING ══════════════════ */}
      <Section title="Training Data" badge={trainingStats ? `${fmtNum(trainingStats.totalCount ?? 0)} pts` : undefined}>
        {trainingStats ? (
          <>
            <div className="grid-4" style={{ marginBottom: 12 }}>
              <div className="metric-box">
                <div className="label">Datapoints</div>
                <div className="value">{fmtNum(trainingStats.totalCount ?? 0)}</div>
                <div className="sub">total</div>
              </div>
              <div className="metric-box">
                <div className="label">High Quality</div>
                <div className="value accent">{qualityStats ? fmtNum(qualityStats.stats?.high ?? 0) : "—"}</div>
                <div className="sub">grade: high</div>
              </div>
              <div className="metric-box">
                <div className="label">Converted</div>
                <div className="value">{fmtNum(trainingStats.outcomeDistribution?.converted ?? 0)}</div>
                <div className="sub">outcome</div>
              </div>
              <div className="metric-box">
                <div className="label">Dismissed</div>
                <div className="value warn">{fmtNum(trainingStats.outcomeDistribution?.dismissed ?? 0)}</div>
                <div className="sub">outcome</div>
              </div>
            </div>

            {/* Quality distribution */}
            {qualityStats?.stats && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 6, fontWeight: 600, textTransform: "uppercase" }}>Quality Grades</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {(["high", "medium", "low", "rejected"] as const).map((grade) => {
                    const count = qualityStats.stats[grade] ?? 0;
                    const total = Object.values(qualityStats.stats as Record<string, number>).reduce((a, b) => a + b, 0);
                    const pct = total > 0 ? (count / total) * 100 : 0;
                    const color = grade === "high" ? "var(--accent)" : grade === "medium" ? "var(--info)" : grade === "low" ? "var(--warn)" : "var(--tier-escalate)";
                    return (
                      <div key={grade} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ minWidth: 56, fontSize: 10, color, textTransform: "capitalize" }}>{grade}</span>
                        <div style={{ flex: 1, height: 5, background: "rgba(8,26,34,0.6)", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3 }} />
                        </div>
                        <span className="mono muted" style={{ fontSize: 10, minWidth: 24, textAlign: "right" }}>{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Export buttons */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[
                { label: "Export JSONL", path: "/training/export/jsonl" },
                { label: "Export CSV", path: "/training/export/csv" },
                { label: "Fine-Tune JSONL", path: "/training/export/fine-tune" },
              ].map(({ label, path }) => (
                <a
                  key={path}
                  href={`http://localhost:8080/api${path}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: 10, padding: "4px 10px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 4, color: "var(--info)", textDecoration: "none" }}
                >
                  ↓ {label}
                </a>
              ))}
            </div>
          </>
        ) : (
          <div className="empty-state" style={{ padding: 16 }}><p className="muted">Loading training data...</p></div>
        )}
      </Section>

      {/* ══════════════════ DRIFT ══════════════════ */}
      <Section title="Drift Detection" badge={activeAlerts.length > 0 ? `${activeAlerts.length} alerts` : undefined}>
        <div className="grid-4" style={{ marginBottom: 12 }}>
          <div className="metric-box">
            <div className="label">Tier Agreement</div>
            <div className="value" style={{ color: (driftStatus?.tierAgreementRate ?? 1) < 0.7 ? "var(--warn)" : "var(--accent)" }}>
              {driftStatus ? fmtPct(driftStatus.tierAgreementRate ?? 0) : "—"}
            </div>
            <div className="sub">shadow vs prod</div>
          </div>
          <div className="metric-box">
            <div className="label">Decision Match</div>
            <div className="value" style={{ color: (driftStatus?.decisionAgreementRate ?? 1) < 0.75 ? "var(--warn)" : "var(--accent)" }}>
              {driftStatus ? fmtPct(driftStatus.decisionAgreementRate ?? 0) : "—"}
            </div>
            <div className="sub">agreement</div>
          </div>
          <div className="metric-box">
            <div className="label">Avg Divergence</div>
            <div className="value warn">{driftStatus ? fmtScore(driftStatus.avgCompositeDivergence ?? 0) : "—"}</div>
            <div className="sub">composite pts</div>
          </div>
          <div className="metric-box">
            <div className="label">Active Alerts</div>
            <div className="value" style={{ color: activeAlerts.length > 0 ? "var(--tier-escalate)" : "var(--accent)" }}>
              {activeAlerts.length}
            </div>
            <div className="sub">unacknowledged</div>
          </div>
        </div>

        {/* Alerts list */}
        {activeAlerts.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 6, fontWeight: 600, textTransform: "uppercase" }}>Active Alerts</div>
            <div className="scroll-list" style={{ maxHeight: 200 }}>
              {activeAlerts.map((alert: any) => (
                <div key={alert.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 3, background: severityColor(alert.severity) + "22", color: severityColor(alert.severity), flexShrink: 0 }}>
                    {alert.severity}
                  </span>
                  <span style={{ fontSize: 10, flex: 1, color: "var(--text)" }}>{alert.message}</span>
                  <button
                    onClick={() => ackAlert(alert.id)}
                    disabled={actionLoading === `ack_${alert.id}`}
                    style={{ fontSize: 9, padding: "2px 7px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 3, color: "var(--muted)", cursor: "pointer", flexShrink: 0 }}
                  >
                    Ack
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={triggerDriftCheck}
          disabled={actionLoading === "drift_check"}
          style={{ fontSize: 10, padding: "5px 12px", background: "rgba(91,155,213,0.15)", border: "1px solid rgba(91,155,213,0.3)", borderRadius: 4, color: "var(--info)", cursor: "pointer" }}
        >
          {actionLoading === "drift_check" ? "Running..." : "Run Drift Check"}
        </button>
      </Section>

      {/* ══════════════════ JOBS ══════════════════ */}
      <Section title="Scheduled Jobs" defaultOpen={false}>
        {nextRun && (
          <div className="grid-4" style={{ marginBottom: 12 }}>
            <div className="metric-box">
              <div className="label">Next Run</div>
              <div className="value" style={{ fontSize: 13 }}>{nextRun.nextRun ? new Date(nextRun.nextRun).toLocaleTimeString() : "—"}</div>
              <div className="sub">scheduled</div>
            </div>
            <div className="metric-box">
              <div className="label">Last Run</div>
              <div className="value" style={{ fontSize: 13, color: statusColor(nextRun.lastRun?.status ?? "") }}>
                {nextRun.lastRun?.status ?? "—"}
              </div>
              <div className="sub">{nextRun.lastRun?.durationMs ? `${Math.round(nextRun.lastRun.durationMs / 1000)}s` : "—"}</div>
            </div>
            <div className="metric-box" style={{ gridColumn: "span 2" }}>
              <div style={{ display: "flex", gap: 8 }}>
                {[
                  { label: "Nightly Batch", job: "nightly_batch" },
                  { label: "Drift Check", job: "drift_check" },
                  { label: "Rollout Health", job: "rollout_health" },
                ].map(({ label, job }) => (
                  <button
                    key={job}
                    onClick={() => triggerJob(job)}
                    disabled={actionLoading === `job_${job}`}
                    style={{ fontSize: 9, padding: "4px 8px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 3, color: "var(--muted)", cursor: "pointer" }}
                  >
                    {actionLoading === `job_${job}` ? "Running..." : `▶ ${label}`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        <div className="scroll-list" style={{ maxHeight: 200 }}>
          {(jobRuns?.runs ?? []).map((run: any) => (
            <div key={run.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              <span style={{ fontSize: 9, minWidth: 56, color: statusColor(run.status) }}>{run.status}</span>
              <span style={{ fontSize: 10, flex: 1, color: "var(--text)" }}>{run.jobName}</span>
              <span className="mono muted" style={{ fontSize: 9 }}>{run.durationMs ? `${Math.round(run.durationMs / 1000)}s` : "—"}</span>
              <span className="mono muted" style={{ fontSize: 9 }}>{run.startedAt ? fmtTime(run.startedAt) : ""}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* ══════════════════ EXPERIMENTS ══════════════════ */}
      <Section title="A/B Experiments" badge={`${experiments?.count ?? 0} total`} defaultOpen={false}>
        {(experiments?.experiments ?? []).length === 0 ? (
          <div className="empty-state" style={{ padding: 16 }}><p className="muted">No experiments yet</p></div>
        ) : (
          <div className="scroll-list" style={{ maxHeight: 320 }}>
            {(experiments?.experiments ?? []).map((exp: any) => (
              <div key={exp.id} style={{ padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text)", flex: 1 }}>{exp.name}</span>
                  <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 3, background: exp.status === "running" ? "rgba(107,201,160,0.2)" : "rgba(255,255,255,0.06)", color: exp.status === "running" ? "var(--accent)" : "var(--muted)" }}>
                    {exp.status}
                  </span>
                </div>
                <div style={{ fontSize: 9, color: "var(--muted)", marginBottom: 6 }}>
                  Traffic: {exp.trafficPercent}% · Metric: {exp.primaryMetric}
                  {exp.siteUrl ? ` · ${exp.siteUrl}` : ""}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {exp.status === "draft" && (
                    <button onClick={() => experimentAction(exp.id, "start")} disabled={!!actionLoading} style={actionBtnStyle("var(--accent)")}>
                      Start
                    </button>
                  )}
                  {exp.status === "running" && (
                    <>
                      <button onClick={() => experimentAction(exp.id, "pause")} disabled={!!actionLoading} style={actionBtnStyle("var(--warn)")}>Pause</button>
                      <button onClick={() => experimentAction(exp.id, "end")} disabled={!!actionLoading} style={actionBtnStyle("var(--muted)")}>End</button>
                    </>
                  )}
                  {exp.status === "paused" && (
                    <button onClick={() => experimentAction(exp.id, "start")} disabled={!!actionLoading} style={actionBtnStyle("var(--accent)")}>Resume</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ══════════════════ ROLLOUTS ══════════════════ */}
      <Section title="Gradual Rollouts" badge={`${rollouts?.count ?? 0} total`} defaultOpen={false}>
        {(rollouts?.rollouts ?? []).length === 0 ? (
          <div className="empty-state" style={{ padding: 16 }}><p className="muted">No rollouts yet</p></div>
        ) : (
          <div className="scroll-list" style={{ maxHeight: 320 }}>
            {(rollouts?.rollouts ?? []).map((rollout: any) => (
              <div key={rollout.id} style={{ padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text)", flex: 1 }}>{rollout.name}</span>
                  <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 3, background: rolloutStatusColor(rollout.status) + "22", color: rolloutStatusColor(rollout.status) }}>
                    {rollout.status}
                  </span>
                </div>
                <div style={{ fontSize: 9, color: "var(--muted)", marginBottom: 6 }}>
                  Stage {rollout.currentStage + 1} · {rollout.changeType}
                  {rollout.siteUrl ? ` · ${rollout.siteUrl}` : ""}
                  {rollout.lastHealthStatus ? ` · Health: ${rollout.lastHealthStatus}` : ""}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {rollout.status === "pending" && (
                    <button onClick={() => rolloutAction(rollout.id, "start")} disabled={!!actionLoading} style={actionBtnStyle("var(--accent)")}>Start</button>
                  )}
                  {rollout.status === "rolling" && (
                    <>
                      <button onClick={() => rolloutAction(rollout.id, "promote")} disabled={!!actionLoading} style={actionBtnStyle("var(--accent)")}>Promote</button>
                      <button onClick={() => rolloutAction(rollout.id, "pause")} disabled={!!actionLoading} style={actionBtnStyle("var(--warn)")}>Pause</button>
                      <button onClick={() => rolloutAction(rollout.id, "rollback")} disabled={!!actionLoading} style={actionBtnStyle("var(--tier-escalate)")}>Rollback</button>
                    </>
                  )}
                  {rollout.status === "paused" && (
                    <>
                      <button onClick={() => rolloutAction(rollout.id, "start")} disabled={!!actionLoading} style={actionBtnStyle("var(--accent)")}>Resume</button>
                      <button onClick={() => rolloutAction(rollout.id, "rollback")} disabled={!!actionLoading} style={actionBtnStyle("var(--tier-escalate)")}>Rollback</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

    </div>
  );
}

function actionBtnStyle(color: string) {
  return {
    fontSize: 9,
    padding: "3px 8px",
    background: color + "22",
    border: `1px solid ${color}55`,
    borderRadius: 3,
    color,
    cursor: "pointer",
  } as React.CSSProperties;
}
