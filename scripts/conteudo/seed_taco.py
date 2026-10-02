#!/usr/bin/env python3
# Physiq W28: cópia do physiqnutri (main 294887a, scripts/seed_taco.py) antes do repositório do Nutri ser arquivado — a TACO já
# está carregada no banco principal (public e staging); fica aqui para recarregar se um dia for preciso.
"""Seed da base pública TACO (Tabela Brasileira de Composição de Alimentos, 4ª edição, NEPA/Unicamp 2011) na tabela
`alimentos` do PhysiqNutri, em `public` E `staging`. IDEMPOTENTE: upsert por `codigo` ('taco:<número na TACO>') —
rodar 2x não duplica nem cria lixo; só atualiza os valores.

Fonte dos dados: CSVs normalizados do repositório público brolesi/taco (licença MIT; DOI 10.5281/zenodo.22145839),
gerados por pipeline reproduzível a partir da planilha oficial `Taco_4a_edicao_2011.xls` do NEPA/Unicamp:
  https://github.com/brolesi/taco → data/processed/taco/taco_composicao.csv (597 alimentos, composição centesimal,
  minerais e vitaminas) e taco_acidos_graxos.csv (423 alimentos, perfil de ácidos graxos).
Valores por 100 g de parte comestível. No CSV, `1e-05` = traço (Tr) → gravado como 0; vazio = NA (não analisado) → null.

Mapeamento: energia_kcal, proteina_g, carboidrato_g, lipidio_g (← lipideos_g), fibra_g e sodio_mg em COLUNAS; os demais
nutrientes (umidade, kJ, colesterol, cinzas, minerais, vitaminas, gorduras saturadas/mono/poli/trans) no jsonb `nutrientes`.
Chave ausente no jsonb = não determinado na fonte.

Uso: python3 scripts/seed_taco.py [--so public|staging] [--dry-run] [--atualizar]
  --atualizar baixa os CSVs de novo (senão usa o cache em ~/.cache/physiqnutri-taco/).
Credenciais (fora do repo): ref do projeto em ~/.physiqnutri-ref, service role em ~/.physiqnutri-service.
"""
import argparse
import csv
import io
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

REPO = "brolesi/taco"
REF_FONTE = "main"
BASE_RAW = f"https://raw.githubusercontent.com/{REPO}/{REF_FONTE}/data/processed/taco/"
ARQ_COMPOSICAO = "taco_composicao.csv"
ARQ_ACIDOS = "taco_acidos_graxos.csv"
CACHE = Path.home() / ".cache" / "physiqnutri-taco"
SCHEMAS = ["public", "staging"]
TRACO = 1e-05
LOTE = 100
UA = "physiqnutri-seed-taco"

# coluna do banco ← coluna do CSV
MACROS = {
    "energia_kcal": "energia_kcal",
    "proteina_g": "proteina_g",
    "carboidrato_g": "carboidrato_g",
    "lipidio_g": "lipideos_g",
    "fibra_g": "fibra_g",
    "sodio_mg": "sodio_mg",
}
NUTRIENTES = {
    "umidade_pct": "umidade_pct", "energia_kj": "energia_kj", "colesterol_mg": "colesterol_mg", "cinzas_g": "cinzas_g",
    "calcio_mg": "calcio_mg", "magnesio_mg": "magnesio_mg", "manganes_mg": "manganes_mg", "fosforo_mg": "fosforo_mg",
    "ferro_mg": "ferro_mg", "potassio_mg": "potassio_mg", "cobre_mg": "cobre_mg", "zinco_mg": "zinco_mg",
    "retinol_mcg": "retinol_mcg", "re_mcg": "RE_mcg", "rae_mcg": "RAE_mcg", "tiamina_mg": "tiamina_mg",
    "riboflavina_mg": "riboflavina_mg", "piridoxina_mg": "piridoxina_mg", "niacina_mg": "niacina_mg", "vitamina_c_mg": "vitamina_c_mg",
}
ACIDOS = {"saturados_g": "saturados_g", "monoinsaturados_g": "monoinsaturados_g", "poliinsaturados_g": "poliinsaturados_g"}
TRANS = ["c18_1t_g", "c18_2t_g"]


def valor(s: str | None, casas: int) -> float | None:
    """Número do CSV → float arredondado; traço (1e-05) → 0; vazio/NA → None; negativo → None."""
    s = (s or "").strip()
    if not s or s.upper() in ("NA", "NAN", "*", "TR"):
        return None
    try:
        x = float(s)
    except ValueError:
        return None
    if x < 0:
        return None
    if x <= TRACO:
        return 0.0
    return round(x, casas)


