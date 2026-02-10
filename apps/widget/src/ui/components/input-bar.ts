import type { WidgetConfig } from "../../config.js";

interface InputBarOptions {
  config: WidgetConfig;
  onSend: (text: string) => void;
}

/**
 * Input Bar — Text input with send button for the chat panel.
 */
export function renderInputBar(opts: InputBarOptions): HTMLDivElement {
  const { config, onSend } = opts;

  const container = document.createElement("div");
  container.setAttribute(
    "style",
    "padding:12px 16px;display:flex;gap:8px;align-items:center;",
  );

  // Input field
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Ask anything...";
  input.setAttribute(
    "style",
    `flex:1;border:1px solid #e5e7eb;border-radius:10px;padding:10px 14px;font-size:14px;font-family:${config.fontFamily};outline:none;transition:border-color 0.2s ease;background:#fafafa;`,
  );

  // Send button
  const sendBtn = document.createElement("button");
  sendBtn.setAttribute("aria-label", "Send message");
  sendBtn.setAttribute(
    "style",
    `background:#e5e7eb;color:#9ca3af;border:none;border-radius:10px;width:40px;height:40px;cursor:default;display:flex;align-items:center;justify-content:center;font-size:16px;transition:all 0.2s ease;flex-shrink:0;`,
  );
  sendBtn.textContent = "\u2191";

  // Update send button state
  const updateSendState = () => {
    const hasText = input.value.trim().length > 0;
    sendBtn.style.background = hasText ? config.brandColor : "#e5e7eb";
    sendBtn.style.color = hasText ? "#fff" : "#9ca3af";
    sendBtn.style.cursor = hasText ? "pointer" : "default";
  };

  // Handle send
  const handleSend = () => {
    const text = input.value.trim();
    if (!text) return;
    onSend(text);
    input.value = "";
    updateSendState();
    input.focus();
  };

  // Event listeners
  input.addEventListener("input", updateSendState);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleSend();
  });
  input.addEventListener("focus", () => {
    input.style.borderColor = config.brandColor;
    input.style.background = "#fff";
  });
  input.addEventListener("blur", () => {
    input.style.borderColor = "#e5e7eb";
    input.style.background = "#fafafa";
  });

  sendBtn.addEventListener("click", handleSend);

  container.appendChild(input);
  container.appendChild(sendBtn);

  return container;
}
