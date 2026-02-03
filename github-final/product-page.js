(function () {
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
  }

  function applySize(sizeKey) {
    loadData();
    const sizeUrl = sizeImages[sizeKey];
    if (!sizeUrl) return;

    activeSizeKey = sizeKey;
    const sizeImg = findImage(".product-image-size");
    if (sizeImg) swapImage(sizeImg, sizeUrl);
    markReadyAfterSwap(null, sizeImg);
  }

  // ---- default selection (runs once when DOM is usable) ----
  function initDefaultColor() {
    loadData();
    buildSwatches(".color-swatches", colorImages, "color");
    buildSwatches(".size-swatches", sizeImages, "size");

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

    const firstSize = document.querySelector(".size-swatch");
    if (firstSize && firstSize.dataset.size) {
      firstSize.classList.add("is-active");
      applySize(firstSize.dataset.size);
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
