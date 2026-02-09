import { h } from 'preact';
import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { AnalystContract, UserEvent, ActionType, InterventionPayload } from '../../shared/types';
import { markIntervention, getCart, getCartTotal, getCartCount } from './store/store.ts';
import { v4 as uuidv4 } from 'uuid';

import './index.css';

// ============================================================
// Session Management
// ============================================================

const SESSION_KEY = 'sales_agent_session_id';
function getSessionId() {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
        id = uuidv4();
        sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
}

// ============================================================
// Context State (module-level for persistence across renders)
// ============================================================

const productContext = {
    current_product: null as any,
    last_product: null as any,
};

const comparisonContext = {
    products: new Map<string, { product_id: string; product_name: string; price: number; view_count: number; last_viewed: number }>(),
};

const searchContext = {
    queries: [] as Array<{ query: string; timestamp: number; results_count: number; clicked_any: boolean }>,
};

const scrollTracker = {
    startTime: Date.now(),
    itemsPassed: 0,
    productClicks: 0,
};

// ============================================================
// Initial Session Tracking
// ============================================================

function useInitialSessionTracking(sendEvent: Function) {
    useEffect(() => {
        const initSession = async () => {
            const navEntries = performance.getEntriesByType('navigation');
            const navType = (navEntries.length > 0) ? (navEntries[0] as PerformanceNavigationTiming).type : 'unknown';
            const legacyType = (performance as any).navigation?.type;
            const isReload = navType === 'reload' || legacyType === 1;

            const isInternal = sessionStorage.getItem('internal_nav') === 'true';
            sessionStorage.removeItem('internal_nav');
            const shouldReset = isReload || !isInternal;

            if (shouldReset) {
                sessionStorage.removeItem(SESSION_KEY);
                sessionStorage.removeItem('has_visited_before');
                sessionStorage.removeItem('analyst_session_started');
            }

            const pathname = window.location.pathname;
            let pageName = "Home";
            let pageType = "home";
            if (pathname.includes("laptops")) { pageName = "Laptops"; pageType = "collection"; }
            else if (pathname.includes("checkout")) { pageName = "Checkout"; pageType = "checkout"; }
            else if (pathname !== "/" && pathname !== "/index.html") { pageName = pathname.replace("/", "").replace(".html", ""); pageType = "page"; }

            await sendEvent('page_loaded', {
                page_name: pageName, page_type: pageType,
                referrer: document.referrer || 'direct', timestamp: Date.now(),
                force_reset: shouldReset
            });

            const hasVisitedBefore = sessionStorage.getItem('has_visited_before');
            if (!hasVisitedBefore) {
                sessionStorage.setItem('has_visited_before', 'true');
                const width = window.innerWidth;
                let deviceType = "desktop";
                if (width < 768) deviceType = "mobile";
                else if (width < 1024) deviceType = "tablet";

                await sendEvent('new_user_detected', {
                    user_agent: navigator.userAgent,
                    screen_size: { width: window.innerWidth, height: window.innerHeight },
                    device_type: deviceType, timestamp: Date.now()
                });
            } else {
                // Returning user
                await sendEvent('existing_user_detected', {
                    session_id: getSessionId(),
                    last_visit: sessionStorage.getItem('last_visit_time') || Date.now(),
                    timestamp: Date.now()
                });
                sessionStorage.setItem('last_visit_time', String(Date.now()));
            }
        };

        initSession();

        const handleLinkClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const link = target.closest('a');
            const navBtn = target.closest('[data-nav="internal"]');
            if (link && (link.href.startsWith(window.location.origin) || link.getAttribute('href')?.startsWith('/'))) {
                sessionStorage.setItem('internal_nav', 'true');
            } else if (navBtn) {
                sessionStorage.setItem('internal_nav', 'true');
            }
        };
        document.addEventListener('click', handleLinkClick);
        return () => document.removeEventListener('click', handleLinkClick);
    }, []);
}

// ============================================================
// Event Sender
// ============================================================

const API_URL = 'http://localhost:3000/api/analyze';

async function sendEvent(eventType: UserEvent['event_type'], payload?: any): Promise<AnalystContract | null> {
    const event: UserEvent = {
        session_id: getSessionId(),
        event_type: eventType,
        url: window.location.href,
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

// ============================================================
// Legacy Bridge: Expose DemoTrigger to Global Scope
// ============================================================
(window as any).DemoTrigger = (type: string, payload: any) => {
    // 1. Send to Analyst API via sendEvent
    sendEvent(type as any, payload);
    
    // 2. Trigger internal context hooks (if any)
    if ((window as any).__contextTrigger) {
        (window as any).__contextTrigger(type, payload);
    }
    
    console.log(`[DemoTrigger] Bridged event: ${type}`, payload);
};

// ============================================================
// Voice Hook - Deepgram Nova TTS
// ============================================================

const TTS_ENDPOINT = 'http://localhost:3000/api/tts';

// Audio context and current audio element for managing playback
let currentAudio: HTMLAudioElement | null = null;

function useVoice(isMuted: boolean) {
    const [isSpeaking, setIsSpeaking] = useState(false);
    const audioCache = useRef<Map<string, string>>(new Map());

    const speak = useCallback(async (text: string) => {
        if (isMuted) return;

        // Stop any currently playing audio
        if (currentAudio) {
            currentAudio.pause();
            currentAudio.currentTime = 0;
            currentAudio = null;
        }

        // Check cache first
        let audioUrl = audioCache.current.get(text);

        if (!audioUrl) {
            try {
                setIsSpeaking(true);

                // Call Deepgram TTS endpoint
                const response = await fetch(TTS_ENDPOINT, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text }),
                });

                if (!response.ok) {
                    // Fallback to browser speech synthesis if TTS fails
                    console.warn('Deepgram TTS failed, falling back to browser speech');
                    fallbackToWebSpeech(text, setIsSpeaking);
                    return;
                }

                // Create blob URL from audio response
                const audioBlob = await response.blob();
                audioUrl = URL.createObjectURL(audioBlob);

                // Cache the audio URL (limit cache size)
                if (audioCache.current.size > 50) {
                    const firstKey = audioCache.current.keys().next().value;
                    if (firstKey) {
                        URL.revokeObjectURL(audioCache.current.get(firstKey)!);
                        audioCache.current.delete(firstKey);
                    }
                }
                audioCache.current.set(text, audioUrl);

            } catch (error) {
                console.error('TTS error:', error);
                // Fallback to browser speech synthesis
                fallbackToWebSpeech(text, setIsSpeaking);
                return;
            }
        }

        // Play the audio
        const audio = new Audio(audioUrl);
        currentAudio = audio;

        audio.onplay = () => setIsSpeaking(true);
        audio.onended = () => {
            setIsSpeaking(false);
            currentAudio = null;
        };
        audio.onerror = () => {
            console.error('Audio playback error');
            setIsSpeaking(false);
            currentAudio = null;
            // Fallback to browser speech
            fallbackToWebSpeech(text, setIsSpeaking);
        };

        try {
            await audio.play();
        } catch (e) {
            console.error('Audio play error:', e);
            setIsSpeaking(false);
        }

    }, [isMuted]);

    // Cleanup audio cache on unmount
    useEffect(() => {
        return () => {
            audioCache.current.forEach((url) => URL.revokeObjectURL(url));
            audioCache.current.clear();
        };
    }, []);

    return { speak, isSpeaking };
}

// Fallback to browser Web Speech API
function fallbackToWebSpeech(text: string, setIsSpeaking: (v: boolean) => void) {
    if (!window.speechSynthesis) {
        setIsSpeaking(false);
        return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v => v.name.includes('Google US English')) || voices.find(v => v.lang.startsWith('en'));
    if (preferred) utterance.voice = preferred;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    setTimeout(() => window.speechSynthesis.speak(utterance), 0);
}

// ============================================================
// Context Tracking Hook
// ============================================================

