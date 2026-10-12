import { defineRailway, github, postgres, preserve, project, redis, service, volume } from "railway/iac";

export default defineRailway(() => {
  const Postgres = postgres("Postgres", { region: "sfo" });
  Postgres.networking = { privateNetworkEndpoint: "postgres" };
  const Redis = redis("Redis", { region: "sfo" });
  Redis.deploy = { startCommand: "/bin/sh -c \"rm -rf $RAILWAY_VOLUME_MOUNT_PATH/lost+found/ && exec docker-entrypoint.sh redis-server --requirepass $REDIS_PASSWORD --save 60 1 --maxmemory 128mb --maxmemory-policy volatile-lru --maxmemory-samples 5 --dir $RAILWAY_VOLUME_MOUNT_PATH\"" };
  Redis.networking = { privateNetworkEndpoint: "redis" };
  const postgresVolume = volume("postgres-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "sfo", sizeMB: 500 });
  const redisVolume = volume("redis-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "sfo", sizeMB: 500 });
  const web = service("web", {
    source: github("rajawali50121-cpu/gasterus-v3", { branch: "master", checkSuites: true }),
    build: { builder: "DOCKERFILE", dockerfilePath: "deploy/Dockerfile" },
    preDeploy: "node deploy/predeploy.js",
    healthcheck: "/healthz",
    healthcheckTimeout: 300,
    replicas: { "sfo": 1 },
        env: { ADMIN_PASSWORD: preserve(), ADMIN_PROXY_SECRET: preserve(), API_KEY_PEPPER: preserve(), API_SPORTS_BASE_URL: preserve(), API_SPORTS_DAILY_QUOTA: preserve(), API_SPORTS_DAYS_AHEAD: preserve(), API_SPORTS_ENABLED: preserve(), API_SPORTS_KEY: preserve(), API_SPORTS_LIVE_REFRESH_SECONDS: preserve(), API_SPORTS_ODDS_PAGES: preserve(), API_SPORTS_PREMATCH_REFRESH_SECONDS: preserve(), APP_URL: preserve(), CORS_ORIGIN: preserve(), CORE_HEAP_MB: preserve(), DATABASE_URL: preserve(), FEED_WORKER_ENABLED: preserve(), FEED_WORKER_HEAP_MB: preserve(), FOOTBALLDATA_IO_BASE_URL: preserve(), FOOTBALLDATA_IO_ENABLED: preserve(), FOOTBALLDATA_IO_KEY: preserve(), FOOTBALLDATA_IO_REFRESH_SECONDS: preserve(), FOOTBALLDATA_IO_UPCOMING_LIMIT: preserve(), FRONTEND_RESET_URL: preserve(), GATEWAY_HEAP_MB: preserve(), JWT_SECRET: preserve(), MEMBER_HEAP_MB: preserve(), MEMBER_PROXY_SECRET: preserve(), MFA_ENCRYPTION_KEY_BASE64: preserve(), MY_API_TOKEN: preserve(), NODE_ENV: preserve(), OPS_INTERNAL_SECRET: preserve(), PUBLIC_MARKET_DERIVED_MARKETS_ENABLED: preserve(), REDIS_URL: preserve(), RESEND_API_KEY: preserve(), RESEND_FROM_EMAIL: preserve(), RUN_STARTUP_MIGRATIONS: preserve(), SESSION_HMAC_KEY: preserve(), SHARP_API_BASE_URL: preserve(), SHARP_API_ENABLED: preserve(), SHARP_API_KEY: preserve(), SHARP_API_MARKETS: preserve(), SHARP_API_MAX_PAGES: preserve(), SHARP_API_PAGE_SIZE: preserve(), SHARP_API_REFRESH_SECONDS: preserve(), SHARP_API_SPORT: preserve(), SPORTS_SOURCE_BACKGROUND_POLL_ENABLED: preserve(), SPORTMONKS_API_KEY: preserve(), THE_ODDS_API_BASE_URL: preserve(), THE_ODDS_API_ENABLED: preserve(), THE_ODDS_API_EVENT_MARKETS_ENABLED: preserve(), THE_ODDS_API_EVENT_MARKETS: preserve(), THE_ODDS_API_KEY: preserve(), THE_ODDS_API_MARKETS: preserve(), THE_ODDS_API_MAX_TOTAL_EVENTS: preserve(), THE_ODDS_API_REGIONS: preserve(), THE_ODDS_API_SPORT_KEYS: preserve(), THE_ODDS_API_REFRESH_SECONDS: preserve(), WORKER_HEAP_MB: preserve() },
  });

  return project("gasterus-v3", {
    resources: [Postgres, web, Redis, postgresVolume, redisVolume],
  });
});
