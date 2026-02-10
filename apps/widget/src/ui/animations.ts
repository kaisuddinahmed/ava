/**
 * Animations — Utility functions for widget animations.
 * All animations are CSS-based for performance.
 */

/**
 * Fade in an element.
 */
export function fadeIn(el: HTMLElement, duration = 200): void {
  el.style.opacity = "0";
  el.style.transition = `opacity ${duration}ms ease-out`;
  // Force reflow
  el.offsetHeight;
  el.style.opacity = "1";
}

/**
 * Fade out an element and optionally remove it.
 */
export function fadeOut(el: HTMLElement, duration = 200, remove = false): Promise<void> {
  return new Promise((resolve) => {
    el.style.transition = `opacity ${duration}ms ease-out`;
    el.style.opacity = "0";
    setTimeout(() => {
      if (remove && el.parentNode) {
        el.parentNode.removeChild(el);
      }
      resolve();
    }, duration);
  });
}

/**
 * Slide up an element into view.
 */
export function slideUp(el: HTMLElement, duration = 300): void {
  el.style.transform = "translateY(16px)";
  el.style.opacity = "0";
  el.style.transition = `transform ${duration}ms ease-out, opacity ${duration}ms ease-out`;
  // Force reflow
  el.offsetHeight;
  el.style.transform = "translateY(0)";
  el.style.opacity = "1";
}

/**
 * Slide down an element out of view.
 */
export function slideDown(el: HTMLElement, duration = 300): Promise<void> {
  return new Promise((resolve) => {
    el.style.transition = `transform ${duration}ms ease-out, opacity ${duration}ms ease-out`;
    el.style.transform = "translateY(16px)";
    el.style.opacity = "0";
    setTimeout(resolve, duration);
  });
}

/**
 * Scale in from small (for badges, dots).
 */
export function scaleIn(el: HTMLElement, duration = 200): void {
  el.style.transform = "scale(0.8)";
  el.style.opacity = "0";
  el.style.transition = `transform ${duration}ms ease-out, opacity ${duration}ms ease-out`;
  el.offsetHeight;
  el.style.transform = "scale(1)";
  el.style.opacity = "1";
}

/**
 * Pulse animation (used for unread indicator).
 */
export function pulse(el: HTMLElement, duration = 300): void {
  el.style.transition = `transform ${duration / 2}ms ease-in-out`;
  el.style.transform = "scale(1.05)";
  setTimeout(() => {
    el.style.transform = "scale(1)";
  }, duration / 2);
}

/**
 * Add a shimmer loading effect.
 */
export function shimmer(el: HTMLElement): void {
  el.style.background = "linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)";
  el.style.backgroundSize = "200% 100%";
  el.style.animation = "sa-shimmer 1.5s infinite";
}

/**
 * Remove all animation styles from an element.
 */
export function clearAnimation(el: HTMLElement): void {
  el.style.transition = "";
  el.style.transform = "";
  el.style.opacity = "";
  el.style.animation = "";
}
