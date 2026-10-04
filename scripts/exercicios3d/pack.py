# Gera src/lib/exercicios3dManifest.json a partir das fichas + arquivos em public/exercicios3d/ (mesmo papel do
# scripts/exercicios_pack.py dos webp). Exercício só entra com o movimento (.glb) E a foto (.webp) da mesma versão.
#   .venv/bin/python pack.py
import json, os, re

AQUI = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(AQUI))
PUB = os.path.join(REPO, "public", "exercicios3d")
MANIFESTO = os.path.join(REPO, "src", "lib", "exercicios3dManifest.json")


def versoes(arquivos, padrao):
    return sorted(m.group(1) for f in arquivos for m in [re.fullmatch(padrao, f)] if m)


def gerar(pub=PUB, fichas_dir=os.path.join(AQUI, "fichas"), ids_json=os.path.join(AQUI, "musculos_ids.json")):
    arquivos = os.listdir(pub)
    ids = json.load(open(ids_json))
    bonecos, mapas = versoes(arquivos, r"boneco-(\d+)\.glb"), versoes(arquivos, r"musculos-(\d+)\.png")
    if len(bonecos) != 1 or len(mapas) != 1:
        raise SystemExit("PACK: tem que haver 1 boneco e 1 mapa em public/exercicios3d (achei %s e %s)" % (bonecos, mapas))
    man = {"boneco": {"v": bonecos[0], "glb": "/exercicios3d/boneco-%s.glb" % bonecos[0],
                      "mapa": "/exercicios3d/musculos-%s.png" % mapas[0]},
           "exercicios": {}}
    for nome in sorted(os.listdir(fichas_dir)):
        if not nome.endswith(".json"):
            continue
        f = json.load(open(os.path.join(fichas_dir, nome)))
        uuid = f["uuid"]
        comuns = set(versoes(arquivos, re.escape(uuid) + r"-(\d+)\.glb")) & set(versoes(arquivos, re.escape(uuid) + r"-(\d+)\.webp"))
        if not comuns:
            print("PACK: sem movimento + foto, fica fora:", f["nome"])
            continue
        v = max(comuns)
        falta = [m for m in f["alvos"] + f["auxiliares"] if m not in ids]
        if falta:
            raise SystemExit("PACK: músculo sem id na ficha de %s: %s" % (f["nome"], falta))
        movimento, foto = "%s-%s.glb" % (uuid, v), "%s-%s.webp" % (uuid, v)
        man["exercicios"][uuid] = {
            "v": v,
            "movimento": "/exercicios3d/" + movimento,
            "foto": "/exercicios3d/" + foto,
            "bytes": os.path.getsize(os.path.join(pub, movimento)) + os.path.getsize(os.path.join(pub, foto)),
            "alvos": [ids[m] for m in f["alvos"]],
            "auxiliares": [ids[m] for m in f["auxiliares"]],
            "camera": f["camera"],
            "ida_s": f.get("ida_s", 1.5),
        }
    return man


if __name__ == "__main__":
    man = gerar()
    with open(MANIFESTO, "w") as fh:
        json.dump(man, fh, ensure_ascii=False, indent=1)
        fh.write("\n")
    print("PACK %s: boneco %s, %d exercício(s)" % (MANIFESTO, man["boneco"]["v"], len(man["exercicios"])))
