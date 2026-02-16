(function () {
  let updateQtyAndTotal = null;
  // ---- helpers ----
  function findImage(containerSelector) {
    const container = document.querySelector(containerSelector);
    if (!container) return null;
    if (container.tagName && container.tagName.toLowerCase() === "img") {
      return container;
    }
    return container.querySelector("img");
  }

  function swapImage(img, url) {
    if (!img || !url) return;
    img.src = url;
    img.srcset = `${url} 1x`;
    img.sizes = "100vw";
  }

  function isValidCssColor(value) {
    if (!value) return false;
    const test = new Option().style;
    test.color = "";
    test.color = value;
    return test.color !== "";
  }

  function normalizeColorToken(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/_/g, "-")
      .replace(/\s+/g, "-");
  }

  function resolveSwatchColor(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (isValidCssColor(raw)) return raw;

    const normalized = normalizeColorToken(raw);

    // Common custom color labels used in product naming.
    const colorAliases = {
      "ice-blue": "#89cff0",
      "soft-yellow": "#f6e27a",
      "off-white": "#f5f5f0",
      "navy-blue": "#000080",
      "royal-blue": "#4169e1",
      "sky-blue": "#87ceeb",
      "light-blue": "#add8e6",
      "dark-gray": "#555555",
      "light-gray": "#d3d3d3"
    };

    if (colorAliases[normalized]) return colorAliases[normalized];

    // If color is composite like "ice-blue", prefer the last color-like token.
    const tokens = normalized.split("-").filter(Boolean);
    for (let i = tokens.length - 1; i >= 0; i -= 1) {
      if (isValidCssColor(tokens[i])) return tokens[i];
    }

    const compact = normalized.replace(/-/g, "");
    if (isValidCssColor(compact)) return compact;
    return "";
  }

  function buildSwatches(containerSelector, items, type) {
    const container = document.querySelector(containerSelector);
    if (!container) return;

    container.innerHTML = "";
    const keys = Object.keys(items || {});

    if (keys.length === 0) {
      container.style.display = "none";
      return;
    }

    container.style.display = "";

    keys.forEach((key) => {
      const btn = document.createElement("button");
      btn.type = "button";

      if (type === "color") {
        btn.className = "color-swatch";
        btn.dataset.color = key;
        btn.setAttribute("aria-label", key);
        const swatchColor = resolveSwatchColor(key);
        if (swatchColor) {
          btn.style.background = swatchColor;
        } else {
          btn.style.background = "#ddd";
        }
      } else {
        btn.className = "size-swatch";
        btn.dataset.size = key;
        btn.textContent = String(key).toUpperCase();
      }

      container.appendChild(btn);
    });
  }

  function parsePriceFromText(text) {
    if (!text) return null;
    const numberText = text.replace(/[^0-9.,]/g, "").replace(/,/g, "");
    const parsed = parseFloat(numberText);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function getUnitPriceInfo() {
    const data =
      typeof window !== "undefined" ? window.MSI_PRODUCT_IMAGE_DATA : null;
    const variants = data && Array.isArray(data.variants) ? data.variants : [];
    if (variants.length && activeColorKey && activeSizeKey) {
      const matched = variants.find((variant) => {
        const color = String(variant && variant.color ? variant.color : "").toLowerCase();
        const size = String(variant && variant.size ? variant.size : "").toLowerCase();
        return color === String(activeColorKey).toLowerCase() && size === String(activeSizeKey).toLowerCase();
      });
      const variantPrice = matched ? Number(matched.price) : NaN;
      if (Number.isFinite(variantPrice) && variantPrice > 0) {
        const variantCurrency = data && data.currency ? String(data.currency) : "";
        return { value: variantPrice, currency: variantCurrency };
      }
    }

    const dataPrice =
      data && Number.isFinite(Number(data.price)) ? Number(data.price) : 0;
    const dataCurrency = data && data.currency ? String(data.currency) : "";

    const selectors = [
      ".summary .price",
      ".price",
      ".wc-block-components-product-price__value",
      ".wc-block-components-product-price__regular",
      ".woocommerce-Price-amount",
      ".wp-block-woocommerce-product-price",
      "[itemprop='price']",
    ];

    let currency = dataCurrency || "";

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (!el) continue;

      const currencyEl = el.querySelector
        ? el.querySelector(".woocommerce-Price-currencySymbol")
        : null;
      if (!currency && currencyEl) {
        currency = currencyEl.textContent.trim();
      }

      const content = el.getAttribute ? el.getAttribute("content") : null;
      const dataAmount =
        (el.getAttribute && (el.getAttribute("data-amount") || el.getAttribute("data-price"))) ||
        (el.dataset && (el.dataset.amount || el.dataset.price));

      const value =
        parsePriceFromText(content) ||
        parsePriceFromText(String(dataAmount || "")) ||
        parsePriceFromText(el.textContent || "");

      if (value && value > 0) {
        return { value, currency };
      }
    }

    if (dataPrice > 0) {
      return { value: dataPrice, currency: dataCurrency || currency };
    }

    return { value: 0, currency };
  }

  function setDisplayedUnitPrice(value, currency) {
    const formatted = formatMoney(value, currency);
    const singleAmountMarkup = `<span class="woocommerce-Price-amount amount">${formatted}</span>`;
    const selectors = [
      ".summary .price",
      ".price",
      ".wc-block-components-product-price__value",
      ".wc-block-components-product-price__regular",
      ".wp-block-woocommerce-product-price",
    ];

    selectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((el) => {
        if (!el) return;

        const amountNodes = el.querySelectorAll
          ? el.querySelectorAll(".woocommerce-Price-amount")
          : [];

        // Collapse price ranges ("low – high") to one value when a concrete
        // variant/size is selected.
        if (amountNodes.length > 1) {
          el.innerHTML = singleAmountMarkup;
          return;
        }

        if (amountNodes.length === 1) {
          amountNodes[0].textContent = formatted;
          return;
        }

        if (!el.children.length) {
          el.textContent = formatted;
          return;
        }

        // Fallback for wrappers with nested non-price elements.
        if (selector === ".summary .price" || selector === ".price") {
          el.innerHTML = singleAmountMarkup;
        }
      });
    });

    document.querySelectorAll("[itemprop='price']").forEach((el) => {
      if (el.getAttribute && el.getAttribute("content") !== null) {
        el.setAttribute("content", String(Number(value || 0)));
      }
    });
  }

  function formatMoney(value, currency) {
    const formatted = Number(value || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return currency ? `${currency}${formatted}` : formatted;
  }

  function initQtyTotal() {
    const qtyInput = document.querySelector(".msi-qty-input");
    const totalEl = document.querySelector(".msi-total-amount");
    if (!qtyInput || !totalEl) return;

    if (typeof updateQtyAndTotal === "function") {
      updateQtyAndTotal();
      return;
    }

    const update = () => {
      const qty = Math.max(0, parseInt(qtyInput.value, 10) || 0);
      const { value, currency } = getUnitPriceInfo();
      setDisplayedUnitPrice(value, currency);
      totalEl.textContent = formatMoney(value * qty, currency);
    };

    updateQtyAndTotal = update;

    qtyInput.addEventListener("input", update);
    qtyInput.addEventListener("change", update);
    update();
  }

  function getCustomQtyInput() {
    return document.querySelector(".msi-qty-input");
  }

  function getWooQtyInput() {
    const form = wooVariationForm || document.querySelector("form.cart");
    if (!form) return null;
    return form.querySelector("input.qty");
  }

  function clampQty(rawQty, min, max) {
    let qty = parseInt(rawQty, 10);
    if (!Number.isFinite(qty)) qty = Number.isFinite(min) ? min : 1;
    if (Number.isFinite(min)) qty = Math.max(min, qty);
    if (Number.isFinite(max) && max > 0) qty = Math.min(max, qty);
    return qty;
  }

  function syncWooQtyFromCustom() {
    const customQty = getCustomQtyInput();
    const wooQty = getWooQtyInput();
    if (!customQty || !wooQty) return;

    const min = Number(wooQty.getAttribute("min"));
    const max = Number(wooQty.getAttribute("max"));
    const normalized = clampQty(customQty.value, Number.isFinite(min) ? min : 1, Number.isFinite(max) ? max : NaN);

    customQty.value = String(normalized);
    if (wooQty.value !== String(normalized)) {
      wooQty.value = String(normalized);
      wooQty.dispatchEvent(new Event("input", { bubbles: true }));
      wooQty.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  function syncCustomQtyFromWoo() {
    const customQty = getCustomQtyInput();
    const wooQty = getWooQtyInput();
    if (!customQty || !wooQty) return;

    const min = Number(wooQty.getAttribute("min"));
    const max = Number(wooQty.getAttribute("max"));
    const normalized = clampQty(wooQty.value, Number.isFinite(min) ? min : 1, Number.isFinite(max) ? max : NaN);

    if (wooQty.value !== String(normalized)) {
      wooQty.value = String(normalized);
    }
    if (customQty.value !== String(normalized)) {
      customQty.value = String(normalized);
    }
  }

  function bindQtySync() {
    const customQty = getCustomQtyInput();
    const wooQty = getWooQtyInput();
    if (!customQty || !wooQty) return;

    const cartForm = wooQty.closest("form.cart") || document.querySelector("form.cart");
    if (cartForm) {
      cartForm.classList.add("msi-using-custom-price-qty");

      if (cartForm.dataset.msiQtySubmitBound !== "true") {
        cartForm.dataset.msiQtySubmitBound = "true";
        cartForm.addEventListener("submit", () => {
          syncWooQtyFromCustom();
        });
      }
    }

    const min = wooQty.getAttribute("min");
    const max = wooQty.getAttribute("max");
    const step = wooQty.getAttribute("step");
    if (min) customQty.setAttribute("min", min);
    if (max) customQty.setAttribute("max", max);
    if (step) customQty.setAttribute("step", step);

    if (customQty.dataset.msiQtyBound !== "true") {
      customQty.dataset.msiQtyBound = "true";
      customQty.addEventListener("input", () => {
        syncWooQtyFromCustom();
        if (typeof updateQtyAndTotal === "function") updateQtyAndTotal();
      });
      customQty.addEventListener("change", () => {
        syncWooQtyFromCustom();
        if (typeof updateQtyAndTotal === "function") updateQtyAndTotal();
      });
    }

    if (wooQty.dataset.msiQtyBound !== "true") {
      wooQty.dataset.msiQtyBound = "true";
      wooQty.addEventListener("input", () => {
        syncCustomQtyFromWoo();
        if (typeof updateQtyAndTotal === "function") updateQtyAndTotal();
      });
      wooQty.addEventListener("change", () => {
        syncCustomQtyFromWoo();
        if (typeof updateQtyAndTotal === "function") updateQtyAndTotal();
      });
    }

    syncWooQtyFromCustom();
  }

  let imagesReady = false;

  function markImagesReady() {
    if (imagesReady) return;
    imagesReady = true;
    if (document.documentElement) {
      document.documentElement.classList.add("msi-images-ready");
    }
  }

  function onImageLoad(img, cb) {
    if (!img) {
      cb();
      return;
    }
    if (img.complete && img.naturalWidth !== 0) {
      cb();
      return;
    }
    const done = () => cb();
    img.addEventListener("load", done, { once: true });
    img.addEventListener("error", done, { once: true });
  }

  function markReadyAfterSwap(colorImg, sizeImg) {
    if (imagesReady) return;
    let pending = 0;
    const done = () => {
      pending -= 1;
      if (pending <= 0) markImagesReady();
    };

    [colorImg, sizeImg].forEach((img) => {
      if (!img) return;
      pending += 1;
      onImageLoad(img, done);
    });

    if (pending === 0) markImagesReady();
    setTimeout(markImagesReady, 1500);
  }

  // ---- image mappings (from inline JSON injected by plugin) ----
  let colorImages = {};
  let sizeImages = {};
  let activeColorKey = null;
  let activeSizeKey = null;
  let wooVariationForm = null;
  let wooColorSelect = null;
  let wooSizeSelect = null;
  let syncingFromWoo = false;
  let syncingToWoo = false;

  function loadData() {
    const data =
      typeof window !== "undefined" ? window.MSI_PRODUCT_IMAGE_DATA : null;
    colorImages = data && data.colors ? data.colors : {};
    sizeImages = data && data.sizes ? data.sizes : {};
  }

  function getFirstKey(obj) {
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) return key;
    }
    return null;
  }

  function normalizeVariantToken(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[_\s-]+/g, "");
  }

  function normalizeColorTokenForMatch(value) {
    const normalized = normalizeVariantToken(value);
    return normalized === "grey" ? "gray" : normalized;
  }

  function findMatchingDataKey(keys, rawValue, isColor) {
    if (!rawValue) return "";
    const normalize = isColor ? normalizeColorTokenForMatch : normalizeVariantToken;
    const target = normalize(rawValue);
    if (!target) return "";
    const list = Array.isArray(keys) ? keys : [];
    return list.find((key) => normalize(key) === target) || "";
  }

  function findMatchingOptionValue(select, rawValue, isColor) {
    if (!select || !rawValue) return "";
    const normalize = isColor ? normalizeColorTokenForMatch : normalizeVariantToken;
    const target = normalize(rawValue);
    if (!target) return "";
    const options = Array.from(select.options || []).filter((opt) => opt.value);
    const matched = options.find((opt) => normalize(opt.value) === target);
    return matched ? matched.value : "";
  }

  function setWooSelectValue(select, rawValue, isColor) {
    if (!select || !rawValue) return false;
    const nextValue = findMatchingOptionValue(select, rawValue, isColor);
    if (!nextValue) return false;
    if (select.value === nextValue) return true;
    select.value = nextValue;
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function markActiveColorSwatch(colorKey) {
    document.querySelectorAll(".color-swatch").forEach((swatch) => {
      swatch.classList.toggle("is-active", swatch.dataset.color === colorKey);
    });
  }

  function markActiveSizeSwatch(sizeKey) {
    document.querySelectorAll(".size-swatch").forEach((swatch) => {
      swatch.classList.toggle("is-active", swatch.dataset.size === sizeKey);
    });
  }

  function syncWooFromCustom() {
    if (syncingFromWoo) return;
    syncingToWoo = true;
    try {
      if (activeColorKey) setWooSelectValue(wooColorSelect, activeColorKey, true);
      if (activeSizeKey) setWooSelectValue(wooSizeSelect, activeSizeKey, false);
    } finally {
      syncingToWoo = false;
    }
  }

  function syncCustomFromWoo() {
    if (syncingToWoo) return false;
    syncingFromWoo = true;
    let updated = false;
    try {
      loadData();

      if (wooColorSelect && wooColorSelect.value) {
        const matchedColorKey = findMatchingDataKey(Object.keys(colorImages), wooColorSelect.value, true);
        if (matchedColorKey) {
          markActiveColorSwatch(matchedColorKey);
          applyColor(matchedColorKey);
          updated = true;
        }
      }

      if (wooSizeSelect && wooSizeSelect.value) {
        const matchedSizeKey = findMatchingDataKey(Object.keys(sizeImages), wooSizeSelect.value, false);
        if (matchedSizeKey) {
          markActiveSizeSwatch(matchedSizeKey);
          applySize(matchedSizeKey);
          updated = true;
        }
      }
    } finally {
      syncingFromWoo = false;
    }

    return updated;
  }

  function bindWooVariationSync() {
    wooVariationForm = document.querySelector("form.variations_form");
    if (!wooVariationForm) return;

    const variationSelects = Array.from(
      wooVariationForm.querySelectorAll('select[name^="attribute_"]')
    );
    if (!variationSelects.length) return;

    wooColorSelect = variationSelects.find((select) => /color/i.test(select.name)) || null;
    wooSizeSelect = variationSelects.find((select) => /size/i.test(select.name)) || null;

    if (!wooColorSelect && !wooSizeSelect) return;

    const hasCustomSwatches = !!document.querySelector(".color-swatch, .size-swatch");
    if (!hasCustomSwatches) return;

    wooVariationForm.classList.add("msi-using-custom-swatches");

    const onWooChange = () => {
      syncCustomFromWoo();
      bindQtySync();
    };

    if (wooColorSelect) wooColorSelect.addEventListener("change", onWooChange);
    if (wooSizeSelect) wooSizeSelect.addEventListener("change", onWooChange);
  }

  function applyColor(color) {
    loadData();
    const colorUrl = colorImages[color];
    activeColorKey = color;
    if (!colorUrl) return;

    const colorImg = findImage(".product-image-color");
    const sizeImg = findImage(".product-image-size");

    if (colorImg) swapImage(colorImg, colorUrl);

    if (sizeImg) {
      const sizeKey = activeSizeKey || getFirstKey(sizeImages);
      if (sizeKey && sizeImages[sizeKey]) {
        swapImage(sizeImg, sizeImages[sizeKey]);
      }
    }

    markReadyAfterSwap(colorImg, sizeImg);
    const { value, currency } = getUnitPriceInfo();
    setDisplayedUnitPrice(value, currency);
    if (typeof updateQtyAndTotal === "function") {
      updateQtyAndTotal();
    }
    syncWooFromCustom();
  }

  function applySize(sizeKey) {
    loadData();
    const sizeUrl = sizeImages[sizeKey];
    if (!sizeUrl) return;

    activeSizeKey = sizeKey;
    const sizeImg = findImage(".product-image-size");
    if (sizeImg) swapImage(sizeImg, sizeUrl);
    markReadyAfterSwap(null, sizeImg);
    const { value, currency } = getUnitPriceInfo();
    setDisplayedUnitPrice(value, currency);
    if (typeof updateQtyAndTotal === "function") {
      updateQtyAndTotal();
    }
    syncWooFromCustom();
  }

  // ---- default selection (runs once when DOM is usable) ----
  function initDefaultColor() {
    loadData();
    buildSwatches(".color-swatches", colorImages, "color");
    buildSwatches(".size-swatches", sizeImages, "size");
    bindWooVariationSync();

    // If Woo variation selects already have a value, prefer those.
    if (syncCustomFromWoo()) {
      initQtyTotal();
      bindQtySync();
      return;
    }

    let selectedColor = false;
    const firstSwatch = document.querySelector(".color-swatch");
    if (firstSwatch) {
      const color = firstSwatch.dataset.color;
      if (color) {
        markActiveColorSwatch(color);
        applyColor(color);
        selectedColor = true;
      }
    }

    if (!selectedColor) {
      const fallbackColor = getFirstKey(colorImages);
      if (fallbackColor) {
        applyColor(fallbackColor);
      }
    }

    const firstSize = document.querySelector(".size-swatch");
    if (firstSize && firstSize.dataset.size) {
      markActiveSizeSwatch(firstSize.dataset.size);
      applySize(firstSize.dataset.size);
    }

    initQtyTotal();
    bindQtySync();
  }

  // ---- event delegation for swatches ----
  document.addEventListener("click", function (e) {
    const btn = e.target.closest(".color-swatch");
    if (!btn) return;

    const color = btn.dataset.color;
    if (!color) return;

    document
      .querySelectorAll(".color-swatch")
      .forEach((s) => s.classList.remove("is-active"));

    btn.classList.add("is-active");
    applyColor(color);
  });

  document.addEventListener("click", function (e) {
    const btn = e.target.closest(".size-swatch");
    if (!btn) return;

    const sizeKey = btn.dataset.size;
    if (!sizeKey) return;

    document
      .querySelectorAll(".size-swatch")
      .forEach((s) => s.classList.remove("is-active"));

    btn.classList.add("is-active");
    applySize(sizeKey);
  });

  // ---- safe init (handles Gutenberg timing) ----
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initDefaultColor);
  } else {
    initDefaultColor();
  }
})();
