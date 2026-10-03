declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    ADMIN_SETUP_TOKEN?: string;
    GOOGLE_WRITE_URL?: string;
    GOOGLE_WRITE_SECRET?: string;
  }
}
