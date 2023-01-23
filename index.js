const core = require('@actions/core');
const axios = require('axios');

function parseJwt(token) {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
}

try {
    const tenantId = core.getInput('tenant_id', { required: true });
    const clientId = core.getInput('client_id', { required: true });
    const audience = core.getInput('audience', { required: false });
    const scope = core.getInput('scope', { required: false });
    const tokenEndpoint = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`

    core.getIDToken(audience).then(token => {
        core.debug(`Acquired GitHub OIDC Token`)
        core.debug(parseJwt(token))
        // POST Request to the Azure AD Token Endpoint to exchange GitHub JWT
        // https://learn.microsoft.com/en-us/azure/active-directory/develop/v2-oauth2-client-creds-grant-flow
        axios.post(tokenEndpoint, {
            scope: scope,
            client_id: clientId,
            client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
            grant_type: 'client_credentials',
            client_assertion: token
        }, {
            headers: { 'content-type': 'application/x-www-form-urlencoded' }
        }).then(response => {
            core.info("Successfully acquired Azure AD access token!")
            core.setOutput("access_token", response.data['access_token']);
            core.exportVariable('ACCESS_TOKEN', response.data['access_token']);
            core.debug(parseJwt(response.data['access_token']))
        }).catch(({ response }) => {
            core.error(response.data)
            core.setFailed(`Failed to Acquire Azure AD JWT: ${error.message}`)
        })
    }).catch(error => {
        core.setFailed(`Failed to Acquire GitHub Action Token: ${error.message}`)
        core.error(error.message)
    })
} catch (error) {
    core.setFailed(error.message);
}