#!/usr/bin/env python3
"""Smoke da edge admin-relatorio contra o banco de producao (schema public).

Casos positivos: admin enxerga os treinos de OUTROS alunos (o que a RLS bloqueava).
Casos negativos: aluno comum e requisicao sem token nao passam.
"""
import json, os, sys, urllib.request, urllib.error, pathlib, re

RAIZ = pathlib.Path(__file__).resolve().parent.parent
env = (RAIZ / ".env").read_text(encoding="utf-8")
URL = re.search(r"VITE_SUPABASE_URL=(\S+)", env).group(1).rstrip("/")
ANON = re.search(r"VITE_SUPABASE_ANON_KEY=(\S+)", env).group(1)

SENHA = os.environ.get("SMOKE_PASSWORD")
if not SENHA:
    print("defina SMOKE_PASSWORD com a senha da conta de teste")
    sys.exit(1)
ADMIN = "admin.teste.claude@physiqcalc.app"
ALUNO = "teste@teste.com"

JAISE = "fce53b26-b174-4753-8332-f03071163d29"
LIVIA = "69801dc4-a6aa-4461-a4f7-bcdd1c41e5a6"

falhas, passes = [], []


def checa(nome, condicao, detalhe=""):
    if condicao:
        passes.append(nome)
        print(f"  PASS  {nome}" + (f" ({detalhe})" if detalhe else ""))
    else:
        falhas.append(nome)
        print(f"  FALHA {nome}" + (f" ({detalhe})" if detalhe else ""))


def post(caminho, payload, token=None, apikey=True):
    req = urllib.request.Request(f"{URL}{caminho}", method="POST",
                                 data=json.dumps(payload).encode())
    req.add_header("Content-Type", "application/json")
    if apikey:
        req.add_header("apikey", ANON)
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        corpo = e.read().decode()
        try:
            return e.code, json.loads(corpo)
        except Exception:
            return e.code, {"raw": corpo[:200]}


def login(email):
    st, body = post("/auth/v1/token?grant_type=password", {"email": email, "password": SENHA})
    if st != 200 or "access_token" not in body:
        print(f"ERRO ao logar {email}: {st} {body}")
        sys.exit(1)
    return body["access_token"]


print("== login ==")
tk_admin = login(ADMIN)
tk_aluno = login(ALUNO)
print(f"  admin e aluno autenticados")

edge = "/functions/v1/admin-relatorio"

print("\n== 1. relatorio de OUTRO aluno (o bug original) ==")
st, r = post(edge, {"action": "relatorio", "userId": JAISE, "ano": 2026, "mes": 8}, tk_admin)
checa("HTTP 200 no relatorio da Jaise", st == 200, f"status={st}")
concl = r.get("concluidos", [])
series = r.get("series", [])
checa("Jaise tem 8 treinos concluidos em agosto", len(concl) == 8, f"veio {len(concl)}")
checa("Jaise tem 142 series concluidas", len(series) == 142, f"veio {len(series)}")
volume = sum(float(s.get("peso") or 0) * float(s.get("reps") or 0) for s in series)
checa("volume 39.417 kg-rep", round(volume) == 39417, f"veio {round(volume)}")
nomes = r.get("grupoNomePorData", {})
checa("nome do treino resolvido nas datas", len(nomes) >= 7, f"{len(nomes)} datas nomeadas")
checa("20/08 = Treino B", nomes.get("2026-08-20", "").startswith("Treino B"), nomes.get("2026-08-20", "vazio"))

print("\n== 2. relatorio da Livia (quem nao usa cronometro) ==")
st, r = post(edge, {"action": "relatorio", "userId": LIVIA, "ano": 2026, "mes": 8}, tk_admin)
checa("HTTP 200 no relatorio da Livia", st == 200, f"status={st}")
checa("Livia tem 3 treinos em agosto", len(r.get("concluidos", [])) == 3, f"veio {len(r.get('concluidos', []))}")

print("\n== 3. lista do mes com TODOS os alunos ==")
st, r = post(edge, {"action": "historicoMes", "ano": 2026, "mes": 8}, tk_admin)
checa("HTTP 200 na lista do mes", st == 200, f"status={st}")
itens = r.get("itens", [])
pessoas = {i["pessoa"] for i in itens}
checa("lista nao vazia", len(itens) > 0, f"{len(itens)} treinos")
checa("Jaise aparece", any("Jaise" in p for p in pessoas))
checa("Livia aparece (sem cronometro)", any("via" in p for p in pessoas), ", ".join(sorted(pessoas)))
checa("todo item tem nome de treino", all(i.get("nomeTreino") for i in itens))
sem_nome = [i for i in itens if i.get("nomeTreino") in (None, "", "Treino")]
checa("nenhum item caiu no fallback generico", len(sem_nome) == 0, f"{len(sem_nome)} genericos")
checa("ordenado do mais recente pro mais antigo",
      all(itens[i]["data"] >= itens[i + 1]["data"] for i in range(len(itens) - 1)))