function useContextTracking(sendEvent: (type: any, payload?: any) => Promise<AnalystContract | null>) {
    // Listen for DemoTrigger events to update local context
    useEffect(() => {
        const origTrigger = (window as any).__contextTrigger;
        (window as any).__contextTrigger = (type: string, payload: any) => {
            // Update product context
            if (type === 'product_viewed' || (type === 'product_detail' && payload?.action === 'opened')) {
                productContext.current_product = {
                    product_id: payload?.product_id || payload?.sku || '',
                    product_name: payload?.product_name || payload?.name || '',
                    price: payload?.price || 0,
                    focus_start: Date.now(),
                };

                // Update comparison context
                const pid = payload?.product_id || payload?.sku;
                if (pid) {
                    const existing = comparisonContext.products.get(pid);
                    if (existing) {
                        existing.view_count++;
                        existing.last_viewed = Date.now();
                    } else {
                        comparisonContext.products.set(pid, {
                            product_id: pid,
                            product_name: payload?.product_name || '',
                            price: payload?.price || 0,
                            view_count: 1,
                            last_viewed: Date.now(),
                        });
                    }
                }
            }

            if (type === 'product_modal_closed' || (type === 'product_detail' && payload?.action === 'closed')) {
                if (productContext.current_product) {
                    productContext.last_product = { ...productContext.current_product, last_interaction: Date.now() };
                    productContext.current_product = null;
                }
            }

            if (type === 'search_query' || type === 'search_zero_results') {
                searchContext.queries.push({
                    query: payload?.query || '',
                    timestamp: Date.now(),
                    results_count: payload?.results_count ?? 0,
                    clicked_any: false,
                });
            }

            if (type === 'product_viewed' || type === 'product_detail') {
                // Mark last search query as clicked
                const lastQ = searchContext.queries[searchContext.queries.length - 1];
                if (lastQ && Date.now() - lastQ.timestamp < 30000) {
                    lastQ.clicked_any = true;
                }
                scrollTracker.productClicks++;
            }

            if (origTrigger) origTrigger(type, payload);
        };
    }, []);



    // Visibility change tracking (for comparison loop detection)
    useEffect(() => {
        const handleVisChange = () => {
            if (document.hidden) {
                sendEvent('visibility_change', { state: 'hidden' });
            }
        };
        document.addEventListener('visibilitychange', handleVisChange);
        return () => document.removeEventListener('visibilitychange', handleVisChange);
    }, [sendEvent]);
}

// ============================================================
// Price Sensitivity Tracking Hook (v2 Redesign)
// ============================================================

function usePriceSensitivityTracking(sendEvent: (type: any, payload?: any) => Promise<AnalystContract | null>) {
    // Sort Tracking with Cycle Detection
    useEffect(() => {
        const sortButtons = document.querySelectorAll('[data-sort]');
        if (sortButtons.length === 0) return;

        const sortHistory: Array<{ value: string; timestamp: number }> = [];

        const handleSortClick = (e: Event) => {
            const target = e.currentTarget as HTMLElement;
            const sortValue = target.dataset.sort || '';
            const now = Date.now();

            sortHistory.push({ value: sortValue, timestamp: now });

            // Detect sort cycling (3+ changes in 30s)
            const recentSorts = sortHistory.filter(s => now - s.timestamp < 30000);
            if (recentSorts.length >= 3) {
                sendEvent('sort_changed', {
                    pattern: 'cycling',
                    sequence: recentSorts.map(s => s.value),
                    count: recentSorts.length,
                    timestamp: now
                });
            } else {
                sendEvent('sort_changed', {
                    sort_type: sortValue,
                    timestamp: now
                });
            }
        };

        sortButtons.forEach(btn => btn.addEventListener('click', handleSortClick));
        return () => sortButtons.forEach(btn => btn.removeEventListener('click', handleSortClick));
    }, [sendEvent]);

    // Price Filter Tracking
    useEffect(() => {
        const priceFilters = document.querySelectorAll('[data-filter-type="price"]');
        if (priceFilters.length === 0) return;

        let lastPriceRange: { min: number; max: number } | null = null;

        const handlePriceFilterChange = (e: Event) => {
            const target = e.currentTarget as HTMLInputElement;
            const min = parseFloat(target.dataset.priceMin || '0');
            const max = parseFloat(target.dataset.priceMax || '999999');

            sendEvent('price_filter_changed', {
                range: { min, max },
                previous_range: lastPriceRange,
                timestamp: Date.now()
            });

            lastPriceRange = { min, max };
        };

        priceFilters.forEach(f => f.addEventListener('change', handlePriceFilterChange));
        return () => priceFilters.forEach(f => f.removeEventListener('change', handlePriceFilterChange));
    }, [sendEvent]);

    // Coupon Exploration Tracking
    useEffect(() => {
        const couponField = document.querySelector('[data-field="coupon"]') as HTMLInputElement;
        const couponSection = document.querySelector('[data-section="coupon"]');

        if (!couponField && !couponSection) return;

        const handleCouponClick = () => {
            sendEvent('coupon_field_clicked', {
                has_items_in_cart: getCart().length > 0,
                cart_value: getCartTotal(),
                timestamp: Date.now()
            });
        };

        let hoverStartTime = 0;
        const handleCouponHover = () => {
            hoverStartTime = Date.now();
        };

        const handleCouponHoverEnd = () => {
            if (hoverStartTime > 0) {
                sendEvent('coupon_exploration', {
                    action: 'hover',
                    duration_ms: Date.now() - hoverStartTime
                });
                hoverStartTime = 0;
            }
        };

        if (couponField) {
            couponField.addEventListener('focus', handleCouponClick);
        }
        if (couponSection) {
            couponSection.addEventListener('mouseenter', handleCouponHover);
            couponSection.addEventListener('mouseleave', handleCouponHoverEnd);
        }

        return () => {
            if (couponField) couponField.removeEventListener('focus', handleCouponClick);
            if (couponSection) {
                couponSection.removeEventListener('mouseenter', handleCouponHover);
                couponSection.removeEventListener('mouseleave', handleCouponHoverEnd);
            }
        };
    }, [sendEvent]);

    // Variant Downgrade Detection (integrate with existing context trigger)
    useEffect(() => {
        const origTrigger = (window as any).__contextTrigger;
        (window as any).__contextTrigger = (type: string, payload: any) => {
            if (type === 'product_variant_changed') {
                const fromPrice = payload?.from_price || 0;
                const toPrice = payload?.to_price || 0;

                if (toPrice < fromPrice && fromPrice > 0) {
                    sendEvent('variant_downgraded', {
                        product_id: payload?.product_id,
                        from_variant: payload?.from_value,
                        to_variant: payload?.to_value,
                        price_decrease: fromPrice - toPrice,
                        timestamp: Date.now()
                    });
                }
            }

            if (origTrigger) origTrigger(type, payload);
        };
    }, [sendEvent]);
}

// ============================================================
// Friction Library v2 Pre-Signal Tracking Hook
// ============================================================

