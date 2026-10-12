#!/usr/bin/env python3
"""Physiq W2 — os segredos do Mercado Pago do personal, sem valor na tela, no log ou na conversa (revisão I9 e I10 do plano da W2).

Uso:  python3 scripts/segredos/mp_conta.py <grupo> <subcomando> [--dry-run] [--staging] [--papel integrador]
  cofre campos            os NOMES dos campos do item "Mercado Pago — PhysiqCalc", o que cada um parece ser (token de produção/teste,
                          chave pública, client id, client secret, assinatura dos avisos) e o tamanho — nunca o valor; num texto livre
                          (as notas), só QUANTOS tokens/chaves há dentro. E se os itens da W2 (usuários de teste, aplicação de teste)
                          já existem (só os nomes dos campos). Sai 2 sem o Client Secret.
  oauth local             ~/.physiq-mp-oauth.json (600) com client_id e client_secret (a prova da Task 1 e o oauth_real).
                          --staging: o client da APLICAÇÃO DE TESTE do integrador (plano B do I6) → ~/.physiq-mp-oauth-staging.json (600).
  oauth testar            confere o par no POST /oauth/token com um code INVENTADO: o par certo dá invalid_grant (o MP aceitou o client e
                          recusou só o code) e um secret falso (o controle) dá invalid_client — nenhum token é criado. --staging: o par da
                          aplicação de teste.
  oauth copiar|conferir   MP_CLIENT_ID e MP_CLIENT_SECRET (+ os _STAGING do item "… — aplicação de teste do integrador (W2, plano B)", se
                          existir: o plano B do I6) nos segredos das funções do principal / o digest das funções = sha256 do cofre (sai 1 se
                          não bate).
  usuarios-teste criar    vendedor e comprador de TESTE (POST /users/test, MLB) com o token de PRODUÇÃO só na memória → cofre ("Mercado
                          Pago — PhysiqCalc — usuários de teste (W2)", tipo login; gravado logo depois de CADA usuário criado) →
                          ~/.physiq-mp-{vendedor,comprador}-teste.json (600). Já no cofre → só os 2 arquivos (o MP não apaga usuário de
                          teste: até 15 por aplicação — não criar outro par); só um deles no cofre → cria só o que falta.
                          --papel integrador: SÓ o integrador de teste (plano B do I6 — quem entra no painel de desenvolvedores e cria a
                          aplicação de TESTE); no mesmo item (extras integrador_*) → ~/.physiq-mp-integrador-teste.json (600). Já no
                          cofre → só o arquivo (1 integrador só); sem o item do par → para antes de qualquer POST.
  chave gerar             (Task 11; roda na Task 14) a MP_TOKENS_CHAVE (a chave AES-256-GCM dos tokens; 32 bytes, base64url) — gerada SÓ
                          quando não existe em lugar nenhum (revisão I10): PRIMEIRO no cofre ("Physiq — chave dos tokens do MP do personal
                          (W2)", lida de volta), DEPOIS nas funções do principal, conferida pelo digest. Já existe igual nas 2 pontas → ✅
                          "nada a fazer" (sai 0, sem gerar); só num lado, diferente ou fora do formato → ❌ e PARA, sem gravar nada (gerar
                          por cima apagaria o acesso de TODOS os personais: as funções valem para o staging e o public juntos).
  chave copiar            termina um "gerar" que parou entre o cofre e as funções: a chave do COFRE vai para as funções SÓ quando as funções
                          ainda não têm nenhuma (nunca gera; nunca troca a que existe).
  chave conferir          o digest da MP_TOKENS_CHAVE nas funções = sha256 da do cofre (e o formato: 32 bytes) — sai 1 se não bate.
                          (Trocar a chave é outro comando — chave trocar —, fora da W2: exige ler a v1 e a v2 lado a lado e recifrar.)
  assinatura copiar|conferir  (Task 11; roda na Task 23) a MP_WEBHOOK_ASSINATURA (a assinatura secreta do painel do MP — W2-a, passo 6) do
                          item "Mercado Pago — PhysiqCalc — assinatura dos avisos (W2)" (campo valor) para as funções do principal / o
                          digest das funções = sha256 do cofre. Sem o item → sai 2 (é dele, no FIM).
--dry-run (ou --seco): lê o cofre (só na memória), mas não grava nada — nem cofre, nem funções, nem arquivo — e não chama o MP (o
chave gerar --seco nem gera a chave).
Na tela só ✅/❌, nomes de campo, tipo, tamanho e sha8: nunca um valor, o sha256 inteiro, o id ou o código de um usuário de teste.
Saída: 0 ok · 1 erro ou não confere · 2 falta no cofre algo que é DELE (o Client Secret ou o token de produção — W2-a, no FIM).
O item dos usuários: extras vendedor_id|usuario|email|senha|codigo_verificacao, comprador_… e integrador_… (o login de topo = o vendedor).
O item da aplicação de teste (tipo token): valor = o client secret; extras client_id e client_secret; url = a página dela no painel — gravado
pelo e2e/w2/painel_mp_teste.py (gravar_aplicacao_teste) direto do navegador.
Credenciais: o PAT em ~/.pc-pat (Management API) e o cofre pelo MCP local por stdio — o Remoto do servidor.py.
Testes: PYTHONDONTWRITEBYTECODE=1 python3 -m unittest scripts/segredos/test_mp_conta.py
"""
from __future__ import annotations

import argparse
import base64
import json
import re
import secrets
import sys
import traceback
import urllib.error
import urllib.request
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import servidor as S  # noqa: E402  (Remoto, Falha, guardar, ok, nota, depois, onde, sha8, sha256_hex, gravar_arquivo, PROJETO_COFRE)

ITEM = "Mercado Pago — PhysiqCalc"
ITEM_TESTE_APP = "Mercado Pago — PhysiqCalc — aplicação de teste do integrador (W2, plano B)"  # o nome que a sessão principal deu (11/10)
ITEM_USUARIOS = "Mercado Pago — PhysiqCalc — usuários de teste (W2)"
ITEM_CHAVE = "Physiq — chave dos tokens do MP do personal (W2)"  # Task 11: a MP_TOKENS_CHAVE (o cofre é a cópia: as funções não devolvem valor)
ITEM_ASSINATURA = "Mercado Pago — PhysiqCalc — assinatura dos avisos (W2)"  # W2-a, passo 6 (FIM): a assinatura secreta do painel
SEGREDO_CHAVE = "MP_TOKENS_CHAVE"
SEGREDO_ASSINATURA = "MP_WEBHOOK_ASSINATURA"
CHAVE_FORMATO = re.compile(r"[A-Za-z0-9_-]{43}=?")  # 32 bytes em base64url (o que o importarChave do _shared/cifra-mp.ts aceita)
ASSINATURA_FORMATO = re.compile(r"[A-Za-z0-9_-]{16,256}")  # sem espaço, sem endereço: um texto colado errado não vai para as funções
NOTA_CHAVE = ("W2 (Mercado Pago do personal): a chave AES-256-GCM (v1) dos tokens do MP de cada personal — a MP_TOKENS_CHAVE das funções do "
              "principal (vale para o staging e o public juntos). Perder ou trocar = todos os personais reconectam. Gerada pelo "
              "scripts/segredos/mp_conta.py chave gerar (só quando não existia em lugar nenhum); conferir: mp_conta.py chave conferir. "
              "Trocar é outro comando (chave trocar, fora da W2).")
