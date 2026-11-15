#!/bin/bash
# build the game from this tree: LIB=<library folder> (default spotlib-v6), VER=<version label>, PREV=1 for the preview build
cd "$(dirname "$0")/.."
EXTRA=(); [ -n "${PREV:-}" ] && EXTRA=(LAMMA_PREVIEW=1)
env LAMMA_SPOTLIB=${LIB:-spotlib-v6} LAMMA_AKML_BANK=data/akml.candidate.json LAMMA_VERSION=${VER:-v5.0-dev} "${EXTRA[@]}" python3 build.py
