<!-- To surface this PR in the changelog add the label: changelog -->
<!-- If this PR is going in the changelog please make sure the title of the PR explains the feature in a user-centric way: -->
<!-- Bad: fix state bug in hooks -->
<!-- Good: Fix crash when switching from Query Builder -->

- [ ] I've run the test suite and linters and have no errors:
  ```sh
  npx --yes cspell@6.13.3 -c cspell.config.json "**/*.{ts,tsx,js,go,md,mdx,yml,yaml,json,scss,css}"
  golangci-lint run --timeout=5m
  ```
