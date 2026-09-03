#!/usr/bin/env python3
"""Empacota as imagens do catálogo de exercícios DENTRO do app ("vem junto com o arquivo").

  1. lê `public.tb_exercicios` (id, nome, imagem_url) e baixa cada GIF do Storage
  2. converte pra WebP animado com o `gif2webp` oficial (libwebp; sem perda por padrão —
     mesma imagem, ~35% menor; `--lossy 90` = modo mixed, um pouco menor)
  3. grava `public/exercicios/<uuid>-<v>.webp` (nome com a versão → cache imutável na Vercel;
     no APK vira arquivo local) e `src/lib/exerciciosManifest.json` = {uuid: {v, bytes}}
  4. com `--publicar`: sobe `<uuid>.webp` nos buckets `exercicios` e `exercicios-staging`
     (Cache-Control 1 ano) e troca `imagem_url` em public E staging pra `.webp?v=<v>`
     (os `.gif` ficam nos buckets — bundles antigos em cache continuam funcionando).
     Antes disso salva um backup das URLs antigas em /tmp/exercicios_urls_backup_<v>.json.

Uso:
  python3 scripts/exercicios_pack.py                       # só converte + manifest (Storage/banco intocados)
  python3 scripts/exercicios_pack.py --publicar            # converte + publica + atualiza URLs
  python3 scripts/exercicios_pack.py --publicar-existentes # NÃO reconverte: publica os .webp já em public/exercicios
  opções: --lossy 90 | --filtro <parte do nome> | --so-manifest
Env: SUPABASE_PAT (Management API; fallback ~/.pc-pat) e, pra publicar, SUPABASE_SERVICE_ROLE
(fallback: lida na Management API com o PAT). Nunca commitar chaves.
gif2webp: usa o do PATH ou baixa o libwebp oficial em ~/.cache/libwebp-<ver>/ (sem sudo).
Fluxo pra GIF novo/alterado no admin: rodar este script → commit de public/exercicios + manifest →
próxima release embute; até lá o app usa a URL da rede (fallback automático do resolverImagem).
"""
import argparse
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

from PIL import Image

REF = "uxwpwdbbnlticxgtzcsb"
SB = f"https://{REF}.supabase.co"
BUCKETS = {"public": "exercicios", "staging": "exercicios-staging"}
UA = "supabase-cli/2.0"
LIBWEBP_VER = "1.5.0"
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR_WEBP = os.path.join(RAIZ, "public", "exercicios")
ARQ_MANIFEST = os.path.join(RAIZ, "src", "lib", "exerciciosManifest.json")
RE_URL = re.compile(r"/storage/v1/object/public/(exercicios(?:-staging)?)/([0-9a-f-]{36})\.(gif|webp)(?:\?v=(\d+))?", re.I)


def pat():
    p = os.environ.get("SUPABASE_PAT")
    if p:
        return p
    with open(os.path.expanduser("~/.pc-pat")) as f:
        return f.read().strip()


def mgmt(path, data=None):
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{REF}{path}",
        data=json.dumps(data).encode() if data is not None else None,
        headers={"Authorization": f"Bearer {pat()}", "Content-Type": "application/json", "User-Agent": UA},
    )
    return json.loads(urllib.request.urlopen(req, timeout=120).read().decode())


def sql(q):
    return mgmt("/database/query", {"query": q})


def service_role():
    sr = os.environ.get("SUPABASE_SERVICE_ROLE")
    if sr:
        return sr
    keys = mgmt("/api-keys?reveal=true")
    return next(k["api_key"] for k in keys if k.get("name") == "service_role")


def baixar(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=120).read()


def gif2webp_bin():
    p = shutil.which("gif2webp")
    if p:
        return p
    base = os.path.expanduser(f"~/.cache/libwebp-{LIBWEBP_VER}")
    b = os.path.join(base, "bin", "gif2webp")
    if not os.path.exists(b):
        os.makedirs(base, exist_ok=True)
        url = f"https://storage.googleapis.com/downloads.webmproject.org/releases/webp/libwebp-{LIBWEBP_VER}-linux-x86-64.tar.gz"
        tgz = os.path.join(base, "libwebp.tgz")
        print(f"baixando libwebp {LIBWEBP_VER} (gif2webp) em {base}…")
        urllib.request.urlretrieve(url, tgz)
        subprocess.run(["tar", "-xzf", tgz, "-C", base, "--strip-components=1"], check=True)
    return b


