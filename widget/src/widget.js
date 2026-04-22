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
    expanded: new Set(),
  };

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
    if (c.bg_color) root.style.setProperty('--ql-bg', c.bg_color);
    if (c.card_bg) root.style.setProperty('--ql-card-bg', c.card_bg);
    if (c.text_color) root.style.setProperty('--ql-text', c.text_color);
    if (c.font_family && c.font_family !== 'inherit') {
      root.style.setProperty('--ql-font', c.font_family);
    }
    const desktop = cardsDesktopOverride || c.cards_visible_desktop || 3;
    const mobile = cardsMobileOverride || c.cards_visible_mobile || 1;
    root.style.setProperty('--ql-cards-desktop', String(desktop));
    root.style.setProperty('--ql-cards-mobile', String(mobile));
  }

  function render() {
    const reviews = getFilteredReviews();
    state.expanded = new Set();
    root.innerHTML = renderTabs() + renderSummary() + renderCarousel(reviews);
    bindHandlers();
    if (reviews.length > 0) {
      initEmbla();
    }
  }

  function getCardsVisible() {
    const w = window.innerWidth;
    if (w < 420) return 1;
    if (w < 768) return cardsMobileOverride || state.config?.cards_visible_mobile || 1;
    if (w < 1024) return 2;
    return cardsDesktopOverride || state.config?.cards_visible_desktop || 3;
  }

  function getFilteredReviews() {
    const all = state.data?.reviews || [];
    const cfg = state.config || {};
    const minRating = Number(cfg.min_rating) || 1;
    const minLen = Number(cfg.min_text_length) || 0;
    const filtered = all.filter((r) => r.rating >= minRating && r.text.length >= minLen);
    if (state.activeSource === 'all') return filtered;
    return filtered.filter((r) => r.source === state.activeSource);
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
    const all = stats.average ? stats.average.toFixed(1) : '0.0';
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
        (t) => `<button class="ql-tab${state.activeSource === t.key ? ' ql-tab--active' : ''}" data-source="${t.key}" role="tab" aria-selected="${state.activeSource === t.key}"><span class="ql-tab__icon">${t.icon}</span><span class="ql-tab__label">${escapeHtml(t.label)}</span><span class="ql-tab__rating">${t.rating}</span></button>`
      )
      .join('')}</div>`;
  }

  function renderSummary() {
    const { count, average } = getActiveStats();
    if (!count) return '';
    const avg = Number(average || 0);
    return `<div class="ql-summary"><span class="ql-summary__rating">${avg.toFixed(1)}</span><span class="ql-summary__of">из 5</span><span class="ql-stars ql-stars--summary" aria-label="Рейтинг ${avg.toFixed(1)} из 5">${renderStars(avg)}</span><span class="ql-summary__count">На основе ${count} ${pluralize(count, 'оценки', 'оценок', 'оценок')}</span></div>`;
  }

  function renderCarousel(reviews) {
    if (!reviews.length) {
      return `<div class="ql-empty">Пока нет отзывов из этого источника</div>`;
    }
    const slides = reviews.map((r, i) => renderCard(r, i)).join('');
    return `<div class="ql-carousel"><div class="ql-carousel__viewport"><div class="ql-carousel__container">${slides}</div></div><div class="ql-controls"><div class="ql-nav"><button class="ql-arrow ql-arrow--prev" aria-label="Назад" disabled><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button><button class="ql-arrow ql-arrow--next" aria-label="Вперёд"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button></div><div class="ql-progress"><div class="ql-progress__bar"></div></div></div></div>`;
  }

  function renderCard(r, idx) {
    const initial = (r.author || '?').trim().charAt(0).toUpperCase() || '?';
    const avatarSrc = r.avatar && r.avatar.startsWith('/') ? `${apiBase}${r.avatar}` : r.avatar;
    const avatar = avatarSrc
      ? `<img src="${escapeAttr(avatarSrc)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'ql-card__initial',textContent:'${escapeAttr(initial)}'}))">`
      : `<span class="ql-card__initial">${escapeHtml(initial)}</span>`;
    const sourceLabel = r.source === '2gis' ? 'Отзыв 2ГИС' : 'Отзыв Яндекс Карты';
    const expanded = state.expanded.has(idx);
    const textClass = expanded ? 'ql-card__text ql-card__text--expanded' : 'ql-card__text';
    return `<div class="ql-slide"><article class="ql-card"><header class="ql-card__head"><div class="ql-card__avatar">${avatar}</div><div class="ql-card__meta"><div class="ql-card__author">${escapeHtml(r.author || 'Аноним')}</div><div class="ql-stars">${renderStars(r.rating)}</div><time class="ql-card__date" datetime="${escapeAttr(r.date)}">${formatDate(r.date)}</time></div></header><div class="ql-card__body"><p class="${textClass}" data-idx="${idx}">${escapeHtml(r.text || '')}</p><button type="button" class="ql-card__more" data-idx="${idx}" hidden>${expanded ? 'Свернуть' : 'Читать полностью'}</button></div><footer class="ql-card__foot">${r.review_url ? `<a href="${escapeAttr(r.review_url)}" target="_blank" rel="noopener nofollow" class="ql-card__link">${sourceLabel}</a>` : ''}</footer></article></div>`;
  }

  function renderSkeleton() {
    const cells = Array.from({ length: 3 })
      .map(() => `<div class="ql-slide"><div class="ql-card ql-card--skeleton"><div class="ql-skeleton-line" style="width:60%;height:18px"></div><div class="ql-skeleton-line" style="width:40%;height:14px;margin-top:8px"></div><div class="ql-skeleton-line" style="width:100%;height:14px;margin-top:16px"></div><div class="ql-skeleton-line" style="width:100%;height:14px;margin-top:6px"></div><div class="ql-skeleton-line" style="width:70%;height:14px;margin-top:6px"></div></div></div>`)
      .join('');
    root.innerHTML = `<div class="ql-tabs ql-tabs--skeleton"><div class="ql-skeleton-pill"></div><div class="ql-skeleton-pill"></div><div class="ql-skeleton-pill"></div></div><div class="ql-summary ql-summary--skeleton"><div class="ql-skeleton-line" style="width:220px;height:22px"></div></div><div class="ql-carousel"><div class="ql-carousel__viewport"><div class="ql-carousel__container">${cells}</div></div></div>`;
  }

  function renderError() {
    root.innerHTML = `<div class="ql-error"><p>Отзывы временно недоступны</p><button class="ql-retry">Попробовать снова</button></div>`;
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
    root.querySelectorAll('.ql-card__more').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.idx);
        if (state.expanded.has(idx)) state.expanded.delete(idx);
        else state.expanded.add(idx);
        const text = root.querySelector(`.ql-card__text[data-idx="${idx}"]`);
        if (text) {
          text.classList.toggle('ql-card__text--expanded');
          btn.textContent = text.classList.contains('ql-card__text--expanded') ? 'Свернуть' : 'Читать полностью';
        }
        if (state.embla) setTimeout(() => state.embla.reInit(), 50);
      });
    });
    // show "Читать полностью" only when text is truncated
    requestAnimationFrame(() => {
      root.querySelectorAll('.ql-card__text').forEach((el) => {
        if (el.classList.contains('ql-card__text--expanded')) return;
        if (el.scrollHeight > el.clientHeight + 1) {
          const idx = el.dataset.idx;
          const btn = root.querySelector(`.ql-card__more[data-idx="${idx}"]`);
          if (btn) btn.hidden = false;
        }
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

  function renderStars(rating) {
    const r = Math.max(0, Math.min(5, Number(rating) || 0));
    const full = Math.floor(r);
    const hasHalf = r - full >= 0.25 && r - full < 0.75;
    const rounded = r - full >= 0.75 ? full + 1 : full;
    let out = '';
    for (let i = 0; i < 5; i++) {
      let cls = 'ql-star--empty';
      if (i < (hasHalf ? full : rounded)) cls = 'ql-star--filled';
      else if (hasHalf && i === full) cls = 'ql-star--half';
      out += `<span class="ql-star ${cls}" aria-hidden="true">${cls === 'ql-star--half' ? halfStarSvg() : '★'}</span>`;
    }
    return out;
  }

  function halfStarSvg() {
    return `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" aria-hidden="true"><defs><linearGradient id="qlHalf"><stop offset="50%" stop-color="var(--ql-star)"/><stop offset="50%" stop-color="var(--ql-star-empty)"/></linearGradient></defs><path fill="url(#qlHalf)" d="M12 2l2.39 6.95H22l-5.8 4.22L18.18 20 12 15.77 5.82 20l1.98-6.83L2 8.95h7.61z"/></svg>`;
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
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l2.39 6.95H22l-5.8 4.22L18.18 20 12 15.77 5.82 20l1.98-6.83L2 8.95h7.61z"/></svg>`;
  }
  function iconYandex() {
    return `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="10" fill="#FC3F1D"/><text x="10" y="14.5" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="12" fill="#fff">Я</text></svg>`;
  }
  function iconTwogis() {
    // Official 2GIS brand icon: rounded rect, green bg, yellow top stripe, light-green bottom, white shape + blue circle
    return `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect width="20" height="20" rx="4" fill="#19AA1E"/><rect x="0" y="0" width="20" height="6.5" rx="4" fill="#FFB919"/><rect x="0" y="0" width="20" height="3" fill="#FFB919"/><rect x="0" y="14" width="20" height="6" fill="#82D714"/><path d="M10 3.5c2.8 0 4.7 2.15 4.7 4.47 0 .93-.2 1.9-.68 2.92-2.75 0-3.43 1.97-3.56 3.2l-.01.09c-.04.44-.07.79-.07 1.06l-.38.06v-.02a14.3 14.3 0 0 0-.08-1.18c-.12-1.23-.78-3.24-3.56-3.24-.47-1.02-.68-1.99-.68-2.92C6.67 5.65 7.2 3.5 10 3.5z" fill="#0073FA"/><path d="M5.5 7.8l3.5.55c.44-.28.96-.43 1.52-.43.78 0 1.47.29 1.98.8l2.86.45v.4l-2.57-.4c.19.37.29.77.29 1.19 0 .54-.12 1.07-.37 1.61l-.11.22h-.25c-.51 0-.86.15-1.08.43-.18.21-.28.5-.31.82l-.01.05-.25.04a7.1 7.1 0 0 0-.04-.59l4.44-.69v.4l-10 1.56v-.4l4.44-.69a8 8 0 0 0-.03-.41c-.03-.32-.13-.61-.31-.83-.22-.27-.56-.43-1.07-.43h-.27l-.1-.23c-.25-.54-.38-1.08-.38-1.63 0-1.25.81-2.35 2-2.77L5.5 8.2V7.8z" fill="#fff"/></svg>`;
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
  --ql-bg: transparent;
  --ql-card-bg: #FFFFFF;
  --ql-text: #2C2C2C;
  --ql-text-muted: #8A8A8A;
  --ql-border: #ECECEC;
  --ql-tab-border: #E5E5E5;
  --ql-shadow: 0 4px 18px rgba(0,0,0,0.06);
  --ql-radius: 18px;
  --ql-cards-desktop: 3;
  --ql-cards-mobile: 1;
  --ql-font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  font-family: var(--ql-font);
  color: var(--ql-text);
  background: var(--ql-bg);
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 16px;
  box-sizing: border-box;
}
#${ROOT_ID} *, #${ROOT_ID} *::before, #${ROOT_ID} *::after { box-sizing: border-box; }

