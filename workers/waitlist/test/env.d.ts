declare namespace Cloudflare {
  interface Env {
    TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
  }
}

declare module "cloudflare:workers" {
  interface ProvidedEnv extends Env {}
}
