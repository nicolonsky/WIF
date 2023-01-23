# GitHub Action for Azure AD Workload Identity JWTs

This GitHub action acquires access tokens (JWTs) for federated Azure AD workload identities that have configured GitHub as Open ID Connect (OIDC) credential provider.

The access tokens can be used for any kind of API access or usage, like Microsoft Graph. The retrieved access token is stored as environment variable `ACCESS_TOKEN` within the GitHub Action workflow and can also be consumed from PowerShell.

![WIF Overview](https://learn.microsoft.com/en-us/azure/active-directory/develop/media/workload-identity-federation/workflow.svg)

## Usage

This action requires two mandatory inputs:

* Azure AD Tenant ID
* Azure AD App Registration Client ID

You can also pass the inputs via GitHub repository secrets to the GitHub action.
Make sure to add the `id-token` permissions to your GitHub action.

Example workflow:

```yaml
on: [push]

permissions:
  id-token: write
  contents: read

jobs:
  hello_world_job:
    runs-on: ubuntu-latest
    name: WIF Example
    steps:
      - name: Azure AD Workload Identity Federation
        uses: nicolonsky/WIF@v0.0.1
        with:
          tenant_id: '30204efd-acb7-41a7-9fe9-233cec0556c1'
          client_id: '504fd139-6825-4e25-ad7a-627f100ab466'
      - name: Do some Stuff
        run: |
          Install-Module -Name Microsoft.Graph.Authentication
          Connect-MgGraph -AccessToken $env:ACCESS_TOKEN
          Invoke-MgGraphRequest -Uri '/beta/organization' | Select-Object -ExpandProperty value
        shell: pwsh
```


### Azure AD setup 

- In Azure AD you need to create an app registration:
    - ![Screenshot 2023-01-23 at 13 49 57](https://user-images.githubusercontent.com/32899754/214046075-08a04967-05ec-41fb-a36b-7cd35b5df527.png)

- Add the desired permissions and do not forget to grant admin consent:
    - ![Screenshot 2023-01-23 at 13 50 50](https://user-images.githubusercontent.com/32899754/214046098-37372661-16d6-4404-8d5a-285a6fb03ffb.png)
    - ![Screenshot 2023-01-23 at 13 51 13](https://user-images.githubusercontent.com/32899754/214046292-f4bbb03e-fe91-46f3-8138-9da6ee700971.png)

- Add federated credentials:
    - ![Screenshot 2023-01-23 at 13 51 24](https://user-images.githubusercontent.com/32899754/214046387-51de4e6e-18cc-48b7-9702-6621488fc849.png)
- Specifiy your GitHub repository information
    - ![Screenshot 2023-01-23 at 13 52 18](https://user-images.githubusercontent.com/32899754/214046640-2e64c9a9-bb59-4be8-9b4d-e20cce989776.png)
- Copy your tenant and client id
    - ![Screenshot 2023-01-23 at 13 53 13](https://user-images.githubusercontent.com/32899754/214046751-350b766d-831a-49e5-b4d2-b4fb38ad4d09.png)

## Development

Building the action:

```bash
ncc build index.js -o dist
```

## Ressources

* <https://learn.microsoft.com/en-us/azure/active-directory/develop/workload-identity-federation>
* <https://learn.microsoft.com/en-us/azure/active-directory/develop/v2-oauth2-client-creds-grant-flow#third-case-access-token-request-with-a-federated-credential>
