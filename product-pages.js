document.addEventListener("DOMContentLoaded", function () {
  const swatches = document.querySelectorAll(".color-swatch");

  const colorImg = findImage(".product-image-color");
  const sizeImg = findImage(".product-image-size");

  console.log("Swatches:", swatches.length);
  console.log("Color image:", colorImg);
  console.log("Size image:", sizeImg);

  if (!swatches.length || !colorImg || !sizeImg) {
    console.warn("Required elements not found");
    return;
  }

  const imageMap = {
    red: {
      color: "https://www.metroshirtinc.com/wp-content/uploads/2025/10/viber_image_2024-07-02_13-53-12-906.jpg",
      size: "https://www.metroshirtinc.com/wp-content/uploads/2025/10/IMG_8338.jpg",
    },
    blue: {
      color: "https://www.metroshirtinc.com/wp-content/uploads/2025/10/viber_image_2024-07-02_13-53-25-701-972x1024.jpg",
      size: "https://www.metroshirtinc.com/wp-content/uploads/2025/10/IMG_8340.jpg",
    },
  };


  function swapImage(img, url) {
  img.src = url;
  img.srcset = `${url} 1x`;
  img.sizes = "100vw";
}


  function applyColor(color) {
  const images = imageMap[color];
  if (!images) return;

  swapImage(colorImg, images.color);
  swapImage(sizeImg, images.size);
}



  // Default selection
  const initialColor = swatches[0].dataset.color;
  swatches[0].classList.add("is-active");
  applyColor(initialColor);

  // Click handling
  swatches.forEach((btn) => {
    btn.addEventListener("click", function () {
      const color = btn.dataset.color;

      swatches.forEach((s) => s.classList.remove("is-active"));
      btn.classList.add("is-active");

      applyColor(color);
    });
  });

  // ---- helper ----
  function findImage(containerSelector) {
    const container = document.querySelector(containerSelector);
    if (!container) return null;
    return container.querySelector("img");
  }
});