def gif_para_webp(data, lossy_q=None):
    with tempfile.TemporaryDirectory() as td:
        gif = os.path.join(td, "in.gif")
        out = os.path.join(td, "out.webp")
        with open(gif, "wb") as fh:
            fh.write(data)
        args = [gif2webp_bin(), "-m", "6", "-min_size", "-mt", "-quiet"]
        if lossy_q:
            args += ["-mixed", "-q", str(lossy_q)]
        args += [gif, "-o", out]
        subprocess.run(args, check=True, capture_output=True)
        with open(out, "rb") as fh:
            webp = fh.read()
    im = Image.open(io.BytesIO(data))
    return webp, getattr(im, "n_frames", 1), im.size


def upload(sr, bucket, path, data, tentativas=4):
    """POST com x-upsert (idempotente); a borda do Supabase devolve 520/502 transiente de vez em quando → retry."""
    for i in range(tentativas):
        req = urllib.request.Request(
            f"{SB}/storage/v1/object/{bucket}/{path}", data=data, method="POST",
            headers={"Authorization": f"Bearer {sr}", "apikey": sr, "Content-Type": "image/webp",
                     "x-upsert": "true", "cache-control": "max-age=31536000", "User-Agent": UA},
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.status
        except urllib.error.HTTPError as e:
            if e.code in (500, 502, 503, 504, 520, 522, 524) and i < tentativas - 1:
                print(f"    HTTP {e.code} em {bucket}/{path} — tentando de novo em {2 * (i + 1)} s")
                time.sleep(2 * (i + 1))
                continue
            raise


def gravar_manifest(manifest):
    with open(ARQ_MANIFEST, "w") as fh:
        json.dump(dict(sorted(manifest.items())), fh, indent=2)
        fh.write("\n")


def ler_manifest():
    with open(ARQ_MANIFEST) as fh:
        return json.load(fh)


def publicar(convertidos, v):
    """convertidos = [(uuid, bytes)] — sobe nos 2 buckets e troca imagem_url em public+staging."""
    backup = {
        "public": sql("select id, imagem_url from public.tb_exercicios where imagem_url is not null"),
        "staging": sql("select id, imagem_url from staging.tb_exercicios where imagem_url is not null"),
    }
    arq_bk = f"/tmp/exercicios_urls_backup_{v}.json"
    with open(arq_bk, "w") as fh:
        json.dump(backup, fh, indent=1)
    print(f"backup das URLs antigas: {arq_bk}")

    sr = service_role()
    for uuid, webp in convertidos:
        for bucket in BUCKETS.values():
            st = upload(sr, bucket, f"{uuid}.webp", webp)
            if st not in (200, 201):
                raise SystemExit(f"upload falhou {bucket}/{uuid}.webp: {st}")
    print(f"upload ok: {len(convertidos)} × {len(BUCKETS)} buckets")

    ids = ",".join(f"'{u}'" for u, _ in convertidos)
    for schema, bucket in BUCKETS.items():
        r = sql(f"update {schema}.tb_exercicios set imagem_url = '{SB}/storage/v1/object/public/{bucket}/' || id || '.webp?v={v}' "
                f"where id in ({ids}) returning id")
        print(f"{schema}.tb_exercicios: {len(r)} imagem_url atualizadas → {bucket}/<id>.webp?v={v}")
    print("verificação:", sql(
        "select 'public' s, count(*) filter (where imagem_url like '%.webp?v=%') webp, count(*) filter (where imagem_url like '%.gif%') gif from public.tb_exercicios "
        "union all select 'staging', count(*) filter (where imagem_url like '%.webp?v=%'), count(*) filter (where imagem_url like '%.gif%') from staging.tb_exercicios"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--publicar", action="store_true", help="converte e depois sobe .webp nos buckets + troca imagem_url (public+staging)")
    ap.add_argument("--publicar-existentes", action="store_true", help="não reconverte: publica os .webp já em public/exercicios (v do manifest)")
    ap.add_argument("--lossy", type=int, default=None, metavar="Q", help="modo mixed com qualidade Q (padrão: sem perda)")
    ap.add_argument("--filtro", default=None, help="só exercícios cujo nome contém este texto")
    ap.add_argument("--so-manifest", action="store_true", help="não reconverte; regrava o manifest a partir dos .webp existentes")
    args = ap.parse_args()

    os.makedirs(DIR_WEBP, exist_ok=True)
    if args.so_manifest:
        manifest = {}
        for f in os.listdir(DIR_WEBP):
            m = re.match(r"([0-9a-f-]{36})-(\d+)\.webp$", f)
            if m:
                manifest[m.group(1)] = {"v": m.group(2), "bytes": os.path.getsize(os.path.join(DIR_WEBP, f))}
        gravar_manifest(manifest)
        print(f"manifest regravado: {len(manifest)} entradas")
        return

    if args.publicar_existentes:
        manifest = ler_manifest()
        versoes = {e["v"] for e in manifest.values()}
        if len(versoes) != 1:
            raise SystemExit(f"manifest com mais de uma versão ({versoes}) — reconverta tudo antes de publicar")
        v = versoes.pop()
        convertidos = []
        for uuid, e in manifest.items():
            with open(os.path.join(DIR_WEBP, f"{uuid}-{v}.webp"), "rb") as fh:
                convertidos.append((uuid, fh.read()))
        print(f"publicando {len(convertidos)} WebP existentes (v={v})")
        publicar(convertidos, v)
        return

    rows = sql("select id, nome, imagem_url from public.tb_exercicios where imagem_url is not null order by nome")
    if args.filtro:
        rows = [r for r in rows if args.filtro.lower() in r["nome"].lower()]
    print(f"{len(rows)} exercícios com imagem · gif2webp: {gif2webp_bin()}")

    v = str(int(time.time()))
    manifest, total_gif, total_webp, maior = {}, 0, 0, (0, "")
    convertidos = []  # (uuid, webp_bytes)
    t0 = time.time()
    for i, r in enumerate(rows, 1):
        m = RE_URL.search(r["imagem_url"])
        if not m:
            print(f"  ! URL fora do padrão, pulando: {r['nome']} {r['imagem_url'][:80]}")
            continue
        uuid = r["id"].lower()
        if m.group(2).lower() != uuid:
            print(f"  ! arquivo {m.group(2)} != id {uuid} ({r['nome']}) — manifest usa o id da linha")
        t1 = time.time()
        data = baixar(r["imagem_url"])
        webp, nframes, size = gif_para_webp(data, args.lossy)
        total_gif += len(data)
        total_webp += len(webp)
        if len(webp) > maior[0]:
            maior = (len(webp), r["nome"])
        for f in os.listdir(DIR_WEBP):  # apaga versões antigas do mesmo exercício
            if f.startswith(uuid + "-") and f.endswith(".webp"):
                os.remove(os.path.join(DIR_WEBP, f))
        with open(os.path.join(DIR_WEBP, f"{uuid}-{v}.webp"), "wb") as fh:
            fh.write(webp)
        manifest[uuid] = {"v": v, "bytes": len(webp)}
        convertidos.append((uuid, webp))
        print(f"  {i:2d}/{len(rows)} {r['nome'][:38]:38s} gif {len(data) // 1024:4d} KB → webp {len(webp) // 1024:3d} KB  {nframes}f {size[0]}x{size[1]}  {time.time() - t1:4.1f}s")

    if args.filtro:
        # conversão parcial: mantém as entradas já existentes do manifest
        try:
            antigo = ler_manifest()
        except (OSError, json.JSONDecodeError):
            antigo = {}
        antigo.update(manifest)
        manifest = antigo
    gravar_manifest(manifest)
    print(f"\nv={v} · {len(convertidos)} WebP · GIF total {total_gif / 1048576:.1f} MB → WebP total {total_webp / 1048576:.1f} MB "
          f"(−{100 - 100 * total_webp / max(total_gif, 1):.0f}%) · maior {maior[0] // 1024} KB ({maior[1]}) · {time.time() - t0:.0f}s")
    print(f"manifest: {ARQ_MANIFEST} · arquivos: {DIR_WEBP}")

    if not args.publicar:
        print("(sem --publicar: Storage e banco não foram tocados)")
        return
    publicar(convertidos, v)


if __name__ == "__main__":
    try:
        main()
    except urllib.error.HTTPError as e:
        print("HTTP", e.code, e.geturl(), e.read().decode()[:400])
        sys.exit(1)
    except subprocess.CalledProcessError as e:
        print("gif2webp falhou:", e.stderr.decode()[:400] if e.stderr else e)
        sys.exit(1)
