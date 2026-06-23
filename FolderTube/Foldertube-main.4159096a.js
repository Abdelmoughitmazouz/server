(function(){
if(typeof window==="undefined")return;
if(window.__yttUncatRender)return;

var style = document.createElement("style");
style.id = "ytt-runtime-styles";
style.textContent = `
    .tab.closed .ytt-folder-body,
    .tab.closed .tab-content,
    .tab.closed .folder-content,
    .tab.closed .ytt-folder-content,
    .tab.closed .children,
    .tab.closed .content,
    .tab.closed .badges-container,
    .ytt-uncategorized-tab.closed .ytt-uncategorized-body { 
        display: none !important; 
    }
    
    .tab:not(.closed) .ytt-folder-body,
    .ytt-uncategorized-tab:not(.closed) .ytt-uncategorized-body {
        display: block !important;
    }

    .ytt-synthetic-badge {
        color: var(--ytt-text, #f1f1f1) !important;
    }
    .ytt-synthetic-badge .channel-name,
    .ytt-uncat-more {
        color: var(--ytt-text, #f1f1f1) !important;
    }
    .ytt-synthetic-badge:hover {
        background: var(--ytt-hover, rgba(255,255,255,0.1)) !important;
    }
    .tab .expand-arrow, .tab .expand-arrow svg {
        color: var(--ytt-text, #fff) !important;
        fill: currentColor !important;
    }
`;
document.head.appendChild(style);

if (typeof window.__ytt_dragging === "undefined") window.__ytt_dragging = false;
document.addEventListener("dragstart", function(){ window.__ytt_dragging = true; }, true);
document.addEventListener("dragend", function(){ window.__ytt_dragging = false; }, true);
document.addEventListener("drop", function(){ window.__ytt_dragging = false; }, true);

function getFolderBody(folderEl) {
    if (!folderEl) return null;
    // Only use the explicit FolderTube-owned body; never match generic React class names
    // like .content, .children, .tab-content that exist in folder-bar's React tree.
    var body = folderEl.querySelector(".ytt-folder-body");
    if (body) return body;

    body = document.createElement("div");
    body.className = "ytt-folder-body";
    body.setAttribute("data-ytt-owned", "true");
    folderEl.appendChild(body);
    return body;
}

function dedupeFolderBody(body) {
    if (!body) return;
    var seen = new Set();
    // Only process FolderTube-owned elements; never touch React-rendered elements
    // or native YouTube nodes that may share the folder DOM tree.
    var owned = Array.from(body.querySelectorAll("[data-ytt-owned='true'], .ytt-synthetic-badge"));
    owned.forEach(function(el) {
        var id = el.dataset.channelId || el.id;
        if (!id || seen.has(id)) { el.remove(); return; }
        seen.add(id);
    });
}

function _isYouSection(s) {
    var titleEl = s.querySelector("#title, #guide-section-title, .title");
    var text = (titleEl ? titleEl.textContent : "").toLowerCase().trim();
    // "You" section title in English + common localisations
    if (text === "you" || text === "du" || text === "tú" || text === "vous" ||
        text === "tu" || text === "вы" || text === "você" || text === "أنت" ||
        text === "あなた" || text === "당신" || text === "你" ||
        text.indexOf("your channel") !== -1) return true;
    // Look for entries typical to the "You" section (localised keywords)
    var entries = s.querySelectorAll("ytd-guide-entry-renderer");
    for (var i = 0; i < entries.length; i++) {
        var et = entries[i].textContent.toLowerCase();
        if (et.indexOf("history") !== -1 || et.indexOf("watch later") !== -1 || et.indexOf("playlists") !== -1 ||
            et.indexOf("verlauf") !== -1 || et.indexOf("später") !== -1 ||
            et.indexOf("historique") !== -1 || et.indexOf("historial") !== -1 ||
            et.indexOf("cronologia") !== -1 || et.indexOf("история") !== -1 ||
            et.indexOf("izleme geçmişi") !== -1 || et.indexOf("履歴") !== -1 ||
            et.indexOf("시청 기록") !== -1 || et.indexOf("历史记录") !== -1) return true;
    }
    return false;
}

function _isSubscriptionsSection(s) {
    var titleEl = s.querySelector("#title, #guide-section-title, .title");
    var text = (titleEl ? titleEl.textContent : "").toLowerCase().trim();
    // English + localized subscription section titles across all supported languages
    if (text.indexOf("subscription") !== -1 || text === "subs" ||
        text === "abos" || text.indexOf("abonnement") !== -1 ||
        text.indexOf("abbonament") !== -1 || text.indexOf("suscripci") !== -1 ||
        text.indexOf("assinatura") !== -1 || text.indexOf("подписк") !== -1 ||
        text.indexOf("abone") !== -1 || text.indexOf("اشتراك") !== -1 ||
        text === "登録" || text.indexOf("登録") !== -1 ||
        text === "구독" || text.indexOf("구독") !== -1 ||
        text.indexOf("订阅") !== -1) return true;
    // YouTube's Subscriptions section header links to /feed/channels regardless of language
    var feedLink = s.querySelector('a[href*="feed/channels"], a[href*="feed/subscriptions"]');
    if (feedLink) return true;
    // Fallback: section contains many channel links and isn't the "You" section
    var channels = s.querySelectorAll('a[href^="/@"], a[href*="/channel/"]');
    return channels.length > 2 && !_isYouSection(s);
}

function _findSubscriptionSection() {
    try {
        var guide = document.querySelector("#guide-inner-content");
        if (!guide) return null;
        var sections = Array.from(guide.querySelectorAll("ytd-guide-section-renderer, ytd-guide-collapsible-section-entry-renderer"));
        for (var i = 0; i < sections.length; i++) {
            if (_isSubscriptionsSection(sections[i])) return sections[i];
        }
    } catch(e) {}
    return null;
}

function _findYouSection() {
    try {
        var guide = document.querySelector("#guide-inner-content");
        if (!guide) return null;
        var sections = Array.from(guide.querySelectorAll("ytd-guide-section-renderer, ytd-guide-collapsible-section-entry-renderer"));
        for (var i = 0; i < sections.length; i++) {
            if (_isYouSection(sections[i])) return sections[i];
        }
    } catch(e) {}
    return null;
}

function _isDivider(el) {
    if (!el) return false;
    var tag = el.tagName.toLowerCase();
    return tag.indexOf("divider") !== -1 || el.getAttribute("role") === "separator" || el.classList.contains("ytd-guide-divider-renderer");
}
var _DIRECT_ID_RE    = /^UC[\w-]{20,}$/;
var _CHANNEL_PATH_RE = /\/channel\/(UC[\w-]{20,})/;
var _HANDLE_RE       = /^\/@(.+)/;
var _NATIVE_HIDE_ATTR = "data-ytt-hidden";
var _nativeObserver = null;
var _nativeObserverDebounce = null;
var STORAGE_KEY="youtube_channel_groups";
var TAB_ID="ytt-uncategorized";
function _defaultData(){return{folders:[],channels:[],uncategorizedChannels:[]};}
async function loadChannelGroups(){try{var r=await chrome.storage.local.get(STORAGE_KEY);var d=r[STORAGE_KEY]||{};return{folders:Array.isArray(d.folders)?d.folders:[],channels:Array.isArray(d.channels)?d.channels:[],uncategorizedChannels:Array.isArray(d.uncategorizedChannels)?d.uncategorizedChannels:[]};}catch(e){return _defaultData();}}
async function saveChannelGroups(data){try{var p={};p[STORAGE_KEY]=data;await chrome.storage.local.set(p);}catch(_){}}
function getAssignedChannelIds(){
    var assigned = new Set();
    var tm = window.tabManager;
    if(tm && tm.tabData){
        for(var fid in tm.tabData){
            var f = tm.tabData[fid];
            var cids = f.channelIds || f.channels || f.badges || f.items || [];
            for(var i=0; i<cids.length; i++){
                var cid = cids[i];
                if(typeof cid === "string") assigned.add(cid);
                else if(cid && cid.id) assigned.add(cid.id);
                else if(cid && cid.channelId) assigned.add(cid.channelId);
            }
        }
    }
    return assigned;
}

function _findFolderForChannel(channelId) {
    var tm = window.tabManager;
    if (!tm || !tm.tabData) return null;
    for (var fid in tm.tabData) {
        if (fid === TAB_ID) continue;
        var f = tm.tabData[fid];
        var cids = f.channelIds || f.channels || f.badges || f.items || [];
        for (var i = 0; i < cids.length; i++) {
            var cid = cids[i];
            var id = typeof cid === "string" ? cid : (cid && (cid.id || cid.channelId));
            if (id === channelId) return fid;
        }
    }
    return null;
}

async function mergeFetchedChannelsIntoUncategorized(channels){
    if(!Array.isArray(channels)) return await loadChannelGroups();
    var data = await loadChannelGroups();
    data.channels = channels;
    var assigned = getAssignedChannelIds();
    data.uncategorizedChannels = channels.map(function(c){ return c && c.id; })
                                        .filter(function(id){ return id && !assigned.has(id); });
    await saveChannelGroups(data);
    return data;
}

async function syncFolderState() {
    var data = await loadChannelGroups();

    var assigned = new Set();

    if (window.tabManager && window.tabManager.tabData) {
        Object.values(window.tabManager.tabData).forEach(function(folder) {
            var channels = folder.channelIds || folder.channels || [];
            channels.forEach(function(ch) {
                if (typeof ch === "string") assigned.add(ch);
                else if (ch && ch.id) assigned.add(ch.id);
                else if (ch && ch.channelId) assigned.add(ch.channelId);
            });
        });
    }

    var allChannels = Array.isArray(data.channels) ? data.channels : [];

    data.uncategorizedChannels = allChannels
        .map(function(c) { return c && c.id; })
        .filter(function(id) { return id && !assigned.has(id); });

    await saveChannelGroups(data);

    return data;
}

var _uncatSyncDebounce = null;
async function onChannelAssignmentChanged(channelId, newFolderId) {
    if (!channelId) return;
    
    // If dragging, delay sync until after drag finishes
    if (window.__ytt_dragging) {
        if (_uncatSyncDebounce) clearTimeout(_uncatSyncDebounce);
        _uncatSyncDebounce = setTimeout(function(){
            onChannelAssignmentChanged(channelId, newFolderId);
        }, 350);
        return;
    }

    var data = await loadChannelGroups();
    if (!data.channels || data.channels.length === 0) return;
    
    var isUnassigned = (newFolderId === -1 || newFolderId === "-1" || newFolderId === null || newFolderId === undefined || newFolderId === "" || newFolderId === TAB_ID);
    var uncatIds = new Set(data.uncategorizedChannels || []);
    
    if (isUnassigned) {
        var isKnown = data.channels.some(function(c){ return c && c.id === channelId; });
        if (isKnown) uncatIds.add(channelId);
    } else {
        uncatIds.delete(channelId);
    }
    
    data.uncategorizedChannels = Array.from(uncatIds);
    await saveChannelGroups(data);
    
    var bc = window.tabManager && window.tabManager.badgeContainer;
    if (bc) {
        _renderUncategorized(bc);
    }
}
window.onChannelAssignmentChanged = onChannelAssignmentChanged;
function _createSyntheticBadge(channel, folderId){
    var el = document.createElement("a");
    el.className = "ytt-badge ytt-synthetic-badge";
    el.id = channel.id;
    el.dataset.channelId = channel.id;
    el.dataset.synthetic = "true";
    // data-ytt-owned marks this as a FolderTube-controlled element so that
    // deduplicate/integrity logic never confuses it with native YouTube nodes.
    el.setAttribute("data-ytt-owned", "true");
    if (folderId) el.setAttribute("data-folder-id", folderId);
    var hand = channel.handle;
    var href = channel.url || (hand ? ("/" + (hand.charAt(0) === "@" ? hand : "@" + hand)) : "/channel/" + channel.id);
    el.href = href;
    el.setAttribute("draggable", "true");
    el.title = channel.name || "";
    el.style.cssText = "display:flex;align-items:center;gap:12px;padding:4px 12px;text-decoration:none;color:var(--yt-spec-text-primary, #f1f1f1);cursor:grab;border-radius:6px;line-height:1.2;transition:background 0.2s;";
    
    var img = document.createElement("img");
    img.loading = "lazy";
    img.alt = "";
    img.style.cssText = "width:24px;height:24px;border-radius:50%;flex:0 0 24px;object-fit:cover;background:rgba(127,127,127,0.2);";
    if(channel.avatarUrl || channel.thumbnail) img.src = channel.avatarUrl || channel.thumbnail;
    
    var nameEl = document.createElement("span");
    nameEl.className = "channel-name";
    nameEl.textContent = channel.name || "";
    nameEl.style.cssText = "flex:1;min-width:0;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:inherit;";
    
    el.appendChild(img);
    el.appendChild(nameEl);
    
    el.addEventListener("dragstart", function(e){
        el.classList.add("dragging");
        try { e.dataTransfer.setData("text/plain", channel.id); } catch(_) {}
        if(e.dataTransfer) e.dataTransfer.effectAllowed = "move";
    });
    el.addEventListener("dragend", function(){ el.classList.remove("dragging"); });
    return el;
}
if(typeof window.__yttUncatExpanded === "undefined") window.__yttUncatExpanded = false;

function _getUncatLabel(count){var l=(window.ytt_language||'en').split('-')[0].toLowerCase();var m={de:'Nicht kategorisiert',ar:'غير مصنف',fr:'Non catégorisé',es:'Sin categoría',pt:'Sem categoria',it:'Non categorizzato',ru:'Без категории',tr:'Kategorisiz',ja:'未分類',ko:'미분류',zh:'未分类',nl:'Niet gecategoriseerd',pl:'Bez kategorii',sv:'Okategoriserade',da:'Ukategoriserede',fi:'Luokittelematon',nb:'Ukategorisert',cs:'Nezařazené',hu:'Kategorizálatlan',ro:'Necategorizate',el:'Χωρίς κατηγορία',he:'לא מסווג',iw:'לא מסווג',uk:'Без категорії',bg:'Некатегоризирани',vi:'Chưa phân loại',id:'Tidak berkategori',ms:'Tidak dikategorikan',th:'ไม่ได้จัดหมวดหมู่',hi:'अवर्गीकृत',fa:'دسته‌بندی نشده',sk:'Nezaradené',hr:'Nekategorizirano'};var base=m[l]||'Uncategorized';return count!==undefined?(base+' ('+count+')'): base;}
function _ensureUncatTab(c){
    var tab = document.getElementById(TAB_ID);
    if(tab) return tab;
    if(!c) return null;

    tab = document.createElement("div");
    tab.id = TAB_ID;
    tab.className = "ytt-uncategorized-tab ytt-folder-tab tab";
    tab.setAttribute("draggable", "false");
    tab.dataset.virtual = "true";
    tab.style.cssText = "display:block;margin:6px 0 2px 0;padding:0;border-left:3px solid var(--yt-spec-text-secondary, #888);";

    var hdr = document.createElement("div");
    hdr.className = "tab-menu folder-header";
    hdr.style.cssText = "display:flex;align-items:center;padding:8px 12px;cursor:pointer;user-select:none;border-radius:6px;";
    hdr.addEventListener("mouseenter", function(){ hdr.style.background = "var(--yt-spec-10-percent-layer, rgba(255,255,255,0.1))"; });
    hdr.addEventListener("mouseleave", function(){ hdr.style.background = ""; });

    var icon = document.createElement("div");
    icon.className = "tab-left-icon";
    icon.style.cssText = "width:24px;height:24px;margin-right:6px;display:flex;align-items:center;justify-content:center;color:var(--yt-spec-text-secondary, #888);flex:0 0 24px;";
    icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor" style="pointer-events: none; display: inherit; width: 100%; height: 100%;"><path d="M146.67-160q-27 0-46.84-20.17Q80-200.33 80-226.67v-506.66q0-26.34 19.83-46.5Q119.67-800 146.67-800H414l66.67 66.67h332.66q26.34 0 46.5 20.16Q880-693 880-666.67v440q0 26.34-20.17 46.5Q839.67-160 813.33-160H146.67Zm0-66.67h666.66v-440H453l-66.67-66.66H146.67v506.66Zm0 0v-506.66V-226.67Z"/></svg>`;

    var lbl = document.createElement("h3");
    lbl.className = "tab-menu-name";
    lbl.style.cssText = "flex:1;min-width:0;font-size:14px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin:0;color:inherit;";
    lbl.textContent = _getUncatLabel();

    var expand = document.createElement("button");
    expand.className = "tab-menu-btn expand-arrow";
    expand.style.cssText = "width:16px;height:16px;min-width:16px;padding:0;background:none;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:inherit;opacity:0.9;margin-left:6px;";

    var ICON_DOWN = `<svg xmlns="http://www.w3.org/2000/svg" height="16" viewBox="0 0 24 24" width="16" fill="currentColor" style="transition:transform .2s;display:block;transform:rotate(90deg)"><path d="M8.793 5.293a1 1 0 000 1.414L14.086 12l-5.293 5.293a1 1 0 101.414 1.414L16.914 12l-6.707-6.707a1 1 0 00-1.414 0Z"/></svg>`;
    var ICON_RIGHT = window.__ytt_rtl
        ? `<svg xmlns="http://www.w3.org/2000/svg" height="16" viewBox="0 0 24 24" width="16" fill="currentColor" style="transition:transform .2s;display:block;transform:scaleX(-1)"><path d="M8.793 5.293a1 1 0 000 1.414L14.086 12l-5.293 5.293a1 1 0 101.414 1.414L16.914 12l-6.707-6.707a1 1 0 00-1.414 0Z"/></svg>`
        : `<svg xmlns="http://www.w3.org/2000/svg" height="16" viewBox="0 0 24 24" width="16" fill="currentColor" style="transition:transform .2s;display:block"><path d="M8.793 5.293a1 1 0 000 1.414L14.086 12l-5.293 5.293a1 1 0 101.414 1.414L16.914 12l-6.707-6.707a1 1 0 00-1.414 0Z"/></svg>`;
    expand.innerHTML = window.__yttUncatExpanded ? ICON_DOWN : ICON_RIGHT;

    hdr.appendChild(icon);
    hdr.appendChild(lbl);
    hdr.appendChild(expand);
    
    var body = document.createElement("div");
    body.className = "ytt-uncategorized-body ytt-folder-body";
    body.style.cssText = "display:none;padding:2px 0 4px 0;";
    
    hdr.addEventListener("click", function(e){
        e.stopPropagation();
        window.__yttUncatExpanded = !window.__yttUncatExpanded;
        var bc = (window.tabManager && window.tabManager.badgeContainer) || c || tab.parentNode;
        window.__yttUncatRender && window.__yttUncatRender(bc);
    });

    tab.appendChild(hdr);
    tab.appendChild(body);
    
    tab.__lblEl = lbl;
    tab.__bodyEl = body;
    tab.__chevEl = expand;
    tab.__ICON_DOWN = ICON_DOWN;
    tab.__ICON_RIGHT = ICON_RIGHT;
    
    // Append to the FolderTube wrapper if possible, otherwise fallback to body 
    // so __yttRelocateUI can find and move it to the correct spot.
    var wrapper = document.getElementById("foldertube-existing-ui-wrapper");
    if (wrapper) {
        wrapper.appendChild(tab);
    } else {
        document.body.appendChild(tab);
    }

    return tab;
}

function _emptyBody(body){
    while(body && body.firstChild) body.removeChild(body.firstChild);
}

function _buildChannelLookup() {
    var lookup = new Map();
    var sm = window.subscriptionManager;
    if (!sm || !sm.getAll) return lookup;
    var all = sm.getAll();
    for (var i = 0; i < all.length; i++) {
        var ch = all[i];
        if (!ch || !ch.id) continue;
        lookup.set(ch.id, ch.id);
        if (ch.handle) {
            var h = ch.handle.charAt(0) === "@" ? ch.handle : "@" + ch.handle;
            lookup.set(h, ch.id);
            lookup.set("/" + h, ch.id);
        }
        if (ch.url) {
            lookup.set(ch.url, ch.id);
            var stripped = ch.url.replace(/\/$/, "");
            if (stripped !== ch.url) lookup.set(stripped, ch.id);
        }
    }
    return lookup;
}

function _collectNativeEntries(subSection) {
    var result = new Map();
    if (!subSection) return result;
    var lookup = _buildChannelLookup();
    var entries = subSection.querySelectorAll("ytd-guide-entry-renderer");
    for (var i = 0; i < entries.length; i++) {
        var el = entries[i];
        var channelId = null;
        if (el.dataset && el.dataset.channelId) {
            channelId = el.dataset.channelId;
        } else if (el.id && _DIRECT_ID_RE.test(el.id)) {
            channelId = el.id;
        } else {
            var anchor = el.querySelector("a[href]");
            if (anchor) {
                var href = anchor.getAttribute("href") || "";
                var m = href.match(_CHANNEL_PATH_RE);
                if (m) {
                    channelId = m[1];
                } else {
                    var hm = href.match(_HANDLE_RE);
                    if (hm) {
                        channelId = lookup.get("@" + hm[1]) || null;
                    } else {
                        channelId = lookup.get(href.split("?")[0].replace(/\/$/, "")) || null;
                    }
                }
            }
        }
        if (channelId) {
            if (el.dataset) el.dataset.channelId = channelId;
            if (!result.has(channelId)) result.set(channelId, el);
        }
    }
    return result;
}

function _buildOwnershipMap() {
    var map = new Map();
    var tm = window.tabManager;
    if (tm && tm.tabData) {
        for (var fid in tm.tabData) {
            if (fid === TAB_ID) continue;
            var f = tm.tabData[fid];
            var cids = f.channelIds || f.channels || f.badges || f.items || [];
            for (var i = 0; i < cids.length; i++) {
                var cid = cids[i];
                var id = typeof cid === "string" ? cid : (cid && (cid.id || cid.channelId)) || null;
                if (id) map.set(id, { location: "folder", folderId: fid });
            }
        }
    }
    var sm = window.subscriptionManager;
    if (sm && sm.getAll) {
        var all = sm.getAll();
        for (var j = 0; j < all.length; j++) {
            var ch = all[j];
            if (ch && ch.id && !map.has(ch.id)) {
                map.set(ch.id, { location: "uncategorized" });
            }
        }
    }
    return map;
}

function _applyNativeHiding(nativeMap, ownershipMap) {
    nativeMap.forEach(function(el, channelId) {
        if (ownershipMap.has(channelId)) {
            if (el.style.display !== "none") {
                el.style.display = "none";
                el.setAttribute(_NATIVE_HIDE_ATTR, "1");
            }
        } else {
            if (el.getAttribute(_NATIVE_HIDE_ATTR)) {
                el.style.display = "";
                el.removeAttribute(_NATIVE_HIDE_ATTR);
            }
        }
    });
}

function _startNativeObserver(subSection) {
    if (_nativeObserver) { _nativeObserver.disconnect(); _nativeObserver = null; }
    if (_nativeObserverDebounce) { clearTimeout(_nativeObserverDebounce); _nativeObserverDebounce = null; }
    if (!subSection) return;
    var itemsContainer = subSection.querySelector("#items");
    if (!itemsContainer) return;
    _nativeObserver = new MutationObserver(function(mutations) {
        var relevant = false;
        for (var i = 0; i < mutations.length && !relevant; i++) {
            var added = mutations[i].addedNodes;
            for (var j = 0; j < added.length; j++) {
                var node = added[j];
                if (node.nodeType !== 1) continue;
                // Skip FolderTube-owned nodes to prevent re-import loops when
                // synthetic badges are inserted inside #items via __yttRelocateUI.
                if (node.getAttribute && node.getAttribute("data-ytt-owned")) continue;
                if (node.id === "foldertube-existing-ui-wrapper") continue;
                if (node.tagName === "YTD-GUIDE-ENTRY-RENDERER" ||
                    (node.querySelector && node.querySelector("ytd-guide-entry-renderer"))) {
                    relevant = true; break;
                }
            }
        }
        if (!relevant) return;
        if (_nativeObserverDebounce) clearTimeout(_nativeObserverDebounce);
        _nativeObserverDebounce = setTimeout(function() {
            _nativeObserverDebounce = null;
            try {
                var nm = _collectNativeEntries(subSection);
                var om = _buildOwnershipMap();
                _applyNativeHiding(nm, om);
            } catch(e) {}
        }, 80);
    });
    _nativeObserver.observe(itemsContainer, { childList: true, subtree: true });
}

function _renderRealFolders(channelMap) {
    var tm = window.tabManager;
    if (!tm || !tm.tabData) return;
    // globalSeen prevents the same channel from appearing in more than one folder.
    var globalSeen = new Set();
    for (var fid in tm.tabData) {
        if (fid === TAB_ID) continue;
        var folderEl = document.getElementById(fid);
        if (!folderEl) continue;
        var body = getFolderBody(folderEl);
        if (!body) continue;

        // Clear only FolderTube-owned elements; leave React-rendered structure untouched.
        // Re-render entirely from canonical tabData, never from the current DOM.
        var toRemove = Array.from(body.querySelectorAll("[data-ytt-owned='true'], .ytt-synthetic-badge"));
        for (var r = 0; r < toRemove.length; r++) toRemove[r].remove();

        var f = tm.tabData[fid];
        var cids = f.channelIds || f.channels || f.badges || f.items || [];
        // Deduplicate within this folder and across all folders before touching the DOM.
        var folderSeen = new Set();
        for (var j = 0; j < cids.length; j++) {
            var cid = cids[j];
            var id = typeof cid === "string" ? cid : (cid && (cid.id || cid.channelId)) || null;
            if (!id || folderSeen.has(id) || globalSeen.has(id)) continue;
            folderSeen.add(id);
            globalSeen.add(id);
            var chData = channelMap.get(id);
            if (chData) body.appendChild(_createSyntheticBadge(chData, fid));
        }
    }
}

function _validateBadges() {
    if (window.__ytt_dragging) return;
    // Scope to the FolderTube wrapper only; never inspect the native YouTube sidebar.
    // Never move elements — only remove extra copies. The canonical source is tabData,
    // and a full re-render via _renderRealFolders fixes structural issues.
    var wrapper = document.getElementById("foldertube-existing-ui-wrapper");
    if (!wrapper) return;
    var allOwned = wrapper.querySelectorAll("[data-ytt-owned='true'], .ytt-synthetic-badge");
    var byId = {};
    allOwned.forEach(function(badge) {
        var id = badge.dataset.channelId || badge.id;
        if (!id) return;
        if (!byId[id]) byId[id] = [];
        byId[id].push(badge);
    });
    for (var id in byId) {
        var group = byId[id];
        // Keep first (earliest in DOM order); remove all subsequent duplicates.
        for (var j = 1; j < group.length; j++) {
            group[j].remove();
        }
    }
}

function _renderUncatBody(body, ids, channelById) {
    var BATCH = window.__yttRenderAll ? ids.length : 300;
    var limit = Math.min(ids.length, BATCH);
    _emptyBody(body);
    for (var x = 0; x < limit; x++) {
        var chData = channelById.get(ids[x]);
        if (chData) body.appendChild(_createSyntheticBadge(chData, TAB_ID));
    }
    var remaining = ids.length - limit;
    if (remaining > 0 && !window.__yttRenderAll) {
        var moreEl = document.createElement("div");
        moreEl.className = "ytt-uncat-more";
        moreEl.style.cssText = "padding:10px 12px;font-size:13px;opacity:.7;cursor:pointer;text-align:center;border-radius:6px;margin:8px 12px;background:var(--yt-spec-10-percent-layer, rgba(255,255,255,0.08));transition:background .2s;color:var(--yt-spec-text-primary, #f1f1f1);";
        moreEl.textContent = "Show " + remaining + " more channels...";
        moreEl.addEventListener("mouseenter", function(){ moreEl.style.background = "var(--yt-spec-badge-chip-background, rgba(255,255,255,0.15))"; });
        moreEl.addEventListener("mouseleave", function(){ moreEl.style.background = "var(--yt-spec-10-percent-layer, rgba(255,255,255,0.08))"; });
        moreEl.addEventListener("click", function(e){
            e.stopPropagation();
            window.__yttRenderAll = true;
            _renderUncatBody(body, ids, channelById);
        });
        body.appendChild(moreEl);
    }
}

function _runIntegrityCheck() {
    if (window.__ytt_dragging) return;
    var tm = window.tabManager;
    if (!tm || !tm.tabData) return;
    var allSeen = new Set(); // tracks channelIds rendered across all folders
    var needsRebuild = false;
    for (var fid in tm.tabData) {
        if (fid === TAB_ID) continue;
        var folderEl = document.getElementById(fid);
        if (!folderEl) continue;
        var body = getFolderBody(folderEl);
        if (!body) continue;
        var f = tm.tabData[fid];
        var rawIds = f.channelIds || f.channels || f.badges || f.items || [];
        // Expected count: unique channel IDs for this folder (excluding any already rendered elsewhere)
        var expected = new Set();
        for (var x = 0; x < rawIds.length; x++) {
            var cid = rawIds[x];
            var rid = typeof cid === "string" ? cid : (cid && (cid.id || cid.channelId)) || null;
            if (rid && !allSeen.has(rid)) expected.add(rid);
        }
        var ownedEls = Array.from(body.querySelectorAll("[data-ytt-owned='true'], .ytt-synthetic-badge"));
        var domSeen = new Set();
        ownedEls.forEach(function(el) {
            var id = el.dataset.channelId || el.id;
            if (!id) { el.remove(); return; }
            // Remove cross-folder duplicates and intra-folder duplicates
            if (domSeen.has(id) || allSeen.has(id)) { el.remove(); return; }
            domSeen.add(id);
            allSeen.add(id);
        });
        if (domSeen.size !== expected.size) needsRebuild = true;
    }
    if (needsRebuild) {
        try {
            var bc = window.tabManager && window.tabManager.badgeContainer;
            if (bc && window.__yttUncatRender) window.__yttUncatRender(bc);
        } catch(_) {}
    }
}

async function _renderUncategorized(c){
    if (window.__ytt_dragging) return;
    var data;
    try { data = await loadChannelGroups(); } catch(_) { data = _defaultData(); }

    if (window.tabManager && data.channels && data.channels.length > 0) {
        try { await syncFolderState(); data = await loadChannelGroups(); } catch(_) {}
    }

    // Hide all native ytd-guide-entry-renderer elements for owned channels
    var subSection = _findSubscriptionSection();
    var nativeMap  = _collectNativeEntries(subSection);
    var ownershipMap = _buildOwnershipMap();
    _applyNativeHiding(nativeMap, ownershipMap);
    _startNativeObserver(subSection);

    var ids = data.uncategorizedChannels || [];
    var channelById = new Map((data.channels || []).map(function(ch){ return [ch.id, ch]; }));

    _renderRealFolders(channelById);

    if (ids.length === 0) {
        var existing = document.getElementById(TAB_ID);
        if (existing) existing.remove();
        return;
    }

    var tab = _ensureUncatTab(c);
    if (!tab) return;

    if (tab.__lblEl) tab.__lblEl.textContent = _getUncatLabel(ids.length);
    var body = tab.__bodyEl;

    if (window.__yttUncatExpanded) {
        tab.classList.remove("closed");
        if (body) body.style.display = "block";
        if (tab.__chevEl) tab.__chevEl.innerHTML = tab.__ICON_DOWN;
        _renderUncatBody(body, ids, channelById);
    } else {
        tab.classList.add("closed");
        if (body) body.style.display = "none";
        if (tab.__chevEl) tab.__chevEl.innerHTML = tab.__ICON_RIGHT;
        _emptyBody(body);
    }
    _validateBadges();
    _runIntegrityCheck();
}

window.__yttUncatRender = function(c){
    Promise.resolve().then(function(){
        return _renderUncategorized(c);
    }).catch(function(e){
        try { console.warn("[FolderTube] Uncat render error:", e); } catch(_) {}
    });
};
window.__yttChannelGroups={load:loadChannelGroups,save:saveChannelGroups,merge:mergeFetchedChannelsIntoUncategorized,sync:syncFolderState};
window.__yttRelocateUI=function(){try{var subSection=_findSubscriptionSection();if(!subSection)return;var nativeItems=subSection.querySelector("#items");if(!nativeItems)return;var wrapper=document.getElementById("foldertube-existing-ui-wrapper");if(!wrapper){wrapper=document.createElement("div");wrapper.id="foldertube-existing-ui-wrapper";}if(wrapper.parentNode!==nativeItems){nativeItems.appendChild(wrapper);console.log("[FolderTube] UI relocated inside Subscriptions #items");}var tm=window.tabManager;var header=(tm&&tm.badgeHeader)||document.querySelector(".ytt-badge-header");var tabs=((tm&&Array.isArray(tm.tabs))?tm.tabs.slice():Array.from(document.querySelectorAll(".ytt-folder-tab"))).filter(function(t){return t&&t.id!==TAB_ID;});var uncat=document.getElementById(TAB_ID);var desired=[];if(header)desired.push(header);var form=document.querySelector(".tab-creation-form");if(form)desired.push(form);for(var t=0;t<tabs.length;t++){var tt=tabs[t];if(tt&&tt.nodeType===1)desired.push(tt);}if(uncat)desired.push(uncat);var needs=wrapper.children.length!==desired.length;if(!needs){for(var i=0;i<desired.length;i++){if(wrapper.children[i]!==desired[i]){needs=true;break;}}}if(needs){for(var j=0;j<desired.length;j++)wrapper.appendChild(desired[j]);}}catch(_){}};
var _yttRelocateDebounce=null;
function _scheduleRelocate(){if(_yttRelocateDebounce)return;_yttRelocateDebounce=setTimeout(function(){_yttRelocateDebounce=null;window.__yttRelocateUI&&window.__yttRelocateUI();},80);}
function _refreshUncatAndRelocate(){try{var bc=window.tabManager&&window.tabManager.badgeContainer;if(bc)window.__yttUncatRender(bc);window.__yttRelocateUI&&window.__yttRelocateUI();}catch(_){}}
document.addEventListener("YTT_SUBSCRIPTIONS_UPDATED",function(){try{var all=(window.subscriptionManager&&window.subscriptionManager.getAll&&window.subscriptionManager.getAll())||[];if(all.length===0)return;mergeFetchedChannelsIntoUncategorized(all).then(_refreshUncatAndRelocate);}catch(_){}});
document.addEventListener("ELEMENT_REORDERED",function(e){
    try {
        var d = e && e.detail;
        if (d && d.elementType === "badge" && d.channelId) {
            onChannelAssignmentChanged(d.channelId, d.tabId);
        }
        setTimeout(_refreshUncatAndRelocate, 50);
    } catch(_) { _refreshUncatAndRelocate(); }
});

document.addEventListener("CHANNEL_MOVED",function(e){
    try {
        var d = e && e.detail;
        if (d && d.channelId) {
            onChannelAssignmentChanged(d.channelId, d.tabId);
        }
        setTimeout(_refreshUncatAndRelocate, 50);
    } catch(_) { _refreshUncatAndRelocate(); }
});
document.addEventListener("TAB_DELETED",function(){try{setTimeout(function(){syncFolderState().then(_refreshUncatAndRelocate).catch(function(){_refreshUncatAndRelocate();});},120);}catch(_){}});
document.addEventListener("TAB_CREATED",function(){try{setTimeout(function(){syncFolderState().then(_refreshUncatAndRelocate).catch(function(){_refreshUncatAndRelocate();});},120);}catch(_){}});
try{if(chrome&&chrome.storage&&chrome.storage.onChanged){chrome.storage.onChanged.addListener(function(changes,area){if(area==="local"&&changes&&changes[STORAGE_KEY]){_refreshUncatAndRelocate();}});}}catch(_){}
setTimeout(function(){try{var all=(window.subscriptionManager&&window.subscriptionManager.getAll&&window.subscriptionManager.getAll())||[];if(all.length>0){mergeFetchedChannelsIntoUncategorized(all).then(_refreshUncatAndRelocate);}}catch(_){}},2500);
setTimeout(function(){try{var all=(window.subscriptionManager&&window.subscriptionManager.getAll&&window.subscriptionManager.getAll())||[];if(all.length>0){mergeFetchedChannelsIntoUncategorized(all).then(_refreshUncatAndRelocate);}}catch(_){}},8000);
document.addEventListener("yt-navigate-finish",function(){
    [500, 1500, 3000, 6000].forEach(function(ms){
        setTimeout(function(){ window.__yttRelocateUI && window.__yttRelocateUI(); }, ms);
    });
});
window.addEventListener("yt-navigate-finish",function(){
    setTimeout(function(){ window.__yttRelocateUI && window.__yttRelocateUI(); }, 600);
});
document.addEventListener("yt-navigate-start", function() {
    if (_nativeObserver) { _nativeObserver.disconnect(); _nativeObserver = null; }
});
(function() {
    var _lastThemeState = null;
    function _isDarkMode() {
        var html = document.documentElement;
        var darkAttr = html.getAttribute("dark");
        if (darkAttr === "" || darkAttr === "true") return true;
        if (html.classList.contains("dark")) return true;
        var app = document.querySelector("ytd-app");
        if (app) {
            var appDark = app.getAttribute("dark");
            if (appDark === "" || appDark === "true") return true;
        }
        try {
            var bg = getComputedStyle(html).getPropertyValue("--yt-spec-base-background").trim();
            if (bg) return !(bg.startsWith("#f") || bg.startsWith("#e") || bg === "white" || bg === "rgb(255, 255, 255)" || bg === "rgb(255,255,255)");
        } catch(_) {}
        return false;
    }
    function _detectAndApplyTheme() {
        try {
            var isDark = _isDarkMode();
            var isLight = !isDark;
            if (_lastThemeState === isLight) return;
            _lastThemeState = isLight;
            document.body.classList.toggle("ytt-light-theme", isLight);
            document.body.classList.toggle("ytt-dark-theme", isDark);
        } catch(_) {}
    }
    function _startThemeObserver() {
        var html = document.documentElement;
        var obs = new MutationObserver(function() { setTimeout(_detectAndApplyTheme, 50); });
        obs.observe(html, { attributes: true, attributeFilter: ["dark", "class", "style"] });
        var app = document.querySelector("ytd-app");
        if (app) obs.observe(app, { attributes: true, attributeFilter: ["dark", "class"] });
    }
    _detectAndApplyTheme();
    if (document.readyState === "complete" || document.readyState === "interactive") {
        _startThemeObserver();
    } else {
        document.addEventListener("DOMContentLoaded", _startThemeObserver);
    }
    document.addEventListener("yt-navigate-finish", function() {
        setTimeout(_detectAndApplyTheme, 200);
        setTimeout(_detectAndApplyTheme, 1000);
    });
})();
window.__yttScheduleRelocate=_scheduleRelocate;
})();
var e,t;"function"==typeof(e=globalThis.define)&&(t=e,e=null),function(t,a,n,i,r){var o="undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:"undefined"!=typeof window?window:"undefined"!=typeof global?global:{},l="function"==typeof o[i]&&o[i],s=l.cache||{},d="undefined"!=typeof module&&"function"==typeof module.require&&module.require.bind(module);function c(e,a){if(!s[e]){if(!t[e]){var n="function"==typeof o[i]&&o[i];if(!a&&n)return n(e,!0);if(l)return l(e,!0);if(d&&"string"==typeof e)return d(e);var r=Error("Cannot find module '"+e+"'");throw r.code="MODULE_NOT_FOUND",r}u.resolve=function(a){var n=t[e][1][a];return null!=n?n:a},u.cache={};var h=s[e]=new c.Module(e);t[e][0].call(h.exports,u,h,h.exports,this)}return s[e].exports;function u(e){var t=u.resolve(e);return!1===t?{}:c(t)}}c.isParcelRequire=!0,c.Module=function(e){this.id=e,this.bundle=c,this.exports={}},c.modules=t,c.cache=s,c.parent=l,c.register=function(e,a){t[e]=[function(e,t){t.exports=a},{}]},Object.defineProperty(c,"root",{get:function(){return o[i]}}),o[i]=c;for(var h=0;h<a.length;h++)c(a[h]);if(n){var u=c(n);"object"==typeof exports&&"undefined"!=typeof module?module.exports=u:"function"==typeof e&&e.amd?e(function(){return u}):r&&(this[r]=u)}}({"8tF78":[function(e,t,a){var n=window.subscriptionManager;function i(e){return"string"==typeof e&&/^UC[\w-]{20,}$/.test(e)}function r(){let e="undefined"!=typeof Storage?Storage.channelId:null;if(i(e))return e;let t="undefined"!=typeof ChannelManager?ChannelManager.getChannelId():null;return i(t)?t:null}function o(){return"undefined"!=typeof ChannelManager?ChannelManager.init({timeoutMs:0}):Promise.resolve(null)}async function l(){if(window.FolderTubeApi?.refreshAuthState&&await window.FolderTubeApi.refreshAuthState().catch(()=>!1),window.FolderTubeApi&&window.FolderTubeApi.isAuthenticated())return!0;let e=await chrome.storage.local.get(["accessToken","refreshToken"]);return!!(e.accessToken||e.refreshToken)}function s(e){if("string"==typeof e){let t=Date.parse(e);if(Number.isFinite(t))return new Date(t).toISOString()}return new Date().toISOString()}function d(e,t="#e3e3e3"){let a=/^#[0-9a-fA-F]{6}$/.test(t)?t.toLowerCase():"#e3e3e3";if("string"!=typeof e||!e.trim())return a;let n=e.trim();if(/^#[0-9a-fA-F]{6}$/.test(n))return n.toLowerCase();if(/^#[0-9a-fA-F]{3}$/.test(n))return"#"+n.slice(1).split("").map(e=>e+e).join("").toLowerCase();if(/^#[0-9a-fA-F]{8}$/.test(n))return("#"+n.slice(1,7)).toLowerCase();try{var i,r;let e=(i={aliceblue:"#f0f8ff",antiquewhite:"#faebd7",aqua:"#00ffff",aquamarine:"#7fffd4",azure:"#f0ffff",beige:"#f5f5dc",bisque:"#ffe4c4",black:"#000000",blanchedalmond:"#ffebcd",blue:"#0000ff",blueviolet:"#8a2be2",brown:"#a52a2a",burlywood:"#deb887",cadetblue:"#5f9ea0",chartreuse:"#7fff00",chocolate:"#d2691e",coral:"#ff7f50",cornflowerblue:"#6495ed",cornsilk:"#fff8dc",crimson:"#dc143c",cyan:"#00ffff",darkblue:"#00008b",darkcyan:"#008b8b",darkgoldenrod:"#b8860b",darkgray:"#a9a9a9",darkgreen:"#006400",darkkhaki:"#bdb76b",darkmagenta:"#8b008b",darkolivegreen:"#556b2f",darkorange:"#ff8c00",darkorchid:"#9932cc",darkred:"#8b0000",darksalmon:"#e9967a",darkseagreen:"#8fbc8f",darkslateblue:"#483d8b",darkslategray:"#2f4f4f",darkturquoise:"#00ced1",darkviolet:"#9400d3",deeppink:"#ff1493",deepskyblue:"#00bfff",dimgray:"#696969",dodgerblue:"#1e90ff",firebrick:"#b22222",floralwhite:"#fffaf0",forestgreen:"#228b22",fuchsia:"#ff00ff",gainsboro:"#dcdcdc",ghostwhite:"#f8f8ff",gold:"#ffd700",goldenrod:"#daa520",gray:"#808080",green:"#008000",greenyellow:"#adff2f",honeydew:"#f0fff0",hotpink:"#ff69b4","indianred ":"#cd5c5c",indigo:"#4b0082",ivory:"#fffff0",khaki:"#f0e68c",lavender:"#e6e6fa",lavenderblush:"#fff0f5",lawngreen:"#7cfc00",lemonchiffon:"#fffacd",lightblue:"#add8e6",lightcoral:"#f08080",lightcyan:"#e0ffff",lightgoldenrodyellow:"#fafad2",lightgrey:"#d3d3d3",lightgreen:"#90ee90",lightpink:"#ffb6c1",lightsalmon:"#ffa07a",lightseagreen:"#20b2aa",lightskyblue:"#87cefa",lightslategray:"#778899",lightsteelblue:"#b0c4de",lightyellow:"#ffffe0",lime:"#00ff00",limegreen:"#32cd32",linen:"#faf0e6",magenta:"#ff00ff",maroon:"#800000",mediumaquamarine:"#66cdaa",mediumblue:"#0000cd",mediumorchid:"#ba55d3",mediumpurple:"#9370d8",mediumseagreen:"#3cb371",mediumslateblue:"#7b68ee",mediumspringgreen:"#00fa9a",mediumturquoise:"#48d1cc",mediumvioletred:"#c71585",midnightblue:"#191970",mintcream:"#f5fffa",mistyrose:"#ffe4e1",moccasin:"#ffe4b5",navajowhite:"#ffdead",navy:"#000080",oldlace:"#fdf5e6",olive:"#808000",olivedrab:"#6b8e23",orange:"#ffa500",orangered:"#ff4500",orchid:"#da70d6",palegoldenrod:"#eee8aa",palegreen:"#98fb98",paleturquoise:"#afeeee",palevioletred:"#d87093",papayawhip:"#ffefd5",peachpuff:"#ffdab9",peru:"#cd853f",pink:"#ffc0cb",plum:"#dda0dd",powderblue:"#b0e0e6",purple:"#800080",rebeccapurple:"#663399",red:"#ff0000",rosybrown:"#bc8f8f",royalblue:"#4169e1",saddlebrown:"#8b4513",salmon:"#fa8072",sandybrown:"#f4a460",seagreen:"#2e8b57",seashell:"#fff5ee",sienna:"#a0522d",silver:"#c0c0c0",skyblue:"#87ceeb",slateblue:"#6a5acd",slategray:"#708090",snow:"#fffafa",springgreen:"#00ff7f",steelblue:"#4682b4",tan:"#d2b48c",teal:"#008080",thistle:"#d8bfd8",tomato:"#ff6347",turquoise:"#40e0d0",violet:"#ee82ee",wheat:"#f5deb3",white:"#ffffff",whitesmoke:"#f5f5f5",yellow:"#ffff00",yellowgreen:"#9acd32"},""==n?i.firebrick:void 0!==i[n.toLowerCase()]?i[n.toLowerCase()]:(r=n,null===(r=r.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)/))&&(r=[0,0,0]),"#"+A(r[1])+A(r[2])+A(r[3])));if(/^#[0-9a-fA-F]{6}$/.test(e))return e.toLowerCase()}catch(e){}return a}async function c(e){let t=window.FolderTubeApi?.refreshAuthState?await window.FolderTubeApi.refreshAuthState().catch(()=>window.FolderTubeApi?.isAuthenticated?.()||!1):!!window.FolderTubeApi?.isAuthenticated?.(),a=!1;try{a=await l()}catch(e){}let n="undefined"!=typeof SupabaseAuth?SupabaseAuth._session:null;return{reason:e,channelId:r(),bridgeReady:!!(void 0!==w&&w.isReady),folderTubeApiAuthenticated:t,hasStoredApiTokens:a,hasSupabaseAuthSession:!!n,sessionSource:n?.source||null,profileEmail:n?.profile?.email||n?.user?.email||null,serverFolderStateLoaded:!!window.tabManager?._serverFolderStateLoaded}}function h(){if(document.getElementById("ytt-channel-waiting-state"))return;let e=document.createElement("div");e.id="ytt-channel-waiting-state",e.textContent="Loading FolderTube folders...",e.style.cssText="position:fixed;right:16px;bottom:16px;z-index:2147483647;padding:10px 12px;border-radius:8px;background:#0f0f0f;color:#fff;font:500 13px/1.3 Roboto, Arial, sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.25)",document.documentElement.appendChild(e)}function u(){document.getElementById("ytt-channel-waiting-state")?.remove()}function g(){document.getElementById("ytt-extension-update-state")?.remove()}function m(e,t="success"){let a=document.createElement("div");a.textContent=e,a.style.cssText=`
    position: fixed;
    bottom: 20px;
    right: 20px;
    background-color: ${"success"===t?"#4CAF50":"#f44336"};
    color: white;
    padding: 12px 20px;
    border-radius: 4px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    z-index: 9999999;
    font-family: 'Roboto', Arial, sans-serif;
    font-size: 14px;
  `,document.body.appendChild(a),setTimeout(()=>{a.style.opacity="0",a.style.transition="opacity 0.3s ease",setTimeout(()=>a.remove(),300)},3e3)}function p(){let e;if(!window.location.href.includes("youtube.com/channel")&&!window.location.href.includes("youtube.com/@")&&!window.location.href.includes("youtube.com/watch")||document.querySelector("#yt-folder-icon-btn"))return;if(!(e=window.location.href.includes("youtube.com/watch")?document.querySelector("#subscribe-button")||document.querySelector("ytd-subscribe-button-renderer")||document.querySelector("#owner ytd-button-renderer"):document.querySelector("#subscribe-button")||document.querySelector("ytd-subscribe-button-renderer")||document.querySelector("#channel-header ytd-button-renderer"))){console.log("Subscribe button not found, will try again later");return}let t=!1,a=e.querySelector("button[aria-label]");if(a){let e=a.getAttribute("aria-label")||"";t=!e.toLowerCase().startsWith("subscribe")}if(!t){let a=e.textContent||"";t=a.toLowerCase().includes("subscribed")||a.toLowerCase().includes("subscriber")}if(t||(t=e.classList.contains("subscribed")||null!==e.querySelector(".subscribed")),!t){console.log("Not subscribed to this channel");return}console.log("User is subscribed, adding folder button");let n=function(){let e=window.location.href,t=e.match(/youtube\.com\/channel\/(UC[a-zA-Z0-9_-]+)/);if(t)return t[1];let a=e.match(/youtube\.com\/@([a-zA-Z0-9_-]+)/);if(a){let e=document.querySelector('meta[itemprop="channelId"]');if(e)return e.getAttribute("content");let t=document.querySelector('link[rel="canonical"]');if(t){let e=t.getAttribute("href"),a=e.match(/youtube\.com\/channel\/(UC[a-zA-Z0-9_-]+)/);if(a)return a[1]}let a=document.querySelectorAll('a[href*="/channel/"]');for(let e of a){let t=e.getAttribute("href"),a=t.match(/\/channel\/(UC[a-zA-Z0-9_-]+)/);if(a)return a[1]}}if(e.includes("youtube.com/watch")){let e=document.querySelector('#owner #channel-name a, #owner a[href*="/channel/"]');if(e){let t=e.getAttribute("href"),a=t.match(/\/channel\/(UC[a-zA-Z0-9_-]+)/);if(a)return a[1]}let t=document.querySelector('[itemtype="http://schema.org/VideoObject"] [itemprop="channelId"]');if(t)return t.getAttribute("content");let a=document.querySelectorAll('#meta a[href*="/channel/"]');for(let e of a){let t=e.getAttribute("href"),a=t.match(/\/channel\/(UC[a-zA-Z0-9_-]+)/);if(a)return a[1]}let n=document.querySelectorAll('#description a[href*="/channel/"]');for(let e of n){let t=e.getAttribute("href"),a=t.match(/\/channel\/(UC[a-zA-Z0-9_-]+)/);if(a)return a[1]}let i=document.documentElement.innerHTML,r=i.match(/"channelId":"(UC[a-zA-Z0-9_-]+)"/);if(r)return r[1];console.log("Could not find channel ID using any method")}return null}();if(!n){console.error("Could not determine channel ID");return}let i=Storage.getLocal("ytt-badges")||{},r=i[n]?.tabID||null,o="";if(r&&-1!==r){let e=Storage.getLocal("ytt-tabs")||{};o=e[r]?.name||e[r]?.title||""}let l=function(){let e=document.createElement("button");return e.innerHTML=`
    <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3">
      <path d="M560-320h80v-80h80v-80h-80v-80h-80v80h-80v80h80v80ZM160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h240l80 80h320q33 0 56.5 23.5T880-640v400q0 33-23.5 56.5T800-160H160Zm0-80h640v-400H447l-80-80H160v480Zm0 0v-480 480Z"/>
    </svg>
  `,e.style.cssText=`
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    margin-left: 8px;
    display: flex;
    align-items: center;
  `,e.title="Add to Folder",e}();if(l.id="yt-folder-icon-btn",o){l.setAttribute("data-folder-name",o);let e=document.createElement("span");e.style.cssText=`
      position: absolute;
      top: -2px;
      right: -2px;
      width: 6px;
      height: 6px;
      background-color: #3ea6ff;
      border-radius: 50%;
    `,l.appendChild(e)}l.addEventListener("click",e=>{e.stopPropagation(),n?function(e,t){let a=function(){let e=Storage.getLocal("ytt-tabs")||{};return Object.entries(e).map(([e,t])=>({id:e,name:t.name||t.title,color:t.color}))}();if(0===a.length){alert("You don't have any folders yet. Create folders in the subscriptions section first.");return}let n=Storage.getLocal("ytt-badges")||{},i=n[t]?.tabID||null,r=document.createElement("div");r.className="yt-folder-menu",r.style.cssText=`
    position: absolute;
    background: #282828;
    color: white;
    border-radius: 8px;
    min-width: 220px;
    padding: 8px 0;
    top: ${e.getBoundingClientRect().bottom+window.scrollY}px;
    left: ${e.getBoundingClientRect().left+window.scrollX}px;
    z-index: 999999;
    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
  `;let o=document.createElement("div");o.textContent="Add to folder",o.style.cssText=`
    padding: 10px 16px;
    font-weight: 500;
    border-bottom: 1px solid #3e3e3e;
    margin-bottom: 8px;
  `,r.appendChild(o);let l=document.createElement("div");l.style.cssText=`
    padding: 10px 16px;
    cursor: pointer;
    white-space: nowrap;
    display: flex;
    align-items: center;
    justify-content: space-between;
  `;let s=document.createElement("span");if(s.textContent="None",l.appendChild(s),-1===i||null===i){let e=document.createElement("span");e.innerHTML=`
      <svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 0 24 24" width="18px" fill="#FFFFFF">
        <path d="M0 0h24v24H0z" fill="none"/>
        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
      </svg>
    `,l.appendChild(e)}l.addEventListener("click",()=>{if(n[t]){let e=n[t].tabID;n[t].previousTabID=e,n[t].tabID=-1;let a=new CustomEvent("CHANNEL_MOVED",{detail:{channelId:t,folderId:-1,previousFolderId:e}});document.dispatchEvent(a),"undefined"!=typeof EventManager&&EventManager.emit("CHANNEL_MOVED",{channelId:t,folderId:-1,previousFolderId:e}),m("Channel removed from folder")}r.remove()}),l.addEventListener("mouseenter",()=>{l.style.backgroundColor="#3e3e3e"}),l.addEventListener("mouseleave",()=>{l.style.backgroundColor="transparent"}),r.appendChild(l);let d=document.createElement("div");d.style.cssText=`
    height: 1px;
    background-color: #3e3e3e;
    margin: 4px 0;
  `,r.appendChild(d),a.forEach(e=>{let a=document.createElement("div");a.style.cssText=`
      padding: 10px 16px;
      cursor: pointer;
      white-space: nowrap;
      display: flex;
      align-items: center;
      justify-content: space-between;
    `;let n=document.createElement("div");n.style.cssText=`
      display: flex;
      align-items: center;
    `;let o=document.createElement("span");o.style.cssText=`
      display: inline-block;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background-color: ${e.color};
      margin-right: 8px;
    `,n.appendChild(o);let l=document.createElement("span");if(l.textContent=e.name,n.appendChild(l),a.appendChild(n),i===e.id){let e=document.createElement("span");e.innerHTML=`
        <svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 0 24 24" width="18px" fill="#FFFFFF">
          <path d="M0 0h24v24H0z" fill="none"/>
          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
        </svg>
      `,a.appendChild(e)}a.addEventListener("click",()=>{if(i===e.id){r.remove();return}(function(e,t){if(!e){console.error("Invalid channel ID");return}console.log(`Assigning channel ${e} to folder ${t}`);let a="";if(window.location.href.includes("youtube.com/watch")){let e=document.querySelector("#owner #channel-name");e&&(a=e.textContent.trim())}else{let e=document.querySelector('meta[property="og:title"]');e&&(a=e.getAttribute("content"))}let n=Storage.getLocal("ytt-badges")||{},i=Storage.getLocal("ytt-tabs")||{},r=-1!==t?i[t]?.name||i[t]?.title||"folder":"None";if(n[e]){let a=n[e].tabID;if(a===t){console.log(`Channel ${e} is already in folder ${t}`);return}n[e].previousTabID=a,n[e].tabID=t,n[e].order=Date.now()}else n[e]={tabID:t,previousTabID:-1,order:Date.now(),favorite:!1,name:a};-1===t?m("Channel removed from folder"):m(`Channel added to "${r}"`);let o=new CustomEvent("CHANNEL_MOVED",{detail:{channelId:e,folderId:t,previousFolderId:n[e].previousTabID}});document.dispatchEvent(o),"undefined"!=typeof EventManager&&EventManager.emit("CHANNEL_MOVED",{channelId:e,folderId:t,previousFolderId:n[e].previousTabID}),function(e,t){let a=document.getElementById(e);if(!a){console.log(`Badge element for channel ${e} not found in sidebar`);return}if(-1===t){let t=document.querySelector("#guide-content #items:nth-child(2)");t?(a.style.marginLeft="",t.appendChild(a),console.log(`Moved badge ${e} to main container`)):console.log("Badge container not found");return}let n=document.getElementById(t);if(!n){console.log(`Folder element ${t} not found`);return}a.style.marginLeft="10px",n.appendChild(a),console.log(`Moved badge ${e} to folder ${t}`)}(e,t)})(t,e.id),r.remove()}),a.addEventListener("mouseenter",()=>{a.style.backgroundColor="#3e3e3e"}),a.addEventListener("mouseleave",()=>{a.style.backgroundColor="transparent"}),r.appendChild(a)}),document.querySelectorAll(".yt-folder-menu").forEach(e=>e.remove()),document.body.appendChild(r);let c=e=>{r.contains(e.target)||(r.remove(),document.removeEventListener("click",c))};setTimeout(()=>{document.addEventListener("click",c)},0)}(l,n):console.error("Could not determine channel ID")}),e.parentElement?e.parentElement.appendChild(l):e.insertAdjacentElement("afterend",l)}async function b(){try{document.body.classList.add("ytt-unregistered"),ChannelManager.init({timeoutMs:0}).then(e=>{i(e)&&(Storage.setChannelId(e),u(),console.log(`[YSO] ChannelManager initialized with ID: ${e}`))}),"undefined"!=typeof SupabaseAuth&&(await SupabaseAuth.init(),console.log("[YSO] SupabaseAuth initialized")),function(){p();let e=new MutationObserver(e=>{p()});e.observe(document.body,{childList:!0,subtree:!0}),setInterval(p,2e3)}()}catch(e){console.error("[YSO] Failed to initialize extension:",e)}}"loading"===document.readyState?document.addEventListener("DOMContentLoaded",b):b();class f{constructor(){this.miniGuide=null,this.observer=null,this.initialized=!1,this.updateTimeout=null,this.foldersData={},this.draggedFolder=null,this.originalOrder=[],this.lastUrl=window.location.href,this.cleanup(),this.initialize(),this.setupStorageListener(),this.loadFoldersData(),this.checkInstallation(),this.setupEventListeners(),this.setupPageChangeDetection()}async checkInstallation(){try{let e=await Storage.get("ytt-installation-id",!1);if(!e){let e=crypto.randomUUID();await Storage.set("ytt-installation-id",e,!1)}}catch(e){console.error("Error checking installation:",e)}}async loadFoldersData(e=!1){try{let e=performance.now(),t=window.tabManager;if(!t)return this.foldersData;let a=t.tabData||{},l=t.badgeData||{},s=Object.entries(a).map(([e,t])=>({id:e,name:t.name||t.title,color:t.color})),d=Object.entries(l).map(([e,t])=>({id:e,...t,folderId:t.tabID})),c=new Map;s.forEach(e=>{c.set(e.id,[])}),d.forEach(e=>{e.folderId&&c.has(e.folderId)&&e.id&&(e.name||e.title)&&c.get(e.folderId).push({id:e.id,name:e.name||e.title,thumbnail:e.thumbnail||"",url:e.url||"",folderId:e.folderId})});let g=new Set,m=document.querySelectorAll("ytd-guide-entry-renderer"),p=new Map;m.forEach(e=>{let t=e.id;t&&p.set(t,e)});let b=Object.entries(l);for(let e of(b.forEach(([e,t])=>{if(!g.has(e)&&t&&t.tabID&&-1!==t.tabID){let a=t.tabID,i=null,r=n.getById(e);if(r&&(i={id:e,name:r.name,thumbnail:r.thumbnail,url:r.url,folderId:a}),!i){let t=`ytt-channel-data-${e}`;try{let e=Storage.getLocal(t);e&&e.timestamp&&Date.now()-e.timestamp<864e5&&(i=e.data)}catch(e){}}if(!i){let t=p.get(e);t&&(i={id:e,name:t.querySelector("yt-formatted-string")?.textContent||"Unknown Channel",thumbnail:t.querySelector("yt-img-shadow img")?.src||"",url:t.querySelector("a")?.href||"",folderId:a},Storage.setLocal(`ytt-channel-data-${e}`,{data:i,timestamp:Date.now()}))}if(i){if(c.has(a)){let t=c.get(a).find(t=>t.id===e);t||c.get(a).push(i)}else c.set(a,[i]);g.add(e)}}}),s)){a[e.id]?(a[e.id].title=e.name,a[e.id].color=e.color,a[e.id].lastUpdated=Date.now()):a[e.id]={id:e.id,title:e.name,color:e.color,channels:[],lastUpdated:Date.now()};let t=c.get(e.id)||[];a[e.id].channels=t.map(e=>({id:e.id,title:e.name||"Unknown Channel",thumbnail:e.thumbnail||"",url:e.url||""})),a[e.id].channelCount=a[e.id].channels.length}this.foldersData=a,this._lastRefreshTime=performance.now();let f=performance.now();return(window._ytt_last_sync=Date.now()),this.debouncedUpdate(),this.foldersData}catch(e){return console.error("Error syncing folders data:",e),this.foldersData}}setupStorageListener(){this._onStorageChange=this._onStorageChange||this.handleStorageChange.bind(this),chrome.storage.onChanged.addListener((e,t)=>{"local"===t&&e[PinnedFolders.PINNED_FOLDERS_KEY]&&this.throttledUpdate()}),window.addEventListener("storage",this._onStorageChange),document.addEventListener(ChannelManager.CHANNEL_CHANGE_EVENT,e=>{console.log("MiniGuideManager: Channel changed, reloading..."),this.loadFoldersData(!0)})}async handleStorageChange(e){if(!e.key)return;let t=e.key.startsWith("ytt-tabs")||e.key.startsWith("ytt-badges")||e.key.startsWith("ytt-folders");if(t){console.log(`Storage changed: ${e.key}`);let t=Storage.getScopedKey("ytt-tabs"),a=Storage.getScopedKey("ytt-badges"),n=Storage.getScopedKey("ytt-folders");try{e.key===t?(await this.loadFoldersData(!0),this.debouncedUpdate()):e.key===a?(await this.loadFoldersData(!1),this.throttledUpdate()):e.key===n&&(await this.loadFoldersData(!0),this.debouncedUpdate())}catch(t){console.error(`Error handling storage change for ${e.key}:`,t)}}}debouncedUpdate(){this.updateTimeout&&clearTimeout(this.updateTimeout),this.updateTimeout=setTimeout(()=>{this.miniGuide&&null!==this.miniGuide.offsetParent&&!this.isNavigating&&"visible"===document.visibilityState&&requestAnimationFrame(()=>{this.miniGuide&&null!==this.miniGuide.offsetParent&&(console.log("Updating mini guide (debounced)"),this.updateMiniGuide())})},500)}throttledUpdate(){if(this._lastUpdateTime&&performance.now()-this._lastUpdateTime<2e3){console.log("Throttling mini guide update (updated recently)");return}this.miniGuide&&null!==this.miniGuide.offsetParent&&(console.log("Updating mini guide (throttled)"),this._lastUpdateTime=performance.now(),this.updateMiniGuide())}initialize(){this.observer=new MutationObserver((e,t)=>{let a=document.querySelector("ytd-mini-guide-renderer");a&&a!==this.miniGuide&&(this.miniGuide=a,this.setupMiniGuide(),this.initialized=!0,t.disconnect())}),this.observer.observe(document.body,{childList:!0,subtree:!0});let e=document.querySelector("ytd-mini-guide-renderer");e&&(this.miniGuide=e,this.setupMiniGuide(),this.initialized=!0)}updateMiniGuide(){this.initialized&&this.miniGuide&&this.setupMiniGuide()}async setupMiniGuide(){let e=this.miniGuide.querySelector("#items");if(!e)return;let t=e.querySelectorAll(".ytt-pinned-folder-entry, .ytt-channel-waiting-entry");t.forEach(e=>e.remove());await this.renderPinnedFolders(e)}renderChannelWaitingState(){if(!this.miniGuide)return;let e=this.miniGuide.querySelector("#items");if(!e||e.querySelector(".ytt-channel-waiting-entry"))return;let t=this.createGuideEntry("Loading folders",`
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
                <path d="M12 2a10 10 0 1 0 10 10h-2a8 8 0 1 1-8-8V2z"></path>
            </svg>
        `,"ytt-channel-waiting-entry");t.style.opacity="0.72",e.prepend(t)}setupEventListeners(){EventManager.on("FOLDER_DRAG_START",this.handleDragStart.bind(this)),EventManager.on("FOLDER_DRAG_END",this.handleDragEnd.bind(this)),EventManager.on("FOLDER_DRAG_OVER",this.handleDragOver.bind(this)),EventManager.on("FOLDER_DROP",this.handleDrop.bind(this)),EventManager.on("FOLDER_CLICK",this.handleFolderClick.bind(this)),EventManager.on("CHANNEL_ADDED",this.handleChannelChange.bind(this)),EventManager.on("CHANNEL_REMOVED",this.handleChannelChange.bind(this)),EventManager.on("CHANNEL_MOVED",this.handleChannelChange.bind(this)),EventManager.on("TAB_CREATED",this.handleTabChange.bind(this)),EventManager.on("TAB_DELETED",this.handleTabChange.bind(this)),EventManager.on("TAB_UPDATED",this.handleTabChange.bind(this)),this.setupSubscriptionObserver()}handleChannelChange(e){console.log("Channel change detected:",e),this.loadFoldersData()}handleTabChange(e){console.log("Tab change detected:",e),this.loadFoldersData()}setupSubscriptionObserver(){let e=new MutationObserver(e=>{if(window._ytt_dragging||window.folderTubeDragManager?.isDragging)return;let t=!1;for(let a of e){if("childList"===a.type&&(a.addedNodes.length>0||a.removedNodes.length>0)){let e=[...a.addedNodes,...a.removedNodes].some(e=>e.classList&&(e.classList.contains("ytt-badge")||e.querySelector(".ytt-badge")));if(e){t=!0;break}}if("attributes"===a.type&&a.target.classList&&a.target.classList.contains("ytt-badge")){t=!0;break}}t&&(Date.now()-(window._ytt_last_sync||0))>2000&&(this.loadFoldersData())}),t=document.getElementById("guide-content");if(t)e.observe(t,{childList:!0,subtree:!0,attributes:!0,attributeFilter:["data-tab"]}),console.log("Subscription observer started");else{let t=new MutationObserver((t,a)=>{let n=document.getElementById("guide-content");n&&(e.observe(n,{childList:!0,subtree:!0,attributes:!0,attributeFilter:["data-tab"]}),console.log("Subscription observer started (delayed)"),a.disconnect())});t.observe(document.body,{childList:!0,subtree:!0})}}handleDragStart(e){let t=e.target.closest(".ytt-pinned-folder-entry");t&&(this.draggedFolder=t,this.originalOrder=Array.from(this.miniGuide.querySelectorAll(".ytt-pinned-folder-entry")).map(e=>e.getAttribute("data-folder-id")),t.classList.add("dragging"),e.dataTransfer.effectAllowed="move",e.dataTransfer.setData("text/plain",t.getAttribute("data-folder-id")))}handleDragEnd(){this.draggedFolder&&(this.draggedFolder.classList.remove("dragging"),this.draggedFolder=null,this.originalOrder=[])}handleDragOver(e){if(e.preventDefault(),!this.draggedFolder)return;let t=this.miniGuide.querySelector("#items"),a=this.getDragAfterElement(t,e.clientY);if(a&&a!==this.draggedFolder){let t=this.calculateDropPosition(a,e.clientY);this.updateDropIndicator(a,t)}}calculateDropPosition(e,t){let a=e.getBoundingClientRect();return t<a.top+a.height/2?"before":"after"}updateDropIndicator(e,t){let a=this.miniGuide.querySelector(".drop-indicator");a||((a=document.createElement("div")).className="drop-indicator",this.miniGuide.appendChild(a));let n=e.getBoundingClientRect();a.style.top="before"===t?n.top:n.bottom,a.style.left=n.left,a.style.width=n.width}async handleDrop(e){if(e.preventDefault(),!this.draggedFolder)return;let t=this.miniGuide.querySelector("#items"),a=Array.from(t.querySelectorAll(".ytt-pinned-folder-entry")),n=a.map(e=>e.getAttribute("data-folder-id"));if(!this.validateFolderOrder(n)){console.warn("Invalid folder order detected, reverting..."),this.restoreOriginalOrder();return}try{await PinnedFolders.reorderFolders(n),EventManager.emit("FOLDER_REORDER",{newOrder:n})}catch(e){console.error("Error reordering folders:",e),this.restoreOriginalOrder()}}validateFolderOrder(e){let t=this.originalOrder.every(t=>e.includes(t));if(!t)return!1;let a=new Set(e);return a.size===e.length}restoreOriginalOrder(){let e=this.miniGuide.querySelector("#items");if(!e)return;let t=Array.from(e.querySelectorAll(".ytt-pinned-folder-entry")),a=new Map(t.map(e=>[e.getAttribute("data-folder-id"),e]));e.innerHTML="",this.originalOrder.forEach(t=>{let n=a.get(t);n&&e.appendChild(n)})}handleFolderClick(e){let t=e.target.closest(".ytt-pinned-folder-entry");if(!t)return;let a=t.getAttribute("data-folder-id"),n=this.foldersData[a];if(!n){console.error(`Folder data not found for ID: ${a}`);return}this.showFolderContents(n)}setupDragAndDrop(){let e=this.miniGuide.querySelector("#items");if(!e)return;let t=e.querySelectorAll(".ytt-pinned-folder-entry");t.forEach(e=>{e.draggable=!0,e.addEventListener("dragstart",e=>{EventManager.emit("FOLDER_DRAG_START",e)}),e.addEventListener("dragend",()=>{EventManager.emit("FOLDER_DRAG_END")}),e.addEventListener("dragover",e=>{EventManager.emit("FOLDER_DRAG_OVER",e)}),e.addEventListener("drop",e=>{EventManager.emit("FOLDER_DROP",e)}),e.addEventListener("click",e=>{EventManager.emit("FOLDER_CLICK",e)})})}getDragAfterElement(e,t){let a=[...e.querySelectorAll(".ytt-pinned-folder-entry:not(.dragging)")];return a.reduce((e,a)=>{let n=a.getBoundingClientRect(),i=t-n.top-n.height/2;return i<0&&i>e.offset?{offset:i,element:a}:e},{offset:Number.NEGATIVE_INFINITY}).element}createGuideEntry(e,t,a="",n=""){let i=document.createElement("ytd-mini-guide-entry-renderer");a&&(i.className=a),n&&(i.setAttribute("data-folder-id",n),i.id=n);let r=document.createElement("a");r.id="endpoint",r.tabIndex="-1",r.className="yt-simple-endpoint style-scope ytd-mini-guide-entry-renderer",r.title=e;let o=document.createElement("div");o.className="guide-icon style-scope ytd-mini-guide-renderer",o.style.cssText=`
            display: inline-flex;
            align-items: center;
            justify-content: center;
            position: relative;
            vertical-align: middle;
            fill: var(--iron-icon-fill-color, currentcolor);
            stroke: var(--iron-icon-stroke-color, none);
            margin-left: var(--iron-icon_-_margin-left);
            margin-bottom: var(--iron-icon_-_margin-bottom);
            width: var(--iron-icon_-_width, var(--iron-icon-width, 24px));
            height: var(--iron-icon_-_height, var(--iron-icon-height, 24px));
            margin-top: var(--iron-icon_-_margin-top);
        `,o.innerHTML=t;let l=document.createElement("span");return l.className="title style-scope ytd-mini-guide-entry-renderer",l.textContent=e,r.appendChild(o),r.appendChild(l),i.appendChild(r),i}async renderPinnedFolders(e){let t=await PinnedFolders.getPinnedFolders(),a={};try{a=Storage.getLocal("ytt-tabs")||{}}catch(e){console.error("Error parsing ytt-tabs from Storage:",e),a={}}if(0===t.length)return;let n=document.createDocumentFragment();for(let e of t){if(!a[e]){console.warn(`Folder with ID ${e} not found in tabsData`);continue}let t={id:e,title:a[e].name,color:a[e].color,hidden:a[e].hidden},i=this.createGuideEntry(t.title,PinnedFolders.getFolderIconSVG(t.color),"ytt-pinned-folder-entry",t.id);i.addEventListener("click",e=>{e.preventDefault(),e.stopPropagation(),console.log("Folder clicked:",t),this.showFolderContents(t)}),n.appendChild(i)}e.appendChild(n),this.setupDragAndDrop()}createBackButton(e){let t=this.createGuideEntry("Back",`<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3">
                <path d="M480-160 160-480l320-320 57 57-263 263 263 263-57 57Z"/>
            </svg>`,"ytt-back-button");return t.addEventListener("click",t=>{t.preventDefault(),t.stopPropagation();let a=this.miniGuide.querySelector("#items");a&&(a.innerHTML=e,this.setupMiniGuide())}),t}createChannelEntry(e,t=!1){let a=document.createElement("ytd-mini-guide-entry-renderer");a.className="ytt-channel-entry",a.setAttribute("data-channel-id",e.id);let n=document.createElement("a");n.id="endpoint",n.tabIndex="-1",n.className="yt-simple-endpoint style-scope ytd-mini-guide-entry-renderer",n.href=e.url||`https://www.youtube.com/channel/${e.id}`,n.title=e.title;let i=document.createElement("div");if(i.className="guide-icon style-scope ytd-mini-guide-renderer",i.style.cssText=`
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
            width: 36px;
            height: 36px;
            margin: 0 auto;
        `,e.thumbnail){let t=`ytt-channel-img-${e.id}`,a=e.thumbnail;try{let e=Storage.getLocal(t);e&&e.timestamp&&Date.now()-e.timestamp<6048e5&&(a=e.url)}catch(e){console.warn("Error reading cached image:",e)}let n=document.createElement("img");n.loading="lazy",n.decoding="async",n.alt=e.title,n.style.cssText=`
                width: 36px;
                height: 36px;
                border-radius: 50%;
                object-fit: cover;
                box-shadow: 0 1px 3px rgba(0,0,0,0.2);
            `,n.onerror=()=>{i.innerHTML=this.getChannelFallbackIcon(e.title)},n.onload=()=>{try{Storage.setLocal(t,{url:a,timestamp:Date.now()})}catch(e){console.warn("Error caching image:",e)}},n.src=a,i.appendChild(n)}else i.innerHTML=this.getChannelFallbackIcon(e.title);let r=document.createElement("input");return r.type="checkbox",r.className="ytt-channel-select",r.setAttribute("aria-label",`Select ${e.title}`),r.addEventListener("click",e=>e.stopPropagation()),r.addEventListener("change",e=>{a.classList.toggle("is-selected",r.checked),a.dispatchEvent(new CustomEvent("YTT_CHANNEL_SELECTION_CHANGED",{bubbles:!0,detail:{channelId:a.getAttribute("data-channel-id"),selected:r.checked}}))}),n.appendChild(i),a.appendChild(r),a.appendChild(n),t&&a.addEventListener("click",t=>{t.target&&t.target.closest&&t.target.closest(".ytt-channel-select")||(t.preventDefault(),t.stopPropagation(),Storage.setLocal("ytt-last-folder-id",a.closest(".ytt-channels-container")?.getAttribute("data-folder-id")),e.url?window.location.href=e.url:e.id&&(window.location.href=`https://www.youtube.com/channel/${e.id}`))}),a}getChannelFallbackIcon(e){let t=e.split("").reduce((e,t)=>t.charCodeAt(0)+((e<<5)-e),0),a=`hsl(${Math.abs(t)%360}, 70%, 60%)`,n=e.charAt(0).toUpperCase();return`
            <div style="
                width: 36px;
                height: 36px;
                border-radius: 50%;
                background-color: ${a};
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-weight: bold;
                font-size: 16px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.2);
            ">${n}</div>
        `}createNoChannelsMessage(){let e=this.createGuideEntry("No channels in this folder","","ytt-no-channels"),t=e.querySelector(".title");return t.style.color="var(--yt-spec-text-secondary)",e}async showFolderContents(e){console.log("showFolderContents called with folder:",e.id),this.showLoadingIndicator();try{await this.loadFoldersData(!1);let t=this.miniGuide.querySelector("#items");if(!t){console.warn("Items container not ready, setting up observer..."),this.setupItemsContainerObserver(e),this.hideLoadingIndicator();return}let a=t.innerHTML,n=document.createDocumentFragment(),i=this.createBackButton(a);n.appendChild(i);let r=this.foldersData[e.id],o=r&&r.channels?r.channels.length:0,l=r&&r.lastUpdated?new Date(r.lastUpdated).toLocaleString():"Unknown",s=this.createGuideEntry(`${e.title}`,PinnedFolders.getFolderIconSVG(e.color),"ytt-folder-title",e.id);if(s.title=`Last updated: ${l}`,n.appendChild(s),!0){let e=document.createElement("div");e.className="ytt-search-container";let t=document.createElement("input");t.type="text",t.className="ytt-search-input",t.placeholder="Search channels...",t.setAttribute("aria-label","Search channels"),e.appendChild(t),n.appendChild(e),setTimeout(()=>{let e=this.miniGuide.querySelector(".ytt-search-input");e&&(e.addEventListener("input",this.filterChannels.bind(this)),o>5&&e.focus())},100)}let d=[];if(r&&r.channels&&r.channels.length>0?(console.log(`Found ${r.channels.length} channels for folder:`,e.id),d=r.channels):(console.log("No channels found in folder data, trying badge data"),(d=await this.getChannelsFromBadgeData(e.id)).length>0&&(this.foldersData[e.id]?(this.foldersData[e.id].channels=d,this.foldersData[e.id].lastUpdated=Date.now(),this.foldersData[e.id].channelCount=d.length):this.foldersData[e.id]={id:e.id,title:e.title,color:e.color,channels:d,lastUpdated:Date.now(),channelCount:d.length})),d.length>0){let t=[...d].sort((e,t)=>e.title.localeCompare(t.title)),a=document.createElement("div");a.className="ytt-channels-container",a.setAttribute("data-folder-id",e.id),t.forEach(e=>{if(!e.title){console.warn("Skipping channel with missing title:",e);return}let t=this.createChannelEntry(e,!0);a.appendChild(t)}),n.appendChild(a)}else{console.warn("No channels found for folder:",e.id);let t=document.createElement("div");t.className="ytt-empty-state";let a=document.createElement("div");a.className="ytt-empty-icon",a.innerHTML=`
                    <svg xmlns="http://www.w3.org/2000/svg" height="48" viewBox="0 0 24 24" width="48" fill="#e3e3e3">
                        <path d="M19 5v14H5V5h14m0-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-4.86 8.86l-3 3.87L9 13.14 6 17h12l-3.86-5.14z"/>
                    </svg>
