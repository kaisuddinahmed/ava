import React, { useEffect, useState, useRef } from "react";
import ReactDOM from "react-dom/client";
import { AnalystContract, UserEvent } from "@ava/shared/types";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import "./index.css";

// --- Types ---
type StreamMessage = {
  type: "analysis_update" | "analytics_update" | "reset";
  event?: UserEvent;
  contract?: AnalystContract;
  narrative?: string[];
  tracking_logs?: string[];
  analyst_logs?: string[];
  analytics?: AnalyticsData;
};

type AnalyticsData = {
  totalSessions: number;
  activeSessions: number;
  avgSessionDuration: number;
  conversionRate: number;
  frictionBreakdown: Record<string, number>;
  interventionBreakdown: Record<string, number>;
  funnel: {
    browsed: number;
    addedToCart: number;
    checkedOut: number;
  };
  predictiveScores?: {
    exitProbability: number;
    purchaseProbability: number;
  };
};

type InterventionLogEntry = {
  time: string;
  friction_type: string;
  ui_type: string;
  script: string;
  response: string;
  stage?: number;
  approach?: string;
};

type CurrentIntervention = {
  friction_type: string;
  ui_type: string;
  script: string;
  priority: number;
  stage?: number;
  approach?: string;
} | null;

type SessionScoresData = {
  interest: number;
  friction: number;
  clarity: number;
};

type Tab = "live" | "scores" | "analytics";

// --- Components ---
const ConfidenceBar = ({ value, label }: { value: number; label: string }) => (
  <div className="mb-4">
    <div className="flex justify-between text-xs uppercase text-stone-400 mb-1">
      <span>{label}</span>
      <span>{(value * 100).toFixed(0)}%</span>
    </div>
    <div className="h-2 bg-stone-800 rounded-full overflow-hidden">
      <div
        className={`h-full transition-all duration-500 ${value > 0.7 ? "bg-amber-500" : value > 0.4 ? "bg-orange-500" : "bg-stone-600"}`}
        style={{ width: `${value * 100}%` }}
      />
    </div>
  </div>
);

const MetricCard = ({
  label,
  value,
  unit = "",
  icon,
}: {
  label: string;
  value: number | string;
  unit?: string;
  icon?: string;
}) => {
  return (
    <div className="bg-gradient-to-br from-stone-800/40 to-stone-900/40 p-6 rounded-none border border-white/10 relative overflow-hidden group hover:border-amber-500/30 transition-all">
      <div className="absolute top-0 right-0 text-6xl opacity-10 grayscale">
        {icon}
      </div>
      <div className="text-xs text-stone-400 uppercase mb-2 font-semibold tracking-wider font-serif">
        {label}
      </div>
      <div className="text-4xl font-bold text-white mb-1 font-serif">
        {value}
        {unit}
      </div>
    </div>
  );
};

const ScoreCard = ({
  label,
  score,
  type,
}: {
  label: string;
  score: number;
  type: "danger" | "success";
}) => {
  const bgClass =
    type === "danger"
      ? "from-red-900/40 to-red-950/40"
      : "from-amber-900/40 to-amber-950/40";
  const borderClass =
    type === "danger" ? "border-red-900/30" : "border-amber-900/30";
  const textClass = type === "danger" ? "text-red-400" : "text-amber-400";
  const barBg = type === "danger" ? "bg-red-950" : "bg-amber-950";
  const barFill = type === "danger" ? "bg-red-500" : "bg-amber-500";

  return (
    <div
      className={`bg-gradient-to-br ${bgClass} p-6 rounded-none border ${borderClass}`}
    >
      <div className="text-xs text-stone-400 uppercase mb-2 font-semibold tracking-wider font-serif">
        {label}
      </div>
      <div className="flex items-end gap-3">
        <div className={`text-5xl font-bold text-white font-serif`}>
          {score}%
        </div>
        <div className={`text-sm ${textClass} mb-2 font-bold`}>
          {score > 70 ? "HIGH" : score > 40 ? "MEDIUM" : "LOW"}
        </div>
      </div>
      <div className={`w-full h-1 ${barBg} mt-4`}>
        <div
          className={`h-full ${barFill} transition-all`}
          style={{ width: `${score}%` }}
        ></div>
      </div>
    </div>
  );
};

