(function () {
  var INITIAL_DATA_PREFIX = "var ytInitialData = ";

  function extractInitialData(html) {
    var start = html.indexOf(INITIAL_DATA_PREFIX);
    if (start === -1) throw new Error("ytInitialData not found");

    var jsonStart = start + INITIAL_DATA_PREFIX.length;
    var depth = 0;
    var inString = false;
    var escaped = false;

    for (var i = jsonStart; i < html.length; i++) {
      var ch = html[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === "{") depth++;
      if (ch === "}" && --depth === 0) {
        return JSON.parse(html.slice(jsonStart, i + 1));
      }
    }

    throw new Error("Failed to parse ytInitialData JSON boundary");
  }

  function dedupe(channels) {
    var seen = new Map();
    channels.forEach(function (channel) {
      if (channel && channel.id && !seen.has(channel.id)) seen.set(channel.id, channel);
    });
    return Array.from(seen.values());
  }

  function parseSubscriptions(data) {
    var channels = [];

    function visit(node) {
      if (!node || typeof node !== "object") return;

      var renderer = node.channelRenderer;
      if (renderer && renderer.channelId) {
        var canonical = renderer.navigationEndpoint?.browseEndpoint?.canonicalBaseUrl || "";
        var thumb =
          renderer.thumbnail?.thumbnails?.at(-1)?.url ||
          renderer.avatar?.thumbnails?.at(-1)?.url ||
          "";
        channels.push({
          id: renderer.channelId,
          name: renderer.title?.simpleText || renderer.title?.runs?.[0]?.text || "",
          url: renderer.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url || "",
          thumbnail: thumb,
          handle: typeof canonical === "string" && canonical.startsWith("/@") ? canonical.slice(1) : undefined,
          avatarUrl: thumb
        });
      }

      Object.values(node).forEach(visit);
    }

    visit(data);
    return dedupe(channels);
  }

  async function fetchSubscriptions() {
    var response = await fetch("/feed/channels", { credentials: "include" });
    if (!response.ok) throw new Error("Failed to fetch /feed/channels: " + response.status);
    return parseSubscriptions(extractInitialData(await response.text()));
  }

  window.addEventListener("message", async function (event) {
    if (event.source !== window) return;
    var message = event.data;
    if (!message || message.type !== "YTT_FETCH_SUBSCRIPTIONS" || !message.requestId) return;

    try {
      var channels = await fetchSubscriptions();
      window.postMessage(
        {
          type: "YTT_SUBSCRIPTIONS_DATA",
          requestId: message.requestId,
          ok: true,
          channels: channels
        },
        "*"
      );
    } catch (error) {
      window.postMessage(
        {
          type: "YTT_SUBSCRIPTIONS_DATA",
          requestId: message.requestId,
          ok: false,
          error: error && error.message ? error.message : String(error)
        },
        "*"
      );
    }
  });
})();