function useFrictionV2Tracking(sendEvent: (type: any, payload?: any) => Promise<AnalystContract | null>) {
    // Filter Reset Pattern Detection
    useEffect(() => {
        const filterButtons = document.querySelectorAll('[data-filter]');
        if (filterButtons.length === 0) return;

        const filterActions: Array<{ filter: string; action: 'apply' | 'remove'; timestamp: number }> = [];

        const handleFilterClick = (e: Event) => {
            const target = e.currentTarget as HTMLElement;
            const filterValue = target.dataset.filter || '';
            const isActive = target.classList.contains('active');
            const action = isActive ? 'remove' : 'apply';
            const now = Date.now();

            filterActions.push({ filter: filterValue, action, timestamp: now });

            // Detect reset loop (apply → remove → apply within 20s)
            const recentActions = filterActions.filter(f => now - f.timestamp < 20000);
            const sameFilterActions = recentActions.filter(f => f.filter === filterValue);

            if (sameFilterActions.length >= 3) {
                const pattern = sameFilterActions.map(f => f.action).join('→');
                if (pattern.includes('apply→remove→apply')) {
                    sendEvent('filter_reset', {
                        filter: filterValue,
                        pattern,
                        count: sameFilterActions.length,
                        timestamp: now
                    });
                }
            }
        };

        filterButtons.forEach(btn => btn.addEventListener('click', handleFilterClick));
        return () => filterButtons.forEach(btn => btn.removeEventListener('click', handleFilterClick));
    }, [sendEvent]);

    // Semantic Search Refinement (Query Edit Detection)
    useEffect(() => {
        const searchInput = document.getElementById('store-search') as HTMLInputElement;
        if (!searchInput) return;

        let lastQuery = '';
        let editCount = 0;
        let queryStartTime = Date.now();

        const handleInput = () => {
            const currentQuery = searchInput.value;
            
            if (lastQuery && currentQuery && currentQuery !== lastQuery) {
                // Check if it's a refinement (not complete replacement)
                const similarity = calculateSimilarity(lastQuery, currentQuery);
                if (similarity > 0.5) {
                    editCount++;
                    
                    if (editCount >= 2) {
                        sendEvent('semantic_search_refinement', {
                            original_query: lastQuery,
                            refined_query: currentQuery,
                            edit_count: editCount,
                            time_spent_ms: Date.now() - queryStartTime,
                            timestamp: Date.now()
                        });
                    }
                }
            }

            lastQuery = currentQuery;
        };

        searchInput.addEventListener('input', handleInput);
        return () => searchInput.removeEventListener('input', handleInput);
    }, [sendEvent]);

    // Spec → Review → Spec Loop Detection
    useEffect(() => {
        const navigationHistory: Array<{ section: string; timestamp: number }> = [];

        const handleSectionClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const tabButton = target.closest('[data-tab]') as HTMLElement;
            if (!tabButton) return;

            const section = tabButton.dataset.tab || '';
            const now = Date.now();

            navigationHistory.push({ section, timestamp: now });

            // Detect Spec → Review → Spec pattern
            const recent = navigationHistory.filter(n => now - n.timestamp < 30000);
            if (recent.length >= 3) {
                const pattern = recent.slice(-3).map(n => n.section).join('→');
                if (pattern === 'specs→reviews→specs' || pattern === 'reviews→specs→reviews') {
                    sendEvent('spec_review_loop', {
                        pattern,
                        loop_count: Math.floor(recent.length / 2),
                        timestamp: now
                    });
                }
            }
        };

        document.addEventListener('click', handleSectionClick);
        return () => document.removeEventListener('click', handleSectionClick);
    }, [sendEvent]);

    // Variant Toggle Tracking (High Frequency)
    useEffect(() => {
        let variantChanges = 0;
        let lastChangeTime = Date.now();

        const origTrigger = (window as any).__contextTrigger;
        (window as any).__contextTrigger = (type: string, payload: any) => {
            if (type === 'product_variant_changed') {
                const now = Date.now();
                variantChanges++;

                // Reset counter after 30s of inactivity
                if (now - lastChangeTime > 30000) {
                    variantChanges = 1;
                }

                lastChangeTime = now;

                // Trigger after 5+ changes
                if (variantChanges >= 5) {
                    sendEvent('variant_toggle', {
                        product_id: payload?.product_id,
                        toggle_count: variantChanges,
                        timestamp: now
                    });
                    variantChanges = 0;
                }
            }

            if (origTrigger) origTrigger(type, payload);
        };
    }, [sendEvent]);

    // Quick Bounce Detection (5-8s exit after product view)
    useEffect(() => {
        let productViewTime = 0;

        const origTrigger = (window as any).__contextTrigger;
        (window as any).__contextTrigger = (type: string, payload: any) => {
            if (type === 'product_viewed' || (type === 'product_detail' && payload?.action === 'opened')) {
                productViewTime = Date.now();
            }

            if (type === 'product_modal_closed' || (type === 'product_detail' && payload?.action === 'closed')) {
                if (productViewTime > 0) {
                    const duration = Date.now() - productViewTime;
                    if (duration >= 5000 && duration <= 8000) {
                        sendEvent('quick_bounce', {
                            product_id: payload?.product_id,
                            duration_ms: duration,
                            timestamp: Date.now()
                        });
                    }
                    productViewTime = 0;
                }
            }

            if (origTrigger) origTrigger(type, payload);
        };
    }, [sendEvent]);

    // Size Chart First (immediate size chart view on product entry)
    useEffect(() => {
        let productJustOpened = false;
        let productOpenTime = 0;

        const handleSizeChartClick = (e: Event) => {
            const target = e.target as HTMLElement;
            if (target.closest('[data-action="size-chart"]') || target.classList.contains('size-chart-link')) {
                const now = Date.now();
                
                // If size chart opened within 3s of product view
                if (productJustOpened && (now - productOpenTime < 3000)) {
                    sendEvent('size_chart_first', {
                        time_to_open_ms: now - productOpenTime,
                        timestamp: now
                    });
                    productJustOpened = false;
                }
            }
        };

        const origTrigger = (window as any).__contextTrigger;
        (window as any).__contextTrigger = (type: string, payload: any) => {
            if (type === 'product_viewed' || (type === 'product_detail' && payload?.action === 'opened')) {
                productJustOpened = true;
                productOpenTime = Date.now();
                
                // Reset after 3s
                setTimeout(() => { productJustOpened = false; }, 3000);
            }

            if (origTrigger) origTrigger(type, payload);
        };

        document.addEventListener('click', handleSizeChartClick);
        return () => document.removeEventListener('click', handleSizeChartClick);
    }, [sendEvent]);

    // Return Policy Hover (Micro-Trust Signal)
    useEffect(() => {
        const returnIcons = document.querySelectorAll('[data-icon="return"], .return-policy-icon');
        if (returnIcons.length === 0) return;

        const handleReturnHover = (e: Event) => {
            const target = e.currentTarget as HTMLElement;
            let hoverStart = Date.now();

            const handleHoverEnd = () => {
                const duration = Date.now() - hoverStart;
                if (duration > 1000) { // Only track meaningful hovers
                    sendEvent('return_hover', {
                        element: target.className,
                        duration_ms: duration,
                        timestamp: Date.now()
                    });
                }
                target.removeEventListener('mouseleave', handleHoverEnd);
            };

            target.addEventListener('mouseleave', handleHoverEnd, { once: true });
        };

        returnIcons.forEach(icon => icon.addEventListener('mouseenter', handleReturnHover));
        return () => returnIcons.forEach(icon => icon.removeEventListener('mouseenter', handleReturnHover));
    }, [sendEvent]);

    // FAQ Visit Detection
    useEffect(() => {
        const handleClick = (e: Event) => {
            const target = e.target as HTMLElement;
            const link = target.closest('a');
            
            if (link) {
                const href = link.getAttribute('href') || '';
                const linkText = link.textContent?.toLowerCase() || '';
                
                if (href.includes('faq') || href.includes('help') || 
                    linkText.includes('faq') || linkText.includes('help')) {
                    sendEvent('faq_visit', {
                        link_text: link.textContent?.trim(),
                        href,
                        timestamp: Date.now()
                    });
                }
            }
        };

        document.addEventListener('click', handleClick);
        return () => document.removeEventListener('click', handleClick);
    }, [sendEvent]);

    // Delivery Estimator Check
    useEffect(() => {
        const deliveryElements = document.querySelectorAll('[data-section="delivery"], .delivery-estimate');
        if (deliveryElements.length === 0) return;

        const handleDeliveryClick = (e: Event) => {
            sendEvent('delivery_estimator_check', {
                timestamp: Date.now()
            });
        };

        deliveryElements.forEach(el => el.addEventListener('click', handleDeliveryClick));
        return () => deliveryElements.forEach(el => el.removeEventListener('click', handleDeliveryClick));
    }, [sendEvent]);

    // Brief Tab Blur (<2s tab switch and return)
    useEffect(() => {
        let blurTime = 0;

        const handleBlur = () => {
            blurTime = Date.now();
        };

        const handleFocus = () => {
            if (blurTime > 0) {
                const blurDuration = Date.now() - blurTime;
                if (blurDuration < 2000) {
                    sendEvent('brief_tab_blur', {
                        duration_ms: blurDuration,
                        timestamp: Date.now()
                    });
                }
                blurTime = 0;
            }
        };

        window.addEventListener('blur', handleBlur);
        window.addEventListener('focus', handleFocus);
        return () => {
            window.removeEventListener('blur', handleBlur);
            window.removeEventListener('focus', handleFocus);
        };
    }, [sendEvent]);

    // Cursor Idle Mid-Page Detection
    useEffect(() => {
        let lastMoveTime = Date.now();
        let idleTimer: any;
        let lastY = 0;

        const handleMouseMove = (e: MouseEvent) => {
            lastMoveTime = Date.now();
            lastY = e.clientY;
            clearTimeout(idleTimer);

            // Set 5s idle timer
            idleTimer = setTimeout(() => {
                const scrollPercent = (window.scrollY + window.innerHeight) / document.body.scrollHeight;
                
                // Only trigger if cursor is mid-page (20-80% scroll)
                if (scrollPercent > 0.2 && scrollPercent < 0.8) {
                    sendEvent('cursor_idle_mid_page', {
                        scroll_position: scrollPercent,
                        cursor_y: lastY,
                        idle_duration_ms: Date.now() - lastMoveTime,
                        timestamp: Date.now()
                    });
                }
            }, 5000);
        };

        document.addEventListener('mousemove', handleMouseMove);
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            clearTimeout(idleTimer);
        };
    }, [sendEvent]);

    // Region Re-scroll Detection
    useEffect(() => {
        const scrollRegions: Array<{ top: number; bottom: number; timestamp: number }> = [];
        let lastScrollY = window.scrollY;

        const handleScroll = () => {
            const currentY = window.scrollY;
            const viewportHeight = window.innerHeight;
            const now = Date.now();

            scrollRegions.push({
                top: currentY,
                bottom: currentY + viewportHeight,
                timestamp: now
            });

            // Check for re-scrolling same region
            const recent = scrollRegions.filter(r => now - r.timestamp < 30000);
            for (let i = 0; i < recent.length - 1; i++) {
                const overlap = calculateOverlap(recent[i], recent[recent.length - 1]);
                // Increased threshold to reduce spam (0.7 -> 0.8 coverage, 5s -> 10s cooldown)
                if (overlap > 0.8 && recent[recent.length - 1].timestamp - recent[i].timestamp > 10000) {
                    sendEvent('region_rescroll', {
                        region: { top: recent[i].top, bottom: recent[i].bottom },
                        revisit_count: recent.filter(r => calculateOverlap(r, recent[i]) > 0.8).length,
                        timestamp: now
                    });
                    break;
                }
            }

            lastScrollY = currentY;
        };

        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, [sendEvent]);

    // Address Field Loop (Checkout)
    useEffect(() => {
        const addressFields = document.querySelectorAll('[data-field^="address"], [name^="address"]');
        if (addressFields.length === 0) return;

        const fieldChanges: Record<string, number> = {};

        const handleFieldChange = (e: Event) => {
            const target = e.target as HTMLInputElement;
            const fieldName = target.name || target.dataset.field || '';

            fieldChanges[fieldName] = (fieldChanges[fieldName] || 0) + 1;

            // Trigger after 3+ changes to same field
            if (fieldChanges[fieldName] >= 3) {
                sendEvent('address_field_loop', {
                    field_name: fieldName,
                    change_count: fieldChanges[fieldName],
                    timestamp: Date.now()
                });
                fieldChanges[fieldName] = 0; // Reset
            }
        };

        addressFields.forEach(field => field.addEventListener('change', handleFieldChange));
        return () => addressFields.forEach(field => field.removeEventListener('change', handleFieldChange));
    }, [sendEvent]);

    // Keyboard Toggle (Mobile)
    useEffect(() => {
        // Only track on mobile
        const isMobile = /Mobile|Android|iPhone/i.test(navigator.userAgent);
        if (!isMobile) return;

        const inputFields = document.querySelectorAll('input, textarea');
        if (inputFields.length === 0) return;

        let focusCount = 0;
        let lastFocusTime = 0;

        const handleFocus = () => {
            const now = Date.now();
            
            // Reset count after 10s inactivity
            if (now - lastFocusTime > 10000) {
                focusCount = 0;
            }

            focusCount++;
            lastFocusTime = now;

            // Trigger after 3+ focus events (keyboard opens)
            if (focusCount >= 3) {
                sendEvent('keyboard_toggle', {
                    toggle_count: focusCount,
                    timestamp: now
                });
                focusCount = 0;
            }
        };

        inputFields.forEach(field => field.addEventListener('focus', handleFocus));
        return () => inputFields.forEach(field => field.removeEventListener('focus', handleFocus));
    }, [sendEvent]);
}

