#!/bin/sh

set -e

cd src
zip -r ../tab-link-exporter.xpi . \
  -x "*.DS_Store" -x "__MACOSX/*" -x ".git/*" -x "node_modules/*"