(function () {
    'use strict';

    if (window.__ytt_settings_modal_init) return;
    window.__ytt_settings_modal_init = true;

    // Remove native title tooltips from dock buttons; CSS tooltip via aria-label takes over.
    (function _initDockTooltips() {
        function clearTitles() {
            document.querySelectorAll('.ytt-badge-header-controls .ytt-btn[title]').forEach(btn => {
                btn.removeAttribute('title');
            });
        }
        clearTitles();
        const obs = new MutationObserver(clearTitles);
        obs.observe(document.documentElement, { childList: true, subtree: true });
    })();

    const VERSION = (() => {
        try { return chrome.runtime.getManifest().version; } catch (_) { return '—'; }
    })();

    // Detect language early so window.ytt_language is available to other scripts
    // before the settings modal is ever opened.
    (function _earlyLangSet() {
        let l = null;
        try { l = window.ytcfg?.get?.('HL'); } catch (_) {}
        if (!l) try { l = window.yt?.config_?.HL; } catch (_) {}
        if (!l) l = document.documentElement.lang || navigator.language || 'en';
        l = String(l).trim() || 'en';
        window.ytt_language = l;
        window.__ytt_rtl   = ['ar', 'he', 'iw', 'fa', 'ur'].includes(l.split('-')[0]);
    })();

    // ── Styles (mirrors Screenety layout, FolderTube variables) ──────────────

    function injectStyles() {
        if (document.getElementById('ytt-manager-styles')) return;
        const s = document.createElement('style');
        s.id = 'ytt-manager-styles';
        s.textContent = `
            /* Trigger button */
            #ytt-settings-btn svg {
                fill: none !important;
                stroke: currentColor;
                width: 18px !important;
                height: 18px !important;
            }

            /* ── Backdrop ─────────────────────────────────────────── */
            .ytt-manager-backdrop {
                position: fixed;
                inset: 0;
                background-color: rgba(0, 0, 0, 0.45);
                backdrop-filter: blur(4px);
                -webkit-backdrop-filter: blur(4px);
                z-index: 2147483646;
                animation: ytt-mgr-fade .18s ease;
            }
            @keyframes ytt-mgr-fade { from { opacity: 0 } to { opacity: 1 } }

            /* ── Modal (750 × 520, flex row) ──────────────────────── */
            .ytt-manager-modal {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                z-index: 2147483647;
                display: flex;
                width: 750px;
                height: 520px;
                max-width: calc(100vw - 32px);
                max-height: calc(100vh - 32px);
                border-radius: 12px;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
                overflow: hidden;
                animation: ytt-mgr-pop .22s cubic-bezier(.34, 1.2, .64, 1);
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                color: var(--ytt-text, #e3e3e3);
            }
            @keyframes ytt-mgr-pop {
                from { opacity: 0; transform: translate(-50%, -52%) scale(.94) }
                to   { opacity: 1; transform: translate(-50%, -50%) scale(1)   }
            }

            /* ── Sidebar ──────────────────────────────────────────── */
            .ytt-mgr-sidebar {
                width: 150px;
                flex-shrink: 0;
                background-color: var(--ytt-bg, #202123);
                display: flex;
                flex-direction: column;
            }
            .ytt-mgr-nav {
                list-style: none;
                padding: 20px 8px 8px;
                margin: 0;
                flex: 1;
            }
            .ytt-mgr-nav li {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 10px 12px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 14px;
                color: var(--ytt-text, #e3e3e3);
                margin-bottom: 4px;
                transition: background .12s;
                user-select: none;
                white-space: nowrap;
            }
            .ytt-mgr-nav li svg { fill: none; stroke: currentColor; flex-shrink: 0; }
            .ytt-mgr-nav li:hover  { background-color: var(--ytt-hover, rgba(255,255,255,.08)); }
            .ytt-mgr-nav li.active { background-color: var(--ytt-menu-bg, #282a2c); font-weight: 500; }

            .ytt-mgr-footer {
                margin-top: auto;
                padding: 10px 14px 12px;
                border-top: 1px solid var(--ytt-border, rgba(255,255,255,0.07));
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 6px;
            }
            .ytt-mgr-social-links {
                display: flex;
                align-items: center;
                gap: 0px;
            }
            .ytt-mgr-social-links a {
                color: var(--ytt-text-secondary, #666);
                display: flex;
                align-items: center;
                justify-content: center;
                width: 22px;
                height: 22px;
                border-radius: 6px;
                transition: color 0.15s, background-color 0.15s;
                text-decoration: none;
                flex-shrink: 0;
            }
            .ytt-mgr-social-links a:hover {
                color: var(--ytt-text, #f1f1f1);
                background-color: var(--ytt-hover, rgba(255,255,255,.08));
            }
            .ytt-mgr-copyright {
                font-size: 10.5px;
                color: var(--ytt-text-secondary, #555);
                margin: 0;
                line-height: 1.5;
                letter-spacing: 0.2px;
            }
            .ytt-mgr-copyright a {
                color: var(--ytt-text-secondary, #777);
                text-decoration: none;
            }
            .ytt-mgr-copyright a:hover { color: var(--ytt-text, #f1f1f1); }

            /* ── Main area ────────────────────────────────────────── */
            .ytt-mgr-main {
                flex-grow: 1;
                display: flex;
                flex-direction: column;
                background-color: var(--ytt-menu-bg, #282a2c);
                position: relative;
                overflow: hidden;
            }

            /* Close button — top-right of main area, × character */
            .ytt-manager-close {
                position: absolute;
                top: 10px;
                right: 10px;
                width: 28px;
                height: 28px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 50%;
                border: 1px solid var(--ytt-border, rgba(255,255,255,.12));
                background: transparent;
                color: var(--ytt-text-secondary, #aaa);
                cursor: pointer;
                font-size: 18px;
                line-height: 1;
                padding: 0;
                transition: background .14s, color .14s;
                z-index: 2;
            }
            .ytt-manager-close:hover {
                background: var(--ytt-hover, rgba(255,255,255,.1));
                color: var(--ytt-text, #f1f1f1);
            }

            /* Content body */
            .ytt-mgr-body {
                padding: 24px;
                flex-grow: 1;
                display: flex;
                flex-direction: column;
                overflow-y: auto;
                scrollbar-width: thin;
                scrollbar-color: var(--ytt-border, rgba(255,255,255,.15)) transparent;
            }
            .ytt-mgr-body::-webkit-scrollbar { width: 5px; }
            .ytt-mgr-body::-webkit-scrollbar-track { background: transparent; }
            .ytt-mgr-body::-webkit-scrollbar-thumb {
                background: var(--ytt-border, rgba(255,255,255,.15));
                border-radius: 3px;
            }

            /* ── Views ────────────────────────────────────────────── */
            .ytt-mgr-view          { display: none; }
            .ytt-mgr-view.active   { display: flex; flex-direction: column; flex: 1; }

            .ytt-mgr-view-title {
                font-size: 16px;
                font-weight: 600;
                color: var(--ytt-text, #e3e3e3);
                margin: 0;
            }
            .ytt-mgr-hr {
                border: none;
                border-top: 1px solid var(--ytt-border, rgba(255,255,255,.1));
                margin: 10px 0 16px;
            }
            .ytt-mgr-hr.thick {
                border-top-width: 2px;
                margin: 8px 0 20px;
            }

            /* ── Settings rows ────────────────────────────────────── */
            .ytt-mgr-item {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 16px;
                padding: 4px 0;
            }
            .ytt-mgr-item > label:first-child {
                font-size: 13px;
                color: var(--ytt-text, #e3e3e3);
                cursor: default;
            }

            /* Language badge */
            .ytt-mgr-lang-badge {
                flex-shrink: 0;
                padding: 4px 12px;
                border-radius: 20px;
                font-size: 12px;
                font-weight: 500;
                background: var(--ytt-hover, rgba(255,255,255,.07));
                border: 1px solid var(--ytt-border, rgba(255,255,255,.12));
                color: var(--ytt-text, #e3e3e3);
                white-space: nowrap;
            }

            /* Multi-line item text */
            .ytt-mgr-item-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
            .ytt-mgr-item-label {
                font-size: 13px;
                color: var(--ytt-text, #e3e3e3);
            }
            .ytt-mgr-item-desc {
                font-size: 11px;
                color: var(--ytt-text-secondary, #aaa);
                line-height: 1.4;
            }

            /* Action buttons (Import / Export) */
            .ytt-mgr-action-btn {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                padding: 6px 14px;
                border-radius: 6px;
                font-size: 12px;
                font-weight: 500;
                border: 1px solid var(--ytt-border, rgba(255,255,255,.15));
                background: transparent;
                color: var(--ytt-text-secondary, #aaa);
                cursor: pointer;
                transition: background .13s, color .13s, border-color .13s;
                flex-shrink: 0;
                white-space: nowrap;
            }
            .ytt-mgr-action-btn:hover {
                background: var(--ytt-hover, rgba(255,255,255,.08));
                color: var(--ytt-text, #f1f1f1);
                border-color: rgba(255,255,255,.28);
            }
            .ytt-mgr-action-btn.primary {
                background: rgba(123,102,255,.14);
                border-color: rgba(123,102,255,.3);
                color: #b0a0ff;
            }
            .ytt-mgr-action-btn.primary:hover {
                background: rgba(123,102,255,.24);
                border-color: rgba(123,102,255,.5);
                color: #c5b8ff;
            }

            /* ── Placeholder (Folders / Channels) ─────────────────── */
            .ytt-mgr-placeholder {
                flex: 1;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 12px;
                text-align: center;
            }
            .ytt-mgr-ph-icon {
                width: 56px;
                height: 56px;
                border-radius: 14px;
                background: rgba(123,102,255,.1);
                border: 1px solid rgba(123,102,255,.2);
                display: flex;
                align-items: center;
                justify-content: center;
                color: #7b66ff;
                margin-bottom: 4px;
            }
            .ytt-mgr-ph-icon svg { fill: none; stroke: currentColor; }
            .ytt-mgr-ph-title {
                font-size: 14px;
                font-weight: 600;
                color: var(--ytt-text, #e3e3e3);
                margin: 0;
            }
            .ytt-mgr-ph-desc {
                font-size: 12px;
                color: var(--ytt-text-secondary, #aaa);
                line-height: 1.55;
                max-width: 240px;
                margin: 0;
            }
            .ytt-mgr-soon {
                display: inline-block;
                padding: 3px 10px;
                border-radius: 20px;
                font-size: 10px;
                font-weight: 700;
                letter-spacing: .5px;
                text-transform: uppercase;
                background: rgba(123,102,255,.14);
                color: #b0a0ff;
                border: 1px solid rgba(123,102,255,.24);
            }


            /* ── Channel management ───────────────────────────────── */
            .ytt-mgr-ch-toolbar {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 8px;
            }
            .ytt-mgr-ch-search-wrap {
                flex: 1;
                min-width: 0;
                position: relative;
                display: flex;
                align-items: center;
            }
            .ytt-mgr-ch-search-icon {
                position: absolute;
                left: 10px;
                color: var(--ytt-text-secondary, #888);
                pointer-events: none;
                display: flex;
            }
            .ytt-mgr-ch-search {
                width: 100%;
                background: var(--ytt-hover, rgba(255,255,255,.06));
                color: var(--ytt-text, #e3e3e3);
                border: 1px solid var(--ytt-border, rgba(255,255,255,.12));
                border-radius: 20px;
                padding: 7px 10px 7px 33px;
                font-size: 13px;
                outline: none;
                transition: border-color .13s, background .13s;
                box-sizing: border-box;
            }
            .ytt-mgr-ch-search:focus {
                border-color: rgba(255,255,255,.3);
                background: var(--ytt-hover, rgba(255,255,255,.09));
            }
            .ytt-mgr-ch-search::placeholder { color: var(--ytt-text-secondary, #888); }
            .ytt-mgr-ch-count {
                font-size: 11px;
                color: var(--ytt-text-secondary, #888);
                white-space: nowrap;
                flex-shrink: 0;
            }
            /* Filter chips */
            .ytt-mgr-ch-chips-wrap {
                position: relative;
                margin-bottom: 2px;
            }
            /* Fade + arrow — same element, right edge */
            .ytt-mgr-ch-chips-wrap::before,
            .ytt-mgr-ch-chips-wrap::after {
                content: '';
                position: absolute;
                top: 0;
                bottom: 10px; /* leave room for padding-bottom on the scroll row */
                width: 48px;
                pointer-events: none;
                z-index: 1;
                opacity: 0;
                transition: opacity .2s;
            }
            .ytt-mgr-ch-chips-wrap::before {
                left: 0;
                background: linear-gradient(to right, var(--ytt-menu-bg, #1c1c1c) 30%, transparent);
            }
            .ytt-mgr-ch-chips-wrap::after {
                right: 0;
                background: linear-gradient(to left, var(--ytt-menu-bg, #1c1c1c) 30%, transparent);
            }
            .ytt-mgr-ch-chips-wrap.can-scroll-left::before  { opacity: 1; }
            .ytt-mgr-ch-chips-wrap.can-scroll-right::after  { opacity: 1; }
            /* Arrow nav buttons — float above the gradient */
            .ytt-chips-nav {
                position: absolute;
                top: 50%;
                transform: translateY(calc(-50% - 5px)); /* -5px offsets the chips padding-bottom */
                width: 22px;
                height: 22px;
                border: 1px solid rgba(255,255,255,0.18);
                border-radius: 50%;
                background: rgba(255,255,255,0.08);
                backdrop-filter: blur(6px);
                -webkit-backdrop-filter: blur(6px);
                color: var(--ytt-text, #e3e3e3);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 14px;
                line-height: 1;
                padding: 0;
                z-index: 2;
                opacity: 0;
                pointer-events: none;
                transition: opacity .2s, background .15s, transform .1s;
                box-shadow: none;
            }
            .ytt-chips-nav--left  { left: 2px; }
            .ytt-chips-nav--right { right: 2px; }
            .ytt-chips-nav:hover  { background: rgba(255,255,255,0.16); }
            .ytt-chips-nav:active { transform: translateY(calc(-50% - 5px)) scale(.88); }
            .ytt-mgr-ch-chips-wrap.can-scroll-left  .ytt-chips-nav--left  { opacity: 1; pointer-events: auto; }
            .ytt-mgr-ch-chips-wrap.can-scroll-right .ytt-chips-nav--right { opacity: 1; pointer-events: auto; }
            .ytt-mgr-ch-chips {
                display: flex;
                gap: 6px;
                overflow-x: auto;
                padding-bottom: 10px;
                scrollbar-width: none;
            }
            .ytt-mgr-ch-chips::-webkit-scrollbar { display: none; }
            .ytt-mgr-ch-chip {
                flex-shrink: 0;
                padding: 5px 14px;
                border-radius: 20px;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
                border: 1.5px solid var(--ytt-border, rgba(255,255,255,.18));
                background: transparent;
                color: var(--ytt-text-secondary, #aaa);
                transition: opacity .13s;
                white-space: nowrap;
                user-select: none;
            }
            .ytt-mgr-ch-chip:hover { opacity: .75; }
            .ytt-mgr-ch-chip.active {
                background: var(--chip-color, rgba(255,255,255,.15));
            }
            /* Section header */
            .ytt-mgr-ch-section-hdr {
                font-size: 10px;
                font-weight: 700;
                letter-spacing: .08em;
                color: var(--ytt-text-secondary, #888);
                text-transform: uppercase;
                padding: 4px 4px 6px;
            }
            /* Channel list */
            .ytt-mgr-ch-list {
                flex: 1;
                overflow-y: auto;
                display: flex;
                flex-direction: column;
                gap: 0;
                scrollbar-width: thin;
                scrollbar-color: var(--ytt-border, rgba(255,255,255,.15)) transparent;
            }
            .ytt-mgr-ch-list::-webkit-scrollbar { width: 4px; }
            .ytt-mgr-ch-list::-webkit-scrollbar-track { background: transparent; }
            .ytt-mgr-ch-list::-webkit-scrollbar-thumb {
                background: var(--ytt-border, rgba(255,255,255,.15));
                border-radius: 2px;
            }
            .ytt-mgr-ch-item {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 8px 4px;
                border-radius: 8px;
                transition: background .1s;
                cursor: default;
            }
            .ytt-mgr-ch-item:hover { background: var(--ytt-hover, rgba(255,255,255,.05)); }
            .ytt-mgr-ch-avatar {
                width: 44px;
                height: 44px;
                border-radius: 50%;
                object-fit: cover;
                flex-shrink: 0;
                background: var(--ytt-border, rgba(255,255,255,.1));
            }
            .ytt-mgr-ch-info {
                flex: 1;
                min-width: 0;
                display: flex;
                flex-direction: column;
                gap: 2px;
            }
            .ytt-mgr-ch-name {
                font-size: 14px;
                font-weight: 500;
                color: var(--ytt-text, #e3e3e3);
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .ytt-mgr-ch-sub {
                font-size: 10px;
                font-weight: 600;
                letter-spacing: .05em;
                color: var(--ytt-text-secondary, #888);
                text-transform: uppercase;
            }
            /* Assign button */
            .ytt-mgr-ch-assign-btn {
                flex-shrink: 0;
                width: 36px;
                height: 36px;
                border-radius: 50%;
                border: none;
                background: rgba(255,255,255,.08);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: background .13s, transform .1s;
                color: var(--ytt-text-secondary, #aaa);
                position: relative;
            }
            .ytt-mgr-ch-assign-btn:hover { background: rgba(255,255,255,.14); transform: scale(1.08); }
            .ytt-mgr-ch-assign-btn.assigned { background: transparent; }
            /* Folder picker popup */
            .ytt-mgr-ch-picker {
                position: fixed;
                z-index: 2147483647;
                background: var(--ytt-menu-bg, #2a2a2e);
                border: 1px solid var(--ytt-border, rgba(255,255,255,.12));
                border-radius: 10px;
                padding: 6px;
                min-width: 160px;
                max-height: 240px;
                overflow-y: auto;
                box-shadow: 0 8px 24px rgba(0,0,0,.4);
            }
            .ytt-mgr-ch-picker-item {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 7px 10px;
                border-radius: 6px;
                font-size: 12px;
                font-weight: 500;
                cursor: pointer;
                color: var(--ytt-text, #e3e3e3);
                transition: background .1s;
                white-space: nowrap;
            }
            .ytt-mgr-ch-picker-item:hover { background: rgba(255,255,255,.08); }
            .ytt-mgr-ch-picker-dot {
                width: 10px; height: 10px;
                border-radius: 50%;
                flex-shrink: 0;
            }
            .ytt-mgr-ch-empty {
                flex: 1;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 6px;
                font-size: 12px;
                color: var(--ytt-text-secondary, #888);
                text-align: center;
                padding: 24px 0;
                line-height: 1.6;
            }

            /* ── Light-theme overrides ────────────────────────────── */
            .ytt-light-theme .ytt-manager-modal  { box-shadow: 0 10px 30px rgba(0,0,0,.18); }
            .ytt-light-theme .ytt-mgr-nav li.active { background-color: var(--ytt-menu-bg, #fff); }
            .ytt-light-theme .ytt-manager-close:hover { background: var(--ytt-hover, rgba(0,0,0,.06)); color: var(--ytt-text, #0f0f0f); }
            .ytt-light-theme .ytt-mgr-view-title,
            .ytt-light-theme .ytt-mgr-item > label:first-child,
            .ytt-light-theme .ytt-mgr-ph-title,
            .ytt-light-theme .ytt-mgr-upgrade-card h3 { color: var(--ytt-text, #1c1c1e); }
            .ytt-light-theme .ytt-mgr-segmented button { color: var(--ytt-text-secondary, #6c6c70); }
            .ytt-light-theme .ytt-mgr-segmented button:hover { color: var(--ytt-text, #1c1c1e); }

            /* ── Account view ─────────────────────────────────────── */
            #ytt-view-account { overflow-y: auto; }
            .ytt-acct-section {
                overflow: hidden;
                margin-bottom: 10px;
            }
            .ytt-acct-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 11px 14px;
                gap: 12px;
                border-bottom: 1px solid var(--ytt-border, rgba(255,255,255,.07));
            }
            .ytt-acct-row:last-child { border-bottom: none; }
            .ytt-acct-row-label {
                font-size: 13px;
                color: var(--ytt-text-secondary, #aaa);
                flex-shrink: 0;
            }
            .ytt-acct-row-value {
                font-size: 13px;
                color: var(--ytt-text, #e3e3e3);
                text-align: right;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                max-width: 220px;
            }
            .ytt-acct-row-value.link {
                display: flex;
                align-items: center;
                gap: 4px;
                color: var(--ytt-text, #e3e3e3);
                text-decoration: none;
            }
            .ytt-acct-row-value.link:hover { opacity: .75; }
            .ytt-acct-plan-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 11px 14px 4px;
                gap: 8px;
            }
            .ytt-acct-plan-name {
                font-size: 13px;
                font-weight: 600;
                color: var(--ytt-text, #e3e3e3);
            }
            .ytt-acct-manage-btn {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                padding: 5px 12px;
                border-radius: 20px;
                font-size: 12px;
                font-weight: 500;
                cursor: pointer;
                border: 1px solid var(--ytt-border, rgba(255,255,255,.15));
                background: var(--ytt-hover, rgba(255,255,255,.06));
                color: var(--ytt-text, #e3e3e3);
                text-decoration: none;
                white-space: nowrap;
                transition: background .15s;
                flex-shrink: 0;
            }
            .ytt-acct-manage-btn:hover { background: var(--ytt-hover, rgba(255,255,255,.14)); }
            .ytt-acct-renewal {
                font-size: 11px;
                color: var(--ytt-text-secondary, #aaa);
                padding: 0 14px 10px;
            }
            .ytt-acct-actions {
                display: flex;
                flex-direction: column;
                gap: 6px;
            }
            .ytt-acct-btn {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                padding: 10px 16px;
                border-radius: 8px;
                font-size: 13px;
                font-weight: 500;
                cursor: pointer;
                border: 1px solid transparent;
                text-decoration: none;
                transition: opacity .15s, background .15s;
                width: 100%;
                box-sizing: border-box;
            }
            .ytt-acct-btn.secondary {
                background: var(--ytt-hover, rgba(255,255,255,.06));
                color: var(--ytt-text, #e3e3e3);
                border-color: var(--ytt-border, rgba(255,255,255,.1));
            }
            .ytt-acct-btn.secondary:hover { background: var(--ytt-hover, rgba(255,255,255,.12)); }
            .ytt-acct-btn.danger {
                background: rgba(239,68,68,.1);
                color: #f87171;
                border-color: rgba(239,68,68,.18);
            }
            .ytt-acct-btn.danger:hover { background: rgba(239,68,68,.18); }
            .ytt-acct-signed-out {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 14px;
                padding: 32px 16px 16px;
                text-align: center;
                color: var(--ytt-text-secondary, #aaa);
                font-size: 13px;
            }
            .ytt-acct-signed-out p { margin: 0; line-height: 1.5; }
            .ytt-acct-signin-btn {
                display: inline-flex;
                align-items: center;
                gap: 7px;
                padding: 10px 20px;
                border-radius: 8px;
                font-size: 13px;
                font-weight: 600;
                background: #ff0000;
                color: #fff;
                text-decoration: none;
                transition: opacity .15s;
            }
            .ytt-acct-signin-btn:hover { opacity: .85; }
            .ytt-acct-loading {
                display: flex;
                align-items: center;
                justify-content: center;
                height: 80px;
                color: var(--ytt-text-secondary, #aaa);
                font-size: 13px;
                gap: 8px;
            }
            .ytt-acct-spinner {
                width: 16px; height: 16px;
                border: 2px solid var(--ytt-border, rgba(255,255,255,.15));
                border-top-color: var(--ytt-text-secondary, #888);
                border-radius: 50%;
                animation: ytt-spin .7s linear infinite;
            }
            @keyframes ytt-spin { to { transform: rotate(360deg); } }
            .ytt-light-theme .ytt-acct-row-value { color: var(--ytt-text, #1c1c1e); }
            .ytt-light-theme .ytt-acct-plan-name { color: var(--ytt-text, #1c1c1e); }
            .ytt-light-theme .ytt-acct-manage-btn { color: var(--ytt-text, #1c1c1e); }
            .ytt-light-theme .ytt-acct-btn.secondary { color: var(--ytt-text, #1c1c1e); }
        `;
        document.head.appendChild(s);
    }

    // ── i18n ──────────────────────────────────────────────────────────────────

    function getT(lang) {
        const base = (lang || 'en').split('-')[0].toLowerCase();
        const full = String(lang || 'en').toLowerCase();
        const T = {
            en: { rtl:false,
                tabGeneral:'General', tabFolders:'Folders', tabChannels:'Channels', tabAccount:'Account',
                titleGeneral:'General', titleFolders:'Manage Folders', titleChannels:'Channel Assignments', titleAccount:'Account',
                labelLanguage:'Language', descLanguage:'Auto-detected from your YouTube settings',
                labelImportFolders:'Import Folders', descImportFolders:'Restore folder structure & channel assignments from a backup',
                labelImportSubs:'Import Subscriptions', descImportSubs:'Restore your subscriptions list from a backup',
                labelExportFolders:'Export Folders', descExportFolders:'Save folder structure & channel assignments to a .json file',
                labelExportSubs:'Export Subscriptions', descExportSubs:'Save your subscriptions list to a .json file',
                btnImport:'Import', btnExport:'Export',
                phFolderTitle:'Folder Management', phFolderDesc:'Create, rename, reorder and delete folders directly from this panel. Use the YouTube sidebar for now.',
                phComingSoon:'Coming Soon', searchPlaceholder:'Search channels…',
                sectionBrowse:'Browse Subscriptions', chSubtitle:'YouTube Channel',
                chEmpty:'No subscriptions loaded yet.\nBrowse YouTube first to load your channel list.',
                chNoMatch:'No channels match', chipAll:'All', chipUncategorized:'Uncategorized',
                acctName:'Name', acctEmail:'Email', acctManage:'Manage', acctWebsite:'Go to Website',
                acctSignOut:'Sign out', acctSignIn:'Sign in', acctSignedOutMsg:"You're not signed in to FolderTube.",
                acctLoading:'Loading…', renewalPrefix:'Your plan auto-renews on', addToFolder:'Add to folder',
            },
            de: { rtl:false,
                tabGeneral:'Allgemein', tabFolders:'Ordner', tabChannels:'Kanäle', tabAccount:'Konto',
                titleGeneral:'Allgemein', titleFolders:'Ordner verwalten', titleChannels:'Kanal-Zuweisungen', titleAccount:'Konto',
                labelLanguage:'Sprache', descLanguage:'Automatisch aus deinen YouTube-Einstellungen erkannt',
                labelImportFolders:'Ordner importieren', descImportFolders:'Ordnerstruktur & Kanal-Zuweisungen aus einem Backup wiederherstellen',
                labelImportSubs:'Abonnements importieren', descImportSubs:'Abonnementliste aus einem Backup wiederherstellen',
                labelExportFolders:'Ordner exportieren', descExportFolders:'Ordnerstruktur & Kanal-Zuweisungen als .json-Datei speichern',
                labelExportSubs:'Abonnements exportieren', descExportSubs:'Abonnementliste als .json-Datei speichern',
                btnImport:'Importieren', btnExport:'Exportieren',
                phFolderTitle:'Ordnerverwaltung', phFolderDesc:'Erstelle, benenne um, ordne neu an und lösche Ordner direkt aus diesem Panel. Nutze vorerst die YouTube-Seitenleiste.',
                phComingSoon:'Demnächst', searchPlaceholder:'Kanäle suchen…',
                sectionBrowse:'Abonnements durchsuchen', chSubtitle:'YouTube-Kanal',
                chEmpty:'Noch keine Abonnements geladen.\nBesuche zuerst YouTube, um deine Kanalliste zu laden.',
                chNoMatch:'Keine Kanäle gefunden', chipAll:'Alle', chipUncategorized:'Unkategorisiert',
                acctName:'Name', acctEmail:'E-Mail', acctManage:'Verwalten', acctWebsite:'Zur Website',
                acctSignOut:'Abmelden', acctSignIn:'Anmelden', acctSignedOutMsg:'Du bist nicht bei FolderTube angemeldet.',
                acctLoading:'Wird geladen…', renewalPrefix:'Dein Plan verlängert sich automatisch am', addToFolder:'Zu Ordner hinzufügen',
            },
            ar: { rtl:true,
                tabGeneral:'عام', tabFolders:'المجلدات', tabChannels:'القنوات', tabAccount:'الحساب',
                titleGeneral:'عام', titleFolders:'إدارة المجلدات', titleChannels:'تعيينات القنوات', titleAccount:'الحساب',
                labelLanguage:'اللغة', descLanguage:'يتم اكتشافها تلقائيًا من إعدادات YouTube',
                labelImportFolders:'استيراد المجلدات', descImportFolders:'استعادة بنية المجلدات وتعيينات القنوات من نسخة احتياطية',
                labelImportSubs:'استيراد الاشتراكات', descImportSubs:'استعادة قائمة الاشتراكات من نسخة احتياطية',
                labelExportFolders:'تصدير المجلدات', descExportFolders:'حفظ بنية المجلدات وتعيينات القنوات كملف .json',
                labelExportSubs:'تصدير الاشتراكات', descExportSubs:'حفظ قائمة الاشتراكات كملف .json',
                btnImport:'استيراد', btnExport:'تصدير',
                phFolderTitle:'إدارة المجلدات', phFolderDesc:'أنشئ المجلدات وأعد تسميتها وإعادة ترتيبها وحذفها مباشرةً من هذا اللوح. استخدم الشريط الجانبي لـ YouTube في الوقت الحالي.',
                phComingSoon:'قريبًا', searchPlaceholder:'البحث في القنوات…',
                sectionBrowse:'تصفح الاشتراكات', chSubtitle:'قناة YouTube',
                chEmpty:'لم يتم تحميل أي اشتراكات بعد.\nتصفح YouTube أولاً لتحميل قائمة قنواتك.',
                chNoMatch:'لا توجد قنوات مطابقة', chipAll:'الكل', chipUncategorized:'غير مصنف',
                acctName:'الاسم', acctEmail:'البريد الإلكتروني', acctManage:'إدارة', acctWebsite:'الذهاب إلى الموقع',
                acctSignOut:'تسجيل الخروج', acctSignIn:'تسجيل الدخول', acctSignedOutMsg:'أنت لست مسجلاً الدخول إلى FolderTube.',
                acctLoading:'جارٍ التحميل…', renewalPrefix:'يتجدد اشتراكك تلقائياً في', addToFolder:'إضافة إلى مجلد',
            },
            fr: { rtl:false,
                tabGeneral:'Général', tabFolders:'Dossiers', tabChannels:'Chaînes', tabAccount:'Compte',
                titleGeneral:'Général', titleFolders:'Gérer les dossiers', titleChannels:'Attribution des chaînes', titleAccount:'Compte',
                labelLanguage:'Langue', descLanguage:'Détectée automatiquement depuis vos paramètres YouTube',
                labelImportFolders:'Importer des dossiers', descImportFolders:'Restaurer la structure des dossiers et les attributions de chaînes depuis une sauvegarde',
                labelImportSubs:'Importer les abonnements', descImportSubs:"Restaurer votre liste d'abonnements depuis une sauvegarde",
                labelExportFolders:'Exporter les dossiers', descExportFolders:'Sauvegarder la structure des dossiers et les attributions de chaînes dans un fichier .json',
                labelExportSubs:'Exporter les abonnements', descExportSubs:"Sauvegarder votre liste d'abonnements dans un fichier .json",
                btnImport:'Importer', btnExport:'Exporter',
                phFolderTitle:'Gestion des dossiers', phFolderDesc:'Créez, renommez, réorganisez et supprimez des dossiers directement depuis ce panneau. Utilisez la barre latérale YouTube pour l’instant.',
                phComingSoon:'Bientôt disponible', searchPlaceholder:'Rechercher des chaînes…',
                sectionBrowse:'Parcourir les abonnements', chSubtitle:'Chaîne YouTube',
                chEmpty:'Aucun abonnement chargé.\nParcourez YouTube d’abord pour charger votre liste de chaînes.',
                chNoMatch:'Aucune chaîne ne correspond', chipAll:'Tous', chipUncategorized:'Non catégorisé',
                acctName:'Nom', acctEmail:'E-mail', acctManage:'Gérer', acctWebsite:'Aller sur le site',
                acctSignOut:'Se déconnecter', acctSignIn:'Se connecter', acctSignedOutMsg:'Vous n’êtes pas connecté à FolderTube.',
                acctLoading:'Chargement…', renewalPrefix:'Votre abonnement se renouvelle automatiquement le', addToFolder:'Ajouter au dossier',
            },
            es: { rtl:false,
                tabGeneral:'General', tabFolders:'Carpetas', tabChannels:'Canales', tabAccount:'Cuenta',
                titleGeneral:'General', titleFolders:'Administrar carpetas', titleChannels:'Asignación de canales', titleAccount:'Cuenta',
                labelLanguage:'Idioma', descLanguage:'Detectado automáticamente desde tu configuración de YouTube',
                labelImportFolders:'Importar carpetas', descImportFolders:'Restaurar la estructura de carpetas y asignaciones de canales desde una copia de seguridad',
                labelImportSubs:'Importar suscripciones', descImportSubs:'Restaurar tu lista de suscripciones desde una copia de seguridad',
                labelExportFolders:'Exportar carpetas', descExportFolders:'Guardar la estructura de carpetas y asignaciones de canales en un archivo .json',
                labelExportSubs:'Exportar suscripciones', descExportSubs:'Guardar tu lista de suscripciones en un archivo .json',
                btnImport:'Importar', btnExport:'Exportar',
                phFolderTitle:'Administración de carpetas', phFolderDesc:'Crea, renombra, reordena y elimina carpetas directamente desde este panel. Usa la barra lateral de YouTube por ahora.',
                phComingSoon:'Próximamente', searchPlaceholder:'Buscar canales…',
                sectionBrowse:'Explorar suscripciones', chSubtitle:'Canal de YouTube',
                chEmpty:'No hay suscripciones cargadas aún.\nNavega por YouTube primero para cargar tu lista de canales.',
                chNoMatch:'Ningún canal coincide', chipAll:'Todos', chipUncategorized:'Sin categoría',
                acctName:'Nombre', acctEmail:'Correo electrónico', acctManage:'Administrar', acctWebsite:'Ir al sitio web',
                acctSignOut:'Cerrar sesión', acctSignIn:'Iniciar sesión', acctSignedOutMsg:'No has iniciado sesión en FolderTube.',
                acctLoading:'Cargando…', renewalPrefix:'Tu plan se renueva automáticamente el', addToFolder:'Agregar a carpeta',
            },
            pt: { rtl:false,
                tabGeneral:'Geral', tabFolders:'Pastas', tabChannels:'Canais', tabAccount:'Conta',
                titleGeneral:'Geral', titleFolders:'Gerenciar pastas', titleChannels:'Atribuição de canais', titleAccount:'Conta',
                labelLanguage:'Idioma', descLanguage:'Detectado automaticamente a partir das suas configurações do YouTube',
                labelImportFolders:'Importar pastas', descImportFolders:'Restaurar estrutura de pastas e atribuições de canais de um backup',
                labelImportSubs:'Importar inscrições', descImportSubs:'Restaurar sua lista de inscrições de um backup',
                labelExportFolders:'Exportar pastas', descExportFolders:'Salvar estrutura de pastas e atribuições de canais em um arquivo .json',
                labelExportSubs:'Exportar inscrições', descExportSubs:'Salvar sua lista de inscrições em um arquivo .json',
                btnImport:'Importar', btnExport:'Exportar',
                phFolderTitle:'Gerenciamento de pastas', phFolderDesc:'Crie, renomeie, reordene e exclua pastas diretamente deste painel. Use a barra lateral do YouTube por enquanto.',
                phComingSoon:'Em breve', searchPlaceholder:'Pesquisar canais…',
                sectionBrowse:'Navegar pelas inscrições', chSubtitle:'Canal do YouTube',
                chEmpty:'Nenhuma inscrição carregada ainda.\nNavegue pelo YouTube primeiro para carregar sua lista de canais.',
                chNoMatch:'Nenhum canal corresponde', chipAll:'Todos', chipUncategorized:'Sem categoria',
                acctName:'Nome', acctEmail:'E-mail', acctManage:'Gerenciar', acctWebsite:'Ir ao site',
                acctSignOut:'Sair', acctSignIn:'Entrar', acctSignedOutMsg:'Você não está conectado ao FolderTube.',
                acctLoading:'Carregando…', renewalPrefix:'Seu plano é renovado automaticamente em', addToFolder:'Adicionar à pasta',
            },
            it: { rtl:false,
                tabGeneral:'Generale', tabFolders:'Cartelle', tabChannels:'Canali', tabAccount:'Account',
                titleGeneral:'Generale', titleFolders:'Gestisci cartelle', titleChannels:'Assegnazione canali', titleAccount:'Account',
                labelLanguage:'Lingua', descLanguage:'Rilevata automaticamente dalle impostazioni di YouTube',
                labelImportFolders:'Importa cartelle', descImportFolders:'Ripristina la struttura delle cartelle e le assegnazioni dei canali da un backup',
                labelImportSubs:'Importa iscrizioni', descImportSubs:'Ripristina la tua lista di iscrizioni da un backup',
                labelExportFolders:'Esporta cartelle', descExportFolders:'Salva la struttura delle cartelle e le assegnazioni dei canali in un file .json',
                labelExportSubs:'Esporta iscrizioni', descExportSubs:'Salva la tua lista di iscrizioni in un file .json',
                btnImport:'Importa', btnExport:'Esporta',
                phFolderTitle:'Gestione cartelle', phFolderDesc:'Crea, rinomina, riordina ed elimina cartelle direttamente da questo pannello. Usa la barra laterale di YouTube per ora.',
                phComingSoon:'Prossimamente', searchPlaceholder:'Cerca canali…',
                sectionBrowse:'Sfoglia iscrizioni', chSubtitle:'Canale YouTube',
                chEmpty:'Nessuna iscrizione caricata ancora.\nNaviga su YouTube prima per caricare la tua lista di canali.',
                chNoMatch:'Nessun canale corrisponde', chipAll:'Tutti', chipUncategorized:'Non categorizzato',
                acctName:'Nome', acctEmail:'Email', acctManage:'Gestisci', acctWebsite:'Vai al sito',
                acctSignOut:'Esci', acctSignIn:'Accedi', acctSignedOutMsg:'Non hai effettuato l’accesso a FolderTube.',
                acctLoading:'Caricamento…', renewalPrefix:'Il tuo piano si rinnova automaticamente il', addToFolder:'Aggiungi alla cartella',
            },
            ru: { rtl:false,
                tabGeneral:'Общие', tabFolders:'Папки', tabChannels:'Каналы', tabAccount:'Аккаунт',
                titleGeneral:'Общие', titleFolders:'Управление папками', titleChannels:'Назначение каналов', titleAccount:'Аккаунт',
                labelLanguage:'Язык', descLanguage:'Определяется автоматически из настроек YouTube',
                labelImportFolders:'Импорт папок', descImportFolders:'Восстановить структуру папок и назначения каналов из резервной копии',
                labelImportSubs:'Импорт подписок', descImportSubs:'Восстановить список подписок из резервной копии',
                labelExportFolders:'Экспорт папок', descExportFolders:'Сохранить структуру папок и назначения каналов в файл .json',
                labelExportSubs:'Экспорт подписок', descExportSubs:'Сохранить список подписок в файл .json',
                btnImport:'Импорт', btnExport:'Экспорт',
                phFolderTitle:'Управление папками', phFolderDesc:'Создавайте, переименовывайте, переупорядочивайте и удаляйте папки прямо из этой панели. Пока используйте боковую панель YouTube.',
                phComingSoon:'Скоро', searchPlaceholder:'Поиск каналов…',
                sectionBrowse:'Обзор подписок', chSubtitle:'YouTube-канал',
                chEmpty:'Подписки ещё не загружены.\nСначала откройте YouTube, чтобы загрузить список каналов.',
                chNoMatch:'Каналы не найдены', chipAll:'Все', chipUncategorized:'Без категории',
                acctName:'Имя', acctEmail:'Эл. почта', acctManage:'Управление', acctWebsite:'Перейти на сайт',
                acctSignOut:'Выйти', acctSignIn:'Войти', acctSignedOutMsg:'Вы не вошли в FolderTube.',
                acctLoading:'Загрузка…', renewalPrefix:'Ваш тариф автоматически продлится', addToFolder:'Добавить в папку',
            },
            tr: { rtl:false,
                tabGeneral:'Genel', tabFolders:'Klasörler', tabChannels:'Kanallar', tabAccount:'Hesap',
                titleGeneral:'Genel', titleFolders:'Klasörleri Yönet', titleChannels:'Kanal Atamaları', titleAccount:'Hesap',
                labelLanguage:'Dil', descLanguage:'YouTube ayarlarınızdan otomatik olarak algılandı',
                labelImportFolders:'Klasörleri İçe Aktar', descImportFolders:'Klasör yapısını ve kanal atamalarını yedekten geri yükle',
                labelImportSubs:'Abonelikleri İçe Aktar', descImportSubs:'Abonelik listeni yedekten geri yükle',
                labelExportFolders:'Klasörleri Dışa Aktar', descExportFolders:'Klasör yapısını ve kanal atamalarını .json dosyasına kaydet',
                labelExportSubs:'Abonelikleri Dışa Aktar', descExportSubs:'Abonelik listeni .json dosyasına kaydet',
                btnImport:'İçe Aktar', btnExport:'Dışa Aktar',
                phFolderTitle:'Klasör Yönetimi', phFolderDesc:'Klasörleri doğrudan bu panelden oluşturun, yeniden adlandırın, yeniden sıralayın ve silin. Şim dilik YouTube kenar çubuğunu kullanın.',
                phComingSoon:'Yakında', searchPlaceholder:'Kanal ara…',
                sectionBrowse:'Aboneliklere Göz At', chSubtitle:'YouTube Kanalı',
                chEmpty:'Henüz abonelik yüklenmedi.\nKanal listenizi yüklemek için önce YouTube’a göz atın.',
                chNoMatch:'Eşleşen kanal yok', chipAll:'Tümü', chipUncategorized:'Kategorisiz',
                acctName:'Ad', acctEmail:'E-posta', acctManage:'Yönet', acctWebsite:'Web Sitesine Git',
                acctSignOut:'Çıkış Yap', acctSignIn:'Giriş Yap', acctSignedOutMsg:"FolderTube'a giriş yapmadınız.",
                acctLoading:'Yükleniyor…', renewalPrefix:'Planınız otomatik olarak yenileniyor:', addToFolder:'Klasöre Ekle',
            },
            ja: { rtl:false,
                tabGeneral:'一般', tabFolders:'フォルダー', tabChannels:'チャンネル', tabAccount:'アカウント',
                titleGeneral:'一般', titleFolders:'フォルダーの管理', titleChannels:'チャンネルの割り当て', titleAccount:'アカウント',
                labelLanguage:'言語', descLanguage:'YouTubeの設定から自動検出されました',
                labelImportFolders:'フォルダーのインポート', descImportFolders:'バックアップからフォルダー構造とチャンネル割り当てを復元',
                labelImportSubs:'チャンネル登録のインポート', descImportSubs:'バックアップからチャンネル登録リストを復元',
                labelExportFolders:'フォルダーのエクスポート', descExportFolders:'フォルダー構造とチャンネル割り当てを.jsonファイルとして保存',
                labelExportSubs:'チャンネル登録のエクスポート', descExportSubs:'チャンネル登録リストを.jsonファイルとして保存',
                btnImport:'インポート', btnExport:'エクスポート',
                phFolderTitle:'フォルダー管理', phFolderDesc:'このパネルから直接フォルダーの作成、名前変更、並び替え、削除を行えます。今はYouTubeのサイドバーを使用してください。',
                phComingSoon:'近日公開', searchPlaceholder:'チャンネルを検索…',
                sectionBrowse:'チャンネル登録を閲覧', chSubtitle:'YouTubeチャンネル',
                chEmpty:'チャンネル登録がまだ読み込まれていません。\nYouTubeを閲覧してチャンネルリストを読み込んでください。',
                chNoMatch:'一致するチャンネルがありません', chipAll:'すべて', chipUncategorized:'未分類',
                acctName:'名前', acctEmail:'メール', acctManage:'管理', acctWebsite:'ウェブサイトへ',
                acctSignOut:'サインアウト', acctSignIn:'サインイン', acctSignedOutMsg:'FolderTubeにサインインしていません。',
                acctLoading:'読み込み中…', renewalPrefix:'プランの自動更新日：', addToFolder:'フォルダーに追加',
            },
            ko: { rtl:false,
                tabGeneral:'일반', tabFolders:'폴더', tabChannels:'싱년', tabAccount:'계정',
                titleGeneral:'일반', titleFolders:'폴더 관리', titleChannels:'싱년 할당', titleAccount:'계정',
                labelLanguage:'언어', descLanguage:'YouTube 설정에서 자동 감지됨',
                labelImportFolders:'폴더 가져오기', descImportFolders:'백업에서 폴더 구조 및 싱년 할당 복원',
                labelImportSubs:'구독 가져오기', descImportSubs:'백업에서 구독 목록 복원',
                labelExportFolders:'폴더 내보내기', descExportFolders:'폴더 구조 및 싱년 할당을 .json 파일로 저장',
                labelExportSubs:'구독 내보내기', descExportSubs:'구독 목록을 .json 파일로 저장',
                btnImport:'가져오기', btnExport:'내보내기',
                phFolderTitle:'폴더 관리', phFolderDesc:'이 패널에서 직접 폴더를 만들고, 이름을 바꾸고, 순서를 변경하고, 삭제하세요. 지금은 YouTube 사이드바를 사용하세요.',
                phComingSoon:'출시 예정', searchPlaceholder:'싱년 검색…',
                sectionBrowse:'구독 둘러보기', chSubtitle:'YouTube 싱년',
                chEmpty:'구독 목록이 아직 로드되지 않았습니다.\nYouTube를 먼저 탐색하여 싱년 목록을 로드하세요.',
                chNoMatch:'일치하는 싱년 없음', chipAll:'전체', chipUncategorized:'미분류',
                acctName:'이름', acctEmail:'이메일', acctManage:'관리', acctWebsite:'웹사이트로 이동',
                acctSignOut:'로그아웃', acctSignIn:'로그인', acctSignedOutMsg:'FolderTube에 로그인되어 있지 않습니다.',
                acctLoading:'로드 중…', renewalPrefix:'플랜 자동 갱신일:', addToFolder:'폴더에 추가',
            },
            zh: { rtl:false,
                tabGeneral:'常规', tabFolders:'文件夹', tabChannels:'频道', tabAccount:'账户',
                titleGeneral:'常规', titleFolders:'管理文件夹', titleChannels:'频道分配', titleAccount:'账户',
                labelLanguage:'语言', descLanguage:'自动从您的 YouTube 设置中检测',
                labelImportFolders:'导入文件夹', descImportFolders:'从备份中恢复文件夹结构和频道分配',
                labelImportSubs:'导入订阅', descImportSubs:'从备份中恢复订阅列表',
                labelExportFolders:'导出文件夹', descExportFolders:'将文件夹结构和频道分配保存为 .json 文件',
                labelExportSubs:'导出订阅', descExportSubs:'将订阅列表保存为 .json 文件',
                btnImport:'导入', btnExport:'导出',
                phFolderTitle:'文件夹管理', phFolderDesc:'直接从此面板创建、重命名、重新排序和删除文件夹。现在请使用 YouTube 侧边栏。',
                phComingSoon:'即将推出', searchPlaceholder:'搜索频道…',
                sectionBrowse:'浏览订阅', chSubtitle:'YouTube 频道',
                chEmpty:'尚未加载订阅。\n请先浏览 YouTube 以加载您的频道列表。',
                chNoMatch:'没有匹配的频道', chipAll:'全部', chipUncategorized:'未分类',
                acctName:'姓名', acctEmail:'邮筱', acctManage:'管理', acctWebsite:'前往网站',
                acctSignOut:'退出登录', acctSignIn:'登录', acctSignedOutMsg:'您尚未登录 FolderTube。',
                acctLoading:'加载中…', renewalPrefix:'您的套餐将于以下日期自动续费：', addToFolder:'添加到文件夹',
            },
            'zh-TW': { rtl:false,
                tabGeneral:'一般', tabFolders:'資料夾', tabChannels:'頻道', tabAccount:'帳戶',
                titleGeneral:'一般', titleFolders:'管理資料夾', titleChannels:'頻道分配', titleAccount:'帳戶',
                labelLanguage:'語言', descLanguage:'自動從您的 YouTube 設定偵測',
                labelImportFolders:'匯入資料夾', descImportFolders:'從備份還原資料夾結構和頻道分配',
                labelImportSubs:'匯入訂閱', descImportSubs:'從備份還原訂閱清單',
                labelExportFolders:'匯出資料夾', descExportFolders:'將資料夾結構和頻道分配儲存為 .json 檔案',
                labelExportSubs:'匯出訂閱', descExportSubs:'將訂閱清單儲存為 .json 檔案',
                btnImport:'匯入', btnExport:'匯出',
                phFolderTitle:'資料夾管理', phFolderDesc:'直接從此面板建立、重新命名、重新排序和刪除資料夾。請使用 YouTube 側邊欄。',
                phComingSoon:'即將推出', searchPlaceholder:'搜尋頻道…',
                sectionBrowse:'瀏覽訂閱', chSubtitle:'YouTube 頻道',
                chEmpty:'尚未載入訂閱。\n請先瀏覽 YouTube 以載入您的頻道清單。',
                chNoMatch:'沒有符合的頻道', chipAll:'全部', chipUncategorized:'未分類',
                acctName:'姓名', acctEmail:'電子郵件', acctManage:'管理', acctWebsite:'前往網站',
                acctSignOut:'登出', acctSignIn:'登入', acctSignedOutMsg:'您尚未登入 FolderTube。',
                acctLoading:'載入中…', renewalPrefix:'您的方案將於以下日期自動續約：', addToFolder:'加入資料夾',
            },
            nl: { rtl:false,
                tabGeneral:'Algemeen', tabFolders:'Mappen', tabChannels:'Kanalen', tabAccount:'Account',
                titleGeneral:'Algemeen', titleFolders:'Mappen beheren', titleChannels:'Kanaaltoewijzing', titleAccount:'Account',
                labelLanguage:'Taal', descLanguage:'Wordt automatisch gedetecteerd vanuit uw YouTube-instellingen',
                labelImportFolders:'Mappen importeren', descImportFolders:'Mappenstructuur en kanaaltoewijzingen herstellen vanuit back-up',
                labelImportSubs:'Abonnementen importeren', descImportSubs:'Abonnementenlijst herstellen vanuit back-up',
                labelExportFolders:'Mappen exporteren', descExportFolders:'Mappenstructuur en kanaaltoewijzingen opslaan als .json',
                labelExportSubs:'Abonnementen exporteren', descExportSubs:'Abonnementenlijst opslaan als .json',
                btnImport:'Importeren', btnExport:'Exporteren',
                phFolderTitle:'Mapbeheer', phFolderDesc:'Maak mappen aan, hernoem, orden en verwijder ze rechtstreeks vanuit dit paneel. Gebruik nu de YouTube-zijbalk.',
                phComingSoon:'Binnenkort beschikbaar', searchPlaceholder:'Kanalen zoeken…',
                sectionBrowse:'Abonnementen bekijken', chSubtitle:'YouTube-kanaal',
                chEmpty:'Nog geen abonnementen geladen.\nBlader eerst door YouTube om uw kanalenlijst te laden.',
                chNoMatch:'Geen overeenkomende kanalen', chipAll:'Alle', chipUncategorized:'Niet gecategoriseerd',
                acctName:'Naam', acctEmail:'E-mail', acctManage:'Beheren', acctWebsite:'Ga naar website',
                acctSignOut:'Afmelden', acctSignIn:'Aanmelden', acctSignedOutMsg:'U bent niet aangemeld bij FolderTube.',
                acctLoading:'Laden…', renewalPrefix:'Uw abonnement wordt automatisch verlengd op:', addToFolder:'Toevoegen aan map',
            },
            pl: { rtl:false,
                tabGeneral:'Ogólne', tabFolders:'Foldery', tabChannels:'Kanały', tabAccount:'Konto',
                titleGeneral:'Ogólne', titleFolders:'Zarządzaj folderami', titleChannels:'Przypisanie kanałów', titleAccount:'Konto',
                labelLanguage:'Język', descLanguage:'Wykrywany automatycznie z ustawień YouTube',
                labelImportFolders:'Importuj foldery', descImportFolders:'Przywróć strukturę folderów i przypisania kanałów z kopii zapasowej',
                labelImportSubs:'Importuj subskrypcje', descImportSubs:'Przywróć listę subskrypcji z kopii zapasowej',
                labelExportFolders:'Eksportuj foldery', descExportFolders:'Zapisz strukturę folderów i przypisania kanałów jako .json',
                labelExportSubs:'Eksportuj subskrypcje', descExportSubs:'Zapisz listę subskrypcji jako .json',
                btnImport:'Importuj', btnExport:'Eksportuj',
                phFolderTitle:'Zarządzanie folderami', phFolderDesc:'Twórz, zmieniaj nazwy, porządkuj i usuwaj foldery bezpośrednio z tego panelu. Użyj paska bocznego YouTube.',
                phComingSoon:'Wkrótce', searchPlaceholder:'Szukaj kanałów…',
                sectionBrowse:'Przeglądaj subskrypcje', chSubtitle:'Kanał YouTube',
                chEmpty:'Subskrypcje nie zostały jeszcze załadowane.\nPrzeglądaj YouTube, aby załadować listę kanałów.',
                chNoMatch:'Brak pasujących kanałów', chipAll:'Wszystkie', chipUncategorized:'Bez kategorii',
                acctName:'Imię', acctEmail:'E-mail', acctManage:'Zarządzaj', acctWebsite:'Przejdź do strony',
                acctSignOut:'Wyloguj', acctSignIn:'Zaloguj', acctSignedOutMsg:'Nie jesteś zalogowany(-a) do FolderTube.',
                acctLoading:'Ładowanie…', renewalPrefix:'Twój plan zostanie automatycznie odnowiony:', addToFolder:'Dodaj do folderu',
            },
            sv: { rtl:false,
                tabGeneral:'Allmänt', tabFolders:'Mappar', tabChannels:'Kanaler', tabAccount:'Konto',
                titleGeneral:'Allmänt', titleFolders:'Hantera mappar', titleChannels:'Kanaltilldelning', titleAccount:'Konto',
                labelLanguage:'Språk', descLanguage:'Identifieras automatiskt från dina YouTube-inställningar',
                labelImportFolders:'Importera mappar', descImportFolders:'Återställ mappstruktur och kanaltilldelningar från säkerhetskopia',
                labelImportSubs:'Importera prenumerationer', descImportSubs:'Återställ prenumerationslista från säkerhetskopia',
                labelExportFolders:'Exportera mappar', descExportFolders:'Spara mappstruktur och kanaltilldelningar som .json',
                labelExportSubs:'Exportera prenumerationer', descExportSubs:'Spara prenumerationslista som .json',
                btnImport:'Importera', btnExport:'Exportera',
                phFolderTitle:'Mapphantering', phFolderDesc:'Skapa, byt namn, ordna och ta bort mappar direkt från den här panelen. Använd nu YouTube-sidofältet.',
                phComingSoon:'Kommer snart', searchPlaceholder:'Sök kanaler…',
                sectionBrowse:'Bläddra bland prenumerationer', chSubtitle:'YouTube-kanal',
                chEmpty:'Inga prenumerationer har laddats ännu.\nBläddra i YouTube för att ladda din kanallista.',
                chNoMatch:'Inga matchande kanaler', chipAll:'Alla', chipUncategorized:'Okategoriserade',
                acctName:'Namn', acctEmail:'E-post', acctManage:'Hantera', acctWebsite:'Gå till webbplatsen',
                acctSignOut:'Logga ut', acctSignIn:'Logga in', acctSignedOutMsg:'Du är inte inloggad på FolderTube.',
                acctLoading:'Laddar…', renewalPrefix:'Din plan förnyas automatiskt den:', addToFolder:'Lägg till i mapp',
            },
            da: { rtl:false,
                tabGeneral:'Generelt', tabFolders:'Mapper', tabChannels:'Kanaler', tabAccount:'Konto',
                titleGeneral:'Generelt', titleFolders:'Administrer mapper', titleChannels:'Kanaltildeling', titleAccount:'Konto',
                labelLanguage:'Sprog', descLanguage:'Registreres automatisk fra dine YouTube-indstillinger',
                labelImportFolders:'Importer mapper', descImportFolders:'Gendan mappestruktur og kanaltildelinger fra sikkerhedskopi',
                labelImportSubs:'Importer abonnementer', descImportSubs:'Gendan abonnementsliste fra sikkerhedskopi',
                labelExportFolders:'Eksporter mapper', descExportFolders:'Gem mappestruktur og kanaltildelinger som .json',
                labelExportSubs:'Eksporter abonnementer', descExportSubs:'Gem abonnementsliste som .json',
                btnImport:'Importer', btnExport:'Eksporter',
                phFolderTitle:'Mappestyring', phFolderDesc:'Opret, omdøb, sorter og slet mapper direkte fra dette panel. Brug nu YouTube-sidebjælken.',
                phComingSoon:'Kommer snart', searchPlaceholder:'Søg kanaler…',
                sectionBrowse:'Gennemse abonnementer', chSubtitle:'YouTube-kanal',
                chEmpty:'Ingen abonnementer er indlæst endnu.\nGennemse YouTube for at indlæse din kanalliste.',
                chNoMatch:'Ingen matchende kanaler', chipAll:'Alle', chipUncategorized:'Ukategoriserede',
                acctName:'Navn', acctEmail:'E-mail', acctManage:'Administrer', acctWebsite:'Gå til webstedet',
                acctSignOut:'Log ud', acctSignIn:'Log ind', acctSignedOutMsg:'Du er ikke logget ind på FolderTube.',
                acctLoading:'Indlæser…', renewalPrefix:'Din plan fornyes automatisk den:', addToFolder:'Tilføj til mappe',
            },
            fi: { rtl:false,
                tabGeneral:'Yleiset', tabFolders:'Kansiot', tabChannels:'Kanavat', tabAccount:'Tili',
                titleGeneral:'Yleiset', titleFolders:'Hallitse kansioita', titleChannels:'Kanavan määritys', titleAccount:'Tili',
                labelLanguage:'Kieli', descLanguage:'Havaitaan automaattisesti YouTube-asetuksistasi',
                labelImportFolders:'Tuo kansiot', descImportFolders:'Palauta kansiorakenne ja kanavan määritykset varmuuskopiosta',
                labelImportSubs:'Tuo tilaukset', descImportSubs:'Palauta tilauslista varmuuskopiosta',
                labelExportFolders:'Vie kansiot', descExportFolders:'Tallenna kansiorakenne ja kanavan määritykset .json-tiedostona',
                labelExportSubs:'Vie tilaukset', descExportSubs:'Tallenna tilauslista .json-tiedostona',
                btnImport:'Tuo', btnExport:'Vie',
                phFolderTitle:'Kansionhallinta', phFolderDesc:'Luo, nimeä uudelleen, järjestä ja poista kansioita suoraan tästä paneelista. Käytä nyt YouTube-sivupaneelia.',
                phComingSoon:'Tulossa pian', searchPlaceholder:'Hae kanavia…',
                sectionBrowse:'Selaa tilauksia', chSubtitle:'YouTube-kanava',
                chEmpty:'Tilauksia ei ole vielä ladattu.\nSelaa YouTubea ladataksesi kanavaluettelosi.',
                chNoMatch:'Ei vastaavia kanavia', chipAll:'Kaikki', chipUncategorized:'Luokittelematon',
                acctName:'Nimi', acctEmail:'Sähköposti', acctManage:'Hallitse', acctWebsite:'Siirry verkkosivustolle',
                acctSignOut:'Kirjaudu ulos', acctSignIn:'Kirjaudu sisään', acctSignedOutMsg:'Et ole kirjautunut FolderTubeen.',
                acctLoading:'Ladataan…', renewalPrefix:'Tilauksesi uusitaan automaattisesti:', addToFolder:'Lisää kansioon',
            },
            nb: { rtl:false,
                tabGeneral:'Generelt', tabFolders:'Mapper', tabChannels:'Kanaler', tabAccount:'Konto',
                titleGeneral:'Generelt', titleFolders:'Administrer mapper', titleChannels:'Kanaltildeling', titleAccount:'Konto',
                labelLanguage:'Språk', descLanguage:'Registreres automatisk fra YouTube-innstillingene dine',
                labelImportFolders:'Importer mapper', descImportFolders:'Gjenopprett mappestruktur og kanaltildelinger fra sikkerhetskopi',
                labelImportSubs:'Importer abonnementer', descImportSubs:'Gjenopprett abonnementsliste fra sikkerhetskopi',
                labelExportFolders:'Eksporter mapper', descExportFolders:'Lagre mappestruktur og kanaltildelinger som .json',
                labelExportSubs:'Eksporter abonnementer', descExportSubs:'Lagre abonnementsliste som .json',
                btnImport:'Importer', btnExport:'Eksporter',
                phFolderTitle:'Mappeadministrasjon', phFolderDesc:'Opprett, gi nytt navn til, sorter og slett mapper direkte fra dette panelet. Bruk nå YouTube-sidefeltet.',
                phComingSoon:'Kommer snart', searchPlaceholder:'Søk etter kanaler…',
                sectionBrowse:'Bla gjennom abonnementer', chSubtitle:'YouTube-kanal',
                chEmpty:'Ingen abonnementer er lastet inn ennå.\nBla gjennom YouTube for å laste inn kanallisten din.',
                chNoMatch:'Ingen samsvarende kanaler', chipAll:'Alle', chipUncategorized:'Ukategorisert',
                acctName:'Navn', acctEmail:'E-post', acctManage:'Administrer', acctWebsite:'Gå til nettstedet',
                acctSignOut:'Logg ut', acctSignIn:'Logg inn', acctSignedOutMsg:'Du er ikke logget inn på FolderTube.',
                acctLoading:'Laster…', renewalPrefix:'Planen din fornyes automatisk den:', addToFolder:'Legg til i mappe',
            },
            cs: { rtl:false,
                tabGeneral:'Obecné', tabFolders:'Složky', tabChannels:'Kanály', tabAccount:'Účet',
                titleGeneral:'Obecné', titleFolders:'Správa složek', titleChannels:'Přiřazení kanálů', titleAccount:'Účet',
                labelLanguage:'Jazyk', descLanguage:'Automaticky detekován z nastavení YouTube',
                labelImportFolders:'Importovat složky', descImportFolders:'Obnovit strukturu složek a přiřazení kanálů ze zálohy',
                labelImportSubs:'Importovat odběry', descImportSubs:'Obnovit seznam odběrů ze zálohy',
                labelExportFolders:'Exportovat složky', descExportFolders:'Uložit strukturu složek a přiřazení kanálů jako .json',
                labelExportSubs:'Exportovat odběry', descExportSubs:'Uložit seznam odběrů jako .json',
                btnImport:'Importovat', btnExport:'Exportovat',
                phFolderTitle:'Správa složek', phFolderDesc:'Vytvářejte, přejmenujte, seřaďte a odstraňte složky přímo z tohoto panelu. Nyní použijte boční panel YouTube.',
                phComingSoon:'Brzy k dispozici', searchPlaceholder:'Hledat kanály…',
                sectionBrowse:'Procházet odběry', chSubtitle:'Kanál YouTube',
                chEmpty:'Odběry ještě nebyly načteny.\nProcházejte YouTube a načtěte seznam kanálů.',
                chNoMatch:'Žádné odpovídající kanály', chipAll:'Vše', chipUncategorized:'Nezařazené',
                acctName:'Jméno', acctEmail:'E-mail', acctManage:'Spravovat', acctWebsite:'Přejít na web',
                acctSignOut:'Odhlásit', acctSignIn:'Přihlásit', acctSignedOutMsg:'Nejste přihlášeni do FolderTube.',
                acctLoading:'Načítání…', renewalPrefix:'Váš plán se automaticky obnoví:', addToFolder:'Přidat do složky',
            },
            hu: { rtl:false,
                tabGeneral:'Általános', tabFolders:'Mappák', tabChannels:'Csatornák', tabAccount:'Fiók',
                titleGeneral:'Általános', titleFolders:'Mappák kezelése', titleChannels:'Csatornakiosztás', titleAccount:'Fiók',
                labelLanguage:'Nyelv', descLanguage:'Automatikusan felismerve a YouTube-beállításokból',
                labelImportFolders:'Mappák importálása', descImportFolders:'Mappaszerkezet és csatornakiosztások visszaállítása biztonsági mentésből',
                labelImportSubs:'Feliratkozások importálása', descImportSubs:'Feliratkozások listájának visszaállítása biztonsági mentésből',
                labelExportFolders:'Mappák exportálása', descExportFolders:'Mappaszerkezet és csatornakiosztások mentése .json fájlként',
                labelExportSubs:'Feliratkozások exportálása', descExportSubs:'Feliratkozások listájának mentése .json fájlként',
                btnImport:'Importálás', btnExport:'Exportálás',
                phFolderTitle:'Mappakezelés', phFolderDesc:'Hozzon létre, nevezze át, rendezze és törölje a mappákat közvetlenül ebből a panelből. Most használja a YouTube oldalsávját.',
                phComingSoon:'Hamarosan', searchPlaceholder:'Csatornák keresése…',
                sectionBrowse:'Feliratkozások böngészése', chSubtitle:'YouTube csatorna',
                chEmpty:'A feliratkozások még nem töltődtek be.\nBöngésszen a YouTube-on a csatornalista betöltéséhez.',
                chNoMatch:'Nincs egyező csatorna', chipAll:'Mind', chipUncategorized:'Kategorizálatlan',
                acctName:'Név', acctEmail:'E-mail', acctManage:'Kezelés', acctWebsite:'Ugrás a weboldalra',
                acctSignOut:'Kijelentkezés', acctSignIn:'Bejelentkezés', acctSignedOutMsg:'Nincs bejelentkezve a FolderTube-ba.',
                acctLoading:'Betöltés…', renewalPrefix:'Az előfizetése automatikusan megújul:', addToFolder:'Hozzáadás mappához',
            },
            ro: { rtl:false,
                tabGeneral:'General', tabFolders:'Dosare', tabChannels:'Canale', tabAccount:'Cont',
                titleGeneral:'General', titleFolders:'Gestionare dosare', titleChannels:'Atribuire canale', titleAccount:'Cont',
                labelLanguage:'Limbă', descLanguage:'Detectată automat din setările YouTube',
                labelImportFolders:'Import dosare', descImportFolders:'Restaurați structura dosarelor și atribuirile de canale din copie de rezervă',
                labelImportSubs:'Import abonamente', descImportSubs:'Restaurați lista de abonamente din copie de rezervă',
                labelExportFolders:'Export dosare', descExportFolders:'Salvați structura dosarelor și atribuirile de canale ca .json',
                labelExportSubs:'Export abonamente', descExportSubs:'Salvați lista de abonamente ca .json',
                btnImport:'Import', btnExport:'Export',
                phFolderTitle:'Gestionare dosare', phFolderDesc:'Creați, redenumiți, reordonați și ștergeți dosare direct din acest panou. Utilizați acum bara laterală YouTube.',
                phComingSoon:'În curând', searchPlaceholder:'Căutați canale…',
                sectionBrowse:'Răsfoiți abonamentele', chSubtitle:'Canal YouTube',
                chEmpty:'Niciun abonament nu a fost încărcat.\nNavigați pe YouTube pentru a încărca lista de canale.',
                chNoMatch:'Niciun canal potrivit', chipAll:'Toate', chipUncategorized:'Necategorizate',
                acctName:'Nume', acctEmail:'E-mail', acctManage:'Gestionare', acctWebsite:'Mergeți la site',
                acctSignOut:'Deconectare', acctSignIn:'Conectare', acctSignedOutMsg:'Nu sunteți conectat la FolderTube.',
                acctLoading:'Se încarcă…', renewalPrefix:'Abonamentul dvs. se va reînnoi automat la:', addToFolder:'Adaugă în dosar',
            },
            el: { rtl:false,
                tabGeneral:'Γενικά', tabFolders:'Φάκελοι', tabChannels:'Κανάλια', tabAccount:'Λογαριασμός',
                titleGeneral:'Γενικά', titleFolders:'Διαχείριση φακέλων', titleChannels:'Ανάθεση καναλιών', titleAccount:'Λογαριασμός',
                labelLanguage:'Γλώσσα', descLanguage:'Εντοπίζεται αυτόματα από τις ρυθμίσεις YouTube',
                labelImportFolders:'Εισαγωγή φακέλων', descImportFolders:'Επαναφορά δομής φακέλων και αναθέσεων καναλιών από αντίγραφο ασφαλείας',
                labelImportSubs:'Εισαγωγή συνδρομών', descImportSubs:'Επαναφορά λίστας συνδρομών από αντίγραφο ασφαλείας',
                labelExportFolders:'Εξαγωγή φακέλων', descExportFolders:'Αποθήκευση δομής φακέλων και αναθέσεων καναλιών ως .json',
                labelExportSubs:'Εξαγωγή συνδρομών', descExportSubs:'Αποθήκευση λίστας συνδρομών ως .json',
                btnImport:'Εισαγωγή', btnExport:'Εξαγωγή',
                phFolderTitle:'Διαχείριση φακέλων', phFolderDesc:'Δημιουργήστε, μετονομάστε, ταξινομήστε και διαγράψτε φακέλους απευθείας από αυτό το πλαίσιο. Χρησιμοποιήστε τώρα την πλαϊνή γραμμή YouTube.',
                phComingSoon:'Έρχεται σύντομα', searchPlaceholder:'Αναζήτηση καναλιών…',
                sectionBrowse:'Περιήγηση συνδρομών', chSubtitle:'Κανάλι YouTube',
                chEmpty:'Δεν έχουν φορτωθεί ακόμη συνδρομές.\nΠεριηγηθείτε στο YouTube για να φορτώσετε τη λίστα καναλιών σας.',
                chNoMatch:'Δεν βρέθηκαν αντίστοιχα κανάλια', chipAll:'Όλα', chipUncategorized:'Χωρίς κατηγορία',
                acctName:'Όνομα', acctEmail:'E-mail', acctManage:'Διαχείριση', acctWebsite:'Μετάβαση στον ιστότοπο',
                acctSignOut:'Αποσύνδεση', acctSignIn:'Σύνδεση', acctSignedOutMsg:'Δεν είστε συνδεδεμένοι στο FolderTube.',
                acctLoading:'Φόρτωση…', renewalPrefix:'Το πρόγραμμά σας θα ανανεωθεί αυτόματα στις:', addToFolder:'Προσθήκη σε φάκελο',
            },
            he: { rtl:true,
                tabGeneral:'כללי', tabFolders:'תיקיות', tabChannels:'ערוצים', tabAccount:'חשבון',
                titleGeneral:'כללי', titleFolders:'ניהול תיקיות', titleChannels:'הקצאת ערוצים', titleAccount:'חשבון',
                labelLanguage:'שפה', descLanguage:'מזוהה אוטומטית מהגדרות YouTube שלך',
                labelImportFolders:'ייבוא תיקיות', descImportFolders:'שחזר מבנה תיקיות והקצאות ערוצים מגיבוי',
                labelImportSubs:'ייבוא מינויים', descImportSubs:'שחזר את רשימת המינויים מגיבוי',
                labelExportFolders:'ייצוא תיקיות', descExportFolders:'שמור מבנה תיקיות והקצאות ערוצים כ-.json',
                labelExportSubs:'ייצוא מינויים', descExportSubs:'שמור את רשימת המינויים כ-.json',
                btnImport:'ייבוא', btnExport:'ייצוא',
                phFolderTitle:'ניהול תיקיות', phFolderDesc:'צור, שנה שם, סדר ומחק תיקיות ישירות מחלונית זו. השתמש כעת בסרגל הצד של YouTube.',
                phComingSoon:'בקרוב', searchPlaceholder:'חפש ערוצים…',
                sectionBrowse:'עיין במינויים', chSubtitle:'ערוץ YouTube',
                chEmpty:'טרם נטענו מינויים.\nעיין ב-YouTube כדי לטעון את רשימת הערוצים שלך.',
                chNoMatch:'לא נמצאו ערוצים תואמים', chipAll:'הכל', chipUncategorized:'לא מסווג',
                acctName:'שם', acctEmail:'דוא"ל', acctManage:'ניהול', acctWebsite:'עבור לאתר',
                acctSignOut:'התנתק', acctSignIn:'התחבר', acctSignedOutMsg:'אינך מחובר ל-FolderTube.',
                acctLoading:'טוען…', renewalPrefix:'המינוי שלך יתחדש אוטומטית ב:', addToFolder:'הוסף לתיקייה',
            },
            iw: { rtl:true,
                tabGeneral:'כללי', tabFolders:'תיקיות', tabChannels:'ערוצים', tabAccount:'חשבון',
                titleGeneral:'כללי', titleFolders:'ניהול תיקיות', titleChannels:'הקצאת ערוצים', titleAccount:'חשבון',
                labelLanguage:'שפה', descLanguage:'מזוהה אוטומטית מהגדרות YouTube שלך',
                labelImportFolders:'ייבוא תיקיות', descImportFolders:'שחזר מבנה תיקיות והקצאות ערוצים מגיבוי',
                labelImportSubs:'ייבוא מינויים', descImportSubs:'שחזר את רשימת המינויים מגיבוי',
                labelExportFolders:'ייצוא תיקיות', descExportFolders:'שמור מבנה תיקיות והקצאות ערוצים כ-.json',
                labelExportSubs:'ייצוא מינויים', descExportSubs:'שמור את רשימת המינויים כ-.json',
                btnImport:'ייבוא', btnExport:'ייצוא',
                phFolderTitle:'ניהול תיקיות', phFolderDesc:'צור, שנה שם, סדר ומחק תיקיות ישירות מחלונית זו. השתמש כעת בסרגל הצד של YouTube.',
                phComingSoon:'בקרוב', searchPlaceholder:'חפש ערוצים…',
                sectionBrowse:'עיין במינויים', chSubtitle:'ערוץ YouTube',
                chEmpty:'טרם נטענו מינויים.\nעיין ב-YouTube כדי לטעון את רשימת הערוצים שלך.',
                chNoMatch:'לא נמצאו ערוצים תואמים', chipAll:'הכל', chipUncategorized:'לא מסווג',
                acctName:'שם', acctEmail:'דוא"ל', acctManage:'ניהול', acctWebsite:'עבור לאתר',
                acctSignOut:'התנתק', acctSignIn:'התחבר', acctSignedOutMsg:'אינך מחובר ל-FolderTube.',
                acctLoading:'טוען…', renewalPrefix:'המינוי שלך יתחדש אוטומטית ב:', addToFolder:'הוסף לתיקייה',
            },
            uk: { rtl:false,
                tabGeneral:'Загальні', tabFolders:'Папки', tabChannels:'Канали', tabAccount:'Акаунт',
                titleGeneral:'Загальні', titleFolders:'Керування папками', titleChannels:'Призначення каналів', titleAccount:'Акаунт',
                labelLanguage:'Мова', descLanguage:'Автоматично визначається з налаштувань YouTube',
                labelImportFolders:'Імпорт папок', descImportFolders:'Відновити структуру папок і призначення каналів з резервної копії',
                labelImportSubs:'Імпорт підписок', descImportSubs:'Відновити список підписок з резервної копії',
                labelExportFolders:'Експорт папок', descExportFolders:'Зберегти структуру папок і призначення каналів як .json',
                labelExportSubs:'Експорт підписок', descExportSubs:'Зберегти список підписок як .json',
                btnImport:'Імпорт', btnExport:'Експорт',
                phFolderTitle:'Керування папками', phFolderDesc:'Створюйте, перейменовуйте, сортуйте та видаляйте папки безпосередньо з цієї панелі. Тепер використовуйте бічну панель YouTube.',
                phComingSoon:'Незабаром', searchPlaceholder:'Пошук каналів…',
                sectionBrowse:'Переглядати підписки', chSubtitle:'Канал YouTube',
                chEmpty:'Підписки ще не завантажено.\nПереглядайте YouTube, щоб завантажити список каналів.',
                chNoMatch:'Відповідних каналів не знайдено', chipAll:'Всі', chipUncategorized:'Без категорії',
                acctName:'Імʼя', acctEmail:'Ел. пошта', acctManage:'Керувати', acctWebsite:'Перейти на сайт',
                acctSignOut:'Вийти', acctSignIn:'Увійти', acctSignedOutMsg:'Ви не увійшли у FolderTube.',
                acctLoading:'Завантаження…', renewalPrefix:'Ваш план автоматично поновиться:', addToFolder:'Додати до папки',
            },
            bg: { rtl:false,
                tabGeneral:'Общи', tabFolders:'Папки', tabChannels:'Канали', tabAccount:'Акаунт',
                titleGeneral:'Общи', titleFolders:'Управление на папки', titleChannels:'Назначаване на канали', titleAccount:'Акаунт',
                labelLanguage:'Език', descLanguage:'Автоматично открива от настройките ви в YouTube',
                labelImportFolders:'Импортиране на папки', descImportFolders:'Възстановете структурата на папките и назначенията на канали от резервно копие',
                labelImportSubs:'Импортиране на абонаменти', descImportSubs:'Възстановете списъка с абонаменти от резервно копие',
                labelExportFolders:'Експортиране на папки', descExportFolders:'Запазете структурата на папките и назначенията на канали като .json',
                labelExportSubs:'Експортиране на абонаменти', descExportSubs:'Запазете списъка с абонаменти като .json',
                btnImport:'Импорт', btnExport:'Експорт',
                phFolderTitle:'Управление на папки', phFolderDesc:'Създавайте, преименувайте, наредете и изтривайте папки директно от този панел. Използвайте страничната лента на YouTube.',
                phComingSoon:'Очаквайте скоро', searchPlaceholder:'Търсете канали…',
                sectionBrowse:'Разглеждане на абонаменти', chSubtitle:'Канал в YouTube',
                chEmpty:'Абонаментите все още не са заредени.\nРазглеждайте YouTube, за да заредите списъка с канали.',
                chNoMatch:'Няма съответстващи канали', chipAll:'Всички', chipUncategorized:'Некатегоризирани',
                acctName:'Име', acctEmail:'Имейл', acctManage:'Управление', acctWebsite:'Към уебсайта',
                acctSignOut:'Изход', acctSignIn:'Вход', acctSignedOutMsg:'Не сте влезли в FolderTube.',
                acctLoading:'Зареждане…', renewalPrefix:'Вашият план ще се поднови автоматично на:', addToFolder:'Добавяне в папка',
            },
            vi: { rtl:false,
                tabGeneral:'Chung', tabFolders:'Thư mục', tabChannels:'Kênh', tabAccount:'Tài khoản',
                titleGeneral:'Chung', titleFolders:'Quản lý thư mục', titleChannels:'Phân công kênh', titleAccount:'Tài khoản',
                labelLanguage:'Ngôn ngữ', descLanguage:'Tự động phát hiện từ cài đặt YouTube của bạn',
                labelImportFolders:'Nhập thư mục', descImportFolders:'Khôi phục cấu trúc thư mục và phân công kênh từ bản sao lưu',
                labelImportSubs:'Nhập đăng ký', descImportSubs:'Khôi phục danh sách đăng ký từ bản sao lưu',
                labelExportFolders:'Xuất thư mục', descExportFolders:'Lưu cấu trúc thư mục và phân công kênh dưới dạng .json',
                labelExportSubs:'Xuất đăng ký', descExportSubs:'Lưu danh sách đăng ký dưới dạng .json',
                btnImport:'Nhập', btnExport:'Xuất',
                phFolderTitle:'Quản lý thư mục', phFolderDesc:'Tạo, đổi tên, sắp xếp và xóa thư mục trực tiếp từ bảng này. Hãy sử dụng thanh bên YouTube.',
                phComingSoon:'Sắp ra mắt', searchPlaceholder:'Tìm kiếm kênh…',
                sectionBrowse:'Duyệt đăng ký', chSubtitle:'Kênh YouTube',
                chEmpty:'Chưa tải đăng ký.\nHãy duyệt YouTube để tải danh sách kênh.',
                chNoMatch:'Không tìm thấy kênh phù hợp', chipAll:'Tất cả', chipUncategorized:'Chưa phân loại',
                acctName:'Tên', acctEmail:'Email', acctManage:'Quản lý', acctWebsite:'Đến trang web',
                acctSignOut:'Đăng xuất', acctSignIn:'Đăng nhập', acctSignedOutMsg:'Bạn chưa đăng nhập FolderTube.',
                acctLoading:'Đang tải…', renewalPrefix:'Gói của bạn sẽ tự động gia hạn vào:', addToFolder:'Thêm vào thư mục',
            },
            id: { rtl:false,
                tabGeneral:'Umum', tabFolders:'Folder', tabChannels:'Saluran', tabAccount:'Akun',
                titleGeneral:'Umum', titleFolders:'Kelola folder', titleChannels:'Penugasan saluran', titleAccount:'Akun',
                labelLanguage:'Bahasa', descLanguage:'Terdeteksi otomatis dari pengaturan YouTube Anda',
                labelImportFolders:'Impor folder', descImportFolders:'Pulihkan struktur folder dan penugasan saluran dari cadangan',
                labelImportSubs:'Impor langganan', descImportSubs:'Pulihkan daftar langganan dari cadangan',
                labelExportFolders:'Ekspor folder', descExportFolders:'Simpan struktur folder dan penugasan saluran sebagai .json',
                labelExportSubs:'Ekspor langganan', descExportSubs:'Simpan daftar langganan sebagai .json',
                btnImport:'Impor', btnExport:'Ekspor',
                phFolderTitle:'Manajemen folder', phFolderDesc:'Buat, ganti nama, urutkan, dan hapus folder langsung dari panel ini. Gunakan bilah samping YouTube sekarang.',
                phComingSoon:'Segera hadir', searchPlaceholder:'Cari saluran…',
                sectionBrowse:'Telusuri langganan', chSubtitle:'Saluran YouTube',
                chEmpty:'Belum ada langganan yang dimuat.\nTelusuri YouTube untuk memuat daftar saluran Anda.',
                chNoMatch:'Tidak ada saluran yang cocok', chipAll:'Semua', chipUncategorized:'Tidak berkategori',
                acctName:'Nama', acctEmail:'Email', acctManage:'Kelola', acctWebsite:'Buka situs web',
                acctSignOut:'Keluar', acctSignIn:'Masuk', acctSignedOutMsg:'Anda belum masuk ke FolderTube.',
                acctLoading:'Memuat…', renewalPrefix:'Paket Anda akan diperbarui secara otomatis pada:', addToFolder:'Tambah ke folder',
            },
            ms: { rtl:false,
                tabGeneral:'Umum', tabFolders:'Folder', tabChannels:'Saluran', tabAccount:'Akaun',
                titleGeneral:'Umum', titleFolders:'Urus folder', titleChannels:'Tugasan saluran', titleAccount:'Akaun',
                labelLanguage:'Bahasa', descLanguage:'Dikesan secara automatik daripada tetapan YouTube anda',
                labelImportFolders:'Import folder', descImportFolders:'Pulihkan struktur folder dan tugasan saluran daripada sandaran',
                labelImportSubs:'Import langganan', descImportSubs:'Pulihkan senarai langganan daripada sandaran',
                labelExportFolders:'Eksport folder', descExportFolders:'Simpan struktur folder dan tugasan saluran sebagai .json',
                labelExportSubs:'Eksport langganan', descExportSubs:'Simpan senarai langganan sebagai .json',
                btnImport:'Import', btnExport:'Eksport',
                phFolderTitle:'Pengurusan folder', phFolderDesc:'Cipta, namakan semula, susun dan padam folder terus dari panel ini. Gunakan bar sisi YouTube sekarang.',
                phComingSoon:'Akan datang', searchPlaceholder:'Cari saluran…',
                sectionBrowse:'Semak imbas langganan', chSubtitle:'Saluran YouTube',
                chEmpty:'Tiada langganan dimuatkan.\nLayari YouTube untuk memuatkan senarai saluran anda.',
                chNoMatch:'Tiada saluran yang sepadan', chipAll:'Semua', chipUncategorized:'Tidak dikategorikan',
                acctName:'Nama', acctEmail:'E-mel', acctManage:'Urus', acctWebsite:'Pergi ke laman web',
                acctSignOut:'Log keluar', acctSignIn:'Log masuk', acctSignedOutMsg:'Anda tidak log masuk ke FolderTube.',
                acctLoading:'Memuatkan…', renewalPrefix:'Pelan anda akan diperbarui secara automatik pada:', addToFolder:'Tambah ke folder',
            },
            th: { rtl:false,
                tabGeneral:'ทั่วไป', tabFolders:'โฟลเดอร์', tabChannels:'ช่อง', tabAccount:'บัญชี',
                titleGeneral:'ทั่วไป', titleFolders:'จัดการโฟลเดอร์', titleChannels:'กำหนดช่อง', titleAccount:'บัญชี',
                labelLanguage:'ภาษา', descLanguage:'ตรวจจับอัตโนมัติจากการตั้งค่า YouTube',
                labelImportFolders:'นำเข้าโฟลเดอร์', descImportFolders:'กู้คืนโครงสร้างโฟลเดอร์และการกำหนดช่องจากไฟล์สำรอง',
                labelImportSubs:'นำเข้าการสมัคร', descImportSubs:'กู้คืนรายการสมัครสมาชิกจากไฟล์สำรอง',
                labelExportFolders:'ส่งออกโฟลเดอร์', descExportFolders:'บันทึกโครงสร้างโฟลเดอร์และการกำหนดช่องเป็น .json',
                labelExportSubs:'ส่งออกการสมัคร', descExportSubs:'บันทึกรายการสมัครสมาชิกเป็น .json',
                btnImport:'นำเข้า', btnExport:'ส่งออก',
                phFolderTitle:'จัดการโฟลเดอร์', phFolderDesc:'สร้าง เปลี่ยนชื่อ จัดเรียง และลบโฟลเดอร์โดยตรงจากแผงนี้ ใช้แถบด้านข้าง YouTube ได้เลย',
                phComingSoon:'เร็วๆ นี้', searchPlaceholder:'ค้นหาช่อง…',
                sectionBrowse:'เรียกดูการสมัคร', chSubtitle:'ช่อง YouTube',
                chEmpty:'ยังไม่ได้โหลดการสมัครสมาชิก\nเรียกดู YouTube เพื่อโหลดรายการช่องของคุณ',
                chNoMatch:'ไม่พบช่องที่ตรงกัน', chipAll:'ทั้งหมด', chipUncategorized:'ไม่ได้จัดหมวดหมู่',
                acctName:'ชื่อ', acctEmail:'อีเมล', acctManage:'จัดการ', acctWebsite:'ไปที่เว็บไซต์',
                acctSignOut:'ออกจากระบบ', acctSignIn:'เข้าสู่ระบบ', acctSignedOutMsg:'คุณยังไม่ได้เข้าสู่ระบบ FolderTube',
                acctLoading:'กำลังโหลด…', renewalPrefix:'แผนของคุณจะต่ออายุอัตโนมัติในวันที่:', addToFolder:'เพิ่มในโฟลเดอร์',
            },
            hi: { rtl:false,
                tabGeneral:'सामान्य', tabFolders:'फ़ोल्डर', tabChannels:'चैनल', tabAccount:'खाता',
                titleGeneral:'सामान्य', titleFolders:'फ़ोल्डर प्रबंधित करें', titleChannels:'चैनल असाइनमेंट', titleAccount:'खाता',
                labelLanguage:'भाषा', descLanguage:'आपकी YouTube सेटिंग से स्वतः पहचाना गया',
                labelImportFolders:'फ़ोल्डर आयात करें', descImportFolders:'बैकअप से फ़ोल्डर संरचना और चैनल असाइनमेंट पुनर्स्थापित करें',
                labelImportSubs:'सदस्यताएं आयात करें', descImportSubs:'बैकअप से सदस्यता सूची पुनर्स्थापित करें',
                labelExportFolders:'फ़ोल्डर निर्यात करें', descExportFolders:'फ़ोल्डर संरचना और चैनल असाइनमेंट .json के रूप में सहेजें',
                labelExportSubs:'सदस्यताएं निर्यात करें', descExportSubs:'सदस्यता सूची .json के रूप में सहेजें',
                btnImport:'आयात', btnExport:'निर्यात',
                phFolderTitle:'फ़ोल्डर प्रबंधन', phFolderDesc:'इस पैनल से सीधे फ़ोल्डर बनाएं, नाम बदलें, व्यवस्थित करें और हटाएं। अब YouTube साइडबार का उपयोग करें।',
                phComingSoon:'जल्द आ रहा है', searchPlaceholder:'चैनल खोजें…',
                sectionBrowse:'सदस्यताएं ब्राउज़ करें', chSubtitle:'YouTube चैनल',
                chEmpty:'सदस्यताएं अभी तक लोड नहीं हुईं।\nचैनल सूची लोड करने के लिए YouTube ब्राउज़ करें।',
                chNoMatch:'कोई मेल खाने वाला चैनल नहीं', chipAll:'सभी', chipUncategorized:'अवर्गीकृत',
                acctName:'नाम', acctEmail:'ईमेल', acctManage:'प्रबंधित करें', acctWebsite:'वेबसाइट पर जाएं',
                acctSignOut:'साइन आउट', acctSignIn:'साइन इन', acctSignedOutMsg:'आप FolderTube में साइन इन नहीं हैं।',
                acctLoading:'लोड हो रहा है…', renewalPrefix:'आपकी योजना इस तारीख को स्वतः नवीनीकृत होगी:', addToFolder:'फ़ोल्डर में जोड़ें',
            },
            fa: { rtl:true,
                tabGeneral:'عمومی', tabFolders:'پوشه‌ها', tabChannels:'کانال‌ها', tabAccount:'حساب',
                titleGeneral:'عمومی', titleFolders:'مدیریت پوشه‌ها', titleChannels:'تخصیص کانال', titleAccount:'حساب',
                labelLanguage:'زبان', descLanguage:'به‌طور خودکار از تنظیمات YouTube شناسایی می‌شود',
                labelImportFolders:'وارد کردن پوشه‌ها', descImportFolders:'بازیابی ساختار پوشه و تخصیص کانال از نسخه پشتیبان',
                labelImportSubs:'وارد کردن اشتراک‌ها', descImportSubs:'بازیابی لیست اشتراک از نسخه پشتیبان',
                labelExportFolders:'صادر کردن پوشه‌ها', descExportFolders:'ذخیره ساختار پوشه و تخصیص کانال به‌عنوان .json',
                labelExportSubs:'صادر کردن اشتراک‌ها', descExportSubs:'ذخیره لیست اشتراک به‌عنوان .json',
                btnImport:'وارد کردن', btnExport:'صادر کردن',
                phFolderTitle:'مدیریت پوشه‌ها', phFolderDesc:'پوشه‌ها را مستقیماً از این پنل ایجاد، تغییر نام دهید، مرتب کنید و حذف کنید. اکنون از نوار کناری YouTube استفاده کنید.',
                phComingSoon:'به‌زودی', searchPlaceholder:'جستجوی کانال‌ها…',
                sectionBrowse:'مرور اشتراک‌ها', chSubtitle:'کانال YouTube',
                chEmpty:'اشتراک‌ها هنوز بارگذاری نشده‌اند.\nبرای بارگذاری لیست کانال خود YouTube را مرور کنید.',
                chNoMatch:'هیچ کانالی مطابقت ندارد', chipAll:'همه', chipUncategorized:'دسته‌بندی نشده',
                acctName:'نام', acctEmail:'ایمیل', acctManage:'مدیریت', acctWebsite:'رفتن به وب‌سایت',
                acctSignOut:'خروج', acctSignIn:'ورود', acctSignedOutMsg:'شما وارد FolderTube نشده‌اید.',
                acctLoading:'در حال بارگذاری…', renewalPrefix:'اشتراک شما در این تاریخ به‌طور خودکار تمدید می‌شود:', addToFolder:'افزودن به پوشه',
            },
            sk: { rtl:false,
                tabGeneral:'Všeobecné', tabFolders:'Priečinky', tabChannels:'Kanály', tabAccount:'Účet',
                titleGeneral:'Všeobecné', titleFolders:'Správa priečinkov', titleChannels:'Priradenie kanálov', titleAccount:'Účet',
                labelLanguage:'Jazyk', descLanguage:'Automaticky zistený z nastavení YouTube',
                labelImportFolders:'Importovať priečinky', descImportFolders:'Obnoviť štruktúru priečinkov a priradenia kanálov zo zálohy',
                labelImportSubs:'Importovať odbery', descImportSubs:'Obnoviť zoznam odberov zo zálohy',
                labelExportFolders:'Exportovať priečinky', descExportFolders:'Uložiť štruktúru priečinkov a priradenia kanálov ako .json',
                labelExportSubs:'Exportovať odbery', descExportSubs:'Uložiť zoznam odberov ako .json',
                btnImport:'Importovať', btnExport:'Exportovať',
                phFolderTitle:'Správa priečinkov', phFolderDesc:'Vytvárajte, premenujte, zoraďte a odstraňujte priečinky priamo z tohto panela. Teraz použite bočný panel YouTube.',
                phComingSoon:'Čoskoro k dispozícii', searchPlaceholder:'Hľadať kanály…',
                sectionBrowse:'Prehľadávať odbery', chSubtitle:'Kanál YouTube',
                chEmpty:'Odbery ešte neboli načítané.\nPrehľadávajte YouTube a načítajte zoznam kanálov.',
                chNoMatch:'Žiadne zodpovedajúce kanály', chipAll:'Všetky', chipUncategorized:'Nezaradené',
                acctName:'Meno', acctEmail:'E-mail', acctManage:'Spravovať', acctWebsite:'Prejsť na web',
                acctSignOut:'Odhlásiť', acctSignIn:'Prihlásiť', acctSignedOutMsg:'Nie ste prihlásení do FolderTube.',
                acctLoading:'Načítavanie…', renewalPrefix:'Váš plán sa automaticky obnoví:', addToFolder:'Pridať do priečinka',
            },
            hr: { rtl:false,
                tabGeneral:'Općenito', tabFolders:'Mape', tabChannels:'Kanali', tabAccount:'Račun',
                titleGeneral:'Općenito', titleFolders:'Upravljanje mapama', titleChannels:'Dodjela kanala', titleAccount:'Račun',
                labelLanguage:'Jezik', descLanguage:'Automatski otkriveno iz vaših YouTube postavki',
                labelImportFolders:'Uvezi mape', descImportFolders:'Obnovi strukturu mapa i dodjele kanala iz sigurnosne kopije',
                labelImportSubs:'Uvezi pretplate', descImportSubs:'Obnovi popis pretplata iz sigurnosne kopije',
                labelExportFolders:'Izvezi mape', descExportFolders:'Spremi strukturu mapa i dodjele kanala kao .json',
                labelExportSubs:'Izvezi pretplate', descExportSubs:'Spremi popis pretplata kao .json',
                btnImport:'Uvezi', btnExport:'Izvezi',
                phFolderTitle:'Upravljanje mapama', phFolderDesc:'Kreirajte, preimenujte, rasporedite i brišite mape izravno iz ovog panela. Sada koristite YouTube bočnu traku.',
                phComingSoon:'Uskoro', searchPlaceholder:'Traži kanale…',
                sectionBrowse:'Pregledaj pretplate', chSubtitle:'YouTube kanal',
                chEmpty:'Pretplate još nisu učitane.\nPregledajte YouTube da biste učitali popis kanala.',
                chNoMatch:'Nema odgovarajućih kanala', chipAll:'Svi', chipUncategorized:'Nekategorizirano',
                acctName:'Ime', acctEmail:'E-pošta', acctManage:'Upravljaj', acctWebsite:'Idi na web stranicu',
                acctSignOut:'Odjava', acctSignIn:'Prijava', acctSignedOutMsg:'Niste prijavljeni u FolderTube.',
                acctLoading:'Učitavanje…', renewalPrefix:'Vaš plan automatski se obnavlja:', addToFolder:'Dodaj u mapu',
            },
        };
        // exact full code match first, then base language, then English fallback
        return T[full] || T[base] || T.en;
    }

    // ── Modal HTML ────────────────────────────────────────────────────────────

    function buildModalHTML(t) {
        return `
        <div class="ytt-mgr-sidebar">
            <ul class="ytt-mgr-nav">
                <li class="active" data-view="general">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M20 7h-9a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2Z"/>
                        <path d="M5 14H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                    </svg>
                    <span>${t.tabGeneral}</span>
                </li>
                <li data-view="folders">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>
                    </svg>
                    <span>${t.tabFolders}</span>
                </li>
                <li data-view="channels">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="9" cy="7" r="4"/>
                        <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/>
                        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                        <path d="M21 21v-2a4 4 0 0 0-3-3.87"/>
                    </svg>
                    <span>${t.tabChannels}</span>
                </li>
                <li data-view="account">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                        <circle cx="12" cy="7" r="4"/>
                    </svg>
                    <span>${t.tabAccount}</span>
                </li>
            </ul>

            <div class="ytt-mgr-footer">
                <div class="ytt-mgr-social-links">
                    <a href="https://www.facebook.com/foldertube" target="_blank" title="Facebook">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 16 16"><path d="M16 8.049c0-4.446-3.582-8.05-8-8.05C3.58 0-.002 3.603-.002 8.05c0 4.017 2.926 7.347 6.75 7.951v-5.625h-2.03V8.05H6.75V6.275c0-2.017 1.195-3.131 3.022-3.131.876 0 1.791.157 1.791.157v1.98h-1.009c-.993 0-1.303.621-1.303 1.258v1.51h2.218l-.354 2.326H9.25V16c3.824-.604 6.75-3.934 6.75-7.951"/></svg>
                    </a>
                    <a href="https://www.x.com/foldertubeapp" target="_blank" title="X (Twitter)">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                    </a>
                    <a href="https://www.instagram.com/foldertubeapp" target="_blank" title="Instagram">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 16 16"><path d="M8 0C5.829 0 5.556.01 4.703.048 3.85.088 3.269.222 2.76.42a3.9 3.9 0 0 0-1.417.923A3.9 3.9 0 0 0 .42 2.76C.222 3.268.087 3.85.048 4.7.01 5.555 0 5.827 0 8.001c0 2.172.01 2.444.048 3.297.04.852.174 1.433.372 1.942.205.526.478.972.923 1.417.444.445.89.719 1.416.923.51.198 1.09.333 1.942.372C5.555 15.99 5.827 16 8 16s2.444-.01 3.298-.048c.851-.04 1.434-.174 1.943-.372a3.9 3.9 0 0 0 1.416-.923c.445-.445.718-.891.923-1.417.197-.509.332-1.09.372-1.942C15.99 10.445 16 10.173 16 8s-.01-2.445-.048-3.299c-.04-.851-.175-1.433-.372-1.941a3.9 3.9 0 0 0-.923-1.417A3.9 3.9 0 0 0 13.24.42c-.51-.198-1.092-.333-1.943-.372C10.443.01 10.172 0 7.998 0zm-.717 1.442h.718c2.136 0 2.389.007 3.232.046.78.035 1.204.166 1.486.275.373.145.64.319.92.599s.453.546.598.92c.11.281.24.705.275 1.485.039.843.047 1.096.047 3.231s-.008 2.389-.047 3.232c-.035.78-.166 1.203-.275 1.485a2.5 2.5 0 0 1-.599.919c-.28.28-.546.453-.92.598-.28.11-.704.24-1.485.276-.843.038-1.096.047-3.232.047s-2.39-.009-3.233-.047c-.78-.036-1.203-.166-1.485-.276a2.5 2.5 0 0 1-.92-.598 2.5 2.5 0 0 1-.6-.92c-.109-.281-.24-.705-.275-1.485-.038-.843-.046-1.096-.046-3.233s.008-2.388.046-3.231c.036-.78.166-1.204.276-1.486.145-.373.319-.64.599-.92s.546-.453.92-.598c.282-.11.705-.24 1.485-.276.738-.034 1.024-.044 2.515-.045zm4.988 1.328a.96.96 0 1 0 0 1.92.96.96 0 0 0 0-1.92m-4.27 1.122a4.109 4.109 0 1 0 0 8.217 4.109 4.109 0 0 0 0-8.217m0 1.441a2.667 2.667 0 1 1 0 5.334 2.667 2.667 0 0 1 0-5.334"/></svg>
                    </a>
                    <a href="https://www.tiktok.com/@foldertube" target="_blank" title="TikTok">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 16 16"><path d="M9 0h1.98c.144.715.54 1.617 1.235 2.512C12.895 3.389 13.797 4 15 4v2c-1.753 0-3.07-.814-4-1.829V11a5 5 0 1 1-5-5v2a3 3 0 1 0 3 3z"/></svg>
                    </a>
                    <a href="https://www.youtube.com/@foldertube" target="_blank" title="YouTube">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 16 16"><path d="M8.051 1.999h.089c.822.003 4.987.033 6.11.335a2.01 2.01 0 0 1 1.415 1.42c.101.38.172.883.22 1.402l.01.104.022.26.008.104c.065.914.073 1.77.074 1.957v.075c-.001.194-.01 1.108-.082 2.06l-.008.105-.009.104c-.05.572-.124 1.14-.235 1.558a2.01 2.01 0 0 1-1.415 1.42c-1.16.312-5.569.334-6.18.335h-.142c-.309 0-1.587-.006-2.927-.052l-.17-.006-.087-.004-.171-.007-.171-.007c-1.11-.049-2.167-.128-2.654-.26a2.01 2.01 0 0 1-1.415-1.419c-.111-.417-.185-.986-.235-1.558L.09 9.82l-.008-.104A31 31 0 0 1 0 7.68v-.123c.002-.215.01-.958.064-1.778l.007-.103.003-.052.008-.104.022-.26.01-.104c.048-.519.119-1.023.22-1.402a2.01 2.01 0 0 1 1.415-1.42c.487-.13 1.544-.21 2.654-.26l.17-.007.172-.006.086-.003.171-.007A100 100 0 0 1 7.858 2zM6.4 5.209v4.818l4.157-2.408z"/></svg>
                    </a>
                    <a href="https://discord.gg/CzvMC7R5AC" target="_blank" title="Discord">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 16 16"><path d="M13.545 2.907a13.2 13.2 0 0 0-3.257-1.011.05.05 0 0 0-.052.025c-.141.25-.297.577-.406.833a12.2 12.2 0 0 0-3.658 0 8 8 0 0 0-.412-.833.05.05 0 0 0-.052-.025c-1.125.194-2.22.534-3.257 1.011a.04.04 0 0 0-.021.018C.356 6.024-.213 9.047.066 12.032q.003.022.021.037a13.3 13.3 0 0 0 3.995 2.02.05.05 0 0 0 .056-.019q.463-.63.818-1.329a.05.05 0 0 0-.01-.059l-.018-.011a9 9 0 0 1-1.248-.595.05.05 0 0 1-.02-.066l.015-.019q.127-.095.248-.195a.05.05 0 0 1 .051-.007c2.619 1.196 5.454 1.196 8.041 0a.05.05 0 0 1 .053.007q.121.1.248.195a.05.05 0 0 1-.004.085 8 8 0 0 1-1.249.594.05.05 0 0 0-.03.03.05.05 0 0 0 .003.041c.24.465.515.909.817 1.329a.05.05 0 0 0 .056.019 13.2 13.2 0 0 0 4.001-2.02.05.05 0 0 0 .021-.037c.334-3.451-.559-6.449-2.366-9.106a.03.03 0 0 0-.02-.019m-8.198 7.307c-.789 0-1.438-.724-1.438-1.612s.637-1.613 1.438-1.613c.807 0 1.45.73 1.438 1.613 0 .888-.637 1.612-1.438 1.612m5.316 0c-.788 0-1.438-.724-1.438-1.612s.637-1.613 1.438-1.613c.807 0 1.451.73 1.438 1.613 0 .888-.631 1.612-1.438 1.612"/></svg>
                    </a>
                </div>
                <p class="ytt-mgr-copyright">
                    v${VERSION} &nbsp;·&nbsp; <a href="https://foldertube.vercel.app" target="_blank">FolderTube</a>
                </p>
            </div>
        </div>

        <div class="ytt-mgr-main">
            <button class="ytt-manager-close" id="ytt-mgr-close-btn" aria-label="Close">×</button>

            <div class="ytt-mgr-body">

                <!-- ── General ─────────────────────────────────────── -->
                <div class="ytt-mgr-view active" id="ytt-view-general">
                    <h3 class="ytt-mgr-view-title">${t.titleGeneral}</h3>
                    <hr class="ytt-mgr-hr thick">

                    <div class="ytt-mgr-item">
                        <div class="ytt-mgr-item-text">
                            <div class="ytt-mgr-item-label">${t.labelLanguage}</div>
                            <div class="ytt-mgr-item-desc">${t.descLanguage}</div>
                        </div>
                        <span id="ytt-lang-badge" class="ytt-mgr-lang-badge">—</span>
                    </div>
                    <hr class="ytt-mgr-hr">

                    <div class="ytt-mgr-item">
                        <div class="ytt-mgr-item-text">
                            <div class="ytt-mgr-item-label">${t.labelImportFolders}</div>
                            <div class="ytt-mgr-item-desc">${t.descImportFolders}</div>
                        </div>
                        <button id="ytt-btn-import-folders" class="ytt-mgr-action-btn primary">
                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
                                fill="none" stroke="currentColor" stroke-width="2.5"
                                stroke-linecap="round" stroke-linejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                <polyline points="17 8 12 3 7 8"/>
                                <line x1="12" y1="3" x2="12" y2="15"/>
                            </svg>
                            ${t.btnImport}
                        </button>
                        <input type="file" id="ytt-import-folders-file" accept=".json" style="display:none">
                    </div>
                    <hr class="ytt-mgr-hr">

                    <div class="ytt-mgr-item">
                        <div class="ytt-mgr-item-text">
                            <div class="ytt-mgr-item-label">${t.labelImportSubs}</div>
                            <div class="ytt-mgr-item-desc">${t.descImportSubs}</div>
                        </div>
                        <button id="ytt-btn-import-subs" class="ytt-mgr-action-btn primary">
                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
                                fill="none" stroke="currentColor" stroke-width="2.5"
                                stroke-linecap="round" stroke-linejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                <polyline points="17 8 12 3 7 8"/>
                                <line x1="12" y1="3" x2="12" y2="15"/>
                            </svg>
                            ${t.btnImport}
                        </button>
                        <input type="file" id="ytt-import-subs-file" accept=".json" style="display:none">
                    </div>
                    <hr class="ytt-mgr-hr">

                    <div class="ytt-mgr-item">
                        <div class="ytt-mgr-item-text">
                            <div class="ytt-mgr-item-label">${t.labelExportFolders}</div>
                            <div class="ytt-mgr-item-desc">${t.descExportFolders}</div>
                        </div>
                        <button id="ytt-btn-export-folders" class="ytt-mgr-action-btn">
                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
                                fill="none" stroke="currentColor" stroke-width="2.5"
                                stroke-linecap="round" stroke-linejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                <polyline points="7 10 12 15 17 10"/>
                                <line x1="12" y1="15" x2="12" y2="3"/>
                            </svg>
                            ${t.btnExport}
                        </button>
                    </div>
                    <hr class="ytt-mgr-hr">

                    <div class="ytt-mgr-item">
                        <div class="ytt-mgr-item-text">
                            <div class="ytt-mgr-item-label">${t.labelExportSubs}</div>
                            <div class="ytt-mgr-item-desc">${t.descExportSubs}</div>
                        </div>
                        <button id="ytt-btn-export-subs" class="ytt-mgr-action-btn">
                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
                                fill="none" stroke="currentColor" stroke-width="2.5"
                                stroke-linecap="round" stroke-linejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                <polyline points="7 10 12 15 17 10"/>
                                <line x1="12" y1="15" x2="12" y2="3"/>
                            </svg>
                            ${t.btnExport}
                        </button>
                    </div>
                </div>

                <!-- ── Folders ─────────────────────────────────────── -->
                <div class="ytt-mgr-view" id="ytt-view-folders">
                    <h3 class="ytt-mgr-view-title">${t.titleFolders}</h3>
                    <hr class="ytt-mgr-hr thick">
                    <div class="ytt-mgr-placeholder">
                        <div class="ytt-mgr-ph-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>
                            </svg>
                        </div>
                        <p class="ytt-mgr-ph-title">${t.phFolderTitle}</p>
                        <p class="ytt-mgr-ph-desc">${t.phFolderDesc}</p>
                        <span class="ytt-mgr-soon">${t.phComingSoon}</span>
                    </div>
                </div>

                <!-- ── Channels ────────────────────────────────────── -->
                <div class="ytt-mgr-view" id="ytt-view-channels">
                    <h3 class="ytt-mgr-view-title">${t.titleChannels}</h3>
                    <hr class="ytt-mgr-hr thick">
                    <div class="ytt-mgr-ch-toolbar">
                        <div class="ytt-mgr-ch-search-wrap">
                            <span class="ytt-mgr-ch-search-icon">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
                                    fill="none" stroke="currentColor" stroke-width="2.5"
                                    stroke-linecap="round" stroke-linejoin="round">
                                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                                </svg>
                            </span>
                            <input type="search" id="ytt-ch-search" class="ytt-mgr-ch-search"
                                placeholder="${t.searchPlaceholder}" autocomplete="off">
                        </div>
                        <span id="ytt-ch-count" class="ytt-mgr-ch-count"></span>
                    </div>
                    <div class="ytt-mgr-ch-chips-wrap" id="ytt-ch-chips-wrap">
                        <div class="ytt-mgr-ch-chips" id="ytt-ch-chips"></div>
                        <button class="ytt-chips-nav ytt-chips-nav--left" aria-label="Scroll left">&#8249;</button>
                        <button class="ytt-chips-nav ytt-chips-nav--right" aria-label="Scroll right">&#8250;</button>
                    </div>
                    <div id="ytt-ch-list" class="ytt-mgr-ch-list"></div>
                </div>

                <!-- ── Account ─────────────────────────────────────── -->
                <div class="ytt-mgr-view" id="ytt-view-account">
                    <h3 class="ytt-mgr-view-title">${t.titleAccount}</h3>
                    <hr class="ytt-mgr-hr thick">
                    <div id="ytt-account-body"></div>
                </div>


            </div>
        </div>
        `;
    }

    // ── Settings logic ────────────────────────────────────────────────────────

    function setupLogic(modal, t) {
        // ── Channel management helpers ─────────────────────────────────────────
        function getFolderList() {
            // Prefer tabData (in-memory, always up-to-date after any drag/rename)
            const tm = window.tabManager;
            if (tm?.tabData && Object.keys(tm.tabData).length) {
                return Object.entries(tm.tabData)
                    .map(([id, d]) => ({ id, name: d.name || d.title || id, index: d.index ?? 0 }))
                    .sort((a, b) => a.index - b.index);
            }
            return [];
        }

        function getChannelFolderMap() {
            const map = {};
            const tm = window.tabManager;
            if (!tm?.tabData) return map;
            for (const [fid, f] of Object.entries(tm.tabData)) {
                const cids = f.channelIds || f.channels || f.badges || f.items || [];
                cids.forEach(ch => {
                    const id = typeof ch === 'string' ? ch : (ch?.id || ch?.channelId);
                    if (id) map[id] = fid;
                });
            }
            return map;
        }

        function assignChannelToFolder(channelId, newFolderId) {
            const tm = window.tabManager;
            if (!tm?.tabData) return;
            for (const f of Object.values(tm.tabData)) {
                ['channelIds', 'channels', 'badges', 'items'].forEach(key => {
                    if (Array.isArray(f[key])) {
                        f[key] = f[key].filter(ch =>
                            typeof ch === 'string' ? ch !== channelId
                                : ch?.id !== channelId && ch?.channelId !== channelId);
                    }
                });
            }
            if (newFolderId && tm.tabData[newFolderId]) {
                const f = tm.tabData[newFolderId];
                if (!Array.isArray(f.channelIds)) f.channelIds = [];
                if (!f.channelIds.includes(channelId)) f.channelIds.push(channelId);
            }
            if (typeof window.onChannelAssignmentChanged === 'function') {
                window.onChannelAssignmentChanged(channelId, newFolderId || -1);
            }
            document.dispatchEvent(new CustomEvent('CHANNEL_MOVED', {
                detail: { channelId, tabId: newFolderId || -1, folderId: newFolderId || -1 }
            }));
        }

        // SVG icons
        const ICON_PLUS = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>`;
        const ICON_FOLDER = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
            fill="currentColor" stroke="none">
            <path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z"/>
        </svg>`;

        // Active filter chip state: null = All, 'unassigned' = Unassigned, folderId string = that folder
        let _activeChip = null;
        let _activePicker = null;

        function closePicker() {
            if (_activePicker) { _activePicker.remove(); _activePicker = null; }
        }

        function openFolderPicker(btn, channelId) {
            closePicker();
            const folders = getFolderList();
            const channelFolder = getChannelFolderMap();
            const currentFid = channelFolder[channelId] || null;

            const picker = document.createElement('div');
            picker.className = 'ytt-mgr-ch-picker';
            _activePicker = picker;

            const items = [
                { id: null, name: '— Unassigned —', color: '#888' },
                ...folders.map(f => ({ id: f.id, name: f.name, color: window.tabManager?.tabData?.[f.id]?.color || '#aaa' }))
            ];

            items.forEach(({ id, name, color }) => {
                const row = document.createElement('div');
                row.className = 'ytt-mgr-ch-picker-item';
                row.innerHTML = `<span class="ytt-mgr-ch-picker-dot" style="background:${color}"></span>${name}`;
                if (id === currentFid) row.style.fontWeight = '700';
                row.addEventListener('click', e => {
                    e.stopPropagation();
                    assignChannelToFolder(channelId, id);
                    closePicker();
                    buildFilterChips();
                    buildChannelList(modal.querySelector('#ytt-ch-search')?.value || '');
                });
                picker.appendChild(row);
            });

            document.body.appendChild(picker);

            const rect = btn.getBoundingClientRect();
            let top = rect.bottom + 6;
            let left = rect.right - picker.offsetWidth || rect.right - 160;
            if (top + 240 > window.innerHeight) top = rect.top - 240 - 6;
            if (left < 8) left = 8;
            picker.style.top = top + 'px';
            picker.style.left = left + 'px';

            setTimeout(() => {
                const r = picker.getBoundingClientRect();
                if (r.right > window.innerWidth - 8) picker.style.left = (window.innerWidth - r.width - 8) + 'px';
                if (r.bottom > window.innerHeight - 8) picker.style.top = (rect.top - r.height - 6) + 'px';
            }, 0);
        }

        document.addEventListener('click', e => {
            if (_activePicker && !_activePicker.contains(e.target)) closePicker();
        }, true);

        // Build an indexed channel list from a single storage snapshot so that
        // `data.folders` (folder memberships) and `data.channels` (metadata) are
        // always consistent with each other.  tabData / subscriptionManager are
        // used only as fall-backs when storage is empty.
        async function buildChannelIndex() {
            let allSubscriptions = [];
            let storageFolderMap = {};   // { [folderId]: folder } built from data.folders

            try {
                const stored = await chrome.storage.local.get('youtube_channel_groups');
                const data = stored['youtube_channel_groups'] || {};
                if (Array.isArray(data.channels) && data.channels.length) {
                    allSubscriptions = data.channels;
                }
                if (Array.isArray(data.folders) && data.folders.length) {
                    data.folders.forEach(f => { if (f?.id) storageFolderMap[f.id] = f; });
                }
            } catch (_) {}

            // Supplement with the live in-memory cache (fills gaps in metadata)
            const liveCache = new Map(
                (window.subscriptionManager?.getAll() || []).map(ch => [ch.id, ch])
            );

            if (!allSubscriptions.length) {
                allSubscriptions = [...liveCache.values()];
            }

            // Primary metadata map — storage first, live cache fills any gaps
            const subById = new Map(allSubscriptions.map(ch => [ch.id, ch]));
            liveCache.forEach((ch, id) => { if (!subById.has(id)) subById.set(id, ch); });

            // Authoritative folder source: storage snapshot → tabData → empty
            const folderSource = Object.keys(storageFolderMap).length
                ? storageFolderMap
                : (window.tabManager?.tabData || {});

            const assignedIds = new Set();
            const indexed = [];
            const folderCounts = {};

            Object.entries(folderSource).forEach(([folderId, folder]) => {
                folderCounts[folderId] = 0;
                const ids = folder.channelIds || folder.channels || [];
                ids.forEach(entry => {
                    const id = typeof entry === 'string' ? entry : (entry?.id || entry?.channelId);
                    if (!id || assignedIds.has(id)) return;
                    assignedIds.add(id);
                    folderCounts[folderId]++;
                    const ch = subById.get(id);
                    // Always include — use metadata when available, fall back to bare ID
                    indexed.push({ id, name: id, ...(ch || {}), _folderId: folderId });
                });
            });

            // Append channels not assigned to any folder
            allSubscriptions.forEach(ch => {
                if (!assignedIds.has(ch.id)) indexed.push({ ...ch, _folderId: null });
            });

            return { indexed, allSubscriptions, folderCounts, assignedIds };
        }

        async function buildFilterChips() {
            const chipsEl = modal.querySelector('#ytt-ch-chips');
            if (!chipsEl) return;
            const folders = getFolderList();
            const { allSubscriptions, folderCounts, assignedIds } = await buildChannelIndex();
            const unassignedCount = allSubscriptions.filter(c => !assignedIds.has(c.id)).length;

            const chips = [
                { key: null,         label: t.chipAll,  color: '#e3e3e3' },
                { key: 'unassigned', label: `${t.chipUncategorized}${unassignedCount ? ' (' + unassignedCount + ')' : ''}`, color: '#aaa' },
                ...folders.map(f => {
                    const color = window.tabManager?.tabData?.[f.id]?.color || '#aaa';
                    const cnt = folderCounts[f.id] || 0;
                    return { key: f.id, label: `${f.name}${cnt ? ' (' + cnt + ')' : ''}`, color };
                })
            ];

            chipsEl.innerHTML = '';
            chips.forEach(c => {
                const chip = document.createElement('span');
                chip.className = 'ytt-mgr-ch-chip' + (_activeChip === c.key ? ' active' : '');
                chip.textContent = c.label;
                chip.dataset.chip = c.key ?? '';
                chip.style.color = c.color;
                chip.style.borderColor = c.color + '66';
                if (_activeChip === c.key) chip.style.background = c.color + '28';
                chip.addEventListener('click', () => {
                    const raw = chip.dataset.chip;
                    _activeChip = raw === '' ? null : raw;
                    buildFilterChips();
                    buildChannelList(modal.querySelector('#ytt-ch-search')?.value || '');
                });
                chipsEl.appendChild(chip);
            });

            // Scroll navigation for the chips row
            const wrap = modal.querySelector('#ytt-ch-chips-wrap');
            if (wrap) {
                const updateNav = () => {
                    wrap.classList.toggle('can-scroll-left',  chipsEl.scrollLeft > 2);
                    wrap.classList.toggle('can-scroll-right',
                        chipsEl.scrollLeft < chipsEl.scrollWidth - chipsEl.clientWidth - 2);
                };
                chipsEl.removeEventListener('scroll', chipsEl._navHandler);
                chipsEl._navHandler = updateNav;
                chipsEl.addEventListener('scroll', updateNav);
                updateNav();

                const STEP = 160;
                const btnL = wrap.querySelector('.ytt-chips-nav--left');
                const btnR = wrap.querySelector('.ytt-chips-nav--right');
                if (btnL) {
                    btnL.onclick = null;
                    btnL.onclick = () => { chipsEl.scrollBy({ left: -STEP, behavior: 'smooth' }); };
                }
                if (btnR) {
                    btnR.onclick = null;
                    btnR.onclick = () => { chipsEl.scrollBy({ left: STEP, behavior: 'smooth' }); };
                }

                // Also scroll the active chip into view
                const activeChip = chipsEl.querySelector('.ytt-mgr-ch-chip.active');
                if (activeChip) activeChip.scrollIntoView({ inline: 'nearest', block: 'nearest' });
            }
        }

        async function buildChannelList(query) {
            const listEl  = modal.querySelector('#ytt-ch-list');
            const countEl = modal.querySelector('#ytt-ch-count');
            if (!listEl) return;

            const { indexed, allSubscriptions } = await buildChannelIndex();
            if (!allSubscriptions.length) {
                listEl.innerHTML = `<div class="ytt-mgr-ch-empty">${t.chEmpty.replace('\n', '<br>')}</div>`;
                if (countEl) countEl.textContent = '';
                return;
            }

            const q = (query || '').toLowerCase().trim();
            let filtered = indexed;
            if (q) filtered = filtered.filter(c => (c.name || c.title || '').toLowerCase().includes(q));
            if (_activeChip === 'unassigned') filtered = filtered.filter(c => !c._folderId);
            else if (_activeChip) filtered = filtered.filter(c => c._folderId === _activeChip);

            if (countEl) countEl.textContent = `${filtered.length} / ${allSubscriptions.length}`;

            listEl.innerHTML = '';

            if (!filtered.length) {
                listEl.innerHTML = `<div class="ytt-mgr-ch-empty">${t.chNoMatch}</div>`;
                return;
            }

            const hdr = document.createElement('div');
            hdr.className = 'ytt-mgr-ch-section-hdr';
            hdr.textContent = t.sectionBrowse;
            listEl.appendChild(hdr);

            const tm = window.tabManager;
            filtered.forEach(ch => {
                const name = ch.name || ch.title || ch.id;
                const fid = ch._folderId;
                const folderData = fid ? tm?.tabData?.[fid] : null;
                const folderColor = folderData?.color || '#aaa';
                const assigned = !!fid;

                const item = document.createElement('div');
                item.className = 'ytt-mgr-ch-item';
                item.innerHTML = `
                    <img class="ytt-mgr-ch-avatar" src="${ch.thumbnail || ''}" alt=""
                        loading="lazy" onerror="this.style.visibility='hidden'">
                    <div class="ytt-mgr-ch-info">
                        <span class="ytt-mgr-ch-name">${name}</span>
                        <span class="ytt-mgr-ch-sub">${t.chSubtitle}</span>
                    </div>
                    <button class="ytt-mgr-ch-assign-btn${assigned ? ' assigned' : ''}"
                        data-channel-id="${ch.id}"
                        style="${assigned ? 'color:' + folderColor : ''}"
                        title="${assigned ? (folderData?.name || 'Assigned') : t.addToFolder}">
                        ${assigned ? ICON_FOLDER : ICON_PLUS}
                    </button>`;

                const btn = item.querySelector('.ytt-mgr-ch-assign-btn');
                btn.addEventListener('click', e => {
                    e.stopPropagation();
                    openFolderPicker(btn, ch.id);
                });

                listEl.appendChild(item);
            });
        }

        // ── Nav switching ──────────────────────────────────────────────────────
        const navItems = modal.querySelectorAll('.ytt-mgr-nav li');
        const views    = modal.querySelectorAll('.ytt-mgr-view');

        navItems.forEach(item => {
            item.addEventListener('click', () => {
                const id = item.dataset.view;
                navItems.forEach(i => i.classList.remove('active'));
                views.forEach(v => v.classList.remove('active'));
                item.classList.add('active');
                modal.querySelector(`#ytt-view-${id}`)?.classList.add('active');
                if (id === 'channels') {
                    _activeChip = null;
                    const search = modal.querySelector('#ytt-ch-search');
                    if (search) search.value = '';
                    buildFilterChips();
                    buildChannelList('');
                }
            });
        });

        // Search within channels view
        let _chSearchTimer = null;
        modal.querySelector('#ytt-ch-search')?.addEventListener('input', e => {
            clearTimeout(_chSearchTimer);
            _chSearchTimer = setTimeout(() => buildChannelList(e.target.value), 220);
        });

        // ── Account view ───────────────────────────────────────────────────────
        const WEBSITE_URL = 'https://foldertube.vercel.app';

        function _planDisplayName(plan) {
            const p = (plan || 'free').toLowerCase();
            if (p === 'plus') return 'FolderTube Plus';
            if (p === 'pro')  return 'FolderTube Pro';
            return 'FolderTube Free';
        }

        function _avatarInitials(name, email) {
            const src = name || (email || '').split('@')[0] || '?';
            return src.charAt(0).toUpperCase();
        }

        function _formatRenewalDate(isoOrTimestamp) {
            if (!isoOrTimestamp) return null;
            try {
                const d = typeof isoOrTimestamp === 'number'
                    ? new Date(isoOrTimestamp * 1000)   // Unix seconds
                    : new Date(isoOrTimestamp);
                if (isNaN(d)) return null;
                return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
            } catch (_) { return null; }
        }

        function _renderSignedOut(body) {
            body.innerHTML = `
                <div class="ytt-acct-signed-out">
                    <svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 24 24"
                        fill="none" stroke="currentColor" stroke-width="1.3"
                        stroke-linecap="round" stroke-linejoin="round" style="opacity:.35">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                        <circle cx="12" cy="7" r="4"/>
                    </svg>
                    <p>${t.acctSignedOutMsg}</p>
                    <a href="${WEBSITE_URL}/login" target="_blank" class="ytt-acct-signin-btn">
                        ${t.acctSignIn}
                    </a>
                </div>`;
        }

        function _renderProfile(body, profile) {
            const email       = profile.email || '';
            const name        = profile.name || profile.display_name || '';
            const plan        = (profile.plan || 'free').toLowerCase();
            const planLabel   = _planDisplayName(plan);
            const displayName = name || (email ? email.split('@')[0] : '');

            const renewalDate = _formatRenewalDate(
                profile.subscription_expires_at || profile.current_period_end || profile.subscribed_at || null
            );
            const renewalLine = (renewalDate && plan !== 'free')
                ? `<div class="ytt-acct-renewal">${t.renewalPrefix} ${renewalDate}</div>`
                : '';

            // In RTL the "go to dashboard" disclosure arrow points left (<), not right (>)
            const chevronSvg = t.rtl
                ? `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="2.5"
                stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`
                : `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="2.5"
                stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;

            const manageSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="2.5"
                stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;

            body.innerHTML = `
                <!-- Identity rows -->
                <div class="ytt-acct-section">
                    ${displayName ? `
                    <div class="ytt-acct-row">
                        <span class="ytt-acct-row-label">${t.acctName}</span>
                        <span class="ytt-acct-row-value">${displayName}</span>
                    </div>` : ''}
                    ${email ? `
                    <div class="ytt-acct-row">
                        <span class="ytt-acct-row-label">${t.acctEmail}</span>
                        <a href="${WEBSITE_URL}/dashboard" target="_blank" class="ytt-acct-row-value link">
                            ${email}${chevronSvg}
                        </a>
                    </div>` : ''}
                </div>

                <!-- Plan row -->
                <div class="ytt-acct-section">
                    <div class="ytt-acct-plan-row">
                        <span class="ytt-acct-plan-name">${planLabel}</span>
                        <a href="${WEBSITE_URL}/dashboard" target="_blank" class="ytt-acct-manage-btn">
                            ${t.acctManage} ${manageSvg}
                        </a>
                    </div>
                    ${renewalLine}
                </div>

                <!-- Actions -->
                <div class="ytt-acct-actions">
                    <a href="${WEBSITE_URL}" target="_blank" class="ytt-acct-btn secondary">${t.acctWebsite}</a>
                    <button id="ytt-acct-logout" class="ytt-acct-btn danger">${t.acctSignOut}</button>
                </div>`;

            body.querySelector('#ytt-acct-logout')?.addEventListener('click', () => {
                // Revoke server-side refresh token (fire-and-forget)
                chrome.runtime.sendMessage(
                    { type: 'apiCall', method: 'POST', path: '/api/auth/logout', body: {} },
                    () => {}
                );
                // Clear all local auth keys
                const AUTH_KEYS = [
                    'accessToken', 'refreshToken', 'apiAccessToken', 'apiRefreshToken',
                    'tokenPresent', 'isRegistered', 'registrationRequired',
                    'ytt_user_profile', 'ytt_min_extension_version',
                    'ytt_access_token', 'ytt_refresh_token', 'ytt_supabase_token', 'ytt_has_registered'
                ];
                chrome.storage.local.remove(AUTH_KEYS, () => {
                    // Close the modal
                    closeModal();
                    // Trigger sidebar to replace folders with the sign-in prompt
                    try {
                        window.tabManager?.forceUpdateAuthStatus?.();
                        // Fallback: if forceUpdateAuthStatus doesn't show the prompt, add it directly
                        setTimeout(() => {
                            if (!document.getElementById('ytt-subscription-prompt')) {
                                window.tabManager?.clearUI?.();
                                window.tabManager?.addSubscriptionPrompt?.();
                            }
                        }, 500);
                    } catch (_) {}
                });
            });
        }

        function renderAccountView() {
            const body = modal.querySelector('#ytt-account-body');
            if (!body) return;

            // Show spinner while fetching
            body.innerHTML = `<div class="ytt-acct-loading"><div class="ytt-acct-spinner"></div>${t.acctLoading}</div>`;

            // Make a live API call so data is always fresh
            chrome.runtime.sendMessage(
                { type: 'apiCall', method: 'GET', path: '/api/me' },
                resp => {
                    if (!resp?.ok || !resp.data?.profile) {
                        _renderSignedOut(body);
                        return;
                    }
                    _renderProfile(body, resp.data.profile);
                }
            );
        }

        // Render account view when nav switches to it
        navItems.forEach(item => {
            if (item.dataset.view === 'account') {
                item.addEventListener('click', renderAccountView);
            }
        });

        // ── Language (auto-detected from YouTube) ──────────────────────────────
        (function detectAndDisplayLang() {
            const badge = modal.querySelector('#ytt-lang-badge');
            if (!badge) return;
            let lang = null;
            try { lang = window.ytcfg?.get?.('HL'); } catch (_) {}
            if (!lang) try { lang = window.yt?.config_?.HL; } catch (_) {}
            if (!lang) lang = document.documentElement.lang || navigator.language || 'en';
            lang = String(lang).trim() || 'en';
            const NAMES = { en:'English', ar:'العربية', fr:'Français', es:'Español', de:'Deutsch',
                pt:'Português', it:'Italiano', ru:'Русский', tr:'Türkçe', ja:'日本語',
                ko:'한국어', 'zh-CN':'中文（简体）', 'zh-TW':'中文（繁體）', nl:'Nederlands',
                pl:'Polski', sv:'Svenska', da:'Dansk', fi:'Suomi', nb:'Norsk', hi:'हिन्दी',
                id:'Bahasa Indonesia', ms:'Bahasa Melayu', th:'ภาษาไทย', uk:'Українська',
                cs:'Čeština', ro:'Română', hu:'Magyar', el:'Ελληνικά', he:'עברית', iw:'עברית',
                vi:'Tiếng Việt', bg:'Български', sk:'Slovenčina', hr:'Hrvatski', fa:'فارسی',
                fil:'Filipino', sr:'Српски', sl:'Slovenščina', lt:'Lietuvių', lv:'Latviešu',
                et:'Eesti', az:'Azərbaycan', kk:'Қазақ', am:'አማርኛ', sw:'Kiswahili',
                af:'Afrikaans', sq:'Shqip', mk:'Македонски', be:'Беларуская' };
            const baseLang = lang.split('-')[0];
            const displayName = NAMES[lang] || NAMES[baseLang] || lang.toUpperCase();
            badge.textContent = displayName;
            badge.title = lang;
            window.ytt_language = lang;
            window.__ytt_rtl   = ['ar', 'he', 'iw', 'fa', 'ur'].includes(lang.split('-')[0]);
            chrome.storage.local.set({ ytt_language: lang });
        })();

        // ── Export helpers ─────────────────────────────────────────────────────
        function getFolders() {
            if (!window.tabManager?.tabData) return [];
            return Object.entries(window.tabManager.tabData).map(([id, d]) => ({
                id,
                name: d.name || d.title || '',
                color: d.color || null,
                index: d.index ?? 0,
                channels: (d.channelIds || d.channels || []).map(c =>
                    typeof c === 'string' ? c : (c?.id || c?.channelId || c))
            }));
        }

        function triggerDownload(payload, filename) {
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }

        const today = () => new Date().toISOString().slice(0, 10);

        modal.querySelector('#ytt-btn-export-folders')?.addEventListener('click', () => {
            triggerDownload(
                { _source: 'foldertube', _type: 'folders', _version: VERSION, exportedAt: new Date().toISOString(), folders: getFolders() },
                `foldertube-folders-${today()}.json`
            );
        });

        modal.querySelector('#ytt-btn-export-subs')?.addEventListener('click', () => {
            const subscriptions = window.subscriptionManager?.getAll() || [];
            triggerDownload(
                { _source: 'foldertube', _type: 'subscriptions', _version: VERSION, exportedAt: new Date().toISOString(), subscriptions },
                `foldertube-subscriptions-${today()}.json`
            );
        });

        // ── Import helpers ─────────────────────────────────────────────────────
        function wireImport(btnId, fileId, expectedType, onData) {
            const fileInput = modal.querySelector(`#${fileId}`);
            modal.querySelector(`#${btnId}`)?.addEventListener('click', () => fileInput?.click());
            fileInput?.addEventListener('change', e => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = ev => {
                    try {
                        const data = JSON.parse(ev.target.result);
                        if (data._source !== 'foldertube') throw new Error('Not a valid FolderTube backup file');
                        if (data._type && data._type !== expectedType)
                            throw new Error(`Expected a ${expectedType} backup, got "${data._type}"`);
                        onData(data);
                    } catch (err) {
                        alert('Import failed: ' + err.message);
                    } finally {
                        fileInput.value = '';
                    }
                };
                reader.readAsText(file);
            });
        }

        wireImport('ytt-btn-import-folders', 'ytt-import-folders-file', 'folders', data => {
            alert(
                `Found ${data.folders?.length ?? 0} folder(s).\n` +
                `Full restore coming in a future update.`
            );
        });

        wireImport('ytt-btn-import-subs', 'ytt-import-subs-file', 'subscriptions', data => {
            alert(
                `Found ${data.subscriptions?.length ?? 0} subscription(s).\n` +
                `Full restore coming in a future update.`
            );
        });
    }

    // ── Open / close ──────────────────────────────────────────────────────────

    function openModal() {
        if (document.getElementById('ytt-manager-backdrop')) return;

        // Detect language the same way the badge does
        let _lang = null;
        try { _lang = window.ytcfg?.get?.('HL'); } catch (_) {}
        if (!_lang) try { _lang = window.yt?.config_?.HL; } catch (_) {}
        if (!_lang) _lang = document.documentElement.lang || navigator.language || 'en';
        const t = getT(String(_lang).trim() || 'en');

        const backdrop = document.createElement('div');
        backdrop.className = 'ytt-manager-backdrop';
        backdrop.id = 'ytt-manager-backdrop';

        const modal = document.createElement('div');
        modal.className = 'ytt-manager-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-label', 'FolderTube Settings');
        modal.innerHTML = buildModalHTML(t);

        document.body.appendChild(backdrop);
        document.body.appendChild(modal);

        setupLogic(modal, t);

        const close = () => closeModal();
        backdrop.addEventListener('click', close);
        modal.querySelector('#ytt-mgr-close-btn').addEventListener('click', close);

        const onKey = e => {
            if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); }
        };
        document.addEventListener('keydown', onKey);
        modal._ytt_key_handler = onKey;
    }

    function closeModal() {
        const modal = document.querySelector('.ytt-manager-modal');
        if (modal?._ytt_key_handler) document.removeEventListener('keydown', modal._ytt_key_handler);
        document.getElementById('ytt-manager-backdrop')?.remove();
        modal?.remove();
    }

    // ── Trigger button injection ──────────────────────────────────────────────

    function buildButton() {
        const btn = document.createElement('button');
        btn.id = 'ytt-settings-btn';
        btn.className = 'ytt-btn';
        btn.title = 'FolderTube Settings';
        btn.setAttribute('aria-label', 'Open FolderTube Settings');
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
            <circle cx="12" cy="12" r="3"/></svg>`;
        btn.addEventListener('click', openModal);
        return btn;
    }

    function tryInject() {
        if (document.getElementById('ytt-settings-btn')) return true;
        const controls = document.querySelector('.ytt-badge-header-controls');
        if (!controls) return false;
        controls.insertBefore(buildButton(), controls.firstChild);
        return true;
    }

    function setup() {
        injectStyles();
        if (tryInject()) return;
        const observer = new MutationObserver(() => { if (tryInject()) observer.disconnect(); });
        observer.observe(document.documentElement, { childList: true, subtree: true });
        setTimeout(() => observer.disconnect(), 20000);
    }

    // ── SPA navigation & resilience ───────────────────────────────────────────

    window.addEventListener('yt-navigate-finish', () => setTimeout(tryInject, 300));
    setInterval(() => { if (!document.getElementById('ytt-settings-btn')) tryInject(); }, 3000);

    // ── Post-login sidebar restore ────────────────────────────────────────────
    // After logout+login the badge header is gone from the DOM (clearUI removed it).
    // tokenUpdated arrives from the background SW when the website logs the user back in.
    // Calling reformatGuide() re-injects the header; forceUpdateAuthStatus() reloads folders.
    chrome.runtime.onMessage.addListener(msg => {
        if (msg?.action === 'tokenUpdated' && (msg.access_token || msg.profile)) {
            setTimeout(() => {
                try {
                    const tm = window.tabManager;
                    if (!tm) return;
                    tm.reformatGuide?.();
                    tm.forceUpdateAuthStatus?.();
                } catch (_) {}
            }, 600);
        }
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setup);
    } else {
        setup();
    }
})();
