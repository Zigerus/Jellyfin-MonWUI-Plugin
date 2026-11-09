using System.Collections.Concurrent;
using Jellyfin.Data.Enums;
using Jellyfin.Database.Implementations.Entities;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Entities;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.JMSFusion.Controllers;

// Fork Zigerus (4.0.0.96): "Next in the Collection", a home row with one card per movie collection the user is partway
// through. For each collection (BoxSet) the user can see: its movies in release order, one per TMDb id (a collection can
// hold two copies of a film), watched = any copy played. Started = at least one watched and one not. The next film is the
// first unwatched one released after the latest-released film watched; when nothing comes after it, the first unwatched
// one (someone who saw only the newest starts at the beginning). A next film already in progress is left out: it is in
// Continue Watching. Most recently watched collection first; `days` (0 = any time) drops collections not watched lately.
// Gated by MonwuiAuthGateFilter (no [MonwuiPublic]); the queries run as the gate's user, so library access and parental
// limits apply. Computed per user and kept for 10 s.
[ApiController]
[Route("JMSFusion/collection-next")]
[Route("Plugins/JMSFusion/collection-next")]
public class CollectionNextController : ControllerBase
{
    // Short on purpose: the row must not offer a film the user finished a minute ago (it only absorbs repeated loads).
    private static readonly TimeSpan CacheTtl = TimeSpan.FromSeconds(10);
    private static readonly ConcurrentDictionary<Guid, (DateTimeOffset At, List<CollectionNext> Value)> Cache = new();

    private readonly ILibraryManager _libraryManager;
    private readonly IUserManager _users;
    private readonly IUserDataManager _userData;

    public CollectionNextController(ILibraryManager libraryManager, IUserManager users, IUserDataManager userData)
    {
        _libraryManager = libraryManager;
        _users = users;
        _userData = userData;
    }

    public sealed class CollectionNext
    {
        public string ItemId { get; set; } = string.Empty;

        public string CollectionId { get; set; } = string.Empty;

        public string CollectionName { get; set; } = string.Empty;

        // 1-based place of the next film among the collection's films in release order.
        public int Position { get; set; }

        public int Total { get; set; }

        // One letter per film in release order: w = watched, n = the next film (this card), - = not watched yet.
        public string States { get; set; } = string.Empty;

        public DateTime LastPlayed { get; set; }
    }

    private sealed class Film
    {
        public List<BaseItem> Copies { get; } = new();

        public DateTime Released { get; set; }

        public string SortName { get; set; } = string.Empty;

        public bool Watched { get; set; }

        public bool InProgress { get; set; }

        public DateTime? LastPlayed { get; set; }
    }

    [HttpGet]
    public IActionResult Get([FromQuery] string? userId, [FromQuery] int days = 365, [FromQuery] int limit = 20, [FromQuery] bool refresh = false)
    {
        var resolved = HttpContext.Items.TryGetValue(MonwuiAuthGateFilter.ItemUserId, out var raw) && raw is Guid gateUser
            ? gateUser
            : Guid.Empty;
        // An API-key caller has no user of its own; the gate already refused a non-admin naming someone else.
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
        List<CollectionNext> all;
        if (!refresh && Cache.TryGetValue(user.Id, out var hit) && DateTimeOffset.UtcNow - hit.At < CacheTtl)
        {
            all = hit.Value;
        }
        else
        {
            all = Compute(user);
            Cache[user.Id] = (DateTimeOffset.UtcNow, all);
        }

        var cutoff = days > 0 ? DateTime.UtcNow.AddDays(-days) : DateTime.MinValue;
        var items = all
            .Where(c => c.LastPlayed >= cutoff)
            .Take(Math.Clamp(limit, 1, 50))
            .ToList();
        return Ok(new { items, started = all.Count });
    }

