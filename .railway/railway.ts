import { defineRailway, github, postgres, preserve, project, redis, service, volume } from "railway/iac";

export default defineRailway(() => {
  const Postgres = postgres("Postgres", { region: "sfo" });
  Postgres.networking = { privateNetworkEndpoint: "postgres" };
  const Redis = redis("Redis", { region: "sfo" });
  Redis.deploy = { startCommand: "/bin/sh -c \"rm -rf $RAILWAY_VOLUME_MOUNT_PATH/lost+found/ && exec docker-entrypoint.sh redis-server --requirepass $REDIS_PASSWORD --save 60 1 --dir $RAILWAY_VOLUME_MOUNT_PATH\"" };
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
    env: { ADMIN_PASSWORD: preserve(), ADMIN_PROXY_SECRET: preserve(), API_KEY_PEPPER: preserve(), API_SPORTS_ENABLED: preserve(), API_SPORTS_KEY: preserve(), APP_URL: preserve(), CORS_ORIGIN: preserve(), DATABASE_URL: preserve(), FRONTEND_RESET_URL: preserve(), JWT_SECRET: preserve(), MEMBER_PROXY_SECRET: preserve(), MFA_ENCRYPTION_KEY_BASE64: preserve(), MY_API_TOKEN: preserve(), NODE_ENV: preserve(), OPS_INTERNAL_SECRET: preserve(), REDIS_URL: preserve(), RESEND_API_KEY: preserve(), RESEND_FROM_EMAIL: preserve(), RUN_STARTUP_MIGRATIONS: preserve(), SESSION_HMAC_KEY: preserve(), SPORTMONKS_API_KEY: preserve() },
  });

  return project("gasterus-v3", {
    resources: [Postgres, web, Redis, postgresVolume, redisVolume],
  });
});
