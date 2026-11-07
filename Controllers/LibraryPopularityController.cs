using Jellyfin.Data.Enums;
using Jellyfin.Plugin.JMSFusion.Core;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.JMSFusion.Controllers;

// Fork Zigerus (4.0.0.92): TMDb popularity and votes of the signed-in user's movies or shows, for the Top 10 rows. Gated by
// MonwuiAuthGateFilter like every controller here (no [MonwuiPublic]); the user is the one the gate verified, so the list
// only names titles that user can see.
[ApiController]
[Route("JMSFusion/library-popularity")]
[Route("Plugins/JMSFusion/library-popularity")]
public class LibraryPopularityController : ControllerBase
{
    private readonly LibraryPopularityService _service;
    private readonly IUserManager _users;

    public LibraryPopularityController(LibraryPopularityService service, IUserManager users)
    {
        _service = service;
        _users = users;
    }

    [HttpGet]
    public IActionResult Get([FromQuery] string? type, [FromQuery] string? parentIds, [FromQuery] string? userId)
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

        var kind = string.Equals(type, "Series", StringComparison.OrdinalIgnoreCase) ? BaseItemKind.Series : BaseItemKind.Movie;
        var parents = (parentIds ?? string.Empty)
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(value => Guid.TryParse(value, out var id) ? id : Guid.Empty)
            .Where(id => id != Guid.Empty)
            .Distinct()
            .ToList();

        Response.Headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0";
        return Ok(_service.GetSnapshot(user, kind, parents));
    }
}
