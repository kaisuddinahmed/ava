/**
 * Inject CSS animations and base styles.
 * Accepts a ShadowRoot (for widget isolation) or falls back to document.head.
 */
export function injectGlobalStyles(
  target: ShadowRoot | HTMLElement = document.head,
): void {
  const existing =
    target instanceof ShadowRoot
      ? target.querySelector("#sa-global-styles")
      : document.getElementById("sa-global-styles");
  if (existing) return;

  const style = document.createElement("style");
  style.id = "sa-global-styles";
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&display=swap');

    @keyframes sa-slideUp {
      from { opacity: 0; transform: translateY(16px) scale(0.96); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes sa-slideDown {
      from { opacity: 0; transform: translateY(-10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes sa-fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes sa-scaleIn {
      from { opacity: 0; transform: scale(0.8); }
      to { opacity: 1; transform: scale(1); }
    }
    @keyframes sa-pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.05); }
    }
    @keyframes sa-shimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
    @keyframes sa-breathe {
      0%, 100% { box-shadow: 0 0 0 0 rgba(233, 69, 96, 0.3); }
      50% { box-shadow: 0 0 0 8px rgba(233, 69, 96, 0); }
    }
    @keyframes sa-typing {
      0%, 60%, 100% { opacity: 0.3; }
      30% { opacity: 1; }
    }

    *, *::before, *::after {
      box-sizing: border-box;
    }
  `;

  target.appendChild(style);
}
