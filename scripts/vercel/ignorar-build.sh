#!/usr/bin/env bash
# "Ignored Build Step" da Vercel (vercel.json → ignoreCommand). Saída 0 = a Vercel PULA o build; 1 = builda.
#
# Por quê (W7): depois de cada merge na main o build-apk.yml publica a release vN e faz o commit
# "chore: bump version to vN+1 [skip ci]" no package.json. A Vercel publicava esse commit também, e o site passava a mostrar
# a versão SEGUINTE (__APP_VERSION__ = package.json) — ex.: site v3.6 com o APK Latest em v3.5 (Configurações › Aplicativo e o
# rodapé do Perfil). Pulando o build do commit de bump, produção e staging ficam no deploy do merge, que tem a MESMA versão
# da release que o CI acabou de gerar. O commit de bump não muda nada além do package.json.
set -u
msg="${VERCEL_GIT_COMMIT_MESSAGE:-}"
if [ -z "$msg" ]; then
  msg="$(git log -1 --pretty=%s 2>/dev/null || true)"
fi
case "$msg" in
  "chore: bump version to v"*)
    echo "Commit de bump de versão do CI do APK (\"$msg\"): build pulado — o site fica com a versão da release."
    exit 0
    ;;
esac
echo "Build normal."
exit 1
