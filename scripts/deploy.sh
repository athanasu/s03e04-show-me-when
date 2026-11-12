#!/bin/sh
# Builds dist/ from the committed tree and publishes it as the gh-pages branch (GitHub Pages serves that branch).
set -eu
sha=$(node scripts/build.mjs)
touch dist/.nojekyll
tmp=$(mktemp -d)
cp -R dist/. "$tmp"/
# keep recordings that are already published
git fetch -q origin gh-pages 2>/dev/null && git archive FETCH_HEAD recordings 2>/dev/null | tar -x -C "$tmp" || true
[ -d recordings ] && mkdir -p "$tmp/recordings" && cp -R recordings/. "$tmp/recordings"/ || true
cd "$tmp"
git init -q -b gh-pages
git add -A
git -c user.name="$(git -C "$OLDPWD" config user.name)" -c user.email="$(git -C "$OLDPWD" config user.email)" commit -q -m "Deploy $sha"
git push -q -f "$(git -C "$OLDPWD" remote get-url origin)" gh-pages
echo "deployed $sha"
