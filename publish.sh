#!/bin/bash
# Publishes this version to npm and then lists it on the official MCP Registry.
# Run `npm login` first (it opens a browser). Then: bash publish.sh
# The registry step shows a short code to enter at github.com/login/device.
set -e
cd "$(dirname "$0")"
npm whoami > /dev/null || { echo "Run 'npm login' first."; exit 1; }
VERSION=$(node -p "require('./package.json').version")
if npm view "@delv-tools/mcp@$VERSION" version > /dev/null 2>&1; then
  echo "npm already has $VERSION."
else
  npm publish --access public
fi
command -v mcp-publisher > /dev/null || brew install mcp-publisher
mcp-publisher login github
mcp-publisher publish
echo "Listed. Check: https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.DirtyReal/delv-mcp"
