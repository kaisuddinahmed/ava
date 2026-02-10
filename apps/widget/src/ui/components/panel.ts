import type { WidgetConfig } from "../../config.js";

interface PanelOptions {
  config: WidgetConfig;
  onMinimize: () => void;
}

/**
 * Panel — The expanded widget panel with header, content area, and footer.
 * Contains: header with branding, scrollable message area, input bar.
 */
export function renderPanel(opts: PanelOptions): HTMLDivElement {
  const { config, onMinimize } = opts;
  const isRight = config.position === "bottom-right";

  const panel = document.createElement("div");
  panel.id = "ava-panel";
  panel.setAttribute(
    "style",
    `position:absolute;bottom:72px;${isRight ? "right" : "left"}:0;width:370px;max-height:520px;background:#fff;border-radius:20px;box-shadow:0 12px 60px rgba(0,0,0,0.15),0 2px 8px rgba(0,0,0,0.06);display:flex;flex-direction:column;overflow:hidden;animation:sa-slideUp 0.3s ease-out;`,
  );

  // --- Header ---
  const header = document.createElement("div");
  header.setAttribute(
    "style",
    `background:linear-gradient(135deg,${config.brandColor},${config.brandColorLight});padding:16px 20px;display:flex;align-items:center;justify-content:space-between;`,
  );

  const headerLeft = document.createElement("div");
  headerLeft.setAttribute("style", "display:flex;align-items:center;gap:10px;");

  const icon = document.createElement("div");
  icon.setAttribute(
    "style",
    "width:36px;height:36px;border-radius:10px;background:rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;font-size:18px;",
  );
  icon.textContent = "\uD83D\uDECD\uFE0F";

  const nameWrap = document.createElement("div");
  const nameEl = document.createElement("div");
  nameEl.setAttribute("style", "font-size:15px;font-weight:700;color:#fff;");
  nameEl.textContent = config.assistantName;

  const subEl = document.createElement("div");
  subEl.setAttribute("style", "font-size:11px;color:rgba(255,255,255,0.7);");
  subEl.textContent = "Your shopping assistant";

  nameWrap.appendChild(nameEl);
  nameWrap.appendChild(subEl);
  headerLeft.appendChild(icon);
  headerLeft.appendChild(nameWrap);

  // Minimize button
  const minimizeBtn = document.createElement("button");
  minimizeBtn.setAttribute(
    "style",
    "background:rgba(255,255,255,0.15);border:none;color:#fff;width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;transition:background 0.2s ease;",
  );
  minimizeBtn.textContent = "\u2193";
  minimizeBtn.setAttribute("aria-label", "Minimize");
  minimizeBtn.addEventListener("click", onMinimize);
  minimizeBtn.addEventListener("mouseenter", () => {
    minimizeBtn.style.background = "rgba(255,255,255,0.25)";
  });
  minimizeBtn.addEventListener("mouseleave", () => {
    minimizeBtn.style.background = "rgba(255,255,255,0.15)";
  });

  header.appendChild(headerLeft);
  header.appendChild(minimizeBtn);
  panel.appendChild(header);

  // --- Content area (slot for messages) ---
  const content = document.createElement("div");
  content.id = "ava-panel-content";
  content.setAttribute(
    "style",
    "flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px;background:#fafafa;min-height:200px;max-height:340px;",
  );
  panel.appendChild(content);

  // --- Footer (slot for input bar) ---
  const footer = document.createElement("div");
  footer.id = "ava-panel-footer";
  footer.setAttribute(
    "style",
    "border-top:1px solid #f0f0f0;background:#fff;",
  );
  panel.appendChild(footer);

  return panel;
}

/**
 * Render the empty state shown when no messages exist.
 */
export function renderEmptyState(): HTMLDivElement {
  const empty = document.createElement("div");
  empty.setAttribute(
    "style",
    "text-align:center;padding:40px 20px;color:#9ca3af;font-size:13px;",
  );
  const wave = document.createElement("div");
  wave.setAttribute("style", "font-size:28px;margin-bottom:8px;");
  wave.textContent = "\uD83D\uDC4B";
  empty.appendChild(wave);
  empty.appendChild(document.createTextNode("I'm here if you need anything"));
  return empty;
}