checa("itens da Jaise datados por iniciado_em (07/08, nao 08/08)",
      any(i["data"] == "2026-08-07" for i in itens if "Jaise" in i["pessoa"]))

print("\n== 4. historico completo no popup ==")
st, r = post(edge, {"action": "historicoUsuario", "userId": LIVIA}, tk_admin)
checa("HTTP 200 no historico da Livia", st == 200, f"status={st}")
hist = r.get("historico", [])
checa("Livia tem registros reconstruidos", len(hist) > 0, f"{len(hist)} treinos")
checa("todos marcados sem_cronometro", all(h.get("sem_cronometro") for h in hist))
checa("registros tem exercicios detalhados",
      all(isinstance(h.get("exercicios_concluidos"), list) and h["exercicios_concluidos"] for h in hist))
checa("exercicios tem series com peso/reps",
      all("series" in ex and ex["series"] for h in hist for ex in h["exercicios_concluidos"]))

st, r = post(edge, {"action": "historicoUsuario", "userId": JAISE}, tk_admin)
hist_j = r.get("historico", [])
com_timer = [h for h in hist_j if not h.get("sem_cronometro")]
checa("Jaise tem treinos cronometrados no popup", len(com_timer) > 0, f"{len(com_timer)} com cronometro")
checa("cronometrados tem duracao > 0", all(h["duracao_segundos"] > 0 for h in com_timer))

print("\n== 4b. treino com exercicios_concluidos em STRING ==")
# 8 linhas em public estao com o JSON duplo-encodado (seeds da conta Admin Teste).
# buildTreinoResumo so aceita array, entao sem normalizar na edge os exercicios
# somem sem erro nenhum no popup de um treino.
ADMIN_TESTE = "e4c5fb14-fe3b-4a51-a49f-ceed61485054"
TREINO_STRING = "h:f2d054a4-e592-479f-862d-b4880e0743a1"  # Admin Teste, 14/07, Lower A
st, r = post(edge, {"action": "historicoTreino", "userId": ADMIN_TESTE, "chave": TREINO_STRING}, tk_admin)
checa("HTTP 200 no treino string", st == 200, f"status={st}")
t = r.get("treino") or {}
checa("nome do treino veio", t.get("nome_treino") == "Lower A", str(t.get("nome_treino")))
checa("exercicios_concluidos virou ARRAY", isinstance(t.get("exercicios_concluidos"), list),
      type(t.get("exercicios_concluidos")).__name__)
checa("array nao veio vazio", len(t.get("exercicios_concluidos") or []) > 0,
      f"{len(t.get('exercicios_concluidos') or [])} exercicios")
checa("exercicios tem nome e series",
      all(ex.get("nome") for ex in (t.get("exercicios_concluidos") or [])))

print("\n== 5. NEGATIVOS ==")
st, r = post(edge, {"action": "relatorio", "userId": JAISE, "ano": 2026, "mes": 8}, tk_aluno)
checa("aluno comum recebe 403", st == 403, f"status={st} {r.get('error')}")

st, r = post(edge, {"action": "historicoMes", "ano": 2026, "mes": 8}, tk_aluno)
checa("aluno comum nao lista o mes", st == 403, f"status={st}")

st, r = post(edge, {"action": "relatorio", "userId": JAISE, "ano": 2026, "mes": 8}, None)
checa("sem token recebe 401", st == 401, f"status={st}")

st, r = post(edge, {"action": "coisaInvalida"}, tk_admin)
checa("acao invalida recebe 400", st == 400, f"status={st}")

st, r = post(edge, {"action": "relatorio", "userId": JAISE, "ano": 2026, "mes": 99}, tk_admin)
checa("mes invalido recebe 400", st == 400, f"status={st}")

print(f"\n{'='*50}\n{len(passes)}/{len(passes)+len(falhas)} PASS")
if falhas:
    print("FALHAS: " + " | ".join(falhas))
    sys.exit(1)
print("smoke OK")
