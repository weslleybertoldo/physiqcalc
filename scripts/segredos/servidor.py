#!/usr/bin/env python3
"""Physiq hml-16c (H-51) — os segredos entre os servidores, 1 por finalidade: gera, publica, troca e confere sem mostrar valor.

Uso:  python3 scripts/segredos/servidor.py <finalidade> <subcomando> [--dry-run] [--so-atual] [--forcar]

Cada finalidade tem o seu segredo. Quem MANDA guarda o valor (SEGREDO_X nas funções; no S8, o Vault do banco principal); quem
RECEBE guarda só o sha256 dele, na lista SEGREDO_X_ACEITOS ("h1" ou "h1,h2": o atual e, durante a troca, o anterior). O
cabeçalho é sempre o x-espelho-segredo. O valor mora no cofre B Code Segredos › PhysiqCalc › "Physiq — SEGREDO_X (hml-16c)"
(tipo token: campo valor; o de antes no extra "anterior", oculto). Na tela só aparecem ✅/❌, sha8 (8 hex do sha256) e tamanho.

Finalidade             emissor (manda o valor)                          receptor (confere pela lista)
  S1 espelho_nucleo    principal: espelho-enviar                        Treino: espelho-nucleo
  S2 ponte_calc        principal: pos-login                             Treino: vincular-professor (modo servidor)
  S3 conta_treino      principal: excluir-minha-conta, exportar-meus-dados  Treino: delete-my-account (modo servidor)
  S4 espelho_resumo    Treino: trocar-token                             principal: espelho-resumo
  S5 repasse_vinculo   Treino: vincular-professor (app), admin-delete-user  principal: vincular-aluno (modo servidor)
  S6 repasse_convites  Treino: professor-convites                       principal: alunos (acao: repasse)
  S7 aviso_erro        Treino: as 13 funções do _shared/avisar-erro.ts  principal: erro-avisar
  S8 espelho_fila      banco principal: {public,staging}.espelho_disparar() (pg_net) lê o Vault physiq_espelho_fila_segredo;
                       cópia local dos E2E ~/.physiq-segredo-espelho-fila (600)  →  principal: espelho-enviar

A troca de um segredo, em ordem — sem reserva, o canal fica de pé em todos os passos porque a lista do receptor aceita o que
o emissor manda (o anterior até o fim, o atual desde o começo):
  gerar → aceitar (a lista com 2 hashes: o atual e o anterior) → publicar o receptor → trocar → publicar o emissor →
  conferir → aceitar --so-atual (o anterior deixa de valer) → publicar o receptor.

Subcomandos:
  gerar        valor novo (64 caracteres) → cofre (o atual vira o extra "anterior") → lido de volta igual; no S8 também a cópia
               local. Trava: o emissor já manda um SEGREDO_X que não é o atual do cofre (gerar de novo perderia o valor em uso).
  aceitar      receptor: SEGREDO_X_ACEITOS = sha256(atual)[,sha256(anterior)] → confere o digest. --so-atual: só o atual (o fim
               da troca). Trava: a lista nova deixaria de fora o que o emissor manda hoje.
  trocar       emissor: SEGREDO_X = atual (S8: o Vault physiq_espelho_fila_segredo) → confere. Antes: a lista do receptor tem de
               aceitar o atual; senão para sem gravar (esta trava não tem --forcar).
  tirar-lista  receptor: apaga a SEGREDO_X_ACEITOS → o receptor recusa tudo (o canal para). Trava: o emissor ainda manda o
               SEGREDO_X (S8: o Vault existe).
  conferir     o emissor manda o atual? a lista do receptor aceita o atual? Sai 1 se algo não bate.
Depois de mudar um segredo das funções, publicar de novo quem o lê (o segredo é lido no boot do isolate):
scripts/deploy_function.sh <ref> <pasta> <slug> <verify_jwt>.

Credenciais: PAT em ~/.pc-pat (Management API; exige User-Agent). Cofre pelo MCP local (JSON-RPC por stdio): PHYSIQ_COFRE_NODE
(padrão ~/.local/node/bin/node) e PHYSIQ_COFRE_MCP (padrão ~/projetos/b-code-segredos/mcp/dist/index.mjs).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import secrets
import subprocess
import threading
import traceback
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path

REFS = {"principal": "hkxvtsbwctxkrqzkkdoz", "treino": "uxwpwdbbnlticxgtzcsb"}
ROTULOS = {"principal": "principal", "treino": "Treino"}
API = "https://api.supabase.com"
UA = "physiq-unificado/1.0 (segredos/servidor)"
PROJETO_COFRE = "PhysiqCalc"
EXTRA_ANTERIOR = "anterior"
FORMATO = re.compile(r"[A-Za-z0-9_-]{32,}")  # o que o gerar cria (token_urlsafe, 64): ≥ 32 como o _shared/segredo-servidor.ts
HEX64 = re.compile(r"[0-9a-f]{64}")
UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
NOME_VAULT = re.compile(r"[a-z_]+")
TEMPO_COFRE = 90  # segundos por chamada ao MCP do cofre
SUBCOMANDOS = ("gerar", "aceitar", "trocar", "tirar-lista", "conferir")
DESCRICAO_VAULT = "Physiq hml-16c (S8): segredo da fila do espelho; o pg_net manda na espelho-enviar (scripts/segredos/servidor.py)"
TREZE_DO_TREINO = (
    "admin-avaliacoes", "admin-delete-user", "admin-list-users", "admin-semana-treinos", "admin-update-user", "delete-my-account",
    "espelho-nucleo", "master-professores", "mp-payments", "mp-webhook", "professor-convites", "trocar-token", "vincular-professor",
)


@dataclass(frozen=True)
class Finalidade:
    chave: str
    numero: str
    segredo: str  # o nome do segredo do EMISSOR (no S8, o nome lógico: o emissor é o Vault); a lista é <segredo>_ACEITOS
    emissor: str  # "principal" | "treino"
    receptor: str
    manda: tuple[str, ...]  # funções que mandam (publicar de novo depois do trocar)
    confere: tuple[str, ...]  # funções que conferem (publicar de novo depois do aceitar/tirar-lista)
    vault: str | None = None  # S8: o emissor é o banco, pelo Vault do principal
    arquivo: str | None = None  # S8: a cópia local dos E2E (em ~)

    @property
    def lista(self) -> str:
        return f"{self.segredo}_ACEITOS"

    @property
    def item(self) -> str:
        return f"Physiq — {self.segredo} (hml-16c)"


FINALIDADES = {f.chave: f for f in (
    Finalidade("espelho_nucleo", "S1", "SEGREDO_ESPELHO_NUCLEO", "principal", "treino", ("espelho-enviar",), ("espelho-nucleo",)),
    Finalidade("ponte_calc", "S2", "SEGREDO_PONTE_CALC", "principal", "treino", ("pos-login",), ("vincular-professor",)),
    Finalidade("conta_treino", "S3", "SEGREDO_CONTA_TREINO", "principal", "treino", ("excluir-minha-conta", "exportar-meus-dados"),
               ("delete-my-account",)),
    Finalidade("espelho_resumo", "S4", "SEGREDO_ESPELHO_RESUMO", "treino", "principal", ("trocar-token",), ("espelho-resumo",)),
    Finalidade("repasse_vinculo", "S5", "SEGREDO_REPASSE_VINCULO", "treino", "principal", ("vincular-professor", "admin-delete-user"),
               ("vincular-aluno",)),
    Finalidade("repasse_convites", "S6", "SEGREDO_REPASSE_CONVITES", "treino", "principal", ("professor-convites",), ("alunos",)),
    Finalidade("aviso_erro", "S7", "SEGREDO_AVISO_ERRO", "treino", "principal", TREZE_DO_TREINO, ("erro-avisar",)),
    Finalidade("espelho_fila", "S8", "SEGREDO_ESPELHO_FILA", "principal", "principal", (), ("espelho-enviar",),
               vault="physiq_espelho_fila_segredo", arquivo=".physiq-segredo-espelho-fila"),
)}


# ───────────────────────── regras puras (sem rede) ─────────────────────────


def sha256_hex(texto: str) -> str:
    return hashlib.sha256(texto.encode("utf-8")).hexdigest()


def sha8(texto: str) -> str:
    return sha256_hex(texto)[:8]


def valor_novo() -> str:
    """64 caracteres de [A-Za-z0-9_-] (48 bytes aleatórios): o que o contrato da hml-16c pede."""
    valor = secrets.token_urlsafe(48)
    assert len(valor) == 64 and FORMATO.fullmatch(valor)
    return valor


def lista_de(atual: str, anterior: str | None = None) -> str:
    """A SEGREDO_X_ACEITOS: sha256 hex minúsculo, o atual primeiro, separados por vírgula, sem espaço ("h1" ou "h1,h2")."""
    hashes = [sha256_hex(atual)]
    if anterior and anterior != atual:
        hashes.append(sha256_hex(anterior))
    return ",".join(hashes)


def formas_da_lista(atual: str, anterior: str | None = None) -> dict[str, str]:
    """Os digests (o que a Management API devolve: sha256 da string guardada) das listas que aceitam o atual → o nome da forma."""
    ha = sha256_hex(atual)
    formas = {sha256_hex(ha): "só o atual"}
    if anterior and anterior != atual:
        hp = sha256_hex(anterior)
        formas[sha256_hex(f"{ha},{hp}")] = "atual + anterior"
        formas[sha256_hex(f"{hp},{ha}")] = "anterior + atual"
    return formas


def valores(campos: dict) -> tuple[str, str | None]:
    """(atual, anterior) de um item do cofre: o campo valor e o extra "anterior"."""
    atual = str(campos.get("valor") or "").strip()
    anterior = ""
    for extra in campos.get("extras") or []:
        if isinstance(extra, dict) and extra.get("nome") == EXTRA_ANTERIOR:
            anterior = str(extra.get("valor") or "").strip()
    guardar(atual)
    guardar(anterior)
    return atual, (anterior or None)


def campos_do_gerar(campos: dict | None, novo: str, nota_nova: str) -> dict:
    """O que o salvar_segredo recebe: valor novo; o atual vai para o extra "anterior" (os outros extras ficam: o MCP troca a
    lista de extras inteira); item novo leva a nota."""
    gravar: dict = {"valor": novo}
    atual = valores(campos)[0] if campos else ""
    extras = [e for e in ((campos or {}).get("extras") or []) if isinstance(e, dict) and e.get("nome") != EXTRA_ANTERIOR]
    if atual:
        extras.append({"nome": EXTRA_ANTERIOR, "valor": atual, "oculto": True})
    if extras:
        gravar["extras"] = extras
    if campos is None:
        gravar["notas"] = nota_nova
    return gravar


def _lit(texto: str) -> str:
    return "'" + texto.replace("'", "''") + "'"


def _vault_nome(nome: str) -> str:
    if not NOME_VAULT.fullmatch(nome):
        raise ValueError("nome de Vault fora do formato")
    return nome


def sql_vault_estado(nome: str, hashes: list[str]) -> str:
    """Só o tamanho e se o sha256 do valor bate com cada hash: nem o valor nem o hash dele saem do banco."""
    if not hashes or not all(HEX64.fullmatch(h) for h in hashes):
        raise ValueError("hash fora do formato")
    comparar = ", ".join(f"v.d = '{h}'" for h in hashes)
    return (f"select v.tam, array[{comparar}]::boolean[] as bate from (select length(s.decrypted_secret) as tam, "
            "encode(sha256(convert_to(s.decrypted_secret, 'UTF8')), 'hex') as d from vault.decrypted_secrets s "
            f"where s.name = '{_vault_nome(nome)}') v")


def sql_vault_conta(nome: str) -> str:
    return f"select count(*)::int as n from vault.secrets where name = '{_vault_nome(nome)}'"


def sql_vault_id(nome: str) -> str:
    return f"select id::text as id from vault.secrets where name = '{_vault_nome(nome)}'"


def sql_vault_criar(valor: str, nome: str) -> str:
    if not FORMATO.fullmatch(valor):
        raise ValueError("valor fora do formato")
    return f"select vault.create_secret({_lit(valor)}, {_lit(_vault_nome(nome))}, {_lit(DESCRICAO_VAULT)})"


def sql_vault_atualizar(id_: str, valor: str) -> str:
    if not UUID.fullmatch(id_) or not FORMATO.fullmatch(valor):
        raise ValueError("id ou valor fora do formato")
    return f"select vault.update_secret({_lit(id_)}::uuid, {_lit(valor)})"


# ───────────────────────── nunca mostrar valor ─────────────────────────

_SENSIVEIS: set[str] = set()


def guardar(valor: str | None) -> str | None:
    """Registra um valor (e o sha256 dele): nenhuma mensagem que sai daqui leva um nem outro."""
    if valor:
        _SENSIVEIS.add(valor)
        _SENSIVEIS.add(sha256_hex(valor))
    return valor


def limpo(texto: object) -> str:
    saida = str(texto)
    for s in sorted(_SENSIVEIS, key=len, reverse=True):
        saida = saida.replace(s, "‹oculto›")
    return saida


def ok(cond: object, texto: str) -> bool:
    print(("✅ " if cond else "❌ ") + limpo(texto), flush=True)
    return bool(cond)


def nota(texto: str) -> None:
    print("⚪ " + limpo(texto), flush=True)


def depois(texto: str) -> None:
    print("→ " + limpo(texto), flush=True)


class Falha(Exception):
    """Erro da Management API ou do cofre: a mensagem passa pelo limpo() antes de sair."""


# ───────────────────────── o que sai da máquina ─────────────────────────


class _McpCofre:
    """O MCP do cofre B Code Segredos por stdio (JSON-RPC), como ~/projetos/physiqcalc-scratch/hml/cofre.py. A saída dele (o
    valor decifrado) só é lida na memória: nunca vai para a tela nem para arquivo."""

    def __init__(self) -> None:
        node = os.environ.get("PHYSIQ_COFRE_NODE") or str(Path.home() / ".local/node/bin/node")
        mcp = os.environ.get("PHYSIQ_COFRE_MCP") or str(Path.home() / "projetos/b-code-segredos/mcp/dist/index.mjs")
        for caminho in (node, mcp):
            if not Path(caminho).exists():
                raise Falha(f"não achei {caminho} (PHYSIQ_COFRE_NODE / PHYSIQ_COFRE_MCP)")
        self._p = subprocess.Popen([node, mcp], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                   text=True, encoding="utf-8")
        self._n = 0
        self._pedir("initialize", {"protocolVersion": "2024-11-05", "capabilities": {},
                                   "clientInfo": {"name": "physiq-segredos-servidor", "version": "1"}})
        self._enviar({"jsonrpc": "2.0", "method": "notifications/initialized"})

    def _enviar(self, obj: dict) -> None:
        try:
            self._p.stdin.write(json.dumps(obj) + "\n")  # type: ignore[union-attr]
            self._p.stdin.flush()  # type: ignore[union-attr]
        except OSError:
            raise Falha("o MCP do cofre fechou") from None

    def _pedir(self, metodo: str, params: dict) -> dict:
        self._n += 1
        n = self._n
        relogio = threading.Timer(TEMPO_COFRE, self._p.kill)
        relogio.daemon = True
        relogio.start()
        try:
            self._enviar({"jsonrpc": "2.0", "id": n, "method": metodo, "params": params})
            while True:
                linha = self._p.stdout.readline()  # type: ignore[union-attr]
                if not linha:
                    raise Falha(f"o MCP do cofre fechou sem responder ({metodo}; espera máxima {TEMPO_COFRE} s)")
                try:
                    msg = json.loads(linha)
                except json.JSONDecodeError:
                    continue
                if isinstance(msg, dict) and msg.get("id") == n:
                    return msg
        finally:
            relogio.cancel()

    def ferramenta(self, nome: str, argumentos: dict) -> tuple[bool, str]:
        msg = self._pedir("tools/call", {"name": nome, "arguments": argumentos})
        if "error" in msg:
            raise Falha(f"cofre {nome}: {str((msg.get('error') or {}).get('message'))[:200]}")
        res = msg.get("result") or {}
        texto = "".join(c.get("text", "") for c in res.get("content", []) if isinstance(c, dict))
        return bool(res.get("isError")), texto

    def fechar(self) -> None:
        try:
            self._p.stdin.close()  # type: ignore[union-attr]
        except OSError:
            pass
        self._p.terminate()
        try:
            self._p.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self._p.kill()
            self._p.wait(timeout=5)
        self._p.stdout.close()  # type: ignore[union-attr]


class Remoto:
    """Management API do Supabase (segredos das funções e SQL do Vault do principal) e o cofre. O --dry-run nunca cria um."""

    def __init__(self) -> None:
        self._pat: str | None = None
        self._cofre: _McpCofre | None = None

    # ── Management API ──
    def _token(self) -> str:
        if self._pat is None:
            self._pat = Path.home().joinpath(".pc-pat").read_text(encoding="utf-8").strip()
        return self._pat

    def api(self, metodo: str, caminho: str, corpo: object = None) -> object:
        dados = None if corpo is None else json.dumps(corpo).encode("utf-8")
        cab = {"Authorization": f"Bearer {self._token()}", "User-Agent": UA}
        if dados is not None:
            cab["Content-Type"] = "application/json"
        req = urllib.request.Request(f"{API}{caminho}", data=dados, method=metodo, headers=cab)
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                status, txt = resp.status, resp.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            status, txt = e.code, e.read().decode("utf-8", "replace")
        except (urllib.error.URLError, OSError) as e:
            raise Falha(f"{metodo} {caminho}: sem resposta ({e})") from None
        if not 200 <= status < 300:
            raise Falha(f"{metodo} {caminho}: HTTP {status} {txt[:300]}")
        try:
            return json.loads(txt) if txt.strip() else None
        except json.JSONDecodeError:
            return txt

    def segredos(self, lado: str) -> dict[str, str]:
        """Os segredos das funções do projeto: nome → digest (a API devolve o sha256 do valor guardado, nunca o valor)."""
        lista = self.api("GET", f"/v1/projects/{REFS[lado]}/secrets")
        if not isinstance(lista, list):
            raise Falha(f"GET …/secrets do {ROTULOS[lado]}: resposta fora do formato")
        return {str(i.get("name")): str(i.get("value") or "").lower() for i in lista if isinstance(i, dict)}

    def gravar_segredo(self, lado: str, nome: str, valor: str) -> None:
        self.api("POST", f"/v1/projects/{REFS[lado]}/secrets", [{"name": nome, "value": valor}])

    def apagar_segredos(self, lado: str, nomes: list[str]) -> None:
        self.api("DELETE", f"/v1/projects/{REFS[lado]}/secrets", nomes)

    def sql(self, query: str) -> list:
        """SQL no banco principal (o Vault do S8 é de lá)."""
        r = self.api("POST", f"/v1/projects/{REFS['principal']}/database/query", {"query": query})
        if r is None:
            return []
        if not isinstance(r, list):
            raise Falha("database/query: resposta fora do formato")
        return r

    # ── Vault do principal (S8) ──
    def vault_estado(self, nome: str, hashes: list[str]) -> tuple[bool, list[bool], int | None]:
        """(existe?, o sha256 do valor bate com cada hash?, tamanho) — o valor não sai do banco."""
        linhas = self.sql(sql_vault_estado(nome, hashes))
        if not linhas:
            return False, [False] * len(hashes), None
        bate = linhas[0].get("bate") or []
        return True, [bool(b) for b in bate], linhas[0].get("tam")

    def vault_existe(self, nome: str) -> bool:
        linhas = self.sql(sql_vault_conta(nome))
        return bool(linhas) and int(linhas[0].get("n") or 0) > 0

    def vault_gravar(self, nome: str, valor: str) -> None:
        linhas = self.sql(sql_vault_id(nome))
        if linhas:
            id_ = str(linhas[0].get("id") or "")
            if not UUID.fullmatch(id_):
                raise Falha(f"Vault {nome}: id fora do formato")
            self.sql(sql_vault_atualizar(id_, valor))
        else:
            self.sql(sql_vault_criar(valor, nome))

    # ── cofre ──
    def _mcp(self) -> _McpCofre:
        if self._cofre is None:
            self._cofre = _McpCofre()
        return self._cofre

    def cofre_ler(self, item: str) -> dict | None:
        """Os campos do item (tipo token) ou None se ele não existe."""
        erro, texto = self._mcp().ferramenta("ler_segredo", {"projeto": PROJETO_COFRE, "nome": item})
        if erro:
            if texto.startswith("ITEM_NAO_ENCONTRADO"):
                return None
            raise Falha(f"cofre: ler \"{item}\" falhou — {texto[:200]}")
        try:
            dados = json.loads(texto)
        except json.JSONDecodeError:
            raise Falha(f"cofre: a leitura de \"{item}\" veio fora do formato") from None
        campos = dados.get("campos") if isinstance(dados, dict) else None
        if not isinstance(campos, dict):
            raise Falha(f"cofre: a leitura de \"{item}\" veio sem campos")
        if dados.get("tipo") != "token":
            raise Falha(f"cofre: \"{item}\" é do tipo {dados.get('tipo')}, não token")
        valores(campos)  # registra o atual e o anterior antes de qualquer mensagem
        return campos

    def cofre_salvar(self, item: str, campos: dict) -> None:
        erro, texto = self._mcp().ferramenta(
            "salvar_segredo", {"projeto": PROJETO_COFRE, "nome": item, "tipo": "token", "campos": campos})
        if erro:
            raise Falha(f"cofre: salvar \"{item}\" falhou — {texto[:200]}")

    def fechar(self) -> None:
        if self._cofre is not None:
            self._cofre.fechar()
            self._cofre = None


# ───────────────────────── os subcomandos ─────────────────────────


def onde(lado: str) -> str:
    return f"{ROTULOS[lado]} ({REFS[lado]})"


def emissor_txt(f: Finalidade) -> str:
    if f.vault:
        return f"Vault {f.vault} do banco {onde(f.emissor)}"
    return f"{f.segredo} nas funções do {onde(f.emissor)}"


def nota_do_item(f: Finalidade) -> str:
    return (f"hml-16c (H-51) {f.numero} {f.chave}: quem manda = {emissor_txt(f)}; quem confere = {', '.join(f.confere)} "
            f"({ROTULOS[f.receptor]}), pela lista {f.lista} (só o sha256). Gerado e trocado por scripts/segredos/servidor.py; "
            "o valor de antes fica no extra \"anterior\".")


def publicar(lado: str, funcoes: tuple[str, ...]) -> str:
    pasta = "supabase-principal/functions" if lado == "principal" else "supabase/functions"
    return f"scripts/deploy_function.sh {REFS[lado]} {pasta} <slug> <verify_jwt de hoje> — {', '.join(funcoes)}"


def do_cofre(f: Finalidade, r: Remoto) -> tuple[str, str | None]:
    """(atual, anterior) do item da finalidade; sem o item ou fora do formato, para."""
    campos = r.cofre_ler(f.item)
    if campos is None:
        raise Falha(f"o cofre não tem \"{f.item}\" ({PROJETO_COFRE}): rode antes  servidor.py {f.chave} gerar")
    atual, anterior = valores(campos)
    if not FORMATO.fullmatch(atual):
        raise Falha(f"o valor de \"{f.item}\" está fora do formato do gerar ({len(atual)} caracteres)")
    if anterior and not FORMATO.fullmatch(anterior):
        nota("o extra \"anterior\" está fora do formato: fica de fora")
        anterior = None
    return atual, anterior


def emissor_manda(f: Finalidade, r: Remoto, hashes: list[str]) -> tuple[bool, str | None]:
    """O que o emissor manda HOJE: (tem o SEGREDO_X — no S8, o Vault?, qual dos hashes ele manda — None se nenhum)."""
    if f.vault:
        existe, bate, _ = r.vault_estado(f.vault, hashes)
        return existe, next((h for h, b in zip(hashes, bate) if b), None)
    digest = r.segredos(f.emissor).get(f.segredo)
    return digest is not None, (digest if digest in hashes else None)


def gravar_arquivo(caminho: Path, valor: str) -> None:
    """600 desde o 1º byte (arquivo novo ao lado + rename): o valor nunca fica legível por outro usuário."""
    novo = caminho.with_name(caminho.name + ".novo")
    fd = os.open(novo, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    os.fchmod(fd, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as arq:
        arq.write(valor)
    os.replace(novo, caminho)


def estado_arquivo(caminho: Path, atual: str | None = None) -> str:
    if not caminho.exists():
        return "não existe"
    valor = caminho.read_text(encoding="utf-8").strip()
    guardar(valor)
    modo = oct(caminho.stat().st_mode & 0o777)[2:]
    igual = "" if atual is None else (" · igual ao cofre" if valor == atual else " · DIFERENTE do cofre")
    return f"existe ({modo}, {len(valor)} caracteres, sha8 {sha8(valor)}){igual}"


def gerar(f: Finalidade, r: Remoto, a: argparse.Namespace) -> int:
    campos = r.cofre_ler(f.item)
    atual = valores(campos)[0] if campos else ""
    if atual and not a.forcar:
        tem, bate = emissor_manda(f, r, [sha256_hex(atual)])
        if tem and not bate:
            ok(False, f"o emissor ({emissor_txt(f)}) manda um valor que não é o atual do cofre (sha8 {sha8(atual)}): gerar de "
                      "novo tiraria do cofre o valor em uso. Veja com  conferir; --forcar passa. Nada mudou.")
            return 1
    novo = valor_novo()
    while novo == atual:
        novo = valor_novo()
    guardar(novo)
    r.cofre_salvar(f.item, campos_do_gerar(campos, novo, nota_do_item(f)))
    lido = r.cofre_ler(f.item)
    l_atual, l_anterior = valores(lido or {})
    certo = ok(l_atual == novo, f"cofre {PROJETO_COFRE} › \"{f.item}\": valor novo ({len(novo)} caracteres, sha8 {sha8(novo)}) "
                                + ("lido de volta igual" if l_atual == novo else "NÃO voltou igual na leitura"))
    if atual:
        certo = ok(l_anterior == atual, f"o valor de antes (sha8 {sha8(atual)}) "
                                        + ("está no extra \"anterior\"" if l_anterior == atual else "NÃO ficou no extra \"anterior\"")) and certo
    else:
        nota("item novo: sem valor anterior")
    if f.arquivo:
        caminho = Path.home() / f.arquivo
        gravar_arquivo(caminho, novo)
        certo = ok(caminho.read_text(encoding="utf-8").strip() == novo and caminho.stat().st_mode & 0o777 == 0o600,
                   f"cópia local ~/{f.arquivo}: {estado_arquivo(caminho, novo)}") and certo
    depois(f"aceitar no receptor:  python3 scripts/segredos/servidor.py {f.chave} aceitar")
    return 0 if certo else 1


def aceitar(f: Finalidade, r: Remoto, a: argparse.Namespace) -> int:
    atual, anterior = do_cofre(f, r)
    junto = None if a.so_atual else anterior
    lista = lista_de(atual, junto)
    hashes = lista.split(",")
    if not a.forcar:
        tem, bate = emissor_manda(f, r, hashes)
        if tem and not bate:
            ok(False, f"o emissor ({emissor_txt(f)}) manda um valor que a lista nova não aceita: o receptor passaria a "
                      "recusá-lo. " + ("Troque o emissor antes (trocar) ou rode sem --so-atual. " if a.so_atual else "")
                      + "--forcar passa. Nada mudou.")
            return 1
    r.gravar_segredo(f.receptor, f.lista, lista)
    digest = r.segredos(f.receptor).get(f.lista)
    texto = (f"receptor {onde(f.receptor)}: {f.lista} = {len(hashes)} hash(es) — atual sha8 {sha8(atual)}"
             + (f", anterior sha8 {sha8(junto)}" if junto else "")
             + (" · digest confere" if digest == sha256_hex(lista) else " · o digest NÃO confere"))
    certo = ok(digest == sha256_hex(lista), texto)
    if a.so_atual and anterior:
        nota(f"o anterior (sha8 {sha8(anterior)}) saiu da lista (--so-atual)")
    depois(f"publicar de novo o receptor (isolates novos): {publicar(f.receptor, f.confere)}")
    depois(f"depois: trocar o emissor:  python3 scripts/segredos/servidor.py {f.chave} trocar")
    return 0 if certo else 1


def trocar(f: Finalidade, r: Remoto, a: argparse.Namespace) -> int:
    atual, anterior = do_cofre(f, r)
    digest = r.segredos(f.receptor).get(f.lista)
    formas = formas_da_lista(atual, anterior)
    if digest not in formas:
        ok(False, f"a lista do receptor ({f.lista} no {onde(f.receptor)}) "
                  + ("não existe" if digest is None else "não aceita o atual")
                  + f" (atual sha8 {sha8(atual)}): rode  aceitar  e publique o receptor antes. Nada mudou.")
        return 1
    ok(True, f"a lista do receptor aceita o atual ({formas[digest]})")
    h = sha256_hex(atual)
    if f.vault:
        r.vault_gravar(f.vault, atual)
        existe, bate, tam = r.vault_estado(f.vault, [h])
        certo = ok(existe and bate[0] and tam == len(atual),
                   f"emissor: Vault {f.vault} ({onde(f.emissor)}) = atual (sha8 {sha8(atual)})"
                   + (f" · igual, tamanho {tam}" if existe and bate[0] else f" · NÃO confere (existe={existe}, tamanho {tam})"))
        depois("a próxima rodada da fila (pg_cron, ≤ 10 min) já manda o novo: log da espelho-enviar com via=lista")
    else:
        r.gravar_segredo(f.emissor, f.segredo, atual)
        d = r.segredos(f.emissor).get(f.segredo)
        certo = ok(d == h, f"emissor {onde(f.emissor)}: {f.segredo} = atual (sha8 {sha8(atual)}, {len(atual)} caracteres)"
                           + (" · digest confere" if d == h else " · o digest NÃO confere"))
        depois(f"publicar de novo o emissor (isolates novos): {publicar(f.emissor, f.manda)}")
    depois(f"depois:  python3 scripts/segredos/servidor.py {f.chave} conferir  e, no fim da troca,  aceitar --so-atual  e "
           "publicar o receptor (o anterior deixa de valer)")
    return 0 if certo else 1


def tirar_lista(f: Finalidade, r: Remoto, a: argparse.Namespace) -> int:
    manda = r.vault_existe(f.vault) if f.vault else f.segredo in r.segredos(f.emissor)
    if manda:
        if not a.forcar:
            ok(False, f"o emissor ainda manda o segredo ({emissor_txt(f)}): sem a lista o receptor passa a recusá-lo e o canal "
                      "para. --forcar passa. Nada mudou.")
            return 1
        nota("o emissor ainda manda o segredo: o receptor vai recusá-lo e o canal para (--forcar)")
    if f.lista not in r.segredos(f.receptor):
        ok(True, f"{f.lista} já não existe no {onde(f.receptor)}")
        return 0
    r.apagar_segredos(f.receptor, [f.lista])
    certo = ok(f.lista not in r.segredos(f.receptor), f"receptor {onde(f.receptor)}: {f.lista} apagada → o receptor recusa tudo")
    depois(f"publicar de novo o receptor (isolates novos): {publicar(f.receptor, f.confere)}")
    return 0 if certo else 1


def conferir(f: Finalidade, r: Remoto, a: argparse.Namespace) -> int:
    atual, anterior = do_cofre(f, r)
    h = sha256_hex(atual)
    nota(f"cofre {PROJETO_COFRE} › \"{f.item}\": atual sha8 {sha8(atual)} ({len(atual)} caracteres)"
         + (f"; anterior sha8 {sha8(anterior)}" if anterior else "; sem anterior"))
    if f.vault:
        existe, bate, tam = r.vault_estado(f.vault, [h])
        e_ok = ok(existe and bate[0] and tam == len(atual), f"emissor: Vault {f.vault} ({onde(f.emissor)}) "
                  + (f"igual ao atual, tamanho {tam}" if existe and bate[0] else
                     ("não existe (o banco não chama a espelho-enviar: a fila espera)" if not existe
                      else f"DIFERENTE do atual, tamanho {tam}")))
        if f.arquivo:
            nota(f"cópia local ~/{f.arquivo} (E2E): {estado_arquivo(Path.home() / f.arquivo, atual)}")
    else:
        seg = r.segredos(f.emissor)
        d = seg.get(f.segredo)
        if d == h:
            estado = "= sha256(atual)"
        elif d is None:
            estado = "não existe (o emissor não manda nada: sem configuração)"
        else:
            estado = f"digest {d[:8]} ≠ sha256(atual) {h[:8]}" + (" (é o anterior)" if anterior and d == sha256_hex(anterior) else "")
        e_ok = ok(d == h, f"emissor {onde(f.emissor)}: {f.segredo} {estado}")
    d = r.segredos(f.receptor).get(f.lista)
    formas = formas_da_lista(atual, anterior)
    r_ok = ok(d in formas, f"receptor {onde(f.receptor)}: {f.lista} "
              + (f"aceita o atual ({formas[d]})" if d in formas else
                 ("não existe (o receptor recusa tudo)" if d is None else f"digest {d[:8]} não é de uma lista com o atual")))
    return 0 if e_ok and r_ok else 1


ACOES = {"gerar": gerar, "aceitar": aceitar, "trocar": trocar, "tirar-lista": tirar_lista, "conferir": conferir}


# ───────────────────────── --dry-run: só o plano ─────────────────────────


def plano(f: Finalidade, a: argparse.Namespace) -> list[str]:
    """O que o subcomando faria, passo a passo. NADA remoto (nem leitura) e nada gravado; só nomes, projetos e, no S8, o
    estado da cópia local."""
    s = a.subcomando
    re_, ee = REFS[f.receptor], REFS[f.emissor]
    trava = " (--forcar: sem esta trava)" if a.forcar else ""
    linhas = [
        f"== {f.numero} {f.chave} · {s} · DRY-RUN: só o plano — nada remoto (nem leitura) e nada gravado",
        f"   emissor:  {emissor_txt(f)} · manda: "
        + (", ".join(f.manda) if f.manda else "o banco, {public,staging}.espelho_disparar() pelo pg_net"),
        f"   receptor: {f.lista} (só hashes) nas funções do {onde(f.receptor)} · confere: {', '.join(f.confere)}",
        f"   cofre:    {PROJETO_COFRE} › \"{f.item}\" (token: campo valor; o de antes no extra \"{EXTRA_ANTERIOR}\")",
    ]
    if f.arquivo:
        linhas.append(f"   cópia local (E2E): ~/{f.arquivo} — agora: {estado_arquivo(Path.home() / f.arquivo)}")
    ler = f"ler do cofre o item \"{f.item}\": atual e anterior (só na memória)"
    get_e = (f"Vault {f.vault}: SQL que devolve só 'bate'/tamanho (sha256 no banco)" if f.vault
             else f"GET /v1/projects/{ee}/secrets → digest de {f.segredo}")
    passos: list[str]
    if s == "gerar":
        passos = [
            f"ler do cofre o item \"{f.item}\" (se existe: o atual vira o extra \"{EXTRA_ANTERIOR}\"; os outros extras ficam)",
            f"trava, se o item existe: o emissor não pode estar mandando um valor ≠ do atual ({get_e}){trava}",
            "valor novo: secrets.token_urlsafe(48) → 64 caracteres (nunca impresso)",
            f"salvar_segredo {{projeto: {PROJETO_COFRE}, nome: \"{f.item}\", tipo: token, campos: {{valor, extras[{EXTRA_ANTERIOR}]}}}}"
            + " (+ notas, se o item é novo)",
            "ler_segredo de volta: valor = novo e anterior = o de antes (sha256)",
        ]
        if f.arquivo:
            passos.append(f"gravar ~/{f.arquivo} (600, arquivo novo + rename) e reler: igual ao cofre")
        passos.append(f"→ depois: servidor.py {f.chave} aceitar")
    elif s == "aceitar":
        passos = [
            ler + (" — o anterior fica de fora (--so-atual)" if a.so_atual else ""),
            f"lista = sha256(atual)" + ("" if a.so_atual else "[,sha256(anterior) se houver]") + " (hex minúsculo, vírgula, sem espaço)",
            f"trava: o que o emissor manda hoje tem de estar na lista nova ({get_e}){trava}",
            f"POST /v1/projects/{re_}/secrets [{{\"name\": \"{f.lista}\", \"value\": \"‹lista›\"}}]",
            f"GET /v1/projects/{re_}/secrets → digest de {f.lista} = sha256(‹lista›)",
            f"→ depois: publicar de novo {', '.join(f.confere)} ({ROTULOS[f.receptor]}) e  servidor.py {f.chave} trocar",
        ]
    elif s == "trocar":
        passos = [
            ler,
            f"trava (sem --forcar): GET /v1/projects/{re_}/secrets → o digest de {f.lista} tem de ser o de uma lista com "
            "sha256(atual) (\"h(atual)\" ou \"h(atual),h(anterior)\"); senão para sem gravar",
        ]
        if f.vault:
            passos += [
                f"SQL no principal: vault.update_secret(<id>, ‹atual›) se {f.vault} existe; senão "
                f"vault.create_secret(‹atual›, '{f.vault}', '…')",
                f"conferir: o sha256 do Vault = sha256(atual) e o tamanho (SQL que devolve só 'bate'/tamanho)",
                "→ depois: a próxima rodada da fila (pg_cron, ≤ 10 min); log da espelho-enviar com via=lista",
            ]
        else:
            passos += [
                f"POST /v1/projects/{ee}/secrets [{{\"name\": \"{f.segredo}\", \"value\": \"‹atual›\"}}]",
                f"GET /v1/projects/{ee}/secrets → digest de {f.segredo} = sha256(atual)",
                f"→ depois: publicar de novo {', '.join(f.manda)} ({ROTULOS[f.emissor]})",
            ]
        passos.append(f"→ depois: servidor.py {f.chave} conferir → aceitar --so-atual → publicar de novo {', '.join(f.confere)} "
                      f"({ROTULOS[f.receptor]})")
    elif s == "tirar-lista":
        manda = f"Vault {f.vault} existe" if f.vault else f"{f.segredo} existe no {ROTULOS[f.emissor]}"
        passos = [
            f"trava: o emissor não pode estar mandando o segredo ({manda} = recusa){trava}",
            f"DELETE /v1/projects/{re_}/secrets [\"{f.lista}\"] → GET: {f.lista} não existe mais",
            f"→ depois: publicar de novo {', '.join(f.confere)} ({ROTULOS[f.receptor]}): recusa tudo (o canal para)",
        ]
    else:  # conferir
        passos = [
            ler + " → mostra os sha8",
            ("emissor: " + get_e + " = sha256(atual) + o tamanho" if f.vault else f"emissor: {get_e} = sha256(atual)"),
            f"receptor: GET /v1/projects/{re_}/secrets → digest de {f.lista} = o de \"h(atual)\" ou \"h(atual),h(anterior)\"",
        ]
        if f.arquivo:
            passos.append(f"cópia local ~/{f.arquivo}: igual ao cofre? (só aviso; não conta na saída)")
        passos.append("sai 1 se o emissor ou o receptor não bate")
    linhas += [f"  {i}. {p}" if not p.startswith("→") else f"     {p}" for i, p in enumerate(passos, start=1)]
    return linhas


# ───────────────────────── linha de comando ─────────────────────────


def argumentos(argv: list[str] | None = None) -> argparse.Namespace:
    ap = argparse.ArgumentParser(prog="servidor.py", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("finalidade", choices=list(FINALIDADES), help="a finalidade (S1–S8, tabela acima)")
    ap.add_argument("subcomando", choices=SUBCOMANDOS, help="o passo (lista acima)")
    ap.add_argument("--dry-run", action="store_true", help="só o plano: nada remoto (nem leitura) e nada gravado")
    ap.add_argument("--so-atual", action="store_true", help="aceitar: a lista só com o atual (o fim de uma troca)")
    ap.add_argument("--forcar", action="store_true", help="passa a trava do gerar, aceitar e tirar-lista (nunca a do trocar)")
    a = ap.parse_args(argv)
    if a.so_atual and a.subcomando != "aceitar":
        ap.error("--so-atual só vale no aceitar")
    if a.forcar and a.subcomando in ("trocar", "conferir"):
        ap.error("--forcar não vale no trocar nem no conferir")
    return a


def main(argv: list[str] | None = None, remoto: Remoto | None = None) -> int:
    a = argumentos(argv)
    f = FINALIDADES[a.finalidade]
    if a.dry_run:
        print("\n".join(limpo(linha) for linha in plano(f, a)), flush=True)
        return 0
    r = remoto or Remoto()
    print(f"== {f.numero} {f.chave} · {a.subcomando}", flush=True)
    try:
        return ACOES[a.subcomando](f, r, a)
    except Falha as e:
        ok(False, str(e))
        return 1
    except Exception as e:  # noqa: BLE001 — nada sai sem passar pelo limpo()
        ok(False, f"erro inesperado ({type(e).__name__}): {e}\n{traceback.format_exc()}")
        return 1
    finally:
        r.fechar()


if __name__ == "__main__":
    raise SystemExit(main())
