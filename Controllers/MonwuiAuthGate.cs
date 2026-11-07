using System;
using System.Linq;
using Jellyfin.Data.Queries;
using Jellyfin.Database.Implementations.Enums;
using MediaBrowser.Controller.Devices;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.Extensions.DependencyInjection;

namespace Jellyfin.Plugin.JMSFusion.Controllers
{
    // Fork Zigerus (4.0.0.91): marks a controller or action that must answer without a login (scripts, styles and media the
    // web client loads before sign-in or through plain <img>/<video>/<link> tags). Everything else in this plugin is gated.
    [AttributeUsage(AttributeTargets.Class | AttributeTargets.Method, Inherited = true)]
    internal sealed class MonwuiPublicAttribute : Attribute
    {
    }

    // Fork Zigerus (4.0.0.91): one gate in front of every controller of this plugin, registered globally so a controller
    // added later is closed by default.
    //
    // Why: Jellyfin 12 runs with EnableLegacyAuthorization=false, so it ignores the X-Emby-Token header MonWUI's pages send
    // and fills no claims for them. Most controllers here therefore identified the caller by the X-Emby-UserId header or a
    // userId query value alone, which anyone can write: an anonymous request carrying an administrator's id read the Seerr
    // API key, the Sonarr/Radarr settings, the parental-PIN profiles and the request queue, and the remaining endpoints
    // (configuration, per-user settings, the trailer cache with ?force=true) answered with no id at all.
    //
    // What it does:
    // 1. Identity comes only from something Jellyfin issued: the claims of a validated Authorization header or API key, or
    //    else an X-Emby-Token / X-MediaBrowser-Token header that matches a signed-in device's access token. Query-string
    //    tokens (api_key / ApiKey) are not honoured; that is why Jellyfin dropped them (they end up in proxy logs).
    // 2. No identity, an unknown token or a disabled user: 401.
    // 3. The user id the controllers read is bound to that identity: for a non-administrator the X-Emby-UserId and
    //    X-MediaBrowser-UserId headers are overwritten with the token's user, and a userId query value naming someone else
    //    is refused with 403. An administrator may name another user (the admin pages do).
    // RequestAuth.GetLevel stays claims-only on purpose: raising token-validated admins to Level.Admin would make
    // /JMSFusion/config return the unredacted keys to the browser, which caches the configuration.
    internal sealed class MonwuiAuthGateFilter : IAuthorizationFilter
    {
        // HttpContext.Items keys a controller may read after the gate: the verified user (Guid) and whether it is an admin.
        internal const string ItemUserId = "Monwui.UserId";
        internal const string ItemIsAdmin = "Monwui.IsAdmin";

        private static readonly string[] TokenHeaders = { "X-Emby-Token", "X-MediaBrowser-Token" };
        private static readonly string[] UserIdHeaders = { "X-Emby-UserId", "X-MediaBrowser-UserId" };
        private static readonly string[] UserIdQueryKeys = { "userId", "UserId", "userid" };

        public void OnAuthorization(AuthorizationFilterContext context)
        {
            if (context.ActionDescriptor is not ControllerActionDescriptor action)
            {
                return;
            }

            if (action.ControllerTypeInfo.Assembly != typeof(MonwuiAuthGateFilter).Assembly)
            {
                return;
            }

            if (action.ControllerTypeInfo.IsDefined(typeof(MonwuiPublicAttribute), true) ||
                action.MethodInfo.IsDefined(typeof(MonwuiPublicAttribute), true))
            {
                return;
            }

            var http = context.HttpContext;
            if (RequestAuth.IsApiKeyRequest(http))
            {
                http.Items[ItemIsAdmin] = true;
                return;
            }

            var userId = ResolveUserId(http);
            var users = http.RequestServices.GetService<IUserManager>();
            var user = userId == Guid.Empty ? null : users?.GetUserById(userId);
            if (user is null || user.Permissions.Any(p => p.Kind == PermissionKind.IsDisabled && p.Value))
            {
                context.Result = new JsonResult(new { ok = false, error = "Sign in to Jellyfin first." }) { StatusCode = StatusCodes.Status401Unauthorized };
                return;
            }

            var isAdmin = user.Permissions.Any(p => p.Kind == PermissionKind.IsAdministrator && p.Value);
            var own = user.Id.ToString("N");
            http.Items[ItemUserId] = user.Id;
            http.Items[ItemIsAdmin] = isAdmin;

            if (!isAdmin)
            {
                foreach (var key in UserIdQueryKeys)
                {
                    var raw = http.Request.Query[key].FirstOrDefault();
                    if (!string.IsNullOrWhiteSpace(raw) && (!Guid.TryParse(raw, out var claimed) || claimed != user.Id))
                    {
                        context.Result = new JsonResult(new { ok = false, error = "That user id is not yours." }) { StatusCode = StatusCodes.Status403Forbidden };
                        return;
                    }
                }

                foreach (var header in UserIdHeaders)
                {
                    http.Request.Headers[header] = own;
                }

                return;
            }

            foreach (var header in UserIdHeaders)
            {
                if (string.IsNullOrWhiteSpace(http.Request.Headers[header].FirstOrDefault()))
                {
                    http.Request.Headers[header] = own;
                }
            }
        }

        private static Guid ResolveUserId(HttpContext http)
        {
            if (RequestAuth.TryGetAuthenticatedUserId(http, out var fromClaims))
            {
                return fromClaims;
            }

            var token = TokenHeaders
                .Select(name => http.Request.Headers[name].FirstOrDefault())
                .FirstOrDefault(value => !string.IsNullOrWhiteSpace(value))
                ?.Trim();
            if (string.IsNullOrEmpty(token))
            {
                return Guid.Empty;
            }

            var devices = http.RequestServices.GetService<IDeviceManager>();
            var device = devices?.GetDevices(new DeviceQuery { AccessToken = token }).Items?
                .FirstOrDefault(d => string.Equals(d.AccessToken, token, StringComparison.Ordinal));
            return device?.UserId ?? Guid.Empty;
        }
    }
}