// Helper functions for friction v2 tracking
function calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    if (longer.length === 0) return 1.0;
    
    const editDistance = levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
}

function levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];
    for (let i = 0; i <= str2.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= str1.length; j++) {
        matrix[0][j] = j;
    }
    for (let i = 1; i <= str2.length; i++) {
        for (let j = 1; j <= str1.length; j++) {
            if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    return matrix[str2.length][str1.length];
}

function calculateOverlap(region1: { top: number; bottom: number }, region2: { top: number; bottom: number }): number {
    const overlapTop = Math.max(region1.top, region2.top);
    const overlapBottom = Math.min(region1.bottom, region2.bottom);
    const overlapHeight = Math.max(0, overlapBottom - overlapTop);
    const region1Height = region1.bottom - region1.top;
    return overlapHeight / region1Height;
}

// ============================================================
// Product Interaction Tracking (Major Signals)
// ============================================================

function useProductInteractionTracking(sendEvent: (type: any, payload?: any) => Promise<AnalystContract | null>) {
    // Product Description Expanded
    useEffect(() => {
        const handleExpand = (e: Event) => {
            const target = e.target as HTMLElement;
            if (target.closest('[data-action="expand-description"]') || target.classList.contains('description-toggle')) {
                sendEvent('product_description_expanded', {
                    timestamp: Date.now(),
                    source: 'click'
                });
            }
        };

        const expandButtons = document.querySelectorAll('[data-action="expand-description"], .description-toggle');
        expandButtons.forEach(btn => btn.addEventListener('click', handleExpand));
        return () => expandButtons.forEach(btn => btn.removeEventListener('click', handleExpand));
    }, [sendEvent]);

    // Product Reviews Viewed
    useEffect(() => {
        let hasViewedReviews = false;
        
        // 1. Click on reviews tab/link
        const handleReviewClick = (e: Event) => {
            const target = e.target as HTMLElement;
            if (target.closest('[data-tab="reviews"]') || target.closest('[href="#reviews"]')) {
                sendEvent('product_reviews_viewed', {
                    method: 'click',
                    timestamp: Date.now()
                });
                hasViewedReviews = true;
            }
        };

        // 2. Scroll to reviews section
        const handleScroll = () => {
            if (hasViewedReviews) return;
            
            const reviewsSection = document.getElementById('reviews') || document.querySelector('[data-section="reviews"]');
            if (reviewsSection) {
                const rect = reviewsSection.getBoundingClientRect();
                const isVisible = rect.top < window.innerHeight && rect.bottom >= 0;
                
                if (isVisible) {
                    // Ensure it's visible for at least 2s
                    setTimeout(() => {
                        const currentRect = reviewsSection.getBoundingClientRect();
                        if (currentRect.top < window.innerHeight && currentRect.bottom >= 0 && !hasViewedReviews) {
                            sendEvent('product_reviews_viewed', {
                                method: 'scroll',
                                timestamp: Date.now()
                            });
                            hasViewedReviews = true;
                        }
                    }, 2000);
                }
            }
        };

        document.addEventListener('click', handleReviewClick);
        window.addEventListener('scroll', handleScroll);
        
        return () => {
            document.removeEventListener('click', handleReviewClick);
            window.removeEventListener('scroll', handleScroll);
        };
    }, [sendEvent]);

    // Product Return Policy Viewed
    useEffect(() => {
        const handlePolicyClick = (e: Event) => {
            const target = e.target as HTMLElement;
            if (target.closest('[data-action="return-policy"]') || target.classList.contains('return-policy-link')) {
                sendEvent('product_return_policy_viewed', {
                    timestamp: Date.now()
                });
            }
        };

        document.addEventListener('click', handlePolicyClick);
        return () => document.removeEventListener('click', handlePolicyClick);
    }, [sendEvent]);
}

// ============================================================
// Primary Tracking Restoration (Gap Fixes)
// ============================================================

function usePrimaryGapTracking(sendEvent: (type: any, payload?: any) => Promise<AnalystContract | null>) {
    // 1. cart_item_added, cart_item_removed, cart_quantity_changed
    useEffect(() => {
        const handleCartActions = (e: Event) => {
            const target = e.target as HTMLElement;
            // Add to Cart
            const addBtn = target.closest('[data-action="add-to-cart"]');
            if (addBtn) {
                const product = productContext.current_product; 
                if (product) {
                    sendEvent('cart_item_added', {
                        product_id: product.product_id,
                        price: product.price,
                        quantity: 1,
                        timestamp: Date.now()
                    });
                }
            }
            // Remove / Quantity
            if (target.closest('[data-action="remove-item"]')) {
                sendEvent('cart_item_removed', { timestamp: Date.now() });
            }
            if (target.closest('[data-action="update-quantity"]')) {
                sendEvent('cart_quantity_changed', { timestamp: Date.now() });
            }
        };
        document.addEventListener('click', handleCartActions);
        return () => document.removeEventListener('click', handleCartActions);
    }, [sendEvent]);

    // 2. wishlist_item_added, wishlist_opened, wishlist_closed
    useEffect(() => {
        const handleWishlistActions = (e: Event) => {
            const target = e.target as HTMLElement;
            if (target.closest('[data-action="wishlist-add"]')) {
                sendEvent('wishlist_item_added', {
                    product_id: productContext.current_product?.product_id,
                    timestamp: Date.now()
                });
            }
            if (target.closest('[data-action="toggle-wishlist"]')) {
                // Heuristic: Toggle
                const isOpen = document.querySelector('.wishlist-modal.open') !== null;
                sendEvent(isOpen ? 'wishlist_closed' : 'wishlist_opened', { timestamp: Date.now() });
            }
        };
        document.addEventListener('click', handleWishlistActions);
        return () => document.removeEventListener('click', handleWishlistActions);
    }, [sendEvent]);

    // 3. cart_opened, cart_closed
    useEffect(() => {
        const handleCartToggle = (e: Event) => {
            const target = e.target as HTMLElement;
            if (target.closest('[data-action="toggle-cart"]')) {
                const isOpen = document.querySelector('.cart-drawer.open') !== null;
                sendEvent(isOpen ? 'cart_closed' : 'cart_opened', { timestamp: Date.now() });
            }
        };
        document.addEventListener('click', handleCartToggle);
        return () => document.removeEventListener('click', handleCartToggle);
    }, [sendEvent]);

    // 4. Checkout Events: checkout_started, idle, form_field, etc.
    useEffect(() => {
        if (!window.location.href.includes('checkout')) return;

        // checkout_started (on mount)
        sendEvent('checkout_started', { timestamp: Date.now() });

        // checkout_idle
        let idleTimer: any;
        const resetIdle = () => {
            clearTimeout(idleTimer);
            idleTimer = setTimeout(() => {
                sendEvent('checkout_idle', { duration_ms: 10000, timestamp: Date.now() });
            }, 10000); // 10s idle in checkout is significant
        };
        document.addEventListener('mousemove', resetIdle);
        document.addEventListener('keydown', resetIdle);

        // form_field_change
        const handleInput = (e: Event) => {
            const target = e.target as HTMLInputElement;
            if (target.tagName === 'INPUT' || target.tagName === 'SELECT') {
                 sendEvent('form_field_change', { field: target.name || target.id, timestamp: Date.now() });
            }
        };
        document.addEventListener('change', handleInput);

        // shipping/payment methods
        const handleMethods = (e: Event) => {
            const target = e.target as HTMLInputElement;
            if (target.name === 'shipping_method') {
                sendEvent('shipping_option_selected', { method: target.value, timestamp: Date.now() });
            }
            if (target.name === 'payment_method') {
                sendEvent('payment_method_selected', { method: target.value, timestamp: Date.now() });
            }
            // payment_method_viewed (hover?)
            if (target.closest('.payment-option')) {
                 sendEvent('payment_method_viewed', { method: target.closest('.payment-option')?.id, timestamp: Date.now() });
            }
        };
        document.addEventListener('change', handleMethods); 
        // Note: order_placed usually handled by backend or success page, adding placeholder
        const handlePlaceOrder = (e: Event) => {
            const target = e.target as HTMLElement;
            if (target.closest('[data-action="place-order"]')) {
                sendEvent('order_placed', { timestamp: Date.now() });
            }
        };
        document.addEventListener('click', handlePlaceOrder);

        return () => {
            document.removeEventListener('mousemove', resetIdle);
             document.removeEventListener('keydown', resetIdle);
             document.removeEventListener('change', handleInput);
             document.removeEventListener('change', handleMethods);
             document.removeEventListener('click', handlePlaceOrder);
             clearTimeout(idleTimer);
        };
    }, [sendEvent]);

    // 5. filter_applied (explicit event vs reset pattern)
    useEffect(() => {
        const handleFilter = (e: Event) => {
             const target = e.target as HTMLElement;
             if (target.closest('[data-filter]')) {
                 const filter = target.closest('[data-filter]') as HTMLElement;
                 if (!filter.classList.contains('active')) { // If it wasn't active, we are applying it
                     sendEvent('filter_applied', { 
                         filter_type: filter.dataset.filterType, 
                         value: filter.dataset.filter,
                         timestamp: Date.now() 
                     });
                 }
             }
        };
        document.addEventListener('click', handleFilter);
        return () => document.removeEventListener('click', handleFilter);
    }, [sendEvent]);
}

// ============================================================
// Signal Detector Hook (preserved from v1)
// ============================================================

function useSignalDetector(sendEvent: (type: any, payload?: any) => Promise<AnalystContract | null>) {
    // Idle Detection
    useEffect(() => {
        let idleTimer: any;
        const resetIdle = () => {
            clearTimeout(idleTimer);
            idleTimer = setTimeout(() => sendEvent('idle', { duration: 5000 }), 5000);
        };
        window.addEventListener('mousemove', resetIdle);
        window.addEventListener('click', resetIdle);
        window.addEventListener('scroll', resetIdle);
        resetIdle();
        return () => {
            window.removeEventListener('mousemove', resetIdle);
            window.removeEventListener('click', resetIdle);
            window.removeEventListener('scroll', resetIdle);
            clearTimeout(idleTimer);
        };
    }, [sendEvent]);

    // Exit Intent (SMART - only fires when there's something worth saving)
    useEffect(() => {
        let lastExitTime = 0;
        let sessionStartTime = Date.now();
        let exitAttempts = 0;

        const handleMouseLeave = (e: MouseEvent) => {
            if (e.clientY <= 0) {
                const now = Date.now();
                const timeSinceLastExit = now - lastExitTime;
                const sessionDuration = now - sessionStartTime;

                // Smart exit intent conditions:
                const cart = getCart();
                const hasCartItems = cart.length > 0;
                const hasViewedProducts = productContext.last_product || productContext.current_product;
                const hasSpentTime = sessionDuration > 30000; // 30s minimum session
                const isRepeatExit = exitAttempts >= 1 && timeSinceLastExit < 60000; // 2nd exit attempt within 1 min

                // Only trigger exit intent if user has engagement worth saving
                const shouldTrigger = hasCartItems || (hasViewedProducts && hasSpentTime) || isRepeatExit;

                if (shouldTrigger && timeSinceLastExit > 10000) { // 10s cooldown between exit intents
                    lastExitTime = now;
                    exitAttempts++;
                    sendEvent('exit_intent', {
                        position: { x: e.clientX, y: e.clientY },
                        last_product: productContext.last_product || productContext.current_product,
                        cart_items: cart,
                        cart_total: getCartTotal(),
                        exit_attempt: exitAttempts,
                        session_duration_ms: sessionDuration,
                        trigger_reason: hasCartItems ? 'cart_abandonment' : isRepeatExit ? 'repeat_exit' : 'product_interest',
                    });
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
            if (percent > maxScroll + 20) {
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

    // Session Journey
    useEffect(() => {
        const journeyPath: Array<{ url: string; timestamp: number; duration: number }> = [];
        let currentPageStart = Date.now();
        let currentUrl = window.location.href;
        const trackPageChange = () => {
            const now = Date.now();
            if (currentUrl !== window.location.href) {
                journeyPath.push({ url: currentUrl, timestamp: currentPageStart, duration: now - currentPageStart });
                currentUrl = window.location.href;
                currentPageStart = now;
                sendEvent('session_journey', { path: journeyPath });
            }
        };
        window.addEventListener('hashchange', trackPageChange);
        window.addEventListener('popstate', trackPageChange);
        return () => {
            window.removeEventListener('hashchange', trackPageChange);
            window.removeEventListener('popstate', trackPageChange);
        };
    }, [sendEvent]);

    // Enhanced Element Hover
    useEffect(() => {
        const hoverTimers = new Map<HTMLElement, number>();
        const handleMouseEnter = (e: MouseEvent) => {
            if (!(e.target instanceof HTMLElement)) return;
            const target = e.target as HTMLElement;
            const productCard = target.closest('.product-card') as HTMLElement;
            if (!productCard) return;

            let elementType = 'product_card';
            const productId = productCard.dataset.id;
            if (target.classList.contains('price-tag') || target.closest('[data-analyze="price"]')) elementType = 'product_price';
            else if (target.tagName === 'IMG' || target.closest('img')) elementType = 'product_image';
            else if (target.classList.contains('btn-add') || target.closest('.btn-add')) elementType = 'add_to_cart_btn';

            const startTime = Date.now();
            const timer = window.setTimeout(() => {
                const duration = Date.now() - startTime;
                if (duration > 3000) {
                    sendEvent('element_hover', { element_type: elementType, product_id: productId, hover_duration_ms: duration });
                }
            }, 3000);
            hoverTimers.set(target, timer);
        };
        const handleMouseLeave = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const timer = hoverTimers.get(target);
            if (timer) { clearTimeout(timer); hoverTimers.delete(target); }
        };
        document.addEventListener('mouseenter', handleMouseEnter, true);
        document.addEventListener('mouseleave', handleMouseLeave, true);
        return () => {
            hoverTimers.forEach(timer => clearTimeout(timer));
            document.removeEventListener('mouseenter', handleMouseEnter, true);
            document.removeEventListener('mouseleave', handleMouseLeave, true);
        };
    }, [sendEvent]);

    // Browsing Pattern Detection
    useEffect(() => {
        let scrollCount = 0, searchCount = 0, productClickCount = 0;
        let patternStartTime = Date.now();
        const resetPattern = () => { scrollCount = 0; searchCount = 0; productClickCount = 0; patternStartTime = Date.now(); };
        const checkPattern = () => {
            const timeElapsed = Date.now() - patternStartTime;
            if (timeElapsed > 5 * 60 * 1000 && scrollCount > 50 && productClickCount === 0) {
                sendEvent('browsing_pattern', { pattern: 'scroll_without_click', metrics: { scroll_count: scrollCount, product_clicks: productClickCount, time_browsing: timeElapsed } });
                resetPattern();
            } else if (searchCount >= 4 && productClickCount === 0 && timeElapsed > 3 * 60 * 1000) {
                sendEvent('browsing_pattern', { pattern: 'searching_frustrated', metrics: { searches_made: searchCount, product_clicks: productClickCount, time_browsing: timeElapsed } });
                resetPattern();
            }
        };
        const handleScroll = () => { scrollCount++; scrollTracker.itemsPassed = scrollCount; checkPattern(); };
        const handleClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (target.closest('.product-card') || target.closest('.product-trigger')) productClickCount++;
        };
        window.addEventListener('scroll', handleScroll);
        document.addEventListener('click', handleClick);
        const interval = setInterval(checkPattern, 10000);
        return () => { window.removeEventListener('scroll', handleScroll); document.removeEventListener('click', handleClick); clearInterval(interval); };
    }, [sendEvent]);

    // Search Action Tracking
    useEffect(() => {
        const searchInput = document.getElementById('store-search') as HTMLInputElement;
        if (!searchInput) return;
        let typingTimer: any, queryStartTime = Date.now();
        const handleFocus = () => { queryStartTime = Date.now(); sendEvent('search_action', { action: 'focus' }); };
        const handleInput = () => {
            clearTimeout(typingTimer);
            typingTimer = setTimeout(() => {
                const query = searchInput.value;
                if (query.length > 0) sendEvent('search_action', { action: 'typing', query, query_length: query.length, time_to_type: Date.now() - queryStartTime });
            }, 500);
        };
        searchInput.addEventListener('focus', handleFocus);
        searchInput.addEventListener('input', handleInput);
        return () => { searchInput.removeEventListener('focus', handleFocus); searchInput.removeEventListener('input', handleInput); clearTimeout(typingTimer); };
    }, [sendEvent]);

    // Attention Indicators
    useEffect(() => {
        const handleVisChange = () => sendEvent('attention', { signal: document.hidden ? 'tab_hidden' : 'tab_visible', page_url: window.location.href });
        const handleFocus = () => sendEvent('attention', { signal: 'window_focused', page_url: window.location.href });
        const handleBlur = () => sendEvent('attention', { signal: 'window_blurred', page_url: window.location.href });
        document.addEventListener('visibilitychange', handleVisChange);
        window.addEventListener('focus', handleFocus);
        window.addEventListener('blur', handleBlur);
        return () => { document.removeEventListener('visibilitychange', handleVisChange); window.removeEventListener('focus', handleFocus); window.removeEventListener('blur', handleBlur); };
    }, [sendEvent]);

    // Cursor Position Stream
    useEffect(() => {
        let cursorBuffer: Array<{ x: number; y: number; timestamp: number }> = [];
        let lastSample = 0;
        const handleMouseMove = (e: MouseEvent) => {
            const now = Date.now();
            if (now - lastSample < 100) return;
            lastSample = now;
            cursorBuffer.push({ x: e.clientX, y: e.clientY, timestamp: now });
            if (cursorBuffer.length >= 50) {
                sendEvent('cursor_stream', { positions: cursorBuffer, count: cursorBuffer.length });
                cursorBuffer = [];
            }
        };
        document.addEventListener('mousemove', handleMouseMove);
        const interval = setInterval(() => {
            if (cursorBuffer.length > 0) { sendEvent('cursor_stream', { positions: cursorBuffer, count: cursorBuffer.length }); cursorBuffer = []; }
        }, 5000);
        return () => { document.removeEventListener('mousemove', handleMouseMove); clearInterval(interval); };
    }, [sendEvent]);

    // Filter Usage
    useEffect(() => {
        const filterButtons = document.querySelectorAll('[data-filter]');
        const filterHistory: Array<{ filter: string; timestamp: number }> = [];
        const handleFilterClick = (e: Event) => {
            const target = e.currentTarget as HTMLElement;
            const filterValue = target.dataset.filter;
            const now = Date.now();
            filterHistory.push({ filter: filterValue || 'unknown', timestamp: now });
            const recentFilters = filterHistory.filter(f => now - f.timestamp < 10000);
            if (recentFilters.length >= 3) {
                sendEvent('filter_usage', { pattern: 'rapid_change', filters: recentFilters.map(f => f.filter), count: recentFilters.length });
            } else {
                sendEvent('filter_usage', { pattern: 'single_change', filter: filterValue });
            }
        };
        filterButtons.forEach(btn => btn.addEventListener('click', handleFilterClick));
        return () => filterButtons.forEach(btn => btn.removeEventListener('click', handleFilterClick));
    }, [sendEvent]);

    // Device Context
    useEffect(() => {
        sendEvent('device_context', {
            device_type: /Mobile|Android|iPhone/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
            screen_width: window.screen.width, screen_height: window.screen.height,
            viewport_width: window.innerWidth, viewport_height: window.innerHeight,
            user_agent: navigator.userAgent, platform: navigator.platform,
            connection: (navigator as any).connection ? {
                effective_type: (navigator as any).connection.effectiveType,
                downlink: (navigator as any).connection.downlink,
                rtt: (navigator as any).connection.rtt
            } : null
        });
    }, [sendEvent]);

    // Network Speed
    useEffect(() => {
        if (!(navigator as any).connection) return;
        const connection = (navigator as any).connection;
        const handle = () => sendEvent('network_speed', { effective_type: connection.effectiveType, downlink: connection.downlink, rtt: connection.rtt, save_data: connection.saveData });
        connection.addEventListener('change', handle);
        return () => connection.removeEventListener('change', handle);
    }, [sendEvent]);

    // Text Selection
    useEffect(() => {
        const handleSelection = () => {
            const selection = document.getSelection();
            if (!selection || selection.toString().length === 0) return;
            const text = selection.toString();
            const anchorNode = selection.anchorNode?.parentElement;
            let context = 'unknown';
            if (anchorNode?.closest('[data-analyze="price"]') || anchorNode?.classList.contains('price-tag')) context = 'price';
            else if (anchorNode?.closest('.product-title')) context = 'product_name';
            if (context !== 'unknown') sendEvent('text_selection', { text, context });
        };
        document.addEventListener('selectionchange', () => setTimeout(handleSelection, 1000));
        return () => {};
    }, [sendEvent]);

    // Scroll Velocity (Doom Scrolling)
    useEffect(() => {
        let lastScrollY = window.scrollY, lastTime = Date.now(), highVelocityFrames = 0;
        const handleScroll = () => {
            const now = Date.now(), dt = now - lastTime;
            if (dt < 50) return;
            const dy = Math.abs(window.scrollY - lastScrollY);
            const velocity = (dy / dt) * 1000;
            lastScrollY = window.scrollY; lastTime = now;
            if (velocity > 800) highVelocityFrames++; else highVelocityFrames = Math.max(0, highVelocityFrames - 1);
            if (highVelocityFrames > 10) {
                sendEvent('browsing_pattern', { pattern: 'doom_scrolling', velocity, duration_ms: Date.now() - scrollTracker.startTime, items_passed: scrollTracker.itemsPassed });
                highVelocityFrames = 0;
            }
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, [sendEvent]);

    // Footer Interaction
    useEffect(() => {
        const handleFooterClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const link = target.closest('a');
            if (link && link.dataset.analyze) sendEvent('footer_interaction', { type: link.dataset.analyze });
        };
        const footer = document.querySelector('footer');
        if (footer) footer.addEventListener('click', handleFooterClick);
        return () => { if (footer) footer.removeEventListener('click', handleFooterClick); };
    }, [sendEvent]);
}

// ============================================================
// Popup Components
// ============================================================

function PopupHeader({ title, icon, onDismiss }: { title: string; icon: string; onDismiss: () => void }) {
    return (
        <div className="popup-header">
            <span className="popup-icon">{icon}</span>
            <span className="popup-title">{title}</span>
            <button className="popup-dismiss" onClick={onDismiss}>×</button>
        </div>
    );
}

function PopupSmall({ message, onDismiss, onAccepted }: { message: string; onDismiss: () => void; onAccepted?: (action: string) => void }) {
    return (
        <div className="agent-popup small">
            <PopupHeader title="Virtual Assistant" icon="🤖" onDismiss={onDismiss} />
            <div className="popup-body"><p className="popup-message">{message}</p></div>
        </div>
    );
}

function PopupProductCard({ message, product, onDismiss, onAccepted }: { message: string; product: any; onDismiss: () => void; onAccepted?: (action: string) => void }) {
    const hasDiscount = message.includes('SAVE') || message.includes('%');
    const discountMatch = message.match(/(\d+)%\s*off/i);
    const discountCode = message.match(/:\s*(\w+)$/)?.[1];

    const handlePrimaryAction = () => {
        if (onAccepted) {
            onAccepted(hasDiscount ? 'add_to_cart' : 'add_to_wishlist');
        }
    };

    return (
        <div className="agent-popup product-card-popup">
            <PopupHeader title="Virtual Assistant" icon="🤖" onDismiss={onDismiss} />
            <div className="popup-body">
                <p className="popup-message">{message}</p>
                {product && (
                    <div className="popup-product-card">
                        {product.image && (
                            <img src={product.image} alt={product.product_name || 'Product'} className="popup-product-image" />
                        )}
                        <div className="popup-product-info">
                            <h4 className="popup-product-name">{product.product_name || product.name || 'Item'}</h4>
                            <p className="popup-product-price">
                                {hasDiscount && discountMatch && (
                                    <span className="popup-price-original">${product.price || product.unit_price || '—'}</span>
                                )}
                                <span className={hasDiscount ? 'popup-price-discounted' : ''}>
                                    ${hasDiscount && discountMatch
                                        ? ((product.price || product.unit_price || 0) * (1 - parseInt(discountMatch[1]) / 100)).toFixed(2)
                                        : (product.price || product.unit_price || '—')}
                                </span>
                            </p>
                            {discountCode && (
                                <div className="popup-discount-code">Use code: <strong>{discountCode}</strong></div>
                            )}
                            <button className="popup-btn-primary" onClick={handlePrimaryAction}>
                                {hasDiscount ? 'Add to Cart' : 'Add to Wishlist'}
                            </button>
                            <a href="#" className="popup-link-secondary" onClick={(e) => { e.preventDefault(); onDismiss(); }}>Continue Shopping</a>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function PopupComparison({ message, products, onDismiss, onAccepted }: { message: string; products: any[]; onDismiss: () => void; onAccepted?: (action: string) => void }) {
    const handleChooseProduct = (productName: string) => {
        if (onAccepted) {
            onAccepted(`choose_product:${productName}`);
        }
    };

    return (
        <div className="agent-popup comparison">
            <PopupHeader title="Product Comparison" icon="⚖️" onDismiss={onDismiss} />
            <div className="popup-body">
                <p className="popup-message">{message}</p>
                <div className="popup-comparison-grid">
                    {products.map((p: any, i: number) => (
                        <div key={i} className="popup-comparison-item">
                            <h4>{p.product_name || `Product ${i + 1}`}</h4>
                            <p className="popup-product-price">${p.price || '—'}</p>
                            <button className="popup-btn-primary" onClick={() => handleChooseProduct(p.product_name || `Product ${i + 1}`)}>Choose This</button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function PopupCustom({ message, contentType, onDismiss, onAccepted }: { message: string; contentType: string; onDismiss: () => void; onAccepted?: (action: string) => void }) {
    const handlePrimaryAction = () => {
        if (onAccepted) {
            onAccepted(contentType === 'gift_receipt' ? 'enable_gift_receipt' : 'view_reviews');
        }
    };

    return (
        <div className="agent-popup custom">
            <PopupHeader title={contentType === 'gift_receipt' ? 'Gift Options' : 'Verified Store'} icon={contentType === 'gift_receipt' ? '🎁' : '🛡️'} onDismiss={onDismiss} />
            <div className="popup-body">
                <p className="popup-message">{message}</p>
                {contentType === 'gift_receipt' && (
                    <div className="popup-gift-steps">
                        <div className="popup-step"><span className="step-num">1</span><p>We email them a gift code</p></div>
                        <div className="popup-step"><span className="step-num">2</span><p>They choose size/color</p></div>
                        <div className="popup-step"><span className="step-num">3</span><p>We ship the perfect item</p></div>
                        <button className="popup-btn-primary" onClick={handlePrimaryAction}>Enable Gift Receipt</button>
                    </div>
                )}
                {contentType === 'verification_badge' && (
                    <div className="popup-trust-badge">
                        <div className="popup-trust-metric">✓ 5,000+ orders shipped</div>
                        <div className="popup-trust-metric">★ 4.9/5 rating</div>
                        <a href="#" className="popup-link-secondary" onClick={handlePrimaryAction}>See Reviews</a>
                    </div>
                )}
            </div>
        </div>
    );
}

function VoiceIndicator({ transcript }: { transcript: string }) {
    return (
        <div className="voice-indicator">
            <div className="sound-waves">
                <span className="wave"></span>
                <span className="wave"></span>
                <span className="wave"></span>
            </div>
            <p className="voice-transcript">{transcript}</p>
        </div>
    );
}

// ============================================================
// Main App
// ============================================================

import { Heatmap } from './components/Heatmap';

export function App() {
    const [contract, setContract] = useState<AnalystContract | null>(null);
    const [isMuted, setIsMuted] = useState(false);
    const [showHeatmap, setShowHeatmap] = useState(false);

    // V2 Popup State
    const [popupState, setPopupState] = useState<'hidden' | 'voice_only' | 'popup_small' | 'popup_product_card' | 'popup_comparison' | 'popup_custom'>('hidden');
    const [activeIntervention, setActiveIntervention] = useState<InterventionPayload | null>(null);
    const [agentButtonState, setAgentButtonState] = useState<'default' | 'has-intervention' | 'speaking' | 'exit-intent'>('default');
    const [voiceTranscript, setVoiceTranscript] = useState<string | null>(null);
    const [dismissedUntil, setDismissedUntil] = useState<number>(0);

    const { speak, isSpeaking } = useVoice(isMuted);
    const hasSpokenRef = useRef<string | null>(null);

    const handleEvent = useCallback(async (type: any, payload?: any) => {
        const newContract = await sendEvent(type, payload);
        if (newContract) setContract(newContract);
        return newContract;
    }, []);

    useInitialSessionTracking(handleEvent);
    useSignalDetector(handleEvent);
    useContextTracking(handleEvent);
    usePriceSensitivityTracking(handleEvent);
    useFrictionV2Tracking(handleEvent);
    useProductInteractionTracking(handleEvent);
    usePrimaryGapTracking(handleEvent);

    // Expose DemoTrigger
    useEffect(() => {
        (window as any).DemoTrigger = (type: string, payload: any) => {
            // Call context tracker first
            if ((window as any).__contextTrigger) (window as any).__contextTrigger(type, payload);
            handleEvent(type as any, payload);
        };

        // Flush any queued events from index.html that fired before React mounted
        if ((window as any).flushEventQueue) {
            (window as any).flushEventQueue();
        }
    }, [handleEvent]);

    // Navigation tracking
    useEffect(() => {
        const handleMouseOver = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (target.dataset.analyze === 'price') handleEvent('hover', { element: 'price' });
        };
        document.addEventListener('mouseover', handleMouseOver);
        return () => document.removeEventListener('mouseover', handleMouseOver);
    }, [handleEvent]);

    useEffect(() => {
        const handleNavClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const link = target.closest('a');
            if (link) {
                if (link.classList.contains('nav-category')) {
                    setTimeout(() => handleEvent('page_navigation', { page_name: link.textContent?.trim() || 'Unknown', page_type: 'collection' }), 100);
                } else if (link.getAttribute('href') === '/' && link.textContent?.trim() === 'Home') {
                    setTimeout(() => handleEvent('page_navigation', { page_name: 'Home', page_type: 'page' }), 100);
                }
            }
        };
        document.addEventListener('click', handleNavClick);
        return () => document.removeEventListener('click', handleNavClick);
    }, [handleEvent]);

    // V2: Handle interventions from contract
    useEffect(() => {
        if (!contract) return;

        const intervention = contract.intervention;
        const isDismissed = Date.now() < dismissedUntil;

        if (intervention && !isDismissed) {
            setActiveIntervention(intervention);

            // Set agent button state
            if (intervention.friction_type === 'exit_intent') {
                setAgentButtonState('exit-intent');
            } else if (intervention.ui_type === 'voice_only') {
                setAgentButtonState('speaking');
            } else {
                setAgentButtonState('has-intervention');
            }

            // Set popup state
            setPopupState(intervention.ui_type as any);

            // Speak for voice interventions
            if (intervention.ui_type === 'voice_only' && hasSpokenRef.current !== intervention.script) {
                speak(intervention.script);
                setVoiceTranscript(intervention.script);
                hasSpokenRef.current = intervention.script;

                // Auto-hide voice transcript after 5s
                setTimeout(() => {
                    setVoiceTranscript(null);
                    setPopupState('hidden');
                    setAgentButtonState('default');
                }, 5000);
            }

            // Legacy integration
            markIntervention();
        }

        // Fallback: legacy recommended_actions (if no V2 intervention)
        if (!intervention && contract.recommended_actions.length > 0) {
            const action = contract.recommended_actions[0];
            if (action.action_type !== 'none' && !isDismissed && hasSpokenRef.current !== action.message_template) {
                if (action.action_type === 'voice_proactive') {
                    speak(action.message_template);
                    setVoiceTranscript(action.message_template);
                    setAgentButtonState('speaking');
                    setPopupState('voice_only');
                    hasSpokenRef.current = action.message_template;
                    setTimeout(() => { setVoiceTranscript(null); setPopupState('hidden'); setAgentButtonState('default'); }, 5000);
                }
                markIntervention();
            }
        }
    }, [contract, speak, dismissedUntil]);

    // Reset button state when not speaking
    useEffect(() => {
        if (!isSpeaking && agentButtonState === 'speaking') {
            const timer = setTimeout(() => setAgentButtonState('default'), 2000);
            return () => clearTimeout(timer);
        }
    }, [isSpeaking, agentButtonState]);

    // Track "ignored" interventions - fires if popup visible for 30s without interaction
    const ignoredTimerRef = useRef<number | null>(null);
    useEffect(() => {
        if (popupState !== 'hidden' && popupState !== 'voice_only' && activeIntervention) {
            // Start ignored timer
            ignoredTimerRef.current = window.setTimeout(() => {
                handleEvent('intervention_ignored', {
                    friction_type: activeIntervention?.friction_type,
                    ui_type: activeIntervention?.ui_type,
                    stage: activeIntervention?.stage,
                    visible_duration_ms: 30000
                });
            }, 30000); // 30 seconds

            return () => {
                if (ignoredTimerRef.current) {
                    clearTimeout(ignoredTimerRef.current);
                    ignoredTimerRef.current = null;
                }
            };
        }
    }, [popupState, activeIntervention]);

    const handleDismiss = () => {
        setPopupState('hidden');
        setActiveIntervention(null);
        setAgentButtonState('default');
        setVoiceTranscript(null);
        setDismissedUntil(Date.now() + 2 * 60 * 1000);
        handleEvent('intervention_dismissed', {
            friction_type: activeIntervention?.friction_type,
            ui_type: activeIntervention?.ui_type,
            stage: activeIntervention?.stage
        });
    };

    const handleAccepted = (action?: string) => {
        handleEvent('intervention_accepted', {
            friction_type: activeIntervention?.friction_type,
            ui_type: activeIntervention?.ui_type,
            stage: activeIntervention?.stage,
            action_taken: action || 'primary_cta'
        });
        setPopupState('hidden');
        setActiveIntervention(null);
        setAgentButtonState('default');
        setVoiceTranscript(null);
    };

    const handleAgentClick = () => {
        if (popupState !== 'hidden') {
            handleDismiss();
        } else {
            setIsMuted(!isMuted);
        }
    };

    const intent = contract?.intent_state.primary_intent;
    const isRisk = intent === 'abandonment_risk';
    const isSuccess = intent === 'purchase';

    return (
        <>
            {isRisk && <div className="risk-pulse" />}
            {isSuccess && <div className="success-glow" />}

            <Heatmap active={showHeatmap} />

            {/* Voice Indicator */}
            {popupState === 'voice_only' && voiceTranscript && (
                <VoiceIndicator transcript={voiceTranscript} />
            )}

            {/* Popup System */}
            {popupState === 'popup_small' && activeIntervention && (
                <PopupSmall message={activeIntervention.script} onDismiss={handleDismiss} onAccepted={handleAccepted} />
            )}
            {popupState === 'popup_product_card' && activeIntervention && (
                <PopupProductCard
                    message={activeIntervention.script}
                    product={activeIntervention.context?.product}
                    onDismiss={handleDismiss}
                    onAccepted={handleAccepted}
                />
            )}
            {popupState === 'popup_comparison' && activeIntervention && (
                <PopupComparison
                    message={activeIntervention.script}
                    products={activeIntervention.context?.products || []}
                    onDismiss={handleDismiss}
                    onAccepted={handleAccepted}
                />
            )}
            {popupState === 'popup_custom' && activeIntervention && (
                <PopupCustom
                    message={activeIntervention.script}
                    contentType={activeIntervention.context?.message_type || 'generic'}
                    onDismiss={handleDismiss}
                    onAccepted={handleAccepted}
                />
            )}

            {/* Agent Button */}
            <button
                onClick={handleAgentClick}
                className={`agent-button ${agentButtonState}`}
                title={isMuted ? "Tap to unmute" : "Virtual Assistant"}
            >
                <img src="/customer_agent_icon.png" alt="Agent" style={{ width: '36px', height: '36px', borderRadius: '50%' }} />
                {isMuted && (
                    <div className="agent-muted-indicator">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                        </svg>
                    </div>
                )}
            </button>
        </>
    );
}

import { render } from 'preact';
render(<App />, document.getElementById('sales-agent-root')!);