/* Tabs */
#${ROOT_ID} .ql-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 18px;
  justify-content: flex-start;
}
#${ROOT_ID} .ql-tab {
  background: #FFFFFF;
  border: 1.5px solid var(--ql-tab-border);
  color: #3A3A3A;
  border-radius: 999px;
  padding: 9px 18px;
  font: 600 14px/1.2 var(--ql-font);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: transform .15s, background .2s, color .2s, border-color .2s, box-shadow .2s;
  white-space: nowrap;
}
#${ROOT_ID} .ql-tab:hover { transform: translateY(-1px); box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
#${ROOT_ID} .ql-tab--active {
  background: var(--ql-accent);
  border-color: var(--ql-accent);
  color: #FFFFFF;
  box-shadow: 0 4px 12px rgba(245,166,35,0.25);
}
#${ROOT_ID} .ql-tab__icon { display: inline-flex; align-items: center; }
#${ROOT_ID} .ql-tab__rating { font-weight: 700; opacity: .95; }
#${ROOT_ID} .ql-tab--active .ql-tab__icon svg circle[fill] { filter: brightness(1.1); }

/* Summary */
#${ROOT_ID} .ql-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 0 0 24px;
  padding: 0 4px;
}
#${ROOT_ID} .ql-summary__rating { font-size: 20px; font-weight: 700; color: var(--ql-text); }
#${ROOT_ID} .ql-summary__of { font-size: 14px; color: var(--ql-text-muted); }
#${ROOT_ID} .ql-summary__count { font-size: 13px; color: var(--ql-text-muted); margin-left: 8px; }
#${ROOT_ID} .ql-stars--summary { font-size: 22px; margin-left: 4px; }