// Error Boundary
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: any }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  componentDidCatch(error: any, errorInfo: any) {
    console.error("Uncaught error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError)
      return (
        <div className="p-8 text-red-500">
          CRITICAL ERROR: {this.state.error?.toString()}
        </div>
      );
    return this.props.children;
  }
}

// 13-type friction color map
const FRICTION_13_COLORS: Record<string, string> = {
  exit_intent: "#ef4444",
  price_sensitivity: "#f97316",
  search_frustration: "#eab308",
  specs_confusion: "#84cc16",
  indecision: "#22c55e",
  comparison_loop: "#14b8a6",
  high_interest_stalling: "#06b6d4",
  checkout_hesitation: "#3b82f6",
  navigation_confusion: "#6366f1",
  gift_anxiety: "#8b5cf6",
  form_fatigue: "#a855f7",
  visual_doom_scrolling: "#d946ef",
  trust_gap: "#ec4899",
};

// ============================================
// TAB 1: TRACK — Tracking user signals
// Format: [timestamp] Activity description (single line)
// ============================================
function LiveFeedView({
  logs,
  scrollRef,
  userHasScrolled,
  onScroll,
  onScrollToBottom,
}: {
  logs: string[];
  scrollRef: React.RefObject<HTMLDivElement>;
  userHasScrolled: boolean;
  onScroll: () => void;
  onScrollToBottom: () => void;
}) {
  // Parse "[HH:MM:SS] activity text" into { time, activity }
  const parseLine = (line: string) => {
    const match = line.match(
      /^(\[\d{1,2}:\d{2}(:\d{2})?\s*(AM|PM)?\])\s*(.*)$/,
    );
    if (match) return { time: match[1], activity: match[4] };
    return { time: "", activity: line };
  };

  // Classify for color coding
  const classifyActivity = (activity: string): string => {
    if (activity.includes("⚠️") || activity.includes("Exit intent"))
      return "alert";
    if (activity.includes("idle") || activity.includes("Idle"))
      return "secondary";
    if (
      activity.includes("Behavior pattern") ||
      activity.includes("Rapid clicking") ||
      activity.includes("rage")
    )
      return "secondary";
    if (
      activity.includes("Tab switched") ||
      activity.includes("Tab returned") ||
      activity.includes("observing")
    )
      return "secondary";
    if (activity.includes("Price evaluation")) return "secondary";
    return "major";
  };

  return (
    <div className="flex-1 min-h-0 relative bg-black/40">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="absolute inset-0 overflow-y-scroll p-6 custom-scrollbar"
      >
        <div className="space-y-0.5">
          {logs.map((line, idx) => {
            const { time, activity } = parseLine(line);
            const type = classifyActivity(activity);

            let rowClass =
              "flex items-start gap-3 py-1 px-2 rounded-sm font-['JetBrains_Mono',monospace] text-sm leading-relaxed";
            let activityClass = "";

            if (type === "alert") {
              rowClass += " bg-red-500/10";
              activityClass = "text-red-300 font-bold";
            } else if (type === "secondary") {
              activityClass = "text-stone-500 text-xs";
            } else {
              activityClass = "text-stone-300";
            }

            return (
              <div key={idx} className={rowClass}>
                {time && (
                  <span className="text-stone-600 text-xs flex-shrink-0 pt-0.5 w-[75px]">
                    {time}
                  </span>
                )}
                <span className={activityClass}>{activity}</span>
              </div>
            );
          })}
          {logs.length === 0 && (
            <div className="text-stone-600 italic text-center py-20 font-serif">
              <div className="text-4xl mb-4 grayscale opacity-50">👁️</div>
              <div className="tracking-widest uppercase text-xs">
                Waiting for user activity...
              </div>
              <div className="text-[10px] text-stone-700 mt-2">
                User actions will appear here in real time
              </div>
            </div>
          )}
        </div>
      </div>
      {userHasScrolled && (
        <div
          onClick={onScrollToBottom}
          className="absolute bottom-6 right-6 bg-amber-500 hover:bg-amber-400 text-black px-4 py-2 cursor-pointer shadow-lg font-bold text-xs uppercase tracking-wider flex items-center gap-2 animate-bounce z-10"
        >
          ↓ New activity
        </div>
      )}
    </div>
  );
}

