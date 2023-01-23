# GitHub Action for Azure AD Workload Identity JWTs

This GitHub action acquires an access token (JWT) for an Azure AD Workload Identity that has configured GitHub as OIDC credential provider.
The access token can be used for any kind of API access or usage, like Microsoft Graph. The retrieved access token is stored as environment variable `ACCESS_TOKEN` within the GitHub Action workflow and can also be consumed from PowerShell.

![WIF Overview](https://learn.microsoft.com/en-us/azure/active-directory/develop/media/workload-identity-federation/workflow.svg)

## Usage

Tha action requires two mandatory inputs:

* Azure AD Tenant ID
* Azure AD App Registration Client ID

You can also pass the inputs via GitHub repository secrets to the GitHub action.

```yaml
 - name: Azure AD Workload Identity Federation
   uses: nicolonsky/WIF@v0.0.1
   with:
    tenant_id: '30204efd-acb7-41a7-9fe9-233cec0556c1'
    client_id: '960d282a-7d02-453e-a680-3b4330ed38a7'
```

Make sure to add the following permissions to your action:

```yaml
permissions:
  id-token: write
  contents: read
```

The  retrieved access token can be used like this:

```powershell
Install-Module -Name Microsoft.Graph.Authentication
Connect-MgGraph -AccessToken $env:ACCESS_TOKEN
Invoke-MgGraphRequest -Uri '/beta/organization' | Select-Object -ExpandProperty value
```

## Development

Building the action:

```bash
ncc build index.js -o dist
```

## Ressources

* <https://learn.microsoft.com/en-us/azure/active-directory/develop/workload-identity-federation>
* <https://learn.microsoft.com/en-us/azure/active-directory/develop/v2-oauth2-client-creds-grant-flow#third-case-access-token-request-with-a-federated-credential>