/* Stars */
#${ROOT_ID} .ql-stars { display: inline-flex; gap: 1px; font-size: 20px; line-height: 1; }
#${ROOT_ID} .ql-star { display: inline-flex; align-items: center; }
#${ROOT_ID} .ql-star--filled { color: var(--ql-star); }
#${ROOT_ID} .ql-star--empty  { color: var(--ql-star-empty); }
#${ROOT_ID} .ql-star--half svg { width: 1em; height: 1em; }

/* Carousel */
#${ROOT_ID} .ql-carousel { position: relative; }
#${ROOT_ID} .ql-carousel__viewport { overflow: hidden; padding: 4px 0 8px; }
#${ROOT_ID} .ql-carousel__container { display: flex; align-items: stretch; }
/* < 420px: force 1 card (too narrow for 2) */
#${ROOT_ID} .ql-slide {
  flex: 0 0 100%;
  min-width: 0;
  padding: 0 6px;
}
/* 420+: honor cards_visible_mobile config (1 or 2) */
@media (min-width: 420px) {
  #${ROOT_ID} .ql-slide { flex: 0 0 calc(100% / var(--ql-cards-mobile, 1)); }
}
/* 768+: 2 cards (tablet) */
@media (min-width: 768px) { #${ROOT_ID} .ql-slide { flex: 0 0 50%; padding: 0 8px; } }
/* 1024+: cards_visible_desktop */
@media (min-width: 1024px) { #${ROOT_ID} .ql-slide { flex: 0 0 calc(100% / var(--ql-cards-desktop, 3)); } }

/* Card */
#${ROOT_ID} .ql-card {
  background: var(--ql-card-bg);
  border-radius: var(--ql-radius);
  box-shadow: var(--ql-shadow);
  padding: 20px;
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 12px;
  transition: box-shadow .2s, transform .2s;
}
#${ROOT_ID} .ql-card:hover { box-shadow: 0 6px 22px rgba(0,0,0,0.08); transform: translateY(-2px); }
#${ROOT_ID} .ql-card__head { display: flex; gap: 12px; align-items: flex-start; }
#${ROOT_ID} .ql-card__avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: #E8EAF0;
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
#${ROOT_ID} .ql-card__author {
  font-weight: 600;
  font-size: 15px;
  color: var(--ql-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
#${ROOT_ID} .ql-card__date { font-size: 12px; color: var(--ql-text-muted); white-space: nowrap; }
#${ROOT_ID} .ql-card__body { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 6px; }
#${ROOT_ID} .ql-card__text {
  margin: 0;
  font-size: 14px;
  line-height: 1.55;
  color: var(--ql-text);
  display: -webkit-box;
  -webkit-line-clamp: 5;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}
#${ROOT_ID} .ql-card__text--expanded {
  display: block;
  -webkit-line-clamp: unset;
  overflow: visible;
}
#${ROOT_ID} .ql-card__more {
  align-self: flex-start;
  background: none;
  border: 0;
  padding: 0;
  color: var(--ql-text-muted);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
  transition: color .15s;
}
#${ROOT_ID} .ql-card__more:hover { color: var(--ql-accent); }
#${ROOT_ID} .ql-card__foot {
  display: flex;
  justify-content: flex-start;
  gap: 12px;
  margin-top: auto;
  padding-top: 4px;
  flex-wrap: wrap;
}
#${ROOT_ID} .ql-card__link {
  color: var(--ql-text-muted);
  font-size: 12px;
  text-decoration: underline;
  text-underline-offset: 2px;
  transition: color .15s;
}
#${ROOT_ID} .ql-card__link:hover { color: var(--ql-accent); }

