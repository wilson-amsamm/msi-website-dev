document.addEventListener('DOMContentLoaded', function () {
  const PRODUCT_PAGE_URL = 'https://www.metroshirtinc.com/product-catalog/';
  const HOME_SECTION_ID = 'product-catalog';
  const HOME_HASH = `#${HOME_SECTION_ID}`;

  const isHome =
    document.body && document.body.classList.contains('home') ||
    window.location.pathname === '/' ||
    window.location.pathname === '/home/';

  function findMenuLinks() {
    const links = Array.from(document.querySelectorAll('a'));
    return links.filter(link => {
      const href = (link.getAttribute('href') || '').trim();
      const text = (link.textContent || '').trim().toLowerCase();
      return (
        href.includes('/product-catalog') ||
        href.includes(HOME_HASH) ||
        text === 'product catalog'
      );
    });
  }

  function handleHomeClick(e) {
    const target = document.getElementById(HOME_SECTION_ID);
    if (!target) return;

    e.preventDefault();
    target.scrollIntoView({ behavior: 'smooth' });
    history.replaceState(null, '', HOME_HASH);
  }

  const links = findMenuLinks();
  if (!links.length) return;

  links.forEach(link => {
    if (link.dataset.msiCatalogBound === 'true') return;
    link.dataset.msiCatalogBound = 'true';

    if (isHome) {
      link.setAttribute('href', HOME_HASH);
      link.addEventListener('click', handleHomeClick);
    } else {
      link.setAttribute('href', PRODUCT_PAGE_URL);
    }
  });
});
