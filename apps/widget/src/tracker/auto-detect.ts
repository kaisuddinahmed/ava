/**
 * Auto-Detect — Discovers e-commerce platform and site structure.
 * Finds: ATC buttons, cart elements, search, product pages, price elements,
 *        checkout flows, and page type without any manual configuration.
 */

export interface SiteStructure {
  platform: "shopify" | "woocommerce" | "magento" | "bigcommerce" | "custom";
  selectors: {
    addToCart: string | null;
    cartCount: string | null;
    cartTotal: string | null;
    searchInput: string | null;
    productTitle: string | null;
    productPrice: string | null;
    productImage: string | null;
    checkoutButton: string | null;
  };
  pageType: "landing" | "category" | "search_results" | "pdp" | "cart" | "checkout" | "account" | "other";
  meta: {
    hasCart: boolean;
    cartItemCount: number;
    isProductPage: boolean;
    isCheckout: boolean;
  };
}

export function detectSiteStructure(): SiteStructure {
  const platform = detectPlatform();
  const selectors = detectSelectors(platform);
  const pageType = detectPageType();
  const meta = detectMeta(selectors);

  return { platform, selectors, pageType, meta };
}

function detectPlatform(): SiteStructure["platform"] {
  // Shopify
  if ((window as any).Shopify || document.querySelector("script[src*='shopify']")) {
    return "shopify";
  }

  // WooCommerce
  if (
    document.body.classList.contains("woocommerce") ||
    document.querySelector("meta[name='generator'][content*='WooCommerce']") ||
    document.querySelector(".woocommerce")
  ) {
    return "woocommerce";
  }

  // Magento
  if (
    (window as any).require?.s?.contexts?._ ||
    document.querySelector("script[src*='mage']") ||
    document.querySelector("[data-mage-init]")
  ) {
    return "magento";
  }

  // BigCommerce
  if (
    (window as any).BCData ||
    document.querySelector("script[src*='bigcommerce']")
  ) {
    return "bigcommerce";
  }

  return "custom";
}

function detectSelectors(platform: string): SiteStructure["selectors"] {
  return {
    addToCart: findAddToCart(platform),
    cartCount: findCartCount(platform),
    cartTotal: findCartTotal(),
    searchInput: findSearchInput(),
    productTitle: findProductTitle(),
    productPrice: findProductPrice(),
    productImage: findProductImage(),
    checkoutButton: findCheckoutButton(),
  };
}

function findAddToCart(platform: string): string | null {
  // Platform-specific first
  const platformSelectors: Record<string, string[]> = {
    shopify: ["form[action*='/cart/add'] button[type='submit']", ".product-form__submit", "button[name='add']"],
    woocommerce: [".single_add_to_cart_button", "button.add_to_cart_button", ".add_to_cart_button"],
    magento: ["#product-addtocart-button", "button.action.tocart"],
    bigcommerce: [".add-to-cart button", "#form-action-addToCart"],
  };

  const specific = platformSelectors[platform] || [];
  for (const sel of specific) {
    if (document.querySelector(sel)) return sel;
  }

  // Generic selectors
  const generic = [
    "[data-action='add-to-cart']",
    ".add-to-cart",
    "button[name='add']",
    "form[action*='/cart'] button[type='submit']",
  ];
  for (const sel of generic) {
    if (document.querySelector(sel)) return sel;
  }

  // Text-based fallback
  const buttons = document.querySelectorAll("button, [role='button'], input[type='submit']");
  for (const btn of buttons) {
    if (/add to (cart|bag|basket)/i.test(btn.textContent || "")) {
      return buildSelector(btn as HTMLElement);
    }
  }

  return null;
}

function findCartCount(platform: string): string | null {
  const platformSelectors: Record<string, string[]> = {
    shopify: [".cart-count", "[data-cart-count]", ".cart-count-bubble"],
    woocommerce: [".cart-contents-count", ".cart-count"],
    magento: [".counter-number", ".minicart-wrapper .counter"],
    bigcommerce: [".navUser-item--cart .countPill"],
  };

  const specific = platformSelectors[platform] || [];
  for (const sel of specific) {
    if (document.querySelector(sel)) return sel;
  }

  const generic = [".cart-count", "[data-cart-count]", ".cart-badge", "#cart-count", ".cart-item-count"];
  for (const sel of generic) {
    if (document.querySelector(sel)) return sel;
  }

  return null;
}

