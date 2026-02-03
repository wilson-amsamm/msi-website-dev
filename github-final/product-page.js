(function () {
  // ---- helpers ----
  function findImage(containerSelector) {
    const container = document.querySelector(containerSelector);
    if (!container) return null;
    return container.querySelector("img");
  }

  function swapImage(img, url) {
    if (!img || !url) return;
    img.src = url;
    img.srcset = `${url} 1x`;
    img.sizes = "100vw";
  }

  // ---- image mappings (from inline JSON injected by plugin) ----
  const data =
    typeof window !== "undefined" ? window.MSI_PRODUCT_IMAGE_DATA : null;
  const colorImages = data && data.colors ? data.colors : {};
  const sizeImages = data && data.sizes ? data.sizes : {};
  let activeSizeKey = null;

  function getFirstKey(obj) {
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) return key;
    }
    return null;
  }

  function applyColor(color) {
    const colorUrl = colorImages[color];
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
  }

  function applySize(sizeKey) {
    const sizeUrl = sizeImages[sizeKey];
    if (!sizeUrl) return;

    activeSizeKey = sizeKey;
    const sizeImg = findImage(".product-image-size");
    if (sizeImg) swapImage(sizeImg, sizeUrl);
  }

  // ---- default selection (runs once when DOM is usable) ----
  function initDefaultColor() {
    const firstSwatch = document.querySelector(".color-swatch");
    if (firstSwatch) {
      const color = firstSwatch.dataset.color;
      if (!color) return;

      document
        .querySelectorAll(".color-swatch")
        .forEach((s) => s.classList.remove("is-active"));

      firstSwatch.classList.add("is-active");
      applyColor(color);
      return;
    }

    const fallbackColor = getFirstKey(colorImages);
    if (fallbackColor) {
      applyColor(fallbackColor);
    }
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
