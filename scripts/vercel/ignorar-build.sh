#!/usr/bin/env bash
# "Ignored Build Step" da Vercel (vercel.json → ignoreCommand). Saída 0 = a Vercel PULA o build; 1 = builda.
#
# Regra: o site só publica o commit que também gera o APK (a release) — assim a versão do site (__APP_VERSION__ =
# package.json) é sempre a da release Latest.
#
# 1) Commit de bump do CI (W7): depois de cada merge na main o build-apk.yml publica a release vN e faz o commit
#    "chore: bump version to vN+1 [skip ci]" no package.json. A Vercel publicava esse commit também, e o site passava a
#    mostrar a versão SEGUINTE — ex.: site v3.6 com o APK Latest em v3.5 (Configurações › Aplicativo e o rodapé do Perfil).
#    Pulando o build do commit de bump, produção e staging ficam no deploy do merge, que tem a MESMA versão da release.
# 2) Commit que o GitHub Actions não roda (W9): PR sem tela entra com "[skip actions]" (ou "[skip ci]", "[ci skip]",
#    "[no ci]", "[actions skip]") — não sai APK nem release. Como o package.json já está na versão seguinte (o bump do
#    merge anterior), publicar esse commit punha o site na versão seguinte com o APK na anterior: foi o PR #73 (só E2E),
#    que publicou o site "3.10" com a release em v3.9 e obrigou a republicar o deploy do 312b06f à mão. Pulando, o site
#    fica no deploy do último merge com APK. A marca vale no título ou no corpo da mensagem (o GitHub também olha os dois).
set -u
msg="${VERCEL_GIT_COMMIT_MESSAGE:-}"
if [ -z "$msg" ]; then
  msg="$(git log -1 --pretty=%B 2>/dev/null || true)"
fi
case "$msg" in
  "chore: bump version to v"*)
    echo "Commit de bump de versão do CI do APK (\"${msg%%$'\n'*}\"): build pulado — o site fica com a versão da release."
    exit 0
    ;;
esac
for marca in "[skip actions]" "[actions skip]" "[skip ci]" "[ci skip]" "[no ci]"; do
  case "$msg" in
    *"$marca"*)
      echo "Commit sem GitHub Actions (\"$marca\"): sem APK nem release — build pulado para o site seguir a versão da release."
      exit 0
      ;;
  esac
done
echo "Build normal."
exit 1
