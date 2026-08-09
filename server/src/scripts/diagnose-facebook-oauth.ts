/**
 * Facebook OAuth — configuration diagnosis.
 *
 *   npm run diagnose:facebook        (from server/)
 *
 * Prints the exact authorization URL this backend generates, checks the app
 * credentials against Meta, and reports which login dialog Meta will actually
 * serve. Written because the failure it exists to catch — a business-type app
 * invoked with `scope` and no `config_id` — is answered by Meta with a bare
 * HTTP 500 and no error body, which is undiagnosable from the application side.
 *
 * ─── What this never prints ──────────────────────────────────────────────────
 *
 * The app secret, any access token, any authorization code, and any OAuth
 * state. The secret is *used* — it is half of the app access token, which is
 * the only way to ask Meta whether the credential pair is real — but it is
 * scrubbed from every line of output, including Meta's own error bodies.
 *
 * The App ID is masked by default too. It is not a secret (it travels in every
 * authorization URL and is visible to anyone who opens the consent screen), but
 * this output is the kind of thing that gets pasted into a chat window, so the
 * default is quiet. Pass `--show-app-id` when you need to compare it against
 * the dashboard.
 */
import { facebookConfig } from '../providers/meta/facebook/config';
import { buildAuthorizationUrl } from '../providers/meta/facebook/oauth';
import { instagramConfig } from '../providers/meta/instagram/config';

const SHOW_APP_ID = process.argv.includes('--show-app-id');

let problems = 0;
let warnings = 0;

function ok(message: string) {
  console.log(`  OK    ${message}`);
}
function warn(message: string) {
  warnings++;
  console.log(`  WARN  ${message}`);
}
function fail(message: string) {
  problems++;
  console.log(`  FAIL  ${message}`);
}

/** Never let the secret reach stdout, even inside a Meta error body. */
function scrub(text: string): string {
  return facebookConfig.appSecret
    ? text.split(facebookConfig.appSecret).join('[APP_SECRET]')
    : text;
}

function maskId(value: string): string {
  if (!value) return '(EMPTY)';
  if (SHOW_APP_ID) return value;
  return value.length <= 8
    ? `(${value.length} chars)`
    : `${value.slice(0, 4)}…${value.slice(-3)} (${value.length} digits)`;
}