`;let i=document.createElement("div");i.className="ytt-empty-text",i.textContent="No channels in this folder";let r=document.createElement("div");r.className="ytt-empty-subtext",r.textContent="Add channels to this folder from the main guide";let o=document.createElement("button");o.className="ytt-empty-refresh",o.textContent="Refresh",o.addEventListener("click",async()=>{this.showLoadingIndicator(),await this.loadFoldersData(!0),this.showFolderContents(e)}),t.appendChild(a),t.appendChild(i),t.appendChild(r),t.appendChild(o),n.appendChild(t)}t.innerHTML="",t.appendChild(n),this.setupBulkMoveActions(e.id),this.hideLoadingIndicator()}catch(t){console.error("Error showing folder contents:",t),this.hideLoadingIndicator();let e=this.miniGuide.querySelector("#items");if(e){let t=this.createGuideEntry("Error loading channels",`<svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24" fill="#e74c3c">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                    </svg>`,"ytt-error-message");e.innerHTML="",e.appendChild(t)}}}setupBulkMoveActions(e){let t=this.miniGuide?.querySelector(".ytt-channels-container");if(!t)return;let a=this.miniGuide.querySelector(".ytt-search-container")||t,n=document.createElement("div");n.className="ytt-bulk-action-bar";let selBtn=document.createElement("button");selBtn.type="button",selBtn.className="ytt-select-toggle-btn",selBtn.textContent="Select",a.appendChild(selBtn);let bulkActive=!1;let i=document.createElement("span");i.className="ytt-bulk-count",i.textContent="0 selected";let r=document.createElement("div");r.className="ytt-bulk-actions";let o=document.createElement("button");o.type="button",o.className="ytt-bulk-select-visible",o.textContent="Select visible";let c=window.tabManager?.tabData||{};let fpWrap=document.createElement("div");fpWrap.className="ytt-folder-picker-wrap";let moveBtn=document.createElement("button");moveBtn.type="button",moveBtn.className="ytt-bulk-action-bar button",moveBtn.textContent="Move to ▼";let openPicker=()=>{let x=fpWrap.querySelector(".ytt-folder-picker-menu");if(x){x.remove();return}let menu=document.createElement("div");menu.className="ytt-folder-picker-menu";Object.keys(c).sort((e,t)=>(c[e].index??0)-(c[t].index??0)||(c[e].name||"").localeCompare(c[t].name||"")).forEach(fId=>{if(fId!==e){let opt=document.createElement("div");opt.className="ytt-folder-option",opt.textContent=c[fId].name||c[fId].title||"Folder",opt.addEventListener("click",()=>{menu.remove(),doMove(fId)}),menu.appendChild(opt)}});fpWrap.appendChild(menu),setTimeout(()=>document.addEventListener("click",function close(ev){fpWrap.contains(ev.target)||(menu.remove(),document.removeEventListener("click",close,!0))},!0),0)};moveBtn.addEventListener("click",ev=>{ev.stopPropagation(),openPicker()});fpWrap.appendChild(moveBtn);let h=document.createElement("button");h.type="button",h.className="ytt-bulk-clear",h.textContent="x",h.setAttribute("aria-label","Clear selection"),r.appendChild(o),r.appendChild(fpWrap),r.appendChild(h),n.appendChild(i),n.appendChild(r),a.insertAdjacentElement("afterend",n);let g=()=>Array.from(t.querySelectorAll(".ytt-channel-entry")).filter(e=>"none"!==e.style.display),m=()=>Array.from(t.querySelectorAll(".ytt-channel-select:checked")),p=()=>{let e=m(),a=g(),r=a.length>0&&a.every(e=>e.querySelector(".ytt-channel-select")?.checked);n.classList.toggle("is-active",e.length>0),i.textContent=`${e.length} selected`,o.textContent=r?"Deselect visible":`Select visible (${a.length})`};t.addEventListener("YTT_CHANNEL_SELECTION_CHANGED",p),this.miniGuide.addEventListener("YTT_MINIGUIDE_FILTERED",p),o.addEventListener("click",()=>{let e=g(),t=e.length>0&&e.every(e=>e.querySelector(".ytt-channel-select")?.checked);e.forEach(e=>{let a=e.querySelector(".ytt-channel-select");a&&(a.checked=!t,e.classList.toggle("is-selected",a.checked))}),p()}),selBtn.addEventListener("click",()=>{bulkActive=!bulkActive,t.classList.toggle("bulk-select-mode",bulkActive),selBtn.textContent=bulkActive?"Cancel":"Select",selBtn.classList.toggle("active",bulkActive),bulkActive||(m().forEach(e=>{e.checked=!1,e.closest(".ytt-channel-entry")?.classList.remove("is-selected")}),p())}),h.addEventListener("click",()=>{m().forEach(e=>{e.checked=!1,e.closest(".ytt-channel-entry")?.classList.remove("is-selected")}),bulkActive=!1,t.classList.remove("bulk-select-mode"),selBtn.textContent="Select",selBtn.classList.remove("active"),p()});let doMove=async fId=>{let n=fId==="-1"?-1:fId,r=m(),o=window.tabManager;if(!o||!o.badgeData)return;let s=0;r.forEach(a=>{let i=a.closest(".ytt-channel-entry"),r=i?.getAttribute("data-channel-id");if(!r)return;o.badgeData[r]||(o.badgeData[r]={tabID:-1,favorite:!1,order:Date.now()});let l=o.badgeData[r].tabID;o.badgeData[r].previousTabID=l,o.badgeData[r].tabID=n,o.badgeData[r].order=Date.now(),document.dispatchEvent(new CustomEvent("CHANNEL_MOVED",{detail:{channelId:r,folderId:n,tabId:n,previousFolderId:l}})),"undefined"!=typeof EventManager&&EventManager.emit("CHANNEL_MOVED",{channelId:r,folderId:n,tabId:n,previousFolderId:l}),n!==e&&i?.remove(),s++}),o.save?.(),o.sortBadges?.(),o.arrangeBadges?.(),this.loadFoldersData(!0).then(()=>{this.showFolderContents({id:e,title:this.foldersData[e]?.title||c[e]?.name||"Folder",color:this.foldersData[e]?.color||c[e]?.color||"#e3e3e3"})}),o.showNotification?.(`${s} channel${1===s?"":"s"} moved`,"success")}}async getChannelsFromBadgeData(e){let t=Storage.getLocal("ytt-badges")||{},a=[],n=document.querySelectorAll("ytd-guide-entry-renderer"),i=new Map;return n.forEach(e=>{let t=e.id;t&&i.set(t,e)}),Object.entries(t).forEach(([t,n])=>{if(n&&n.tabID===e){let e=i.get(t);if(e){let n=e.querySelector("yt-formatted-string")?.textContent||"Unknown Channel",i=e.querySelector("yt-img-shadow img")?.src||"",r=e.querySelector("a")?.href||"";a.push({id:t,title:n,thumbnail:i,url:r})}}}),console.log(`Found ${a.length} channels from badge data for folder ${e}`),a}filterChannels(e){let t=e.target.value.toLowerCase().trim(),a=t.split(/\s+/),n=this.miniGuide.querySelector(".ytt-channels-container");if(!n)return;let i=n.querySelectorAll(".ytt-channel-entry"),r=0;i.forEach(e=>{let t=e.querySelector("a")?.title.toLowerCase();t&&a.every(e=>t.includes(e))?(e.style.display="",r++):e.style.display="none"});let o=this.miniGuide.querySelector(".ytt-search-empty");0===r?o?(o.textContent=`No channels matching "${t}"`,o.style.display=""):((o=document.createElement("div")).className="ytt-search-empty",o.textContent=`No channels matching "${t}"`,n.appendChild(o)):o&&(o.style.display="none"),this.miniGuide.dispatchEvent(new CustomEvent("YTT_MINIGUIDE_FILTERED"))}showLoadingIndicator(){let e=document.querySelector(".ytt-loading-indicator");e?e.style.display="flex":((e=document.createElement("div")).className="ytt-loading-indicator",e.innerHTML=`
                <div class="ytt-loading-spinner"></div>
                <div class="ytt-loading-text">Loading channels...</div>
            `,document.body.appendChild(e))}hideLoadingIndicator(){let e=document.querySelector(".ytt-loading-indicator");e&&(e.style.display="none")}setupItemsContainerObserver(e){let t=new MutationObserver((t,a)=>{let n=this.miniGuide.querySelector("#items");n&&(a.disconnect(),this.showFolderContents(e))});t.observe(this.miniGuide,{childList:!0,subtree:!0}),setTimeout(()=>{t.disconnect(),console.error("Items container did not appear within timeout")},5e3)}setupPageChangeDetection(){this.isNavigating=!1,this.navigationTimeout=null,this.urlObserver=new MutationObserver(e=>{let t=window.location.href;this.lastUrl===t||this.isNavigating||(console.log("URL changed, refreshing mini guide"),this.lastUrl=t,this.handlePageChange())});let e=document.querySelector("title");e&&this.urlObserver.observe(e,{childList:!0}),this.urlCheckInterval=setInterval(()=>{let e=window.location.href;this.lastUrl===e||this.isNavigating||(console.log("URL changed (interval check), refreshing mini guide"),this.lastUrl=e,this.handlePageChange())},5e3),window.addEventListener("yt-navigate-start",()=>{console.log("YouTube navigation started"),this.isNavigating=!0,this.navigationTimeout&&clearTimeout(this.navigationTimeout),this.miniGuide=null,this.initialized=!1}),window.addEventListener("yt-navigate-finish",()=>{console.log("YouTube navigation finished"),this.lastUrl=window.location.href,this.navigationTimeout=setTimeout(()=>{this.initialize(),this.loadFoldersData(!0),this.isNavigating=!1},500)}),document.addEventListener("visibilitychange",()=>{if("visible"===document.visibilityState){console.log("Page became visible, checking for changes");let e=window.location.href;this.lastUrl!==e?(console.log("URL changed while page was hidden"),this.lastUrl=e,this.handlePageChange()):this.loadFoldersData(!1)}})}handlePageChange(){this.pageChangeTimeout&&clearTimeout(this.pageChangeTimeout),this.pageChangeTimeout=setTimeout(()=>{console.log("Handling page change"),this.initialize(),this.loadFoldersData(!0);let e=Storage.getLocal("ytt-last-folder-id");if(e&&this.foldersData[e])console.log("Restoring folder view for:",e),this.showFolderContents({id:e,title:this.foldersData[e].title||"Folder",color:this.foldersData[e].color||"#e3e3e3"});else if(this.miniGuide&&this.miniGuide.querySelector(".ytt-folder-title")){console.log("Refreshing open folder view");let e=this.miniGuide.querySelector(".ytt-folder-title"),t=e.getAttribute("data-folder-id");t&&this.foldersData[t]&&this.showFolderContents({id:t,title:this.foldersData[t].title,color:this.foldersData[t].color})}},500)}cleanup(){this.observer&&(this.observer.disconnect(),this.observer=null),this.urlObserver&&(this.urlObserver.disconnect(),this.urlObserver=null),this.updateTimeout&&(clearTimeout(this.updateTimeout),this.updateTimeout=null),this.navigationTimeout&&(clearTimeout(this.navigationTimeout),this.navigationTimeout=null),this.pageChangeTimeout&&(clearTimeout(this.pageChangeTimeout),this.pageChangeTimeout=null),this.urlCheckInterval&&(clearInterval(this.urlCheckInterval),this.urlCheckInterval=null),this.hideLoadingIndicator();let e=document.querySelector(".ytt-loading-indicator");e&&e.remove(),window.removeEventListener("yt-navigate-start",this._onNavigateStart),window.removeEventListener("yt-navigate-finish",this._onNavigateFinish),window.removeEventListener("storage",this._onStorageChange),document.removeEventListener("visibilitychange",this._onVisibilityChange),this.miniGuide=null,this.draggedFolder=null,this.originalOrder=[],this.foldersData={},this._lastRefreshTime=0,this.initialized=!1,console.log("MiniGuideManager cleaned up")}}var y=["0","1","2","3","4","5","6","7","8","9","a","b","c","d","e","f"];async function v(){let e=document.getElementById("guide-content");if(!e)return;let t=0,a=0,n=0;return new Promise(i=>{let r=()=>{let o=e.querySelectorAll("ytd-guide-entry-renderer"),l=o.length;l===t?a++:(a=0,t=l),e.scrollTop=e.scrollHeight,n++,a>=4||n>=80?(e.scrollTop=0,console.log(`[FolderTube] Finished loading subscriptions: ${l} channels found after ${n} iterations.`),i()):setTimeout(r,300)};r()})}window.location.href,JSON.parse(localStorage.getItem("subscription_links")),JSON.parse(localStorage.getItem("subscription_tabs")),window.onload=async function(){ChannelManager.init({timeoutMs:0}).then(e=>{i(e)&&(Storage.setChannelId(e),u(),console.log(`[YSO] Initialized with Channel ID: ${e}`))}),window.subscriptionsFolderBar||(window.subscriptionsFolderBar={refresh:()=>{}}),"undefined"==typeof SupabaseAuth||SupabaseAuth._session||await SupabaseAuth.init(),document.addEventListener(ChannelManager.CHANNEL_CHANGE_EVENT,async e=>{let t=e.detail.channelId;if(!i(t)){console.warn(`[YSO] Ignoring channel-change event with invalid channel ID: ${t}`);return}let a=Storage.channelId;if(console.log(`[YSO] Channel ID detected: ${a||"none"} -> ${t}`),Storage.setChannelId(t),u(),"undefined"!=typeof SupabaseAuth&&SupabaseAuth._session)try{let e=await SupabaseAuth.bindOrCheckChannel(t);e&&!e.allowed&&window.tabManager&&("channel-not-linked"===e.reason||"no-primary-set"===e.reason)&&window.tabManager.showChannelNotLinkedPrompt(e)}catch(e){console.warn("[YSO] bindOrCheckChannel failed on channel change:",e)}window.tabManager&&(w.recheck(t),a?window.tabManager.reload({apiFirst:!0,resetState:!0}):(console.log("[YSO] Channel ID now available \u2014 syncing pending local folders."),window.tabManager.syncFoldersToSupabase().catch(()=>{})),window.tabManager.forceUpdateAuthStatus?.()),window.subscriptionsFolderBar?.refresh()});let e=async()=>{try{window.subscriptionManager?.refresh&&await window.subscriptionManager.refresh()}catch(e){console.warn("[YSO] Subscription refresh failed:",e)}let t=async()=>{if(window.tabManager)return;"undefined"!=typeof SupabaseAuth&&(console.log("[YSO] Waiting for auth hydration..."),await SupabaseAuth.init());let e=r();if(!e){console.log("[YSO] TabManager startup blocked: waiting for active channel ID."),h(),o().then(e=>{i(e)&&(Storage.setChannelId(e),u(),t())});return}Storage.setChannelId(e),window.tabManager=new C};t()};e()},"complete"===document.readyState&&window.onload(),Object.nonFunctionKeys=e=>Object.keys(e).filter(t=>"function"!=typeof e[t]);class w{static isReady=!1;static isRestricted=!1;static primaryChannelId=null;static websiteUrl="https://foldertube.vercel.app";static allowedOrigins=["https://foldertube.vercel.app"];static async loadConfig(){try{let t=await new Promise(e=>chrome.storage.local.get("ytt_website_url",e));if(t.ytt_website_url){var e;this.websiteUrl=(e=t.ytt_website_url)?String(e).replace("https://folder-tube.vercel.app","https://foldertube.vercel.app"):"https://foldertube.vercel.app",this.websiteUrl!==t.ytt_website_url&&chrome.storage.local.set({ytt_website_url:this.websiteUrl}),console.log(`[YSO] Using configured website URL: ${this.websiteUrl}`)}}catch(e){console.warn("[YSO] Could not load website URL from storage:",e)}this.allowedOrigins=Array.from(new Set(["https://foldertube.vercel.app","http://localhost:3000",this.websiteUrl]))}static async init(){if(await this.loadConfig(),document.querySelector("#ft-proxy-bridge"))return;let e=document.createElement("iframe");e.id="ft-proxy-bridge",e.src=`${this.websiteUrl}?proxy=true`,e.style.cssText="position:fixed; top:-10px; left:-10px; width:1px; height:1px; opacity:0; pointer-events:none; z-index: -1;",document.body.appendChild(e),window.addEventListener("message",async e=>{if(!this.allowedOrigins.includes(e.origin)){e.data&&e.data.type&&e.data.type.startsWith("FT_")&&console.warn(`[YSO] Received bridge-like message from unexpected origin: ${e.origin}`);return}console.log(`[YSO] Received bridge message: ${e.data.type}`),"FT_PROXY_READY"===e.data.type&&(console.log("[YSO] Proxy bridge is READY."),this.isReady=!0,this.recheck(Storage.channelId),window.tabManager?.scheduleApiFolderReload?.("proxy-ready")),("FT_PROXY_READY_RESPONSE"===e.data.type||"AUTH_SUCCESS"===e.data.type)&&(this.isRestricted=e.data.isRestricted||!1,this.primaryChannelId=e.data.primaryChannelId,this.isRestricted?(console.warn("[YSO] Multi-channel restriction active."),document.body.classList.add("ytt-restricted")):document.body.classList.remove("ytt-restricted"),console.log("[YSO] Bridge responsive, triggering data sync..."),window.tabManager?.forceUpdateAuthStatus(),window.tabManager?.scheduleApiFolderReload?.("AUTH_SUCCESS"===e.data.type?"bridge-auth-success":"bridge-ready-response")),"AUTH_SUCCESS"===e.data.type&&(await this.saveSession(e.data),console.log("[YSO] Auth session saved from bridge. No reload required."),window.tabManager?.scheduleApiFolderReload?.("bridge-session-saved"))})}static send(e,t){let a=r(),n={type:e,payload:{...t,channelId:a}},i=document.querySelector("#ft-proxy-bridge");i&&i.contentWindow.postMessage(n,"*")}static async request(e,t){return new Promise((a,n)=>{let i=Math.random().toString(36).substring(7),o=r();if(("FT_GET_FOLDERS"===e||"FT_SYNC_FOLDERS"===e)&&!o){n(Error(`Blocked ${e}: no active channel ID`));return}let l={type:e,payload:{...t,channelId:o,requestId:i}},s=t=>{this.allowedOrigins.includes(t.origin)&&t.data.requestId===i&&(window.removeEventListener("message",s),t.data.error?(console.error(`[YSO] Request ${e} failed:`,t.data.error),n(Error(t.data.error))):(console.log(`[YSO] Request ${e} succeeded`),a(t.data.data)))};window.addEventListener("message",s),setTimeout(()=>{window.removeEventListener("message",s),n(Error("Request timed out"))},1e4);let d=document.querySelector("#ft-proxy-bridge");d?d.contentWindow.postMessage(l,"*"):n(Error("Proxy bridge not ready"))})}static recheck(e){if(!this.isReady)return;if(i(e)||(e=r()),!i(e)){console.log("[YSO] Delaying recheck: No channel ID available yet."),setTimeout(()=>this.recheck(r()),1e3);return}let t=document.querySelector("#inner-header-container #text")?.textContent||document.querySelector("#channel-title")?.textContent||"My Channel";console.log(`[YSO] Checking restrictions for ${t} (${e})`),this.send("FT_PING",{channelId:e,channelName:t.trim()})}static async saveSession(e){"undefined"!=typeof chrome&&chrome.storage?.local&&(e.access_token||e.refresh_token)&&await chrome.storage.local.set({ytt_access_token:e.access_token||null,ytt_refresh_token:e.refresh_token||null})}}class C{_modal=!1;creatingTab=!1;miniGuideManager=null;set modal(e){if(this._modal!=e){if(this._modal=e,e){let e=document.getElementById("page-manager");e.classList.add("modal"),document.documentElement.style.overflow="hidden",e.addEventListener("click",()=>{this.modal&&(this.activeMenu?.close(),this.activePage?.close())})}else document.getElementById("page-manager").classList.remove("modal"),document.documentElement.style.overflow="",this.activeMenu?.close(),this.activePage?.close()}}get modal(){return this._modal}showNotification(e,t="success"){const icons={success:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',error:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',info:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',warning:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'};let a=document.createElement("div");a.className=`yso-notification yso-notification-${t}`,a.innerHTML=`<span class="notification-icon">${icons[t]||icons.info}</span><span class="notification-message">${e}</span>`,document.body.appendChild(a),setTimeout(()=>{a.style.opacity="0",a.style.transform="translateX(20px) scale(0.95)",setTimeout(()=>a.remove(),400)},4e3)}constructor(){this._isSyncingFromRemote=!1,this._apiFolderReloadTimer=null,this._apiFolderReloadInFlight=!1,this._pendingApiFolderReloadReason=null,this.tabIndex=[],this.tabs=[],this.badges=[],this.tabData={},this.badgeData={},w.init(),this.loadData(),this.ensureTabDataHelpers(),this.version=null;try{this.version=browser.runtime.getManifest().version}catch(e){try{this.version=chrome.runtime.getManifest().version}catch(e){this.logMessage("info","Unable to get version from manifest")}}this.version&&this.logMessage("info",`Running version ${this.version}`),this.sidePanel=document.getElementById("guide-content"),this.sidePanelTrack=document.getElementById("guide-inner-content"),this.badgeContainer=(function(){var nodes=Array.from(document.querySelectorAll("#guide-content #items, #guide-inner-content #items, ytd-guide-renderer #items"));var hit=nodes.find(function(n){return n.querySelector('ytd-guide-entry-renderer a[href^="/@"], ytd-guide-entry-renderer a[href*="/channel/"]')});if(hit)return hit;var many=nodes.find(function(n){return n.querySelectorAll("ytd-guide-entry-renderer").length>5});return many||nodes[1]||nodes[0]||document.querySelectorAll("#guide-content #items")[1]})(),this.badgeHeader=this.createAndConfigureElement("div",{className:"ytt-badge-header"}),this.newTab=this._createIconBtn({label:"New folder",tooltip:"New folder",svgPath:"M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z",onClick:this.createNewTab.bind(this,null)}),this.searchBtn=this._createIconBtn({label:"Search subscriptions",tooltip:"Search subscriptions  (/)",svgPath:"M784-120 532-372q-30 24-69 38t-83 14q-109 0-184.5-75.5T120-580q0-109 75.5-184.5T380-840q109 0 184.5 75.5T640-580q0 44-14 83t-38 69l252 252-56 56ZM380-400q75 0 127.5-52.5T560-580q0-75-52.5-127.5T380-760q-75 0-127.5 52.5T200-580q0 75 52.5 127.5T380-400Z",onClick:()=>this.showSearchInterface()}),this.clearBtn=this._createIconBtn({label:"Clear library",tooltip:"Clear library \u2014 delete all folders and items",danger:!0,svgPath:"M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T760-120H280Zm480-600H200v520q0 9 5.5 14.5T220-180h520q9 0 14.5-5.5T760-200v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM200-720v520-520Z",onClick:this.clearLibrary.bind(this)}),this.scrollDistance=0,this.modal=!1,this.grabbing=!1,this.activeMenu,this.activePage,this.reformatGuide(),this.initializeTabs(),this.initializeBadges(),this.initializeFeedImprover(),this.initializeSubListener(),this.addSubscribeWidget(),this.refreshFolderLocks(),this.isLightTheme()?(this.logMessage("info","MY EYES! We're in light-theme! \uD83D\uDE35"),document.body.classList.add("ytt-light-theme")):this.logMessage("info","We're in dark-theme \uD83D\uDE0E"),this.checkAuthAndShowSubscriptions();let e="";new MutationObserver(()=>{location.href!==e&&(e=location.href,setTimeout(this.addSubscribeWidget.bind(this),500))}).observe(document.querySelector("body"),{childList:!0,subtree:!0}),Storage.getLocal("ytt_version",!1)!=this.version&&(Storage.setLocal("ytt_version",this.version,!1),"function"==typeof this.help&&this.help()),document.addEventListener("ytt-import",this.importData.bind(this)),document.addEventListener("ytt-export",this.exportData.bind(this)),document.addEventListener("ytt-close-popup",()=>{this.activePage?.close()}),document.addEventListener("keydown",e=>{"/"!==e.key||["INPUT","TEXTAREA"].includes(e.target.tagName)||e.target.isContentEditable||(e.preventDefault(),this.showSearchInterface())}),window.addEventListener("beforeunload",()=>{this._saveTimeout&&(clearTimeout(this._saveTimeout),this.syncFoldersToSupabase().catch(()=>{}))}),this.miniGuideManager=new f}ensureTabDataHelpers(){this.tabData&&"object"==typeof this.tabData||(this.tabData={}),"function"!=typeof this.tabData.update&&Object.defineProperty(this.tabData,"update",{enumerable:!1,value:e=>{if(!e||!e.id){console.error("Cannot update tab: Invalid tab object");return}let t=e.getName(),a=d(e.getColor()),n=e.closed||!1,i=this.tabIndex.indexOf(e.id),r=this.tabData[e.id]?.sortMode||"manual";this.tabData[e.id]={name:t,color:a,hidden:n,index:i>=0?i:0,sortMode:r},this.save(),console.log(`Tab ${e.id} updated with name: ${t}, color: ${a}, sort: ${r}`)}})}logMessage(e,...t){switch(e){case"error":console.error("[Youtube Tabs]",...t);break;case"warn":console.warn("[Youtube Tabs]",...t);break;default:console.log("[Youtube Tabs]",...t)}}reformatGuide(_retry){if(!this.badgeContainer||!this.badgeHeader||!this.sidePanel){const _a=(_retry||0)+1;if(_a<=5){const _d=[200,500,1000,2000,3000][_a-1]||3000;console.warn("[FolderTube] reformatGuide: element missing (attempt "+_a+"), retrying in "+_d+"ms — badgeContainer:",!!this.badgeContainer,"badgeHeader:",!!this.badgeHeader,"sidePanel:",!!this.sidePanel);setTimeout(()=>this.reformatGuide(_a),_d)}else{console.warn("[FolderTube] reformatGuide: giving up after "+_a+" attempts — sidebar elements never appeared")}return}const _bcp=this.badgeContainer.parentElement;if(!this.badgeHeader||this.badgeHeader.parentElement!==_bcp){this.scrollDistance=0;this.sidePanel.addEventListener("scroll",()=>{this.showBadges()});this.setStyle(this.badgeContainer,{position:"relative"});if(this.badgeContainer.querySelector("#expandable-items")){S(this.badgeContainer,...this.badgeContainer.querySelector("#expandable-items").children);let e=this.badgeContainer.getElementsByTagName("ytd-guide-collapsible-entry-renderer")[0];e&&e.remove()}if(_bcp&&0===this.badgeHeader.childNodes.length&&_bcp.children.length>0){let e=_bcp.children[0];e===this.badgeContainer||e.classList.contains("ytt-badge-header")||this.badgeHeader.appendChild(e)}if(!this.badgeHeader.querySelector(".ytt-badge-header-controls")){this.badgeHeader.appendChild(this.createAndConfigureElement("span",{className:"ytt-badge-header-controls"})),this.badgeHeader.controls=this.badgeHeader.lastChild,this.badgeHeader.text=this.badgeHeader.firstChild,this.sortFoldersBtn=this._createIconBtn({label:"Sort folders",tooltip:"Sort folders",svgPath:"M400-240v-80h160v80H400ZM240-440v-80h480v80H240ZM120-640v-80h720v80H120Z",onClick:e=>this.showFolderSortMenu(e)}),this.badgeHeader.controls.appendChild(this.searchBtn),this.badgeHeader.controls.appendChild(this.sortFoldersBtn),this.badgeHeader.controls.appendChild(this.newTab)}if(_bcp&&this.badgeHeader.parentElement!==_bcp){_bcp.insertBefore(this.badgeHeader,this.badgeContainer.nextSibling)}window.__yttRelocateUI&&window.__yttRelocateUI()}}initializeTabs(){if(window._ytt_dragging||window.folderTubeDragManager?.isDragging)return;this.ensureTabDataHelpers();let e=Object.nonFunctionKeys(this.tabData);e.length,this.badgeContainer,this.badgeContainer?.isConnected,e.sort((e,t)=>this.tabData[e].index-this.tabData[t].index).forEach(e=>{let t=this.tabData[e];this.createTab(t.name,e,t.color,t.hidden).moveToBottom()});let t=document.createElement("div");t.className="drop-indicator",document.addEventListener("ELEMENT_REORDERED",e=>{let{elementId:t,targetId:a,isAbove:n,elementType:i,parentId:r}=e.detail;if("tab"===i){let e=Array.from(this.badgeContainer.querySelectorAll(".tab")).map(e=>e.id);this.tabIndex=e,e.forEach((e,t)=>{this.tabData[e]&&(this.tabData[e].index=t)}),this.save()}else if("badge"===i&&this.badgeData[t]){if(r==="ytt-uncategorized")r=null;this.badgeData[t].tabID=r||-1;let _p=r?document.getElementById(r):this.badgeContainer;if(_p){let _bs=Array.from(_p.children).filter(el=>el&&el.classList&&el.classList.contains("ytt-badge"));if(_bs.length)_bs.forEach((el,idx)=>{if(this.badgeData[el.id])this.badgeData[el.id].order=idx});else this.badgeData[t].order=Date.now()}else this.badgeData[t].order=Date.now();this.save()}}),document.addEventListener("CHANNEL_MOVED",e=>{let{channelId:t,folderId:a}=e.detail;if(a==="ytt-uncategorized")a=-1;this.badgeData[t]&&(this.badgeData[t].tabID=a,this.badgeData[t].order=Date.now(),this.save())})}initializeBadges(){if(!this.badgeContainer||0===this.badgeContainer.childElementCount){let e=Array.from(document.querySelectorAll("#guide-content #items, #guide-inner-content #items, ytd-guide-renderer #items"));this.badgeContainer=e.find(e=>e.querySelectorAll("ytd-guide-entry-renderer").length>5)||e[1]}if(!this.badgeContainer){console.error("YSO: Could not find badge container!"),this.badges=[];return}let e=Array.from(this.badgeContainer.querySelectorAll("ytd-guide-entry-renderer"));if(0===e.length){let e=document.querySelector("ytd-guide-renderer");if(e){let t=Array.from(e.querySelectorAll("ytd-guide-entry-renderer"));t.length>0&&(this.allBadges=t)}}let t=e.find(e=>{let t=e.querySelector("#endpoint")?.title?.trim()||e.getAttribute("aria-label")?.trim();return"All subscriptions"===t});if(t){let a=e.indexOf(t);this.allSubscriptionsItem={element:t,originalIndex:a,originalParent:t.parentNode},t.setAttribute("data-special-item","all-subscriptions")}this.badges=e.filter(e=>{let t=e.querySelector("#endpoint")?.title?.trim();return t&&"All subscriptions"!==t&&"Subscriptions"!==t});let a=document.createElement("div");a.className="drop-indicator",this.dropIndicator=a,this.badges.forEach(e=>{if(!e.classList.contains("ytt-badge")){switch(e.id=this.getChannelIDFromBadge(e),e.icon=e.querySelector("yt-img-shadow"),e.classList.add("ytt-badge"),e.getAttribute("line-end-style")){case"none":e.status=0;break;case"dot":e.status=1;break;case"badge":e.status=2}this.badgeData[e.id]?.tabID,e.setAttribute("draggable",!0),this.badgeData[e.id]?this.badgeData[e.id].favorite&&e.classList.add("favorite"):this.badgeData[e.id]={tabID:-1,favorite:!1,order:Date.now()},e.toggleFavorite=t=>(t.stopImmediatePropagation(),t.preventDefault(),this.badgeData[e.id].favorite=e.classList.toggle("favorite"),this.logMessage("info",(this.badgeData[e.id].favorite?"Favorited":"Unfavorited")+` ${e.id}`),this.save(),this.sortBadges(),this.arrangeBadges(e),this.badgeData[e.id].favorite),e.moveTo=t=>{if(t==="ytt-uncategorized")t=-1;let a=this.badgeData[e.id].tabID;if(t){if(-1!=t&&!document.getElementById(t)){this.logMessage("error","Badge.moveTo() tab not found!",t);return}}else{this.logMessage("error","Badge.moveTo() tab ID doesn't exist!",e.id,t);return}if(-1==t?this.logMessage("info",`Removing badge '${e.id}' from tab ${a}`):a?this.logMessage("info",`Badge '${e.id}' moving from ${a} to ${t}`):this.logMessage("info",`Badge '${e.id}' moving to ${t}`),this.badgeData[e.id].tabID=t,this.badgeData[e.id].order=Date.now(),this.save(),-1!=t){let a=Array.from(document.getElementById(t).querySelectorAll(".ytt-badge"));a.push(e),this.sortBadges(a).findIndex(t=>t.id==e.id),this.arrangeBadges(e)}else this.updateBadgeOrder(),this.arrangeBadges(e);this.miniGuideManager&&this.miniGuideManager.updateMiniGuide(),e.menu&&e.menu.close();let n=-1===t?"Main Container":this.tabData[t]?.name||"folder",i=e.querySelector("#endpoint")?.title||e.id;this.showNotification(`${i} moved to ${n}`)},e.lock=()=>{this.setStyle(e,{pointerEvents:"none"}),e.setAttribute("active","")},e.unlock=()=>{this.setStyle(e,{pointerEvents:"all"}),e.removeAttribute("active")},e.icon.addEventListener("click",e.toggleFavorite)}}),this.sortBadges(),this.arrangeBadges(),this.restoreAllSubscriptionsPosition()}restoreAllSubscriptionsPosition(){if(!this.allSubscriptionsItem)return;let{element:e,originalIndex:t,originalParent:a}=this.allSubscriptionsItem;e.parentNode&&e.parentNode.removeChild(e);let n=Array.from(this.badgeContainer.querySelectorAll("ytd-guide-entry-renderer"));n.length>0?0===t?this.badgeContainer.insertBefore(e,n[0]):t>=n.length?this.badgeContainer.appendChild(e):this.badgeContainer.insertBefore(e,n[t]):this.badgeContainer.appendChild(e)}initializeFeedImprover(){let e=document.getElementById("contents"),t=new IntersectionObserver(e=>{e.forEach(e=>{e.isIntersecting?e.target.style=null:e.target.style.visibility="hidden"})},{rootMargin:"0px",threshold:0});setInterval(()=>{e||(e=document.getElementById("contents")),Array.from(e.children).forEach(e=>{e.classList.contains("observed")||"ytd-continuation-item-renderer"==e.tagName.toLowerCase()||(t.observe(e),e.classList.add("observed"))})},1e3)}initializeSubListener(){document.addEventListener("yt-subscription-changed",e=>{let t=this.getChannelIDFromPage();if(void 0!=Array.from(this.badges).find(e=>e.id==t)){this.logMessage("info","Unsubscribed from",t);let e=Array.from(this.badges).find(e=>e.id==t),a=Array.from(this.badges).findIndex(e=>e.id==t);e.remove(),this.badges.splice(a,1),document.getElementsByClassName("ytt-subscribe-retractor")?.[0]?.remove()}else{this.logMessage("info","Subscribed to",t);let e=new MutationObserver(()=>{this.initializeBadges();let a=Array.from(this.badges).find(e=>e.id==t);e.disconnect(),this.handleSubscription(a)});e.observe(this.badgeContainer,{childList:!0})}setTimeout(()=>{this.addSubscribeWidget()},250)}),this.subscriptionsObserver=new MutationObserver(e=>{if(window._ytt_dragging||window.folderTubeDragManager?.isDragging)return;let t=document.querySelector('[data-special-item="all-subscriptions"]');if(t&&!t.classList.contains("dragging")){let a=e.some(e=>"childList"===e.type&&e.target===this.badgeContainer&&Array.from(e.addedNodes).some(e=>1===e.nodeType&&!e.classList.contains("ytt-badge")));if(a){let e=Array.from(this.badgeContainer.children).indexOf(t);e!==this.allSubscriptionsItem.originalIndex&&-1!==e&&(this.logMessage("info","External list change detected, restoring position"),this.restoreAllSubscriptionsPosition())}}}),setTimeout(()=>{this.badgeContainer&&(this.subscriptionsObserver.observe(this.badgeContainer,{childList:!0,subtree:!0}),this.logMessage("info","Started monitoring subscription list"))},1e3)}sortBadges(e){let t=!1;if((void 0==e||0==e.length)&&(e=this.badges,t=!0),e=Array.from(e).sort((e,t)=>{let a=this.badgeData[e.id],n=this.badgeData[t.id];if(!a||!n)return 0;let i=this.tabData[a.tabID]?.index??1/0,r=this.tabData[n.tabID]?.index??1/0;if(i!==r)return i-r;let o=a.tabID,l=-1!==o&&this.tabData[o]?.sortMode||"manual";switch(l){case"name-asc":return e.id.localeCompare(t.id);case"name-desc":return t.id.localeCompare(e.id);case"date-newest":return(n.order||0)-(a.order||0);default:return(a.order||0)-(n.order||0)}}),!t)return e;this.badges=e}arrangeBadges(e){if(e){let t=this.badgeData[e.id];if(!t)return;let a=-1!==t.tabID?document.getElementById(t.tabID):null;a?e.parentNode!==a&&a.appendChild(e):e.parentNode!==this.badgeContainer&&this.badgeContainer.appendChild(e),requestAnimationFrame(()=>{this.isInViewport(e)&&e.classList.add("shown")}),this.restoreAllSubscriptionsPosition(),window.__yttUncatRender&&window.__yttUncatRender(this.badgeContainer),window.__yttRelocateUI&&window.__yttRelocateUI()}else{let e=document.createDocumentFragment(),t=new Map;this.badges.sort((e,t)=>{let a=this.badgeData[e.id]?.order||0,n=this.badgeData[t.id]?.order||0;return a-n}),this.badges.forEach(a=>{let n=this.badgeData[a.id]?.tabID||-1;-1!==n?(t.has(n)||t.set(n,document.createDocumentFragment()),t.get(n).appendChild(a)):e.appendChild(a)}),t.forEach((e,t)=>{let a=document.getElementById(t);a&&a.appendChild(e)}),this.badgeContainer.appendChild(e),this.restoreAllSubscriptionsPosition(),window.__yttUncatRender&&window.__yttUncatRender(this.badgeContainer),window.__yttRelocateUI&&window.__yttRelocateUI(),setTimeout(()=>this.showBadges(),100)}}setupDragScrolling(){let e=null;document.addEventListener("mousemove",t=>{if(!document.querySelector(".dragging")){e&&(clearInterval(e),e=null);return}let a=this.sidePanel.getBoundingClientRect();if(t.clientX>=a.left&&t.clientX<=a.right){let n=t.clientY-a.top,i=a.bottom-t.clientY;e&&(clearInterval(e),e=null),n<50?e=setInterval(()=>{this.sidePanel.scrollBy(0,-10)},50):i<50&&(e=setInterval(()=>{this.sidePanel.scrollBy(0,10)},50))}else e&&(clearInterval(e),e=null)}),document.addEventListener("dragend",()=>{e&&(clearInterval(e),e=null)}),document.addEventListener("drop",()=>{e&&(clearInterval(e),e=null)})}showBadges(){if(this._showingBadges)return;this._showingBadges=!0;let e=window.requestIdleCallback||(e=>setTimeout(e,50));e(()=>{let e=window.innerHeight||document.documentElement.clientHeight,t=window.innerWidth||document.documentElement.clientWidth,a=this.badges.filter(a=>{if(a.classList.contains("shown"))return!1;let n=a.getBoundingClientRect();return n.top>=0&&n.left>=0&&n.bottom<=e&&n.right<=t});if(0===a.length){this._showingBadges=!1;return}requestAnimationFrame(()=>{a.forEach((e,t)=>{e.style.animationDelay=`${.05*t}s`,e.classList.add("shown")}),this._showingBadges=!1})},{timeout:500})}createTab(e,t,a="#e3e3e3",n=!1){a=d(a);let i=document.createElement("div");i.className="drop-indicator";let r=this.isLockedFolder(t),o=this.createAndConfigureElement("div",{className:"tab "+(n?"closed ":"")+(r?"ytt-folder-locked ":""),title:e,id:t,style:{borderColor:a},color:a,closed:n});try{o.draggable=!0;o.dataset.folderId=t;o.classList.add("ytt-folder-tab")}catch(_){};o.addEventListener("click",e=>{o.classList.contains("ytt-folder-locked")&&(e.stopPropagation(),e.preventDefault(),this.showFolderUpgradePrompt())},!0),this.tabs.push(o),o.getName=()=>o.title||e,o.setName=e=>{let t=this.toTitleCase(e);o.title=t;let a=o.getElementsByClassName("tab-menu-name")[0];a&&(a.innerHTML=t),this.tabData[o.id]&&(this.tabData[o.id].name=t)},o.getColor=()=>this.tabData[o.id]&&this.tabData[o.id].color||o.color||o.style.borderColor||a,o.setColor=e=>{if(!e)return;e=d(e,o.color||a),o.color=e,o.style.borderColor=e;let t=o.querySelector(".tab-left-icon svg");t&&t.setAttribute("fill",e),this.tabData[o.id]&&(this.tabData[o.id].color=e)},o.moveToBottom=()=>{let e=[...this.badgeContainer.getElementsByClassName("tab")].pop();e?function(e,t){e.parentNode.insertBefore(t,e.nextSibling)}(e,o):this.badgeContainer.insertBefore(o,this.badgeContainer.firstChild)},o.moveToTop=()=>{this.badgeContainer.insertBefore(o,this.badgeContainer.firstChild);window.__yttRelocateUI&&window.__yttRelocateUI()},o.delete=()=>{for(let[e,t]of(delete this.tabData[o.id],this.tabs.splice(this.tabs.findIndex(e=>e.id==o.id),1),this.tabIndex.splice(this.tabIndex.findIndex(e=>e==o.id),1),Object.entries(this.badgeData)))t.tabID==o.id&&(this.badgeData[e].tabID=-1,this.badgeData[e].order=Date.now());o.remove();let e=o.id;(async()=>{if(window.FolderTubeApi&&window.FolderTubeApi.isAuthenticated())try{await window.FolderTubeApi.folders.delete(e),console.log(`[YSO] Folder ${e} deleted via API.`);return}catch(e){if(e&&"not_found"===e.code)return;console.warn("[YSO] API delete failed. Server remains authoritative:",e?.code||e),this.showNotification("Delete failed while the API is unavailable.","error")}})(),this.sortBadges(),this.arrangeBadges(),this.save(),"undefined"!=typeof EventManager&&EventManager.emit("TAB_DELETED",{id:o.id}),this.miniGuideManager&&this.miniGuideManager.loadFoldersData(!0)},o.header=this.createAndConfigureElement("div",{className:"tab-menu"});let l=this.toTitleCase(e)||"";o.titleLabel=this.createAndConfigureElement("h3",{innerHTML:l,className:"tab-menu-name"});let s=document.createElement("div");s.className="tab-left-icon";let c=`
            <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="${a}" style="pointer-events: none; display: inherit; width: 100%; height: 100%;">
                <path d="M146.67-160q-27 0-46.84-20.17Q80-200.33 80-226.67v-506.66q0-26.34 19.83-46.5Q119.67-800 146.67-800H414l66.67 66.67h332.66q26.34 0 46.5 20.16Q880-693 880-666.67v440q0 26.34-20.17 46.5Q839.67-160 813.33-160H146.67Zm0-66.67h666.66v-440H453l-66.67-66.66H146.67v506.66Zm0 0v-506.66V-226.67Z"/>
            </svg>
        `,h=`
            <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="${a}" style="pointer-events: none; display: inherit; width: 100%; height: 100%;">
                <path d="M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h240l80 80h320q33 0 56.5 23.5T880-640H447l-80-80H160v480l96-320h684L837-217q-8 26-29.5 41.5T760-160H160Zm84-80h516l72-240H316l-72 240Zm0 0 72-240-72 240Zm-84-400v-80 80Z"/>
            </svg>
        `;s.innerHTML=n?c:h,s.style.marginRight="6px",s.style.width="24px",s.style.height="24px",s.style.display="flex",s.style.alignItems="center",o.header.insertBefore(s,o.header.firstChild),o.header.addEventListener("contextmenu",e=>{e.preventDefault(),this.showTabContextMenu(o,e.clientX,e.clientY)}),o.header.addEventListener("click",e=>{(e.target.closest(".tab-menu-name")||e.target.closest(".tab-left-icon")||e.target.closest(".expand-arrow"))&&o.toggle()}),o.grab=this.createAndConfigureElement("span",{className:"hover-zone",event:{name:"mousedown",callback:o.grab}});let u=`<svg xmlns="http://www.w3.org/2000/svg" height="16" viewBox="0 0 24 24" width="16" fill="currentColor" style="transition:transform .2s;display:block;transform:rotate(90deg)"><path d="M8.793 5.293a1 1 0 000 1.414L14.086 12l-5.293 5.293a1 1 0 101.414 1.414L16.914 12l-6.707-6.707a1 1 0 00-1.414 0Z"/></svg>`,g=window.__ytt_rtl?`<svg xmlns="http://www.w3.org/2000/svg" height="16" viewBox="0 0 24 24" width="16" fill="currentColor" style="transition:transform .2s;display:block;transform:scaleX(-1)"><path d="M8.793 5.293a1 1 0 000 1.414L14.086 12l-5.293 5.293a1 1 0 101.414 1.414L16.914 12l-6.707-6.707a1 1 0 00-1.414 0Z"/></svg>`:`<svg xmlns="http://www.w3.org/2000/svg" height="16" viewBox="0 0 24 24" width="16" fill="currentColor" style="transition:transform .2s;display:block"><path d="M8.793 5.293a1 1 0 000 1.414L14.086 12l-5.293 5.293a1 1 0 101.414 1.414L16.914 12l-6.707-6.707a1 1 0 00-1.414 0Z"/></svg>`;o.toggle=()=>{o.classList.toggle("closed"),o.closed=o.classList.contains("closed");let e=this.toTitleCase(o.title);this.tabData[o.id]=Object.assign(this.tabData[o.id]||{},{name:e,color:d(o.style.borderColor,o.color||a),hidden:o.closed,index:Object.keys(this.tabData).indexOf(o.id)});o.expand.innerHTML=o.closed?g:u;s.innerHTML=o.closed?c:h;this.save()},o.expand=this.createAndConfigureElement("button",{className:"tab-menu-btn expand-arrow",style:{width:"16px",height:"16px",padding:"0",background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"},event:{name:"click",callback:()=>{o.toggle()}}}),o.expand.innerHTML=n?g:u,S(o.header,...[o.grab]),o.header.appendChild(o.titleLabel);return o.header.appendChild(o.expand),o.appendChild(o.header),this.tabIndex.push(o.id),o}createNewTab(e){if(this.creatingTab){if(document.querySelector(".tab-creation-form"))return;this.creatingTab=!1;if(this.newTab&&this.newTab.style)this.newTab.style.display="inline-block"}let t="undefined"!=typeof SupabaseAuth?SupabaseAuth._session?.profile:null;if(t?.plan==="free"){let e=Object.values(this.tabData).filter(e=>e&&"object"==typeof e).length;if(e>=3){this.showFolderUpgradePrompt();return}}this.creatingTab=!0,this.newTab.style.display="none";let a=document.createElement("div");a.className="tab-creation-form";let n=document.createElement("div");n.style.display="flex",n.style.flexDirection="column",n.style.gap="4px";let i=document.createElement("input");i.placeholder=(()=>{const _l=(window.ytt_language||'en').split('-')[0].toLowerCase();const _m={de:{ph:'Ordnername...',cancel:'Abbrechen',create:'Erstellen',empty:'Bitte Ordnernamen eingeben'},ar:{ph:'اسم المجلد...',cancel:'إلغاء',create:'إنشاء',empty:'الرجاء إدخال اسم المجلد'},fr:{ph:'Nom du dossier...',cancel:'Annuler',create:'Créer',empty:'Veuillez saisir un nom de dossier'},es:{ph:'Nombre de carpeta...',cancel:'Cancelar',create:'Crear',empty:'Por favor ingresa un nombre de carpeta'},pt:{ph:'Nome da pasta...',cancel:'Cancelar',create:'Criar',empty:'Por favor insira um nome de pasta'},it:{ph:'Nome cartella...',cancel:'Annulla',create:'Crea',empty:'Inserisci un nome per la cartella'},ru:{ph:'Название папки...',cancel:'Отмена',create:'Создать',empty:'Введите название папки'},tr:{ph:'Klasör adı...',cancel:'İptal',create:'Oluştur',empty:'Lütfen klasör adı girin'},ja:{ph:'フォルダー名...',cancel:'キャンセル',create:'作成',empty:'フォルダー名を入力してください'},ko:{ph:'폴더 이름...',cancel:'취소',create:'만들기',empty:'폴더 이름을 입력하세요'},zh:{ph:'文件夹名...',cancel:'取消',create:'创建',empty:'请输入文件夹名称'},nl:{ph:'Mapnaam...',cancel:'Annuleren',create:'Aanmaken',empty:'Voer een mapnaam in'},pl:{ph:'Nazwa folderu...',cancel:'Anuluj',create:'Utwórz',empty:'Proszę podać nazwę folderu'},sv:{ph:'Mappnamn...',cancel:'Avbryt',create:'Skapa',empty:'Ange ett mappnamn'},da:{ph:'Mappenavn...',cancel:'Annuller',create:'Opret',empty:'Angiv et mappenavn'},fi:{ph:'Kansion nimi...',cancel:'Peruuta',create:'Luo',empty:'Anna kansion nimi'},nb:{ph:'Mappenavn...',cancel:'Avbryt',create:'Opprett',empty:'Angi et mappenavn'},cs:{ph:'Název složky...',cancel:'Zrušit',create:'Vytvořit',empty:'Zadejte název složky'},hu:{ph:'Mappa neve...',cancel:'Mégse',create:'Létrehozás',empty:'Adja meg a mappa nevét'},ro:{ph:'Denumire dosar...',cancel:'Anulare',create:'Creare',empty:'Introduceți un nume pentru dosar'},el:{ph:'Όνομα φακέλου...',cancel:'Άκυρο',create:'Δημιουργία',empty:'Εισάγετε όνομα φακέλου'},he:{ph:'שם תיקייה...',cancel:'ביטול',create:'יצירה',empty:'נא להזין שם תיקייה'},iw:{ph:'שם תיקייה...',cancel:'ביטול',create:'יצירה',empty:'נא להזין שם תיקייה'},uk:{ph:'Назва папки...',cancel:'Скасувати',create:'Створити',empty:'Введіть назву папки'},bg:{ph:'Име на папка...',cancel:'Отказ',create:'Създаване',empty:'Въведете име на папка'},vi:{ph:'Tên thư mục...',cancel:'Hủy',create:'Tạo',empty:'Vui lòng nhập tên thư mục'},id:{ph:'Nama folder...',cancel:'Batal',create:'Buat',empty:'Masukkan nama folder'},ms:{ph:'Nama folder...',cancel:'Batal',create:'Buat',empty:'Sila masukkan nama folder'},th:{ph:'ชื่อโฟลเดอร์...',cancel:'ยกเลิก',create:'สร้าง',empty:'กรุณาใส่ชื่อโฟลเดอร์'},hi:{ph:'फ़ोल्डर नाम...',cancel:'रद्द करें',create:'बनाएं',empty:'कृपया फ़ोल्डर नाम दर्ज करें'},fa:{ph:'نام پوشه...',cancel:'لغو',create:'ایجاد',empty:'لطفاً نام پوشه را وارد کنید'},sk:{ph:'Názov priečinka...',cancel:'Zrušiť',create:'Vytvoriť',empty:'Zadajte názov priečinka'},hr:{ph:'Naziv mape...',cancel:'Odustani',create:'Stvori',empty:'Unesite naziv mape'}};window.__ytt_ct=_m[_l]||{ph:'Folder name...',cancel:'Cancel',create:'Create',empty:'Please enter a folder name'};return window.__ytt_ct.ph})()||'Folder name...',i.className="tab-name-input",n.appendChild(i),a.appendChild(n);let r=document.createElement("div");r.style.display="flex",r.style.flexDirection="column",r.style.gap="8px",r.style.marginTop="4px";let o="#cccccc",l=document.createElement("div");l.className="color-picker-container",["#cccccc","#4a90e2","#ff6b6b","#f7d794","#6ab04c","#eb4d8b","#a29bfe","#54d1db","#f0932b"].forEach(e=>{let t=document.createElement("button");t.className="color-picker-btn",t.style.backgroundColor=e,e===o&&t.classList.add("selected"),t.addEventListener("click",()=>{o=e,[...l.children].forEach(e=>e.classList.remove("selected")),t.classList.add("selected")}),l.appendChild(t)}),r.appendChild(l),a.appendChild(r);let s=document.createElement("div");s.className="ytt-form-actions";let d=document.createElement("button");d.textContent=(window.__ytt_ct||{cancel:'Cancel'}).cancel,d.className="create-tab-btn cancel";let c=document.createElement("button");c.textContent=(window.__ytt_ct||{create:'Create'}).create,c.className="create-tab-btn confirm",s.appendChild(d),s.appendChild(c),a.appendChild(s);let h=()=>{a&&a.parentNode&&a.remove(),this.creatingTab=!1,this.newTab.style.display="inline-block"};d.addEventListener("click",h),c.addEventListener("click",async()=>{let t=await this.isChannelAllowed();if(!t){this.addUpgradePrompt(),alert("Upgrade to Premium to manage folders across multiple channels.");return}let a=i.value.trim();if(!a){alert((window.__ytt_ct||{empty:'Please enter a folder name'}).empty);return}try{let t=crypto.randomUUID(),n=this.createTab(a,t,o);n.moveToTop();let i=this.toTitleCase(a);Object.keys(this.tabData).forEach(k=>{let v=this.tabData[k];if(v&&typeof v==="object"&&typeof v.index==="number")v.index+=1});this.tabData[t]={name:i,color:o,hidden:!1,index:0,createdAt:new Date().toISOString()},e&&e.moveTo(n.id),"undefined"!=typeof EventManager&&EventManager.emit("TAB_CREATED",{id:t,name:i,color:o}),this.miniGuideManager&&this.miniGuideManager.loadFoldersData(!0),this.save()}catch(e){console.error("Error creating tab:",e)}finally{h()}}),setTimeout(()=>i.focus(),50),this.badgeContainer.insertBefore(a,this.badgeContainer.firstChild),window.__yttRelocateUI&&window.__yttRelocateUI()}badgeOptions(e,t){if(!e)return;this.modal&&this.activeMenu?.close(),this.modal=!0;let a=this.createAndConfigureElement("div",{className:"ytt-badge-menu",event:{name:"click",callback:e=>{e.stopPropagation()}}});if(a.head=this.createAndConfigureElement("div",{className:"ytt-menu-head"}),a.body=this.createAndConfigureElement("div",{className:"ytt-menu-body"}),a.favorite=this.createAndConfigureElement("button",{className:"ytt-badge-menu-btn favorite "+(this.badgeData[e.id].favorite?"filled":""),event:{name:"click",callback:t=>{e.toggleFavorite(t)?a.favorite.classList.add("filled"):a.favorite.classList.remove("filled")}}}),a.new=this.createAndConfigureElement("button",{className:"ytt-badge-menu-btn new",event:{name:"click",callback:()=>{a.close(),this.createNewTab(e)}}}),e.menu=a,this.activeMenu=a,a.close=()=>{a.remove(),e.menu=null,this.activePage?this.activeMenu=null:this.modal=!1,e.unlock()},e.lock(),S(a.head,...[a.favorite,a.new]),function(e,t){for(index in t)e.appendChild(t[index])}(a,[a.head,a.body]),t?document.body.appendChild(a):e.appendChild(a),Object.nonFunctionKeys(this.tabData).sort((e,t)=>this.tabData[e].index-this.tabData[t].index).forEach(t=>{let n=this.tabData[t],i=this.toTitleCase(n.name),r=this.createAndConfigureElement("span",{className:"tab-selector",innerHTML:`<span>${i}</span>`,event:{name:"click",callback:()=>e.moveTo(t)}});r.style.setProperty("--color",n.color),a.body.appendChild(r)}),t){a.style.position="fixed";let e=t.getBoundingClientRect();a.style.left=`${e.left-128-8}px`,a.style.top=`${e.top}px`,setTimeout(()=>{let t=a.getBoundingClientRect();t.left<0&&(a.style.left=`${e.right+8}px`),t.bottom>window.innerHeight&&(a.style.top=`${window.innerHeight-t.height-10}px`)},0)}else{let t=a.getBoundingClientRect(),n={x:0,y:-a.offsetHeight/2+e.offsetHeight/2};t.top+n.y<60&&(n.y=60-t.top),t.bottom+n.y>window.innerHeight&&(n.y=window.innerHeight-t.bottom),a.style.left=`${n.x+e.offsetWidth}px`,a.style.top=`${n.y}px`}}tabOptions(e){this.modal&&this.activeMenu.close(),this.modal=!0;let t=this.createAndConfigureElement("div",{className:"ytt-badge-menu",event:{name:"click",callback:e=>{e.stopPropagation()}}});t.body=this.createAndConfigureElement("div",{className:"ytt-menu-body",style:{display:"flex",flexDirection:"column"}}),t.colorContainer=this.createAndConfigureElement("input",{type:"color",id:"color-picker",value:e.getColor()||"#"+Math.floor(16777215*Math.random()).toString(16).padStart(6,"0"),style:{width:"100%",height:"30px",marginBottom:"10px"}}),t.nameField=this.createAndConfigureElement("input",{id:"name",className:"menu-input",placeholder:"Tab name...",value:e.getName()}),this.activeMenu=t,t.close=()=>{this.save(),t.remove(),this.modal=!1},S(t.body,...[t.colorContainer,t.nameField]),S(t,...[t.body]),e.header.appendChild(t),t.colorContainer.addEventListener("input",t=>{e.setColor(t.target.value)}),t.nameField.addEventListener("input",t=>e.setName(t.target.value)),t.addEventListener("keypress",e=>{"Enter"===e.key&&t.close()});let a=t.getBoundingClientRect(),n={x:0,y:-t.offsetHeight/2+e.header.offsetHeight/2};a.top+n.y<60&&(n.y=60-a.top),a.bottom+n.y>window.innerHeight&&(n.y=window.innerHeight-a.bottom),t.style.left=`${n.x+e.header.offsetWidth}px`,t.style.top=`${n.y}px`}addSubscribeWidget(e){let t;if(window.location.href.includes("watch?")?t=document.querySelector("#subscribe-button"):(window.location.href.includes("/channel/")||window.location.href.includes("/c/")||window.location.href.includes("/user/")||window.location.href.includes("/@"))&&(t=document.querySelector("#subscribe-button")),e||t){if(e&&!t)return}else{setTimeout(this.addSubscribeWidget.bind(this,!0),500);return}let a=this.getChannelIDFromPage(),n=this.tabData[this.badgeData[a]?.tabID],i=t.querySelector(".yt-core-attributed-string")?.innerHTML.includes("Subscribed");i&&(t.retractor&&t.retractor.remove(),t.retractor=this.createAndConfigureElement("span",{className:"ytt-subscribe-retractor"}),t.getBoundingClientRect(),n?(t.style.setProperty("--tabName",`"${n.name}"`),t.style.setProperty("--tabColor",n.color)):(t.style.setProperty("--tabName",'"No Tab"'),t.style.setProperty("--tabColor","black")),i?(t.classList.add("subscribed"),t.classList.remove("unsubscribed")):(t.classList.remove("subscribed"),t.classList.add("unsubscribed")),t.style.setProperty("position","relative"),t.appendChild(t.retractor),t.retractor.addEventListener("click",e=>{e.stopPropagation(),this.badgeOptions(this.badges.find(e=>e.id==a),t)}),"light"==E(n?.color||"black")?t.style.setProperty("--textColor","black"):t.style.setProperty("--textColor","white"))}toTitleCase(e){return e?e.replace(/\w\S*/g,e=>e.charAt(0).toUpperCase()+e.substr(1).toLowerCase()):""}getChannelIDFromPage(){let e=document.querySelector('meta[itemprop="channelId"]')?.content;if(e)return e;let t=window.location.href.match(/\.com(.*)/gm)?.[0];if(t&&(t=t.substring(5)),t?.includes("/")&&(t=null),window.location.href.includes("watch?")){let e=document.querySelector("#upload-info[class*='style-scope']");if(!e)return null;let t=e.querySelector("a");if(!t)return null;let a=t.getAttribute("href");return a?.includes("/channel/")?a.split("/channel/")[1]:a?.includes("/@")?a.split("/@")[1]:t.innerHTML.trim()}if(window.location.href.includes("/channel/")||window.location.href.includes("/c/")||window.location.href.includes("/@")||t){let e=window.location.pathname.split("/channel/")[1];if(e)return e;let t=document.getElementById("inner-header-container");if(!t)return null;let a=t.querySelector("#text");return a?a.innerHTML.trim():null}return null}getChannelIDFromBadge(e){let t=e=>{let t=e?.data||e?.__data?.data||e?.__data,a=t?.navigationEndpoint||t?.endpoint,n=a?.browseEndpoint?.browseId||t?.browseEndpoint?.browseId;return"string"==typeof n&&/^UC[\w-]{20,}$/.test(n)?n:null},a=t(e);if(a)return a;let i=e.querySelector?.("#endpoint"),r=t(i);if(r)return r;let o=e.querySelectorAll?.("a[href]")||[];for(let e of o){let t=(e.getAttribute("href")||"").match(/\/channel\/(UC[\w-]{20,})/);if(t)return t[1]}let l=(i?.title||e.getAttribute?.("aria-label")||e.querySelector?.("#endpoint, yt-formatted-string")?.textContent||"").trim();if(l&&void 0!==n){let e=n.getAll().find(e=>(e.name||"").trim()===l);if(e?.id&&/^UC[\w-]{20,}$/.test(e.id))return e.id}let s=i?.getAttribute?.("href")||"";if(s.includes("/@")){let e=s.split("/@")[1].split(/[/?#]/)[0];if(e)return"@"+e}return l||null}isInViewport(e){if(!e)return!1;let t=e.getBoundingClientRect();return t.top>=0&&t.left>=0&&t.bottom<=(window.innerHeight||document.documentElement.clientHeight)&&t.right<=(window.innerWidth||document.documentElement.clientWidth)}isLightTheme(){let e=window.getComputedStyle(document.querySelector("ytd-app")),t=e.getPropertyValue("--yt-spec-base-background")||e.getPropertyValue("--yt-spec-general-background-a")||e.getPropertyValue("--yt-spec-general-background-b");return"light"==E(t)}createAndConfigureElement(e,t){let a=document.createElement(e);return t.event&&(a.addEventListener(t.event.name,t.event.callback),delete t.event),a=Object.assign(a,t),"string"==typeof t.style?a.style=t.style:"object"==typeof t.style&&Object.assign(a.style,t.style),a}setStyle(e,t){"string"==typeof t?e.style=t:"object"==typeof t&&Object.assign(e.style,t)}scheduleChannelScopedLoad(){return this._channelScopedLoadPromise||(this._channelScopedLoadPromise=ChannelManager.init({timeoutMs:0}).then(e=>{i(e)&&(Storage.setChannelId(e),u(),console.log(`[YSO] Active channel ID ready (${e}); loading channel-scoped folders.`),this._channelScopedLoadPromise=null,this.loadData())}).catch(e=>{this._channelScopedLoadPromise=null,console.error("[YSO] Failed while waiting for active channel ID:",e)})),this._channelScopedLoadPromise}scheduleApiFolderReload(e="state-change",t=150){this._pendingApiFolderReloadReason=e,this._apiFolderReloadTimer&&clearTimeout(this._apiFolderReloadTimer),this._apiFolderReloadTimer=setTimeout(()=>{this._apiFolderReloadTimer=null;let t=this._pendingApiFolderReloadReason||e;this._pendingApiFolderReloadReason=null,this.retryApiFolderLoad(t).catch(e=>console.error(`[YSO] API folder reload retry failed (${t}):`,e))},t)}async retryApiFolderLoad(e="state-change"){if(this._apiFolderReloadInFlight){this.scheduleApiFolderReload(`${e}:queued`,300);return}this._apiFolderReloadInFlight=!0;try{let t=await c(e);if(!t.channelId){h(),this.scheduleChannelScopedLoad();return}if("undefined"!=typeof SupabaseAuth&&!SupabaseAuth._session){let t=await SupabaseAuth.validateApiSession();console.log(`[YSO] API auth hydration during folder retry (${e}): ${t?"ready":"not ready"}.`)}"function"==typeof this.checkAuthAndShowSubscriptions?await this.checkAuthAndShowSubscriptions():await this.loadFromSupabase(),!this._serverFolderStateLoaded&&"undefined"!=typeof SupabaseAuth&&SupabaseAuth._session&&(console.log(`[YSO] Auth is present but folder state is still empty after ${e}; retrying API folder load once.`),await this.loadFromSupabase())}finally{this._apiFolderReloadInFlight=!1}}loadData(){if(!r()){console.log("[YSO] Delaying local folder load: no active channel ID available yet."),h(),this.scheduleChannelScopedLoad();return}this.tabData={},this.badgeData={},this._serverFolderStateLoaded=!1,this.loadFromSupabase().catch(e=>console.error("[YSO] Initial API folder load failed:",e))}async loadFromSupabase(){if(!this._isSyncingFromRemote){this._isSyncingFromRemote=!0;try{let e=r();if(!e){console.log("[YSO] Delaying remote folder load: no active channel ID available yet."),h(),this.scheduleChannelScopedLoad();return}let t=null;if(window.FolderTubeApi&&await l())try{let a=await window.FolderTubeApi.folders.list(e);a&&Array.isArray(a.folders)&&(t=a.folders,console.log(`[YSO] API returned ${t.length} folders for channel ${e}.`))}catch(e){if(e&&"channel_not_linked"===e.code){console.warn("[YSO] API: channel_not_linked. Clearing local state."),this.tabData={},this.badgeData={};try{this.clearUI?.()}catch(e){}try{this.showChannelNotLinkedPrompt({plan:e.body?.plan||"free",reason:"channel-not-linked",allowed_channels:e.body?.allowed_channels||[],primary:(e.body?.allowed_channels||[])[0]||null})}catch(e){}return}if(e&&"not_authenticated"===e.code){console.log("[YSO] State: not_authenticated — auth hydrating. ChannelId:",r(),"AccessToken present:",!!(typeof chrome!=="undefined"&&chrome.storage));return}if(e&&(e.code==="route_not_found"||e.code==="http_404"||e.status===404)){console.warn("[YSO] State: route_not_found — endpoint returned 404. Possible wrong apiUrl or server cold start. Code:",e?.code,"ChannelId:",r());return}const _ftErrState=e?.status>=500||!e?.status?"api_unreachable":"api_error";console.warn("[YSO] State:",_ftErrState,"— folders.list code:",e?.code||e,"status:",e?.status||e?.statusCode,"channelId:",r());return}if(!t){console.warn("[YSO] State: api_unreachable — no folder data returned. ChannelId:",r(),"Staying inactive silently; will retry on auth/channel events.");return}if(!t&&w.isReady?(console.log("[YSO] Requesting folders via bridge..."),(t=await w.request("FT_GET_FOLDERS",{channelId:e}).catch(e=>(console.warn("[YSO] Bridge request failed:",e),null)))&&!Array.isArray(t)&&(t.unsupported&&console.log("[YSO] Bridge reported FT_GET_FOLDERS unsupported, falling back."),t=null)):t||console.log("[YSO] Bridge not ready."),!t)return;if(this._serverFolderStateLoaded=!0,document.body.classList.remove("ytt-api-offline"),document.getElementById("ytt-api-offline-state")?.remove(),console.log(`[YSO] Received ${t.length} folders from API for channel ${e}.`),t.length>0){let e=!1;if(t.forEach(t=>{let a=t.metadata||{},i=t.name||t.title||"Unnamed Folder";this.tabData[t.id]?((this.tabData[t.id].name!==i||this.tabData[t.id].color!==d(t.color))&&(console.log(`[YSO] Updating existing folder from database: ${i}`),this.tabData[t.id].name=i,this.tabData[t.id].color=d(t.color,this.tabData[t.id].color),e=!0),this.tabData[t.id].createdAt!==s(t.created_at||this.tabData[t.id].createdAt)&&(this.tabData[t.id].createdAt=s(t.created_at||this.tabData[t.id].createdAt),e=!0)):(console.log(`[YSO] Adding new folder from database: ${i} (${t.id})`),this.tabData[t.id]={name:i,color:d(t.color),hidden:a.hidden||!1,index:a.index||0,sortMode:a.sortMode||"manual",createdAt:s(t.created_at)},e=!0),a.channels&&Array.isArray(a.channels)&&a.channels.forEach(a=>{let r=a.id||a.channelId,o="string"==typeof r&&/^UC[\w-]{20,}$/.test(r);if(r&&!o){if(void 0!==n&&n.getAll().length>0){let t=n.getAll().find(e=>(e.name||"").trim()===String(r).trim());t?.id&&/^UC[\w-]{20,}$/.test(t.id)?(console.log(`[YSO] Re-keying legacy channel "${r}" -> ${t.id}`),this.badgeData[r]&&(delete this.badgeData[r],e=!0),r=t.id,this._migratedChannelKeys=!0):this._needsSubsForMigration=!0}else this._needsSubsForMigration=!0}r&&(!this.badgeData[r]||this.badgeData[r].tabID!==t.id)&&(console.log(`[YSO] Updating channel assignment for ${r} -> ${i}`),this.badgeData[r]={tabID:t.id,favorite:a.favorite||!1,order:a.order||Date.now()},e=!0)})}),(()=>{for(const _cid of Object.keys(this.badgeData)){const _bd=this.badgeData[_cid];if(_bd&&_bd.tabID&&_bd.tabID!==-1&&this.tabData[_bd.tabID]){if(!Array.isArray(this.tabData[_bd.tabID].channelIds))this.tabData[_bd.tabID].channelIds=[];if(!this.tabData[_bd.tabID].channelIds.includes(_cid))this.tabData[_bd.tabID].channelIds.push(_cid);}}})(),e?(console.log("[YSO] Synchronized folders from Brain. Updating UI..."),this.reload()):console.log("[YSO] Local data already synchronized with database."),this.refreshFolderLocks(),this._migratedChannelKeys&&(this._migratedChannelKeys=!1,console.log("[YSO] Persisting corrected UC IDs to database..."),this.save()),this._needsSubsForMigration&&!this._subsRetryListenerInstalled){this._subsRetryListenerInstalled=!0;let e=()=>{document.removeEventListener("YTT_SUBSCRIPTIONS_UPDATED",e),this._subsRetryListenerInstalled=!1,this._needsSubsForMigration=!1,console.log("[YSO] Subscriptions ready \u2014 retrying channel-key migration."),this.loadFromSupabase().catch(e=>console.error("[YSO] Retry load after subs update failed:",e))};document.addEventListener("YTT_SUBSCRIPTIONS_UPDATED",e)}}else console.log("[YSO] Database returned 0 folders for this channel.")}catch(e){console.error("[YSO] Brain sync load failed:",e)}finally{this._isSyncingFromRemote=!1}}}async clearLibrary(){if(confirm("Are you sure you want to clear your entire folder library? This will delete all folders and items you have organized. This action cannot be undone."))try{let e=Storage.getScopedKey("ytt-tabs"),t=Storage.getScopedKey("ytt-badges");localStorage.removeItem(e),localStorage.removeItem(t),"undefined"!=typeof chrome&&chrome.storage&&chrome.storage.local&&await new Promise(e=>chrome.storage.local.clear(e)),localStorage.removeItem("ytt-tabs"),localStorage.removeItem("ytt-badges"),localStorage.removeItem("subscription_tabs"),localStorage.removeItem("subscription_links"),alert("Library cleared successfully. The page will now reload."),window.location.reload()}catch(e){console.error("Error clearing library:",e),alert("An error occurred while clearing the library.")}}async initSupabase(){return"undefined"!=typeof SupabaseAuth?SupabaseAuth.getClient():null}async checkAuthAndShowSubscriptions(){"undefined"==typeof SupabaseAuth||SupabaseAuth._session||await SupabaseAuth.validateApiSession(),"undefined"!=typeof SupabaseAuth&&SupabaseAuth.requiresExtensionUpdate()||g();let e="undefined"!=typeof SupabaseAuth?SupabaseAuth._session:null,t=e?.profile||null,a="undefined"!=typeof SupabaseAuth&&SupabaseAuth.isRegistrationComplete(t);if(!a){document.body.classList.remove("ytt-unregistered");[document.getElementById("ytt-upgrade-prompt"),document.getElementById("ytt-subscription-prompt")].forEach(e=>e&&e.remove());return}let n=r(),i=SupabaseAuth.getAllowedChannels(t);if(!n){document.body.classList.remove("ytt-unregistered");[document.getElementById("ytt-upgrade-prompt"),document.getElementById("ytt-subscription-prompt")].forEach(e=>e&&e.remove());return}let o=i.includes(n);if(!o){document.body.classList.add("ytt-unregistered");let e=document.getElementById("ytt-subscription-prompt");e&&e.remove(),this.addUpgradePrompt(),console.log(`[YSO] Locked: channel ${n} not in allow list ${JSON.stringify(i)} (plan limit ${SupabaseAuth.getChannelsLimit(t)}).`);return}if("undefined"!=typeof SupabaseAuth&&SupabaseAuth.requiresExtensionUpdate()){document.body.classList.add("ytt-unregistered"),function(e){let t=document.getElementById("ytt-extension-update-state");if(t)return;let a=document.createElement("div");a.id="ytt-extension-update-state",a.style.cssText="position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(15,23,42,.58)";let n=document.createElement("div");n.style.cssText="max-width:420px;width:min(100%,420px);padding:20px;border-radius:14px;background:#ffffff;box-shadow:0 24px 60px rgba(15,23,42,.28);font:500 14px/1.45 Roboto, Arial, sans-serif;color:#0f172a",n.innerHTML=`
        <div style="font-size:18px;font-weight:700;margin-bottom:8px;">Update Required</div>
        <div style="margin-bottom:14px;">FolderTube needs extension version ${e} or newer before it can sync with the server.</div>
        <div style="font-size:12px;color:#475569;">Reload the unpacked extension or install the latest production build, then refresh YouTube.</div>
    `,a.appendChild(n),document.documentElement.appendChild(a)}(SupabaseAuth.getMinExtensionVersion());return}g(),document.body.classList.remove("ytt-unregistered"),Date.now()-(this._lastAuthCheck||0)>3000&&(this._lastAuthCheck=Date.now(),await this.loadFromSupabase()).catch(e=>console.error("[YSO] Post-auth remote load failed:",e));let l=document.getElementById("ytt-subscription-prompt");l&&l.remove();let s=document.getElementById("ytt-upgrade-prompt");s&&s.remove()}forceUpdateAuthStatus(){this._lastAllowedCheck=0;let e=this.checkAuthAndShowSubscriptions();return this.refreshFolderLocks(),e}getLockedFolderIds(){let e="undefined"!=typeof SupabaseAuth?SupabaseAuth._session?.profile:null;if(!e||"free"!==e.plan)return new Set;if(this.badgeContainer){let e=Array.from(this.badgeContainer.querySelectorAll(":scope > .tab"));if(e.length>0)return new Set(e.slice(3).map(e=>e.id))}let t=Object.entries(this.tabData).filter(([e,t])=>t&&"object"==typeof t).map(([e,t])=>({id:e,index:"number"==typeof t.index?t.index:Number.MAX_SAFE_INTEGER})).sort((e,t)=>e.index-t.index);return new Set(t.slice(3).map(e=>e.id))}isLockedFolder(e){return this.getLockedFolderIds().has(e)}refreshFolderLocks(){let e=this.getLockedFolderIds();for(let t of this.tabs)t.classList.toggle("ytt-folder-locked",e.has(t.id));this.renderLockOverlay()}renderLockOverlay(){let e=this.badgeContainer;if(!e)return;let t=e.querySelector(":scope > .ytt-lock-overlay");t&&t.remove();let a=this.getLockedFolderIds();if(0===a.size)return;let n=Array.from(e.querySelectorAll(":scope > .tab")),i=n.find(e=>a.has(e.id));if(!i)return;"static"===getComputedStyle(e).position&&(e.style.position="relative");let r=n.filter(e=>a.has(e.id)).length,o=document.createElement("div");o.className="ytt-lock-overlay",o.setAttribute("role","button"),o.setAttribute("aria-label",`${r} locked folder${r>1?"s":""}. Click to upgrade.`),o.tabIndex=0,o.innerHTML=`
            <div class="ytt-lock-overlay__card">
                <div class="ytt-lock-overlay__icon" aria-hidden="true">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" width="28" height="28" fill="currentColor">
                        <path d="M240-80q-33 0-56.5-23.5T160-160v-400q0-33 23.5-56.5T240-640h40v-80q0-83 58.5-141.5T480-920q83 0 141.5 58.5T680-720v80h40q33 0 56.5 23.5T800-560v400q0 33-23.5 56.5T720-80H240Zm0-80h480v-400H240v400Zm240-120q33 0 56.5-23.5T560-360q0-33-23.5-56.5T480-440q-33 0-56.5 23.5T400-360q0 33 23.5 56.5T480-280ZM360-640h240v-80q0-50-35-85t-85-35q-50 0-85 35t-35 85v80Z"/>
                    </svg>
                </div>
                <div class="ytt-lock-overlay__title">${r} folder${r>1?"s":""} locked</div>
                <div class="ytt-lock-overlay__body">Free plan keeps your first 3 folders unlocked. Your other folders are safe \u2014 upgrade to use them.</div>
                <button class="ytt-lock-overlay__btn" type="button">Upgrade to unlock</button>
            </div>
        `;let l=e=>{e.stopPropagation(),e.preventDefault(),this.showFolderUpgradePrompt()};o.addEventListener("click",l),o.addEventListener("keydown",e=>{("Enter"===e.key||" "===e.key)&&l(e)}),e.appendChild(o);let s=()=>{let t=Array.from(e.querySelectorAll(":scope > .tab")),a=this.getLockedFolderIds(),n=t.find(e=>a.has(e.id));if(!n){o.remove();return}o.style.top=`${n.offsetTop}px`};if(s(),"undefined"!=typeof ResizeObserver){let t=new ResizeObserver(s);t.observe(e),n.forEach(e=>t.observe(e));let a=new MutationObserver(()=>{o.isConnected||(t.disconnect(),a.disconnect())});a.observe(e,{childList:!0})}}showChannelNotLinkedPrompt(e={}){return;let t,a,n,i,r,o;if(this._channelNotLinkedModalOpen)return;this._channelNotLinkedModalOpen=!0;let l=w.websiteUrl?w.websiteUrl:"https://foldertube.vercel.app",s=l+"/profile",d=l+"/pricing",c=e.plan||"free",h="no-primary-set"===e.reason;h?(t="Link your YouTube channel",a="Welcome to FolderTube! To start organizing, link your primary YouTube channel from your dashboard. It only takes a second.",n="Open dashboard",i=s,r="Maybe later",o=null):"pro"===c||"agency"===c?e.atLimit?(t="This channel is not linked",a="You've linked the maximum of 3 channels on Pro. Remove one from your dashboard before adding this channel.",n="Open dashboard",i=s,r="See plans",o=d):(t="This channel is not linked",a="Add this channel to your linked channels from the website dashboard. You can manage all your linked channels from there.",n="Add from dashboard",i=s,r="Maybe later",o=null):(t="This channel is not linked",a="Your account is on the "+("plus"===c?"Plus":"Free")+" plan, which links to a single YouTube channel. Switch back to your linked channel, or upgrade to Pro to manage up to 3 channels.",n="Upgrade to Pro",i=d,r="Open dashboard",o=s);let u=document.createElement("div");u.className="ytt-upgrade-backdrop";let g=document.createElement("div");g.className="ytt-popup ytt-upgrade-modal",g.setAttribute("role","dialog"),g.setAttribute("aria-modal","true"),g.innerHTML=`
            <div class="ytt-upgrade-icon" aria-hidden="true">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" width="40" height="40" fill="currentColor">
                    <path d="M480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm-40-160h80v-240h-80v240Zm40-320q17 0 28.5-11.5T520-680q0-17-11.5-28.5T480-720q-17 0-28.5 11.5T440-680q0 17 11.5 28.5T480-640Zm0 160Z"/>
                </svg>
            </div>
            <h2 class="ytt-upgrade-title">${t}</h2>
            <p class="ytt-upgrade-body">${a}</p>
            <div class="ytt-upgrade-actions">
                <button class="ytt-upgrade-btn ytt-upgrade-btn--secondary" data-action="secondary">${r}</button>
                <button class="ytt-upgrade-btn ytt-upgrade-btn--primary" data-action="primary">${n}</button>
            </div>
            <div class="exit ytt-upgrade-close" role="button" aria-label="Close" tabindex="0"></div>
        `;let m=()=>{u.remove(),g.remove(),this._channelNotLinkedModalOpen=!1,document.removeEventListener("keydown",p,!0)},p=e=>{"Escape"===e.key&&(e.stopPropagation(),m())};u.addEventListener("click",m),g.querySelector(".ytt-upgrade-close").addEventListener("click",m),g.querySelector('[data-action="primary"]').addEventListener("click",()=>{i&&window.open(i,"_blank"),m()}),g.querySelector('[data-action="secondary"]').addEventListener("click",()=>{o&&window.open(o,"_blank"),m()}),document.addEventListener("keydown",p,!0),document.body.appendChild(u),document.body.appendChild(g),g.querySelector('[data-action="primary"]').focus()}showFolderUpgradePrompt(){if(this._upgradeModalOpen)return;this._upgradeModalOpen=!0;let e=w.websiteUrl?w.websiteUrl+"/pricing":"https://foldertube.vercel.app/pricing",t=document.createElement("div");t.className="ytt-upgrade-backdrop";let a=document.createElement("div");a.className="ytt-popup ytt-upgrade-modal",a.setAttribute("role","dialog"),a.setAttribute("aria-modal","true"),a.setAttribute("aria-labelledby","ytt-upgrade-title"),a.innerHTML=`
            <div class="ytt-upgrade-icon" aria-hidden="true">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" width="40" height="40" fill="currentColor">
                    <path d="M240-80q-33 0-56.5-23.5T160-160v-400q0-33 23.5-56.5T240-640h40v-80q0-83 58.5-141.5T480-920q83 0 141.5 58.5T680-720v80h40q33 0 56.5 23.5T800-560v400q0 33-23.5 56.5T720-80H240Zm0-80h480v-400H240v400Zm240-120q33 0 56.5-23.5T560-360q0-33-23.5-56.5T480-440q-33 0-56.5 23.5T400-360q0 33 23.5 56.5T480-280ZM360-640h240v-80q0-50-35-85t-85-35q-50 0-85 35t-35 85v80Z"/>
                </svg>
            </div>
            <h2 class="ytt-upgrade-title" id="ytt-upgrade-title">This folder is locked</h2>
            <p class="ytt-upgrade-body">
                You're on the <strong>Free</strong> plan, which keeps your first 3 folders unlocked.
                Your other folders are safe and visible \u2014 they just can't be opened until you upgrade.
            </p>
            <ul class="ytt-upgrade-perks">
                <li><span class="ytt-perk-check">\u2713</span> Unlimited folders</li>
                <li><span class="ytt-perk-check">\u2713</span> Nothing is ever deleted on downgrade</li>
                <li><span class="ytt-perk-check">\u2713</span> Pro adds up to 3 YouTube channels</li>
            </ul>
            <div class="ytt-upgrade-actions">
                <button class="ytt-upgrade-btn ytt-upgrade-btn--secondary" data-action="cancel">Maybe later</button>
                <button class="ytt-upgrade-btn ytt-upgrade-btn--primary" data-action="upgrade">See plans</button>
            </div>
            <div class="exit ytt-upgrade-close" role="button" aria-label="Close" tabindex="0"></div>
        `;let n=()=>{t.remove(),a.remove(),this._upgradeModalOpen=!1,document.removeEventListener("keydown",i,!0)},i=e=>{"Escape"===e.key&&(e.stopPropagation(),n())};t.addEventListener("click",n),a.querySelector('[data-action="cancel"]').addEventListener("click",n),a.querySelector(".ytt-upgrade-close").addEventListener("click",n),a.querySelector('[data-action="upgrade"]').addEventListener("click",()=>{window.open(e,"_blank"),n()}),document.addEventListener("keydown",i,!0),document.body.appendChild(t),document.body.appendChild(a),a.querySelector('[data-action="upgrade"]').focus()}async isChannelAllowed(){if("undefined"==typeof SupabaseAuth)return!1;let e=SupabaseAuth._session;if(!e||!SupabaseAuth.isRegistrationComplete(e.profile))return!1;let t=r();if(!t)return!1;let a=SupabaseAuth.getAllowedChannels(e.profile);return a.includes(t)}async getPrimaryChannel(e){return null}addUpgradePrompt(){if(document.getElementById("ytt-upgrade-prompt"))return;let e=document.querySelectorAll("ytd-guide-section-renderer"),t=e[1],a=document.createElement("div");if(a.id="ytt-upgrade-prompt",a.className="ytt-subscription-section premium-banner",a.style.backgroundColor="rgba(255, 215, 0, 0.1)",a.style.border="1px solid rgba(255, 215, 0, 0.3)",a.innerHTML=`
            <div class="ytt-section-header" style="color: #ffd700;">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>
                <span>Channel not linked</span>
            </div>
            <div class="ytt-section-body">
                <p style="font-size: 11px;">This channel is not linked. Add it from your dashboard or upgrade to Pro.</p>
                <button class="ytt-btn-primary" style="background: #ffd700; color: #000 !important;" id="ytt-upgrade-btn">Open dashboard</button>
            </div>
        `,a.querySelector("#ytt-upgrade-btn").onclick=()=>{window.open(w.websiteUrl+"/dashboard","_blank")},t){let e=t.querySelector("#items");e&&e.prepend(a)}}showUpgradePrompt(e){this.addUpgradePrompt()}addSubscriptionPrompt(){if(document.getElementById("ytt-subscription-prompt"))return;let e=document.querySelectorAll("ytd-guide-section-renderer"),t=e[1];t||console.warn("[YSO] YouTube Subscriptions section not found. Falling back to sidebar top.");let a=document.createElement("div");if(a.id="ytt-subscription-prompt",a.className="ytt-subscription-section",a.innerHTML=`
            <div class="ytt-section-header">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-9l6 4.5-6 4.5z"/></svg>
                <span>Subscriptions & Sync</span>
            </div>
            <div class="ytt-section-body">
                <p>Registration required to enable folders and sync features.</p>
                <button class="ytt-btn-primary" id="ytt-register-btn">Register / Login</button>
            </div>
        `,a.querySelector("#ytt-register-btn").onclick=()=>{window.open(w.websiteUrl+"/signup","_blank")},t){let e=t.querySelector("#items");e?e.prepend(a):t.appendChild(a)}else this.sidePanelTrack&&this.sidePanelTrack.prepend(a)}async syncFoldersToSupabase(){let e=await this.isChannelAllowed();if(!e){console.warn("[YSO] Outgoing sync blocked: Premium verified restriction active.");return}let t=r();if(!t){console.log("[YSO] Outgoing sync delayed: no active channel ID available yet."),h(),this.scheduleChannelScopedLoad();return}let a=Object.entries(this.tabData).map(([e,t])=>{if("object"!=typeof t)return null;let a=Object.entries(this.badgeData).filter(([t,a])=>a&&a.tabID===e).map(([e,t])=>({id:e,...t}));return{id:e,name:t.name,color:d(t.color),createdAt:s(t.createdAt),metadata:{channels:a,sortMode:t.sortMode||"manual",index:t.index||0,hidden:t.hidden||!1}}}).filter(e=>null!==e);if(0!==a.length){if(window.FolderTubeApi&&await l()&&t){let e=a.map(e=>{let t={id:e.id,name:e.name||"Untitled",color:d(e.color),metadata:e.metadata||{}};return t.created_at=s(e.createdAt),t});e.length,e.map(e=>({id:e.id,name:e.name,color:e.color,created_at:e.created_at||null,metadataKeys:e.metadata?Object.keys(e.metadata):[],channelsCount:Array.isArray(e.metadata?.channels)?e.metadata.channels.length:null,firstChannelSample:Array.isArray(e.metadata?.channels)&&e.metadata.channels.length>0?e.metadata.channels[0]:null}));try{await window.FolderTubeApi.folders.sync(t,e),console.log(`[YSO] API sync succeeded for ${e.length} folders.`);return}catch(a){if(a&&"folder_limit_exceeded"===a.code){let e=a.body?.plan||"free",t=a.body?.limit;this.showNotification(`${"free"===e?"Free":e.charAt(0).toUpperCase()+e.slice(1)} plan limit reached: ${"number"==typeof t&&t<1e3?t:3} folders. Upgrade to ${"free"===e?"Plus":"Pro"} for unlimited.`,"error");return}if(a&&"channel_not_linked"===a.code){console.warn("[YSO] API sync rejected: channel_not_linked.");try{this.showChannelNotLinkedPrompt({plan:a.body?.plan||"free",reason:"channel-not-linked",allowed_channels:a.body?.allowed_channels||[]})}catch(e){}return}if(a&&"not_authenticated"===a.code)console.warn("[YSO] API sync stopped: not authenticated.");else if(a&&"bad_request"===a.code){console.warn("[YSO] API sync bad_request detail:",{detail:a.body?.detail||null,channelId:t,folders:e.map(e=>({id:e.id,name:e.name,created_at:e.created_at||null,channelsCount:Array.isArray(e.metadata?.channels)?e.metadata.channels.length:null,firstChannelSample:Array.isArray(e.metadata?.channels)&&e.metadata.channels.length>0?e.metadata.channels[0]:null}))});try{console.warn("[YSO] API sync bad_request detail JSON:\n"+JSON.stringify(a.body?.detail||null,null,2))}catch(e){}}else console.warn("[YSO] API sync failed. Server remains authoritative:",a?.code||a);this.showNotification("Folder sync is unavailable while the API is offline.","error");return}}console.warn("[YSO] Folder sync stopped: Node API auth is unavailable."),this.showNotification("Sign in through FolderTube to sync folders.","error")}}save(){this._saveTimeout&&clearTimeout(this._saveTimeout),this._saveTimeout=setTimeout(async()=>{this._saveTimeout=null;let e=await this.isChannelAllowed();if(!e){console.warn("[YSO] Save aborted: Multi-channel usage detected or not authenticated.");return}this.syncFoldersToSupabase().catch(e=>{console.error("[YSO] Sync failed:",e),this.showNotification("Sync failed: "+(e.message||"Unknown error"),"error")}),this.refreshFolderLocks(),window.subscriptionsFolderBar?.refresh()},50)}reload(e={}){let t=!!e.resetState;console.log("[YSO] Starting UI reload.",{resetState:t,apiFirst:!!e.apiFirst,folderCountBeforeReload:Object.nonFunctionKeys(this.tabData||{}).length,badgeCountBeforeReload:Object.keys(this.badgeData||{}).length}),this.clearUI(),this.tabs=[],this.tabIndex=[],this.badges=[],t&&(this.tabData={},this.badgeData={}),this.ensureTabDataHelpers(),this._cachedAllowed=null,this._lastAllowedCheck=0,e.apiFirst?this.loadFromSupabase().catch(e=>console.error("[YSO] API-first load failed:",e)):t&&this.loadData(),this.reformatGuide(),this.checkAuthAndShowSubscriptions(),this.initializeTabs(),this.initializeBadges(),this.miniGuideManager&&this.miniGuideManager.loadFoldersData(!0),console.log("[YSO] UI reload finished.",{resetState:t,folderCountAfterReload:Object.nonFunctionKeys(this.tabData||{}).length,hasBadgeContainer:!!this.badgeContainer})}clearUI(){document.querySelectorAll(".ytt-badge").forEach(e=>{this.badgeContainer&&e.parentElement!==this.badgeContainer&&this.badgeContainer.appendChild(e),e.classList.remove("ytt-badge"),e.style.opacity="1",e.style.marginLeft=""}),[".ytt-badge-header",".tab",".ytt-btn",".ytt-search-container",".yso-notification",".ytt-folder-header",".tab-creation-form"].forEach(e=>{document.querySelectorAll(e).forEach(e=>e.remove())})}async exportData(){let e={version:this.version,badges:this.badgeData,tabs:this.tabData},t=new Blob([JSON.stringify(e)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(t),a.download=`ytt-backup ${new Date().toDateString()}`,a.click(),URL.revokeObjectURL(a.href)}async importData(){document.getElementById("upload-file-picker").files[0]&&confirm("Importing backup\n\nAre you sure you want to do this?\n\nTHIS WILL OVERWRITE ALL OF YOUR EXISTING TAB DATA.\nThis will also refresh the current page.")&&this.parseJsonFile(document.getElementById("upload-file-picker").files[0]).then(e=>{e.version&&e.badges&&e.tabs?(this.badgeData=e.badges,this.tabData=e.tabs,this.save(),window.location.reload()):alert("Unable to find all expected data within the data backup.\n\nThis may be the wrong file, or the data didn't save properly, or the file was corrupted/improperly modifed.\n\nImporting process has been aborted. Your data has not changed.")}).catch(e=>alert("Could not import file. Error while parsing data. Maybe that was the wrong file?\n\nImporting process has been aborted. Your data has not changed."))}async parseJsonFile(e){return new Promise((t,a)=>{let n=new FileReader;n.onload=e=>{try{t(JSON.parse(e.target.result))}catch{a(Error("Unable to read file"))}},n.onerror=e=>a(e),n.readAsText(e)})}_createIconBtn(e){let t=document.createElement("span");t.className="ytt-btn"+(e.danger?" ytt-btn--danger":""),t.setAttribute("role","button"),t.setAttribute("tabindex","0"),t.setAttribute("aria-label",e.label),t.title=e.tooltip||e.label,t.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="'+e.svgPath+'"/></svg>';let a=t=>{"function"==typeof e.onClick&&e.onClick(t)};return t.addEventListener("click",a),t.addEventListener("keydown",e=>{("Enter"===e.key||" "===e.key)&&(e.preventDefault(),a(e))}),t}static MENU_ICONS={rename:'<svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>',trash:'<svg viewBox="0 0 24 24"><path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>',sort:'<svg viewBox="0 0 24 24"><path d="M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z"/></svg>',check:'<svg viewBox="0 0 24 24"><path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>'};_createMenuItem(e){let t=document.createElement("button");if(t.type="button",t.className="ytt-menu-item",t.setAttribute("role","menuitem"),e.destructive&&t.classList.add("is-destructive"),e.active&&t.classList.add("is-active"),e.icon){let a=document.createElement("span");a.className="ytt-menu-icon",a.innerHTML=e.icon,t.appendChild(a)}let a=document.createElement("span");if(a.className="ytt-menu-label",a.textContent=e.label,t.appendChild(a),e.showCheck){let e=document.createElement("span");e.className="ytt-menu-check",e.innerHTML=C.MENU_ICONS.check,t.appendChild(e)}return t.addEventListener("click",t=>{t.stopPropagation(),"function"==typeof e.onClick&&e.onClick(t)}),t}_mountFloatingMenu(e,t,a,n={}){e.style.visibility="hidden",document.body.appendChild(e);let i=e.getBoundingClientRect(),r=window.innerWidth,o=window.innerHeight,l=t,s=a;l+i.width+8>r&&(l=Math.max(8,r-i.width-8)),s+i.height+8>o&&(s=Math.max(8,o-i.height-8)),l=Math.max(8,l),s=Math.max(8,s),e.style.left=l+"px",e.style.top=s+"px",e.style.visibility="visible";let d=e.querySelector(".ytt-menu-item");d&&d.focus({preventScroll:!0});let c=()=>{e.remove(),document.removeEventListener("mousedown",h,!0),document.removeEventListener("keydown",u,!0),window.removeEventListener("blur",c),"function"==typeof n.onClose&&n.onClose()},h=t=>{e.contains(t.target)||c()},u=e=>{"Escape"===e.key&&(e.stopPropagation(),c())};return setTimeout(()=>{document.addEventListener("mousedown",h,!0),document.addEventListener("keydown",u,!0),window.addEventListener("blur",c)},0),e.addEventListener("click",e=>{let t=e.target.closest(".ytt-menu-item");t&&!t.dataset.keepOpen&&c()}),c}showTabContextMenu(e,t,a){document.querySelectorAll(".tab-context-menu").forEach(e=>e.remove());let n=document.createElement("div");n.className="tab-context-menu",n.setAttribute("role","menu"),n.setAttribute("aria-label","Folder options");let i=document.createElement("div");i.className="ytt-menu-section";let r=this._createMenuItem({icon:C.MENU_ICONS.rename,label:"Rename",onClick:()=>this._beginInlineRename(e)});i.appendChild(r),i.appendChild(this._createMenuItem({icon:C.MENU_ICONS.trash,label:"Delete folder",destructive:!0,onClick:()=>{confirm("Are you sure you want to delete this folder?")&&e.delete()}})),n.appendChild(i);let o=document.createElement("div");o.className="ytt-menu-separator",n.appendChild(o);let l=document.createElement("div");l.className="ytt-menu-header",l.textContent="Sort channels by",n.appendChild(l);let s=this.tabData[e.id]?.sortMode||"manual",d=document.createElement("div");d.className="ytt-menu-section",d.setAttribute("role","group"),[{label:"Manual",mode:"manual"},{label:"Name (A-Z)",mode:"name-asc"},{label:"Name (Z-A)",mode:"name-desc"},{label:"Newest sub",mode:"date-newest"},{label:"Oldest sub",mode:"date-oldest"}].forEach(({label:t,mode:a})=>{d.appendChild(this._createMenuItem({label:t,showCheck:!0,active:s===a,onClick:()=>{this.tabData[e.id]&&(this.tabData[e.id].sortMode=a,this.save(),this.sortBadges(),this.arrangeBadges())}}))}),n.appendChild(d),this._mountFloatingMenu(n,t,a)}_beginInlineRename(e){let t=e.titleLabel.textContent,a=document.createElement("input");a.type="text",a.value=t,a.className="tab-rename-input",e.titleLabel.replaceWith(a),a.focus(),a.select();let n=!1;a.addEventListener("blur",()=>{if(n)return;n=!0;let i=a.value.trim()||t,r=this.toTitleCase(i),o=document.createElement("h3");o.className="tab-menu-name",o.textContent=r,e.titleLabel=o,a.replaceWith(o),e.setName(i),this.save(),console.log(`Tab renamed to: ${r}`)}),a.addEventListener("keydown",i=>{if("Enter"===i.key)i.preventDefault(),a.blur();else if("Escape"===i.key){i.preventDefault(),n=!0;let r=document.createElement("h3");r.className="tab-menu-name",r.textContent=t,e.titleLabel=r,a.replaceWith(r)}})}showFolderSortMenu(e){e.stopPropagation();let t=e.clientX,a=e.clientY;document.querySelectorAll(".folder-sort-menu").forEach(e=>e.remove());let n=document.createElement("div");n.className="folder-sort-menu tab-context-menu",n.setAttribute("role","menu"),n.setAttribute("aria-label","Sort folders");let i=document.createElement("div");i.className="ytt-menu-header",i.textContent="Sort folders by",n.appendChild(i);let r=document.createElement("div");r.className="ytt-menu-section",r.setAttribute("role","group"),[{label:"Name (A-Z)",mode:"name-asc"},{label:"Name (Z-A)",mode:"name-desc"},{label:"Channel count",mode:"count-desc"}].forEach(({label:e,mode:t})=>{r.appendChild(this._createMenuItem({icon:C.MENU_ICONS.sort,label:e,onClick:()=>this.sortFolders(t)}))}),n.appendChild(r),this._mountFloatingMenu(n,Math.max(0,t-150),a)}sortFolders(e){let t=Object.keys(this.tabData);t.sort((t,a)=>{let n=this.tabData[t],i=this.tabData[a];switch(e){case"name-asc":return n.name.localeCompare(i.name);case"name-desc":return i.name.localeCompare(n.name);case"count-desc":let r=Object.values(this.badgeData).filter(e=>e.tabID===t).length,o=Object.values(this.badgeData).filter(e=>e.tabID===a).length;return o-r;default:return 0}}),t.forEach((e,t)=>{this.tabData[e].index=t}),this.save(),this.logMessage("info",`Folders sorted by: ${e}`),this.tabs.sort((e,t)=>this.tabData[e.id].index-this.tabData[t.id].index),this.tabs.forEach(e=>this.badgeContainer.appendChild(e)),this.sortBadges(),this.arrangeBadges()}updateBadgeOrder(){this._updateOrderTimeout&&clearTimeout(this._updateOrderTimeout),this._updateOrderTimeout=setTimeout(()=>{let e=Array.from(this.badgeContainer.querySelectorAll(".ytt-badge"));e.forEach((e,t)=>{this.badgeData[e.id]&&(this.badgeData[e.id].order=t,this.badgeData[e.id].tabID=-1)}),this.tabs.forEach(e=>{let t=Array.from(e.querySelectorAll(".ytt-badge"));t.length>0&&this.tabData[e.id]&&(this.tabData[e.id].sortMode="manual"),t.forEach((t,a)=>{this.badgeData[t.id]&&(this.badgeData[t.id].order=a,this.badgeData[t.id].tabID=e.id)})}),this.save(),this.restoreAllSubscriptionsPosition(),console.log("Badge order updated and saved"),this._updateOrderTimeout=null},100)}showUserProfile(){let e=w.websiteUrl?w.websiteUrl:"https://foldertube.vercel.app",t=SupabaseAuth._session?"/dashboard":"/login";window.open(`${e.replace(/\/+$/,"")}${t}?source=extension`,"_blank"),this.showNotification("Account settings open in the FolderTube dashboard.","info")}showSearchInterface(){this.modal&&(this.activePage&&this.activePage.close(),this.activeMenu&&this.activeMenu.close()),this.modal=!0;let e=this.createAndConfigureElement("div",{className:"ytt-popup search-popup"});e.exit=this.createAndConfigureElement("ytt-btn",{className:"exit",innerHTML:'<svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor"></svg>'}),this.activePage=e;let t=this.createAndConfigureElement("div",{className:"search-container"}),a=this.createAndConfigureElement("input",{className:"search-input",placeholder:"Search your subscriptions...",type:"text",spellcheck:"false",autocomplete:"off"}),i=this.createAndConfigureElement("div",{className:"search-clear-btn",innerHTML:'<svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20" fill="currentColor"><path d="m249-207 246-246 246 246 42-42-246-246 246-246-42-42-246 246-246-246-42 42 246 246-246 246 42 42Z"/></svg>',style:"display: none;"});t.appendChild(a),t.appendChild(i);let selBtn=document.createElement("button");selBtn.type="button",selBtn.className="ytt-select-toggle-btn",selBtn.textContent="Select",t.appendChild(selBtn);let selActive=!1,selIds=new Set,bulkBar=document.createElement("div");bulkBar.className="ytt-bulk-action-bar";bulkBar.style.display="none";let updateBulkBar=()=>{if(!selActive){bulkBar.style.display="none";bulkBar.innerHTML="";return}bulkBar.style.display="flex";bulkBar.innerHTML="";let n=selIds.size,countEl=document.createElement("span");countEl.className="ytt-bulk-count",countEl.textContent=n+" selected";let getVisIds=()=>Array.from(r.querySelectorAll(".search-result-item")).filter(el=>el.style.display!=="none").map(el=>el.getAttribute("data-channel-id")).filter(Boolean),syncCbs=()=>{r.querySelectorAll(".search-result-item").forEach(el=>{let id=el.getAttribute("data-channel-id"),sel=selIds.has(id);el.classList.toggle("is-selected",sel);let cb=el.querySelector(".search-result-checkbox");if(cb)cb.checked=sel})};let visIds=getVisIds(),allVisSel=visIds.length>0&&visIds.every(id=>selIds.has(id)),selAllBtn=document.createElement("button");selAllBtn.type="button",selAllBtn.className="ytt-bulk-select-all-btn",selAllBtn.textContent=allVisSel?"Deselect visible":"Select all visible",selAllBtn.addEventListener("click",()=>{allVisSel?visIds.forEach(id=>selIds.delete(id)):visIds.forEach(id=>selIds.add(id));syncCbs();updateBulkBar()});let acts=document.createElement("div");acts.className="ytt-bulk-actions";let fpWrap=document.createElement("div");fpWrap.className="ytt-folder-picker-wrap";let mvBtn=document.createElement("button");mvBtn.type="button",mvBtn.className="ytt-bulk-move-btn",mvBtn.innerHTML="Move to &#9660;",mvBtn.disabled=0===n;let closeBulkPicker=()=>{document.querySelectorAll(".folder-picker-backdrop,.bulk-folder-picker-menu").forEach(el=>el.remove())};let openPicker=()=>{if(document.querySelector(".bulk-folder-picker-menu")){closeBulkPicker();return}let backdrop=document.createElement("div");backdrop.className="folder-picker-backdrop",backdrop.addEventListener("click",closeBulkPicker);let menu=document.createElement("div");menu.className="folder-picker-menu bulk-folder-picker-menu";let hd=document.createElement("div");hd.className="ytt-menu-header",hd.textContent="Move selected to",menu.appendChild(hd);let addOpt=(label,color,cb)=>{let oo=document.createElement("div");oo.className="ytt-folder-option";if(color){let dot=document.createElement("span");dot.style.cssText="display:inline-block;width:8px;height:8px;border-radius:50%;background:"+color+";margin-right:6px;flex-shrink:0",oo.style.display="flex",oo.style.alignItems="center",oo.insertBefore(dot,oo.firstChild)}oo.appendChild(document.createTextNode(label)),oo.addEventListener("click",()=>{closeBulkPicker();cb()}),menu.appendChild(oo)};addOpt("None (Uncategorized)",null,()=>doSearchMove(-1));Object.keys(this.tabData).sort((xa,xb)=>this.tabData[xa].index-this.tabData[xb].index).forEach(fid=>{let f=this.tabData[fid];addOpt(f.name,f.color||null,()=>doSearchMove(fid))});document.body.appendChild(backdrop),document.body.appendChild(menu);let rect=mvBtn.getBoundingClientRect(),mW=280,mH=Math.min(menu.offsetHeight||420,window.innerHeight-80),left=rect.right-mW,top=rect.bottom+8;if(left<12)left=12;if(left+mW>window.innerWidth-12)left=window.innerWidth-mW-12;if(top+mH>window.innerHeight-12)top=rect.top-mH-8;if(top<12)top=12;menu.style.left=left+"px",menu.style.top=top+"px",menu.style.width=mW+"px"};mvBtn.addEventListener("click",ev=>{ev.stopPropagation();openPicker()}),fpWrap.appendChild(mvBtn),acts.appendChild(fpWrap);let clrBtn=document.createElement("button");clrBtn.type="button",clrBtn.className="ytt-bulk-clear-btn",clrBtn.setAttribute("aria-label","Clear selection"),clrBtn.textContent="✕",clrBtn.addEventListener("click",()=>{selActive=!1;selIds.clear();r.classList.remove("bulk-select-mode");selBtn.textContent="Select";selBtn.classList.remove("active");r.querySelectorAll(".search-result-item").forEach(el=>{el.classList.remove("is-selected");let ch=el.querySelector(".search-result-checkbox");if(ch)ch.checked=!1});updateBulkBar()}),acts.appendChild(clrBtn),bulkBar.appendChild(countEl),bulkBar.appendChild(selAllBtn),bulkBar.appendChild(acts)};let doSearchMove=fId=>{if(0===selIds.size)return;let tm=window.tabManager;if(!tm)return;let mv=0;selIds.forEach(cid=>{tm.badgeData[cid]||(tm.badgeData[cid]={tabID:-1,favorite:!1,order:Date.now()}),tm.badgeData[cid].tabID=fId,tm.badgeData[cid].order=Date.now(),mv++,document.dispatchEvent(new CustomEvent("CHANNEL_MOVED",{detail:{channelId:cid,folderId:fId}}))}),mv>0&&(tm.save?.(),tm.sortBadges?.(),tm.arrangeBadges?.(),tm.miniGuideManager&&tm.miniGuideManager.loadFoldersData(!0)),selActive=!1,selIds.clear(),r.classList.remove("bulk-select-mode"),selBtn.textContent="Select",selBtn.classList.remove("active"),r.querySelectorAll(".search-result-item").forEach(el=>{el.classList.remove("is-selected");let ch=el.querySelector(".search-result-checkbox");ch&&(ch.checked=!1)}),updateBulkBar(),mv>0&&tm.showNotification?.(mv+" channel"+(1===mv?"":"s")+" moved","success")};selBtn.addEventListener("click",()=>{selActive=!selActive,r.classList.toggle("bulk-select-mode",selActive),selBtn.textContent=selActive?"Cancel":"Select",selBtn.classList.toggle("active",selActive),selActive||(selIds.clear(),r.querySelectorAll(".search-result-item").forEach(el=>{el.classList.remove("is-selected");let ch=el.querySelector(".search-result-checkbox");ch&&(ch.checked=!1)})),updateBulkBar()});let activeFolderFilter="all",filterBar=document.createElement("div");filterBar.className="ytt-folder-filter-bar";let isUncat=cid=>{let bd=this.badgeData?.[cid];return!bd||bd.tabID===-1||bd.tabID===void 0||bd.tabID===null||bd.tabID==="-1"};let applyFolderFilter=()=>{let items=r.querySelectorAll(".search-result-item");items.forEach(el=>{let cid=el.getAttribute("data-channel-id");if(!cid||"all"===activeFolderFilter){el.style.display="";return}if("uncategorized"===activeFolderFilter){el.style.display=isUncat(cid)?"":"none";return}let fid=this.badgeData?.[cid]?.tabID;el.style.display=fid==activeFolderFilter?"":"none"})};let buildFilterBar=()=>{filterBar.innerHTML="";let mkChip=(label,val,color)=>{let btn=document.createElement("button");btn.type="button",btn.className="ytt-filter-chip",""+activeFolderFilter===(""+val)&&btn.classList.add("is-active"),btn.textContent=label,color&&(btn.dataset.folderId=val,btn.style.setProperty("--folder-color",color)),btn.addEventListener("click",ev=>{ev.preventDefault(),ev.stopPropagation(),activeFolderFilter=val,c()});return btn};filterBar.appendChild(mkChip("All","all")),filterBar.appendChild(mkChip("Uncategorized","uncategorized")),Object.keys(this.tabData).sort((xa,xb)=>this.tabData[xa].index-this.tabData[xb].index).forEach(fid=>{let f=this.tabData[fid];filterBar.appendChild(mkChip(f.name,fid,f.color||"#aaa"))});};buildFilterBar();filterBar.addEventListener("wheel",ev=>{Math.abs(ev.deltaY)>Math.abs(ev.deltaX)&&(ev.preventDefault(),filterBar.scrollLeft+=ev.deltaY)},{passive:!1});let positionFolderPicker=(menu,anchor,excludeAnchor)=>{let aRect=anchor.getBoundingClientRect(),pRect=e.getBoundingClientRect();document.body.appendChild(menu);menu.style.position="fixed";menu.style.visibility="hidden";let mRect=menu.getBoundingClientRect(),top=aRect.bottom+8,left=aRect.right-mRect.width;top+mRect.height>pRect.bottom-12&&(top=aRect.top-mRect.height-8);top<pRect.top+12&&(top=pRect.top+12,menu.style.maxHeight=(pRect.bottom-pRect.top-24)+"px");left<pRect.left+12&&(left=pRect.left+12);left+mRect.width>pRect.right-12&&(left=pRect.right-mRect.width-12);menu.style.top=top+"px";menu.style.left=left+"px";menu.style.visibility="visible";let clFn=ev=>{menu.contains(ev.target)||excludeAnchor&&anchor.contains(ev.target)||(menu.remove(),document.removeEventListener("mousedown",clFn,!0))};setTimeout(()=>document.addEventListener("mousedown",clFn,!0),0)};let r=this.createAndConfigureElement("div",{className:"search-results"}),o=this.createAndConfigureElement("div",{className:"search-keyboard-hints",innerHTML:"<span><kbd>\u2191</kbd><kbd>\u2193</kbd> Navigate</span><span><kbd>Enter</kbd> Open Channel</span><span><kbd>Esc</kbd> Close</span>"}),l=-1,s=[],d=()=>{let e=r.querySelectorAll(".ytt-badge");e.forEach((e,t)=>{t===l?(e.classList.add("selected"),e.scrollIntoView({block:"nearest",behavior:"smooth"})):e.classList.remove("selected")})},c=()=>{let t=a.value.toLowerCase().trim();r.innerHTML="",i.style.display=t.length>0?"flex":"none";let o=[];if(0===t.length){o=n.getAll().slice(0,50);let e=this.createAndConfigureElement("div",{className:"search-empty-state",textContent:"Browse Subscriptions"});r.appendChild(e)}else o=n.search(t);if(0===(s=o.map(e=>{let t=this.badges.find(t=>t.id===e.id);return t||{id:e.id,isVirtual:!0,title:e.name,url:e.url,thumbnail:e.thumbnail,classList:{add:()=>{},remove:()=>{},contains:()=>!1,toggle:()=>!1},querySelector:t=>"#endpoint"===t?{title:e.name,click:()=>{e.url&&(window.location.href=e.url)}}:t.includes("yt-formatted-string")?{textContent:e.name}:t.includes("img")?{src:e.thumbnail}:null,getAttribute:t=>"aria-label"===t?e.name:null,setAttribute:()=>{},removeAttribute:()=>{},addEventListener:()=>{},appendChild:()=>{},style:{setProperty:()=>{}},lock:()=>{},unlock:()=>{},toggleFavorite:t=>(t&&t.stopPropagation(),this.badgeData[e.id]||(this.badgeData[e.id]={tabID:-1,favorite:!1,order:Date.now()}),this.badgeData[e.id].favorite=!this.badgeData[e.id].favorite,this.save(),this.badgeData[e.id].favorite),moveTo:t=>{this.badgeData[e.id]||(this.badgeData[e.id]={tabID:-1,favorite:!1,order:Date.now()}),this.badgeData[e.id].tabID=t,this.badgeData[e.id].order=Date.now(),this.save(),this.showNotification(`${e.name} moved to ${-1===t?"Main Container":this.tabData[t]?.name||"folder"}`),this.miniGuideManager&&this.miniGuideManager.loadFoldersData(!0),document.dispatchEvent(new CustomEvent("CHANNEL_MOVED",{detail:{channelId:e.id,folderId:t}}))}}})).length&&t.length>0){let e=this.createAndConfigureElement("div",{className:"search-empty-state",innerHTML:`
                        <div class="search-empty-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" height="48" viewBox="0 -960 960 960" width="48" fill="currentColor">
                                <path d="M784-120 532-372q-30 24-69 38t-83 14q-109 0-184.5-75.5T120-580q0-109 75.5-184.5T380-840q109 0 184.5 75.5T640-580q0 44-14 83t-38 69l252 252-56 56ZM380-400q75 0 127.5-52.5T560-580q0-75-52.5-127.5T380-760q-75 0-127.5 52.5T200-580q0 75 52.5 127.5T380-400Z"/>
                            </svg>
                        </div>
                        <div>No subscriptions found matching "${t}"</div>
                    `});r.appendChild(e),l=-1}else{let n=document.createDocumentFragment();s.forEach((t,a)=>{let i=this.createAndConfigureElement("div",{className:"search-result-item"});i.setAttribute("data-channel-id",t.id);let r=t.isVirtual?t.title:t.querySelector("#endpoint")?.title||t.getAttribute("aria-label")||"Channel",o=t.isVirtual?t.thumbnail:t.querySelector("yt-img-shadow img, img")?.src||"";i.innerHTML=`
                        <div class="thumb-container">
                            <img src="${o}" alt="${r}">
                        </div>
                        <div class="search-result-info">
                            <div class="title">${r}</div>
                            <div class="search-result-subtitle">YouTube Channel</div>
                        </div>
                    `;let cb=document.createElement("input");cb.type="checkbox",cb.className="search-result-checkbox",cb.setAttribute("aria-label","Select "+r),cb.addEventListener("click",ev=>ev.stopPropagation()),cb.addEventListener("change",()=>{cb.checked?(selIds.add(t.id),i.classList.add("is-selected")):(selIds.delete(t.id),i.classList.remove("is-selected")),updateBulkBar()}),selIds.has(t.id)&&(cb.checked=!0,i.classList.add("is-selected")),i.insertBefore(cb,i.firstChild);let curFid=this.badgeData?.[t.id]?.tabID,l=document.createElement("button");l.type="button",l.className="folder-add-btn";let updBtn=nFid=>{if(nFid!==void 0)curFid=nFid;let inF=curFid&&curFid!==-1&&curFid!=="-1",folder=inF?this.tabData?.[curFid]:null,color=folder?.color||"#ff6b6b";l.innerHTML=inF?`<svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20" fill="${color}" style="pointer-events:none"><path d="M146.67-160q-27 0-46.84-20.17Q80-200.33 80-226.67v-506.66q0-26.34 19.83-46.5Q119.67-800 146.67-800H414l66.67 66.67h332.66q26.34 0 46.5 20.16Q880-693 880-666.67v440q0 26.34-20.17 46.5Q839.67-160 813.33-160H146.67Zm0-66.67h666.66v-440H453l-66.67-66.66H146.67v506.66Zm0 0v-506.66V-226.67Z"/></svg>`:'<svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20" fill="currentColor" style="pointer-events:none"><path d="M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z"/></svg>',l.title=inF?`In folder: ${folder?.name||"folder"}. Click to change`:"Move to Folder"};updBtn();l.addEventListener("click",ev=>{ev.preventDefault(),ev.stopPropagation();let rect=l.getBoundingClientRect(),menu=document.createElement("div");menu.className="tab-context-menu folder-picker-menu",menu.style.minWidth="200px";let hdEl=document.createElement("div");hdEl.className="ytt-menu-header",hdEl.textContent="Manage Folder",menu.appendChild(hdEl);let sect=document.createElement("div");sect.className="ytt-menu-section";let cF=this.badgeData?.[t.id]?.tabID,inFN=cF&&cF!==-1&&cF!=="-1";sect.appendChild(this._createMenuItem({label:"None (Uncategorized)",showCheck:!0,active:!inFN,onClick:()=>{t.moveTo(-1),updBtn(-1),c(),applyFolderFilter()}}));Object.keys(this.tabData).sort((xa,xb)=>this.tabData[xa].index-this.tabData[xb].index).forEach(fid=>{let f=this.tabData[fid];sect.appendChild(this._createMenuItem({label:f.name,icon:`<div style="width:10px;height:10px;border-radius:50%;background-color:${f.color};margin-right:8px"></div>`,showCheck:!0,active:cF==fid,onClick:()=>{t.moveTo(fid),updBtn(fid),c()}}))}),menu.appendChild(sect);if(inFN){let sp=document.createElement("div");sp.className="ytt-menu-separator",menu.appendChild(sp);let rs=document.createElement("div");rs.className="ytt-menu-section";rs.appendChild(this._createMenuItem({label:"Remove from folder",destructive:!0,onClick:()=>{t.moveTo(-1),updBtn(-1),c(),applyFolderFilter()}})),menu.appendChild(rs)}positionFolderPicker(menu,l);let eskFn=ev=>{"Escape"===ev.key&&(ev.stopPropagation(),menu.remove(),document.removeEventListener("keydown",eskFn,!0))};setTimeout(()=>document.addEventListener("keydown",eskFn,!0),0)}),i.appendChild(l);let thEl=i.querySelector(".thumb-container"),inEl=i.querySelector(".search-result-info"),openCh=()=>{t.querySelector("#endpoint")?.click(),e.close()};thEl&&thEl.addEventListener("click",ev=>{ev.stopPropagation(),openCh()});inEl&&inEl.addEventListener("click",ev=>{ev.stopPropagation(),openCh()});i.addEventListener("click",ev=>{ev.target.closest(".folder-add-btn")||ev.target.closest(".search-result-checkbox")||(selActive?(cb.checked=!cb.checked,cb.dispatchEvent(new Event("change"))):void 0)});n.appendChild(i)}),r.appendChild(n);let i=()=>{c()};document.addEventListener("CHANNEL_MOVED",i);let o=e.close;e.close=()=>{document.removeEventListener("CHANNEL_MOVED",i),o.call(e)},l=t.length>0?0:-1,d()}};let origC=c;c=()=>{origC();buildFilterBar();applyFolderFilter()};c(),a.addEventListener("input",c),i.addEventListener("click",()=>{a.value="",c(),a.focus()}),a.addEventListener("keydown",t=>{"ArrowDown"===t.key?(t.preventDefault(),l=Math.min(l+1,s.length-1),d()):"ArrowUp"===t.key?(t.preventDefault(),l=Math.max(l-1,0),d()):"Enter"===t.key?(t.preventDefault(),l>=0&&l<s.length&&(s[l].querySelector("#endpoint")?.click(),e.close())):"Escape"===t.key&&e.close()}),e.close=()=>{e.style.animation="fadeOut 0.2s ease-in forwards",setTimeout(()=>{e.remove(),this.modal=!1,this.activePage=null},200)},e.exit.addEventListener("click",e.close),e.appendChild(e.exit),e.appendChild(t),e.appendChild(filterBar),e.appendChild(bulkBar),e.appendChild(r),e.appendChild(o),document.body.appendChild(e),setTimeout(()=>a.focus(),100)}}function S(e,...t){t.forEach(t=>e.appendChild(t))}function E(e){var t,a,n;return(e.match(/^rgb/)?(t=(e=e.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d+(?:\.\d+)?))?\)$/))[1],a=e[2],n=e[3]):(t=(e=+("0x"+e.slice(1).replace(e.length<5&&/./g,"$&$&")))>>16,a=e>>8&255,n=255&e),Math.sqrt(.299*(t*t)+.587*(a*a)+.114*(n*n))>127.5)?"light":"dark"}function A(e){return isNaN(e)?"00":y[(e-e%16)/16]+y[e%16]}},{}]},["8tF78"],"8tF78","parcelRequire1e32"),globalThis.define=t;
