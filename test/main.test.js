import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run, exchangeToken, decodeJwtPayload, CLIENT_ASSERTION_TYPE } from '../src/main.js';

const jwt = (payload) =>
  ['e30', Buffer.from(JSON.stringify(payload)).toString('base64url'), 'sig'].join('.');

function fakeCore(inputs = {}, { idToken = jwt({ sub: 'repo:o/r:ref:refs/heads/main' }), idTokenError } = {}) {
  const calls = { outputs: {}, env: {}, secrets: [], failed: undefined, audience: undefined };
  return {
    calls,
    getInput: (name, opts) => {
      const v = inputs[name] ?? '';
      if (opts?.required && !v) throw new Error(`Input required and not supplied: ${name}`);
      return v;
    },
    getIDToken: async (aud) => {
      calls.audience = aud;
      if (idTokenError) throw idTokenError;
      return idToken;
    },
    setSecret: (s) => calls.secrets.push(s),
    setOutput: (k, v) => (calls.outputs[k] = v),
    exportVariable: (k, v) => (calls.env[k] = v),
    setFailed: (m) => (calls.failed = m),
    debug: () => {},
    info: () => {},
  };
}

const jsonResponse = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('decodeJwtPayload handles valid and invalid tokens', () => {
  assert.deepEqual(decodeJwtPayload(jwt({ a: 1 })), { a: 1 });
  assert.equal(decodeJwtPayload('garbage'), undefined);
});

test('exchangeToken posts a form-encoded federated client assertion', async () => {
  let captured;
  const fetchImpl = async (url, init) => {
    captured = { url: String(url), init };
    return jsonResponse(200, { access_token: 'at', expires_in: 3599 });
  };
  const res = await exchangeToken({
    tenantId: 'tid',
    clientId: 'cid',
    scope: 'https://graph.microsoft.com/.default',
    assertion: 'gh-oidc',
    fetchImpl,
  });
  assert.equal(res.access_token, 'at');
  assert.equal(captured.url, 'https://login.microsoftonline.com/tid/oauth2/v2.0/token');
  assert.equal(captured.init.method, 'POST');
  const body = new URLSearchParams(captured.init.body.toString());
  assert.equal(body.get('client_id'), 'cid');
  assert.equal(body.get('grant_type'), 'client_credentials');
  assert.equal(body.get('client_assertion_type'), CLIENT_ASSERTION_TYPE);
  assert.equal(body.get('client_assertion'), 'gh-oidc');
});

test('exchangeToken encodes tenant id and honours authority host', async () => {
  let url;
  await exchangeToken({
    tenantId: '../evil',
    clientId: 'c',
    scope: 's',
    assertion: 'a',
    authorityHost: 'https://login.microsoftonline.us',
    fetchImpl: async (u) => ((url = String(u)), jsonResponse(200, { access_token: 'x' })),
  });
  assert.equal(url, 'https://login.microsoftonline.us/..%2Fevil/oauth2/v2.0/token');
});

test('exchangeToken surfaces Entra error descriptions', async () => {
  await assert.rejects(
    exchangeToken({
      tenantId: 't',
      clientId: 'c',
      scope: 's',
      assertion: 'a',
      fetchImpl: async () =>
        jsonResponse(400, { error: 'invalid_client', error_description: 'AADSTS70021: No matching federated identity record found' }),
    }),
    /HTTP 400.*AADSTS70021/,
  );
});

test('run sets masked outputs and env on success', async () => {
  const core = fakeCore({ tenant_id: 't', client_id: 'c' });
  await run({ core, fetchImpl: async () => jsonResponse(200, { access_token: 'secret-at', expires_in: 3599 }) });
  assert.equal(core.calls.failed, undefined);
  assert.equal(core.calls.audience, 'api://AzureADTokenExchange');
  assert.deepEqual(core.calls.secrets, ['secret-at']);
  assert.equal(core.calls.outputs.access_token, 'secret-at');
  assert.equal(core.calls.outputs.expires_in, '3599');
  assert.equal(core.calls.env.ACCESS_TOKEN, 'secret-at');
});

test('run fails on missing required input', async () => {
  const core = fakeCore({ client_id: 'c' });
  await run({ core, fetchImpl: async () => assert.fail('should not fetch') });
  assert.match(core.calls.failed, /tenant_id/);
});

test('run fails with a helpful message when OIDC token is unavailable', async () => {
  const core = fakeCore({ tenant_id: 't', client_id: 'c' }, { idTokenError: new Error('Unable to get ACTIONS_ID_TOKEN_REQUEST_URL') });
  await run({ core, fetchImpl: async () => assert.fail('should not fetch') });
  assert.match(core.calls.failed, /id-token: write/);
});

test('run fails when token exchange fails', async () => {
  const core = fakeCore({ tenant_id: 't', client_id: 'c' });
  await run({ core, fetchImpl: async () => new Response('Bad Gateway', { status: 502 }) });
  assert.match(core.calls.failed, /HTTP 502\): Bad Gateway/);
  assert.equal(core.calls.outputs.access_token, undefined);
});
