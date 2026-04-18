/*!
 * QuestLegends Reviews Widget
 * Source: https://github.com/volgintb-arch/reviews-widget
 * Loads reviews from 2GIS and Yandex.Maps via own API.
 */
(function () {
  'use strict';

  const ROOT_ID = 'ql-reviews';
  const STYLE_ID = 'ql-reviews-style';
  const EMBLA_CDN = 'https://unpkg.com/embla-carousel@8.5.1/embla-carousel.umd.js';

  const root = document.getElementById(ROOT_ID);
  if (!root) return;

  const city = root.dataset.city;
  if (!city) {
    console.error('[ql-reviews] data-city attribute is required');
    return;
  }
  const apiBase = (root.dataset.api || '__API_BASE__').replace(/\/$/, '');
  const cardsDesktopOverride = parseInt(root.dataset.cardsDesktop, 10);
  const cardsMobileOverride = parseInt(root.dataset.cardsMobile, 10);

  const state = {
    config: null,
    data: null,
    activeSource: 'all',
    embla: null,
  };

  injectStyles();
  renderSkeleton();
  init();

  async function init() {
    try {
      const [configRes, dataRes] = await Promise.all([
        fetch(`${apiBase}/api/widget/config?city=${encodeURIComponent(city)}`),
        fetch(`${apiBase}/api/reviews?city=${encodeURIComponent(city)}`),
      ]);
      if (!configRes.ok) throw new Error(`config HTTP ${configRes.status}`);
      if (!dataRes.ok) throw new Error(`reviews HTTP ${dataRes.status}`);
      state.config = await configRes.json();
      state.data = await dataRes.json();
      applyTokens(state.config);
      await loadEmbla();
      render();
    } catch (err) {
      console.error('[ql-reviews]', err);
      renderError();
    }
  }

  function loadEmbla() {
    if (window.EmblaCarousel) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${EMBLA_CDN}"]`);
      if (existing) {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', reject);
        return;
      }
      const s = document.createElement('script');
      s.src = EMBLA_CDN;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Failed to load Embla'));
      document.head.appendChild(s);
    });
  }

  function applyTokens(c) {
    if (!c) return;
    if (c.accent_color) root.style.setProperty('--ql-accent', c.accent_color);
    if (c.star_color) root.style.setProperty('--ql-star', c.star_color);
    if (c.card_bg) root.style.setProperty('--ql-card-bg', c.card_bg);
    if (c.text_color) root.style.setProperty('--ql-text', c.text_color);
    if (c.font_family && c.font_family !== 'inherit') {
      root.style.setProperty('--ql-font', c.font_family);
    }
  }

  function render() {
    const reviews = getFilteredReviews();
    root.innerHTML = renderTabs() + renderSummary() + renderCarousel(reviews);
    bindHandlers();
    if (reviews.length > 0) {
      initEmbla();
      detectTextOverflow();
    }
  }

  function getCardsVisible() {
    const w = window.innerWidth;
    if (w < 768) return cardsMobileOverride || state.config?.cards_visible_mobile || 1;
    if (w < 1024) return 2;
    return cardsDesktopOverride || state.config?.cards_visible_desktop || 3;
  }

  function getFilteredReviews() {
    const all = state.data?.reviews || [];
    if (state.activeSource === 'all') return all;
    return all.filter((r) => r.source === state.activeSource);
  }

  function getStats() {
    const s = state.data?.stats;
    if (!s) return { total: 0, average: 0, by_source: {} };
    return s;
  }

  function getActiveStats() {
    const stats = getStats();
    if (state.activeSource === 'all') {
      return { count: stats.total, average: stats.average };
    }
    return stats.by_source?.[state.activeSource] || { count: 0, average: 0 };
  }

  function renderTabs() {
    const stats = getStats();
    const all = stats.average?.toFixed(1) || '0.0';
    const yandex = stats.by_source?.yandex;
    const twogis = stats.by_source?.['2gis'];
    const tabs = [
      { key: 'all', label: 'Все отзывы', rating: all, icon: iconAll() },
    ];
    if (yandex && yandex.count > 0) {
      tabs.push({
        key: 'yandex',
        label: 'Карты',
        rating: yandex.average.toFixed(1),
        icon: iconYandex(),
      });
    }
    if (twogis && twogis.count > 0) {
      tabs.push({
        key: '2gis',
        label: '2ГИС',
        rating: twogis.average.toFixed(1),
        icon: iconTwogis(),
      });
    }
    return `<div class="ql-tabs" role="tablist">${tabs
      .map(
        (t) => `
          <button
            class="ql-tab${state.activeSource === t.key ? ' ql-tab--active' : ''}"
            data-source="${t.key}"
            role="tab"
            aria-selected="${state.activeSource === t.key}"
          >
            <span class="ql-tab__icon">${t.icon}</span>
            <span class="ql-tab__label">${escapeHtml(t.label)}</span>
            <span class="ql-tab__rating">${t.rating}</span>
          </button>`
      )
      .join('')}</div>`;
  }

  function renderSummary() {
    const { count, average } = getActiveStats();
    if (!count) return '';
    const avg = Number(average || 0);
    return `
      <div class="ql-summary">
        <span class="ql-summary__big">${avg.toFixed(1)}</span>
        <span class="ql-summary__of">из 5</span>
        <div class="ql-stars" aria-label="Рейтинг ${avg.toFixed(1)} из 5">${renderStars(avg)}</div>
        <span class="ql-summary__count">На основе ${count} ${pluralize(count, 'оценки', 'оценок', 'оценок')}</span>
      </div>`;
  }

  function renderCarousel(reviews) {
    if (!reviews.length) {
      return `<div class="ql-empty">Пока нет отзывов из этого источника</div>`;
    }
    const slides = reviews.map(renderCard).join('');
    return `
      <div class="ql-carousel">
        <div class="ql-carousel__viewport">
          <div class="ql-carousel__container">${slides}</div>
        </div>
        <div class="ql-controls">
          <button class="ql-arrow ql-arrow--prev" aria-label="Назад" disabled>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div class="ql-progress"><div class="ql-progress__bar"></div></div>
          <button class="ql-arrow ql-arrow--next" aria-label="Вперёд">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </div>`;
  }

  function renderCard(r) {
    const initial = (r.author || '?').trim().charAt(0).toUpperCase() || '?';
    const avatar = r.avatar
      ? `<img src="${escapeAttr(r.avatar)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'ql-card__initial',textContent:'${escapeAttr(initial)}'}))">`
      : `<span class="ql-card__initial">${escapeHtml(initial)}</span>`;
    const sourceLabel = r.source === '2gis' ? 'Отзыв 2ГИС' : 'Отзыв Яндекс';
    return `
      <div class="ql-slide">
        <article class="ql-card">
          <header class="ql-card__head">
            <div class="ql-card__avatar">${avatar}</div>
            <div class="ql-card__meta">
              <div class="ql-card__author">${escapeHtml(r.author || 'Аноним')}</div>
              <div class="ql-stars">${renderStars(r.rating)}</div>
              <time class="ql-card__date" datetime="${escapeAttr(r.date)}">${formatDate(r.date)}</time>
            </div>
          </header>
          <div class="ql-card__body">
            <p class="ql-card__text">${escapeHtml(r.text || '')}</p>
          </div>
          <footer class="ql-card__foot">
            ${r.review_url ? `<a href="${escapeAttr(r.review_url)}" target="_blank" rel="noopener nofollow" class="ql-card__link">${sourceLabel}</a>` : ''}
          </footer>
        </article>
      </div>`;
  }

  function renderSkeleton() {
    root.innerHTML = `
      <div class="ql-tabs ql-tabs--skeleton">
        <div class="ql-skeleton-pill"></div>
        <div class="ql-skeleton-pill"></div>
        <div class="ql-skeleton-pill"></div>
      </div>
      <div class="ql-summary ql-summary--skeleton">
        <div class="ql-skeleton-line" style="width:160px;height:36px"></div>
      </div>
      <div class="ql-carousel">
        <div class="ql-carousel__viewport">
          <div class="ql-carousel__container">
            ${Array.from({ length: 3 })
              .map(
                () => `
              <div class="ql-slide">
                <div class="ql-card ql-card--skeleton">
                  <div class="ql-skeleton-line" style="width:60%;height:18px"></div>
                  <div class="ql-skeleton-line" style="width:40%;height:14px;margin-top:8px"></div>
                  <div class="ql-skeleton-line" style="width:100%;height:14px;margin-top:16px"></div>
                  <div class="ql-skeleton-line" style="width:100%;height:14px;margin-top:6px"></div>
                  <div class="ql-skeleton-line" style="width:70%;height:14px;margin-top:6px"></div>
                </div>
              </div>`
              )
              .join('')}
          </div>
        </div>
      </div>`;
  }

  function renderError() {
    root.innerHTML = `
      <div class="ql-error">
        <p>Отзывы временно недоступны</p>
        <button class="ql-retry">Попробовать снова</button>
      </div>`;
    root.querySelector('.ql-retry')?.addEventListener('click', () => {
      renderSkeleton();
      init();
    });
  }

  function bindHandlers() {
    root.querySelectorAll('.ql-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        const src = btn.dataset.source;
        if (src === state.activeSource) return;
        state.activeSource = src;
        render();
      });
    });
  }

  function initEmbla() {
    const viewport = root.querySelector('.ql-carousel__viewport');
    if (!viewport || !window.EmblaCarousel) return;
    const perView = getCardsVisible();
    if (state.embla) {
      try {
        state.embla.destroy();
      } catch (e) {
        /* noop */
      }
    }
    state.embla = window.EmblaCarousel(viewport, {
      loop: false,
      align: 'start',
      slidesToScroll: 1,
      containScroll: 'trimSnaps',
      duration: 25,
    });
    const prev = root.querySelector('.ql-arrow--prev');
    const next = root.querySelector('.ql-arrow--next');
    const bar = root.querySelector('.ql-progress__bar');
    const updateArrows = () => {
      if (!state.embla) return;
      prev.disabled = !state.embla.canScrollPrev();
      next.disabled = !state.embla.canScrollNext();
    };
    const updateProgress = () => {
      if (!state.embla || !bar) return;
      const p = Math.max(0, Math.min(1, state.embla.scrollProgress()));
      bar.style.transform = `scaleX(${p || (perView >= state.data.reviews.length ? 1 : 0)})`;
    };
    prev?.addEventListener('click', () => state.embla.scrollPrev());
    next?.addEventListener('click', () => state.embla.scrollNext());
    state.embla.on('select', updateArrows);
    state.embla.on('scroll', updateProgress);
    state.embla.on('reInit', () => {
      updateArrows();
      updateProgress();
    });
    updateArrows();
    updateProgress();
  }

  function detectTextOverflow() {
    root.querySelectorAll('.ql-card').forEach((card) => {
      const text = card.querySelector('.ql-card__text');
      if (!text) return;
      if (text.scrollHeight > text.clientHeight + 1) {
        card.classList.add('ql-card--clamped');
      }
    });
  }

  function renderStars(rating) {
    const full = Math.round(Number(rating) || 0);
    let out = '';
    for (let i = 0; i < 5; i++) {
      out += `<span class="ql-star ql-star--${i < full ? 'filled' : 'empty'}">★</span>`;
    }
    return out;
  }

  const MONTHS = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
  ];
  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  }

  function pluralize(n, one, few, many) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
    return many;
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttr(str) {
    return escapeHtml(str);
  }

  function iconAll() {
    return `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M12 2l2.39 6.95H22l-5.8 4.22L18.18 20 12 15.77 5.82 20l1.98-6.83L2 8.95h7.61z"/></svg>`;
  }
  function iconYandex() {
    return `<span class="ql-src-badge ql-src-badge--yandex" aria-hidden="true">Я</span>`;
  }
  function iconTwogis() {
    return `<span class="ql-src-badge ql-src-badge--twogis" aria-hidden="true">2</span>`;
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  const CSS = `
#${ROOT_ID} {
  --ql-accent: #F5A623;
  --ql-accent-hover: #E0941D;
  --ql-star: #FFC107;
  --ql-star-empty: #E0E0E0;
  --ql-card-bg: #FFFFFF;
  --ql-text: #2C2C2C;
  --ql-text-muted: #888888;
  --ql-border: #ECECEC;
  --ql-shadow: 0 2px 8px rgba(0,0,0,0.08);
  --ql-radius: 14px;
  --ql-gap: 16px;
  --ql-font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  font-family: var(--ql-font);
  color: var(--ql-text);
  max-width: 100%;
  margin: 0 auto;
  box-sizing: border-box;
}
#${ROOT_ID} *, #${ROOT_ID} *::before, #${ROOT_ID} *::after { box-sizing: border-box; }

/* Tabs */
#${ROOT_ID} .ql-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 20px;
  justify-content: center;
}
#${ROOT_ID} .ql-tab {
  background: #FFFFFF;
  border: 2px solid var(--ql-accent);
  color: var(--ql-accent);
  border-radius: 12px;
  padding: 10px 18px;
  font: 600 15px/1.2 var(--ql-font);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: transform 0.15s, background 0.15s, color 0.15s;
}
#${ROOT_ID} .ql-tab:hover { transform: translateY(-1px); }
#${ROOT_ID} .ql-tab--active {
  background: var(--ql-accent);
  color: #FFFFFF;
}
#${ROOT_ID} .ql-tab__rating { font-weight: 700; }
#${ROOT_ID} .ql-tab__icon { display: inline-flex; align-items: center; }
#${ROOT_ID} .ql-src-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
}
#${ROOT_ID} .ql-src-badge--yandex { background: #FC3F1D; }
#${ROOT_ID} .ql-src-badge--twogis { background: #2FAE5F; }

/* Summary */
#${ROOT_ID} .ql-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin: 0 0 20px;
  justify-content: center;
}
#${ROOT_ID} .ql-summary__big { font-size: 32px; font-weight: 700; line-height: 1; color: var(--ql-text); }
#${ROOT_ID} .ql-summary__of { font-size: 16px; color: var(--ql-text-muted); }
#${ROOT_ID} .ql-summary__count { font-size: 14px; color: var(--ql-text-muted); }

/* Stars */
#${ROOT_ID} .ql-stars { display: inline-flex; gap: 2px; font-size: 18px; line-height: 1; }
#${ROOT_ID} .ql-star--filled { color: var(--ql-star); }
#${ROOT_ID} .ql-star--empty  { color: var(--ql-star-empty); }

/* Carousel */
#${ROOT_ID} .ql-carousel { position: relative; }
#${ROOT_ID} .ql-carousel__viewport { overflow: hidden; }
#${ROOT_ID} .ql-carousel__container { display: flex; align-items: stretch; }
#${ROOT_ID} .ql-slide {
  flex: 0 0 100%;
  min-width: 0;
  padding: 0 8px;
}
@media (min-width: 768px) { #${ROOT_ID} .ql-slide { flex-basis: 50%; } }
@media (min-width: 1024px) { #${ROOT_ID} .ql-slide { flex-basis: 33.3333%; } }

/* Card */
#${ROOT_ID} .ql-card {
  background: var(--ql-card-bg);
  border: 1px solid var(--ql-border);
  border-radius: var(--ql-radius);
  box-shadow: var(--ql-shadow);
  padding: 18px;
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 12px;
}
#${ROOT_ID} .ql-card__head { display: flex; gap: 12px; align-items: flex-start; }
#${ROOT_ID} .ql-card__avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: #E5E5E5;
  flex-shrink: 0;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #666;
  font-weight: 600;
  font-size: 18px;
}
#${ROOT_ID} .ql-card__avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
#${ROOT_ID} .ql-card__initial { line-height: 1; }
#${ROOT_ID} .ql-card__meta { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
#${ROOT_ID} .ql-card__author { font-weight: 600; font-size: 15px; color: var(--ql-text); }
#${ROOT_ID} .ql-card__date { font-size: 13px; color: var(--ql-text-muted); }
#${ROOT_ID} .ql-card__body { flex: 1; min-height: 0; }
#${ROOT_ID} .ql-card__text {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
  color: var(--ql-text);
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}
@media (max-width: 767px) { #${ROOT_ID} .ql-card__text { -webkit-line-clamp: 5; } }
#${ROOT_ID} .ql-card__foot {
  display: flex;
  justify-content: flex-start;
  gap: 12px;
  margin-top: auto;
  flex-wrap: wrap;
}
#${ROOT_ID} .ql-card__link {
  color: var(--ql-text-muted);
  font-size: 13px;
  text-decoration: underline;
  transition: color 0.15s;
}
#${ROOT_ID} .ql-card__link:hover { color: var(--ql-accent); }

/* Controls */
#${ROOT_ID} .ql-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
  justify-content: center;
}
#${ROOT_ID} .ql-arrow {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 2px solid var(--ql-accent);
  background: #fff;
  color: var(--ql-accent);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, color 0.15s, opacity 0.15s, transform 0.15s;
  flex-shrink: 0;
}
#${ROOT_ID} .ql-arrow:hover:not(:disabled) {
  background: var(--ql-accent);
  color: #fff;
  transform: scale(1.05);
}
#${ROOT_ID} .ql-arrow:disabled { opacity: 0.35; cursor: not-allowed; }
@media (max-width: 767px) { #${ROOT_ID} .ql-arrow { width: 36px; height: 36px; } }

#${ROOT_ID} .ql-progress {
  flex: 1;
  max-width: 280px;
  height: 3px;
  background: var(--ql-border);
  border-radius: 3px;
  overflow: hidden;
}
#${ROOT_ID} .ql-progress__bar {
  height: 100%;
  background: var(--ql-accent);
  transform: scaleX(0);
  transform-origin: left center;
  transition: transform 0.1s linear;
}

/* Empty & error */
#${ROOT_ID} .ql-empty, #${ROOT_ID} .ql-error {
  text-align: center;
  padding: 40px 20px;
  color: var(--ql-text-muted);
  font-size: 15px;
}
#${ROOT_ID} .ql-error p { margin: 0 0 12px; }
#${ROOT_ID} .ql-retry {
  background: var(--ql-accent);
  color: #fff;
  border: 0;
  border-radius: 10px;
  padding: 10px 20px;
  font: 600 14px var(--ql-font);
  cursor: pointer;
}
#${ROOT_ID} .ql-retry:hover { background: var(--ql-accent-hover); }

/* Skeleton */
@keyframes ql-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
#${ROOT_ID} .ql-skeleton-pill,
#${ROOT_ID} .ql-skeleton-line,
#${ROOT_ID} .ql-card--skeleton {
  background: #EFEFEF;
  animation: ql-pulse 1.5s ease-in-out infinite;
}
#${ROOT_ID} .ql-skeleton-pill {
  width: 120px;
  height: 42px;
  border-radius: 12px;
}
#${ROOT_ID} .ql-skeleton-line { border-radius: 4px; }
#${ROOT_ID} .ql-tabs--skeleton { pointer-events: none; }
#${ROOT_ID} .ql-summary--skeleton { display: flex; justify-content: center; }
#${ROOT_ID} .ql-card--skeleton {
  border: 1px solid var(--ql-border);
  border-radius: var(--ql-radius);
  padding: 18px;
  background: #fff;
  min-height: 180px;
}
`;
})();
