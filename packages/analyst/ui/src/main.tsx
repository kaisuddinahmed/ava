import React, { useEffect, useState, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { AnalystContract, UserEvent } from '@virtual-salesman/shared/types';
import { BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import './index.css';

// --- Types ---
type StreamMessage = {
    type: 'analysis_update' | 'analytics_update' | 'reset';
    event?: UserEvent;
    contract?: AnalystContract;
    narrative?: string[];
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

type Tab = 'live' | 'analytics';

// --- Components ---
const ConfidenceBar = ({ value, label }: { value: number, label: string }) => (
    <div className="mb-4">
        <div className="flex justify-between text-xs uppercase text-stone-400 mb-1">
            <span>{label}</span>
            <span>{(value * 100).toFixed(0)}%</span>
        </div>
        <div className="h-2 bg-stone-800 rounded-full overflow-hidden">
            <div
                className={`h-full transition-all duration-500 ${value > 0.7 ? 'bg-amber-500' : value > 0.4 ? 'bg-orange-500' : 'bg-stone-600'}`}
                style={{ width: `${value * 100}%` }}
            />
        </div>
    </div>
);

const MetricCard = ({ label, value, unit = '', icon }: { label: string, value: number | string, unit?: string, icon?: string }) => {
    return (
        <div className="bg-gradient-to-br from-stone-800/40 to-stone-900/40 p-6 rounded-none border border-white/10 relative overflow-hidden group hover:border-amber-500/30 transition-all">
            <div className="absolute top-0 right-0 text-6xl opacity-10 grayscale">{icon}</div>
            <div className="text-xs text-stone-400 uppercase mb-2 font-semibold tracking-wider font-serif">{label}</div>
            <div className="text-4xl font-bold text-white mb-1 font-serif">{value}{unit}</div>
        </div>
    );
};

const ScoreCard = ({ label, score, type }: { label: string, score: number, type: 'danger' | 'success' }) => {
    const color = type === 'danger' ? 'red' : 'amber';
    // Mapping for Tailwind classes since dynamic string interpolation for generic colors is tricky safely
    // We'll stick to a specific warm palette
    const bgClass = type === 'danger' ? 'from-red-900/40 to-red-950/40' : 'from-amber-900/40 to-amber-950/40';
    const borderClass = type === 'danger' ? 'border-red-900/30' : 'border-amber-900/30';
    const textClass = type === 'danger' ? 'text-red-400' : 'text-amber-400';
    const barBg = type === 'danger' ? 'bg-red-950' : 'bg-amber-950';
    const barFill = type === 'danger' ? 'bg-red-500' : 'bg-amber-500';

    return (
        <div className={`bg-gradient-to-br ${bgClass} p-6 rounded-none border ${borderClass}`}>
            <div className="text-xs text-stone-400 uppercase mb-2 font-semibold tracking-wider font-serif">{label}</div>
            <div className="flex items-end gap-3">
                <div className={`text-5xl font-bold text-white font-serif`}>{score}%</div>
                <div className={`text-sm ${textClass} mb-2 font-bold`}>
                    {type === 'danger' ? (score > 70 ? 'HIGH' : score > 40 ? 'MEDIUM' : 'LOW') :
                        (score > 70 ? 'HIGH' : score > 40 ? 'MEDIUM' : 'LOW')}
                </div>
            </div>
            <div className={`w-full h-1 ${barBg} mt-4`}>
                <div className={`h-full ${barFill} transition-all`} style={{ width: `${score}%` }}></div>
            </div>
        </div>
    );
};

// Error Boundary
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: any }> {
    constructor(props: any) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error: any) { return { hasError: true, error }; }
    componentDidCatch(error: any, errorInfo: any) { console.error("Uncaught error:", error, errorInfo); }
    render() {
        if (this.state.hasError) return <div className="p-8 text-red-500">CRITICAL ERROR: {this.state.error?.toString()}</div>;
        return this.props.children;
    }
}

// Terminal View Component (Tab 1)
function TerminalView({ logs, scrollRef, userHasScrolled, onScroll, onScrollToBottom }: {
    logs: string[];
    scrollRef: React.RefObject<HTMLDivElement>;
    userHasScrolled: boolean;
    onScroll: () => void;
    onScrollToBottom: () => void;
}) {
    return (
        <div className="flex-1 min-h-0 relative bg-black/40">
            <div
                ref={scrollRef}
                onScroll={onScroll}
                className="absolute inset-0 overflow-y-scroll p-6 custom-scrollbar"
            >
                <div className="space-y-2">
                    {logs.map((line, idx) => {
                        const isTracking = line.includes('TRACKING:');
                        const isAnalyst = line.includes('ANALYST:');
                        const isTimestamp = line.match(/^\[\d{1,2}:\d{2}(:\d{2})?\s*(AM|PM)?\]$/);

                        let className = "text-stone-300 font-['JetBrains_Mono',monospace]";

                        if (isTimestamp) {
                            className = "text-stone-600 text-xs mt-4 font-bold tracking-widest";
                        } else if (isAnalyst) {
                            className = "text-amber-400 font-bold font-['JetBrains_Mono',monospace] pl-4 border-l-2 border-amber-500/50";
                        } else if (isTracking) {
                            className = "text-stone-400 font-['JetBrains_Mono',monospace] pl-4 border-l-2 border-stone-800";
                        }

                        if (line.includes('DETECTED') || line.includes('WARNING') || line.includes('⚠️')) {
                            className += " text-orange-400 font-bold";
                        }

                        if (line.includes('>>>')) {
                            className += " text-red-400 animate-pulse";
                        }

                        return (
                            <div key={idx} className={className + " leading-relaxed text-sm py-0.5"}>
                                {line}
                            </div>
                        );
                    })}
                    {logs.length === 0 && (
                        <div className="text-stone-600 italic text-center py-20 font-serif">
                            <div className="text-4xl mb-4 grayscale opacity-50">🧠</div>
                            <div className="tracking-widest uppercase text-xs">Initializing StyleHub Intelligence...</div>
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

// Analytics View Component (Tab 2)
function AnalyticsView({ analytics }: { analytics: AnalyticsData | null }) {
    if (!analytics) {
        return (
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-black/20">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center py-20">
                        <h2 className="text-3xl font-bold text-white mb-4 font-serif">Awaiting Data...</h2>
                        <p className="text-stone-500 uppercase tracking-widest text-xs">Analytics disabled until user session begins</p>
                    </div>
                </div>
            </div>
        );
    }

    // Prepare chart data
    const frictionData = Object.entries(analytics.frictionBreakdown).map(([name, value]) => ({
        name: name.replace('_', ' '),
        value
    }));

    const interventionData = Object.entries(analytics.interventionBreakdown).map(([name, value]) => ({
        name: name.replace('_', ' '),
        value
    }));

    const funnelData = [
        { stage: 'Browsed', count: analytics.funnel.browsed, fill: '#57534e' }, // stone-600
        { stage: 'Added to Cart', count: analytics.funnel.addedToCart, fill: '#d97706' }, // amber-600
        { stage: 'Checked Out', count: analytics.funnel.checkedOut, fill: '#f59e0b' } // amber-500
    ];

    const COLORS = ['#78716c', '#a8a29e', '#d6d3d1', '#f59e0b', '#d97706', '#b45309']; // Stones & Ambers

    return (
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
            <div className="max-w-7xl mx-auto space-y-8">
                {/* Session Metrics */}
                <div>
                    <h2 className="text-2xl font-bold text-white mb-6 font-serif italic">Session Overview</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <MetricCard label="Total Sessions" value={analytics.totalSessions} icon="👥" />
                        <MetricCard label="Active Now" value={analytics.activeSessions} icon="🟢" />
                        <MetricCard label="Avg Duration" value={Math.round(analytics.avgSessionDuration / 1000)} unit="s" icon="⏱️" />
                        <MetricCard label="Conversion Rate" value={analytics.conversionRate.toFixed(1)} unit="%" icon="💰" />
                    </div>
                </div>

                {/* Predictive Scores */}
                {analytics.predictiveScores && (
                    <div>
                        <h2 className="text-2xl font-bold text-white mb-6 font-serif italic">Predictive Intelligence</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <ScoreCard label="Exit Probability" score={analytics.predictiveScores.exitProbability} type="danger" />
                            <ScoreCard label="Purchase Probability" score={analytics.predictiveScores.purchaseProbability} type="success" />
                        </div>
                    </div>
                )}

                {/* Charts Row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Friction Breakdown */}
                    <div className="bg-white/5 p-6 rounded-none border border-white/10">
                        <h3 className="text-xl font-bold text-white mb-6 font-serif">Friction Breakdown</h3>
                        {frictionData.length > 0 ? (
                            <ResponsiveContainer width="100%" height={300}>
                                <PieChart>
                                    <Pie
                                        data={frictionData}
                                        cx="50%"
                                        cy="50%"
                                        labelLine={false}
                                        label={({ name, percent }) => `${name}: ${((percent || 0) * 100).toFixed(0)}%`}
                                        outerRadius={80}
                                        fill="#8884d8"
                                        stroke="none"
                                        dataKey="value"
                                    >
                                        {frictionData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip contentStyle={{ backgroundColor: '#1c1917', border: '1px solid #44403c' }} />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-[300px] flex items-center justify-center text-stone-600 uppercase text-xs tracking-widest">
                                No friction data yet
                            </div>
                        )}
                    </div>

                    {/* Intervention Analytics */}
                    <div className="bg-white/5 p-6 rounded-none border border-white/10">
                        <h3 className="text-xl font-bold text-white mb-6 font-serif">Intervention Analytics</h3>
                        {interventionData.length > 0 ? (
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={interventionData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#292524" />
                                    <XAxis dataKey="name" stroke="#78716c" tick={{ fill: '#78716c', fontSize: 10 }} />
                                    <YAxis stroke="#78716c" tick={{ fill: '#78716c' }} />
                                    <Tooltip contentStyle={{ backgroundColor: '#1c1917', border: '1px solid #44403c' }} />
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

                {/* Funnel Visualization */}
                <div className="bg-white/5 p-6 rounded-none border border-white/10">
                    <h3 className="text-xl font-bold text-white mb-6 font-serif">Conversion Funnel</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={funnelData} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" stroke="#292524" />
                            <XAxis type="number" stroke="#78716c" tick={{ fill: '#78716c' }} />
                            <YAxis dataKey="stage" type="category" stroke="#78716c" tick={{ fill: '#78716c', fontSize: 12, width: 100 }} width={100} />
                            <Tooltip contentStyle={{ backgroundColor: '#1c1917', border: '1px solid #44403c' }} />
                            <Bar dataKey="count" fill="#8b5cf6">
                                {funnelData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.fill} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                    <div className="mt-4 grid grid-cols-3 gap-4 text-center">
                        <div>
                            <div className="text-2xl font-bold text-stone-400 font-serif">{analytics.funnel.browsed}</div>
                            <div className="text-xs text-stone-600 uppercase tracking-wider">Browsed</div>
                        </div>
                        <div>
                            <div className="text-2xl font-bold text-amber-600 font-serif">{analytics.funnel.addedToCart}</div>
                            <div className="text-xs text-stone-600 uppercase tracking-wider">Added to Cart ({((analytics.funnel.addedToCart / (analytics.funnel.browsed || 1)) * 100).toFixed(1)}%)</div>
                        </div>
                        <div>
                            <div className="text-2xl font-bold text-amber-400 font-serif">{analytics.funnel.checkedOut}</div>
                            <div className="text-xs text-stone-600 uppercase tracking-wider">Checked Out ({((analytics.funnel.checkedOut / (analytics.funnel.addedToCart || 1)) * 100).toFixed(1)}%)</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function App() {
    const [activeTab, setActiveTab] = useState<Tab>('live');
    const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
    const [currentContract, setCurrentContract] = useState<AnalystContract | null>(null);
    const [statusText, setStatusText] = useState<string>('Analyst Standing By');
    const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [userHasScrolled, setUserHasScrolled] = useState(false);

    useEffect(() => {
        const ws = new WebSocket('ws://localhost:3000');
        ws.onmessage = (msg) => {
            try {
                const data = JSON.parse(msg.data) as StreamMessage;

                if (data.type === 'analysis_update') {
                    if (data.narrative && data.narrative.length > 0) {
                        setTerminalLogs(prev => [...prev.slice(-200), ...data.narrative!]);
                    } else if (data.event) {
                        // Skip background events for clearer filtering
                        const backgroundEvents = ['cursor_stream', 'idle', 'network_speed', 'heartbeat', 'device_context', 'attention', 'scroll', 'scroll_depth', 'session_journey'];
                        if (!backgroundEvents.includes(data.event!.event_type)) {
                            const time = new Date().toLocaleTimeString();
                            setTerminalLogs(prev => [...prev.slice(-200), `[${time}] ANALYST: Processed event ${data.event!.event_type}`]);
                        }
                    }

                    if (data.contract) {
                        setCurrentContract(data.contract);

                        const action = data.contract.recommended_actions[0];
                        if (action && action.action_type !== 'none') {
                            setStatusText('Intervention Pending');
                        } else if (data.contract.intent_state.primary_intent === 'abandonment_risk') {
                            setStatusText('Risk: High');
                        } else {
                            setStatusText('Monitoring');
                        }
                    }
                } else if (data.type === 'analytics_update') {
                    setAnalyticsData(data.analytics!);
                } else if (data.type === 'reset') {
                    setTerminalLogs([]);
                    setAnalyticsData(null);
                    setCurrentContract(null);
                    setStatusText('Analyst Standing By');
                }
            } catch (e) { console.error(e); }
        };
        return () => ws.close();
    }, []);

    useEffect(() => {
        if (scrollRef.current && !userHasScrolled && activeTab === 'live') {
            scrollRef.current.scrollTo({
                top: scrollRef.current.scrollHeight,
                behavior: 'smooth'
            });
        }
    }, [terminalLogs, userHasScrolled, activeTab]);

    const handleScroll = () => {
        if (scrollRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
            const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
            setUserHasScrolled(!isAtBottom);
        }
    };

    const scrollToBottom = () => {
        setUserHasScrolled(false);
        if (scrollRef.current) {
            scrollRef.current.scrollTo({
                top: scrollRef.current.scrollHeight,
                behavior: 'smooth'
            });
        }
    };

    return (
        <div className="h-screen w-screen flex flex-col bg-stone-950 font-['Inter',system-ui,sans-serif] overflow-hidden text-stone-200">
            {/* Header / Status Banner */}
            <div className="status-banner bg-white/5 border-b border-white/10 text-white px-6 py-4 flex items-center justify-between shadow-lg flex-shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(245,158,11,0.5)]"></div>
                    <span className="text-sm font-bold tracking-[0.2em] uppercase text-stone-400 font-serif">Analyst Intelligence</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-amber-500">{statusText}</span>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-white/10 bg-black/20 px-0 flex-shrink-0">
                <button
                    onClick={() => setActiveTab('live')}
                    className={`flex-1 px-6 py-4 font-bold text-xs uppercase tracking-widest transition-all relative ${activeTab === 'live'
                        ? 'text-amber-400 bg-white/5'
                        : 'text-stone-500 hover:text-stone-300 hover:bg-white/5'
                        }`}
                >
                    Live Feed
                    {activeTab === 'live' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500"></div>
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('analytics')}
                    className={`flex-1 px-6 py-4 font-bold text-xs uppercase tracking-widest transition-all relative ${activeTab === 'analytics'
                        ? 'text-amber-400 bg-white/5'
                        : 'text-stone-500 hover:text-stone-300 hover:bg-white/5'
                        }`}
                >
                    Dashboard
                    {activeTab === 'analytics' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500"></div>
                    )}
                </button>
            </div>

            {activeTab === 'live' ? (
                <TerminalView
                    logs={terminalLogs}
                    scrollRef={scrollRef as any}
                    userHasScrolled={userHasScrolled}
                    onScroll={handleScroll}
                    onScrollToBottom={scrollToBottom}
                />
            ) : (
                <AnalyticsView analytics={analyticsData} />
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

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><ErrorBoundary><App /></ErrorBoundary></React.StrictMode>);
