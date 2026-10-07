// Imported first by selftest.ts, so it runs before any app module connects to a store.
// The tests write users, orders, payment locks and sync documents to whatever Redis is configured;
// with real credentials in the environment (e.g. after `source .env.local`) that is production data.

const vars = ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN"].filter((v) => process.env[v]);

if (vars.length) {
  console.error(
    `Refusing to run the self-test: ${vars.join(", ")} ${vars.length > 1 ? "are" : "is"} set, so it would write test data to that Redis.\n` +
      "Run it from a shell without those variables (npm test never loads .env.local by itself).",
  );
  process.exit(1);
}
