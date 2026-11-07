using System.Collections.Concurrent;
using Jellyfin.Data.Enums;
using MediaBrowser.Controller.Dto;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.JMSFusion.Controllers;

// Fork Zigerus (4.0.0.93): the tag picker of MonWUI's "Tag rows". Lists every tag on the signed-in user's movies and shows
// with how many of each carry it, so the settings page can search the library's tags (prod: ~5,100) and show counts.
// Jellyfin has no tag endpoint with counts. Gated by MonwuiAuthGateFilter (no [MonwuiPublic]); the query runs as the
// gate's user, so library access and parental limits apply. Cached per user for 10 minutes.
[ApiController]
[Route("JMSFusion/library-tags")]
[Route("Plugins/JMSFusion/library-tags")]
public class LibraryTagsController : ControllerBase
{
    private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(10);
    private static readonly ConcurrentDictionary<Guid, (DateTimeOffset At, TagsResponse Value)> Cache = new();

    private readonly ILibraryManager _libraryManager;
    private readonly IUserManager _users;

    public LibraryTagsController(ILibraryManager libraryManager, IUserManager users)
    {
        _libraryManager = libraryManager;
        _users = users;
    }

    public sealed class TagCount
    {
        public string Name { get; set; } = string.Empty;

        public int Movies { get; set; }

        public int Series { get; set; }
    }

    public sealed class TagsResponse
    {
        public int Titles { get; set; }

        public List<TagCount> Tags { get; set; } = new();
    }

    [HttpGet]
    public IActionResult Get([FromQuery] string? userId, [FromQuery] bool refresh = false)
    {
        var resolved = HttpContext.Items.TryGetValue(MonwuiAuthGateFilter.ItemUserId, out var raw) && raw is Guid gateUser
            ? gateUser
            : Guid.Empty;
        if (resolved == Guid.Empty && Guid.TryParse(userId, out var named))
        {
            resolved = named;
        }

        var user = resolved == Guid.Empty ? null : _users.GetUserById(resolved);
        if (user is null)
        {
            return BadRequest(new { ok = false, error = "No user." });
        }

        Response.Headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0";
        if (!refresh && Cache.TryGetValue(user.Id, out var hit) && DateTimeOffset.UtcNow - hit.At < CacheTtl)
        {
            return Ok(hit.Value);
        }

        var items = _libraryManager.GetItemList(new InternalItemsQuery(user)
        {
            IncludeItemTypes = new[] { BaseItemKind.Movie, BaseItemKind.Series },
            Recursive = true,
            IsVirtualItem = false,
            DtoOptions = new DtoOptions(true)
        }) ?? (IReadOnlyList<BaseItem>)Array.Empty<BaseItem>();

        // Case-insensitive counts; the spelling shown is the one most titles use.
        var counts = new Dictionary<string, (int Movies, int Series, Dictionary<string, int> Spellings)>(StringComparer.OrdinalIgnoreCase);
        foreach (var item in items)
        {
            var isSeries = item.GetBaseItemKind() == BaseItemKind.Series;
            foreach (var tag in (item.Tags ?? Array.Empty<string>()).Select(t => t?.Trim()).Where(t => !string.IsNullOrEmpty(t)).Distinct(StringComparer.OrdinalIgnoreCase))
            {
                if (!counts.TryGetValue(tag!, out var entry))
                {
                    entry = (0, 0, new Dictionary<string, int>(StringComparer.Ordinal));
                }

                entry.Spellings[tag!] = entry.Spellings.TryGetValue(tag!, out var n) ? n + 1 : 1;
                counts[tag!] = isSeries ? (entry.Movies, entry.Series + 1, entry.Spellings) : (entry.Movies + 1, entry.Series, entry.Spellings);
            }
        }

        var response = new TagsResponse
        {
            Titles = items.Count,
            Tags = counts
                .Select(kv => new TagCount
                {
                    Name = kv.Value.Spellings.OrderByDescending(s => s.Value).ThenBy(s => s.Key, StringComparer.Ordinal).First().Key,
                    Movies = kv.Value.Movies,
                    Series = kv.Value.Series
                })
                .OrderByDescending(t => t.Movies + t.Series)
                .ThenBy(t => t.Name, StringComparer.OrdinalIgnoreCase)
                .ToList()
        };
        Cache[user.Id] = (DateTimeOffset.UtcNow, response);
        return Ok(response);
    }
}
