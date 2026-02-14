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
        if (isValidCssColor(key)) {
          btn.style.background = key;
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
  }

  // ---- default selection (runs once when DOM is usable) ----
  function initDefaultColor() {
    loadData();
    buildSwatches(".color-swatches", colorImages, "color");
    buildSwatches(".size-swatches", sizeImages, "size");

    let selectedColor = false;
    const firstSwatch = document.querySelector(".color-swatch");
    if (firstSwatch) {
      const color = firstSwatch.dataset.color;
      if (color) {
        document
          .querySelectorAll(".color-swatch")
          .forEach((s) => s.classList.remove("is-active"));

        firstSwatch.classList.add("is-active");
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
      firstSize.classList.add("is-active");
      applySize(firstSize.dataset.size);
    }

    initQtyTotal();
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
