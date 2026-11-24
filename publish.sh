#!/bin/bash
# Publishes this version to npm and then lists it on the official MCP Registry.
# Run `npm login` first (it opens a browser). Then: bash publish.sh
# The registry step shows a short code to enter at github.com/login/device.
#
# npm takes a minute or two to show a version it has just accepted, and the registry will
# not list a version that npm does not show yet. So this waits for npm before the registry
# step. It is safe to run again at any point: whatever is already done is skipped.
set -e
cd "$(dirname "$0")"
npm whoami > /dev/null || { echo "Run 'npm login' first."; exit 1; }
VERSION=$(node -p "require('./package.json').version")
on_npm() { npm view "@delv-tools/mcp@$VERSION" version > /dev/null 2>&1; }

if on_npm; then
  echo "npm already has $VERSION."
else
  # A second run inside that minute or two is refused by npm ("cannot publish over the
  # previously published versions"). That is not a failure: the wait below settles it.
  npm publish --access public || echo "That publish did not go through. Checking whether npm already has $VERSION."
fi

printf 'Waiting for npm to show %s' "$VERSION"
for _ in $(seq 1 36); do
  on_npm && break
  printf '.'
  sleep 5
done
echo
on_npm || { echo "npm still does not show $VERSION after three minutes. If the publish above failed, fix that and run this again."; exit 1; }

command -v mcp-publisher > /dev/null || brew install mcp-publisher
mcp-publisher login github
mcp-publisher publish
echo "Listed. Check: https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.DirtyReal/delv-mcp"
