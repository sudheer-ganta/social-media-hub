import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

/**
 * The switch that decides whether an analytics scope is *asked for*.
 *
 * Worth its own tests because getting it wrong does not degrade analytics — it
 * breaks connecting. LinkedIn answers `unauthorized_scope_error` and refuses
 * the entire authorization when an app requests a product it is not approved
 * for, so a deployment that leaked one of these scopes into its consent screen
 * would lose publishing too.
 *
 * The module reads the environment once at import, which is what production
 * wants and what makes these tests reset the module registry per case.
 *
 * Run: cd server && npx vitest run src/providers/analytics-scopes.test.ts
 */

const ORIGINAL = process.env.ANALYTICS_SCOPES;

async function load(value: string | undefined) {
  vi.resetModules();
  if (value === undefined) delete process.env.ANALYTICS_SCOPES;
  else process.env.ANALYTICS_SCOPES = value;
  return import('./analytics-scopes');
}

beforeEach(() => {
  process.env.TOKEN_ENCRYPTION_KEY = 'test-secret-32-bytes-for-hmac-ok!!';
  process.env.DATABASE_URL = 'postgresql://test/test';
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.ANALYTICS_SCOPES;
  else process.env.ANALYTICS_SCOPES = ORIGINAL;
  vi.resetModules();
});

describe('analyticsScopeEnabled', () => {
  it('defaults to off for every network', async () => {
    // The default has to be off. An app that has not been through App Review
    // for these permissions must keep working, and "working" includes connect.
    const { analyticsScopeEnabled } = await load(undefined);

    expect(analyticsScopeEnabled('instagram')).toBe(false);
    expect(analyticsScopeEnabled('facebook')).toBe(false);
    expect(analyticsScopeEnabled('linkedin')).toBe(false);
  });

  it('enables only the networks named', async () => {
    const { analyticsScopeEnabled } = await load('instagram,linkedin');

    expect(analyticsScopeEnabled('instagram')).toBe(true);
    expect(analyticsScopeEnabled('linkedin')).toBe(true);
    // Not named, so not requested — approval is per network, not per app.
    expect(analyticsScopeEnabled('facebook')).toBe(false);
  });

  it('accepts spaces, mixed case and stray separators', async () => {
    const { analyticsScopeEnabled } = await load('  Instagram ,, FACEBOOK  ');

    expect(analyticsScopeEnabled('instagram')).toBe(true);
    expect(analyticsScopeEnabled('facebook')).toBe(true);
  });

  it('ignores a name that is not a network', async () => {
    // A typo must not silently enable something adjacent.
    const { analyticsScopeEnabled } = await load('instagran,tiktok');

    expect(analyticsScopeEnabled('instagram')).toBe(false);
    expect(analyticsScopeEnabled('facebook')).toBe(false);
  });

  it('never gates X, which needs no extra scope', async () => {
    // X's analytics run on `tweet.read` and `users.read`, requested since long
    // before analytics existed. It must not become switchable by accident.
    const { analyticsScopeEnabled } = await load(undefined);
    expect(analyticsScopeEnabled('x')).toBe(false);

    const enabled = await load('x');
    // Even named, this changes nothing: no scope builder consults it for X.
    expect(enabled.analyticsScopeEnabled('x')).toBe(true);
  });
});

describe('the scope lists that read it', () => {
  it('leaves the requested scopes untouched when the switch is off', async () => {
    vi.resetModules();
    delete process.env.ANALYTICS_SCOPES;

    const linkedin = await import('./linkedin/config');
    const instagram = await import('./meta/instagram/config');
    const facebook = await import('./meta/facebook/config');

    // Byte-for-byte what these deployments have always sent. A connect flow
    // that worked yesterday must work today.
    expect(linkedin.LINKEDIN_SCOPES).toEqual([
      'openid',
      'profile',
      'w_member_social',
    ]);
    expect(instagram.INSTAGRAM_SCOPES).toEqual([
      'instagram_business_basic',
      'instagram_business_content_publish',
    ]);
    expect(facebook.FACEBOOK_DEFAULT_SCOPES).toEqual([
      'pages_show_list',
      'pages_read_engagement',
      'pages_manage_posts',
    ]);
  });

  it('adds the analytics scope only to the networks switched on', async () => {
    vi.resetModules();
    process.env.ANALYTICS_SCOPES = 'linkedin,instagram,facebook';

    const linkedin = await import('./linkedin/config');
    const instagram = await import('./meta/instagram/config');
    const facebook = await import('./meta/facebook/config');

    expect(linkedin.LINKEDIN_SCOPES).toContain('r_member_postAnalytics');
    expect(instagram.INSTAGRAM_SCOPES).toContain(
      'instagram_business_manage_insights',
    );
    expect(facebook.FACEBOOK_DEFAULT_SCOPES).toContain('read_insights');
  });

  it('lets an approved deployment name read_insights in the Facebook override', async () => {
    // The override is filtered against a known-scope set. `read_insights` has
    // to be in that set or a deployment that has been approved for it would
    // have its own configuration silently dropped.
    vi.resetModules();
    delete process.env.ANALYTICS_SCOPES;
    process.env.FACEBOOK_SCOPES =
      'pages_show_list,pages_read_engagement,pages_manage_posts,read_insights';

    const facebook = await import('./meta/facebook/config');
    expect(facebook.FACEBOOK_SCOPES).toContain('read_insights');

    delete process.env.FACEBOOK_SCOPES;
  });
});
