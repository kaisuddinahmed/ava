import type { WidgetConfig, WidgetState } from "../../config.js";

interface ToggleButtonOptions {
  config: WidgetConfig;
  onClick: () => void;
}

/**
 * Toggle Button — The floating action button that opens/closes the AVA widget.
 * Shows unread indicator, breathe animation when there are pending nudges.
 */
export function renderToggleButton(opts: ToggleButtonOptions): HTMLButtonElement {
  const { config, onClick } = opts;

  const btn = document.createElement("button");
  btn.id = "ava-toggle-btn";
  btn.setAttribute("aria-label", "Open shopping assistant");
  btn.setAttribute(
    "style",
    `width:56px;height:56px;border-radius:16px;background:linear-gradient(135deg,${config.brandColor},${config.brandColorLight});color:#fff;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:24px;box-shadow:0 4px 20px rgba(0,0,0,0.15);transition:transform 0.2s ease,box-shadow 0.2s ease;position:relative;`,
  );
  btn.textContent = "\uD83D\uDECD\uFE0F";

  btn.addEventListener("click", onClick);

  btn.addEventListener("mouseenter", () => {
    btn.style.transform = "scale(1.05)";
    btn.style.boxShadow = "0 6px 28px rgba(0,0,0,0.2)";
  });

  btn.addEventListener("mouseleave", () => {
    btn.style.transform = "scale(1)";
    btn.style.boxShadow = "0 4px 20px rgba(0,0,0,0.15)";
  });

  return btn;
}

/**
 * Update the toggle button appearance based on widget state.
 */
export function updateToggleButton(
  btn: HTMLButtonElement,
  state: WidgetState,
  hasUnread: boolean,
  config: WidgetConfig,
): void {
  // Icon
  btn.textContent = state === "expanded" ? "\u00D7" : "\uD83D\uDECD\uFE0F";
  btn.setAttribute(
    "aria-label",
    state === "expanded" ? "Close assistant" : "Open assistant",
  );

  // Breathe animation for unread
  btn.style.animation =
    hasUnread && state !== "expanded"
      ? "sa-breathe 2s ease-in-out infinite"
      : "none";

  // Unread dot
  let dot = btn.querySelector(".ava-unread-dot") as HTMLDivElement | null;
  if (hasUnread && state !== "expanded") {
    if (!dot) {
      dot = document.createElement("div");
      dot.className = "ava-unread-dot";
      dot.setAttribute(
        "style",
        `position:absolute;top:-2px;right:-2px;width:14px;height:14px;border-radius:50%;background:${config.accentColor};border:2px solid #fff;animation:sa-scaleIn 0.3s ease-out;`,
      );
      btn.appendChild(dot);
    }
  } else if (dot) {
    dot.remove();
  }
}
