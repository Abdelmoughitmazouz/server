(function() {
    'use strict';

    const SUBSCRIPTIONS_PAGE_SWITCH_ATTRIBUTE = 'data-foldertube-subscriptions-page-mode';
    const FOLDER_MODE = 'folder';
    const ALL_MODE = 'all';
    const RSS_FETCH_CONCURRENCY = 20;
    const VIDEO_CACHE_TTL = 1000 * 60 * 5; // 5 minutes

    class SubscriptionsFilter {
        constructor() {
            this.activeFolderId = 'all';
            this.activeContentType = 'all'; // all, videos, shorts
            this.container = null;
            this.panel = null;
            this.videoCache = new Map();
            this.abortController = null;
            this.initialized = false;

            this.init();
        }

        init() {
            if (this.initialized) return;
            this.injectStyles();
            this.setupNavigationListeners();
            this.setupDataListeners();
            this.initialized = true;
            this.checkAndInject();
        }

        injectStyles() {
            if (document.getElementById('ytt-subscriptions-filter-styles')) return;

            const style = document.createElement('style');
            style.id = 'ytt-subscriptions-filter-styles';
            style.textContent = `
                /* Navigation Control */
                html[${SUBSCRIPTIONS_PAGE_SWITCH_ATTRIBUTE}="${FOLDER_MODE}"] ytd-browse[page-subtype="subscriptions"] #primary #contents,
                html[${SUBSCRIPTIONS_PAGE_SWITCH_ATTRIBUTE}="${FOLDER_MODE}"] ytd-browse[page-subtype="subscriptions"] #primary ytd-rich-grid-renderer,
                html[${SUBSCRIPTIONS_PAGE_SWITCH_ATTRIBUTE}="${FOLDER_MODE}"] ytd-browse[page-subtype="subscriptions"] #primary #header {
                    display: none !important;
                }

                /* Main Filter Bar */
                #ytt-subs-filter-bar {
                    position: sticky;
                    top: var(--ytd-masthead-height, 56px);
                    z-index: 1000;
                    /* Horizontal margins match YouTube's content-area padding (~24px).
                       Bottom margin adds breathing room before the native video grid. */
                    margin: 8px 24px 12px;
                    padding: 4px 0;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    box-sizing: border-box;
                }
                @media (max-width: 640px) {
                    #ytt-subs-filter-bar { margin: 8px 8px 12px; }
                }

                .ytt-filter-icon-box {
                    width: 32px;
                    height: 32px;
                    flex-shrink: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: var(--yt-spec-text-secondary, #aaa);
                }

                /* ── Chips track: wraps scroll container + nav arrows + gradient fades ── */
                .ytt-chips-track {
                    flex: 1;
                    min-width: 0;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    position: relative;
                }

                /* Gradient fade overlays — shown only when overflow exists in that direction */
                .ytt-chips-track::before,
                .ytt-chips-track::after {
                    content: '';
                    position: absolute;
                    top: 0;
                    bottom: 0;
                    width: 32px;
                    pointer-events: none;
                    z-index: 1;
                    opacity: 0;
                    transition: opacity 0.2s ease;
                }
                /* left: 30px = arrow (26px) + gap (4px); placed at start of scroll container */
                .ytt-chips-track.has-left::before {
                    left: 30px;
                    opacity: 1;
                    background: linear-gradient(to right, var(--yt-spec-base-background, #0f0f0f), transparent);
                }
                /* right: 30px mirrors the left fade */
                .ytt-chips-track.has-right::after {
                    right: 30px;
                    opacity: 1;
                    background: linear-gradient(to left, var(--yt-spec-base-background, #0f0f0f), transparent);
                }

                /* Arrow buttons — sit above the gradient (z-index: 2) */
                .ytt-scroll-btn {
                    position: relative;
                    z-index: 2;
                    flex-shrink: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 26px;
                    height: 26px;
                    border-radius: 50%;
                    border: 1px solid var(--yt-spec-10-percent-layer, rgba(255,255,255,0.1));
                    background: var(--yt-spec-raised-background, #212121);
                    color: var(--yt-spec-text-secondary, #aaa);
                    cursor: pointer;
                    padding: 0;
                    transition: background 0.15s ease, border-color 0.15s ease;
                }
                .ytt-scroll-btn:hover {
                    background: var(--yt-spec-10-percent-layer, rgba(255,255,255,0.1));
                    border-color: var(--yt-spec-10-percent-layer, rgba(255,255,255,0.2));
                    color: var(--yt-spec-text-primary, #f1f1f1);
                }
                .ytt-scroll-btn[hidden] { display: none; }

                .ytt-chips-scroll-container {
                    flex: 1;
                    min-width: 0;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    overflow-x: auto;
                    scrollbar-width: none;
                    padding: 2px 2px;
                }
                .ytt-chips-scroll-container::-webkit-scrollbar { display: none; }

                .ytt-filter-chip {
                    height: 32px;
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 0 12px;
                    border-radius: 8px;
                    background: var(--yt-spec-raised-background, #212121);
                    border: 1px solid var(--yt-spec-10-percent-layer, rgba(255,255,255,0.1));
                    color: var(--yt-spec-text-primary, #f1f1f1);
                    font-size: 13px;
                    font-weight: 500;
                    cursor: pointer;
                    white-space: nowrap;
                    flex-shrink: 0; /* chips must not compress — let the container scroll */
                    transition: background 0.15s ease, border-color 0.15s ease;
                    user-select: none;
                }
                .ytt-filter-chip svg {
                    color: var(--chip-color, var(--yt-spec-text-secondary, #aaa));
                    flex-shrink: 0;
                }
                .ytt-filter-chip:hover {
                    background: var(--yt-spec-10-percent-layer, rgba(255,255,255,0.1));
                    border-color: var(--yt-spec-10-percent-layer, rgba(255,255,255,0.2));
                }
                .ytt-filter-chip.active {
                    background: var(--yt-spec-text-primary, #f1f1f1);
                    color: var(--yt-spec-base-background, #0f0f0f);
                    border-color: var(--yt-spec-text-primary, #f1f1f1);
                }
                .ytt-filter-chip.active svg {
                    color: var(--chip-color, var(--yt-spec-base-background, #0f0f0f));
                }

                .ytt-chip-badge {
                    display: inline-flex;
                    align-items: center;
                    padding: 1px 6px;
                    border-radius: 4px;
                    font-size: 11px;
                    background: var(--yt-spec-10-percent-layer, rgba(255,255,255,0.1));
                    color: var(--yt-spec-text-secondary, #aaa);
                }
                .active .ytt-chip-badge {
                    background: rgba(0, 0, 0, 0.1);
                    color: var(--yt-spec-base-background, #0f0f0f);
                }

                .ytt-total-channels-info {
                    flex-shrink: 0;
                    padding-left: 8px;
                    border-left: 1px solid var(--yt-spec-10-percent-layer, rgba(255,255,255,0.1));
                    font-size: 11px;
                    color: var(--yt-spec-text-secondary, #aaa);
                    white-space: nowrap;
                }
                @media (max-width: 640px) {
                    .ytt-total-channels-info { display: none; }
                }

                /* Folder Header & Content Type Filter */
                .ytt-folder-header {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    margin-bottom: 24px;
                    padding: 0 4px;
                }
                .ytt-back-button {
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    color: var(--yt-spec-text-primary, #f1f1f1);
                    transition: background 0.2s;
                    flex-shrink: 0;
                }
                .ytt-back-button:hover {
                    background: var(--yt-spec-10-percent-layer, rgba(255,255,255,0.1));
                }
                .ytt-folder-title-group {
                    min-width: 0;
                    flex: 1;
                }
                .ytt-folder-title {
                    font-size: 24px;
                    font-weight: 700;
                    color: var(--yt-spec-text-primary, #f1f1f1);
                    margin: 0;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .ytt-folder-subtitle {
                    font-size: 14px;
                    color: var(--yt-spec-text-secondary, #aaa);
                    margin-top: 4px;
                }

                .ytt-content-type-bar {
                    display: flex;
                    gap: 8px;
                    overflow-x: auto;
                    margin-bottom: 24px;
                    padding: 0 4px;
                    scrollbar-width: none;
                }
                .ytt-content-type-bar::-webkit-scrollbar { display: none; }

                .ytt-content-type-btn {
                    height: 36px;
                    padding: 0 12px;
                    border-radius: 6px;
                    background: var(--yt-spec-raised-background, #171717);
                    border: 1px solid var(--yt-spec-10-percent-layer, rgba(255,255,255,0.15));
                    color: var(--yt-spec-text-primary, #f5f5f5);
                    font-size: 14px;
                    font-weight: 500;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    cursor: pointer;
                    transition: background 0.15s ease, border-color 0.15s ease;
                }
                .ytt-content-type-btn:hover {
                    background: var(--yt-spec-10-percent-layer, rgba(255,255,255,0.1));
                    border-color: var(--yt-spec-10-percent-layer, rgba(255,255,255,0.3));
                }
                .ytt-content-type-btn.active {
                    background: var(--yt-spec-text-primary, #ffffff);
                    color: var(--yt-spec-base-background, #0a0a0a);
                    border-color: var(--yt-spec-text-primary, #ffffff);
                }
                .ytt-content-type-btn .badge {
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-size: 12px;
                    background: var(--yt-spec-10-percent-layer, rgba(255,255,255,0.1));
                    color: var(--yt-spec-text-secondary, #d4d4d4);
                }
                .ytt-content-type-btn.active .badge {
                    background: rgba(0, 0, 0, 0.12);
                    color: var(--yt-spec-base-background, #0a0a0a);
                }

                /* Video Grid Layout */
                #ytt-folder-videos-panel {
                    min-height: 50vh;
                    background: var(--yt-spec-general-background-a);
                }
                /* Reserve space equal to the sticky filter bar so folder content
                   starts below it. --ytt-filter-bar-offset is set dynamically by JS. */
                .ytt-folder-view-header {
                    padding: calc(var(--ytt-filter-bar-offset, 60px) + 16px) 24px 8px;
                }
                .ytt-folder-view-content {
                    padding: 16px 24px 40px;
                }
                .ytt-video-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
                    gap: 20px;
                    margin-bottom: 40px;
                }
                .ytt-shorts-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
                    gap: 12px;
                    margin-bottom: 40px;
                }

                /* Video Card Styling */
                .ytt-video-card {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    cursor: pointer;
                    text-decoration: none;
                    color: var(--yt-spec-text-primary, #f1f1f1) !important;
                    animation: ytt-fade-in 0.5s ease backwards;
                }
                @keyframes ytt-fade-in {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .ytt-thumb-container {
                    position: relative;
                    width: 100%;
                    aspect-ratio: 16/9;
                    border-radius: 12px;
                    overflow: hidden;
                    background: var(--yt-spec-10-percent-layer);
                }
                .ytt-shorts-card .ytt-thumb-container {
                    aspect-ratio: 9/16;
                }
                .ytt-thumb-container img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    transition: transform 0.5s ease;
                }
                .ytt-video-card:hover .ytt-thumb-container img {
                    transform: scale(1.05);
                }
                .ytt-video-meta {
                    display: flex;
                    gap: 12px;
                }
                .ytt-video-avatar {
                    width: 36px;
                    height: 36px;
                    border-radius: 50%;
                    flex-shrink: 0;
                }
                .ytt-video-info {
                    display: flex;
                    flex-direction: column;
                    min-width: 0;
                }
                .ytt-video-title {
                    font-size: 16px;
                    font-weight: 500;
                    line-height: 1.4;
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                    margin-bottom: 4px;
                    color: var(--yt-spec-text-primary, #f1f1f1) !important;
                }
                .ytt-video-details {
                    font-size: 12px;
                    color: var(--yt-spec-text-secondary, #aaa) !important;
                    display: flex;
                    flex-wrap: wrap;
                    gap: 4px;
                }

                /* ── Light-theme overrides ── */
                body.ytt-light-theme .ytt-filter-chip {
                    background: var(--yt-spec-raised-background, #f2f2f2);
                    border-color: var(--yt-spec-10-percent-layer, rgba(0,0,0,0.1));
                    color: var(--yt-spec-text-primary, #0f0f0f);
                }
                body.ytt-light-theme .ytt-filter-chip:hover {
                    background: var(--yt-spec-10-percent-layer, rgba(0,0,0,0.08));
                    border-color: var(--yt-spec-10-percent-layer, rgba(0,0,0,0.18));
                }
                body.ytt-light-theme .ytt-filter-chip.active {
                    background: var(--yt-spec-text-primary, #0f0f0f);
                    color: var(--yt-spec-base-background, #ffffff);
                    border-color: var(--yt-spec-text-primary, #0f0f0f);
                }
                body.ytt-light-theme .ytt-chip-badge {
                    background: rgba(0, 0, 0, 0.08);
                    color: var(--yt-spec-text-secondary, #606060);
                }
                body.ytt-light-theme .active .ytt-chip-badge {
                    background: rgba(255, 255, 255, 0.18);
                    color: #e5e5e5;
                }
                body.ytt-light-theme .ytt-total-channels-info {
                    border-left-color: rgba(0, 0, 0, 0.12);
                    color: var(--yt-spec-text-secondary, #606060);
                }
                /* badge needs explicit override since rgba(255,255,255,0.1) is invisible on light bg */
                body.ytt-light-theme .ytt-content-type-btn .badge {
                    background: rgba(0, 0, 0, 0.08);
                    color: var(--yt-spec-text-secondary, #606060);
                }
                body.ytt-light-theme .ytt-content-type-btn.active .badge {
                    background: rgba(255, 255, 255, 0.25);
                    color: #ffffff;
                }
                body.ytt-light-theme .ytt-video-card {
                    color: var(--yt-spec-text-primary, #0f0f0f) !important;
                }
                body.ytt-light-theme .ytt-video-title {
                    color: var(--yt-spec-text-primary, #0f0f0f) !important;
                }
                body.ytt-light-theme .ytt-scroll-btn {
                    background: rgba(235,235,235,0.97);
                    border-color: rgba(0,0,0,0.12);
                    color: #333;
                }
                body.ytt-light-theme .ytt-scroll-btn:hover {
                    background: rgba(210,210,210,0.98);
                    border-color: rgba(0,0,0,0.22);
                }
                body.ytt-light-theme .ytt-chips-track.has-left::before {
                    background: linear-gradient(to right, rgba(255,255,255,0.95), transparent);
                }
                body.ytt-light-theme .ytt-chips-track.has-right::after {
                    background: linear-gradient(to left, rgba(255,255,255,0.95), transparent);
                }
            `;
            document.head.appendChild(style);
        }

        setupNavigationListeners() {
            // All three events cover YouTube SPA navigation, browser back/forward,
            // and YouTube's own page-data lifecycle. Debounce to collapse rapid-fire
            // events (navigate-finish and page-data-updated often fire together).
            const onNav = () => {
                clearTimeout(this._navDebounce);
                this._navDebounce = setTimeout(() => this.checkAndInject(), 120);
            };
            window.addEventListener('yt-navigate-finish', onNav);
            window.addEventListener('yt-page-data-updated', onNav);
            window.addEventListener('popstate', onNav);

            // Fallback: re-inject if the bar disappeared (e.g. YouTube replaced the DOM)
            setInterval(() => {
                if (window.location.pathname === '/feed/subscriptions' && !document.getElementById('ytt-subs-filter-bar')) {
                    this.checkAndInject();
                }
            }, 2000);
        }

        setupDataListeners() {
            document.addEventListener('YTT_SUBSCRIPTIONS_UPDATED', () => this.updateChips());
            document.addEventListener('CHANNEL_MOVED', () => this.updateChips());
            document.addEventListener('TAB_CREATED', () => this.updateChips());
            document.addEventListener('TAB_DELETED', () => this.updateChips());
        }

        async checkAndInject() {
            if (window.location.pathname !== '/feed/subscriptions') {
                document.documentElement.removeAttribute(SUBSCRIPTIONS_PAGE_SWITCH_ATTRIBUTE);
                // Cancel any pending folder-data wait started by a prior inject
                clearTimeout(this._folderPollTimer);
                // Detach stale container reference so updateChips won't run off-page
                if (this.container && !this.container.isConnected) this.container = null;
                return;
            }

            const anchor = await this.waitForAnchor();
            if (!anchor) return;

            // Guard: path may have changed while waitForAnchor was polling
            if (window.location.pathname !== '/feed/subscriptions') return;

            if (!document.getElementById('ytt-subs-filter-bar')) {
                this.renderFilterBar(anchor);
            }

            this.updateChips();

            // If the server hasn't finished loading folders yet, poll until it has,
            // then do one more render so all folders appear without a page reload.
            this._pollForServerFolders();
        }

        _pollForServerFolders() {
            clearTimeout(this._folderPollTimer);
            // If data is already loaded (e.g. returning to subscriptions page), nothing to do
            const tm = window.tabManager;
            if (tm && tm._serverFolderStateLoaded) return;
            let attempts = 0;
            const MAX = 30; // 30 × 400 ms = 12 s max wait
            const poll = () => {
                if (window.location.pathname !== '/feed/subscriptions') return;
                if (!this.container || !this.container.isConnected) return;
                const tm = window.tabManager;
                if (tm && tm._serverFolderStateLoaded) {
                    this.updateChips();
                    return;
                }
                if (++attempts < MAX) {
                    this._folderPollTimer = setTimeout(poll, 400);
                }
            };
            this._folderPollTimer = setTimeout(poll, 400);
        }

        async waitForAnchor() {
            return new Promise(resolve => {
                let elapsed = 0;
                const check = () => {
                    // Abort if the user navigated away while we were waiting
                    if (window.location.pathname !== '/feed/subscriptions') {
                        resolve(null);
                        return;
                    }
                    // Prefer ytd-rich-grid-renderer so the bar is inserted BEFORE it
                    // (as a sibling inside #primary), not inside the grid's flex container.
                    const target =
                        document.querySelector('ytd-browse[page-subtype="subscriptions"] #primary ytd-rich-grid-renderer') ||
                        document.querySelector('ytd-browse[page-subtype="subscriptions"] #primary #contents');
                    if (target) {
                        resolve(target);
                    } else if (elapsed < 15000) {
                        elapsed += 500;
                        setTimeout(check, 500);
                    } else {
                        resolve(null); // Timeout — page may not be ready
                    }
                };
                check();
            });
        }

        renderFilterBar(anchor) {
            this.container = document.createElement('div');
            this.container.id = 'ytt-subs-filter-bar';
            this.container.classList.add('ytt-subscriptions-filter-bar');

            const chevL = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>`;
            const chevR = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`;

            this.container.innerHTML = `
                <div class="ytt-filter-icon-box">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
                </div>
                <div class="ytt-chips-track">
                    <button class="ytt-scroll-btn ytt-scroll-btn--left" aria-label="Scroll folders left" hidden>${chevL}</button>
                    <div class="ytt-chips-scroll-container"></div>
                    <button class="ytt-scroll-btn ytt-scroll-btn--right" aria-label="Scroll folders right" hidden>${chevR}</button>
                </div>
                <div class="ytt-total-channels-info"></div>
            `;

            anchor.parentNode.insertBefore(this.container, anchor);
            this.setupScrollBehavior();
            this._observeFilterBarHeight();
        }

        _observeFilterBarHeight() {
            if (!this.container) return;
            if (this._filterBarRO) this._filterBarRO.disconnect();
            const update = () => {
                const style = getComputedStyle(this.container);
                const offset = this.container.offsetHeight
                    + (parseFloat(style.marginTop) || 0)
                    + (parseFloat(style.marginBottom) || 0);
                document.documentElement.style.setProperty('--ytt-filter-bar-offset', offset + 'px');
            };
            this._filterBarRO = new ResizeObserver(update);
            this._filterBarRO.observe(this.container);
            update();
        }

        setupScrollBehavior() {
            const track   = this.container.querySelector('.ytt-chips-track');
            const scroller = this.container.querySelector('.ytt-chips-scroll-container');
            const btnLeft  = this.container.querySelector('.ytt-scroll-btn--left');
            const btnRight = this.container.querySelector('.ytt-scroll-btn--right');
            const SCROLL_STEP = 200;

            const updateArrows = () => {
                const { scrollLeft, scrollWidth, clientWidth } = scroller;
                const canLeft  = scrollLeft > 1;
                const canRight = scrollLeft < scrollWidth - clientWidth - 1;
                btnLeft.hidden  = !canLeft;
                btnRight.hidden = !canRight;
                track.classList.toggle('has-left',  canLeft);
                track.classList.toggle('has-right', canRight);
            };

            this._updateScrollArrows = updateArrows;

            btnLeft.addEventListener('click',  () => scroller.scrollBy({ left: -SCROLL_STEP, behavior: 'smooth' }));
            btnRight.addEventListener('click', () => scroller.scrollBy({ left:  SCROLL_STEP, behavior: 'smooth' }));

            scroller.addEventListener('scroll', updateArrows, { passive: true });

            // Convert vertical mouse-wheel to horizontal scroll only when there is overflow.
            // Touchpad horizontal swipe (deltaX != 0) is left to the browser.
            scroller.addEventListener('wheel', e => {
                if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
                if (scroller.scrollWidth <= scroller.clientWidth) return;
                e.preventDefault();
                scroller.scrollBy({ left: e.deltaY * 2.5, behavior: 'auto' });
            }, { passive: false });

            // Re-evaluate whenever the scroller is resized (sidebar toggle, window resize)
            const ro = new ResizeObserver(updateArrows);
            ro.observe(scroller);

            updateArrows();
        }

        updateChips() {
            if (!this.container) return;

            const tm = window.tabManager;
            if (!tm || !tm.tabData) {
                setTimeout(() => this.updateChips(), 1000);
                return;
            }

            const scrollContainer = this.container.querySelector('.ytt-chips-scroll-container');
            const totalInfo = this.container.querySelector('.ytt-total-channels-info');

            const allChannels = window.subscriptionManager?.getAll() || [];
            const totalCount = allChannels.length;
            const uncatChannels = this.getUncategorizedChannels();

            const folders = Object.entries(tm.tabData).map(([id, data]) => ({
                id,
                name: data.name || data.title,
                color: data.color,
                channels: this.getChannelsInFolder(id)
            })).sort((a, b) => (tm.tabData[a.id].index || 0) - (tm.tabData[b.id].index || 0));

            let html = `
                <button class="ytt-filter-chip ${this.activeFolderId === 'all' ? 'active' : ''}" data-id="all" title="All (${totalCount})">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 12H3"></path><path d="M16 6H3"></path><path d="M12 18H3"></path><path d="m16 12 5 3-5 3v-6Z"></path></svg>
                    <span>All</span>
                    <span class="ytt-chip-badge">${totalCount}</span>
                </button>
                <button class="ytt-filter-chip ${this.activeFolderId === 'unclassified' ? 'active' : ''}" data-id="unclassified" title="Unclassified (${uncatChannels.length})">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path></svg>
                    <span>Unclassified</span>
                    <span class="ytt-chip-badge">${uncatChannels.length}</span>
                </button>
            `;

            folders.forEach(f => {
                const colorStyle = f.color ? ` style="--chip-color:${f.color}"` : '';
                html += `
                    <button class="ytt-filter-chip ${this.activeFolderId === f.id ? 'active' : ''}" data-id="${f.id}" title="${f.name} (${f.channels.length})"${colorStyle}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--chip-color, currentColor)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"></path></svg>
                        <span>${f.name}</span>
                        <span class="ytt-chip-badge">${f.channels.length}</span>
                    </button>
                `;
            });

            scrollContainer.innerHTML = html;
            totalInfo.textContent = `${totalCount} channels`;

            scrollContainer.querySelectorAll('.ytt-filter-chip').forEach(chip => {
                chip.onclick = () => this.setFolder(chip.dataset.id);
            });

            // After the browser has painted the updated chip list, refresh arrow
            // visibility and scroll the active chip into view if it is off-screen.
            requestAnimationFrame(() => {
                this._updateScrollArrows?.();
                const activeChip = scrollContainer.querySelector('.ytt-filter-chip.active');
                activeChip?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
            });
        }

        setFolder(id) {
            this.activeFolderId = id;
            this.activeContentType = 'all';
            this.updateChips();

            if (id === 'all') {
                document.documentElement.removeAttribute(SUBSCRIPTIONS_PAGE_SWITCH_ATTRIBUTE);
                if (this.panel) this.panel.remove();
                this.panel = null;
            } else {
                document.documentElement.setAttribute(SUBSCRIPTIONS_PAGE_SWITCH_ATTRIBUTE, FOLDER_MODE);
                this.renderVideosPanel();
            }
        }

        async renderVideosPanel() {
            const primary = document.querySelector('ytd-browse[page-subtype="subscriptions"] #primary');
            if (!primary) return;

            if (!this.panel) {
                this.panel = document.createElement('div');
                this.panel.id = 'ytt-folder-videos-panel';
                primary.appendChild(this.panel);
            }

            const folderData = this.activeFolderId === 'unclassified' ? 
                { name: 'Unclassified', channels: this.getUncategorizedChannels() } :
                { name: window.tabManager.tabData[this.activeFolderId]?.name || 'Folder', channels: this.getChannelsInFolder(this.activeFolderId) };

            this.panel.innerHTML = `
                <div class="ytt-folder-view-header">
                    <div class="ytt-content-type-bar">
                        <button class="ytt-content-type-btn ${this.activeContentType === 'all' ? 'active' : ''}" data-type="all">All</button>
                        <button class="ytt-content-type-btn ${this.activeContentType === 'videos' ? 'active' : ''}" data-type="videos">Videos</button>
                        <button class="ytt-content-type-btn ${this.activeContentType === 'shorts' ? 'active' : ''}" data-type="shorts">Shorts</button>
                    </div>
                </div>
                <div class="ytt-folder-view-content">
                    <div class="ytt-videos-container">
                        <div class="ytt-loading-state" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 100px 0; color: var(--yt-spec-text-secondary, #aaa); gap: 16px;">
                            <div class="ytt-spinner" style="width: 40px; height: 40px; border: 3px solid var(--yt-spec-10-percent-layer, rgba(255,255,255,0.1)); border-top-color: var(--yt-spec-text-primary, #fff); border-radius: 50%; animation: ytt-spin 1s linear infinite;"></div>
                            <div>Fetching latest uploads...</div>
                        </div>
                    </div>
                </div>
            `;

            this.panel.querySelectorAll('.ytt-content-type-btn').forEach(btn => {
                btn.onclick = () => {
                    this.activeContentType = btn.dataset.type;
                    this.renderVideosPanel();
                };
            });

            if (folderData.channels.length === 0) {
                this.panel.querySelector('.ytt-videos-container').innerHTML = `<div style="text-align: center; padding: 60px; color: var(--yt-spec-text-secondary, #aaa);">No channels in this folder</div>`;
                return;
            }

            try {
                const videos = await this.fetchLatestVideos(folderData.channels);
                this.renderVideoList(videos);
            } catch (err) {
                this.panel.querySelector('.ytt-videos-container').innerHTML = `<div style="text-align: center; padding: 60px; color: var(--yt-spec-text-secondary, #aaa);">Error: ${err.message}</div>`;
            }
        }

        renderVideoList(videos) {
            const container = this.panel.querySelector('.ytt-videos-container');
            
            const filtered = videos.filter(v => {
                if (this.activeContentType === 'videos') return !v.isShort;
                if (this.activeContentType === 'shorts') return v.isShort;
                return true;
            });

            // Update badges in content type bar
            const total = videos.length;
            const regCount = videos.filter(v => !v.isShort).length;
            const shortCount = videos.filter(v => v.isShort).length;

            this.panel.querySelector('[data-type="all"]').innerHTML = `All <span class="badge">${total}</span>`;
            this.panel.querySelector('[data-type="videos"]').innerHTML = `Videos <span class="badge">${regCount}</span>`;
            this.panel.querySelector('[data-type="shorts"]').innerHTML = `Shorts <span class="badge">${shortCount}</span>`;

            if (filtered.length === 0) {
                container.innerHTML = `<div style="text-align: center; padding: 60px; color: var(--yt-spec-text-secondary, #aaa);">No ${this.activeContentType} found</div>`;
                return;
            }

            const shorts = filtered.filter(v => v.isShort);
            const regulars = filtered.filter(v => !v.isShort);

            let html = '';
            if (this.activeContentType === 'all' || this.activeContentType === 'shorts') {
                if (shorts.length > 0) {
                    html += `
                        <div class="ytt-section-title" style="font-size: 20px; font-weight: 700; color: var(--yt-spec-text-primary, #f1f1f1); margin: 24px 0 16px 0; display: flex; align-items: center; gap: 12px;">
                            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M17.77 10.32c-.77-.32-1.2-.5-1.2-.5L18 8.82a3.66 3.66 0 00-1.39-4.96 3.5 3.5 0 00-4.84 1.41l-1.36 2.3s-.18.29-.18.29l-1.01-2.07A3.67 3.67 0 004.28 4.4a3.5 3.5 0 00-1.41 4.84l3.18 5.44s.18.29.18.29l-1.43 3s-.18.29-.18.29a3.67 3.67 0 001.41 4.84c.54.32 1.15.47 1.76.47a3.51 3.51 0 003.08-1.88l1.36-2.3s.18-.29.18-.29l1.01 2.07a3.66 3.66 0 005.14 1.41 3.5 3.5 0 001.41-4.84l-3.18-5.44s-.18-.29-.18-.29l1.43-3s.18-.29.18-.29a3.66 3.66 0 00-1.41-4.84z"></path></svg>
                            <span>Shorts</span>
                        </div>
                        <div class="ytt-shorts-grid">${shorts.map(v => this.createVideoCard(v, true)).join('')}</div>
                    `;
                }
            }

            if (this.activeContentType === 'all' || this.activeContentType === 'videos') {
                if (regulars.length > 0) {
                    html += `
                        <div class="ytt-section-title" style="font-size: 20px; font-weight: 700; color: var(--yt-spec-text-primary, #f1f1f1); margin: 24px 0 16px 0;">Latest Uploads</div>
                        <div class="ytt-video-grid">${regulars.map(v => this.createVideoCard(v, false)).join('')}</div>
                    `;
                }
            }

            container.innerHTML = html;
        }

        createVideoCard(v, isShort) {
            const timeStr = this.timeAgo(v.published);
            const shortsBadge = `
                <div style="position: absolute; bottom: 8px; right: 8px; background: rgba(0,0,0,0.8); border-radius: 4px; padding: 2px 4px; display: flex; align-items: center; gap: 4px;">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="#fff"><path d="M17.77 10.32c-.77-.32-1.2-.5-1.2-.5L18 8.82a3.66 3.66 0 00-1.39-4.96 3.5 3.5 0 00-4.84 1.41l-1.36 2.3s-.18.29-.18.29l-1.01-2.07A3.67 3.67 0 004.28 4.4a3.5 3.5 0 00-1.41 4.84l3.18 5.44s.18.29.18.29l-1.43 3s-.18.29-.18.29a3.67 3.67 0 001.41 4.84c.54.32 1.15.47 1.76.47a3.51 3.51 0 003.08-1.88l1.36-2.3s.18-.29.18-.29l1.01 2.07a3.66 3.66 0 005.14 1.41 3.5 3.5 0 001.41-4.84l-3.18-5.44s-.18-.29-.18-.29l1.43-3s.18-.29.18-.29a3.66 3.66 0 00-1.41-4.84z"></path></svg>
                    <span style="color: #fff; font-size: 10px; font-weight: 700;">SHORTS</span>
                </div>
            `;
            
            return `
                <a href="${v.link}" class="ytt-video-card ${isShort ? 'ytt-shorts-card' : ''}" target="_blank">
                    <div class="ytt-thumb-container">
                        <img src="${v.thumbnail}" loading="lazy">
                        ${isShort ? shortsBadge : ''}
                    </div>
                    <div class="ytt-video-meta">
                        ${!isShort ? `<img src="${v.channelAvatar}" class="ytt-video-avatar" loading="lazy">` : ''}
                        <div class="ytt-video-info">
                            <div class="ytt-video-title" title="${v.title}">${v.title}</div>
                            <div class="ytt-video-details">
                                <span>${v.channelName}</span>
                                <span>•</span>
                                <span>${timeStr}</span>
                            </div>
                        </div>
                    </div>
                </a>
            `;
        }

        getUncategorizedChannels() {
            const all = window.subscriptionManager?.getAll() || [];
            const tm = window.tabManager;
            if (!tm || !tm.tabData) return all;
            const assigned = new Set();
            Object.values(tm.tabData).forEach(f => {
                const cids = f.channelIds || f.channels || [];
                cids.forEach(ch => {
                    if (typeof ch === 'string') assigned.add(ch);
                    else if (ch?.id) assigned.add(ch.id);
                    else if (ch?.channelId) assigned.add(ch.channelId);
                });
            });
            return all.filter(c => !assigned.has(c.id));
        }

        getChannelsInFolder(folderId) {
            const all = window.subscriptionManager?.getAll() || [];
            const tm = window.tabManager;
            if (!tm || !tm.tabData || !tm.tabData[folderId]) return [];
            const f = tm.tabData[folderId];
            const cids = f.channelIds || f.channels || [];
            const assignedIds = new Set();
            cids.forEach(ch => {
                if (typeof ch === 'string') assignedIds.add(ch);
                else if (ch?.id) assignedIds.add(ch.id);
                else if (ch?.channelId) assignedIds.add(ch.channelId);
            });
            return all.filter(c => assignedIds.has(c.id));
        }

        async fetchLatestVideos(channels) {
            if (this.abortController) this.abortController.abort();
            this.abortController = new AbortController();

            const results = [];
            const queue = [...channels];
            const active = new Set();

            return new Promise((resolve) => {
                const next = async () => {
                    if (this.abortController.signal.aborted) return;
                    if (queue.length === 0 && active.size === 0) {
                        resolve(results.flat().sort((a, b) => b.published - a.published));
                        return;
                    }

                    while (active.size < RSS_FETCH_CONCURRENCY && queue.length > 0) {
                        const channel = queue.shift();
                        const promise = this.fetchChannelRSS(channel)
                            .then(v => results.push(v))
                            .catch(err => console.warn(`Failed to fetch RSS for ${channel.id}:`, err))
                            .finally(() => {
                                active.delete(promise);
                                next();
                            });
                        active.add(promise);
                    }
                };
                next();
            });
        }

        async fetchChannelRSS(channel) {
            const cacheKey = `rss_${channel.id}`;
            const cached = this.videoCache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < VIDEO_CACHE_TTL) return cached.data;

            const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${channel.id}`;
            const resp = await fetch(url, { signal: this.abortController.signal });
            const text = await resp.text();
            
            const parser = new DOMParser();
            const xml = parser.parseFromString(text, 'text/xml');
            const entries = Array.from(xml.querySelectorAll('entry')).slice(0, 15);

            const videos = entries.map(entry => {
                const id = entry.querySelector('videoId')?.textContent || entry.querySelector('id')?.textContent?.split(':').pop();
                const title = entry.querySelector('title')?.textContent;
                const link = entry.querySelector('link')?.getAttribute('href');
                const published = new Date(entry.querySelector('published')?.textContent).getTime();
                const thumbnail = entry.querySelector('thumbnail')?.getAttribute('url') || `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
                
                return {
                    id, title, link, published, thumbnail,
                    channelId: channel.id,
                    channelName: channel.name,
                    channelAvatar: channel.thumbnail,
                    isShort: link.includes('/shorts/') || title.toLowerCase().includes('#shorts')
                };
            });

            this.videoCache.set(cacheKey, { data: videos, timestamp: Date.now() });
            return videos;
        }

        timeAgo(timestamp) {
            const seconds = Math.floor((Date.now() - timestamp) / 1000);
            let interval = seconds / 31536000;
            if (interval > 1) return Math.floor(interval) + " years ago";
            interval = seconds / 2592000;
            if (interval > 1) return Math.floor(interval) + " months ago";
            interval = seconds / 86400;
            if (interval > 1) return Math.floor(interval) + " days ago";
            interval = seconds / 3600;
            if (interval > 1) return Math.floor(interval) + " hours ago";
            interval = seconds / 60;
            if (interval > 1) return Math.floor(interval) + " minutes ago";
            return Math.floor(seconds) + " seconds ago";
        }
    }

    if (window.tabManager) {
        window.subscriptionsFilter = new SubscriptionsFilter();
    } else {
        const observer = new MutationObserver(() => {
            if (window.tabManager) {
                window.subscriptionsFilter = new SubscriptionsFilter();
                observer.disconnect();
            }
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
    }
})();
