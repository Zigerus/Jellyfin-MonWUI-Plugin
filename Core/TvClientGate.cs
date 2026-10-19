using System;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Http;

namespace Jellyfin.Plugin.JMSFusion.Core
{
    /// <summary>
    /// When DisableForTvWebClients is enabled, requests whose User-Agent matches
    /// TvClientUserAgentPattern get empty script responses so MonWUI never boots
    /// on TV web clients (webOS/Tizen wrap the server-hosted jellyfin-web).
    /// </summary>
    public static class TvClientGate
    {
        private const string DefaultPattern = "Web0S|SmartTV|WebAppManager|Tizen";

        /// <summary>
        /// Served to gated TV clients in place of storage-preload.js. Stock
        /// jellyfin-web on webOS can end up with no focused element on boot
        /// (focus lost to async home-row rendering / pointer-mode launch),
        /// leaving the D-pad dead until the pointer assigns focus. MonWUI's
        /// own home-section code used to re-grab focus; this shim replaces
        /// that one duty: establish focus at boot, restore it if it collapses
        /// to body, and recover on the first key press when nothing is focused.
        /// </summary>
        public const string TvFocusShimJs = """
/* JMSFusion TV shim (gate active): keep D-pad focus alive on TV web clients. */
(function () {
  "use strict";
  function isTv() { return document.documentElement.classList.contains("layout-tv"); }
  function inPlayback() { return !!document.querySelector(".videoPlayerContainer, .youtubePlayerContainer"); }
  function focusTarget() {
    var sels = ["#homeTab .card", ".itemsContainer .card", ".card", ".emby-button"];
    for (var i = 0; i < sels.length; i++) {
      var els = document.querySelectorAll(sels[i]);
      for (var j = 0; j < els.length; j++) {
        var el = els[j], r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight) return el;
      }
    }
    return null;
  }
  function focusDead() {
    var a = document.activeElement;
    return !a || a === document.body || a === document.documentElement || !a.isConnected;
  }
  function ensureFocus() {
    if (!isTv() || inPlayback() || document.hidden || !focusDead()) return;
    var el = focusTarget();
    if (!el) return;
    try { el.focus({ preventScroll: false }); } catch (e) { try { el.focus(); } catch (e2) {} }
  }
  var tries = 0;
  var boot = setInterval(function () {
    tries++;
    ensureFocus();
    if (!focusDead() || tries > 60) clearInterval(boot);
  }, 500);
  document.addEventListener("focusout", function () { setTimeout(ensureFocus, 120); }, true);
  document.addEventListener("keydown", function (ev) {
    var k = ev.key;
    if (k !== "ArrowLeft" && k !== "ArrowRight" && k !== "ArrowUp" && k !== "ArrowDown" && k !== "Enter") return;
    if (focusDead()) ensureFocus();
  }, true);
})();
""";

        public static bool IsBlockedTvClient(HttpRequest request)
        {
            try
            {
                var cfg = JMSFusionPlugin.Instance?.Configuration;
                if (cfg == null || !cfg.DisableForTvWebClients)
                {
                    return false;
                }

                var ua = request.Headers.UserAgent.ToString();
                if (string.IsNullOrEmpty(ua))
                {
                    return false;
                }

                var pattern = string.IsNullOrWhiteSpace(cfg.TvClientUserAgentPattern)
                    ? DefaultPattern
                    : cfg.TvClientUserAgentPattern;

                return Regex.IsMatch(ua, pattern, RegexOptions.IgnoreCase, TimeSpan.FromMilliseconds(50));
            }
            catch
            {
                return false;
            }
        }
    }
}