PUBLICAR_CHAVE = ("publicar de novo as funções que leem a chave (o segredo é lido no boot do isolate): pagamentos-aluno, mp-conectar-retorno, "
                  "mp-contas-renovar, mp-webhook-aluno, automaticas-fila, master-contas e excluir-minha-conta (Task 14, Step 3)")
ARQ_OAUTH = ".physiq-mp-oauth.json"
ARQ_OAUTH_STAGING = ".physiq-mp-oauth-staging.json"  # o client da aplicação de TESTE do integrador (plano B do I6) — a prova --client staging
PAPEIS = ("vendedor", "comprador")  # o par padrão do usuarios-teste criar (Task 1)
INTEGRADOR = "integrador"  # plano B do I6: o usuário de teste que entra no painel de desenvolvedores e cria a aplicação de TESTE
TODOS_OS_PAPEIS = PAPEIS + (INTEGRADOR,)
CAMPOS_USUARIO = (("id", "id"), ("usuario", "nickname"), ("email", "email"), ("senha", "password"))  # (no cofre, no arquivo/no MP)
USERS_TEST = "https://api.mercadopago.com/users/test"
OAUTH_TOKEN = "https://api.mercadopago.com/oauth/token"
REDIRECT_DA_PROVA = "https://www.mercadopago.com"  # o padrão do painel; o code inventado é recusado antes (a T1 mediu assim, 11/10)
PERFIL = re.compile(r"[a-z_]{3,20}")  # o "profile" da resposta do POST /users/test sai na tela só se for um rótulo curto (seller, buyer…)
NOTA_APP_TESTE = ("Aplicação de TESTE do Mercado Pago (dinheiro de mentira) criada no painel de desenvolvedores pelo INTEGRADOR de teste "
                  "(extras integrador_* do item \"Mercado Pago — PhysiqCalc — usuários de teste (W2)\") — plano B do I6 da W2. O client "
                  "vai SÓ para o staging (MP_CLIENT_ID_STAGING/MP_CLIENT_SECRET_STAGING: mp_conta.py oauth copiar) e para "
                  "~/.physiq-mp-oauth-staging.json (mp_conta.py oauth local --staging). Gravado direto do navegador pelo "
                  "e2e/w2/painel_mp_teste.py: nenhum valor passou pela conversa.")
UA = "physiq-unificado/1.0 (segredos/mp_conta)"
NOTA_USUARIOS = ("Usuários de TESTE do Mercado Pago (dinheiro de mentira) da aplicação PhysiqCalc, criados pelo "
                 "scripts/segredos/mp_conta.py usuarios-teste criar (W2). O login de topo é o do vendedor. O MP não apaga usuário de "
                 "teste (até 15 por aplicação): não criar outro par. O código de verificação do painel (Contas de teste) vai no extra "
                 "vendedor_codigo_verificacao.")
TOKEN_PROD = re.compile(r"APP_USR-(\d{6,20})-\d{6}-[0-9a-f]{20,64}-\d{3,20}")
TOKEN_TESTE = re.compile(r"TEST-(\d{6,20})-\d{6}-[0-9a-f]{20,64}-\d{3,20}")
CHAVE_PUBLICA = re.compile(r"(APP_USR|TEST)-[0-9a-f]{8}-[0-9a-f-]{20,40}")
SECRET = re.compile(r"[A-Za-z0-9]{20,64}")
EMAIL = re.compile(r"[^@\s]+@[^@\s]+\.[A-Za-z]{2,}")
FALA_DE_SECRET = re.compile(r"secret|segredo", re.I)
NOME_COM_CARA_DE_VALOR = re.compile(r"[A-Za-z0-9]{20,}|(APP_USR|TEST)-\d")
GUARDAR_DESDE = 6  # o limpo() troca TODA ocorrência: um campo "2" apagaria cada 2 da tela; segredo do MP tem ≥ 6 (o código do painel)


class FaltaDele(S.Falha):
    """Falta no cofre algo que só o Weslley põe (o Client Secret, o token de produção): sai 2 — é o FIM (W2-a), não um erro."""


def casa() -> Path:
    return Path.home()


def modo_600(caminho: Path) -> bool:
    return (caminho.stat().st_mode & 0o777) == 0o600


# ───────────────────────── o cofre (os valores só na memória) ─────────────────────────


def pares_de(campos: dict) -> list[tuple[str, str]]:
    """[(nome do campo, valor)] de um item: os de topo (texto ou número) + os extras; só os que têm valor."""
    pares: list[tuple[str, str]] = []
    for k, v in campos.items():
        if k == "extras":
            pares += [(str(e.get("nome") or ""), str(e.get("valor") or "").strip()) for e in (v or []) if isinstance(e, dict)]
        elif isinstance(v, (str, int)) and not isinstance(v, bool):
            pares.append((str(k), str(v).strip()))
    return [(n, v) for n, v in pares if v]


def ler_campos(r: S.Remoto, nome: str) -> tuple[str, dict] | None:
    """(tipo, campos) de QUALQUER tipo de item; cada valor vai para o limpo() antes de qualquer mensagem. None = não existe."""
    erro, texto = r._mcp().ferramenta("ler_segredo", {"projeto": S.PROJETO_COFRE, "nome": nome})
    if erro:
        if texto.startswith("ITEM_NAO_ENCONTRADO"):
            return None
        raise S.Falha(f"cofre: ler \"{nome}\" falhou — {texto[:200]}")
    try:
        dados = json.loads(texto)
    except json.JSONDecodeError:
        raise S.Falha(f"cofre: a leitura de \"{nome}\" veio fora do formato") from None
    campos = dados.get("campos") if isinstance(dados, dict) else None
    if not isinstance(campos, dict):
        raise S.Falha(f"cofre: a leitura de \"{nome}\" veio sem campos")
    for _, v in pares_de(campos):
        if len(v) >= GUARDAR_DESDE:
            S.guardar(v)  # nenhuma mensagem que sai daqui leva um valor (o limpo() do servidor.py)
    return str(dados.get("tipo") or ""), campos


