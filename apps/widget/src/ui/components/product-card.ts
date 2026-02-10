import type { WidgetConfig, ProductCard } from "../../config.js";

interface ProductCardOptions {
  config: WidgetConfig;
  card: ProductCard;
  index: number;
  onAddToCart: (productId: string) => void;
}

export function renderProductCard(opts: ProductCardOptions): HTMLDivElement {
  const { config, card, index, onAddToCart } = opts;
  const hasDiscount = card.original_price && card.original_price > card.price;
  const discountPct = hasDiscount
    ? Math.round(
        ((card.original_price! - card.price) / card.original_price!) * 100,
      )
    : 0;

  const container = document.createElement("div");
  container.setAttribute(
    "style",
    `background:#fff;border-radius:12px;border:1px solid #f0f0f0;overflow:hidden;animation:sa-slideUp 0.3s ease-out ${index * 0.08}s both;cursor:pointer;transition:box-shadow 0.2s ease,transform 0.2s ease;`,
  );
  container.addEventListener("mouseenter", () => {
    container.style.boxShadow = "0 4px 20px rgba(0,0,0,0.08)";
    container.style.transform = "translateY(-2px)";
  });
  container.addEventListener("mouseleave", () => {
    container.style.boxShadow = "none";
    container.style.transform = "translateY(0)";
  });

  // Image wrapper
  const imgWrap = document.createElement("div");
  imgWrap.setAttribute(
    "style",
    "position:relative;padding-top:75%;background:#f9fafb;overflow:hidden;",
  );

  const img = document.createElement("img");
  img.src = card.image_url;
  img.alt = card.title;
  img.loading = "lazy";
  img.setAttribute(
    "style",
    "position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;",
  );
  imgWrap.appendChild(img);

  if (hasDiscount) {
    const badge = document.createElement("span");
    badge.setAttribute(
      "style",
      `position:absolute;top:8px;left:8px;background:${config.accentColor};color:#fff;font-size:11px;font-weight:700;padding:3px 8px;border-radius:6px;`,
    );
    badge.textContent = `-${discountPct}%`;
    imgWrap.appendChild(badge);
  }

  if (card.differentiator) {
    const diff = document.createElement("span");
    diff.setAttribute(
      "style",
      "position:absolute;bottom:8px;left:8px;background:rgba(0,0,0,0.7);color:#fff;font-size:10px;font-weight:500;padding:3px 8px;border-radius:6px;backdrop-filter:blur(4px);",
    );
    diff.textContent = card.differentiator;
    imgWrap.appendChild(diff);
  }
  container.appendChild(imgWrap);

  // Info
  const info = document.createElement("div");
  info.setAttribute("style", "padding:10px 12px;");

  const title = document.createElement("div");
  title.setAttribute(
    "style",
    "font-size:13px;font-weight:500;color:#1a1a2e;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;",
  );
  title.textContent = card.title;
  info.appendChild(title);

  // Rating
  const ratingWrap = document.createElement("div");
  ratingWrap.setAttribute(
    "style",
    "display:flex;align-items:center;gap:4px;margin:4px 0;",
  );
  const stars = document.createElement("span");
  stars.setAttribute("style", "font-size:12px;color:#f59e0b;");
  stars.textContent =
    "\u2605".repeat(Math.round(card.rating)) +
    "\u2606".repeat(5 - Math.round(card.rating));
  const reviewCount = document.createElement("span");
  reviewCount.setAttribute("style", "font-size:11px;color:#9ca3af;");
  reviewCount.textContent = `(${card.review_count})`;
  ratingWrap.appendChild(stars);
  ratingWrap.appendChild(reviewCount);
  info.appendChild(ratingWrap);

  // Price + CTA row
  const priceRow = document.createElement("div");
  priceRow.setAttribute(
    "style",
    "display:flex;justify-content:space-between;align-items:center;",
  );

  const priceWrap = document.createElement("div");
  const price = document.createElement("span");
  price.setAttribute("style", "font-size:16px;font-weight:700;color:#111;");
  price.textContent = `$${card.price.toFixed(2)}`;
  priceWrap.appendChild(price);

  if (hasDiscount) {
    const origPrice = document.createElement("span");
    origPrice.setAttribute(
      "style",
      "font-size:12px;color:#9ca3af;text-decoration:line-through;margin-left:6px;",
    );
    origPrice.textContent = `$${card.original_price!.toFixed(2)}`;
    priceWrap.appendChild(origPrice);
  }

  const addBtn = document.createElement("button");
  addBtn.setAttribute(
    "style",
    `background:${config.brandColor};color:#fff;border:none;border-radius:8px;padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer;transition:background 0.2s ease,transform 0.1s ease;font-family:${config.fontFamily};`,
  );
  addBtn.textContent = "+ Add";
  addBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    onAddToCart(card.product_id);
  });
  addBtn.addEventListener("mousedown", () => {
    addBtn.style.transform = "scale(0.95)";
  });
  addBtn.addEventListener("mouseup", () => {
    addBtn.style.transform = "scale(1)";
  });

  priceRow.appendChild(priceWrap);
  priceRow.appendChild(addBtn);
  info.appendChild(priceRow);
  container.appendChild(info);

  return container;
}
