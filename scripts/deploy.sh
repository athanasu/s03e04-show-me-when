#!/bin/sh
# Builds dist/ from the committed tree and publishes it as the gh-pages branch (GitHub Pages serves that branch).
set -eu
sha=$(node scripts/build.mjs)
touch dist/.nojekyll
tmp=$(mktemp -d)
name=$(git log -1 --format=%an); email=$(git log -1 --format=%ae); origin=$(git remote get-url origin)
cp -R dist/. "$tmp"/
# keep recordings that are already published
git fetch -q origin gh-pages 2>/dev/null && git archive FETCH_HEAD recordings 2>/dev/null | tar -x -C "$tmp" || true
[ -d recordings ] && mkdir -p "$tmp/recordings" && cp recordings/*.webm "$tmp/recordings"/ || true
cd "$tmp"
git init -q -b gh-pages
git add -A
git -c user.name="$name" -c user.email="$email" commit -q -m "Deploy $sha"
git push -q -f "$origin" gh-pages
echo "deployed $sha"
