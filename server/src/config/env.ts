import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const env = {
  PORT: process.env.PORT || 5000,
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  JWT_SECRET: process.env.JWT_SECRET || '',
  DATABASE_URL: process.env.DATABASE_URL || '',
  // Where OAuth callbacks send the browser when the dance finishes. Kept in
  // the environment so a deployed backend redirects to the deployed SPA.
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
  LINKEDIN_CLIENT_ID: process.env.LINKEDIN_CLIENT_ID || '',
  LINKEDIN_CLIENT_SECRET: process.env.LINKEDIN_CLIENT_SECRET || '',
  LINKEDIN_REDIRECT_URI: process.env.LINKEDIN_REDIRECT_URI || '',
  // The versioned REST surface LinkedIn's publishing API lives on, YYYYMM.
  //
  // In the environment because it *expires*: LinkedIn supports each monthly
  // version for a minimum of one year and then sunsets it, at which point
  // every publish starts failing with a deprecated-version error. Bumping a
  // deployed backend must not require a code change and a redeploy.
  LINKEDIN_API_VERSION: process.env.LINKEDIN_API_VERSION || '202607',

  // ── Meta / Instagram ───────────────────────────────────────────────────────
  //
  // These are the **Instagram** App ID and Secret from the Meta App Dashboard,
  // not the Meta app's own App ID and Secret. They are different values, and
  // FlowPost uses the "Instagram API with Instagram Login" model, which is the
  // one authenticated by the Instagram pair. Using the Meta App ID here fails
  // with a generic authorization error that names nothing — see
  // `providers/meta/config.ts`.
  //
  // Named after the dashboard's own labels rather than following LinkedIn's
  // CLIENT_ID/CLIENT_SECRET convention, precisely so the value being pasted and
  // the field it comes from have the same name.
  INSTAGRAM_APP_ID: process.env.INSTAGRAM_APP_ID || '',
  INSTAGRAM_APP_SECRET: process.env.INSTAGRAM_APP_SECRET || '',
  INSTAGRAM_REDIRECT_URI: process.env.INSTAGRAM_REDIRECT_URI || '',
  // Shared by every Meta surface (Instagram now, Facebook Pages and Threads
  // later). In the environment for the same reason LINKEDIN_API_VERSION is:
  // Meta sunsets each version after roughly two years, and bumping a deployed
  // backend must not require a redeploy.
  META_API_VERSION: process.env.META_API_VERSION || 'v25.0',

  // ── Meta / Facebook Pages ──────────────────────────────────────────────────
  //
  // These are the **Meta** App ID and App Secret, from the app's own
  // Settings → Basic page — *not* the Instagram pair above. Facebook Pages uses
  // the "Facebook Login" model, which is authenticated by the Meta credentials;
  // Instagram uses "Instagram Login", authenticated by the Instagram ones. The
  // two are different numbers on the same app, and swapping them produces a
  // consent screen that fails with a generic error naming nothing.
  //
  // Both surfaces live on the same Meta Developer App deliberately: one
  // consent brand, one Business Verification, one App Review queue.
  FACEBOOK_APP_ID: process.env.FACEBOOK_APP_ID || '',
  FACEBOOK_APP_SECRET: process.env.FACEBOOK_APP_SECRET || '',
  FACEBOOK_REDIRECT_URI: process.env.FACEBOOK_REDIRECT_URI || '',
  // The Business Login Configuration ID, from Facebook Login for Business →
  // Configurations in the App Dashboard.
  //
  // Required for **Business-type apps**, which is what this app is. Meta serves
  // those the *Facebook Login for Business* dialog rather than the consumer
  // one, and that dialog takes its permission set from a dashboard
  // configuration — not from the `scope` parameter. Sending scope alone makes
  // it render nothing and answer HTTP 500 ("Sorry, something went wrong"),
  // which is what this variable exists to fix.
  //
  // Left empty on a consumer-type app, where `scope` is the correct mechanism
  // and a config_id would be rejected. See providers/meta/facebook/config.ts.
  FACEBOOK_CONFIG_ID: process.env.FACEBOOK_CONFIG_ID || '',
  // Optional override for the requested permissions, comma-delimited. Empty
  // means the provider's own publish-only default
  // (pages_show_list, pages_read_engagement, pages_manage_posts). In the
  // environment because App Review can approve a different set than we first
  // asked for, and narrowing what we request should not need a redeploy.
  // Unknown values are dropped rather than sent — see facebook/config.ts.
  FACEBOOK_SCOPES: process.env.FACEBOOK_SCOPES || '',

  // ── X (formerly Twitter) ───────────────────────────────────────────────────
  //
  // OAuth 2.0 Authorization Code with PKCE. The Client ID and Client Secret
  // come from the app's "User authentication settings" in the X Developer
  // Portal — *not* the API Key/Secret pair, which belong to the older OAuth 1.0a
  // surface and are rejected by the /2/oauth2/token endpoint.
  //
  // The secret is present because FlowPost registers X as a **confidential**
  // client, which is what makes refresh tokens usable from a backend. PKCE is
  // still mandatory on top of it — X requires code_challenge on every
  // authorization request regardless of client type.
  X_CLIENT_ID: process.env.X_CLIENT_ID || '',
  X_CLIENT_SECRET: process.env.X_CLIENT_SECRET || '',
  // Must match a Callback URI registered on the app, character for character.
  X_REDIRECT_URI: process.env.X_REDIRECT_URI || '',
  // The X API major version every call is pinned to (`/2/tweets`,
  // `/2/users/me`). In the environment for the same reason LINKEDIN_API_VERSION
  // and META_API_VERSION are: it is displayed on the Integrations card and
  // recorded per connection, and moving off v2 must not require a redeploy.
  X_API_VERSION: process.env.X_API_VERSION || '2',

  TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY || '',

  // ── Analytics permissions ──────────────────────────────────────────────────
  //
  // Which networks may ask for their read-insights scope, comma-delimited —
  // e.g. `instagram,linkedin`. Empty, the default, means none of them do and
  // FlowPost reads analytics from X only.
  //
  // In the environment rather than hardcoded because requesting a scope the app
  // is **not approved for** does not degrade, it fails the whole authorization:
  // LinkedIn answers `unauthorized_scope_error` and Meta rejects the login
  // outright. So an unapproved deployment that hardcoded these would lose
  // *publishing* too — every connect button broken, to enable a read.
  //
  // The flag therefore tracks App Review, not intent. Turn a network on here
  // once its permission is granted on the app; existing connections then pick
  // the scope up when a member reconnects, and `hasRequiredScopes` reports the
  // ones that have not as "reconnect to enable analytics" rather than as zero.
  ANALYTICS_SCOPES: process.env.ANALYTICS_SCOPES || '',

  // ── Best-time engine ───────────────────────────────────────────────────────
  //
  // How many measured publications a personalised posting time needs before it
  // is offered at all, and before it may be called a strong signal.
  //
  // In the environment because they are a *product* judgement about how much
  // evidence is enough, not a fact about the data — and because the honest
  // number is only learnable by watching real accounts. Lowering them makes the
  // engine talk sooner and less reliably; raising them makes it stay quiet
  // longer. Nothing in the codebase hardcodes either value: both flow into
  // `analytics/timing.ts` as `TimingGates`, whose defaults these override.
  BEST_TIME_MIN_EARLY: process.env.BEST_TIME_MIN_EARLY || '',
  BEST_TIME_MIN_STRONG: process.env.BEST_TIME_MIN_STRONG || '',

  // AI generation. The Gemini key is read here and used only by
  // `src/ai/providers/gemini.provider.ts` — it is never returned by an
  // endpoint and never reaches the browser.
  AI_PROVIDER: process.env.AI_PROVIDER || 'gemini',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  // The vendor-level default, reported by /api/ai/status. Workloads do NOT
  // fall back to it — each role below defaults to the model sized for that
  // job, and inheriting GEMINI_MODEL here would silently route caption
  // traffic to the expensive analysis model on any deployment that sets it.
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-3.1-pro-preview',

  // ── Model per workload ─────────────────────────────────────────────────────
  // Flash writes and looks, Pro Preview reasons, Flash-Lite does chores.
  // See `ai/providers/index.ts` for what routes where.
  //
  // 3.6 rather than a 3.1 flash because there is no such model: ListModels for
  // this API shows the 3.1 family ships pro-preview, flash-lite and image
  // variants only. gemini-3.6-flash is the newest stable flash it offers.
  GEMINI_CAPTION_MODEL: process.env.GEMINI_CAPTION_MODEL || 'gemini-3.6-flash',
  GEMINI_VISION_MODEL: process.env.GEMINI_VISION_MODEL || 'gemini-3.6-flash',
  GEMINI_MARKETING_MODEL: process.env.GEMINI_MARKETING_MODEL || 'gemini-3.1-pro-preview',
  GEMINI_LIGHT_MODEL: process.env.GEMINI_LIGHT_MODEL || 'gemini-3.1-flash-lite',
  GEMINI_IMAGE_MODEL: process.env.GEMINI_IMAGE_MODEL || 'imagen-3.0-generate-002',
  
  // Thinking depth for Gemini 3.x models, which cannot disable thinking and
  // reject thinkingBudget 0. "low" is their fastest level — right for caption
  // writing. Ignored by other models.
  GEMINI_THINKING_LEVEL: process.env.GEMINI_THINKING_LEVEL || 'low',

  // Thinking tokens for Gemini 2.5 models only — 3.x uses GEMINI_THINKING_LEVEL
  // instead. Default 0 — captions are a writing task, and the reasoning pass
  // triples latency for no gain. -1 lets the model decide. Ignored by models
  // that don't support it.
  GEMINI_THINKING_BUDGET: process.env.GEMINI_THINKING_BUDGET || '0',
};
