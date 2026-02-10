export function renderTypingIndicator(): HTMLDivElement {
  const container = document.createElement("div");
  container.setAttribute(
    "style",
    "display:flex;align-items:center;gap:4px;padding:8px 14px;background:#f3f4f6;border-radius:16px 16px 16px 4px;width:fit-content;animation:sa-fadeIn 0.2s ease-out;",
  );

  for (let i = 0; i < 3; i++) {
    const dot = document.createElement("div");
    dot.setAttribute(
      "style",
      `width:6px;height:6px;border-radius:50%;background:#9ca3af;animation:sa-typing 1.2s ease-in-out ${i * 0.15}s infinite;`,
    );
    container.appendChild(dot);
  }

  return container;
}
