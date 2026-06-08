#!/bin/sh
# Wrapper entrypoint that injects opencode.json into OPENCODE_CONFIG_CONTENT
export OPENCODE_CONFIG_CONTENT="$(cat /root/.config/opencode/opencode.json)"
exec opencode serve --hostname=0.0.0.0 --port=4096 "$@"
