using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;

namespace Jellyfin.Plugin.JMSFusion.Core
{
    public sealed class PathRewriteMiddleware
    {
        private readonly RequestDelegate _next;

        public PathRewriteMiddleware(RequestDelegate next) => _next = next;

        public async Task InvokeAsync(HttpContext ctx)
        {
            var path = ctx.Request.Path;

            if (path.HasValue && path.StartsWithSegments("/web/slider", out var remaining))
            {
                ctx.Request.Path = new PathString("/slider" + remaining);
                path = ctx.Request.Path;
            }

            // TV web clients get empty JS for all slider assets so MonWUI never
            // boots there. Must live here: /slider/* is served by the static-file
            // provider registered right after this middleware, not by MVC.
            if (path.HasValue
                && path.StartsWithSegments("/slider")
                && TvClientGate.IsBlockedTvClient(ctx.Request))
            {
                ctx.Response.StatusCode = StatusCodes.Status200OK;
                ctx.Response.ContentType = "application/javascript; charset=utf-8";
                ctx.Response.Headers["Cache-Control"] = "no-store";
                return;
            }

            await _next(ctx);
        }
    }
}
