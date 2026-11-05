using System;
using System.IO;
using System.Text;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;

namespace Jellyfin.Plugin.JMSFusion.Core
{
    public sealed class PathRewriteMiddleware
    {
        private const string InjectBegin = "<!-- SL-INJECT BEGIN -->";
        private const string InjectEnd = "<!-- SL-INJECT END -->";

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

            if (HttpMethods.IsGet(ctx.Request.Method)
                && JMSStartupFilter.IsIndexRequest(path)
                && TvClientGate.IsBlockedTvClient(ctx.Request))
            {
                await ServeIndexWithoutMonWuiAsync(ctx);
                return;
            }

            await _next(ctx);
        }

        // Zigerus fork: empty script responses still cost a TV ~100 requests per page load (the
        // injected block carries an import map, module preloads and the boot scripts). Gated TVs now
        // get index.html with the whole injected block removed, whichever injection path added it,
        // plus the focus shim inline. Conditional headers are dropped so a TV cannot keep using a
        // cached injected copy.
        private async Task ServeIndexWithoutMonWuiAsync(HttpContext ctx)
        {
            ctx.Request.Headers.Remove("If-None-Match");
            ctx.Request.Headers.Remove("If-Modified-Since");
            ctx.Request.Headers["Accept-Encoding"] = "identity";

            var originalBody = ctx.Response.Body;
            await using var buffer = new MemoryStream();
            ctx.Response.Body = buffer;
            try
            {
                await _next(ctx);
            }
            finally
            {
                ctx.Response.Body = originalBody;
            }

            buffer.Position = 0;
            var isHtml = (ctx.Response.ContentType ?? string.Empty)
                .StartsWith("text/html", StringComparison.OrdinalIgnoreCase);
            if (ctx.Response.StatusCode != StatusCodes.Status200OK
                || !isHtml
                || ctx.Response.Headers.ContainsKey("Content-Encoding"))
            {
                await buffer.CopyToAsync(originalBody);
                return;
            }

            string html;
            using (var reader = new StreamReader(buffer, Encoding.UTF8, true, 8192, leaveOpen: true))
            {
                html = await reader.ReadToEndAsync();
            }

            var begin = html.IndexOf(InjectBegin, StringComparison.OrdinalIgnoreCase);
            var end = begin >= 0 ? html.IndexOf(InjectEnd, begin, StringComparison.OrdinalIgnoreCase) : -1;
            if (begin >= 0 && end > begin)
            {
                html = html.Remove(begin, end + InjectEnd.Length - begin);
            }

            var shim = "<script>" + TvClientGate.TvFocusShimJs + "</script>\n";
            var headEnd = html.IndexOf("</head>", StringComparison.OrdinalIgnoreCase);
            html = headEnd >= 0 ? html.Insert(headEnd, shim) : html + shim;

            var bytes = Encoding.UTF8.GetBytes(html);
            ctx.Response.Headers.Remove("ETag");
            ctx.Response.Headers.Remove("Last-Modified");
            ctx.Response.Headers["Cache-Control"] = "no-cache";
            ctx.Response.ContentLength = bytes.Length;
            await originalBody.WriteAsync(bytes);
        }
    }
}
