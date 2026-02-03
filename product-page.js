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

  // ---- image mappings (TEMP: hardcoded, later from gallery/JSON) ----
  const imageMap = {
    red: {
      color: "https://www.metroshirtinc.com/wp-content/uploads/2025/10/QTS001_red.jpg",
      size: "https://www.metroshirtinc.com/wp-content/uploads/2025/10/QTS001_m.jpg",
    },
    blue: {
      color: "https://www.metroshirtinc.com/wp-content/uploads/2025/10/QTS001_blue.jpg",
      size: "https://www.metroshirtinc.com/wp-content/uploads/2025/10/QTS001_l.jpg",
    },
    grey: {
      color: "https://www.metroshirtinc.com/wp-content/uploads/2025/10/QTS001_grey.jpg",
      size: "https://www.metroshirtinc.com/wp-content/uploads/2025/10/QTS001_m.jpg",
    },
  };

  function applyColor(color) {
    const images = imageMap[color];
    if (!images) return;

    const colorImg = findImage(".product-image-color");
    const sizeImg = findImage(".product-image-size");

    if (!colorImg || !sizeImg) return;

    swapImage(colorImg, images.color);
    swapImage(sizeImg, images.size);
  }

  // ---- default selection (runs once when DOM is usable) ----
  function initDefaultColor() {
    const firstSwatch = document.querySelector(".color-swatch");
    if (!firstSwatch) return;

    const color = firstSwatch.dataset.color;
    if (!color) return;

    document
      .querySelectorAll(".color-swatch")
      .forEach((s) => s.classList.remove("is-active"));

    firstSwatch.classList.add("is-active");
    applyColor(color);
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

  // ---- safe init (handles Gutenberg timing) ----
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initDefaultColor);
  } else {
    initDefaultColor();
  }
})();
