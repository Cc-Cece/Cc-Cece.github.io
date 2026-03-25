(function () {
  "use strict";

  var DEFAULT_PARTS = ["overall", "devices", "spotify", "steam", "dnd", "message"];
  var KNOWN_PARTS = ["overall", "devices", "spotify", "steam", "dnd", "message"];
  var STYLE_VARIANTS = ["card", "compact", "minimal"];
  var DEFAULT_REFRESH_MS = 30000;
  var MIN_REFRESH_MS = 5000;
  var MAX_REFRESH_MS = 300000;

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function toDisplayState(state) {
    if (state === "online") return "在线中";
    if (state === "recently_online") return "最近在线";
    return "离线";
  }

  function clampRefreshMs(value) {
    var n = Number(value);
    if (!Number.isFinite(n)) return DEFAULT_REFRESH_MS;
    return Math.max(MIN_REFRESH_MS, Math.min(MAX_REFRESH_MS, Math.floor(n)));
  }

  function parseParts(rawParts) {
    var source = (typeof rawParts === "string" && rawParts.trim()) ? rawParts : DEFAULT_PARTS.join(",");
    var tokens = source.split(",").map(function (item) { return item.trim(); }).filter(Boolean);
    var values = [];
    var seen = {};
    var hasDeviceSelector = false;

    tokens.forEach(function (token) {
      var normalized = token.toLowerCase();
      var finalToken = normalized;

      if (normalized.indexOf("device:") === 0) {
        hasDeviceSelector = true;
      } else if (KNOWN_PARTS.indexOf(normalized) >= 0) {
        finalToken = normalized;
      } else if (hasDeviceSelector) {
        finalToken = "device:" + normalized;
      }

      if (!seen[finalToken]) {
        seen[finalToken] = true;
        values.push(finalToken);
      }
    });

    return values.length ? values : DEFAULT_PARTS.slice();
  }

  function shouldShowEmpty(host) {
    return host.dataset.showEmpty === "true";
  }

  function normalizeStyle(value) {
    var normalized = (typeof value === "string" ? value : "").trim().toLowerCase();
    return STYLE_VARIANTS.indexOf(normalized) >= 0 ? normalized : "card";
  }

  function applyStyleClass(host, style) {
    host.classList.remove("presence-widget--card", "presence-widget--compact", "presence-widget--minimal");
    host.classList.add("presence-widget--" + style);
  }

  function normalizeDevices(data) {
    if (!data || !Array.isArray(data.devices)) return [];
    return data.devices.map(function (item) {
      return {
        id: item && item.id ? String(item.id) : "",
        kind: item && item.kind ? String(item.kind) : "",
        label: item && item.label ? String(item.label) : "",
        state: item && item.state ? String(item.state) : "offline",
        lastSeen: item && item.lastSeen ? String(item.lastSeen) : "",
        app: item && item.app ? item.app : null
      };
    });
  }

  function computeOverallState(data, devices) {
    if (data && data.overall) return String(data.overall);
    var hasOnline = devices.some(function (d) { return d.state === "online"; });
    if (hasOnline) return "online";
    var hasRecent = devices.some(function (d) { return d.state === "recently_online"; });
    return hasRecent ? "recently_online" : "offline";
  }

  function stateDot(state) {
    return "<span class=\"presence-widget__dot\" data-state=\"" + escapeHtml(state) + "\"></span>";
  }

  function formatLastSeen(value) {
    if (!value) return "";
    var date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    return date.toLocaleString();
  }

  function renderOverallSection(overallState) {
    return [
      "<section class=\"presence-widget__section\">",
      "<div class=\"presence-widget__row\">",
      "<div class=\"presence-widget__state\">",
      stateDot(overallState),
      "<span class=\"presence-widget__title\">",
      toDisplayState(overallState),
      "</span>",
      "</div>",
      "</div>",
      "</section>"
    ].join("");
  }

  function renderManualSection(data, parts, showEmpty) {
    var manual = (data && data.manual && typeof data.manual === "object") ? data.manual : {};
    var wantDnd = parts.indexOf("dnd") >= 0;
    var wantMessage = parts.indexOf("message") >= 0;
    var chips = [];

    if (wantDnd && manual.dnd === true) {
      chips.push("<span class=\"presence-widget__chip\">DND</span>");
    }
    if (wantMessage && manual.message) {
      chips.push("<span class=\"presence-widget__chip\">" + escapeHtml(manual.message) + "</span>");
    }
    if (!chips.length && !showEmpty) return "";
    if (!chips.length) chips.push("<span class=\"presence-widget__empty\">No manual status.</span>");

    return [
      "<section class=\"presence-widget__section\">",
      "<div class=\"presence-widget__chips\">",
      chips.join(""),
      "</div>",
      "</section>"
    ].join("");
  }

  function renderDeviceRows(devices) {
    return devices.map(function (device) {
      var appText = "";
      if (device.app && device.app.name) {
        appText = "<div class=\"presence-widget__muted presence-widget__app\">" + escapeHtml(device.app.name) + "</div>";
      }

      var title = escapeHtml(device.label || device.id || device.kind || "Device");
      var kind = escapeHtml((device.kind || "device").toUpperCase());
      var right = [];
      right.push(toDisplayState(device.state));
      if (device.lastSeen) right.push(formatLastSeen(device.lastSeen));

      return [
        "<li class=\"presence-widget__list-item\">",
        "<div class=\"presence-widget__row\">",
        "<div class=\"presence-widget__state\">",
        stateDot(device.state),
        "<span class=\"presence-widget__device-main\">",
        "<span class=\"presence-widget__device-label\">" + title + "</span>",
        "<span class=\"presence-widget__device-kind\">" + kind + "</span>",
        "</span>",
        "</div>",
        "<span class=\"presence-widget__right\">",
        escapeHtml(right.join(" | ")),
        "</span>",
        "</div>",
        appText,
        "</li>"
      ].join("");
    }).join("");
  }

  function matchDevice(devices, selector) {
    var needle = selector.toLowerCase();
    return devices.filter(function (d) {
      return d.id.toLowerCase() === needle || d.kind.toLowerCase() === needle;
    });
  }

  function renderDevicesSection(devices, parts, showEmpty) {
    var chunks = [];
    var renderedGeneric = false;
    var wantedSpecific = parts.filter(function (p) { return p.indexOf("device:") === 0; });

    if (parts.indexOf("devices") >= 0) {
      renderedGeneric = true;
      if (devices.length) {
        chunks.push([
          "<section class=\"presence-widget__section\">",
          "<div class=\"presence-widget__title\">Devices</div>",
          "<ul class=\"presence-widget__list\">",
          renderDeviceRows(devices),
          "</ul>",
          "</section>"
        ].join(""));
      } else if (showEmpty) {
        chunks.push("<section class=\"presence-widget__section\"><div class=\"presence-widget__empty\">No devices reported yet.</div></section>");
      }
    }

    wantedSpecific.forEach(function (token) {
      var selector = token.slice("device:".length).trim();
      if (!selector) return;
      if (renderedGeneric) return;
      var matched = matchDevice(devices, selector);
      if (!matched.length && !showEmpty) return;
      chunks.push([
        "<section class=\"presence-widget__section\">",
        matched.length
          ? ("<ul class=\"presence-widget__list\">" + renderDeviceRows(matched) + "</ul>")
          : "<div class=\"presence-widget__empty\">No matched device.</div>",
        "</section>"
      ].join(""));
    });

    return chunks.join("");
  }

  function renderSpotifySection(data, showEmpty) {
    var spotify = data && data.spotify ? data.spotify : null;
    if (!spotify || !spotify.active) {
      if (!showEmpty) return "";
      return "<section class=\"presence-widget__section\"><div class=\"presence-widget__empty\">Spotify is not active.</div></section>";
    }

    var line1 = spotify.track ? (escapeHtml(spotify.track) + (spotify.artist ? (" - " + escapeHtml(spotify.artist)) : "")) : "Spotify active";
    var state = spotify.state ? escapeHtml(spotify.state) : "active";
    var link = spotify.url ? "<a href=\"" + escapeHtml(spotify.url) + "\" target=\"_blank\" rel=\"noopener\">Open</a>" : "";

    return [
      "<section class=\"presence-widget__section\">",
      "<div class=\"presence-widget__row\">",
      "<span class=\"presence-widget__title presence-widget__service\">Spotify</span>",
      "<span class=\"presence-widget__right\">" + state + "</span>",
      "</div>",
      "<div class=\"presence-widget__muted\">" + line1 + "</div>",
      link ? ("<div class=\"presence-widget__muted\">" + link + "</div>") : "",
      "</section>"
    ].join("");
  }

  function renderSteamSection(data, showEmpty) {
    var steam = data && data.steam ? data.steam : null;
    if (!steam) {
      if (!showEmpty) return "";
      return "<section class=\"presence-widget__section\"><div class=\"presence-widget__empty\">Steam is not active.</div></section>";
    }

    var stateRaw = steam.state ? String(steam.state) : "";
    var visible = steam.active || stateRaw === "in_game" || stateRaw === "online";
    if (!visible) {
      if (!showEmpty) return "";
      return "<section class=\"presence-widget__section\"><div class=\"presence-widget__empty\">Steam is not active.</div></section>";
    }

    var line1 = steam.game
      ? ("Playing: " + escapeHtml(steam.game))
      : (stateRaw === "online" ? "Online on Steam" : "Steam active");
    var stateMap = {
      in_game: "正在游戏",
      online: "在线中",
      offline: "离线",
      error: "错误",
      unconfigured: "未配置"
    };
    var stateText = stateMap[stateRaw] || "Active";
    var dotState = (stateRaw === "in_game" || stateRaw === "online") ? "online" : "offline";

    return [
      "<section class=\"presence-widget__section\">",
      "<ul class=\"presence-widget__list\">",
      "<li class=\"presence-widget__list-item\">",
      "<div class=\"presence-widget__row\">",
      "<div class=\"presence-widget__state\">",
      stateDot(dotState),
      "<span class=\"presence-widget__device-main\">",
      "<span class=\"presence-widget__device-label\">" + line1 + "</span>",
      "</span>",
      "</div>",
      "<span class=\"presence-widget__right\">" + escapeHtml(stateText) + "</span>",
      "</div>",
      "</li>",
      "</ul>",
      "</section>"
    ].join("");
  }

  async function fetchStatus(api, timeoutMs) {
    var controller = new AbortController();
    var timer = setTimeout(function () {
      controller.abort();
    }, timeoutMs);
    try {
      var response = await fetch(api, {
        method: "GET",
        headers: { "Accept": "application/json" },
        cache: "no-store",
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error("HTTP " + response.status);
      }
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  function renderError(host, message) {
    host.hidden = false;
    host.innerHTML = "<section class=\"presence-widget__section\"><div class=\"presence-widget__empty\">" +
      escapeHtml(message) +
      "</div></section>";
  }

  function renderWidget(host, data, parts) {
    var showEmpty = shouldShowEmpty(host);
    var devices = normalizeDevices(data);
    var overallState = computeOverallState(data, devices);
    var blocks = [];

    if (parts.indexOf("overall") >= 0) {
      blocks.push(renderOverallSection(overallState));
    }

    if (parts.indexOf("devices") >= 0 || parts.some(function (p) { return p.indexOf("device:") === 0; })) {
      blocks.push(renderDevicesSection(devices, parts, showEmpty));
    }

    if (parts.indexOf("dnd") >= 0 || parts.indexOf("message") >= 0) {
      blocks.push(renderManualSection(data, parts, showEmpty));
    }

    if (parts.indexOf("spotify") >= 0) {
      blocks.push(renderSpotifySection(data, showEmpty));
    }

    if (parts.indexOf("steam") >= 0) {
      blocks.push(renderSteamSection(data, showEmpty));
    }

    var html = blocks.join("");
    if (!html && !showEmpty) {
      host.hidden = true;
      host.innerHTML = "";
      return;
    }

    if (!html) {
      html = "<section class=\"presence-widget__section\"><div class=\"presence-widget__empty\">No status to display.</div></section>";
    }

    host.hidden = false;
    host.innerHTML = html;
  }

  async function refreshHost(host) {
    var api = (host.dataset.api || "").trim();
    if (!api) {
      renderError(host, "Presence API is not configured.");
      return;
    }
    var parts = parseParts(host.dataset.parts);
    try {
      var data = await fetchStatus(api, 9000);
      renderWidget(host, data, parts);
    } catch (err) {
      renderError(host, "Failed to load status: " + (err && err.message ? err.message : "Unknown error"));
    }
  }

  function initWidget(host) {
    if (!host || host.dataset.presenceInit === "1") return;
    host.dataset.presenceInit = "1";
    host.classList.add("presence-widget");
    applyStyleClass(host, normalizeStyle(host.dataset.style));

    var refreshMs = clampRefreshMs(host.dataset.refreshMs);
    refreshHost(host);
    setInterval(function () {
      refreshHost(host);
    }, refreshMs);
  }

  function initAllWidgets() {
    var nodes = document.querySelectorAll("[data-presence-widget]");
    nodes.forEach(initWidget);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAllWidgets);
  } else {
    initAllWidgets();
  }
})();
