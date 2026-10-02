#!/usr/bin/env bash
# Executa uma prova: stdout (resultados) em .rfc-tmp/<nome>.out e stderr (logs do better-auth) em .rfc-tmp/<nome>.err
cd "$(dirname "$0")/.."
name="$1"; shift
node node_modules/tsx/dist/cli.mjs --tsconfig jsconfig.json ".rfc-tmp/$name.mjs" "$@" > ".rfc-tmp/${name%%-*}${SUFFIX:-}.out" 2> ".rfc-tmp/${name%%-*}${SUFFIX:-}.err"
echo "$name $* -> exit=$?  (stdout $(wc -c < ".rfc-tmp/${name%%-*}${SUFFIX:-}.out") bytes, stderr $(wc -c < ".rfc-tmp/${name%%-*}${SUFFIX:-}.err") bytes)"
