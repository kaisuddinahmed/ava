import { h } from 'preact';
import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { AnalystContract, UserEvent, ActionType } from '../../shared/types';
import { markIntervention } from './store/store.ts';
import { v4 as uuidv4 } from 'uuid';

import './index.css';

// --- Services ---

const SESSION_KEY = 'sales_agent_session_id';
function getSessionId() {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
        id = uuidv4();
        sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
}

const API_URL = 'http://localhost:3000/api/event';

async function sendEvent(eventType: UserEvent['event_type'], payload?: any): Promise<AnalystContract | null> {
    const event: UserEvent = {
        session_id: getSessionId(),
        event_type: eventType,
        url: window.location.href, // In real app, this would be the host window's URL
        payload: payload,
        timestamp: new Date().toISOString()
    };

    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(event)
        });
        return await res.json() as AnalystContract;
    } catch (err) {
        console.error("Failed to sync with Analyst:", err);
        return null;
    }
}

// --- Voice Hook ---
function useVoice(isMuted: boolean) {
    const [isSpeaking, setIsSpeaking] = useState(false);

    // Stable reference for speak function
    const speak = useCallback((text: string) => {
        if (!window.speechSynthesis || isMuted) return;

        // Cancel any ongoing speech
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        // Try to select a "Google US English" voice or similar if available
        const voices = window.speechSynthesis.getVoices();
        const preferred = voices.find(v => v.name.includes('Google US English')) || voices.find(v => v.lang.startsWith('en'));
        if (preferred) utterance.voice = preferred;

        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => setIsSpeaking(false);

        // Yield to main thread to prevent UI freeze
        setTimeout(() => {
            window.speechSynthesis.speak(utterance);
        }, 0);
    }, [isMuted]);

    return { speak, isSpeaking };
}

