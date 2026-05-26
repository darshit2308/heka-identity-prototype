/**
 * Patches @hiero-ledger/sdk to expose ./lib/* in its exports map.
 *
 * Why: @hiero-did-sdk/hcs does a deep import of @hiero-ledger/sdk/lib/client/NodeClient
 * which is not in the SDK's exports map. Node.js 23+ enforces exports strictly, causing
 * ERR_PACKAGE_PATH_NOT_EXPORTED. This script adds "./lib/*": "./lib/*" to fix it.
 *
 * This runs automatically via the postinstall npm hook.
 */
const fs = require('fs');
const path = require('path');

const pkgPath = path.join(__dirname, '..', 'node_modules', '@hiero-ledger', 'sdk', 'package.json');

if (!fs.existsSync(pkgPath)) {
  console.log('patch-sdk-exports: @hiero-ledger/sdk not found, skipping.');
  process.exit(0);
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

if (pkg.exports && !pkg.exports['./lib/*']) {
  pkg.exports = { './lib/*': './lib/*', ...pkg.exports };
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
  console.log('patch-sdk-exports: Added ./lib/* to @hiero-ledger/sdk exports map.');
} else {
  console.log('patch-sdk-exports: Already patched or no exports map found.');
}
