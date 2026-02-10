import type { WidgetConfig } from "../../config.js";

interface NudgeBubbleOptions {
  config: WidgetConfig;
  message: string;
  ctaLabel?: string;
  onCtaClick: () => void;
  onDismiss: () => void;
}

export function renderNudgeBubble(opts: NudgeBubbleOptions): HTMLDivElement {
  const { config, message, ctaLabel, onCtaClick, onDismiss } = opts;

  const container = document.createElement("div");
  container.setAttribute(
    "style",
    `position:absolute;bottom:72px;right:0;width:280px;background:#fff;border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,0.12),0 2px 8px rgba(0,0,0,0.06);padding:0;animation:sa-slideUp 0.3s ease-out;overflow:hidden;font-family:${config.fontFamily};`,
  );

  // Close button
  const closeBtn = document.createElement("button");
  closeBtn.setAttribute(
    "style",
    "position:absolute;top:8px;right:8px;background:none;border:none;font-size:16px;color:#9ca3af;cursor:pointer;padding:4px;line-height:1;",
  );
  closeBtn.textContent = "\u00d7";
  closeBtn.setAttribute("aria-label", "Dismiss");
  closeBtn.addEventListener("click", onDismiss);
  container.appendChild(closeBtn);

  // Content
  const content = document.createElement("div");
  content.setAttribute("style", "padding:16px 16px 12px;");

  const nameTag = document.createElement("div");
  nameTag.setAttribute(
    "style",
    `font-size:11px;font-weight:600;color:${config.accentColor};text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;`,
  );
  nameTag.textContent = config.assistantName;
  content.appendChild(nameTag);

  const messageEl = document.createElement("div");
  messageEl.setAttribute("style", "font-size:14px;line-height:1.5;color:#1a1a2e;");
  messageEl.textContent = message;
  content.appendChild(messageEl);
  container.appendChild(content);

  // CTA
  if (ctaLabel) {
    const ctaWrap = document.createElement("div");
    ctaWrap.setAttribute("style", "padding:0 16px 14px;");

    const ctaBtn = document.createElement("button");
    ctaBtn.setAttribute(
      "style",
      `width:100%;background:${config.brandColor};color:#fff;border:none;border-radius:10px;padding:10px 16px;font-size:13px;font-weight:600;cursor:pointer;font-family:${config.fontFamily};transition:opacity 0.2s ease;`,
    );
    ctaBtn.textContent = ctaLabel;
    ctaBtn.addEventListener("click", onCtaClick);
    ctaBtn.addEventListener("mouseenter", () => {
      ctaBtn.style.opacity = "0.9";
    });
    ctaBtn.addEventListener("mouseleave", () => {
      ctaBtn.style.opacity = "1";
    });
    ctaWrap.appendChild(ctaBtn);
    container.appendChild(ctaWrap);
  }

  return container;
}