/* Controls: arrows + progress bar, bottom of carousel */
#${ROOT_ID} .ql-controls {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 18px;
  padding: 0 8px;
}
#${ROOT_ID} .ql-nav { display: flex; gap: 10px; flex-shrink: 0; }
#${ROOT_ID} .ql-arrow {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 0;
  background: var(--ql-accent);
  color: #fff;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background .15s, opacity .15s, transform .15s;
}
#${ROOT_ID} .ql-arrow:hover:not(:disabled) {
  background: var(--ql-accent-hover);
  transform: scale(1.05);
}
#${ROOT_ID} .ql-arrow:disabled {
  background: #E5E5E5;
  color: #B0B0B0;
  cursor: not-allowed;
}

#${ROOT_ID} .ql-progress {
  flex: 1;
  height: 3px;
  background: var(--ql-border);
  border-radius: 3px;
  overflow: hidden;
  max-width: 560px;
}
#${ROOT_ID} .ql-progress__bar {
  height: 100%;
  background: var(--ql-accent);
  transform: scaleX(0);
  transform-origin: left center;
  transition: transform .15s linear;
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
  border-radius: 999px;
  padding: 10px 22px;
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
  width: 110px;
  height: 38px;
  border-radius: 999px;
}
#${ROOT_ID} .ql-skeleton-line { border-radius: 4px; }
#${ROOT_ID} .ql-tabs--skeleton { pointer-events: none; }
#${ROOT_ID} .ql-summary--skeleton { display: flex; justify-content: flex-start; padding: 0 4px; }
#${ROOT_ID} .ql-card--skeleton {
  border-radius: var(--ql-radius);
  padding: 20px;
  background: #fff;
  min-height: 200px;
  box-shadow: var(--ql-shadow);
}

