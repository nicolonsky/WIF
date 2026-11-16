import * as core from '@actions/core';

export const CLIENT_ASSERTION_TYPE = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer';

/**
 * Decode the (unverified) payload of a JWT. Used for debug logging only.
 * @param {string} token
 * @returns {Record<string, unknown> | undefined}
 */
export function decodeJwtPayload(token) {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  } catch {
    return undefined;
  }
}

/**
 * Exchange a GitHub OIDC token for a Microsoft Entra ID access token using the
 * OAuth 2.0 client credentials flow with a federated client assertion.
 * https://learn.microsoft.com/entra/identity-platform/v2-oauth2-client-creds-grant-flow#third-case-access-token-request-with-a-federated-credential
 *
 * @param {object} params
 * @param {string} params.tenantId
 * @param {string} params.clientId
 * @param {string} params.scope
 * @param {string} params.assertion GitHub OIDC token
 * @param {string} [params.authorityHost]
 * @param {typeof fetch} [params.fetchImpl]
 * @returns {Promise<{ access_token: string, expires_in?: number, token_type?: string }>}
 */
export async function exchangeToken({
  tenantId,
  clientId,
  scope,
  assertion,
  authorityHost = 'https://login.microsoftonline.com',
  fetchImpl = fetch,
}) {
  const endpoint = new URL(
    `/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
    authorityHost,
  );

  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      client_id: clientId,
      scope,
      grant_type: 'client_credentials',
      client_assertion_type: CLIENT_ASSERTION_TYPE,
      client_assertion: assertion,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = undefined;
  }

  if (!response.ok || !body?.access_token) {
    const detail = body?.error_description ?? body?.error ?? (text || response.statusText);
    throw new Error(`Token request failed (HTTP ${response.status}): ${detail}`);
  }

  return body;
}

/**
 * Action entrypoint. Dependencies are injectable for testing.
 * @param {{ core?: typeof core, fetchImpl?: typeof fetch }} [deps]
 */
export async function run({ core: c = core, fetchImpl = fetch } = {}) {
  try {
    const tenantId = c.getInput('tenant_id', { required: true });
    const clientId = c.getInput('client_id', { required: true });
    const audience = c.getInput('audience') || 'api://AzureADTokenExchange';
    const scope = c.getInput('scope') || 'https://graph.microsoft.com/.default';
    const authorityHost = c.getInput('authority_host') || 'https://login.microsoftonline.com';

    let assertion;
    try {
      assertion = await c.getIDToken(audience);
    } catch (error) {
      throw new Error(
        `Failed to acquire GitHub OIDC token. Ensure the job has 'permissions: id-token: write'. ${error.message}`,
      );
    }
    c.debug(`Acquired GitHub OIDC token with claims: ${JSON.stringify(decodeJwtPayload(assertion))}`);

    const result = await exchangeToken({
      tenantId,
      clientId,
      scope,
      assertion,
      authorityHost,
      fetchImpl,
    });

    c.setSecret(result.access_token);
    c.setOutput('access_token', result.access_token);
    if (result.expires_in !== undefined) c.setOutput('expires_in', String(result.expires_in));
    c.exportVariable('ACCESS_TOKEN', result.access_token);

    const claims = decodeJwtPayload(result.access_token);
    if (claims) {
      c.debug(`Access token claims: ${JSON.stringify({ aud: claims.aud, roles: claims.roles, exp: claims.exp })}`);
    }
    c.info('Successfully acquired Microsoft Entra ID access token.');
  } catch (error) {
    c.setFailed(error instanceof Error ? error.message : String(error));
  }
}
