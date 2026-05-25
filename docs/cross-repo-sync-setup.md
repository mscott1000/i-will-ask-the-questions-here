# Cross-repo sync setup

## 1) Create the token
Create a **fine-grained PAT** with repository access to:
- `mscott1000/i-will-ask-the-questions-here`
- `mscott1000/Facebook-Scraper`
- `mscott1000/instaloader`
- `mscott1000/Scweet`

Permissions:
- Contents: Read and write
- Pull requests: Read and write
- Metadata: Read

## 2) Add repository secret in the main repo
Use either GitHub UI or CLI:

```bash
gh secret set CROSS_REPO_SYNC_TOKEN --repo mscott1000/i-will-ask-the-questions-here
```

That command will prompt you to paste the token securely.

## 3) Validate sync workflow
After secret is set:

```bash
gh workflow run sync-platform-repos.yml --repo mscott1000/i-will-ask-the-questions-here
```

Then inspect run logs:

```bash
gh run list --workflow sync-platform-repos.yml --repo mscott1000/i-will-ask-the-questions-here --limit 5
```
