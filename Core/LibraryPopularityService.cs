using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using Jellyfin.Data.Enums;
using Jellyfin.Database.Implementations.Entities;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.JMSFusion.Core;

// Fork Zigerus (4.0.0.92): TMDb popularity and votes for every movie and show in the library, for the Top 10 rows
// ("Popular now": the rows rank the signed-in user's unwatched titles by TMDb popularity, with a vote floor, and the page
// draws the day's ten from the top 30).
//
// One TMDb call per title (/movie/{id} or /tv/{id}), 8 at a time, refreshed in the background once the file is a day old.
// A request never waits for a refresh: it gets what the file holds, plus Refreshing=true while one runs. Titles without a
// TMDb id are skipped. A title TMDb no longer knows (404) is dropped; any other failure keeps the previous numbers.
public sealed class LibraryPopularityService
{
    private const string CacheFileName = "tmdb-library-popularity.json";
    private const string TmdbApiBase = "https://api.themoviedb.org/3";
    private const int CacheVersion = 1;
    private const int MaxConcurrentTmdbRequests = 8;
    private static readonly TimeSpan RefreshInterval = TimeSpan.FromHours(24);
    private static readonly TimeSpan RetryAfterFailure = TimeSpan.FromMinutes(30);
    private static readonly HttpClient Http = CreateHttpClient();
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        WriteIndented = false
    };

    private readonly ILogger<LibraryPopularityService> _logger;
    private readonly ILibraryManager _libraryManager;
    private readonly object _modelLock = new();
    private CacheFileModel? _model;
    private int _refreshing;
    private long _lastFailedAttemptUtc;

    public LibraryPopularityService(ILogger<LibraryPopularityService> logger, ILibraryManager libraryManager)
    {
        _logger = logger;
        _libraryManager = libraryManager;
    }

    public sealed class Snapshot
    {
        // False when the server has no TMDb key: the page then keeps its own ranking.
        public bool Available { get; set; }

        public bool Refreshing { get; set; }

        public long UpdatedAtUtc { get; set; }

        public List<SnapshotItem> Items { get; set; } = new();
    }

    public sealed class SnapshotItem
    {
        public string ItemId { get; set; } = string.Empty;

        public int TmdbId { get; set; }

        public double Popularity { get; set; }

        public double VoteAverage { get; set; }

        public int VoteCount { get; set; }
    }

    public sealed class Entry
    {
        public double? Popularity { get; set; }

        public double? VoteAverage { get; set; }

        public int? VoteCount { get; set; }

        public long FetchedAtUtc { get; set; }
    }

    private sealed class CacheFileModel
    {
        public int Version { get; set; } = CacheVersion;

        public long UpdatedAtUtc { get; set; }

        // Key: "movie:<tmdb id>" or "tv:<tmdb id>".
        public Dictionary<string, Entry> Entries { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    }

    private sealed class TmdbTitle
    {
        [JsonPropertyName("popularity")]
        public double? Popularity { get; set; }

        [JsonPropertyName("vote_average")]
        public double? VoteAverage { get; set; }

        [JsonPropertyName("vote_count")]
        public int? VoteCount { get; set; }
    }

    // The user's own view of the library: their library access and parental limits apply, because the query runs as them.
    public Snapshot GetSnapshot(User user, BaseItemKind kind, IReadOnlyList<Guid> parentIds)
    {
        var apiKey = GetApiKey();
        if (string.IsNullOrEmpty(apiKey))
        {
            return new Snapshot { Available = false };
        }

        var model = GetModel();
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var stale = model.UpdatedAtUtc <= 0 || (now - model.UpdatedAtUtc) >= (long)RefreshInterval.TotalMilliseconds;
        var retryBlocked = (now - Interlocked.Read(ref _lastFailedAttemptUtc)) < (long)RetryAfterFailure.TotalMilliseconds;
        if (stale && !retryBlocked)
        {
            StartBackgroundRefresh(apiKey);
        }

        var snapshot = new Snapshot
        {
            Available = true,
            Refreshing = Volatile.Read(ref _refreshing) == 1,
            UpdatedAtUtc = model.UpdatedAtUtc
        };

        var query = new InternalItemsQuery(user)
        {
            IncludeItemTypes = new[] { kind },
            Recursive = true,
            IsVirtualItem = false
        };
        if (parentIds.Count > 0)
        {
            query.AncestorIds = parentIds.ToArray();
        }

        IReadOnlyList<BaseItem> items;
        try
        {
            items = _libraryManager.GetItemList(query) ?? (IReadOnlyList<BaseItem>)Array.Empty<BaseItem>();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Library popularity: item query failed for {Kind}", kind);
            return snapshot;
        }

        var prefix = KeyPrefix(kind);
        foreach (var item in items)
        {
            var tmdbId = GetTmdbIdFromItem(item);
            if (tmdbId <= 0 || !model.Entries.TryGetValue($"{prefix}:{tmdbId}", out var entry) || entry.Popularity is null)
            {
                continue;
            }

            snapshot.Items.Add(new SnapshotItem
            {
                ItemId = item.Id.ToString("N"),
                TmdbId = tmdbId,
                Popularity = entry.Popularity ?? 0,
                VoteAverage = entry.VoteAverage ?? 0,
                VoteCount = entry.VoteCount ?? 0
            });
        }

        snapshot.Items.Sort((a, b) => b.Popularity.CompareTo(a.Popularity));
        return snapshot;
    }

    private void StartBackgroundRefresh(string apiKey)
    {
        if (Interlocked.CompareExchange(ref _refreshing, 1, 0) != 0)
        {
            return;
        }

        _ = Task.Run(async () =>
        {
            try
            {
                var ok = await RefreshAsync(apiKey, CancellationToken.None).ConfigureAwait(false);
                if (!ok)
                {
                    Interlocked.Exchange(ref _lastFailedAttemptUtc, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
                }
            }
            catch (Exception ex)
            {
                Interlocked.Exchange(ref _lastFailedAttemptUtc, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
                _logger.LogWarning(ex, "Library popularity refresh failed");
            }
            finally
            {
                Volatile.Write(ref _refreshing, 0);
            }
        });
    }

    // Returns false when nothing could be fetched (no network, a rejected key), so the next try waits RetryAfterFailure.
    private async Task<bool> RefreshAsync(string apiKey, CancellationToken ct)
    {
        var started = DateTimeOffset.UtcNow;
        var keys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var kind in new[] { BaseItemKind.Movie, BaseItemKind.Series })
        {
            var items = _libraryManager.GetItemList(new InternalItemsQuery
            {
                IncludeItemTypes = new[] { kind },
                Recursive = true,
                IsVirtualItem = false
            }) ?? (IReadOnlyList<BaseItem>)Array.Empty<BaseItem>();
            foreach (var item in items)
            {
                var tmdbId = GetTmdbIdFromItem(item);
                if (tmdbId > 0)
                {
                    keys.Add($"{KeyPrefix(kind)}:{tmdbId}");
                }
            }
        }

        var previous = GetModel();
        var next = new Dictionary<string, Entry>(StringComparer.OrdinalIgnoreCase);
        var fetched = 0;
        var gone = 0;
        var failed = 0;
        using var gate = new SemaphoreSlim(MaxConcurrentTmdbRequests);
        var tasks = keys.Select(async key =>
        {
            await gate.WaitAsync(ct).ConfigureAwait(false);
            try
            {
                var (status, title) = await FetchTitleAsync(apiKey, key, ct).ConfigureAwait(false);
                lock (next)
                {
                    if (title is not null)
                    {
                        next[key] = new Entry
                        {
                            Popularity = title.Popularity,
                            VoteAverage = title.VoteAverage,
                            VoteCount = title.VoteCount,
                            FetchedAtUtc = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
                        };
                        fetched++;
                    }
                    else if (status == 404)
                    {
                        gone++;
                    }
                    else
                    {
                        failed++;
                        if (previous.Entries.TryGetValue(key, out var old))
                        {
                            next[key] = old;
                        }
                    }
                }
            }
            finally
            {
                gate.Release();
            }
        }).ToList();
        await Task.WhenAll(tasks).ConfigureAwait(false);

        if (fetched == 0 && keys.Count > 0)
        {
            _logger.LogWarning("Library popularity refresh fetched nothing ({Failed} failed of {Total}); keeping the previous file", failed, keys.Count);
            return false;
        }

        var model = new CacheFileModel
        {
            UpdatedAtUtc = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            Entries = next
        };
        WriteCacheFile(model);
        lock (_modelLock)
        {
            _model = model;
        }

        _logger.LogInformation(
            "Library popularity refreshed: {Fetched} titles, {Gone} unknown to TMDb, {Failed} failed (kept), in {Seconds:0.0}s",
            fetched,
            gone,
            failed,
            (DateTimeOffset.UtcNow - started).TotalSeconds);
        return true;
    }

    private static async Task<(int Status, TmdbTitle? Title)> FetchTitleAsync(string apiKey, string key, CancellationToken ct)
    {
        var parts = key.Split(':', 2);
        var url = $"{TmdbApiBase}/{parts[0]}/{parts[1]}?api_key={Uri.EscapeDataString(apiKey)}";
        try
        {
            using var response = await Http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, ct).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
            {
                return ((int)response.StatusCode, null);
            }

            await using var stream = await response.Content.ReadAsStreamAsync(ct).ConfigureAwait(false);
            var title = await JsonSerializer.DeserializeAsync<TmdbTitle>(stream, JsonOptions, ct).ConfigureAwait(false);
            return title?.Popularity is null ? (0, null) : (200, title);
        }
        catch (Exception) when (!ct.IsCancellationRequested)
        {
            // Swallowed on purpose: the TMDb key is in the request URL, so no exception from this call reaches a log.
            return (0, null);
        }
    }

    private static string KeyPrefix(BaseItemKind kind) => kind == BaseItemKind.Series ? "tv" : "movie";

    private static string GetApiKey()
    {
        var raw = JMSFusionPlugin.Instance?.Configuration?.TmdbApiKey;
        var key = string.IsNullOrWhiteSpace(raw) ? string.Empty : raw.Trim();
        return string.Equals(key, "CHANGE_ME", StringComparison.OrdinalIgnoreCase) ? string.Empty : key;
    }

    private static int GetTmdbIdFromItem(BaseItem item)
    {
        if (item?.ProviderIds == null || item.ProviderIds.Count == 0)
        {
            return 0;
        }

        foreach (var key in new[] { "Tmdb", "TMDb", "MovieDb", "TheMovieDb" })
        {
            if (item.ProviderIds.TryGetValue(key, out var raw) &&
                int.TryParse(raw, NumberStyles.Integer, CultureInfo.InvariantCulture, out var tmdbId) &&
                tmdbId > 0)
            {
                return tmdbId;
            }
        }

        return 0;
    }

    private static HttpClient CreateHttpClient()
    {
        var client = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
        client.DefaultRequestHeaders.UserAgent.ParseAdd("JMSFusion-LibraryPopularity/1.0");
        return client;
    }

    private CacheFileModel GetModel()
    {
        lock (_modelLock)
        {
            return _model ??= ReadCacheFile();
        }
    }

    private CacheFileModel ReadCacheFile()
    {
        var path = GetCacheFilePath();
        if (path is null || !File.Exists(path))
        {
            return new CacheFileModel();
        }

        try
        {
            using var stream = File.OpenRead(path);
            var parsed = JsonSerializer.Deserialize<CacheFileModel>(stream, JsonOptions);
            if (parsed is null || parsed.Version != CacheVersion)
            {
                return new CacheFileModel();
            }

            parsed.Entries = parsed.Entries is null
                ? new Dictionary<string, Entry>(StringComparer.OrdinalIgnoreCase)
                : new Dictionary<string, Entry>(parsed.Entries, StringComparer.OrdinalIgnoreCase);
            return parsed;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Library popularity file could not be read: {Path}", path);
            return new CacheFileModel();
        }
    }

    private void WriteCacheFile(CacheFileModel model)
    {
        var path = GetCacheFilePath();
        if (path is null)
        {
            return;
        }

        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            var tmp = $"{path}.tmp";
            using (var stream = new FileStream(tmp, FileMode.Create, FileAccess.Write, FileShare.None))
            {
                JsonSerializer.Serialize(stream, model, JsonOptions);
            }

            File.Move(tmp, path, true);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Library popularity file could not be written: {Path}", path);
        }
    }

    private static string? GetCacheFilePath()
    {
        var plugin = JMSFusionPlugin.Instance;
        return plugin is null ? null : Path.Combine(plugin.GetStorageDirectory(), CacheFileName);
    }
}