/* Mobile (< 640px) — tabs stretch full width, arrows centered, no progress bar */
@media (max-width: 639px) {
  #${ROOT_ID} { padding: 0 10px; }
  #${ROOT_ID} .ql-tabs {
    gap: 6px;
    margin-bottom: 16px;
    flex-wrap: nowrap;
    justify-content: center;
  }
  #${ROOT_ID} .ql-tab {
    flex: 1 1 0;
    min-width: 0;
    justify-content: center;
    padding: 8px 6px;
    font-size: 12px;
    gap: 5px;
  }
  #${ROOT_ID} .ql-tab__icon svg { width: 14px !important; height: 14px !important; }
  #${ROOT_ID} .ql-summary { gap: 6px; margin-bottom: 18px; }
  #${ROOT_ID} .ql-stars--summary { font-size: 20px; }
  #${ROOT_ID} .ql-card { padding: 16px; gap: 10px; }
  #${ROOT_ID} .ql-card__head { gap: 10px; }
  #${ROOT_ID} .ql-card__avatar { width: 44px; height: 44px; font-size: 16px; }
  #${ROOT_ID} .ql-card__author { font-size: 14px; }
  #${ROOT_ID} .ql-stars { font-size: 18px; }
  #${ROOT_ID} .ql-arrow { width: 36px; height: 36px; }
  #${ROOT_ID} .ql-controls { gap: 14px; margin-top: 14px; justify-content: center; }
  #${ROOT_ID} .ql-progress { display: none; }
}

/* Very narrow (< 480px) — hide tab labels, keep icon + rating only */
@media (max-width: 479px) {
  #${ROOT_ID} .ql-tab__label { display: none; }
  #${ROOT_ID} .ql-tab { padding: 8px 4px; gap: 4px; }
}

/* iPhone SE / small Androids (< 360px) */
@media (max-width: 359px) {
  #${ROOT_ID} { padding: 0 8px; }
  #${ROOT_ID} .ql-card { padding: 14px; }
  #${ROOT_ID} .ql-card__avatar { width: 40px; height: 40px; font-size: 15px; }
  #${ROOT_ID} .ql-summary__rating { font-size: 18px; }
  #${ROOT_ID} .ql-stars--summary { font-size: 18px; }
}
`;

  injectStyles();
  renderSkeleton();
  init();
})();
