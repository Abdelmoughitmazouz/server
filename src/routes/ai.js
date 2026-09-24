// ── ✨ AI Auto-Categorize Button, Progress Modal & Database Sync ───
(function _initAICategorizer() {
    // دالة شاملة وقوية لجلب معرف قناة يوتيوب الحالية من الجلسة أو الذاكرة أو التخزين
    async function getActiveChannelId() {
        if (typeof Storage !== 'undefined' && Storage.channelId && /^UC[\w-]{20,}$/.test(Storage.channelId)) {
            return Storage.channelId;
        }
        if (typeof ChannelManager !== 'undefined' && ChannelManager.currentChannelId && /^UC[\w-]{20,}$/.test(ChannelManager.currentChannelId)) {
            return ChannelManager.currentChannelId;
        }
        if (typeof ChannelManager !== 'undefined' && ChannelManager.getChannelId) {
            const cid = ChannelManager.getChannelId();
            if (cid && /^UC[\w-]{20,}$/.test(cid)) return cid;
        }
        if (typeof SupabaseAuth !== 'undefined' && SupabaseAuth._session?.profile) {
            const prof = SupabaseAuth._session.profile;
            if (prof.primary_channel_id && /^UC[\w-]{20,}$/.test(prof.primary_channel_id)) {
                return prof.primary_channel_id;
            }
            if (Array.isArray(prof.allowed_channels) && prof.allowed_channels.length > 0) {
                const first = prof.allowed_channels.find(id => /^UC[\w-]{20,}$/.test(id));
                if (first) return first;
            }
        }
        try {
            const stored = await chrome.storage.local.get(['ytt_user_profile']);
            const prof = stored?.ytt_user_profile;
            if (prof?.primary_channel_id && /^UC[\w-]{20,}$/.test(prof.primary_channel_id)) {
                return prof.primary_channel_id;
            }
            if (Array.isArray(prof?.allowed_channels) && prof.allowed_channels.length > 0) {
                const first = prof.allowed_channels.find(id => /^UC[\w-]{20,}$/.test(id));
                if (first) return first;
            }
        } catch (_) {}
        try {
            if (window.ytcfg && typeof window.ytcfg.get === 'function') {
                const delegated = window.ytcfg.get('DELEGATED_SESSION_ID');
                if (delegated && /^UC[\w-]{20,}$/.test(delegated)) return delegated;
                const chId = window.ytcfg.get('CHANNEL_ID');
                if (chId && /^UC[\w-]{20,}$/.test(chId)) return chId;
            }
        } catch (_) {}
        return null;
    }

    function createAIButton() {
        if (document.getElementById('ytt-btn-ai-sort')) return;
        const controls = document.querySelector('.ytt-badge-header-controls');
        if (!controls) return;

        const aiBtn = document.createElement('span');
        aiBtn.id = 'ytt-btn-ai-sort';
        aiBtn.className = 'ytt-btn';
        aiBtn.setAttribute('role', 'button');
        aiBtn.setAttribute('tabindex', '0');
        aiBtn.setAttribute('aria-label', 'AI Auto-Categorize');
        aiBtn.style.cssText = 'color: #ffd700; cursor: pointer; display: inline-flex; align-items: center; justify-content: center;';
        aiBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20" fill="currentColor">
                <path d="M480-160q-134 0-227-93t-93-227q0-134 93-227t227-93q134 0 227 93t93 227q0 134-93 227t-227 93Zm0-80q100 0 170-70t70-170q0-100-70-170t-170-70q-100 0-170 70t-70 170q0 100 70 170t170 70Zm-40-160 40-88 88-40-88-40-40-88-40 88-88 40 88 40 40 88Zm0-320Z"/>
            </svg>
        `;

        aiBtn.addEventListener('click', () => _startAICategorization());
        controls.insertBefore(aiBtn, controls.firstChild);
    }

    function _createProgressModal() {
        document.getElementById('ytt-ai-progress-modal')?.remove();

        const backdrop = document.createElement('div');
        backdrop.id = 'ytt-ai-progress-modal';
        backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);backdrop-filter:blur(6px);z-index:2147483647;display:flex;align-items:center;justify-content:center;font-family:Roboto,Segoe UI,sans-serif;animation:ytt-fade-in 0.2s ease;';

        const card = document.createElement('div');
        card.style.cssText = 'background:#212121;border:1px solid rgba(255,255,255,0.15);border-radius:16px;width:90%;max-width:420px;padding:28px 24px;color:#fff;box-shadow:0 16px 40px rgba(0,0,0,0.6);text-align:center;display:flex;flex-direction:column;align-items:center;gap:16px;';
        card.innerHTML = `
            <div style="width:48px;height:48px;border-radius:50%;background:rgba(255,215,0,0.15);display:flex;align-items:center;justify-content:center;color:#ffd700;">
                <svg viewBox="0 -960 960 960" width="28" height="28" fill="currentColor"><path d="M480-160q-134 0-227-93t-93-227q0-134 93-227t227-93q134 0 227 93t93 227q0 134-93 227t-227 93Zm-40-160 40-88 88-40-88-40-40-88-40 88-88 40 88 40 40 88Z"/></svg>
            </div>
            <h3 style="margin:0;font-size:18px;font-weight:600;">FolderTube AI Organizer</h3>
            <p id="ytt-ai-status-text" style="margin:0;font-size:13px;color:#aaa;line-height:1.4;">Analyzing your subscriptions...</p>
            <div style="width:100%;height:6px;background:rgba(255,255,255,0.1);border-radius:3px;overflow:hidden;">
                <div id="ytt-ai-progress-bar" style="width:15%;height:100%;background:linear-gradient(90deg,#ffd700,#ff9f43);border-radius:3px;transition:width 0.3s ease;"></div>
            </div>
            <span id="ytt-ai-percent-text" style="font-size:12px;color:#888;font-weight:600;">15%</span>
        `;

        backdrop.appendChild(card);
        document.body.appendChild(backdrop);

        return {
            update: (text, percent) => {
                const txt = document.getElementById('ytt-ai-status-text');
                const bar = document.getElementById('ytt-ai-progress-bar');
                const pct = document.getElementById('ytt-ai-percent-text');
                if (txt) txt.textContent = text;
                if (bar) bar.style.width = percent + '%';
                if (pct) pct.textContent = percent + '%';
            },
            close: () => backdrop.remove()
        };
    }

    async function _startAICategorization() {
        const tm = window.tabManager;
        const sm = window.subscriptionManager;
        if (!tm) return;

        const storage = await chrome.storage.local.get('ytt_gemini_api_key');
        const apiKey = storage?.ytt_gemini_api_key?.trim();

        if (!apiKey) {
            alert('Please enter your Google Gemini API Key first in FolderTube Settings ⚙️ -> General.');
            return;
        }

        const allChannels = (sm && sm.getAll && sm.getAll()) || [];
        if (allChannels.length === 0) {
            alert('No subscriptions found to organize.');
            return;
        }

        const confirmMsg = `✨ FolderTube AI will deeply analyze and organize ${allChannels.length} channels into accurate folders.\n\nAll existing folders will be replaced with the new AI categories.\n\nDo you want to proceed?`;
        if (!confirm(confirmMsg)) return;

        const modal = _createProgressModal();

        try {
            modal.update(`Deeply analyzing ${allChannels.length} channels with Gemini AI...`, 30);

            // إرسال الاسم والمعرف @handle للحصول على أعلى دقة تصنيف ممكنة
            const channelPayload = allChannels.map(c => ({
                id: c.id,
                name: c.name || c.title || 'Channel',
                handle: c.handle || (c.url && c.url.includes('/@') ? c.url.split('/@')[1] : undefined)
            }));

            const lang = window.ytt_language || 'en';

            const resp = await new Promise((resolve) => {
                chrome.runtime.sendMessage({
                    type: 'apiCall',
                    method: 'POST',
                    path: '/api/ai/categorize',
                    body: {
                        apiKey: apiKey,
                        channels: channelPayload,
                        language: lang
                    }
                }, resolve);
            });

            if (!resp || !resp.ok || !resp.data?.folders) {
                const errObj = resp?.error || {};
                const errMsg = errObj.body?.message || 
                               errObj.body?.error || 
                               errObj.message || 
                               errObj.code || 
                               'AI categorization failed';
                throw new Error(errMsg);
            }

            modal.update('Generating smart folders & assigning channels...', 65);

            const aiFolders = resp.data.folders;
            const newTabData = {};
            const newBadgeData = {};
            const foldersSyncPayload = [];

            aiFolders.forEach((f, idx) => {
                const folderId = crypto.randomUUID();
                const folderColor = f.color || '#3ea6ff';
                const folderName = f.name || 'Folder';
                const channelIds = Array.isArray(f.channelIds) ? f.channelIds : [];

                newTabData[folderId] = {
                    name: folderName,
                    color: folderColor,
                    index: idx,
                    hidden: false,
                    channelIds: channelIds,
                    createdAt: new Date().toISOString(),
                    metadata: {
                        channels: channelIds.map(cid => ({ id: cid, tabID: folderId })),
                        index: idx,
                        sortMode: 'manual'
                    }
                };

                channelIds.forEach(cid => {
                    newBadgeData[cid] = {
                        tabID: folderId,
                        order: Date.now(),
                        favorite: false
                    };
                });

                foldersSyncPayload.push({
                    id: folderId,
                    name: folderName,
                    color: folderColor,
                    parent_id: null,
                    parentId: null,
                    created_at: new Date().toISOString(),
                    metadata: {
                        channels: channelIds.map(cid => ({ id: cid, tabID: folderId })),
                        index: idx,
                        sortMode: 'manual',
                        hidden: false
                    }
                });
            });

            modal.update('Saving folders directly to database...', 85);

            tm.tabData = newTabData;
            tm.badgeData = newBadgeData;

            const cid = await getActiveChannelId();
            console.log('[FolderTube AI] Target YouTube Channel ID for Database:', cid);

            if (cid && typeof Storage !== 'undefined' && Storage.getScopedKey) {
                try {
                    localStorage.setItem(Storage.getScopedKey('ytt-tabs'), JSON.stringify(newTabData));
                    localStorage.setItem(Storage.getScopedKey('ytt-badges'), JSON.stringify(newBadgeData));
                    localStorage.setItem('ytt-tabs', JSON.stringify(newTabData));
                    localStorage.setItem('ytt-badges', JSON.stringify(newBadgeData));
                } catch (_) {}
            }

            // المزامنة والحفظ الأكيد مع قاعدة بيانات Supabase
            if (cid && window.FolderTubeApi?.folders?.sync) {
                try {
                    await window.FolderTubeApi.folders.sync(cid, foldersSyncPayload);
                    console.log('[FolderTube AI] Successfully persisted AI folders to database via FolderTubeApi.');
                } catch (syncErr) {
                    console.warn('[FolderTube AI] Direct sync warning, calling syncFoldersToSupabase:', syncErr);
                    if (typeof tm.syncFoldersToSupabase === 'function') {
                        await tm.syncFoldersToSupabase();
                    }
                }
            } else if (typeof tm.syncFoldersToSupabase === 'function') {
                await tm.syncFoldersToSupabase();
            }

            modal.update('Completed! Updating sidebar...', 100);

            setTimeout(() => {
                modal.close();
                try {
                    tm._serverFolderStateLoaded = true;
                    tm.clearUI();
                    tm.initializeTabs();
                    tm.initializeBadges();
                    if (window.__yttRelocateUI) window.__yttRelocateUI();
                    if (window.subscriptionsFolderBar?.refresh) window.subscriptionsFolderBar.refresh();
                } catch (_) {}
                tm.showNotification?.(`✨ Successfully organized into ${aiFolders.length} folders!`, 'success');
            }, 500);

        } catch (err) {
            console.error('[FolderTube AI Error]:', err);
            modal.close();
            alert(`AI Error: ${err.message}`);
        }
    }

    setInterval(createAIButton, 1500);
})();