// ... (SignalDetector omitted, unchanged) ...
// --- Signal Detector Hook ---
function useSignalDetector(sendEvent: (type: any, payload?: any) => Promise<AnalystContract | null>) {
    // Idle Detection
    useEffect(() => {
        let idleTimer: any;
        const resetIdle = () => {
            clearTimeout(idleTimer);
            idleTimer = setTimeout(() => {
                sendEvent('idle', { duration: 5000 });
            }, 5000); // 5s idle for demo (usually 30s)
        };

        window.addEventListener('mousemove', resetIdle);
        window.addEventListener('click', resetIdle);
        window.addEventListener('scroll', resetIdle);

        resetIdle(); // Start timer
        return () => {
            window.removeEventListener('mousemove', resetIdle);
            window.removeEventListener('click', resetIdle);
            window.removeEventListener('scroll', resetIdle);
            clearTimeout(idleTimer);
        };
    }, [sendEvent]);

    // Exit Intent (Mouse leave top of window)
    useEffect(() => {
        let lastExitTime = 0;
        const handleMouseLeave = (e: MouseEvent) => {
            if (e.clientY <= 0) {
                const now = Date.now();
                if (now - lastExitTime > 5000) { // Limit to once every 5 seconds
                    lastExitTime = now;
                    sendEvent('exit_intent', { position: { x: e.clientX, y: e.clientY } });
                }
            }
        };
        document.addEventListener('mouseleave', handleMouseLeave);
        return () => document.removeEventListener('mouseleave', handleMouseLeave);
    }, [sendEvent]);

    // Scroll Depth
    useEffect(() => {
        let maxScroll = 0;
        const handleScroll = () => {
            const percent = Math.round((window.scrollY + window.innerHeight) / document.body.scrollHeight * 100);
            if (percent > maxScroll + 20) { // Report every 20%
                maxScroll = percent;
                sendEvent('scroll_depth', { depth: percent });
            }
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, [sendEvent]);

    // Click Rage
    useEffect(() => {
        let clicks: number[] = [];
        const handleClick = (e: MouseEvent) => {
            const now = Date.now();
            clicks.push(now);
            clicks = clicks.filter(t => now - t < 800);

            if (clicks.length >= 3) {
                sendEvent('click_rage', { count: clicks.length, target: (e.target as HTMLElement).tagName });
                clicks = [];
            }
        };
        document.addEventListener('click', handleClick);
        return () => document.removeEventListener('click', handleClick);
    }, [sendEvent]);

    // Session Journey Tracking
    useEffect(() => {
        const journeyPath: Array<{ url: string; timestamp: number; duration: number }> = [];
        let currentPageStart = Date.now();
        let currentUrl = window.location.href;

        const trackPageChange = () => {
            const now = Date.now();
            const duration = now - currentPageStart;

            if (currentUrl !== window.location.href) {
                journeyPath.push({
                    url: currentUrl,
                    timestamp: currentPageStart,
                    duration
                });

                currentUrl = window.location.href;
                currentPageStart = now;

                sendEvent('session_journey', { path: journeyPath });
            }
        };

        const handleBeforeUnload = () => {
            const duration = Date.now() - currentPageStart;
            journeyPath.push({
                url: currentUrl,
                timestamp: currentPageStart,
                duration
            });
            sendEvent('session_journey', { path: journeyPath });
        };

        window.addEventListener('hashchange', trackPageChange);
        window.addEventListener('popstate', trackPageChange);
        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            window.removeEventListener('hashchange', trackPageChange);
            window.removeEventListener('popstate', trackPageChange);
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [sendEvent]);

    // Enhanced Element Hover with Product Context
    useEffect(() => {
        const hoverTimers = new Map<HTMLElement, number>();

        const handleMouseEnter = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const productCard = target.closest('.product-card') as HTMLElement;

            // Only track hovers on product-related elements
            if (!productCard) return; // Skip non-product elements

            let elementType = 'product_card';
            const productId = productCard.dataset.id;

            // Identify specific element types within product card
            if (target.classList.contains('price-tag') || target.closest('[data-analyze="price"]')) {
                elementType = 'product_price';
            } else if (target.tagName === 'IMG' || target.closest('img')) {
                elementType = 'product_image';
            } else if (target.classList.contains('btn-add') || target.closest('.btn-add')) {
                elementType = 'add_to_cart_btn';
            } else if (target.classList.contains('product-title') || target.closest('.product-title')) {
                elementType = 'product_name';
            }

            const startTime = Date.now();
            const timer = window.setTimeout(() => {
                const duration = Date.now() - startTime;
                if (duration > 1000) { // Only track meaningful hovers (>1s)
                    sendEvent('element_hover', {
                        element_type: elementType,
                        product_id: productId,
                        hover_duration_ms: duration
                    });
                }
            }, 1000);

            hoverTimers.set(target, timer);
        };

        const handleMouseLeave = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const timer = hoverTimers.get(target);
            if (timer) {
                clearTimeout(timer);
                hoverTimers.delete(target);
            }
        };

        document.addEventListener('mouseenter', handleMouseEnter, true);
        document.addEventListener('mouseleave', handleMouseLeave, true);

        return () => {
            hoverTimers.forEach(timer => clearTimeout(timer));
            document.removeEventListener('mouseenter', handleMouseEnter, true);
            document.removeEventListener('mouseleave', handleMouseLeave, true);
        };
    }, [sendEvent]);

    // P1: Browsing Pattern Detection
    useEffect(() => {
        let scrollCount = 0;
        let searchCount = 0;
        let productClickCount = 0;
        let pageViewCount = 0;
        let patternStartTime = Date.now();

        const resetPattern = () => {
            scrollCount = 0;
            searchCount = 0;
            productClickCount = 0;
            pageViewCount = 0;
            patternStartTime = Date.now();
        };

        const checkPattern = () => {
            const timeElapsed = Date.now() - patternStartTime;

            // Pattern: Scrolling without clicking (5-7 min, 50+ scrolls)
            if (timeElapsed > 5 * 60 * 1000 && scrollCount > 50 && productClickCount === 0) {
                sendEvent('browsing_pattern', {
                    pattern: 'scroll_without_click',
                    metrics: {
                        scroll_count: scrollCount,
                        product_clicks: productClickCount,
                        time_browsing: timeElapsed
                    }
                });
                resetPattern();
            }
            // Pattern: Multiple searches without clicks (frustration) - 4+ searches, 3+ min
            else if (searchCount >= 4 && productClickCount === 0 && timeElapsed > 3 * 60 * 1000) {
                sendEvent('browsing_pattern', {
                    pattern: 'searching_frustrated',
                    metrics: {
                        searches_made: searchCount,
                        product_clicks: productClickCount,
                        time_browsing: timeElapsed
                    }
                });
                resetPattern();
            }
        };

        const handleScroll = () => {
            scrollCount++;
            checkPattern();
        };

        const handleClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (target.closest('.product-card') || target.closest('.product-trigger')) {
                productClickCount++;
            }
        };

        // Listen to window.DemoTrigger for search events
        const originalTrigger = (window as any).DemoTrigger;
        (window as any).DemoTrigger = (type: string, payload: any) => {
            if (type === 'search') searchCount++;
            if (originalTrigger) originalTrigger(type, payload);
            checkPattern();
        };

        window.addEventListener('scroll', handleScroll);
        document.addEventListener('click', handleClick);

        const interval = setInterval(checkPattern, 10000); // Check every 10s

        return () => {
            window.removeEventListener('scroll', handleScroll);
            document.removeEventListener('click', handleClick);
            clearInterval(interval);
        };
    }, [sendEvent]);

    // P2: Search Action Tracking
    useEffect(() => {
        const searchInput = document.getElementById('store-search') as HTMLInputElement;
        if (!searchInput) return;

        let typingTimer: any;
        let queryStartTime = Date.now();

        const handleFocus = () => {
            queryStartTime = Date.now();
            sendEvent('search_action', { action: 'focus' });
        };

        const handleInput = () => {
            clearTimeout(typingTimer);
            typingTimer = setTimeout(() => {
                const query = searchInput.value;
                const timeToType = Date.now() - queryStartTime;
                if (query.length > 0) {
                    sendEvent('search_action', {
                        action: 'typing',
                        query,
                        query_length: query.length,
                        time_to_type: timeToType
                    });
                }
            }, 500);
        };

        searchInput.addEventListener('focus', handleFocus);
        searchInput.addEventListener('input', handleInput);

        return () => {
            searchInput.removeEventListener('focus', handleFocus);
            searchInput.removeEventListener('input', handleInput);
            clearTimeout(typingTimer);
        };
    }, [sendEvent]);

    // P2: Attention Indicators
    useEffect(() => {
        const handleVisibilityChange = () => {
            const signal = document.hidden ? 'tab_hidden' : 'tab_visible';
            sendEvent('attention', { signal, page_url: window.location.href });
        };

        const handleWindowFocus = () => {
            sendEvent('attention', { signal: 'window_focused', page_url: window.location.href });
        };

        const handleWindowBlur = () => {
            sendEvent('attention', { signal: 'window_blurred', page_url: window.location.href });
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('focus', handleWindowFocus);
        window.addEventListener('blur', handleWindowBlur);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('focus', handleWindowFocus);
            window.removeEventListener('blur', handleWindowBlur);
        };
    }, [sendEvent]);

    // P2: Cursor Position Stream (Sampled)
    useEffect(() => {
        let cursorBuffer: Array<{ x: number; y: number; timestamp: number }> = [];
        let lastSample = 0;

        const handleMouseMove = (e: MouseEvent) => {
            const now = Date.now();
            if (now - lastSample < 100) return; // Sample every 100ms

            lastSample = now;
            cursorBuffer.push({
                x: e.clientX,
                y: e.clientY,
                timestamp: now
            });

            // Send batch every 5 seconds
            if (cursorBuffer.length >= 50) {
                sendEvent('cursor_stream', {
                    positions: cursorBuffer,
                    count: cursorBuffer.length
                });
                cursorBuffer = [];
            }
        };

        document.addEventListener('mousemove', handleMouseMove);

        const interval = setInterval(() => {
            if (cursorBuffer.length > 0) {
                sendEvent('cursor_stream', {
                    positions: cursorBuffer,
                    count: cursorBuffer.length
                });
                cursorBuffer = [];
            }
        }, 5000);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            clearInterval(interval);
        };
    }, [sendEvent]);

    // P3: Filter Usage Tracking
    useEffect(() => {
        const filterButtons = document.querySelectorAll('[data-filter]');
        const filterHistory: Array<{ filter: string; timestamp: number }> = [];

        const handleFilterClick = (e: Event) => {
            const target = e.currentTarget as HTMLElement;
            const filterValue = target.dataset.filter;
            const now = Date.now();

            filterHistory.push({ filter: filterValue || 'unknown', timestamp: now });

            // Detect rapid filter changes (indecision)
            const recentFilters = filterHistory.filter(f => now - f.timestamp < 10000);
            if (recentFilters.length >= 3) {
                sendEvent('filter_usage', {
                    pattern: 'rapid_change',
                    filters: recentFilters.map(f => f.filter),
                    count: recentFilters.length
                });
            } else {
                sendEvent('filter_usage', {
                    pattern: 'single_change',
                    filter: filterValue
                });
            }
        };

        filterButtons.forEach(btn => {
            btn.addEventListener('click', handleFilterClick);
        });

        return () => {
            filterButtons.forEach(btn => {
                btn.removeEventListener('click', handleFilterClick);
            });
        };
    }, [sendEvent]);

    // P3: Device Context Detection
    useEffect(() => {
        const deviceContext = {
            device_type: /Mobile|Android|iPhone/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
            screen_width: window.screen.width,
            screen_height: window.screen.height,
            viewport_width: window.innerWidth,
            viewport_height: window.innerHeight,
            user_agent: navigator.userAgent,
            platform: navigator.platform,
            connection: (navigator as any).connection ? {
                effective_type: (navigator as any).connection.effectiveType,
                downlink: (navigator as any).connection.downlink,
                rtt: (navigator as any).connection.rtt
            } : null
        };

        sendEvent('device_context', deviceContext);
    }, [sendEvent]);

    // P3: Network Speed Estimation
    useEffect(() => {
        if (!(navigator as any).connection) return;

        const connection = (navigator as any).connection;
        const handleConnectionChange = () => {
            sendEvent('network_speed', {
                effective_type: connection.effectiveType,
                downlink: connection.downlink,
                rtt: connection.rtt,
                save_data: connection.saveData
            });
        };

        connection.addEventListener('change', handleConnectionChange);
        return () => connection.removeEventListener('change', handleConnectionChange);
    }, [sendEvent]);

    // --- PHASE 3: FRICTION SIGNAL DETECTORS ---

    // 1. Text Selection & Copy (Price Sensitivity / Comparison)
    useEffect(() => {
        const handleSelection = () => {
            const selection = document.getSelection();
            if (!selection || selection.toString().length === 0) return;

            const text = selection.toString();
            const anchorNode = selection.anchorNode?.parentElement;

            // Check if selecting price or product title
            let context = 'unknown';
            if (anchorNode?.closest('[data-analyze="price"]') || anchorNode?.classList.contains('price-tag')) {
                context = 'price';
            } else if (anchorNode?.closest('.product-title')) {
                context = 'product_name';
            }

            if (context !== 'unknown') {
                // Debounce sending event
                sendEvent('text_selection', { text, context });
            }
        };

        const handleCopy = () => {
            const selection = document.getSelection();
            if (!selection) return;
            const text = selection.toString();
            sendEvent('copy_action', { text }); // Strong comparison signal
        };

        document.addEventListener('selectionchange', () => {
            // Simple debounce
            setTimeout(handleSelection, 1000);
        });
        document.addEventListener('copy', handleCopy);

        return () => {
            document.removeEventListener('copy', handleCopy);
        };
    }, [sendEvent]);

    // 2. Scroll Velocity (Doom Scrolling)
    useEffect(() => {
        let lastScrollY = window.scrollY;
        let lastTime = Date.now();
        let highVelocityFrames = 0;

        const handleScroll = () => {
            const now = Date.now();
            const dt = now - lastTime;
            if (dt < 50) return; // Sample every 50ms

            const dy = Math.abs(window.scrollY - lastScrollY);
            const velocity = (dy / dt) * 1000; // px per second

            lastScrollY = window.scrollY;
            lastTime = now;

            // Definition of "Doom Scrolling": Sustained high speed, ignoring content
            if (velocity > 800) { // >800px/s is very fast
                highVelocityFrames++;
            } else {
                highVelocityFrames = Math.max(0, highVelocityFrames - 1);
            }

            if (highVelocityFrames > 10) { // ~0.5s of intense scrolling
                sendEvent('scroll_velocity', { velocity, sustained: true });
                highVelocityFrames = 0; // Reset to avoid spam
            }
        };

        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, [sendEvent]);

    // 3. Footer Interaction (Trust / Gift)
    useEffect(() => {
        const handleFooterClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const link = target.closest('a');

            if (link && link.dataset.analyze) {
                const analysisType = link.dataset.analyze;
                sendEvent('footer_interaction', { type: analysisType });
            }
        };

        const footer = document.querySelector('footer');
        if (footer) footer.addEventListener('click', handleFooterClick);

        return () => {
            if (footer) footer.removeEventListener('click', handleFooterClick);
        };
    }, [sendEvent]);
}