def ler_item(r: S.Remoto, nome: str) -> list[tuple[str, str]] | None:
    lido = ler_campos(r, nome)
    return None if lido is None else pares_de(lido[1])


# ───────────────────────── regras puras: o que cada campo parece ser ─────────────────────────


def tipo_de(nome: str, valor: str) -> str:
    """Pelo FORMATO do valor (tokens e chaves públicas); sem formato próprio, pelo NOME do campo."""
    n = nome.lower()
    if TOKEN_PROD.fullmatch(valor):
        return "token de produção"
    if TOKEN_TESTE.fullmatch(valor):
        return "token de teste"
    if CHAVE_PUBLICA.fullmatch(valor):
        return "chave pública"
    if re.match(r"https?://", valor):
        return "endereço"
    if EMAIL.fullmatch(valor):
        return "e-mail"
    if any(p in n for p in ("assinatura", "webhook", "signature")):
        return "assinatura dos avisos"  # a do painel (W2-a, passo 6): nunca vira o client secret
    if ("secret" in n or "segredo" in n) and SECRET.fullmatch(valor):
        return "client secret"
    if "user" in n and valor.isdigit():
        return "user id (a conta do MP)"
    if any(p in n for p in ("client", "app", "aplica")) and valor.isdigit():
        return "client id"
    return "outro"


def nome_na_tela(nome: str) -> str:
    """O nome do campo como sai na tela — ou só o tamanho, se ele tem cara de valor (um segredo colado no lugar do nome)."""
    return f"‹nome com cara de valor, {len(nome)} caracteres›" if NOME_COM_CARA_DE_VALOR.search(nome) else f"\"{nome}\""


def dentro_do_texto(valor: str) -> str:
    """Num texto livre (as notas): só QUANTOS tokens/chaves aparecem e se ele fala de "secret" — nunca o trecho."""
    achados = [f"{n} {rotulo}" for rx, rotulo in ((TOKEN_PROD, "token de produção"), (TOKEN_TESTE, "token de teste"),
                                                   (CHAVE_PUBLICA, "chave pública"))
               if (n := sum(1 for _ in rx.finditer(valor)))]
    if FALA_DE_SECRET.search(valor):
        achados.append("fala de \"secret\"")
    return f" · no texto: {', '.join(achados)}" if achados else ""


def unico(tipos: list[tuple[str, str, str]], tipo: str) -> str | None:
    """O valor dos campos daquele tipo (o mesmo valor 2 vezes conta 1); 2 valores diferentes → Falha: o script não escolhe."""
    valores = {v for t, _, v in tipos if t == tipo}
    if len(valores) > 1:
        nomes = ", ".join(nome_na_tela(n) for t, n, _ in tipos if t == tipo)
        raise S.Falha(f"{len(valores)} campos com valores diferentes parecem {tipo} ({nomes}): deixe só 1 no cofre")
    return next(iter(valores), None)


def cliente_detalhado(pares: list[tuple[str, str]]) -> tuple[str | None, str | None, str]:
    """(client_id, client_secret, de onde veio o id). O id: o campo (client/app/aplicação, só dígitos) ou o 2º pedaço do token de
    produção — sem ele, o do token de teste (o mesmo número da aplicação). O secret: só de um campo, pelo nome."""
    tipos = [(tipo_de(n, v), n, v) for n, v in pares]
    sec = unico(tipos, "client secret")
    cid = unico(tipos, "client id")
    if cid:
        return cid, sec, "campo " + nome_na_tela(next(n for t, n, _ in tipos if t == "client id"))
    for rx, tipo in ((TOKEN_PROD, "token de produção"), (TOKEN_TESTE, "token de teste")):
        tok = next((v for t, _, v in tipos if t == tipo), None)
        if tok:
            cid = rx.fullmatch(tok).group(1)  # type: ignore[union-attr]
            S.guardar(cid)  # o pedaço também: o token inteiro já está no limpo(), o número sozinho não estava
            return cid, sec, f"o 2º pedaço do {tipo}"
    return None, sec, ""


def cliente(pares: list[tuple[str, str]]) -> tuple[str | None, str | None]:
    cid, sec, _ = cliente_detalhado(pares)
    return cid, sec


def exigir_cliente(pares: list[tuple[str, str]] | None) -> tuple[str, str]:
    cid, sec = cliente(pares or [])
    if not sec:
        raise FaltaDele("sem o Client Secret no cofre (W2-a, passo 5): a troca do code espera o FIM — nada gravado")
    if not cid:
        raise FaltaDele(f"sem o client id no cofre (nem um campo client_id nem um token no item \"{ITEM}\") — nada gravado")
    return cid, sec


def token_de_producao(pares: list[tuple[str, str]]) -> str | None:
    return unico([(tipo_de(n, v), n, v) for n, v in pares], "token de produção")


# ───────────────────────── os subcomandos ─────────────────────────


def cofre_campos(r: S.Remoto, a: argparse.Namespace) -> int:
    lido = ler_campos(r, ITEM)
    if lido is None:
        S.ok(False, f"o item \"{ITEM}\" não existe no cofre ({S.PROJETO_COFRE})")
        return 1
    pares = pares_de(lido[1])
    S.nota(f"cofre {S.PROJETO_COFRE} › \"{ITEM}\" (tipo {lido[0]}): {len(pares)} campo(s) com valor")
    for n, v in pares:
        t = tipo_de(n, v)
        S.nota(f"campo {nome_na_tela(n)}: {t} · {len(v)} caractere{'' if len(v) == 1 else 's'}"
               + (dentro_do_texto(v) if t == "outro" else ""))
    for nome in (ITEM_USUARIOS, ITEM_TESTE_APP):
        outro = ler_campos(r, nome)
        campos = ", ".join(nome_na_tela(n).strip('"') for n, _ in pares_de(outro[1])) if outro else ""
        S.nota(f"\"{nome}\": " + ("não existe" if outro is None else f"existe (tipo {outro[0]}; campos {campos or 'nenhum'})"))
    cid, sec, origem = cliente_detalhado(pares)
    S.ok(cid, f"client id: achado ({origem}; {len(cid)} dígitos)" if cid else "client id: NÃO achado")
    numeros = {m.group(1) for _, v in pares for rx in (TOKEN_PROD, TOKEN_TESTE) if (m := rx.fullmatch(v))}
    if cid and origem.startswith("campo") and numeros and cid not in numeros:
        S.nota("o client id do campo é diferente do número da aplicação no token: confira qual é o da PhysiqCalc")
    if S.ok(sec, f"client secret: achado ({len(sec)} caracteres, sha8 {S.sha8(sec)})" if sec
            else "client secret: NÃO achado — é o passo 5 da W2-a (FIM, dele)"):
        S.depois("a cópia local para a prova:  python3 scripts/segredos/mp_conta.py oauth local")
        return 0
    S.depois(f"no FIM (W2-a, passo 5) ele salva o Client Secret no item \"{ITEM}\" (campo client_secret); "
             "depois  mp_conta.py oauth local")
    return 2


