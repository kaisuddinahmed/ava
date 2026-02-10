import type { WidgetConfig, WidgetMessage } from "../../config.js";

interface MessageBubbleOptions {
  config: WidgetConfig;
  message: WidgetMessage;
}

/**
 * Message Bubble — Renders a single chat message (user, assistant, or system).
 */
export function renderMessageBubble(opts: MessageBubbleOptions): HTMLDivElement {
  const { config, message } = opts;

  const wrapper = document.createElement("div");
  wrapper.setAttribute("data-message-id", message.id);

  if (!message.content) return wrapper;

  const isUser = message.type === "user";
  const isSystem = message.type === "system";

  const bubble = document.createElement("div");

  // Alignment
  const marginLeft = isUser ? "auto" : "0";
  const marginRight = isUser ? "0" : "auto";

  // Background
  let background: string;
  let color: string;
  let border: string;
  let fontSize: string;
  let fontWeight: string;
  let borderRadius: string;
  let padding: string;

  if (isUser) {
    background = config.brandColor;
    color = "#fff";
    border = "none";
    fontSize = "14px";
    fontWeight = "400";
    borderRadius = "16px 16px 4px 16px";
    padding = "10px 16px";
  } else if (isSystem) {
    background = "#f0fdf4";
    color = "#166534";
    border = "1px solid #bbf7d0";
    fontSize = "12px";
    fontWeight = "500";
    borderRadius = "16px 16px 16px 4px";
    padding = "8px 14px";
  } else {
    // Assistant
    background = "#fff";
    color = "#1a1a2e";
    border = "1px solid #f0f0f0";
    fontSize = "14px";
    fontWeight = "400";
    borderRadius = "16px 16px 16px 4px";
    padding = "10px 16px";
  }

  const boxShadow = message.type === "assistant" ? "0 1px 4px rgba(0,0,0,0.04)" : "none";

  bubble.setAttribute(
    "style",
    `max-width:85%;margin-left:${marginLeft};margin-right:${marginRight};background:${background};color:${color};padding:${padding};border-radius:${borderRadius};font-size:${fontSize};line-height:1.5;font-weight:${fontWeight};box-shadow:${boxShadow};border:${border};animation:sa-fadeIn 0.2s ease-out;word-wrap:break-word;`,
  );
  bubble.textContent = message.content;
  wrapper.appendChild(bubble);

  // Timestamp
  if (message.type !== "system") {
    const timeEl = document.createElement("div");
    const time = new Date(message.timestamp);
    const timeStr = `${time.getHours().toString().padStart(2, "0")}:${time.getMinutes().toString().padStart(2, "0")}`;
    timeEl.setAttribute(
      "style",
      `font-size:10px;color:#9ca3af;margin-top:4px;text-align:${isUser ? "right" : "left"};`,
    );
    timeEl.textContent = timeStr;
    wrapper.appendChild(timeEl);
  }

  return wrapper;
}
