#!/usr/bin/env node
// Bumps version + versionCode, commits, tags, pushes.
// The tag push triggers .github/workflows/release.yml (EAS build → dApp Store submit).
// Usage: node scripts/release.js [patch|minor|major] "What's new in this version"
const fs = require('fs');
const cp = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const type = process.argv[2] || 'patch';
const notes = process.argv[3] || 'Bug fixes and improvements';

const appPath = path.join(root, 'app.json');
const pkgPath = path.join(root, 'package.json');
const app = JSON.parse(fs.readFileSync(appPath, 'utf8'));
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

const [maj, min, pat] = app.expo.version.split('.').map(Number);
const v =
  type === 'major' ? `${maj + 1}.0.0` :
  type === 'minor' ? `${maj}.${min + 1}.0` :
  `${maj}.${min}.${pat + 1}`;

app.expo.version = v;
pkg.version = v;
app.expo.android.versionCode += 1;
app.expo.ios.buildNumber = String(app.expo.android.versionCode);

fs.writeFileSync(appPath, JSON.stringify(app, null, 2) + '\n');
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

const run = (cmd) => cp.execSync(cmd, { cwd: root, stdio: 'inherit' });
run('git add app.json package.json');
run(`git commit -m "v${v}"`);
// annotated tag: its message becomes the dApp Store "what's new" text in CI
run(`git tag -a v${v} -m ${JSON.stringify(notes)}`);
run('git push origin main --tags');

console.log(`\nReleased v${v}. GitHub Actions is now building and submitting to the dApp Store.`);