// ============================================
// TAB 2: EVALUATE — One continuous typewriter story
// ============================================
function EvaluationView({
  scores,
  analystLogs,
  frictions,
  interventionLog,
  analystScrollRef,
  analystUserHasScrolled,
  onAnalystScroll,
  onAnalystScrollToBottom,
}: {
  scores: SessionScoresData | null;
  analystLogs: string[];
  frictions: Array<{ type: string; confidence: number }>;
  interventionLog: InterventionLogEntry[];
  analystScrollRef: React.RefObject<HTMLDivElement>;
  analystUserHasScrolled: boolean;
  onAnalystScroll: () => void;
  onAnalystScrollToBottom: () => void;
}) {
  const s = scores || { interest: 0, friction: 0, clarity: 100 };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Minimal Score Strip */}
      <div className="flex-shrink-0 bg-black/30 border-b border-white/10 px-6 py-3">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-stone-500 uppercase tracking-wider font-bold">
              Interest
            </span>
            <div className="flex items-center gap-1.5">
              <div className="w-20 h-1.5 bg-stone-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 transition-all duration-500 rounded-full"
                  style={{ width: `${s.interest}%` }}
                />
              </div>
              <span className="text-amber-400 text-xs font-bold font-mono w-8">
                {Math.round(s.interest)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-stone-500 uppercase tracking-wider font-bold">
              Friction
            </span>
            <div className="flex items-center gap-1.5">
              <div className="w-20 h-1.5 bg-stone-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-red-500 transition-all duration-500 rounded-full"
                  style={{ width: `${s.friction}%` }}
                />
              </div>
              <span className="text-red-400 text-xs font-bold font-mono w-8">
                {Math.round(s.friction)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-stone-500 uppercase tracking-wider font-bold">
              Clarity
            </span>
            <div className="flex items-center gap-1.5">
              <div className="w-20 h-1.5 bg-stone-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-500 rounded-full"
                  style={{ width: `${s.clarity}%` }}
                />
              </div>
              <span className="text-blue-400 text-xs font-bold font-mono w-8">
                {Math.round(s.clarity)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* The Story — one continuous typewriter stream */}
      <div className="flex-1 min-h-0 relative bg-stone-950">
        <div
          ref={analystScrollRef}
          onScroll={onAnalystScroll}
          className="absolute inset-0 overflow-y-scroll px-8 py-6 custom-scrollbar"
        >
          <div className="max-w-3xl mx-auto">
            <span className="font-['JetBrains_Mono',_'Courier_New',_monospace] text-[16px] leading-[2.1] text-stone-400">
              {analystLogs
                .filter((l) => l.trim() !== "")
                .map((line, idx, arr) => (
                  <span key={idx}>
                    {line}
                    {idx < arr.length - 1 && " "}
                  </span>
                ))}
              {analystLogs.filter((l) => l.trim() !== "").length > 0 && (
                <span className="inline-block w-[2px] h-[17px] bg-amber-500 animate-pulse ml-1 align-middle" />
              )}
            </span>
            {analystLogs.filter((l) => l.trim() !== "").length === 0 && (
              <div className="text-stone-700 text-center py-24 font-['JetBrains_Mono',_'Courier_New',_monospace]">
                <div className="text-sm mb-2 text-stone-500">
                  _ waiting for session to begin
                </div>
                <div className="text-xs text-stone-700">
                  the analyst will narrate the user's journey here as one
                  continuous story
                </div>
              </div>
            )}
          </div>
        </div>
        {analystUserHasScrolled && (
          <div
            onClick={onAnalystScrollToBottom}
            className="absolute bottom-6 right-6 bg-stone-800 hover:bg-stone-700 text-stone-300 px-4 py-2 cursor-pointer shadow-lg text-xs font-['JetBrains_Mono',monospace] flex items-center gap-2 z-10 border border-stone-700"
          >
            ↓ continue
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// TAB 3: INTERVENE — Intervention controls and history
// ============================================
function AnalyticsView({
  analytics,
  interventionLog,
  currentIntervention,
  sessionScores,
}: {
  analytics: AnalyticsData | null;
  interventionLog: InterventionLogEntry[];
  currentIntervention: CurrentIntervention;
  sessionScores: SessionScoresData | null;
}) {
  if (!analytics) {
    return (
      <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-black/20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center py-20">
            <h2 className="text-3xl font-bold text-white mb-4 font-serif">
              Awaiting Data...
            </h2>
            <p className="text-stone-500 uppercase tracking-widest text-xs">
              Analytics disabled until user session begins
            </p>
          </div>
        </div>
      </div>
    );
  }

  const frictionData = Object.entries(analytics.frictionBreakdown).map(
    ([name, value]) => ({
      name: name.replace("_", " "),
      value,
    }),
  );

  const interventionData = Object.entries(analytics.interventionBreakdown).map(
    ([name, value]) => ({
      name: name.replace("_", " "),
      value,
    }),
  );

  const funnelData = [
    { stage: "Browsed", count: analytics.funnel.browsed, fill: "#57534e" },
    {
      stage: "Added to Cart",
      count: analytics.funnel.addedToCart,
      fill: "#d97706",
    },
    {
      stage: "Checked Out",
      count: analytics.funnel.checkedOut,
      fill: "#f59e0b",
    },
  ];

  const COLORS = [
    "#78716c",
    "#a8a29e",
    "#d6d3d1",
    "#f59e0b",
    "#d97706",
    "#b45309",
  ];

  // Intervention permission formula
  const canInterventionFire = sessionScores
    ? sessionScores.interest >= 60 &&
      sessionScores.friction - sessionScores.clarity >= 20
    : false;

  return (
    <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Real-time Intervention Decision Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Current Intervention Status */}
          <div
            className={`p-6 rounded-none border ${
              currentIntervention
                ? "bg-gradient-to-br from-amber-900/40 to-amber-950/40 border-amber-500/50"
                : canInterventionFire
                  ? "bg-gradient-to-br from-green-900/30 to-green-950/30 border-green-500/30"
                  : "bg-gradient-to-br from-stone-800/40 to-stone-900/40 border-white/10"
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white font-serif">
                Intervention Status
              </h3>
              <div
                className={`px-3 py-1 text-xs font-bold uppercase tracking-wider ${
                  currentIntervention
                    ? "bg-amber-500 text-black"
                    : canInterventionFire
                      ? "bg-green-500/20 text-green-400 border border-green-500/30"
                      : "bg-stone-700 text-stone-400"
                }`}
              >
                {currentIntervention
                  ? "ACTIVE"
                  : canInterventionFire
                    ? "READY"
                    : "MONITORING"}
              </div>
            </div>

            {currentIntervention ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="text-stone-400 text-sm uppercase">
                    Trigger:
                  </span>
                  <span className="text-white font-semibold">
                    {currentIntervention.friction_type.replace(/_/g, " ")}
                  </span>
                  {currentIntervention.stage && (
                    <span
                      className={`px-2 py-0.5 text-xs font-bold uppercase ${
                        currentIntervention.approach === "offer"
                          ? "bg-red-500/20 text-red-400"
                          : currentIntervention.approach === "persuasive"
                            ? "bg-amber-500/20 text-amber-400"
                            : "bg-green-500/20 text-green-400"
                      }`}
                    >
                      Stage {currentIntervention.stage} •{" "}
                      {currentIntervention.approach}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-stone-400 text-sm uppercase">UI:</span>
                  <span className="text-amber-400 font-mono text-sm">
                    {currentIntervention.ui_type}
                  </span>
                </div>
                <div className="bg-black/30 p-4 border-l-2 border-amber-500">
                  <p className="text-stone-300 italic text-sm leading-relaxed">
                    "{currentIntervention.script}"
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-stone-500 text-sm">
                {canInterventionFire
                  ? "System ready to intervene. Awaiting friction signal..."
                  : sessionScores
                    ? `Scores: Interest ${Math.round(sessionScores.interest)}, Friction ${Math.round(sessionScores.friction)}, Clarity ${Math.round(sessionScores.clarity)}`
                    : "No active session. Waiting for user activity..."}
              </div>
            )}
          </div>

          {/* Intervention Permission Formula */}
          <div className="bg-gradient-to-br from-stone-800/40 to-stone-900/40 p-6 rounded-none border border-white/10">
            <h3 className="text-xl font-bold text-white mb-4 font-serif">
              Permission Formula
            </h3>
            <div className="space-y-4">
              <div className="font-mono text-sm text-stone-400 bg-black/30 p-4 rounded">
                Interest ≥ 60 <span className="text-amber-500">AND</span>{" "}
                (Friction - Clarity) ≥ 20
              </div>
              {sessionScores && (
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div
                      className={`text-2xl font-bold ${sessionScores.interest >= 60 ? "text-green-400" : "text-stone-500"}`}
                    >
                      {Math.round(sessionScores.interest)}
                    </div>
                    <div className="text-xs text-stone-500 uppercase">
                      Interest {sessionScores.interest >= 60 ? "✓" : ""}
                    </div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-red-400">
                      {Math.round(sessionScores.friction)}
                    </div>
                    <div className="text-xs text-stone-500 uppercase">
                      Friction
                    </div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-blue-400">
                      {Math.round(sessionScores.clarity)}
                    </div>
                    <div className="text-xs text-stone-500 uppercase">
                      Clarity
                    </div>
                  </div>
                </div>
              )}
              {sessionScores && (
                <div
                  className={`text-center p-2 ${canInterventionFire ? "bg-green-500/20 text-green-400" : "bg-stone-700/50 text-stone-500"}`}
                >
                  <span className="font-mono text-sm">
                    ({Math.round(sessionScores.friction)} -{" "}
                    {Math.round(sessionScores.clarity)}) ={" "}
                    {Math.round(sessionScores.friction - sessionScores.clarity)}{" "}
                    {sessionScores.friction - sessionScores.clarity >= 20
                      ? "≥"
                      : "<"}{" "}
                    20
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Recent Interventions Log */}
        {interventionLog.length > 0 && (
          <div className="bg-white/5 p-6 rounded-none border border-white/10">
            <h3 className="text-xl font-bold text-white mb-4 font-serif">
              Intervention History
            </h3>
            <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
              {interventionLog
                .slice(-10)
                .reverse()
                .map((entry, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-4 p-3 bg-black/20 border border-white/5"
                  >
                    <span className="text-stone-500 text-xs font-mono">
                      {entry.time}
                    </span>
                    <span className="text-amber-400 text-sm font-semibold">
                      {entry.friction_type.replace(/_/g, " ")}
                    </span>
                    {entry.stage && (
                      <span
                        className={`px-2 py-0.5 text-xs ${
                          entry.approach === "offer"
                            ? "bg-red-500/20 text-red-400"
                            : entry.approach === "persuasive"
                              ? "bg-amber-500/20 text-amber-400"
                              : "bg-green-500/20 text-green-400"
                        }`}
                      >
                        S{entry.stage}
                      </span>
                    )}
                    <span className="text-stone-600 text-xs">
                      {entry.ui_type}
                    </span>
                    <span className="flex-1 text-stone-400 text-xs truncate italic">
                      "{entry.script}"
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}

        <div>
          <h2 className="text-2xl font-bold text-white mb-6 font-serif italic">
            Session Overview
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              label="Total Sessions"
              value={analytics.totalSessions}
              icon="👥"
            />
            <MetricCard
              label="Active Now"
              value={analytics.activeSessions}
              icon="🟢"
            />
            <MetricCard
              label="Avg Duration"
              value={Math.round(analytics.avgSessionDuration / 1000)}
              unit="s"
              icon="⏱️"
            />
            <MetricCard
              label="Conversion Rate"
              value={analytics.conversionRate.toFixed(1)}
              unit="%"
              icon="💰"
            />
          </div>
        </div>

        {analytics.predictiveScores && (
          <div>
            <h2 className="text-2xl font-bold text-white mb-6 font-serif italic">
              Predictive Intelligence
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ScoreCard
                label="Exit Probability"
                score={analytics.predictiveScores.exitProbability}
                type="danger"
              />
              <ScoreCard
                label="Purchase Probability"
                score={analytics.predictiveScores.purchaseProbability}
                type="success"
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white/5 p-6 rounded-none border border-white/10">
            <h3 className="text-xl font-bold text-white mb-6 font-serif">
              Friction Breakdown
            </h3>
            {frictionData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={frictionData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) =>
                      `${name}: ${((percent || 0) * 100).toFixed(0)}%`
                    }
                    outerRadius={80}
                    fill="#8884d8"
                    stroke="none"
                    dataKey="value"
                  >
                    {frictionData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS[index % COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1c1917",
                      border: "1px solid #44403c",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-stone-600 uppercase text-xs tracking-widest">
                No friction data yet
              </div>
            )}
          </div>

          <div className="bg-white/5 p-6 rounded-none border border-white/10">
            <h3 className="text-xl font-bold text-white mb-6 font-serif">
              Intervention Analytics
            </h3>
            {interventionData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={interventionData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#292524" />
                  <XAxis
                    dataKey="name"
                    stroke="#78716c"
                    tick={{ fill: "#78716c", fontSize: 10 }}
                  />
                  <YAxis stroke="#78716c" tick={{ fill: "#78716c" }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1c1917",
                      border: "1px solid #44403c",
                    }}
                  />
                  <Bar dataKey="value" fill="#d97706" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-stone-600 uppercase text-xs tracking-widest">
                No intervention data yet
              </div>
            )}
          </div>
        </div>

        <div className="bg-white/5 p-6 rounded-none border border-white/10">
          <h3 className="text-xl font-bold text-white mb-6 font-serif">
            Conversion Funnel
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={funnelData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#292524" />
              <XAxis
                type="number"
                stroke="#78716c"
                tick={{ fill: "#78716c" }}
              />
              <YAxis
                dataKey="stage"
                type="category"
                stroke="#78716c"
                tick={{ fill: "#78716c", fontSize: 12, width: 100 }}
                width={100}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1c1917",
                  border: "1px solid #44403c",
                }}
              />
              <Bar dataKey="count" fill="#8b5cf6">
                {funnelData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-4 grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-stone-400 font-serif">
                {analytics.funnel.browsed}
              </div>
              <div className="text-xs text-stone-600 uppercase tracking-wider">
                Browsed
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold text-amber-600 font-serif">
                {analytics.funnel.addedToCart}
              </div>
              <div className="text-xs text-stone-600 uppercase tracking-wider">
                Added to Cart (
                {(
                  (analytics.funnel.addedToCart /
                    (analytics.funnel.browsed || 1)) *
                  100
                ).toFixed(1)}
                %)
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold text-amber-400 font-serif">
                {analytics.funnel.checkedOut}
              </div>
              <div className="text-xs text-stone-600 uppercase tracking-wider">
                Checked Out (
                {(
                  (analytics.funnel.checkedOut /
                    (analytics.funnel.addedToCart || 1)) *
                  100
                ).toFixed(1)}
                %)
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// MAIN APP
// ============================================
function App() {
  const [activeTab, setActiveTab] = useState<Tab>("live");

  // Live Feed state — tracking logs only
  const [trackingLogs, setTrackingLogs] = useState<string[]>([]);

  // Scores tab state — analyst reasoning stream
  const [analystLogs, setAnalystLogs] = useState<string[]>([]);

  const [currentContract, setCurrentContract] =
    useState<AnalystContract | null>(null);
  const [statusText, setStatusText] = useState<string>("Analyst Standing By");
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(
    null,
  );
  const [sessionScores, setSessionScores] = useState<SessionScoresData | null>(
    null,
  );
  const [detectedFrictions, setDetectedFrictions] = useState<
    Array<{ type: string; confidence: number }>
  >([]);
  const [interventionLog, setInterventionLog] = useState<
    InterventionLogEntry[]
  >([]);
  const [currentIntervention, setCurrentIntervention] =
    useState<CurrentIntervention>(null);

  // Scroll refs for both Live Feed and Scores
  const liveFeedScrollRef = useRef<HTMLDivElement>(null);
  const [liveFeedUserScrolled, setLiveFeedUserScrolled] = useState(false);
  const analystScrollRef = useRef<HTMLDivElement>(null);
  const [analystUserScrolled, setAnalystUserScrolled] = useState(false);

  useEffect(() => {
    const ws = new WebSocket("ws://localhost:3000");
    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data) as StreamMessage;

        if (data.type === "analysis_update") {
          // --- LIVE FEED: Tracking logs only ---
          if (data.tracking_logs && data.tracking_logs.length > 0) {
            setTrackingLogs((prev) => [
              ...prev.slice(-300),
              ...data.tracking_logs!,
            ]);
          } else if (data.narrative && data.narrative.length > 0) {
            // Legacy fallback: tracking lines start with [timestamp]
            const trackingOnly = data.narrative.filter((l) =>
              /^\[\d{1,2}:\d{2}/.test(l),
            );
            if (trackingOnly.length > 0) {
              setTrackingLogs((prev) => [...prev.slice(-300), ...trackingOnly]);
            }
          }

          // --- EVALUATION TAB: Analyst reasoning logs ---
          if (data.analyst_logs && data.analyst_logs.length > 0) {
            setAnalystLogs((prev) => [
              ...prev.slice(-500),
              ...data.analyst_logs!,
            ]);
          } else if (data.narrative && data.narrative.length > 0) {
            // Legacy fallback: analyst lines are prose (no timestamp prefix)
            const analystOnly = data.narrative.filter(
              (l) => !/^\[\d{1,2}:\d{2}/.test(l) && l.trim() !== "",
            );
            if (analystOnly.length > 0) {
              setAnalystLogs((prev) => [...prev.slice(-500), ...analystOnly]);
            }
          }

          // --- Contract & V2 data ---
          if (data.contract) {
            setCurrentContract(data.contract);

            if (data.contract.scores) {
              setSessionScores(data.contract.scores);
            }

            if (
              data.contract.detected_frictions &&
              data.contract.detected_frictions.length > 0
            ) {
              setDetectedFrictions((prev) => [
                ...prev,
                ...data.contract!.detected_frictions!.map((f: any) => ({
                  type: f.type,
                  confidence: f.confidence || 1,
                })),
              ]);
            }

            if (data.contract.intervention) {
              const iv = data.contract.intervention;
              const time = new Date().toLocaleTimeString();
              setInterventionLog((prev) => [
                ...prev,
                {
                  time,
                  friction_type: iv.friction_type || "unknown",
                  ui_type: iv.ui_type || "voice_only",
                  script: iv.script || "",
                  response: "pending",
                  stage: (iv as any).stage,
                  approach: (iv as any).approach,
                },
              ]);
              // Update current intervention for real-time display
              setCurrentIntervention({
                friction_type: iv.friction_type || "unknown",
                ui_type: iv.ui_type || "voice_only",
                script: iv.script || "",
                priority: iv.priority || 5,
                stage: (iv as any).stage,
                approach: (iv as any).approach,
              });
            } else {
              // Clear current intervention when none active
              setCurrentIntervention(null);
            }

            // Status text
            if (data.contract.scores) {
              const s = data.contract.scores;
              const canIntervene =
                s.interest >= 60 && s.friction - s.clarity >= 20;
              if (data.contract.intervention) {
                setStatusText(
                  `INTERVENING | I:${Math.round(s.interest)} F:${Math.round(s.friction)} C:${Math.round(s.clarity)}`,
                );
              } else if (canIntervene) {
                setStatusText(
                  `READY | I:${Math.round(s.interest)} F:${Math.round(s.friction)} C:${Math.round(s.clarity)}`,
                );
              } else {
                setStatusText(
                  `MONITORING | I:${Math.round(s.interest)} F:${Math.round(s.friction)} C:${Math.round(s.clarity)}`,
                );
              }
            } else {
              const action = data.contract.recommended_actions?.[0];
              if (action && action.action_type !== "none") {
                setStatusText("Intervention Pending");
              } else if (
                data.contract.intent_state?.primary_intent ===
                "abandonment_risk"
              ) {
                setStatusText("Risk: High");
              } else {
                setStatusText("Monitoring");
              }
            }
          }
        } else if (data.type === "analytics_update") {
          setAnalyticsData(data.analytics!);
        } else if (data.type === "reset") {
          setTrackingLogs([]);
          setAnalystLogs([]);
          setAnalyticsData(null);
          setCurrentContract(null);
          setSessionScores(null);
          setDetectedFrictions([]);
          setInterventionLog([]);
          setCurrentIntervention(null);
          setStatusText("Analyst Standing By");
        }
      } catch (e) {
        console.error(e);
      }
    };
    return () => ws.close();
  }, []);

  // Auto-scroll for Live Feed
  useEffect(() => {
    if (
      liveFeedScrollRef.current &&
      !liveFeedUserScrolled &&
      activeTab === "live"
    ) {
      liveFeedScrollRef.current.scrollTo({
        top: liveFeedScrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [trackingLogs, liveFeedUserScrolled, activeTab]);

  // Auto-scroll for Analyst stream
  useEffect(() => {
    if (
      analystScrollRef.current &&
      !analystUserScrolled &&
      activeTab === "scores"
    ) {
      analystScrollRef.current.scrollTo({
        top: analystScrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [analystLogs, analystUserScrolled, activeTab]);

  const handleLiveFeedScroll = () => {
    if (liveFeedScrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } =
        liveFeedScrollRef.current;
      setLiveFeedUserScrolled(scrollHeight - scrollTop - clientHeight > 50);
    }
  };

  const scrollLiveFeedToBottom = () => {
    setLiveFeedUserScrolled(false);
    liveFeedScrollRef.current?.scrollTo({
      top: liveFeedScrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  };

  const handleAnalystScroll = () => {
    if (analystScrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } =
        analystScrollRef.current;
      setAnalystUserScrolled(scrollHeight - scrollTop - clientHeight > 50);
    }
  };

  const scrollAnalystToBottom = () => {
    setAnalystUserScrolled(false);
    analystScrollRef.current?.scrollTo({
      top: analystScrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-stone-950 font-['Inter',system-ui,sans-serif] overflow-hidden text-stone-200">
      {/* Header / Status Banner */}
      <div className="status-banner bg-white/5 border-b border-white/10 text-white px-6 py-4 flex items-center justify-between shadow-lg flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(245,158,11,0.5)]"></div>
          <span className="text-sm font-bold tracking-[0.2em] uppercase text-stone-400 font-serif">
            Analyst Intelligence
          </span>
        </div>
        <div className="flex items-center gap-4"></div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10 bg-black/20 px-0 flex-shrink-0">
        <button
          onClick={() => setActiveTab("live")}
          className={`flex-1 px-6 py-4 font-bold text-xs uppercase tracking-widest transition-all relative ${
            activeTab === "live"
              ? "text-amber-400 bg-white/5"
              : "text-stone-500 hover:text-stone-300 hover:bg-white/5"
          }`}
        >
          Track
          {activeTab === "live" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500"></div>
          )}
        </button>
        <button
          onClick={() => setActiveTab("scores")}
          className={`flex-1 px-6 py-4 font-bold text-xs uppercase tracking-widest transition-all relative ${
            activeTab === "scores"
              ? "text-amber-400 bg-white/5"
              : "text-stone-500 hover:text-stone-300 hover:bg-white/5"
          }`}
        >
          Evaluate
          {activeTab === "scores" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500"></div>
          )}
        </button>
        <button
          onClick={() => setActiveTab("analytics")}
          className={`flex-1 px-6 py-4 font-bold text-xs uppercase tracking-widest transition-all relative ${
            activeTab === "analytics"
              ? "text-amber-400 bg-white/5"
              : "text-stone-500 hover:text-stone-300 hover:bg-white/5"
          }`}
        >
          Intervene
          {activeTab === "analytics" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500"></div>
          )}
        </button>
      </div>

      {activeTab === "live" ? (
        <LiveFeedView
          logs={trackingLogs}
          scrollRef={liveFeedScrollRef as any}
          userHasScrolled={liveFeedUserScrolled}
          onScroll={handleLiveFeedScroll}
          onScrollToBottom={scrollLiveFeedToBottom}
        />
      ) : activeTab === "scores" ? (
        <EvaluationView
          scores={sessionScores}
          analystLogs={analystLogs}
          frictions={detectedFrictions}
          interventionLog={interventionLog}
          analystScrollRef={analystScrollRef as any}
          analystUserHasScrolled={analystUserScrolled}
          onAnalystScroll={handleAnalystScroll}
          onAnalystScrollToBottom={scrollAnalystToBottom}
        />
      ) : (
        <AnalyticsView
          analytics={analyticsData}
          interventionLog={interventionLog}
          currentIntervention={currentIntervention}
          sessionScores={sessionScores}
        />
      )}

      <style>{`
                .custom-scrollbar {
                    scroll-behavior: smooth;
                }
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px !important;
                    -webkit-appearance: none;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: #1c1917;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #44403c;
                    border-radius: 0px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #57534e;
                }
            `}</style>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
