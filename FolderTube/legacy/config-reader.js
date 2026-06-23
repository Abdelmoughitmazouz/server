(function () {
  function isValidChannelId(value) {
    return typeof value === "string" && /^UC[\w-]{20,}$/.test(value);
  }

  function readYtcfg(key) {
    try {
      if (window.ytcfg && typeof window.ytcfg.get === "function") {
        return window.ytcfg.get(key) || null;
      }
    } catch (_) {}
    return null;
  }

  function findAccountMenuChannelId() {
    try {
      var link = document.querySelector(
        'ytd-active-account-header-renderer a[href*="/channel/"], ytd-account-item-section-renderer a[href*="/channel/"]'
      );
      var match = link && (link.getAttribute("href") || "").match(/\/channel\/(UC[\w-]{20,})/);
      return match && isValidChannelId(match[1]) ? match[1] : null;
    } catch (_) {
      return null;
    }
  }

  function getDiagnostics() {
    var html = document.documentElement ? document.documentElement.innerHTML : "";
    var delegated = readYtcfg("DELEGATED_SESSION_ID") || html.match(/"DELEGATED_SESSION_ID":"(UC[\w-]{20,})"/)?.[1] || null;
    var channel = readYtcfg("CHANNEL_ID") || html.match(/"CHANNEL_ID":"(UC[\w-]{20,})"/)?.[1] || null;

    var diagnostics = {
      ytcfgDelegated: isValidChannelId(delegated) ? delegated : null,
      ytcfgChannel: isValidChannelId(channel) ? channel : null,
      meta: null,
      ytInitialData: null,
      accountMenu: findAccountMenuChannelId()
    };
    diagnostics.signature = JSON.stringify(diagnostics);
    return diagnostics;
  }

  function postConfig() {
    var diagnostics = getDiagnostics();
    // CHANNEL_ID can be the channel page currently being viewed. Only emit
    // authenticated account signals here so browsing another creator does not
    // replace the linked FolderTube channel context.
    var channelId = diagnostics.ytcfgDelegated || diagnostics.accountMenu || null;
    window.postMessage(
      {
        type: "YTT_CONFIG_DATA",
        channelId: channelId,
        diagnostics: diagnostics
      },
      "*"
    );
  }

  postConfig();
  setTimeout(postConfig, 500);
  setTimeout(postConfig, 1500);

  // Reactive: fire as soon as the account-menu link renders, instead of
  // waiting for the 3-second allowPageFallback gate in ChannelManager.
  var _ftChannelFound = false;
  var _ftObserver = new MutationObserver(function () {
    if (_ftChannelFound) return;
    if (findAccountMenuChannelId()) {
      _ftChannelFound = true;
      _ftObserver.disconnect();
      clearTimeout(_ftObserverTimeout);
      postConfig();
    }
  });
  _ftObserver.observe(document.documentElement, { childList: true, subtree: true });

  // Hard ceiling: stop observing after 8 s regardless.
  var _ftObserverTimeout = setTimeout(function () {
    _ftObserver.disconnect();
  }, 8000);

  // Safety-net retry at 3 s for slow first-paint machines.
  setTimeout(postConfig, 3000);
})();