    private List<CollectionNext> Compute(User user)
    {
        // The movies this user may see (library access, parental rating); collection children outside it are ignored.
        var visibleMovies = _libraryManager.GetItemList(new InternalItemsQuery(user)
        {
            IncludeItemTypes = new[] { BaseItemKind.Movie },
            Recursive = true,
            IsVirtualItem = false
        }) ?? (IReadOnlyList<BaseItem>)Array.Empty<BaseItem>();
        var visible = new HashSet<Guid>(visibleMovies.Select(m => m.Id));

        var boxSets = _libraryManager.GetItemList(new InternalItemsQuery(user)
        {
            IncludeItemTypes = new[] { BaseItemKind.BoxSet },
            Recursive = true
        }) ?? (IReadOnlyList<BaseItem>)Array.Empty<BaseItem>();

        var result = new List<CollectionNext>();
        foreach (var boxSet in boxSets.OfType<Folder>())
        {
            List<BaseItem> movies;
            try
            {
                movies = boxSet.GetLinkedChildren()
                    .Where(child => child is not null && visible.Contains(child.Id) && child.GetBaseItemKind() == BaseItemKind.Movie)
                    .GroupBy(child => child.Id)
                    .Select(g => g.First())
                    .ToList();
            }
            catch
            {
                continue;
            }

            var next = PickNext(user, boxSet, movies);
            if (next is not null)
            {
                result.Add(next);
            }
        }

        // Most recently watched first; a film that sits in two collections gets one card (from the more recent one).
        return result
            .OrderByDescending(c => c.LastPlayed)
            .GroupBy(c => c.ItemId)
            .Select(g => g.First())
            .ToList();
    }

    private CollectionNext? PickNext(User user, BaseItem boxSet, List<BaseItem> movies)
    {
        var films = new Dictionary<string, Film>(StringComparer.OrdinalIgnoreCase);
        foreach (var movie in movies)
        {
            // fully qualified: ControllerBase has a MetadataProvider property of its own
            var key = movie.GetProviderId(MediaBrowser.Model.Entities.MetadataProvider.Tmdb);
            if (string.IsNullOrWhiteSpace(key))
            {
                key = "id:" + movie.Id.ToString("N");
            }

            if (!films.TryGetValue(key, out var film))
            {
                film = new Film
                {
                    Released = movie.PremiereDate
                        ?? (movie.ProductionYear is int year && year > 0 ? new DateTime(year, 1, 1, 0, 0, 0, DateTimeKind.Utc) : DateTime.MaxValue),
                    SortName = movie.SortName ?? movie.Name ?? string.Empty
                };
                films[key] = film;
            }

            film.Copies.Add(movie);
            UserItemData? data = null;
            try
            {
                data = _userData.GetUserData(user, movie);
            }
            catch
            {
            }

            if (data is null)
            {
                continue;
            }

            if (data.Played)
            {
                film.Watched = true;
            }
            else if (data.PlaybackPositionTicks > 0)
            {
                film.InProgress = true;
            }

            if (data.LastPlayedDate is DateTime played && (film.LastPlayed is null || played > film.LastPlayed))
            {
                film.LastPlayed = played;
            }
        }

        var ordered = films.Values
            .OrderBy(f => f.Released)
            .ThenBy(f => f.SortName, StringComparer.OrdinalIgnoreCase)
            .ToList();
        if (ordered.Count < 2)
        {
            return null;
        }

        var lastWatched = ordered.FindLastIndex(f => f.Watched);
        if (lastWatched < 0 || ordered.All(f => f.Watched))
        {
            return null;
        }

        var nextIndex = ordered.FindIndex(lastWatched + 1, f => !f.Watched);
        if (nextIndex < 0)
        {
            nextIndex = ordered.FindIndex(f => !f.Watched);
        }

        var nextFilm = ordered[nextIndex];
        if (nextFilm.InProgress)
        {
            return null;
        }

        var card = nextFilm.Copies
            .OrderByDescending(c => c.HasImage(ImageType.Primary, 0))
            .ThenBy(c => c.Id)
            .First();
        var lastPlayed = ordered.Where(f => f.Watched && f.LastPlayed.HasValue).Select(f => f.LastPlayed!.Value).DefaultIfEmpty(DateTime.MinValue).Max();
        return new CollectionNext
        {
            ItemId = card.Id.ToString("N"),
            CollectionId = boxSet.Id.ToString("N"),
            CollectionName = boxSet.Name ?? string.Empty,
            Position = nextIndex + 1,
            Total = ordered.Count,
            States = string.Concat(ordered.Select((f, i) => i == nextIndex ? 'n' : (f.Watched ? 'w' : '-'))),
            LastPlayed = lastPlayed
        };
    }
}
