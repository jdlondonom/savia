declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    FILES: R2Bucket;
    SAVIA_EVENTS?: Queue;
    SAVIA_DEAD_LETTER?: Queue;
    CONVERSATION_COORDINATOR?: DurableObjectNamespace;
    SAVIA_ENVIRONMENT?: 'local' | 'staging' | 'production';
    SAVIA_REQUIRE_DEDICATED_TENANT_DATA?: string;
    SAVIA_ALLOW_RUNTIME_MIGRATIONS?: string;
    SAVIA_RELEASE?: string;
    LOCAL_AI_BASE_URL?: string;
    LOCAL_AI_MODEL?: string;
    LOCAL_AI_API_KEY?: string;
    APP_URL?: string;
    BETTER_AUTH_SECRET?: string;
    BETTER_AUTH_URL?: string;
    SAVIA_MASTER_KEY?: string;
    SAVIA_MASTER_KEYS_JSON?: string;
    SAVIA_ACTIVE_MASTER_KEY_ID?: string;
    SAVIA_BOOTSTRAP_TOKEN?: string;
    TURNSTILE_SECRET_KEY?: string;
    NEXT_PUBLIC_TURNSTILE_SITE_KEY?: string;
  }
}