// --- Components ---

import { Heatmap } from './components/Heatmap';

export function App() {
    const [contract, setContract] = useState<AnalystContract | null>(null);
    const [uiMode, setUiMode] = useState<'hidden' | 'bubble' | 'full'>('hidden'); // NEW: UI Modes
    const [isMuted, setIsMuted] = useState(false); // NEW: Mute State
    const [showHeatmap, setShowHeatmap] = useState(false); // NEW: Heatmap State

    const { speak } = useVoice(isMuted);
    const hasSpokenRef = useRef<string | null>(null);

    // Wrapper for sending events that updates local contract state
    // MEMOIZED to prevent Effect trashing in useSignalDetector
    const handleEvent = useCallback(async (type: any, payload?: any) => {
        console.log(`[Widget] Sending signal: ${type}`, payload);
        const newContract = await sendEvent(type, payload);
        if (newContract) setContract(newContract);
        return newContract;
    }, []);

    // Activate Detectors
    useSignalDetector(handleEvent);

    // --- DEMO TRIGGER EXPOSURE ---
    // Allow the host page (index.html) to trigger events manually via window.DemoTrigger()
    useEffect(() => {
        (window as any).DemoTrigger = (type: string, payload: any) => {
            handleEvent(type as any, payload);
        };
    }, [handleEvent]);

    // 1. Initial Page Load & Navigation Tracking
    useEffect(() => {
        // Helper to get page name from URL
        const getPageName = (pathname: string): string => {
            if (pathname === '/' || pathname === '') return 'Home';
            if (pathname.includes('/checkout')) return 'Checkout';
            // Extract page name from path (e.g., '/laptops' -> 'Laptops')
            const segments = pathname.split('/').filter(Boolean);
            if (segments.length > 0) {
                const pageName = segments[0].charAt(0).toUpperCase() + segments[0].slice(1);
                return pageName;
            }
            return 'Home';
        };

        // Detect first visit (session_started)
        const isFirstVisit = !sessionStorage.getItem('analyst_session_started');
        const pageName = getPageName(window.location.pathname);

        if (isFirstVisit) {
            sessionStorage.setItem('analyst_session_started', 'true');
            handleEvent('session_started', { entry_page: pageName });
        } else {
            // Subsequent navigation
            handleEvent('page_navigation', {
                page_name: pageName,
                page_type: ['laptops', 'audio', 'wearables', 'accessories'].includes(window.location.pathname.toLowerCase().slice(1)) ? 'collection' : 'page'
            });
        }

        // Initial heartbeat/view_item
        handleEvent('view_item', { page: pageName });

        // Monitor for Friction (Simple Hover detection for demo)
        let lastHoverTime = 0;
        const handleMouseOver = (e: MouseEvent) => {
            const now = Date.now();
            if (now - lastHoverTime < 500) return; // Limit check to every 500ms

            const target = e.target as HTMLElement;
            if (target.dataset.analyze === 'price') {
                handleEvent('hover', { element: 'price' });
                lastHoverTime = now;
            }
        };

        document.addEventListener('mouseover', handleMouseOver);
        return () => document.removeEventListener('mouseover', handleMouseOver);
    }, [handleEvent]);

    // Track navigation clicks (for client-side routing with href="#")
    useEffect(() => {
        const handleNavClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const link = target.closest('a');

            if (link) {
                // Check if it's a category navigation link (uses href="#" with class "nav-category")
                if (link.classList.contains('nav-category')) {
                    const categoryName = link.textContent?.trim() || 'Unknown';

                    // Delay to let navigation happen first
                    setTimeout(() => {
                        handleEvent('page_navigation', {
                            page_name: categoryName,
                            page_type: 'collection'
                        });
                    }, 100);
                }
                // Check if it's the Home link (href="/")
                else if (link.getAttribute('href') === '/' && link.textContent?.trim() === 'Home') {
                    setTimeout(() => {
                        handleEvent('page_navigation', {
                            page_name: 'Home',
                            page_type: 'page'
                        });
                    }, 100);
                }
            }
        };

        document.addEventListener('click', handleNavClick);
        return () => document.removeEventListener('click', handleNavClick);
    }, [handleEvent]);

    const [dismissedUntil, setDismissedUntil] = useState<number>(0);

    // 2. Contract Guard
    const activeAction = contract?.recommended_actions[0];
    const isDismissed = Date.now() < dismissedUntil;
    const shouldReact = activeAction && activeAction.action_type !== 'none' && uiMode === 'hidden' && !isDismissed;

    // Auto-React Logic
    useEffect(() => {
        if (shouldReact && activeAction) {
            // Prevent repeating the same message
            if (hasSpokenRef.current !== activeAction.message_template) {
                // PHASE 2 UPGRADE: Default to 'bubble' (preview) instead of 'full'
                setUiMode(prev => prev === 'hidden' ? 'bubble' : prev);

                // Only speak if it's a "voice" action AND not muted
                if (activeAction.action_type === 'voice_proactive') {
                    speak(activeAction.message_template);
                }
                hasSpokenRef.current = activeAction.message_template;
            }
        }

        // New logic for markIntervention
        if (contract) {
            const action = contract.recommended_actions[0];
            if (action && action.action_type !== 'none') {
                // Mark success for the demo transaction flow
                markIntervention();
            }
        }
    }, [shouldReact, activeAction, speak, contract]);

    const intent = contract?.intent_state.primary_intent;
    const isRisk = intent === 'abandonment_risk';
    const isSuccess = intent === 'purchase';

    const handleDismiss = () => {
        setUiMode('hidden');
        setDismissedUntil(Date.now() + 2 * 60 * 1000); // 2 Minute Cooldown
        console.log("Agent dismissed. Muted for 2 mins.");
    };

    return (
        <>
            {/* Visual Overlay (Fixed) */}
            {isRisk && <div className="risk-pulse" />}
            {isSuccess && <div className="success-glow" />}

            <div className="fixed bottom-4 right-4 z-50 font-sans flex flex-col items-end gap-2">

                <Heatmap active={showHeatmap} />

                {/* Warning if dismissed */}
                {isDismissed && (
                    <div className="text-[10px] text-gray-400 bg-black/50 px-2 py-1 rounded">
                        Silent Mode (Cooldown)
                    </div>
                )}

                {/* 1. PREVIEW BUBBLE */}
                {uiMode === 'bubble' && activeAction && (
                    <div
                        className="bg-white rounded-2xl rounded-tr-none shadow-lg p-3 max-w-xs border border-gray-200 cursor-pointer animate-bounce-subtle hover:bg-gray-50 transition-colors flex items-center gap-3"
                        onClick={() => setUiMode('full')}
                    >
                        <div className="bg-indigo-100 p-2 rounded-full text-indigo-600">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <div>
                            <p className="text-sm font-medium text-gray-900">Suggestion</p>
                            <p className="text-xs text-gray-500 truncate max-w-[160px]">{activeAction.message_template}</p>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); handleDismiss(); }} className="text-gray-400 hover:text-red-500 font-bold px-2">×</button>
                    </div>
                )}

                {/* 2. CHAT WINDOW */}
                {uiMode === 'full' && (
                    <div className="bg-white rounded-lg shadow-xl w-80 overflow-hidden border border-gray-200 flex flex-col animate-fade-in-up">
                        <div className="bg-indigo-600 text-white p-3 flex justify-between items-center">
                            <span className="font-medium text-sm flex items-center gap-2">
                                Virtual Assistant
                                {activeAction?.action_type === 'voice_proactive' && !isMuted && (
                                    <span className="animate-pulse bg-green-400 w-2 h-2 rounded-full"></span>
                                )}
                            </span>
                            <div className="flex items-center gap-2">
                                {/* Mute Toggle */}
                                <button
                                    onClick={(e) => { e.stopPropagation(); setIsMuted(!isMuted); }}
                                    className="text-white/80 hover:text-white p-1 rounded hover:bg-white/10"
                                >
                                    {isMuted ? (
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>
                                    ) : (
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                                    )}
                                </button>
                                <button onClick={handleDismiss} className="text-white hover:text-gray-200">&times;</button>
                            </div>
                        </div>

                        <div className="p-4 h-64 overflow-y-auto bg-gray-50">
                            {activeAction ? (
                                <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-100 text-sm mb-2 text-gray-800">
                                    {activeAction.message_template}
                                </div>
                            ) : (
                                <div className="text-gray-400 text-xs text-center mt-4">How can I help you today?</div>
                            )}
                            {contract && (
                                <div className="mt-4 p-2 bg-gray-100 rounded text-[10px] text-gray-500 font-mono">
                                    Intent: {contract.intent_state.primary_intent} <br />
                                    Conf: {contract.intent_state.confidence}
                                </div>
                            )}
                        </div>

                        <div className="p-3 border-t bg-white">
                            <input type="text" placeholder="Reply..." className="w-full text-sm border-gray-300 rounded-md shadow-sm" disabled />
                        </div>
                    </div>
                )}

                {/* Launcher - 3D Customer Agent Icon */}
                <button
                    onClick={() => setUiMode(uiMode === 'hidden' ? 'full' : 'hidden')}
                    className={`relative bg-gradient-to-br from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 rounded-full p-1 shadow-lg transition-all transform hover:scale-105 overflow-hidden ${isDismissed ? 'opacity-50 grayscale' : ''}`}
                    style={{ width: '64px', height: '64px' }}
                >
                    {/* Light crossing animation */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shine pointer-events-none"></div>

                    {uiMode === 'hidden' ? (
                        <img
                            src="/customer_agent_icon.png"
                            alt="Customer Agent"
                            className="w-full h-full object-contain"
                        />
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 m-auto text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    )}
                </button>
            </div>
        </>
    );
}

import { render } from 'preact';
render(<App />, document.getElementById('sales-agent-root')!);