async function main() {
  console.log('\nFacebook OAuth — configuration diagnosis\n');

  // ─── 1. Credentials as the backend loaded them ─────────────────────────────
  console.log('1. Credentials');

  if (!facebookConfig.appId) fail('FACEBOOK_APP_ID is empty');
  else if (!/^\d+$/.test(facebookConfig.appId))
    fail(`FACEBOOK_APP_ID is not numeric — looks like a placeholder`);
  else ok(`FACEBOOK_APP_ID  ${maskId(facebookConfig.appId)}`);

  if (!facebookConfig.appSecret) fail('FACEBOOK_APP_SECRET is empty');
  else if (!/^[0-9a-f]{32}$/i.test(facebookConfig.appSecret))
    warn('FACEBOOK_APP_SECRET is not a 32-character hex string — Meta secrets are');
  else ok('FACEBOOK_APP_SECRET  (set, 32-char hex, value never printed)');

  // The single most expensive mistake available here, and it typechecks fine.
  if (
    facebookConfig.appId &&
    facebookConfig.appId === instagramConfig.appId
  ) {
    fail(
      'FACEBOOK_APP_ID equals INSTAGRAM_APP_ID. Facebook Pages needs the *Meta* ' +
        'App ID (Settings → Basic); the Instagram App ID belongs to the ' +
        'Instagram Login model and produces a dialog that fails with no useful error.',
    );
  } else if (facebookConfig.appId) {
    ok('FACEBOOK_APP_ID differs from INSTAGRAM_APP_ID, as it must');
  }

  // ─── 2. Redirect URI ───────────────────────────────────────────────────────
  console.log('\n2. Redirect URI');
  console.log(`        ${JSON.stringify(facebookConfig.redirectUri)}`);

  if (!facebookConfig.redirectUri) {
    fail('FACEBOOK_REDIRECT_URI is empty');
  } else {
    let parsed: URL | null = null;
    try {
      parsed = new URL(facebookConfig.redirectUri);
    } catch {
      fail('FACEBOOK_REDIRECT_URI is not a valid URL');
    }

    if (parsed) {
      if (!facebookConfig.redirectUri.endsWith('/auth/facebook/callback')) {
        warn('does not end in /auth/facebook/callback — is this the route we mounted?');
      } else {
        ok('path matches the mounted callback route');
      }

      if (parsed.protocol === 'http:') {
        // "Enforce HTTPS" is on by default for every app created since March
        // 2018 and cannot be turned off. Meta has been observed rewriting an
        // http redirect to https in the dialog's own cancel_url, which would
        // send the callback to a URL this server does not serve.
        warn(
          `http:// redirect URI. Facebook enforces HTTPS on OAuth redirects and may ` +
            `reject or silently upgrade this to https://${parsed.host}${parsed.pathname}. ` +
            `If the dialog completes but the callback never arrives, this is why — ` +
            `use an HTTPS tunnel (ngrok, cloudflared) or a deployed HTTPS backend.`,
        );
      } else {
        ok('https — satisfies Facebook’s Enforce HTTPS setting');
      }

      if (parsed.search || parsed.hash) {
        fail('redirect URI carries a query string or fragment; Strict Mode rejects it');
      }
    }
  }

  // ─── 3. Scopes ─────────────────────────────────────────────────────────────
  console.log('\n3. Permissions requested');
  console.log(`        parsed: ${JSON.stringify(facebookConfig.scopes)}`);
  console.log(`        wire:   ${facebookConfig.scopeString}`);

  const expected = [
    'pages_show_list',
    'pages_read_engagement',
    'pages_manage_posts',
  ];
  const extras = facebookConfig.scopes.filter(
    (scope) => !expected.includes(scope),
  );
  if (extras.length > 0) fail(`unexpected scopes requested: ${extras.join(', ')}`);
  else if (facebookConfig.scopes.length === 0)
    fail('no scopes parsed — FACEBOOK_SCOPES override may be malformed');
  else ok('only the three permissions Page publishing needs');

  // ─── 4. Which dialog Meta will serve ───────────────────────────────────────
  console.log('\n4. Login product');

  if (facebookConfig.configId) {
    ok(`config_id is set — invoking Facebook Login for Business`);
    console.log(
      '        Permissions come from the dashboard configuration, not from `scope`.',
    );
  } else {
    console.log('        config_id is NOT set — invoking consumer Facebook Login (`scope`).');
  }

  // ─── 5. The URL itself ─────────────────────────────────────────────────────
  console.log('\n5. Generated authorization URL');

  const url = new URL(buildAuthorizationUrl('EXAMPLE-STATE-NOT-A-REAL-ONE'));
  console.log(`        ${url.origin}${url.pathname}`);
  for (const [key, value] of url.searchParams) {
    console.log(
      `          ${key.padEnd(31)} ${key === 'client_id' ? maskId(value) : value}`,
    );
  }

  if (url.searchParams.has('config_id') && url.searchParams.has('scope')) {
    fail('sending both config_id and scope — Meta recommends against it');
  }
  if (
    url.searchParams.has('config_id') &&
    url.searchParams.get('override_default_response_type') !== 'true'
  ) {
    fail(
      'config_id without override_default_response_type=true — the business ' +
        'dialog will return a token in the fragment, which a server flow cannot read',
    );
  }

  // ─── 6. Ask Meta ───────────────────────────────────────────────────────────
  console.log('\n6. Live checks against Meta');

  if (!facebookConfig.appId || !facebookConfig.appSecret) {
    warn('skipped — credentials incomplete');
  } else {
    // The app access token is `{app-id}|{app-secret}`. Its only use here is to
    // read the app's own public node, which proves the pair is real.
    const appToken = `${facebookConfig.appId}|${facebookConfig.appSecret}`;
    try {
      const node = new URL(
        `https://graph.facebook.com/${facebookConfig.apiVersion}/${facebookConfig.appId}`,
      );
      node.searchParams.set('fields', 'id,name');
      node.searchParams.set('access_token', appToken);

      const response = await fetch(node);
      const body = scrub(await response.text());

      if (response.ok) {
        const app = JSON.parse(body) as { name?: string };
        ok(`app id + secret are a valid pair (app: ${app.name ?? 'unnamed'})`);
      } else {
        fail(`Meta rejected the app credentials: ${body.slice(0, 200)}`);
      }
    } catch (error) {
      warn(
        `could not reach Meta: ${scrub(
          error instanceof Error ? error.message : String(error),
        )}`,
      );
    }

    // Ask Meta, while logged out, whether *these permissions* invoke the
    // business dialog. Requesting them via `scope` is what flips
    // `is_business_login` to 1 — it is a property of what is being asked for,
    // not of the app — and the business dialog needs a config_id to have
    // anything to render.
    //
    // Deliberately probed with an explicit scope URL rather than with whatever
    // buildAuthorizationUrl currently produces: once config_id is configured
    // the shipped URL no longer carries a scope, so it can no longer answer
    // the question "do these permissions need a configuration?".
    try {
      const probe = new URL(
        `https://www.facebook.com/${facebookConfig.apiVersion}/dialog/oauth`,
      );
      probe.searchParams.set('client_id', facebookConfig.appId);
      probe.searchParams.set('redirect_uri', facebookConfig.redirectUri);
      probe.searchParams.set('response_type', 'code');
      probe.searchParams.set('scope', facebookConfig.scopeString);
      probe.searchParams.set('state', 'DIAGNOSTIC-PROBE');

      const response = await fetch(probe, { redirect: 'manual' });
      const location = response.headers.get('location');

      if (!location) {
        warn(`dialog answered ${response.status} with no redirect — inconclusive`);
      } else {
        const login = new URL(location);
        const needsBusinessDialog =
          login.searchParams.get('is_business_login') === '1';

        console.log(
          `        these scopes invoke: ${
            needsBusinessDialog
              ? 'Facebook Login for Business (is_business_login=1)'
              : 'consumer Facebook Login (is_business_login=0)'
          }`,
        );

        if (needsBusinessDialog && !facebookConfig.configId) {
          fail(
            'These permissions invoke the Facebook Login for Business dialog, ' +
              'but no config_id is set. That dialog has no permission set to ' +
              'render, and Meta answers "Sorry, something went wrong" / HTTP 500 ' +
              'with no error body. Create a configuration under Facebook Login ' +
              'for Business → Configurations, then set FACEBOOK_CONFIG_ID.',
          );
        } else if (needsBusinessDialog) {
          ok('business dialog required, and a config_id is set');
          // Worth stating: a bogus config id also reports 0 on this probe, so
          // nothing here proves the id is real.
          console.log(
            '        (Meta only validates the config id after login — this ' +
              'check cannot confirm it exists.)',
          );
        } else {
          ok('these permissions do not require a business login configuration');
        }

        // Meta echoes the redirect back in cancel_url. If what comes back is
        // not what we sent, the callback will not land where we are listening.
        const cancelUrl = login.searchParams.get('cancel_url');
        if (cancelUrl) {
          const echoed = new URL(cancelUrl);
          const sent = new URL(facebookConfig.redirectUri);
          if (echoed.origin !== sent.origin) {
            fail(
              `Meta rewrote the redirect origin: sent ${sent.origin}, it echoed ` +
                `${echoed.origin}. The callback will not reach this server.`,
            );
          } else {
            ok('Meta echoed our redirect URI unchanged');
          }
        }
      }
    } catch (error) {
      warn(
        `could not probe the dialog: ${scrub(
          error instanceof Error ? error.message : String(error),
        )}`,
      );
    }
  }

  console.log(
    `\n${problems} problem${problems === 1 ? '' : 's'}, ${warnings} warning${
      warnings === 1 ? '' : 's'
    }\n`,
  );
}

main()
  .catch((error) => {
    console.error('\nDiagnosis failed:', scrub(String(error)));
    problems++;
  })
  .finally(() => process.exit(problems > 0 ? 1 : 0));