def exigir_cliente_teste(r: S.Remoto) -> tuple[str, str]:
    """O par da aplicação de TESTE do integrador (plano B do I6). Sem o item ou sem o par → Falha (sai 1): quem grava é o
    e2e/w2/painel_mp_teste.py (não é coisa DELE — o plano B roda com usuários de teste)."""
    pares = ler_item(r, ITEM_TESTE_APP)
    if pares is None:
        raise S.Falha(f"o item \"{ITEM_TESTE_APP}\" não existe no cofre: rode o e2e/w2/painel_mp_teste.py (plano B do I6)")
    cid, sec = cliente(pares)
    if not (cid and sec):
        raise S.Falha(f"\"{ITEM_TESTE_APP}\" existe, mas sem client_id e client_secret — nada gravado")
    return cid, sec


def gravar_oauth_local(cid: str, sec: str, nome: str, a: argparse.Namespace) -> bool:
    destino = casa() / nome
    texto = f"~/{nome} (600): client_id {len(cid)} dígitos, client_secret {len(sec)} caracteres (sha8 {S.sha8(sec)})"
    if a.dry_run:
        S.nota(f"--dry-run: gravaria {texto}")
        return True
    conteudo = {"client_id": cid, "client_secret": sec}
    S.gravar_arquivo(destino, json.dumps(conteudo))
    return S.ok(modo_600(destino) and json.loads(destino.read_text(encoding="utf-8")) == conteudo, texto)


def oauth_local(r: S.Remoto, a: argparse.Namespace) -> int:
    if a.staging:
        certo = gravar_oauth_local(*exigir_cliente_teste(r), ARQ_OAUTH_STAGING, a)
        if certo and not a.dry_run:
            S.depois("quem lê: a prova com a aplicação de teste (e2e/w2/prova_public_key.py --client staging)")
        return 0 if certo else 1
    certo = gravar_oauth_local(*exigir_cliente(ler_item(r, ITEM)), ARQ_OAUTH, a)
    if certo and not a.dry_run:
        S.depois("quem lê: a prova da Task 1 (e2e/w2/prova_public_key.py) e o oauth_real do e2e/w2/api.py")
    return 0 if certo else 1