function findCartTotal(): string | null {
  const selectors = [".cart-total", "[data-cart-total]", ".cart-subtotal", ".cart__subtotal", ".order-total"];
  for (const sel of selectors) {
    if (document.querySelector(sel)) return sel;
  }
  return null;
}

function findSearchInput(): string | null {
  const selectors = [
    "input[type='search']",
    ".search-input",
    "input[name='q']",
    "input[name='search']",
    "form[action*='search'] input",
    "[role='searchbox']",
  ];
  for (const sel of selectors) {
    if (document.querySelector(sel)) return sel;
  }
  return null;
}

function findProductTitle(): string | null {
  const selectors = [
    ".product-title",
    ".product__title",
    "h1.product-name",
    "[data-product-title]",
    ".product-single__title",
    "h1[itemprop='name']",
  ];
  for (const sel of selectors) {
    if (document.querySelector(sel)) return sel;
  }
  return null;
}

function findProductPrice(): string | null {
  const selectors = [
    ".product-price",
    ".price",
    "[data-price]",
    "[itemprop='price']",
    "meta[itemprop='price']",
    ".product__price",
    ".price--main",
  ];
  for (const sel of selectors) {
    if (document.querySelector(sel)) return sel;
  }
  return null;
}

function findProductImage(): string | null {
  const selectors = [
    ".product-image img",
    ".product__image img",
    "[data-product-image]",
    ".product-featured-image",
    ".woocommerce-product-gallery img",
  ];
  for (const sel of selectors) {
    if (document.querySelector(sel)) return sel;
  }
  return null;
}

function findCheckoutButton(): string | null {
  const selectors = [
    "a[href*='checkout']",
    "button[name='checkout']",
    ".checkout-button",
    ".cart__checkout-button",
    "#checkout",
  ];
  for (const sel of selectors) {
    if (document.querySelector(sel)) return sel;
  }
  return null;
}

function detectPageType(): SiteStructure["pageType"] {
  const path = window.location.pathname.toLowerCase();
  const url = window.location.href.toLowerCase();

  if (path === "/" || path === "/home" || path === "/index") return "landing";
  if (path.includes("/checkout") || path.includes("/pay")) return "checkout";
  if (path.includes("/cart") || path.includes("/bag") || path.includes("/basket")) return "cart";
  if (path.includes("/account") || path.includes("/profile") || path.includes("/login")) return "account";
  if (path.includes("/search") || url.includes("?q=") || url.includes("?search=")) return "search_results";

  // Product page detection
  const isProduct =
    path.includes("/product") ||
    path.includes("/item") ||
    path.includes("/p/") ||
    document.querySelector("meta[property='og:type'][content='product']") !== null ||
    document.querySelector("script[type='application/ld+json']")?.textContent?.includes('"@type":"Product"') ||
    document.querySelector(".product-detail, .product-page, .product-single") !== null;

  if (isProduct) return "pdp";

  if (
    path.includes("/collection") ||
    path.includes("/category") ||
    path.includes("/shop") ||
    path.includes("/catalog")
  ) {
    return "category";
  }

  return "other";
}

function detectMeta(selectors: SiteStructure["selectors"]): SiteStructure["meta"] {
  let cartItemCount = 0;
  if (selectors.cartCount) {
    const el = document.querySelector(selectors.cartCount);
    if (el) {
      const text = el.textContent?.trim() || "0";
      cartItemCount = parseInt(text.replace(/[^0-9]/g, ""), 10) || 0;
    }
  }

  return {
    hasCart: cartItemCount > 0,
    cartItemCount,
    isProductPage: detectPageType() === "pdp",
    isCheckout: detectPageType() === "checkout",
  };
}

function buildSelector(el: HTMLElement): string {
  if (el.id) return `#${el.id}`;
  if (el.className) {
    const classes = el.className
      .split(" ")
      .filter((c) => c.length > 0 && !c.includes(":"))
      .slice(0, 2)
      .join(".");
    if (classes) return `${el.tagName.toLowerCase()}.${classes}`;
  }
  return el.tagName.toLowerCase();
}
