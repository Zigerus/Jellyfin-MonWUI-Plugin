using System.Collections.Concurrent;
using System.Text;
using System.Text.Json;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.JMSFusion.Controllers;

// Fork Zigerus (4.0.0.95): the home hero vanished on prod after the page sat open for a while (2026-11-08) and five bench
// scenarios could not reproduce it. The client's hero watchdog now repairs it and reports what it found here, so the
// next occurrence lands in the Jellyfin log as evidence instead of a screenshot. Gated by MonwuiAuthGateFilter (no
// [MonwuiPublic]); at most 20 lines per user per hour, each event name and detail capped, control characters removed.
[ApiController]
[Route("JMSFusion/client-log")]
[Route("Plugins/JMSFusion/client-log")]
public class ClientLogController : ControllerBase
{
    private const int MaxPerHour = 20;
    private const int MaxEventLength = 60;
    private const int MaxDetailLength = 1200;
    private static readonly ConcurrentDictionary<Guid, (DateTimeOffset WindowStart, int Count)> Budget = new();

    private readonly ILogger<ClientLogController> _logger;
    private readonly IUserManager _users;

    public ClientLogController(ILogger<ClientLogController> logger, IUserManager users)
    {
        _logger = logger;
        _users = users;
    }

    public sealed class ClientLogEntry
    {
        public string? Event { get; set; }

        public JsonElement? Detail { get; set; }
    }

    [HttpPost]
    public IActionResult Post([FromBody] ClientLogEntry? entry)
    {
        var userId = HttpContext.Items.TryGetValue(MonwuiAuthGateFilter.ItemUserId, out var raw) && raw is Guid gateUser
            ? gateUser
            : Guid.Empty;
        if (userId == Guid.Empty || entry is null || string.IsNullOrWhiteSpace(entry.Event))
        {
            return BadRequest(new { ok = false, error = "No user or no event." });
        }

        var now = DateTimeOffset.UtcNow;
        var budget = Budget.AddOrUpdate(
            userId,
            _ => (now, 1),
            (_, old) => now - old.WindowStart > TimeSpan.FromHours(1) ? (now, 1) : (old.WindowStart, old.Count + 1));
        if (budget.Count > MaxPerHour)
        {
            return StatusCode(429, new { ok = false, error = "Too many client log lines this hour." });
        }

        var name = _users.GetUserById(userId)?.Username ?? userId.ToString("N");
        var evt = Clean(entry.Event, MaxEventLength);
        var detail = entry.Detail.HasValue ? Clean(entry.Detail.Value.GetRawText(), MaxDetailLength) : string.Empty;
        var agent = Clean(Request.Headers.UserAgent.ToString(), 160);
        _logger.LogWarning("MonWUI client [{User}] {Event} {Detail} (UA: {Agent})", name, evt, detail, agent);
        return Ok(new { ok = true });
    }

    private static string Clean(string? value, int max)
    {
        if (string.IsNullOrEmpty(value))
        {
            return string.Empty;
        }

        var sb = new StringBuilder(Math.Min(value.Length, max));
        foreach (var ch in value)
        {
            if (sb.Length >= max)
            {
                sb.Append('…');
                break;
            }

            sb.Append(char.IsControl(ch) ? ' ' : ch);
        }

        return sb.ToString();
    }
}