def post_oauth_token(corpo: dict) -> tuple[int, dict]:
    """POST /oauth/token → (status, corpo). O corpo da resposta só sai pelo limpo() (o erro e a mensagem); nunca um token."""
    req = urllib.request.Request(OAUTH_TOKEN, method="POST", data=json.dumps(corpo).encode("utf-8"),
                                 headers={"Content-Type": "application/json", "Accept": "application/json", "User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            status, txt = resp.status, resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        try:
            status, txt = e.code, e.read().decode("utf-8", "replace")
        finally:
            e.close()
    except (urllib.error.URLError, OSError) as e:
        raise S.Falha(f"POST /oauth/token: sem resposta ({e})") from None
    try:
        dados = json.loads(txt or "{}")
    except json.JSONDecodeError:
        dados = {}
    dados = dados if isinstance(dados, dict) else {}
    for k in ("access_token", "refresh_token", "public_key", "user_id"):
        if dados.get(k) not in (None, ""):
            S.guardar(str(dados[k]))  # não devia vir (o code é inventado), mas se vier não sai
    return status, dados


def oauth_testar(r: S.Remoto, a: argparse.Namespace) -> int:
    """O par no POST /oauth/token com um code INVENTADO (o formato TG-… do MP): o par certo → 400 invalid_grant; o mesmo client_id com
    um secret FALSO (o controle: prova que o MP separa os 2 erros) → invalid_client. Nenhum token é criado (o code não existe)."""
    cid, sec = exigir_cliente_teste(r) if a.staging else exigir_cliente(ler_item(r, ITEM))
    qual = "da aplicação de TESTE do integrador" if a.staging else "da aplicação PhysiqCalc"
    if a.dry_run:
        S.nota(f"--dry-run: chamaria o POST /oauth/token 2 vezes com um code inventado (o par {qual} e o controle) — nada criado")
        return 0
    falso = "".join(secrets.choice("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789") for _ in range(len(sec)))
    resultados = {}
    for rotulo, segredo in (("o par", sec), ("o controle (secret falso)", falso)):
        code = S.guardar(f"TG-{secrets.token_hex(12)}-{secrets.randbelow(10**9):09d}")
        st, d = post_oauth_token({"client_id": cid, "client_secret": segredo, "grant_type": "authorization_code", "code": code,
                                  "redirect_uri": REDIRECT_DA_PROVA})
        erro = d.get("error") if isinstance(d.get("error"), str) else None
        resultados[rotulo] = erro
        S.nota(f"{rotulo}: HTTP {st} · error {erro!r} · message {str(d.get('message') or '')[:120]!r}")
    par_ok = resultados["o par"] == "invalid_grant"
    controle_ok = resultados["o controle (secret falso)"] == "invalid_client"
    S.ok(par_ok, f"o client {qual} (client_id {len(cid)} dígitos, secret sha8 {S.sha8(sec)}): "
         + ("VÁLIDO — o MP aceitou o client e recusou só o code inventado" if par_ok
            else "NÃO confere (esperado invalid_grant)"))
    S.ok(controle_ok, "o controle: o secret falso dá invalid_client" if controle_ok
         else "o controle NÃO deu invalid_client — a conferência não separa os 2 erros (ler a mensagem acima)")
    return 0 if par_ok and controle_ok else 1


def gravar_aplicacao_teste(r: S.Remoto, cid: str, sec: str, url: str | None = None) -> bool:
    """Plano B do I6 — quem chama é o e2e/w2/painel_mp_teste.py, com os valores lidos DIRETO do navegador: grava o client da aplicação de
    TESTE no cofre (tipo token: valor = o client secret; extras client_id e client_secret; a nota; a url da página dela no painel), lê de
    volta e confere; depois ~/.physiq-mp-oauth-staging.json (600). Na tela só ✅/❌, tamanho e sha8."""
    cid, sec = str(cid).strip(), str(sec).strip()
    S.guardar(cid)
    S.guardar(sec)
    if not (cid.isdigit() and 6 <= len(cid) <= 20):
        raise S.Falha(f"o client id lido do painel não tem o formato (só dígitos; {len(cid)} caracteres) — nada gravado")
    if not SECRET.fullmatch(sec):
        raise S.Falha(f"o client secret lido do painel não tem o formato (letras e dígitos, 20 a 64; {len(sec)} caracteres) — nada gravado")
    lido = ler_campos(r, ITEM_TESTE_APP)
    if lido is not None and lido[0] != "token":
        raise S.Falha(f"\"{ITEM_TESTE_APP}\" existe com o tipo {lido[0]}, não token: ajuste no cofre — nada gravado")
    campos = lido[1] if lido else {}
    nossos = {"client_id", "client_secret"}
    extras = [e for e in (campos.get("extras") or []) if isinstance(e, dict) and e.get("nome") not in nossos]
    extras += [{"nome": "client_id", "valor": cid, "oculto": False}, {"nome": "client_secret", "valor": sec, "oculto": True}]
    gravar: dict = {"valor": sec, "extras": extras, "notas": NOTA_APP_TESTE}
    if url:
        gravar["url"] = url
    erro, texto = r._mcp().ferramenta("salvar_segredo", {"projeto": S.PROJETO_COFRE, "nome": ITEM_TESTE_APP, "tipo": "token",
                                                         "campos": gravar})
    if erro:
        raise S.Falha(f"cofre: salvar \"{ITEM_TESTE_APP}\" falhou — {texto[:200]}")
    volta = cliente(ler_item(r, ITEM_TESTE_APP) or [])
    if not S.ok(volta == (cid, sec), f"cofre {S.PROJETO_COFRE} › \"{ITEM_TESTE_APP}\": client_id {len(cid)} dígitos e client_secret "
                                     f"{len(sec)} caracteres (sha8 {S.sha8(sec)}) gravados e lidos de volta iguais"):
        return False
    return gravar_oauth_local(cid, sec, ARQ_OAUTH_STAGING, argparse.Namespace(dry_run=False))


def oauth_pares(r: S.Remoto) -> dict[str, str]:
    cid, sec = exigir_cliente(ler_item(r, ITEM))
    segredos = {"MP_CLIENT_ID": cid, "MP_CLIENT_SECRET": sec}
    teste = ler_item(r, ITEM_TESTE_APP)
    if teste is not None:
        tcid, tsec = cliente(teste)
        if tcid and tsec:
            segredos |= {"MP_CLIENT_ID_STAGING": tcid, "MP_CLIENT_SECRET_STAGING": tsec}
        else:
            S.nota(f"\"{ITEM_TESTE_APP}\" existe, mas sem client_id e client_secret: os _STAGING ficam de fora")
    return segredos


def conferir_nas_funcoes(r: S.Remoto, segredos: dict[str, str]) -> int:
    nas_funcoes = r.segredos("principal")
    certo = True
    for nome, valor in segredos.items():
        d = nas_funcoes.get(nome)
        igual = d == S.sha256_hex(valor)
        estado = "= o cofre" if igual else ("não existe" if d is None else "DIFERENTE do cofre")
        certo = S.ok(igual, f"{nome} nas funções do principal {estado} (sha8 do cofre {S.sha8(valor)})") and certo
    return 0 if certo else 1


def oauth_copiar(r: S.Remoto, a: argparse.Namespace) -> int:
    segredos = oauth_pares(r)
    if a.dry_run:
        for nome, valor in segredos.items():
            S.nota(f"--dry-run: gravaria {nome} ({len(valor)} caracteres, sha8 {S.sha8(valor)}) nas funções do {S.onde('principal')}")
        return 0
    for nome, valor in segredos.items():
        r.gravar_segredo("principal", nome, valor)
    rc = conferir_nas_funcoes(r, segredos)
    S.depois("publicar de novo as funções que leem o client (o segredo é lido no boot do isolate) — Task 14")
    return rc


def oauth_conferir(r: S.Remoto, a: argparse.Namespace) -> int:
    return conferir_nas_funcoes(r, oauth_pares(r))


def usuario_do_cofre(c: dict[str, str], papel: str) -> dict[str, str]:
    """O que o arquivo do papel leva, dos extras do item; no vendedor, o login de topo cobre o login e a senha que faltarem."""
    d = {arq: c.get(f"{papel}_{cof}") for cof, arq in CAMPOS_USUARIO}
    d["codigo_verificacao"] = c.get(f"{papel}_codigo_verificacao")
    if papel == "vendedor":
        if not (d["nickname"] or d["email"]):
            d["nickname"] = c.get("usuario")
        d["password"] = d["password"] or c.get("senha")
    return {k: v for k, v in d.items() if v}


def tem_usuario(d: dict[str, str]) -> bool:
    return bool(d.get("id") or d.get("nickname") or d.get("email"))


def faltam_no(d: dict[str, str]) -> list[str]:
    """O que a prova (Task 1) e o E2E precisam de cada um: o id, a senha e o login (o apelido ou o e-mail)."""
    return [k for k in ("id", "password") if not d.get(k)] + ([] if d.get("nickname") or d.get("email") else ["nickname/email"])


def arquivo_do_papel(papel: str) -> Path:
    return casa() / f".physiq-mp-{papel}-teste.json"


def gravar_arquivo_do_papel(papel: str, d: dict[str, str], a: argparse.Namespace) -> bool:
    destino = arquivo_do_papel(papel)
    faltam = faltam_no(d)
    texto = f"~/{destino.name} (600): chaves {sorted(d)}" + (f" — faltam {faltam}" if faltam else "")
    if a.dry_run:
        S.nota(f"--dry-run: gravaria {texto}")
        return True
    S.gravar_arquivo(destino, json.dumps(d, ensure_ascii=False))
    return S.ok(modo_600(destino) and not faltam, texto)


def perfil_na_tela(v: object) -> str:
    """O "profile" que o POST /users/test devolve (a doc não fala dele): na tela só se for um rótulo curto; objeto → só as chaves."""
    if isinstance(v, str) and PERFIL.fullmatch(v):
        return f" | profile {v!r}"
    if isinstance(v, dict):
        return f" | profile (objeto; chaves {sorted(map(str, v))})"
    return "" if v in (None, "") else f" | profile ({type(v).__name__})"


def criar_usuario_teste(token: str, papel: str) -> dict:
    """POST /users/test (MLB) com o token de PRODUÇÃO da aplicação — a referência do MP traz "Bearer APP_USR-…" e site_id +
    description obrigatórios — → id, nickname, password (e email, se vier). Cada valor vai para o limpo() antes de qualquer mensagem."""
    req = urllib.request.Request(USERS_TEST, method="POST",
                                 data=json.dumps({"site_id": "MLB", "description": f"Physiq W2 {papel}"}).encode("utf-8"),
                                 headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json",
                                          "Accept": "application/json", "User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            status, txt = resp.status, resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        try:
            txt = e.read().decode("utf-8", "replace")
        except Exception:  # noqa: BLE001 — sem corpo, só o status
            txt = ""
        finally:
            e.close()
        raise S.Falha(f"POST /users/test ({papel}): HTTP {e.code} {txt[:300]}") from None
    except (urllib.error.URLError, OSError) as e:
        raise S.Falha(f"POST /users/test ({papel}): sem resposta ({e})") from None
    try:
        corpo = json.loads(txt)
    except json.JSONDecodeError:
        corpo = None
    if not isinstance(corpo, dict):
        raise S.Falha(f"POST /users/test ({papel}): HTTP {status}, resposta fora do formato")
    for _, arq in CAMPOS_USUARIO:
        if corpo.get(arq) not in (None, ""):
            S.guardar(str(corpo[arq]))
    if not corpo.get("id") or not corpo.get("password"):
        raise S.Falha(f"POST /users/test ({papel}): HTTP {status} sem id ou senha na resposta (chaves {sorted(corpo)})")
    return corpo


def salvar_usuarios(r: S.Remoto, lido: tuple[str, dict] | None, dados: dict[str, dict[str, str]], papeis: list[str]) -> None:
    """Grava no cofre os usuários dos papéis dados: os extras deles entram e os outros ficam (o salvar_segredo troca a lista inteira de
    extras — o código do painel, por exemplo, tem de ir junto); item novo leva o login de topo (o vendedor), a URL e a nota."""
    campos = lido[1] if lido else {}
    nossos = {f"{p}_{cof}" for p in papeis for cof, _ in CAMPOS_USUARIO}
    extras = [e for e in (campos.get("extras") or []) if isinstance(e, dict) and e.get("nome") not in nossos]
    extras += [{"nome": f"{p}_{cof}", "valor": dados[p][arq], "oculto": cof == "senha"}
               for p in papeis for cof, arq in CAMPOS_USUARIO if dados[p].get(arq)]
    gravar: dict = {"extras": extras}
    if lido is None:
        if "vendedor" not in dados:  # o login de topo é o do vendedor: o usuarios_criar já para antes de qualquer POST
            raise S.Falha(f"\"{ITEM_USUARIOS}\" não existe: crie antes o par vendedor + comprador (usuarios-teste criar)")
        v = dados["vendedor"]
        gravar |= {"usuario": v.get("nickname") or v.get("email") or "", "senha": v.get("password") or "",
                   "url": "https://www.mercadopago.com.br", "notas": NOTA_USUARIOS}
    erro, texto = r._mcp().ferramenta("salvar_segredo", {"projeto": S.PROJETO_COFRE, "nome": ITEM_USUARIOS, "tipo": "login",
                                                         "campos": gravar})
    if erro:
        raise S.Falha(f"cofre: salvar \"{ITEM_USUARIOS}\" falhou — {texto[:200]}")


def usuarios_criar(r: S.Remoto, a: argparse.Namespace) -> int:
    papeis = [a.papel] if getattr(a, "papel", None) else list(PAPEIS)
    lido = ler_campos(r, ITEM_USUARIOS)
    if lido is not None and lido[0] != "login":
        raise S.Falha(f"\"{ITEM_USUARIOS}\" existe com o tipo {lido[0]}, não login: ajuste no cofre — nenhum usuário criado")
    dados = {p: usuario_do_cofre(dict(pares_de(lido[1])) if lido else {}, p) for p in papeis}
    criar = [p for p in papeis if not tem_usuario(dados[p])]
    if not criar:
        S.nota("os usuários de teste já estão no cofre: só os 2 arquivos (nenhum POST /users/test)" if len(papeis) > 1
               else f"o {papeis[0]} de teste já está no cofre: só o arquivo (nenhum POST /users/test)")
        return 0 if all([gravar_arquivo_do_papel(p, dados[p], a) for p in papeis]) else 1
    if lido is None and "vendedor" not in papeis:
        raise S.Falha(f"\"{ITEM_USUARIOS}\" não existe: crie antes o par vendedor + comprador (usuarios-teste criar) — nenhum "
                      f"{', '.join(criar)} criado")
    if lido is not None and len(papeis) > 1:
        S.nota(f"no cofre já está o {', '.join(p for p in papeis if p not in criar)}: só o que falta é criado ({', '.join(criar)})")
    tok = token_de_producao(ler_item(r, ITEM) or [])
    if not tok:
        raise FaltaDele("sem o token de produção no cofre: os usuários de teste vão para o FIM (W2-a, passo 7)")
    if a.dry_run:
        S.nota(f"--dry-run: criaria {len(criar)} usuário(s) de teste ({', '.join(criar)}) — POST /users/test, MLB, com o token de "
               f"produção só na memória — e gravaria no cofre \"{ITEM_USUARIOS}\" (tipo login) e nos arquivos 600")
        return 0
    for papel in criar:
        corpo = criar_usuario_teste(tok, papel)
        dados[papel] = {arq: str(corpo[arq]) for _, arq in CAMPOS_USUARIO if corpo.get(arq) not in (None, "")}
        S.gravar_arquivo(arquivo_do_papel(papel), json.dumps(dados[papel], ensure_ascii=False))  # se o cofre falhar, não se perde
        S.nota(f"{papel}: criado no MP (id com {len(dados[papel]['id'])} dígitos) | chaves da resposta {sorted(corpo)}"
               + perfil_na_tela(corpo.get("profile")))
        try:
            salvar_usuarios(r, lido, dados, [papel])
        except S.Falha as e:
            raise S.Falha(f"{e} — o {papel} de teste foi criado e está só em ~/{arquivo_do_papel(papel).name} (600): "
                          "salve no cofre pela tela") from None
        lido = ler_campos(r, ITEM_USUARIOS)
        volta = usuario_do_cofre(dict(pares_de(lido[1])) if lido else {}, papel)
        if not S.ok(volta.get("id") == dados[papel]["id"] and volta.get("password") == dados[papel]["password"],
                    f"cofre {S.PROJETO_COFRE} › \"{ITEM_USUARIOS}\": o {papel} gravado e lido de volta igual"):
            return 1
    return 0 if all([gravar_arquivo_do_papel(p, dados[p], a) for p in papeis]) else 1


# ───────────────────────── Task 11: a chave dos tokens (MP_TOKENS_CHAVE) e a assinatura dos avisos ─────────────────────────


def chave_valida(valor: str | None) -> bool:
    """32 bytes em base64url = 43 caracteres de [A-Za-z0-9_-] (o "=" do fim é tolerado) — o que o importarChave do _shared/cifra-mp.ts
    aceita. Fora disso as funções leem "sem chave" (chaveDoAmbiente → null → nao_configurada)."""
    return bool(valor) and bool(CHAVE_FORMATO.fullmatch(valor or ""))


def chave_do_cofre(r: S.Remoto) -> str | None:
    """A chave do item do cofre (só na memória; o ler_campos já a pôs no limpo()). Item de outro tipo → Falha (ninguém escolhe por ele)."""
    lido = ler_campos(r, ITEM_CHAVE)
    if lido is None:
        return None
    if lido[0] != "token":
        raise S.Falha(f"\"{ITEM_CHAVE}\" existe com o tipo {lido[0]}, não token: ajuste no cofre — nada gerado nem gravado")
    return dict(pares_de(lido[1])).get("valor") or None


def resumo_da_chave(valor: str) -> str:
    return f"{len(valor)} caracteres, sha8 {S.sha8(valor)}"


def chave_gerar(r: S.Remoto, a: argparse.Namespace) -> int:
    """Revisão I10: SÓ cria quando a MP_TOKENS_CHAVE não existe em lugar nenhum. Existindo igual nas 2 pontas → ✅ "já existe" e sai 0, sem
    gerar; só num lado, diferente ou fora do formato → ❌ e PARA, sem gravar nada. Gerar de novo por cima apagaria o acesso de TODOS os
    personais (o código só conhece a v1, e os segredos das funções valem para o staging e o public juntos). Trocar a chave é outro comando
    (chave trocar), fora da W2."""
    no_cofre = chave_do_cofre(r)
    nas_funcoes = r.segredos("principal").get(SEGREDO_CHAVE)
    if no_cofre and nas_funcoes:
        if not chave_valida(no_cofre):
            S.ok(False, f"a MP_TOKENS_CHAVE do cofre está fora do formato ({len(no_cofre)} caracteres; são 32 bytes em base64url): as "
                        "funções não conseguem usá-la — PARAR e conferir à mão (não gerar)")
            return 1
        igual = nas_funcoes == S.sha256_hex(no_cofre)
        S.ok(igual, "a MP_TOKENS_CHAVE já existe" + (" e as funções = o cofre: nada a fazer" if igual else
                                                      " e as funções ≠ o cofre — PARAR (não gerar): investigue com  mp_conta.py chave conferir")
             + f" (cofre: {resumo_da_chave(no_cofre)})")
        return 0 if igual else 1
    if no_cofre:
        S.ok(False, f"a MP_TOKENS_CHAVE existe só no cofre ({resumo_da_chave(no_cofre)}) — PARAR: gerar de novo trocaria a do cofre. Se "
                    "as funções nunca tiveram a chave (um gerar que parou entre o cofre e as funções), copie a do cofre:  "
                    "python3 scripts/segredos/mp_conta.py chave copiar")
        return 1
    if nas_funcoes:
        S.ok(False, "a MP_TOKENS_CHAVE existe só nas funções do principal — PARAR: o valor delas não volta (a API devolve só o digest) "
                    "e gerar outra apagaria o acesso de TODOS os personais. Conferir à mão (não gerar, não apagar)")
        return 1
    if a.dry_run:
        S.nota(f"--dry-run: geraria a chave (32 bytes aleatórios, base64url de 43 caracteres) → cofre \"{ITEM_CHAVE}\" (tipo token, lida "
               f"de volta) → {SEGREDO_CHAVE} nas funções do {S.onde('principal')} → conferir pelo digest. Nada gerado.")
        return 0
    nova = S.guardar(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode().rstrip("=")) or ""
    erro, texto = r._mcp().ferramenta("salvar_segredo", {"projeto": S.PROJETO_COFRE, "nome": ITEM_CHAVE, "tipo": "token",
                                                         "campos": {"valor": nova, "notas": NOTA_CHAVE}})
    if erro:
        raise S.Falha(f"cofre: salvar \"{ITEM_CHAVE}\" falhou — {texto[:200]} — nada foi para as funções")
    if chave_do_cofre(r) != nova:
        S.ok(False, "o cofre não devolveu a chave igual — nada foi para as funções (confira o item à mão antes de qualquer coisa)")
        return 1
    S.ok(True, f"cofre {S.PROJETO_COFRE} › \"{ITEM_CHAVE}\": chave nova ({resumo_da_chave(nova)}) gravada e lida de volta igual")
    r.gravar_segredo("principal", SEGREDO_CHAVE, nova)  # PRIMEIRO no cofre, DEPOIS nas funções
    rc = chave_conferir(r, a)
    S.depois(PUBLICAR_CHAVE)
    return rc


def chave_copiar(r: S.Remoto, a: argparse.Namespace) -> int:
    """Termina um `chave gerar` que parou entre o cofre e as funções: a chave do COFRE vai para as funções SÓ quando as funções ainda não
    têm nenhuma. Nunca gera; nunca troca a que as funções têm (essa pode ser a que cifrou os tokens de hoje)."""
    no_cofre = chave_do_cofre(r)
    nas_funcoes = r.segredos("principal").get(SEGREDO_CHAVE)
    if not no_cofre:
        if nas_funcoes:
            S.ok(False, "a MP_TOKENS_CHAVE existe só nas funções do principal — PARAR: o valor delas não volta (só o digest); conferir à mão")
        else:
            S.ok(False, "sem a MP_TOKENS_CHAVE no cofre (nem nas funções): é a 1ª vez —  python3 scripts/segredos/mp_conta.py chave gerar")
        return 1
    if not chave_valida(no_cofre):
        S.ok(False, f"a MP_TOKENS_CHAVE do cofre está fora do formato ({len(no_cofre)} caracteres; são 32 bytes em base64url) — nada copiado")
        return 1
    if nas_funcoes is not None:
        igual = nas_funcoes == S.sha256_hex(no_cofre)
        S.ok(igual, "a MP_TOKENS_CHAVE já está nas funções e = o cofre: nada a copiar" if igual else
             "as funções já têm OUTRA MP_TOKENS_CHAVE — PARAR: copiar trocaria a chave que cifrou os tokens de hoje (conferir à mão)")
        return 0 if igual else 1
    if a.dry_run:
        S.nota(f"--dry-run: copiaria a chave do cofre ({resumo_da_chave(no_cofre)}) para {SEGREDO_CHAVE} nas funções do {S.onde('principal')}")
        return 0
    r.gravar_segredo("principal", SEGREDO_CHAVE, no_cofre)
    rc = chave_conferir(r, a)
    S.depois(PUBLICAR_CHAVE)
    return rc


def chave_conferir(r: S.Remoto, a: argparse.Namespace) -> int:
    no_cofre = chave_do_cofre(r)
    nas_funcoes = r.segredos("principal").get(SEGREDO_CHAVE)
    if not no_cofre and nas_funcoes is None:
        S.ok(False, "a MP_TOKENS_CHAVE não existe em lugar nenhum (nem no cofre nem nas funções): é a Task 14 —  "
                    "python3 scripts/segredos/mp_conta.py chave gerar")
        return 1
    if not no_cofre:
        S.ok(False, f"sem a MP_TOKENS_CHAVE no cofre (\"{ITEM_CHAVE}\"), mas as funções do principal têm uma — conferir à mão (não gerar)")
        return 1
    formato = chave_valida(no_cofre)
    igual = nas_funcoes == S.sha256_hex(no_cofre)
    estado = "= o cofre" if igual else ("não existe" if nas_funcoes is None else "DIFERENTE do cofre")
    certo = S.ok(formato and igual, f"{SEGREDO_CHAVE} nas funções do principal {estado} ({resumo_da_chave(no_cofre)})"
                 + ("" if formato else " — a do cofre está fora do formato (são 32 bytes em base64url)"))
    return 0 if certo else 1


def assinatura_do_cofre(r: S.Remoto) -> str:
    """A assinatura secreta do painel (W2-a, passo 6) — só na memória. Sem o item (ou sem o campo valor) → FaltaDele (sai 2: é do FIM)."""
    valor = dict(ler_item(r, ITEM_ASSINATURA) or []).get("valor")
    if not valor:
        raise FaltaDele(f"sem \"{ITEM_ASSINATURA}\" (campo valor) no cofre: é o passo 6 da W2-a (FIM, dele) — nada gravado")
    if not ASSINATURA_FORMATO.fullmatch(valor):
        raise S.Falha(f"a assinatura do cofre está fora do formato ({len(valor)} caracteres; sem espaço, sem endereço) — confira o item "
                      f"\"{ITEM_ASSINATURA}\" — nada gravado")
    return valor


def assinatura_copiar(r: S.Remoto, a: argparse.Namespace) -> int:
    valor = assinatura_do_cofre(r)
    if a.dry_run:
        S.nota(f"--dry-run: gravaria {SEGREDO_ASSINATURA} ({len(valor)} caracteres, sha8 {S.sha8(valor)}) nas funções do {S.onde('principal')}")
        return 0
    r.gravar_segredo("principal", SEGREDO_ASSINATURA, valor)
    rc = conferir_nas_funcoes(r, {SEGREDO_ASSINATURA: valor})
    S.depois("publicar de novo a mp-webhook-aluno (o segredo é lido no boot do isolate) — Task 23")
    return rc


def assinatura_conferir(r: S.Remoto, a: argparse.Namespace) -> int:
    return conferir_nas_funcoes(r, {SEGREDO_ASSINATURA: assinatura_do_cofre(r)})


# ───────────────────────── linha de comando ─────────────────────────


COMANDOS = {("cofre", "campos"): cofre_campos, ("oauth", "local"): oauth_local, ("oauth", "testar"): oauth_testar,
            ("oauth", "copiar"): oauth_copiar, ("oauth", "conferir"): oauth_conferir, ("usuarios-teste", "criar"): usuarios_criar}
# Task 11: a chave dos tokens (só nasce uma vez — I10) e a assinatura dos avisos (a Task 23 roda)
COMANDOS |= {("chave", "gerar"): chave_gerar, ("chave", "copiar"): chave_copiar, ("chave", "conferir"): chave_conferir,
             ("assinatura", "copiar"): assinatura_copiar, ("assinatura", "conferir"): assinatura_conferir}
COM_STAGING = {("oauth", "local"), ("oauth", "testar")}
COM_PAPEL = {("usuarios-teste", "criar")}


def argumentos(argv: list[str] | None = None) -> argparse.Namespace:
    ap = argparse.ArgumentParser(prog="mp_conta.py", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("grupo", choices=sorted({g for g, _ in COMANDOS}), help="o grupo (lista acima)")
    ap.add_argument("subcomando", help="o subcomando do grupo (lista acima)")
    ap.add_argument("--dry-run", "--seco", dest="dry_run", action="store_true",
                    help="lê o cofre, mas não grava nada (nem cofre, nem funções, nem arquivo) e não chama o MP")
    ap.add_argument("--staging", action="store_true",
                    help="oauth local|testar: o client da aplicação de TESTE do integrador (plano B do I6), não o da PhysiqCalc")
    ap.add_argument("--papel", choices=TODOS_OS_PAPEIS,
                    help="usuarios-teste criar: só este papel (o integrador do plano B do I6 — 1 só); sem ele, o par vendedor + comprador")
    a = ap.parse_args(argv)
    if (a.grupo, a.subcomando) not in COMANDOS:
        ap.error(f"comando desconhecido: {a.grupo} {a.subcomando} — os que existem: " + ", ".join(" ".join(c) for c in COMANDOS))
    if a.staging and (a.grupo, a.subcomando) not in COM_STAGING:
        ap.error("--staging só vale em: " + ", ".join(" ".join(c) for c in sorted(COM_STAGING)))
    if a.papel and (a.grupo, a.subcomando) not in COM_PAPEL:
        ap.error("--papel só vale em: usuarios-teste criar")
    return a


def main(argv: list[str] | None = None, remoto: S.Remoto | None = None) -> int:
    a = argumentos(argv)
    r = remoto or S.Remoto()
    print(f"== mp_conta · {a.grupo} {a.subcomando}" + (" · --dry-run: nada é gravado" if a.dry_run else ""), flush=True)
    try:
        return COMANDOS[(a.grupo, a.subcomando)](r, a)
    except FaltaDele as e:
        S.ok(False, str(e))
        return 2
    except S.Falha as e:
        S.ok(False, str(e))  # o ok() passa pelo limpo(): nenhum valor guardado sai
        return 1
    except Exception as e:  # noqa: BLE001 — nada sai sem passar pelo limpo()
        S.ok(False, f"erro inesperado ({type(e).__name__}): {e}\n{traceback.format_exc()}")
        return 1
    finally:
        r.fechar()


if __name__ == "__main__":
    sys.exit(main())