def baixar(nome: str, atualizar: bool) -> str:
    CACHE.mkdir(parents=True, exist_ok=True)
    destino = CACHE / nome
    if destino.exists() and not atualizar:
        return destino.read_text(encoding="utf-8")
    req = urllib.request.Request(BASE_RAW + nome, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        texto = r.read().decode("utf-8")
    destino.write_text(texto, encoding="utf-8")
    return texto


def commit_da_fonte() -> str:
    try:
        req = urllib.request.Request(f"https://api.github.com/repos/{REPO}/commits/{REF_FONTE}", headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode())["sha"][:12]
    except Exception:  # noqa: BLE001 — só informativo
        return "?"


def montar_linhas(atualizar: bool) -> list[dict]:
    comp = list(csv.DictReader(io.StringIO(baixar(ARQ_COMPOSICAO, atualizar))))
    acidos = {int(float(r["numero_alimento"])): r for r in csv.DictReader(io.StringIO(baixar(ARQ_ACIDOS, atualizar)))}
    linhas: list[dict] = []
    vistos: set[int] = set()
    for r in comp:
        numero = int(float(r["numero_alimento"]))
        if numero in vistos:
            continue
        vistos.add(numero)
        nome = " ".join((r.get("descricao") or "").split())
        if not nome:
            continue
        nutrientes: dict[str, float] = {}
        for chave, coluna in NUTRIENTES.items():
            v = valor(r.get(coluna), 3)
            if v is not None:
                nutrientes[chave] = v
        ag = acidos.get(numero)
        if ag:
            for chave, coluna in ACIDOS.items():
                v = valor(ag.get(coluna), 3)
                if v is not None:
                    nutrientes[chave] = v
            trans = [valor(ag.get(c), 3) for c in TRANS]
            if any(t is not None for t in trans):
                nutrientes["trans_g"] = round(sum(t or 0.0 for t in trans), 3)
        linha = {
            "codigo": f"taco:{numero}",
            "fonte": "taco",
            "nutricionista_id": None,
            "nome": nome,
            "grupo": " ".join((r.get("categoria") or "").split()) or None,
            "porcao_g": 100,
            "nutrientes": nutrientes,
        }
        for chave, coluna in MACROS.items():
            linha[chave] = valor(r.get(coluna), 2)
        linhas.append(linha)
    return linhas


def rest(url: str, metodo: str, headers: dict, body=None) -> tuple[int, str, dict]:
    dados = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=dados, method=metodo, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.status, r.read().decode(), dict(r.headers)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(), dict(e.headers)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--so", choices=SCHEMAS)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--atualizar", action="store_true")
    a = ap.parse_args()

    linhas = montar_linhas(a.atualizar)
    grupos = sorted({l["grupo"] for l in linhas if l["grupo"]})
    com_ag = sum(1 for l in linhas if "saturados_g" in l["nutrientes"])
    print(f"fonte: github.com/{REPO}@{REF_FONTE} (commit {commit_da_fonte()}) — {len(linhas)} alimentos, {len(grupos)} grupos, {com_ag} com ácidos graxos")
    if len(linhas) < 500:
        print("ERRO: menos de 500 alimentos na fonte — abortando")
        return 1
    if a.dry_run:
        print(json.dumps(linhas[0], ensure_ascii=False, indent=1))
        print("grupos:", grupos)
        return 0

    ref = Path.home().joinpath(".physiqnutri-ref").read_text(encoding="utf-8").strip()
    service = Path.home().joinpath(".physiqnutri-service").read_text(encoding="utf-8").strip()
    url = f"https://{ref}.supabase.co/rest/v1/alimentos"
    falhas = 0
    for schema in SCHEMAS:
        if a.so and schema != a.so:
            continue
        cab = {"apikey": service, "Authorization": f"Bearer {service}", "Content-Type": "application/json",
               "Content-Profile": schema, "Accept-Profile": schema, "Prefer": "resolution=merge-duplicates,return=minimal"}
        for i in range(0, len(linhas), LOTE):
            st, corpo, _ = rest(f"{url}?on_conflict=codigo", "POST", cab, linhas[i:i + LOTE])
            if st not in (200, 201, 204):
                falhas += 1
                print(f"FALHA {schema} lote {i // LOTE + 1}: HTTP {st} {corpo[:300]}")
                break
        cab_conta = {"apikey": service, "Authorization": f"Bearer {service}", "Accept-Profile": schema, "Prefer": "count=exact", "Range": "0-0"}
        st, _, h = rest(f"{url}?fonte=eq.taco&deleted_at=is.null&select=id", "GET", cab_conta)
        total = (h.get("Content-Range") or h.get("content-range") or "?/?").split("/")[-1]
        st2, corpo2, _ = rest(f"{url}?codigo=eq.taco:1&select=nome,energia_kcal,proteina_g,carboidrato_g,lipidio_g,nutrientes",
                              "GET", {"apikey": service, "Authorization": f"Bearer {service}", "Accept-Profile": schema})
        amostra = json.loads(corpo2)[0] if st2 == 200 and corpo2.strip() not in ("", "[]") else {}
        print(f"{schema}: {total} alimentos TACO no banco (HTTP {st}) · taco:1 = {amostra.get('nome')} {amostra.get('energia_kcal')} kcal, "
              f"{len(amostra.get('nutrientes') or {})} nutrientes no jsonb")
        if str(total) != str(len(linhas)):
            falhas += 1
            print(f"AVISO {schema}: esperava {len(linhas)}, achei {total}")
    print("OK" if not falhas else f"{falhas} falha(s)")
    return 1 if falhas else 0


if __name__ == "__main__":
    sys.exit(main())
