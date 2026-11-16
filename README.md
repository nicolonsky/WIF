# Entra ID Workload Identity Federation for GitHub Actions

[![CI](https://github.com/nicolonsky/WIF/actions/workflows/ci.yml/badge.svg)](https://github.com/nicolonsky/WIF/actions/workflows/ci.yml)

Get Microsoft Entra ID (formerly Azure AD) access tokens in GitHub Actions without storing any secrets. The action uses [workload identity federation](https://learn.microsoft.com/entra/workload-id/workload-identity-federation): GitHub issues a short-lived OIDC token for the workflow run, and Entra ID exchanges it for an access token for your app registration.

You can use the token with any Entra-protected API, such as Microsoft Graph, Azure Resource Manager, Defender or your own APIs. It works from any shell, including PowerShell, Bash and Python.

![WIF overview](https://learn.microsoft.com/entra/workload-id/media/workload-identity-federation/workflow.svg)

## Features

- No client secrets or certificates to store or rotate
- Access token is masked in workflow logs
- Available as a step output and as the `ACCESS_TOKEN` environment variable
- Works with any resource scope and with sovereign clouds
- Runs on Node.js 24 with one runtime dependency (`@actions/core`)

## Usage

```yaml
on: [push]

permissions:
  id-token: write   # required to request the GitHub OIDC token
  contents: read

jobs:
  graph:
    runs-on: ubuntu-latest
    steps:
      - name: Get Entra ID access token
        id: entra
        uses: nicolonsky/WIF@v2
        with:
          tenant_id: ${{ vars.ENTRA_TENANT_ID }}
          client_id: ${{ vars.ENTRA_CLIENT_ID }}

      - name: Call Microsoft Graph (PowerShell)
        shell: pwsh
        run: |
          Install-Module Microsoft.Graph.Authentication -Scope CurrentUser -Force
          Connect-MgGraph -AccessToken ($env:ACCESS_TOKEN | ConvertTo-SecureString -AsPlainText -Force) -NoWelcome
          Invoke-MgGraphRequest -Uri '/v1.0/organization' | Select-Object -ExpandProperty value

      - name: Call Microsoft Graph (curl)
        env:
          TOKEN: ${{ steps.entra.outputs.access_token }}
        run: curl -sf -H "Authorization: Bearer $TOKEN" https://graph.microsoft.com/v1.0/organization
```

The tenant and client IDs are identifiers, not secrets, so repository or organization **variables** are fine for them.

### Inputs

| Name             | Required | Default                                | Description                                                                 |
| ---------------- | -------- | -------------------------------------- | --------------------------------------------------------------------------- |
| `tenant_id`      | yes      |                                        | Entra ID tenant ID                                                          |
| `client_id`      | yes      |                                        | Application (client) ID of the app registration or user-assigned managed identity |
| `scope`          | no       | `https://graph.microsoft.com/.default` | Scope to request, in the form `<resource>/.default`                         |
| `audience`       | no       | `api://AzureADTokenExchange`           | Audience of the GitHub OIDC token. Must match the federated credential.     |
| `authority_host` | no       | `https://login.microsoftonline.com`    | Authority host for sovereign clouds, e.g. `https://login.microsoftonline.us` |

### Outputs

| Name           | Description                                         |
| -------------- | --------------------------------------------------- |
| `access_token` | Access token (JWT), masked in logs                  |
| `expires_in`   | Token lifetime in seconds                           |

The token is also exported as the `ACCESS_TOKEN` environment variable for all later steps in the job.

### Other resources

Set `scope` to request a token for a different API:

```yaml
- uses: nicolonsky/WIF@v2
  with:
    tenant_id: ${{ vars.ENTRA_TENANT_ID }}
    client_id: ${{ vars.ENTRA_CLIENT_ID }}
    scope: https://management.azure.com/.default   # Azure Resource Manager
```

## Entra ID setup

1. **Register an application.** In the [Entra admin center](https://entra.microsoft.com), go to **App registrations** > **New registration**. A user-assigned managed identity also works.
2. **Grant API permissions.** Add the **application** permissions you need, for example Microsoft Graph `Organization.Read.All`, and click **Grant admin consent**.
3. **Add a federated credential.** Go to **Certificates & secrets** > **Federated credentials** > **Add credential**, then choose the **GitHub Actions deploying Azure resources** scenario. Enter your organization, repository and entity type (branch, environment, tag or pull request). This sets the subject claim, for example:
   - `repo:<org>/<repo>:ref:refs/heads/main`
   - `repo:<org>/<repo>:environment:production`

   Keep the issuer `https://token.actions.githubusercontent.com` and the audience `api://AzureADTokenExchange`.
4. **Copy the IDs.** Copy the **Directory (tenant) ID** and **Application (client) ID** from the app's **Overview** page into your workflow inputs.

Using the Azure CLI instead:

```bash
az ad app federated-credential create --id <app-object-id> --parameters '{
  "name": "github-main",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:<org>/<repo>:ref:refs/heads/main",
  "audiences": ["api://AzureADTokenExchange"]
}'
```

### Security recommendations

- Scope federated credentials narrowly. Prefer GitHub **environments** with protection rules over broad branch subjects.
- Grant the app only the permissions it needs.
- Grant `id-token: write` only to the jobs that need it.
- Pin the action to a release tag or commit SHA.

## Troubleshooting

| Error                                                | Cause / fix                                                                                         |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `Unable to get ACTIONS_ID_TOKEN_REQUEST_URL`         | The job is missing `permissions: id-token: write`.                                                   |
| `AADSTS70021: No matching federated identity record` | The subject or audience doesn't match the federated credential. Turn on debug logging (`ACTIONS_STEP_DEBUG=true`) to see the token claims. |
| `AADSTS700016: Application ... was not found`        | Wrong `client_id` or `tenant_id`.                                                                    |
| `403` from the API                                   | The permission is missing or admin consent hasn't been granted.                                      |

## Development

You need Node.js 24 or later.

```bash
npm ci
npm test        # unit tests (node:test)
npm run build   # bundle to dist/ with @vercel/ncc
```

The bundled `dist/` folder must be committed. CI fails if it is out of date.

## Resources

- [Workload identity federation](https://learn.microsoft.com/entra/workload-id/workload-identity-federation)
- [Client credentials flow with a federated credential](https://learn.microsoft.com/entra/identity-platform/v2-oauth2-client-creds-grant-flow#third-case-access-token-request-with-a-federated-credential)
- [GitHub Actions OIDC hardening](https://docs.github.com/actions/security-for-github-actions/security-hardening-your-deployments/about-security-hardening-with-openid-connect)
