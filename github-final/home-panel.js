document.addEventListener('DOMContentLoaded', function () {
  if (!document.body || !document.body.classList.contains('home')) return;

  const PANEL_ID = 'msi-home-panel';
  if (document.getElementById(PANEL_ID)) return;

  const PANEL_IMAGE_URL = "https://www.metroshirtinc.com/wp-content/uploads/2026/02/metroshirt-slide-up-panel-final2.jpg";
  if (!PANEL_IMAGE_URL) {
    console.warn('[MSI Home Panel] Missing image URL. Set window.MSI_HOME_PANEL_IMAGE_URL.');
    return;
  }

  const panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.className = 'msi-home-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Assistant');

  panel.innerHTML = `
    <button class="msi-home-panel__close" type="button" aria-label="Close">×</button>
    <img class="msi-home-panel__image" src="${PANEL_IMAGE_URL}" alt="Assistant" />
  `;

  document.body.appendChild(panel);

  const closeBtn = panel.querySelector('.msi-home-panel__close');
  if (closeBtn) {
    closeBtn.addEventListener('click', function () {
      panel.classList.add('is-closed');
    });
  }

  requestAnimationFrame(function () {
    panel.classList.add('is-open');
  });
});
