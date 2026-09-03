#!/bin/sh
# Build Windows binaries from Omarchy. Needs only Go.
set -e
cd "$(dirname "$0")"
mkdir -p dist
GOOS=windows GOARCH=amd64 go build -o dist/t-notes.exe .
cp dist/t-notes.exe dist/t-notes-setup.exe
ls -la dist/
