using MediaBrowser.Controller;
using MediaBrowser.Controller.Plugins;
using Jellyfin.Plugin.JMSFusion.Core;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Hosting;
using Jellyfin.Plugin.JMSFusion.Tasks;
using Jellyfin.Plugin.JMSFusion.Controllers;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.JMSFusion
{
    public sealed class JMSFusionServiceRegistrator : IPluginServiceRegistrator
    {
        public void RegisterServices(IServiceCollection services, IServerApplicationHost applicationHost)
        {
            services.AddSingleton<TrailerAutomationService>();
            services.AddSingleton<CinemaPreRollCacheService>();
            services.AddSingleton<LibraryPopularityService>();
            services.AddSingleton<ScopedCacheJsonService>();
            services.AddHostedService<TrailerWatcher>();
            services.AddHostedService<AccessRelockService>();
            services.AddTransient<IStartupFilter, JMSStartupFilter>();
            // Fork Zigerus (4.0.0.91): every controller of this plugin needs a Jellyfin sign-in unless marked [MonwuiPublic].
            services.Configure<MvcOptions>(options => options.Filters.Add(new MonwuiAuthGateFilter()));
        }
    }
}
