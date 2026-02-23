import type { FISMBridge } from "../ws-transport.js";

/**
 * Search Observer — Tracks search behavior, zero results, search refinements.
 * Detects: F028 (zero search results), F030 (repeated search refinements),
 *          F301 (help-seeking search terms).
 */
export class SearchObserver {
  private bridge: FISMBridge;
  private searchHistory: string[] = [];
  private mutationObserver: MutationObserver | null = null;
  private submitHandler: ((e: Event) => void) | null = null;
  private inputHandler: ((e: Event) => void) | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(bridge: FISMBridge) {
    this.bridge = bridge;
  }

  start(): void {
    // Watch search form submissions
    this.submitHandler = (e: Event) => {
      const form = e.target as HTMLFormElement;
      const isSearchForm =
        form.action?.includes("search") ||
        form.querySelector("input[type='search']") !== null ||
        form.querySelector("input[name='q']") !== null;

      if (isSearchForm) {
        const input =
          form.querySelector("input[type='search']") as HTMLInputElement ||
          form.querySelector("input[name='q']") as HTMLInputElement ||
          form.querySelector("input[name='search']") as HTMLInputElement;

        if (input) {
          this.handleSearchQuery(input.value);
        }
      }
    };

    // Watch search input changes (for instant search)
    this.inputHandler = (e: Event) => {
      const target = e.target as HTMLInputElement;
      const isSearchInput =
        target.type === "search" ||
        target.name === "q" ||
        target.name === "search" ||
        target.getAttribute("role") === "searchbox" ||
        target.closest("form[action*='search']") !== null;

      if (isSearchInput && target.value.length >= 3) {
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
          this.handleSearchQuery(target.value);
        }, 2000);
      }
    };

    document.addEventListener("submit", this.submitHandler, true);
    document.addEventListener("input", this.inputHandler);

    // Watch for zero results pages
    this.mutationObserver = new MutationObserver(() => {
      this.checkZeroResults();
    });
    this.mutationObserver.observe(document.body, { childList: true, subtree: true });

    // Initial check
    this.checkZeroResults();
    this.checkURLSearch();
  }

  private handleSearchQuery(query: string): void {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return;

    this.searchHistory.push(trimmed);

    // F301: Help-seeking search terms
    const helpTerms = ["contact", "support", "help", "phone", "email", "chat", "return", "refund", "cancel"];
    if (helpTerms.some((t) => trimmed.includes(t))) {
      this.bridge.send("behavioral_event", {
        event_id: this.uid(),
        friction_id: "F301",
        category: "search",
        event_type: "help_seeking_search",
        raw_signals: {
          query: trimmed,
          matching_terms: helpTerms.filter((t) => trimmed.includes(t)),
        },
        timestamp: Date.now(),
      });
    }

    // F030: Repeated search refinements (3+ searches in quick succession)
    if (this.searchHistory.length >= 3) {
      const recent = this.searchHistory.slice(-3);
      const allDifferent = new Set(recent).size === recent.length;
      if (allDifferent) {
        this.bridge.send("behavioral_event", {
          event_id: this.uid(),
          friction_id: "F030",
          category: "search",
          event_type: "search_refinement",
          raw_signals: {
            search_count: this.searchHistory.length,
            recent_queries: recent,
          },
          timestamp: Date.now(),
        });
      }
    }

    // General search event
    this.bridge.send("behavioral_event", {
      event_id: this.uid(),
      friction_id: null,
      category: "search",
      event_type: "search_query",
      raw_signals: {
        query: trimmed,
        total_searches: this.searchHistory.length,
      },
      timestamp: Date.now(),
    });
  }

  private checkZeroResults(): void {
    const zeroResultSelectors = [
      ".no-results",
      ".search-no-results",
      "[data-search-no-results]",
      ".empty-search",
    ];

    for (const sel of zeroResultSelectors) {
      const el = document.querySelector(sel);
      if (el && (el as HTMLElement).offsetHeight > 0) {
        this.bridge.send("behavioral_event", {
          event_id: this.uid(),
          friction_id: "F028",
          category: "search",
          event_type: "zero_search_results",
          raw_signals: {
            page_url: window.location.href,
            query: new URLSearchParams(window.location.search).get("q") || "",
          },
          timestamp: Date.now(),
        });
        break;
      }
    }
  }

  private checkURLSearch(): void {
    const params = new URLSearchParams(window.location.search);
    const query = params.get("q") || params.get("search") || params.get("query");
    if (query) {
      this.handleSearchQuery(query);
    }
  }

  stop(): void {
    if (this.submitHandler) document.removeEventListener("submit", this.submitHandler, true);
    if (this.inputHandler) document.removeEventListener("input", this.inputHandler);
    if (this.mutationObserver) this.mutationObserver.disconnect();
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
  }

  private uid(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  }
}
