"""Physiq hml-19a (H-41 · H-81 · jeito 2, 11/10/2026) — base dos E2E da hml-19 (api.py, rede.py, laco.py).

Reaproveita a base da hml-17 (e2e/hml17/_base.py: as contas de TESTE, os Logins com o logout LOCAL no fim, a Guarda de escrita da
produção — que desde a hml-19a trata a nutricao e qualquer função desconhecida como gravação —, a Tela com a sessão antes do 1º
documento e os pedidos anotados por alvo, o SQL só leitura) e junta:
  · funcao()/preflight()  a nutricao como a tela chama (POST no domínio próprio: apikey + Bearer + x-schema + Origin) e o OPTIONS;
  · Regras                a lista fechada da função lida do PRÓPRIO TS (node --experimental-strip-types, sem rede): ações, tabelas
                          e o montarGravacao/leitores do servidor — o --seco confere cada pedido dos E2E contra o servidor;
  · classificar/contar    a guarda que CONTA: cada pedido de gravação por tela e por ação — rest nas 18 tabelas do Prontuário (tem de
                          ser 0 depois da hml-19a), rest nas outras, RPC que grava, Storage (o PUT no link assinado à parte), cada ação
                          da nutricao e os GET profiles (o laço de leitura);
  · BarrarNutricao        a rota que BARRA a nutricao no navegador (o laco.py: o aviso "Tentar de novo" e 1 chamada só);
  · saude()               a guarda do /health dos 2 projetos (H-80) antes de cada E2E: ruim → para tudo;
  · Estado                o que a rodada criou (ids, caminhos no Storage, os modelos mexidos no N8), num arquivo: o --limpar desfaz
                          uma rodada que caiu no meio;
  · a massa               "hml19 e2e …" só nas contas de TESTE, só no schema staging.
hml-19b: as 19 tabelas da Dieta (rest_dieta na contagem), as 3 RPCs que o app do aluno chamava direto (paciente_marcar_refeicao,
aluno_marcar_meta, diario_enviar — rpc_grava, mesmo fora do RPC_QUE_GRAVAM de hoje), as regras da Dieta e do app lidas do mesmo TS
(regras(): acoes_dieta, acoes_aluno, tabelas_dieta e o servidor de cada pedido) e o bucket do diário.
hml-19c: a Avaliação — a 4ª lista da nutricao (regras(): acoes_avaliacao, tabelas_avaliacao) e a foto mensal pela admin-avaliacoes do
TREINO (regras_treino(): as ações foto_* e os leitores do admin-avaliacoes/regras.ts, do mesmo jeito, pelo node); funcao_treino() e o
link assinado no Storage do Treino; a sessão do Treino da conta de teste pela MESMA troca do app (trocar-token: guardada e contada no
registro de logins); rest_avaliacao na contagem (antropometrias e fotos_evolucao no principal, physiq_registros_fotos no Treino) e a
aluno_avisar_avaliacao como RPC que grava (saiu do front); o estado guarda as linhas do Treino e os avisos; o mês sentinela 2000-01.
hml-19d: o Financeiro — funcao_fin()/preflight_fin() (a função financeiro, como a tela chama); regras_fin() (a lista fechada e os leitores
de _shared/financeiro-gravar-regras.ts, pelo node, como as outras); rest_financeiro (transacoes, categorias_financeiras, modelos_recibo,
recibos) e rest_pacientes (as tags) na contagem; o estado guarda as linhas de cada dono (a semente de outra conta de teste, as da N1), o
que a rodada marcou como excluído para semear (volta no fim) e as tags originais da aluna; o registro de logins passa a ser o da 19d.
Sem segredo nem dado pessoal na saída: chaves pela Management API, senhas em ~/.physiq-teste-<nome> (600); das respostas só saem
status, códigos, contagens e tempos.
"""
from __future__ import annotations

import importlib.util
import json
import re
import subprocess
import sys
import time
import uuid
from collections import Counter
from pathlib import Path
from urllib.parse import urlparse

sys.dont_write_bytecode = True
AQUI = Path(__file__).resolve().parent
REPO = AQUI.parents[1]

_ESPEC = importlib.util.spec_from_file_location("_base_hml17", REPO / "e2e" / "hml17" / "_base.py")
B17 = importlib.util.module_from_spec(_ESPEC)
sys.modules["_base_hml17"] = B17
_ESPEC.loader.exec_module(B17)  # type: ignore[union-attr]
C, B5 = B17.C, B17.B5

SCRATCH = Path.home() / "projetos" / "physiqcalc-scratch" / "hml" / "hml19"
C.SAIDA = SCRATCH / "agente"
MEDICAO = SCRATCH / "medicao"
PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "hml19" / "a"
PRINTS_B = PRINTS.parent / "b"  # hml-19b: b_editor, b_receita, b_alimento, b_app_marcar, b_semente_erro, b_app_erro
PRINTS_C = PRINTS.parent / "c"  # hml-19c: c_foto_mensal, c_antropometria, c_foto_evolucao, c_foto_erro
PRINTS_D = PRINTS.parent / "d"  # hml-19d: d_lancamentos, d_recibo, d_categorias, d_aluno, d_erro (e d_semente)
ESTADO_ARQ = SCRATCH / "agente" / "e2e_estado.json"
MARCA = "hml19 e2e"
PRINCIPAL_REF = B17.PRINCIPAL_REF
API_P = B17.API_P
API_P_HOST = B17.API_P_HOST
FUNCAO = f"{API_P}/functions/v1/nutricao"
BASES = {"local": "http://localhost:8080", "staging": "https://physiqcalc-staging.vercel.app", "prod": "https://physiqcalc.com.br"}
SCHEMA_DA_BASE = {"local": "staging", "staging": "staging", "prod": "public"}
ORIGEM_FORA = "https://exemplo-fora-da-lista.example"
ORIGEM_PADRAO = "https://physiqcalc.com.br"
# hml-19c: a função do Treino da foto mensal (o domínio próprio do Treino, a chave anon do Treino, a sessão do Treino da pessoa)
TREINO_REF = C.TREINO_REF
API_T_HOST = B17.API_T_HOST
API_T = f"https://{API_T_HOST}"
FUNCAO_TREINO = f"{API_T}/functions/v1/admin-avaliacoes"
ORIGEM_PADRAO_TREINO = "https://physiqcalc.vercel.app"  # o padrão do CORS da admin-avaliacoes (corsHeaders de hoje)
MES_SENTINELA = "2000-01"  # decisão H: o mês da foto mensal de teste (nenhuma foto real usa); a linha vai com mes_ref 2000-01-01
TEMPO_TREINO_S = 45  # decisão J: a admin-avaliacoes é lenta (p50 3,5 s; fria até ~10 s) — o teto da tela (adminAvaliacoes: 45 s)

P_CONTA = "w5p-nutri"     # a nutricionista de TESTE (P): a nutri responsável pela w5p-aluna
A_CONTA = "w5p-aluna"     # hml-19b: a aluna de TESTE (o app: marcar refeição/meta e a foto do diário)
N1_CONTA = "w13-dono"     # o profissional de OUTRA conta (N1)
PERSONAL_CONTA = "w5p-personal"  # hml-19c: a personal de TESTE (dono + personal da w5p-aluna): a foto mensal, no Treino
PROD_CONTA = "nutri-legado"  # produção, SÓ LEITURA: nutri.teste.claude@physiqnutri.app

REGRAS_TS = REPO / "supabase-principal" / "functions" / "_shared" / "nutricao-regras.ts"
PADROES_TS = REPO / "supabase-principal" / "functions" / "_shared" / "nutricao-padroes.ts"


_CORTADO: list[str] = []


def corte_vira_saida() -> None:
    """SIGTERM/SIGINT (o `timeout`, o Ctrl+C, o fim da sessão) viram SystemExit: os `finally` da limpeza RODAM quando o processo é
    cortado (antes, o SIGTERM matava na hora e a massa da rodada ficava no staging — o incidente de 11/10 07:50). Os sinais seguintes,
    com a limpeza já em curso, são ignorados (só o SIGKILL interrompe a limpeza)."""
    import signal  # noqa: PLC0415

    def _cortado(sinal: int, _quadro: object) -> None:
        if _CORTADO:
            print(f"(sinal {signal.Signals(sinal).name} de novo: a limpeza já está rodando — ignorado)", flush=True)
            return
        _CORTADO.append(signal.Signals(sinal).name)
        raise SystemExit(f"cortado pelo sinal {signal.Signals(sinal).name} — a limpeza roda agora (finally)")

    for sinal in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sinal, _cortado)


def usar_base(base: str) -> str:
    """local e staging = schema staging (a mesma função publicada atende os 2 schemas pelo x-schema); prod = public."""
    if base not in BASES:
        raise SystemExit(f"base desconhecida: {base} ({', '.join(BASES)})")
    B17.usar_schema(SCHEMA_DA_BASE[base])
    return SCHEMA_DA_BASE[base]


def schema() -> str:
    return B17.schema()


def nova_rodada() -> str:
    """O código da rodada (vai na marca de toda a massa: "hml19 e2e <rodada> …")."""
    return time.strftime("%m%d%H%M") + "-" + uuid.uuid4().hex[:4]


# ───────────────────────── as sessões de TESTE guardadas entre os scripts ─────────────────────────
# o contrato da etapa 2: reaproveitar a sessão entre os scripts e no máximo 10 logins (o registro de cada login de verdade fica em
# agente/logins_etapa2.txt); renovar pelo refresh token NÃO é login. O arquivo das sessões é 600 e fica no TMPDIR da W (fora do repo).
ARQ_SESSOES = SCRATCH / "tmp" / "hml19_sessoes.json"
# hml-19b: o registro da etapa 2 DESTA W (o da 19a, logins_etapa2.txt, fica como estava); começa com os 3 logins da sessão principal
# às 07:48 (o smoke da nutricao v2, já da 19b). hml-19c (decisão G): o registro passa a ser o logins_etapa2_19c.txt (o da 19b fica);
# a troca do Treino (trocar-token) também entra nele — abre uma sessão nova no Auth do Treino. hml-19d (decisão G): o registro passa a
# ser o logins_etapa2_19d.txt (o da 19c fica). hml-20a (decisão G do contrato da 20a): o registro passa a ser o da hml-20a
# (hml20/agente/logins_etapa2_20a.txt — o da 19d fica) e o teto, 6 logins na etapa 2 (a sessão principal guarda 4 para o staging); os
# E2E da hml-20 (e2e/hml20/_base.py) e a regressão da hml-19 contam no MESMO registro. hml-20b (decisão G do contrato da 20b): o registro
# passa a ser o da hml-20b (hml20/agente/logins_etapa2_20b.txt — o da 20a fica); o teto da W segue 10 (no máximo 6 na etapa 2: a sessão
# principal guarda 4 para o smoke e o F6)
REG_LOGINS = SCRATCH.parent / "hml20" / "agente" / "logins_etapa2_20b.txt"
# hml-20a F7 (sessão principal, 12/10/2026): +4 logins para o F7 no staging — o teto da W inteira passa a 10 (os 6 da etapa 2 já usados)
MAX_LOGINS = 10
FOLGA_S = 20 * 60  # o access token reaproveitado vale ainda 20 min: o app não renova no meio de um teste


def _refresh(sessao: dict) -> dict | None:
    """Renova a sessão pelo refresh token (não é login). None = não deu (o refresh já foi usado ou venceu)."""
    st, s, _ = B5.http("POST", f"{API_P}/auth/v1/token?grant_type=refresh_token", {"refresh_token": sessao.get("refresh_token", "")},
                       B5.cab_login(API_P, B5.anon(PRINCIPAL_REF)))
    return s if st == 200 and isinstance(s, dict) and s.get("access_token") else None


def _refresh_treino(sessao: dict) -> dict | None:
    """hml-19c: renova a sessão do TREINO pelo refresh token do Treino (não é login); o id do usuário do Treino fica."""
    st, s, _ = B5.http("POST", f"{API_T}/auth/v1/token?grant_type=refresh_token", {"refresh_token": sessao.get("refresh_token", "")},
                       {"apikey": B5.anon(TREINO_REF), "Content-Type": "application/json"})
    if not (st == 200 and isinstance(s, dict) and s.get("access_token")):
        return None
    return {"access_token": s["access_token"], "refresh_token": s.get("refresh_token"), "expires_at": s.get("expires_at"),
            "treino_user_id": (s.get("user") or {}).get("id") or sessao.get("treino_user_id")}


def trocar_token(token_principal: str) -> tuple[int, dict]:
    """hml-19c: a troca que o app faz (src/nucleo/trocaToken.ts): o login do principal vira uma sessão do Treino. SEM zerar o limite
    da troca (o B5.zerar_limite_troca grava no banco do Treino): com a sessão guardada, a troca acontece 1 vez por conta."""
    st, r, _h = B5.http("POST", f"{API_T}/functions/v1/trocar-token", {}, {"Authorization": f"Bearer {token_principal}", "x-schema": schema(),
                        "Origin": BASES["staging"]}, timeout=60)
    return st, (r if isinstance(r, dict) else {})


class Sessoes:
    """A interface dos Logins da hml-17 (sessao/token/uid/fechar), com a sessão de cada conta de TESTE guardada entre os scripts: vale
    enquanto o access token tiver folga; perto de vencer, o refresh; sem nada, o login (contado, com teto). O fechar() NÃO sai (o próximo
    script reaproveita); o logout local de todas é o sair(), no fim da etapa 2 (api.py --sair)."""

    def __init__(self, motivo: str) -> None:
        self.motivo = motivo
        self.d: dict = {}
        if ARQ_SESSOES.exists():
            try:
                self.d = json.loads(ARQ_SESSOES.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                self.d = {}

    def _salvar(self) -> None:
        ARQ_SESSOES.parent.mkdir(parents=True, exist_ok=True)
        ARQ_SESSOES.write_text(json.dumps(self.d), encoding="utf-8")
        ARQ_SESSOES.chmod(0o600)

    @staticmethod
    def logins_feitos() -> int:
        """Os logins do STAGING já feitos (as linhas do registro). hml-20a: o login da PRODUÇÃO (o smoke só leitura da sessão principal —
        o motivo termina em "prod)", a mesma marca que o prod_f8.py conta) não come o teto do staging da etapa 2."""
        if not REG_LOGINS.exists():
            return 0
        return sum(1 for linha in REG_LOGINS.read_text(encoding="utf-8").splitlines() if linha.strip() and not linha.rstrip().endswith("prod)"))

    def sessao(self, conta: str) -> dict:
        email = B5.CONTAS[conta][0]
        if not (C.eh_email_de_teste(email) or B5.email_de_teste(email)) or "revisao" in email.lower():
            raise SystemExit(f"não é conta de teste: {conta}")
        s = self.d.get(conta)
        if s and int(s.get("expires_at") or 0) - time.time() < FOLGA_S:
            s = _refresh(s)
        if not s:
            n = self.logins_feitos()
            if n >= MAX_LOGINS:
                raise SystemExit(f"os {MAX_LOGINS} logins da etapa 2 já foram usados ({REG_LOGINS}) — sem sessão guardada válida de {conta}")
            s = B5.sessao(conta)
            REG_LOGINS.parent.mkdir(parents=True, exist_ok=True)
            with REG_LOGINS.open("a", encoding="utf-8") as f:
                f.write(f"login {n + 1}/{MAX_LOGINS} {conta} {time.strftime('%H:%M:%S')} ({self.motivo})\n")
        if self.d.get(conta) is not s:
            self.d[conta] = s
            self._salvar()
        return s

    def token(self, conta: str) -> str:
        return self.sessao(conta)["access_token"]

    def uid(self, conta: str) -> str:
        return (self.sessao(conta).get("user") or {}).get("id") or ""

    def sessao_treino(self, conta: str) -> dict:
        """hml-19c: a sessão do TREINO da conta de teste, pela MESMA troca do app (trocar-token), guardada como "treino:<conta>": vale
        enquanto o access token tiver folga; perto de vencer, o refresh do Treino; sem nada, a troca (CONTADA no registro de logins)."""
        chave = f"treino:{conta}"
        s = self.d.get(chave)
        if s and int(s.get("expires_at") or 0) - time.time() < FOLGA_S:
            s = _refresh_treino(s)
        if not s:
            tok = self.token(conta)  # o login do principal antes (ele mesmo entra no registro): o número da troca vem depois dele
            n = self.logins_feitos()
            if n >= MAX_LOGINS:
                raise SystemExit(f"os {MAX_LOGINS} logins da etapa 2 já foram usados ({REG_LOGINS}) — sem sessão do Treino guardada de {conta}")
            st, r = trocar_token(tok)
            if st != 200 or not r.get("access_token"):
                raise SystemExit(f"a troca de token (Treino) de {conta} → {st} {r.get('error') or r.get('erro') or ''}")
            s = {"access_token": r["access_token"], "refresh_token": r.get("refresh_token"), "expires_at": r.get("expires_at"),
                 "treino_user_id": r.get("treino_user_id")}
            REG_LOGINS.parent.mkdir(parents=True, exist_ok=True)
            with REG_LOGINS.open("a", encoding="utf-8") as f:
                f.write(f"login {n + 1}/{MAX_LOGINS} {conta} (Treino: trocar-token) {time.strftime('%H:%M:%S')} ({self.motivo})\n")
        if self.d.get(chave) is not s:
            self.d[chave] = s
            self._salvar()
        return s

    def token_treino(self, conta: str) -> str:
        return self.sessao_treino(conta)["access_token"]

    def uid_treino(self, conta: str) -> str:
        return str(self.sessao_treino(conta).get("treino_user_id") or "")

    def fechar(self, o) -> None:
        """As sessões FICAM para o próximo script (o logout local de todas é o sair, no fim da etapa 2)."""

    def do_navegador(self, conta: str, pg) -> None:
        """Se o app renovou a sessão no meio do teste, a mais nova volta para o arquivo (o refresh token antigo já não vale)."""
        try:
            v = pg.evaluate("() => localStorage.getItem('physiq-principal-auth')")
            s = json.loads(v) if v else None
        except Exception:  # noqa: BLE001
            return
        if isinstance(s, dict) and s.get("access_token") and s.get("refresh_token") \
                and s.get("refresh_token") != (self.d.get(conta) or {}).get("refresh_token"):
            self.d[conta] = s
            self._salvar()

    def sair(self, o) -> None:
        """O logout (scope=local) de cada sessão guardada — no fim da etapa 2. hml-19b: com o access token vencido o logout volta 403 e
        a sessão fica viva no servidor (11/10 09:17: 3 de 4) — antes do logout, o refresh (não é login); a que falhar FICA no arquivo
        (para tentar de novo), e o arquivo só some com todas fora."""
        restam: dict = {}
        for conta, s in list(self.d.items()):
            banco = "treino" if conta.startswith("treino:") else "principal"  # hml-19c: a sessão do Treino sai no Auth do Treino
            if int(s.get("expires_at") or 0) - time.time() < 120:
                s = (_refresh_treino(s) if banco == "treino" else _refresh(s)) or s
            try:
                st: object = C.sair_local(s.get("access_token", ""), banco)
            except Exception as e:  # noqa: BLE001
                st = type(e).__name__
            if not o.ok(st in (200, 204), f"logout (scope=local) da sessão guardada de {conta} ({st})", parar=False):
                restam[conta] = s
        self.d = restam
        if restam:
            self._salvar()
        elif ARQ_SESSOES.exists():
            ARQ_SESSOES.unlink()


# ───────────────────────── a função como a tela chama ─────────────────────────
def funcao(token: str | None, acao: str | None, corpo: dict | None = None, *, origem: str | None = None, schema_: str | None = None,
           sem_auth: bool = False, timeout: int = 60) -> tuple[int, dict, dict, float]:
    """POST na nutricao (status, corpo JSON, cabeçalhos, ms). acao None = sem a chave (o corpo vai como veio)."""
    corpo = dict(corpo or {})
    if acao is not None:
        corpo["acao"] = acao
    cab = {"apikey": B5.anon(PRINCIPAL_REF), "x-schema": schema_ or schema(), "Origin": origem or BASES["staging"]}
    if not sem_auth:
        cab["Authorization"] = f"Bearer {token}"
    t0 = time.time()
    st, r, h = B5.http("POST", FUNCAO, corpo, cab, timeout=timeout)
    return st, (r if isinstance(r, dict) else {}), h or {}, round((time.time() - t0) * 1000)


def preflight(origem: str) -> tuple[int, dict]:
    """O OPTIONS que o navegador manda antes do POST (o CORS da função responde antes de tudo)."""
    cab = {"Origin": origem, "Access-Control-Request-Method": "POST",
           "Access-Control-Request-Headers": "authorization, apikey, content-type, x-schema, x-client-info"}
    st, _r, h = B5.http("OPTIONS", FUNCAO, None, cab, timeout=60)
    return st, h or {}


def cors(h: dict) -> str:
    return C.cabecalho(h, "access-control-allow-origin") or ""


def subir_no_link(bucket: str, caminho: str, token_link: str, conteudo: bytes, mime: str, token_pessoa: str) -> int:
    """O PUT no link assinado (o que o uploadToSignedUrl do supabase-js faz): o arquivo vai direto ao Storage."""
    cab = {"apikey": B5.anon(PRINCIPAL_REF), "Authorization": f"Bearer {token_pessoa}", "Content-Type": mime, "x-upsert": "false",
           "cache-control": "max-age=3600"}
    st, _r, _h = B5.http("PUT", f"{API_P}/storage/v1/object/upload/sign/{bucket}/{caminho}?token={token_link}", conteudo, cab, timeout=60)
    return st


def remover_do_storage(bucket: str, caminhos: list[str], token_pessoa: str) -> tuple[int, int]:
    """Remove objetos COMO A PESSOA (a dona da pasta) — o desfazer da massa de Storage (o SQL não apaga storage.objects)."""
    if not caminhos:
        return 200, 0
    cab = {"apikey": B5.anon(PRINCIPAL_REF), "Authorization": f"Bearer {token_pessoa}"}
    st, r, _h = B5.http("DELETE", f"{API_P}/storage/v1/object/{bucket}", {"prefixes": caminhos}, cab, timeout=60)
    return st, len(r) if isinstance(r, list) else 0


def bucket_dos_anexos(s: str | None = None) -> str:
    return "anexos-staging" if (s or schema()) == "staging" else "anexos"


def bucket_do_diario(s: str | None = None) -> str:
    """hml-19b: o bucket das fotos do diário do ambiente (staging = diario-staging)."""
    return "diario-staging" if (s or schema()) == "staging" else "diario"


# ───────────────────────── hml-19c: a Avaliação (a admin-avaliacoes do Treino e o bucket da evolução) ─────────────────────────
def bucket_da_evolucao(s: str | None = None) -> str:
    """O bucket das fotos de evolução do ambiente (principal; staging = evolucao-staging)."""
    return "evolucao-staging" if (s or schema()) == "staging" else "evolucao"


def bucket_dos_registros(s: str | None = None) -> str:
    """O bucket das fotos mensais do ambiente (Treino; staging = registros-staging)."""
    return "registros-staging" if (s or schema()) == "staging" else "registros"


def funcao_treino(token: str | None, action: str | None, corpo: dict | None = None, *, origem: str | None = None, schema_: str | None = None,
                  sem_auth: bool = False, timeout: int = TEMPO_TREINO_S) -> tuple[int, dict, dict, float]:
    """POST na admin-avaliacoes (Treino) como a tela chama (o adminAvaliacoes() do avaliacaoApi.ts: a chave anon do Treino, o Bearer
    do Treino e o x-schema; 1 tentativa, até 45 s) → (status, corpo JSON, cabeçalhos, ms). action None = sem a chave; schema_="" = sem
    o cabeçalho x-schema."""
    corpo = dict(corpo or {})
    if action is not None:
        corpo["action"] = action
    cab = {"apikey": B5.anon(TREINO_REF), "Origin": origem or BASES["staging"]}
    x = schema() if schema_ is None else schema_
    if x:
        cab["x-schema"] = x
    if not sem_auth:
        cab["Authorization"] = f"Bearer {token}"
    t0 = time.time()
    st, r, h = B5.http("POST", FUNCAO_TREINO, corpo, cab, timeout=timeout)
    return st, (r if isinstance(r, dict) else {}), h or {}, round((time.time() - t0) * 1000)


def preflight_treino(origem: str) -> tuple[int, dict]:
    """O OPTIONS da admin-avaliacoes (o CORS dela: fora da lista → o padrão https://physiqcalc.vercel.app)."""
    cab = {"Origin": origem, "Access-Control-Request-Method": "POST",
           "Access-Control-Request-Headers": "authorization, apikey, content-type, x-schema"}
    st, _r, h = B5.http("OPTIONS", FUNCAO_TREINO, None, cab, timeout=60)
    return st, h or {}


def subir_no_link_treino(bucket: str, caminho: str, token_link: str, conteudo: bytes, mime: str, token_pessoa: str, upsert: bool = True) -> int:
    """O PUT no link assinado do Storage do TREINO (o uploadToSignedUrl da tela, com o "trocar": x-upsert)."""
    cab = {"apikey": B5.anon(TREINO_REF), "Authorization": f"Bearer {token_pessoa}", "Content-Type": mime, "x-upsert": "true" if upsert else "false"}
    st, _r, _h = B5.http("PUT", f"{API_T}/storage/v1/object/upload/sign/{bucket}/{caminho}?token={token_link}", conteudo, cab, timeout=60)
    return st


def remover_do_storage_treino(bucket: str, caminhos: list[str], token_pessoa: str) -> tuple[int, int]:
    """Remove objetos do Storage do TREINO como a pessoa (a personal do aluno) — o desfazer da massa da foto mensal."""
    if not caminhos:
        return 200, 0
    cab = {"apikey": B5.anon(TREINO_REF), "Authorization": f"Bearer {token_pessoa}"}
    st, r, _h = B5.http("DELETE", f"{API_T}/storage/v1/object/{bucket}", {"prefixes": caminhos}, cab, timeout=60)
    return st, len(r) if isinstance(r, list) else 0


def ler_treino(sql: str) -> list[dict]:
    """SQL SÓ LEITURA no banco do Treino (read_only: o Postgres recusa qualquer escrita na transação)."""
    return C.ler(TREINO_REF, sql)


def jpeg_sintetico(lado: int = 16, tom: int = 128) -> bytes:
    """Uma imagem JPEG pequena gerada aqui (nunca foto real): `lado`×`lado`, cinza — a foto mensal e a foto de evolução de teste."""
    import io  # noqa: PLC0415
    from PIL import Image  # noqa: PLC0415
    buf = io.BytesIO()
    Image.new("RGB", (lado, lado), (tom, tom, tom)).save(buf, "JPEG", quality=80)
    return buf.getvalue()


# ───────────────────────── as regras do servidor, lidas do TS (sem rede) ─────────────────────────
_JS_REGRAS = r"""
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const m = await import(pathToFileURL(process.argv[1]).href);
const e = JSON.parse(readFileSync(0, "utf8"));
const saida = { acoes: Object.fromEntries(m.ACOES_NUTRICAO.map((a) => [a, { tabela: m.ACOES[a].tabela, operacao: m.ACOES[a].operacao }])),
  tabelas: [...m.TABELAS_PRONTUARIO], conferidos: [],
  // hml-19b: a Dieta e o app do aluno (as listas à parte; o despacho moduloDoPedido)
  acoes_dieta: Object.fromEntries((m.ACOES_DA_DIETA ?? []).map((a) => [a, { tabela: m.ACOES_DIETA[a].tabela, operacao: m.ACOES_DIETA[a].operacao }])),
  acoes_aluno: [...(m.ACOES_DO_ALUNO ?? [])], tabelas_dieta: [...(m.TABELAS_DIETA ?? [])],
  // hml-19c: a Avaliação (a 4ª lista)
  acoes_avaliacao: Object.fromEntries((m.ACOES_DA_AVALIACAO ?? []).map((a) => [a, { tabela: m.ACOES_AVALIACAO[a].tabela, operacao: m.ACOES_AVALIACAO[a].operacao }])),
  tabelas_avaliacao: [...(m.TABELAS_AVALIACAO ?? [])] };
const dieta = (acao, corpo) => {
  switch (acao) {
    case "padroes_garantir": return m.secaoDoPadraoDaDieta(corpo.secao) ? { ok: true } : { ok: false, erro: "secao_invalida" };
    case "plano_criar": return m.lerPlanoNovo(corpo);
    case "plano_duplicar": return m.lerDuplicarPlano(corpo);
    case "plano_copiar_semana": return m.lerCopiarSemana(corpo);
    case "dieta_ordenar": return m.lerOrdenar(corpo);
    case "receita_salvar": return m.lerReceita(corpo);
    case "alimento_salvar": return m.lerAlimento(corpo);
    case "registro_diario_salvar": return m.lerRegistroDiario(corpo, e.userId);
    case "diario_reagir": return m.lerReacao(corpo, new Date(0));
    case "grupo_receita_excluir": case "diario_excluir": return m.ehUuid(corpo.id) ? { ok: true } : { ok: false, erro: "dados_invalidos", campo: "id" };
    default: return m.montarGravacaoDieta(acao, corpo, e.userId, new Date(0));
  }
};
const aluno = (acao, corpo) => {
  switch (acao) {
    case "aluno_marcar_refeicao": return m.lerMarcacao(corpo, "refeicao_id");
    case "aluno_marcar_meta": return m.lerMarcacao(corpo, "meta_id");
    case "aluno_diario_preparar": return m.lerPedidoDeFotoDoDiario(corpo);
    default: return m.lerEnvioDoDiario(corpo);
  }
};
const avaliacao = (acao, corpo) => {
  switch (acao) {
    case "foto_evolucao_preparar": return m.lerPedidoDeFotoEvolucao(corpo);
    case "foto_evolucao_registrar": return m.lerRegistroDeFotoEvolucao(corpo, e.userId);
    case "foto_evolucao_excluir": return m.ehUuid(corpo.id) ? { ok: true } : { ok: false, erro: "dados_invalidos", campo: "id" };
    case "avaliacao_avisar": return m.ehUuid(corpo.alunoId) ? { ok: true } : { ok: false, erro: "dados_invalidos", campo: "aluno_id" };
    default: return m.montarGravacaoAvaliacao(acao, corpo, e.userId, new Date(0));
  }
};
for (const [acao, corpo] of e.pedidos ?? []) {
  let r;
  const mod = m.moduloDoPedido ? m.moduloDoPedido({ ...corpo, acao }) : null;
  if (mod && mod.modulo === "dieta") r = dieta(acao, corpo);
  else if (mod && mod.modulo === "aluno") r = aluno(acao, corpo);
  else if (mod && mod.modulo === "avaliacao") r = avaliacao(acao, corpo);
  else if (acao === "padroes_garantir") r = m.secaoDoPadrao(corpo.secao) ? { ok: true } : { ok: false, erro: "secao_invalida" };
  else if (acao === "anexo_preparar") r = m.lerPedidoDeAnexo(corpo);
  else if (acao === "anexo_registrar") r = m.lerRegistroDeAnexo(corpo, e.userId);
  else if (acao === "anexo_excluir") r = m.ehUuid(corpo.id) ? { ok: true } : { ok: false, erro: "dados_invalidos", campo: "id" };
  else if (acao === "registro_gestacional_salvar") r = m.lerRegistroGestacional(corpo, e.userId);
  else r = m.montarGravacao(acao, corpo, e.userId, new Date(0));
  saida.conferidos.push({ acao, modulo: mod ? mod.modulo : null, ok: r.ok === true, erro: r.erro ?? null, campo: r.campo ?? null, valores: r.valores ?? null,
    linhas: r.linhas ?? null, r });
}
console.log(JSON.stringify(saida));
"""


def regras(pedidos: list[tuple[str, dict]] | None = None, user_id: str = "33333333-3333-4333-8333-333333333333") -> dict:
    """As regras da função (as ações, as tabelas) e, para cada (acao, corpo), o que o servidor faria — do próprio TS."""
    r = subprocess.run(["node", "--experimental-strip-types", "--no-warnings", "--input-type=module", "-e", _JS_REGRAS, str(REGRAS_TS)],
                       input=json.dumps({"pedidos": pedidos or [], "userId": user_id}), capture_output=True, text=True, timeout=60)
    if r.returncode != 0:
        raise RuntimeError(f"node (regras): {r.stderr.strip()[:400]}")
    return json.loads(r.stdout)


# hml-19c: as regras da admin-avaliacoes do TREINO (supabase/functions/admin-avaliacoes/regras.ts), do mesmo jeito (node, sem rede)
REGRAS_TREINO_TS = REPO / "supabase" / "functions" / "admin-avaliacoes" / "regras.ts"
_JS_REGRAS_TREINO = r"""
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const m = await import(pathToFileURL(process.argv[1]).href);
const e = JSON.parse(readFileSync(0, "utf8"));
const saida = { acoes_foto: [...m.ACOES_FOTO], acoes_de_antes: [...m.ACOES_DE_ANTES], acoes_que_gravam: [...m.ACOES_QUE_GRAVAM],
  tipos: [...m.TIPOS_FOTO], status: m.STATUS_FOTO, conferidos: [] };
for (const [action, corpo] of e.pedidos ?? []) {
  let r;
  if (action === "foto_preparar" || action === "foto_salvar") r = m.lerPedidoDeFoto(corpo);
  else if (action === "foto_excluir") r = m.lerExclusaoDeFoto(corpo);
  else r = m.ACOES_DE_ANTES.includes(action) ? { ok: true } : { ok: false, erro: "invalid_action" };
  saida.conferidos.push({ action, ok: r.ok === true, erro: r.erro ?? null, caminho: r.caminho ?? null, grava: m.ACOES_QUE_GRAVAM.has(action),
    status: r.ok === true ? 200 : m.statusDaFoto(r.erro) });
}
console.log(JSON.stringify(saida));
"""


def regras_treino(pedidos: list[tuple[str, dict]] | None = None) -> dict:
    """hml-19c: as regras da admin-avaliacoes (as ações da foto, as que gravam, os tipos, os status) e, para cada (action, corpo), o
    que o servidor faria — do próprio TS."""
    r = subprocess.run(["node", "--experimental-strip-types", "--no-warnings", "--input-type=module", "-e", _JS_REGRAS_TREINO, str(REGRAS_TREINO_TS)],
                       input=json.dumps({"pedidos": pedidos or []}), capture_output=True, text=True, timeout=60)
    if r.returncode != 0:
        raise RuntimeError(f"node (regras do Treino): {r.stderr.strip()[:400]}")
    return json.loads(r.stdout)


def tabelas_do_prontuario() -> set[str]:
    texto = REGRAS_TS.read_text(encoding="utf-8")
    bloco = texto.split("export const TABELAS_PRONTUARIO = [", 1)[1].split("] as const;", 1)[0]
    return set(re.findall(r'"([a-z_]+)"', bloco))


def rpcs_que_gravam() -> set[str]:
    texto = (REPO / "src" / "integrations" / "repeticao.ts").read_text(encoding="utf-8")
    bloco = texto.split("export const RPC_QUE_GRAVAM", 1)[1].split("]);", 1)[0]
    return set(re.findall(r'"([a-z0-9_]+)"', bloco))


def tabelas_da_dieta() -> set[str]:
    texto = REGRAS_TS.read_text(encoding="utf-8")
    if "export const TABELAS_DIETA = [" not in texto:
        return set()
    bloco = texto.split("export const TABELAS_DIETA = [", 1)[1].split("] as const;", 1)[0]
    return set(re.findall(r'"([a-z_]+)"', bloco))


def tabelas_da_avaliacao() -> set[str]:
    """hml-19c: as 2 tabelas da Avaliação no principal (TABELAS_AVALIACAO do servidor: antropometrias, fotos_evolucao)."""
    texto = REGRAS_TS.read_text(encoding="utf-8")
    if "export const TABELAS_AVALIACAO = [" not in texto:
        return set()
    bloco = texto.split("export const TABELAS_AVALIACAO = [", 1)[1].split("] as const;", 1)[0]
    return set(re.findall(r'"([a-z_]+)"', bloco))


TABELAS = tabelas_do_prontuario()
TABELAS_DIETA = tabelas_da_dieta()
TABELAS_AVALIACAO = tabelas_da_avaliacao()
TABELAS_AVALIACAO_TREINO = {"physiq_registros_fotos"}  # hml-19c: a foto mensal (banco do Treino)
# hml-19d: as 4 tabelas do Financeiro (as de TABELAS_FINANCEIRO do servidor, menos pacientes — o PATCH das tags conta à parte)
TABELAS_FINANCEIRO = {"transacoes", "categorias_financeiras", "modelos_recibo", "recibos"}
# hml-19b: as RPCs que o app do aluno chamava direto (o código antigo, o ANTES) — gravam, mesmo depois de saírem do RPC_QUE_GRAVAM
RPCS_DO_APP = {"paciente_marcar_refeicao", "aluno_marcar_meta", "diario_enviar"}
# hml-19c: o aviso "avaliação nova" — saiu do front (vai pela nutricao), mas o ANTES chama direto: grava
RPCS_DA_AVALIACAO = {"aluno_avisar_avaliacao"}
RPC_GRAVA = rpcs_que_gravam() | RPCS_DO_APP | RPCS_DA_AVALIACAO


# ───────────────────────── a guarda que CONTA (por tela e por ação) ─────────────────────────
def classificar(p: dict) -> str | None:
    """Um pedido anotado pela Tela (hml17 _anotar: tipo, nome, metodo, acao, url) → a classe de gravação (ou de laço); None = leitura."""
    m, tipo, nome, url = p.get("metodo"), p.get("tipo"), p.get("nome"), p.get("url", "")
    if m in ("OPTIONS", "HEAD"):
        return None
    if tipo == "tab":
        if m in ("POST", "PATCH", "PUT", "DELETE"):
            if nome in TABELAS_AVALIACAO or nome in TABELAS_AVALIACAO_TREINO:  # hml-19c: a Avaliação (os 2 bancos)
                return "rest_avaliacao"
            if nome in TABELAS_FINANCEIRO:  # hml-19d: as 4 tabelas do Financeiro
                return "rest_financeiro"
            if nome == "pacientes":  # hml-19d: as tags do aluno (antes, o PATCH em pacientes saía do navegador)
                return "rest_pacientes"
            return "rest_prontuario" if nome in TABELAS else "rest_dieta" if nome in TABELAS_DIETA else "rest_outras"
        return "get_profiles" if (m == "GET" and nome == "profiles") else None
    if tipo == "rpc":
        return "rpc_grava" if nome in RPC_GRAVA else None
    if tipo == "fn":
        # hml-20a (revisão): a LEITURA pela função — o corpo `ler` da nutricao/financeiro e a minha_evolucao da admin-avaliacoes, pela regra
        # da Guarda (o campo que a função lê) — não é gravação: o recarregamento da tela depois de gravar não entra na conta das ações
        if B17.corpo_de_leitura(nome, p.get("corpo")):
            return None
        return f"fn:{nome}" + (f"({p.get('acao')})" if p.get("acao") else "")
    if tipo == "storage":
        caminho = urlparse(url).path
        if "/object/upload/sign/" in caminho:
            return "storage_link_assinado"
        if m == "GET" or "/object/sign/" in caminho:
            return None
        return "storage_grava"
    return None


def contar(pedidos: list[dict]) -> Counter:
    return Counter(c for c in (classificar(p) for p in pedidos) if c)


def gravacoes_rest(cont: Counter) -> int:
    return cont.get("rest_prontuario", 0)


class BarrarNutricao:
    """A rota do navegador que BARRA a nutricao (route.abort) e conta cada ação barrada — o laco.py (H-81: 1 chamada só e o aviso
    "Tentar de novo" na tela). Instale antes de abrir a tela.
    hml-20a (revisão): a LEITURA (o corpo `ler`, pela regra da Guarda — B17.corpo_de_leitura) PASSA: o app do aluno lê a dieta pela
    nutricao desde a 20a e, barrada, a tela nem abriria; só as ações que gravam são barradas. `leitura=True` = barrar a leitura também
    (o caso que QUER a tela sem o dado — explícito)."""

    def __init__(self, leitura: bool = False) -> None:
        self.barradas: Counter = Counter()
        self.leitura = leitura

    def barra(self, metodo: str, url: str, corpo: str | None) -> bool:
        """O pedido é barrado? Só o POST na nutricao; a leitura pelo corpo só com leitura=True."""
        if metodo != "POST" or not urlparse(url).path.startswith("/functions/v1/nutricao"):
            return False
        return self.leitura or not B17.corpo_de_leitura("nutricao", corpo)

    def instalar(self, ctx) -> None:
        def rota(route, req) -> None:
            if self.barra(req.method, req.url, B17.corpo_do_pedido(req)):
                self.barradas[B17.acao_do_corpo(req) or "?"] += 1
                route.abort()
                return
            route.fallback()
        ctx.route(re.compile(r"https://api-principal\.physiqcalc\.com\.br/functions/v1/nutricao"), rota)


def _tirar_legal(obj):
    """O `legal` desligado e o aviso de mudança visto, SÓ na resposta que o navegador recebe (o mesmo da hml-18 e da medição da spec)."""
    sit = obj.get("situacao") if isinstance(obj, dict) and isinstance(obj.get("situacao"), dict) else obj
    if isinstance(sit, dict):
        sit["legal"] = {"versao": None, "aceite_pendente": False, "saude_pendente": False, "nascimento_pendente": False, "menor": None}
        if isinstance(sit.get("aviso_mudanca"), dict):
            sit["aviso_mudanca"]["visto"] = True
    return obj


class LegalDesligado:
    """A porta do aceite (hml-12) e o aviso "o Physiq mudou" não cobrem a tela: o pos-login e a minha_situacao voltam com o `legal`
    desligado SÓ no navegador (as contas de teste não aceitaram os textos de cada ambiente, e aceitar é gravar — na produção, a Guarda
    barraria). Nada grava. Instale depois da Guarda (a última rota registrada roda primeiro)."""

    def instalar(self, ctx) -> None:
        ctx.route(re.compile(r"https://api(-principal)?\.physiqcalc\.com\.br/"), self._legal)

    @staticmethod
    def _legal(route, req) -> None:
        tipo, nome = B17.alvo(req.url)
        if req.method != "OPTIONS" and ((tipo == "fn" and nome == "pos-login") or (tipo == "rpc" and nome == "minha_situacao")):
            try:
                r = route.fetch()
                try:
                    corpo = json.dumps(_tirar_legal(r.json()))
                except Exception:  # noqa: BLE001
                    route.fulfill(response=r)
                    return
                route.fulfill(response=r, body=corpo, headers={**r.headers, "content-type": "application/json"})
            except Exception:  # noqa: BLE001 — a página fechou no meio
                pass
            return
        route.fallback()


# ───────────────────────── a guarda do /health (H-80) ─────────────────────────
def saude() -> tuple[bool, dict]:
    """/health dos 2 projetos (db, auth, rest) pela Management API: True só com tudo ACTIVE_HEALTHY."""
    estados: dict = {}
    for ref in ("uxwpwdbbnlticxgtzcsb", PRINCIPAL_REF):
        st, r, _h = B5.http("GET", f"https://api.supabase.com/v1/projects/{ref}/health?services=db,auth,rest", None,
                            {"Authorization": f"Bearer {C.C2.pat()}"}, timeout=25)
        estados[ref[:6]] = {x.get("name"): x.get("status") for x in r} if st == 200 and isinstance(r, list) else {"http": st}
    ok = all(v and all(s == "ACTIVE_HEALTHY" for s in v.values()) for v in estados.values())
    return ok, estados


def exigir_saude(o, rotulo: str) -> None:
    ok, estados = saude()
    o.ok(ok, f"/health dos 2 projetos antes de {rotulo}: {estados}", parar=True)


# ───────────────────────── o estado da rodada (o --limpar) ─────────────────────────
class Estado:
    """O que a rodada criou: {"rodada", "schema", "linhas": [[tabela, id]], "storage": [[bucket, caminho]], "n8": {...}}."""

    def __init__(self, dados: dict | None = None) -> None:
        self.d = dados or {"rodada": None, "schema": None, "linhas": [], "storage": [], "n8": None}

    @classmethod
    def ler(cls) -> "Estado":
        d = C.ler_json(ESTADO_ARQ)
        return cls(d if isinstance(d, dict) else None)

    def salvar(self) -> None:
        C.json_arquivo(ESTADO_ARQ, self.d)

    def linha(self, tabela: str, id_: object) -> None:
        if tabela in (TABELAS | TABELAS_DIETA | TABELAS_AVALIACAO) and C.eh_uuid(id_) and [tabela, id_] not in self.d["linhas"]:
            self.d["linhas"].append([tabela, id_])
            self.salvar()

    def linha_treino(self, tabela: str, id_: object) -> None:
        """hml-19c: uma linha no banco do TREINO (a foto mensal) — sai pela função ou, no --limpar, por SQL (só o aluno e o mês sentinela)."""
        lista = self.d.setdefault("treino", [])
        if tabela in TABELAS_AVALIACAO_TREINO and C.eh_uuid(id_) and [tabela, id_] not in lista:
            lista.append([tabela, id_])
            self.salvar()

    def aviso(self, id_: object) -> None:
        """hml-19c: um aviso "avaliação nova" que a rodada pôs no sino da aluna de TESTE (sai no fim, por id)."""
        lista = self.d.setdefault("avisos", [])
        if C.eh_uuid(id_) and id_ not in lista:
            lista.append(id_)
            self.salvar()

    def objeto(self, bucket: str, caminho: str) -> None:
        if [bucket, caminho] not in self.d["storage"]:
            self.d["storage"].append([bucket, caminho])
            self.salvar()

    def linha_fin(self, tabela: str, id_: object, dono: object) -> None:
        """hml-19d: uma linha do Financeiro que a rodada criou, com o DONO (a semente pode ser de outra conta de teste; a N1 cria a dela)."""
        lista = self.d.setdefault("fin", [])
        if tabela in TABELAS_FINANCEIRO and C.eh_uuid(id_) and C.eh_uuid(dono) and [tabela, id_, dono] not in lista:
            lista.append([tabela, id_, dono])
            self.salvar()

    def restaurar(self, tabela: str, id_: object, dono: object) -> None:
        """hml-19d: uma linha VIVA da conta de teste que a rodada marcou como excluída para provar a semente (volta no fim)."""
        lista = self.d.setdefault("restaurar", [])
        if tabela in TABELAS_FINANCEIRO and C.eh_uuid(id_) and C.eh_uuid(dono) and [tabela, id_, dono] not in lista:
            lista.append([tabela, id_, dono])
            self.salvar()

    def vazio(self) -> bool:
        # hml-19c: as linhas do Treino e os avisos também (as rodadas de antes não têm as 2 chaves); hml-19d: as do Financeiro, as que
        # voltam da Lixeira e as tags originais da aluna
        return not (self.d["linhas"] or self.d["storage"] or self.d.get("n8") or self.d.get("treino") or self.d.get("avisos")
                    or self.d.get("fin") or self.d.get("restaurar") or self.d.get("tags_originais") is not None)

    def apagar(self) -> None:
        if ESTADO_ARQ.exists():
            ESTADO_ARQ.unlink()


# hml-19b: as filhas da Dieta não têm dono nem Lixeira — saem com o pai (o plano, o alimento, a receita) em cascata
DIETA_SEM_DONO = {"refeicoes", "itens_refeicao", "medidas_caseiras", "ingredientes_receita"}
# a ordem do DELETE da Dieta (as FKs do staging, catálogo de 11/10): quem aponta para outra sai antes — o item e o ingrediente apontam
# para o alimento SEM cascata (então o plano e a receita saem antes do alimento); o resto é cascata ou "set null"
ORDEM_LIMPEZA_DIETA = (
    "diario_alimentar", "registros_diarios", "indicacoes_produto", "formulas_manipuladas", "metas", "orientacoes", "planos_alimentares",
    "calculos_energeticos", "receitas", "grupos_receita", "alimentos", "produtos", "modelos_formula", "modelos_meta", "modelos_orientacao",
)


def _ordem_do_delete(tabela: str) -> tuple[int, str]:
    return (ORDEM_LIMPEZA_DIETA.index(tabela) if tabela in ORDEM_LIMPEZA_DIETA else -1, tabela)


def sql_apagar_linhas(s: str, linhas: list[list[str]], dono: str) -> list[str]:
    """O DELETE da massa da rodada (só no staging, só os ids da rodada E do dono de TESTE): 1 comando por tabela. hml-19b: as tabelas
    da Dieta com dono entram do mesmo jeito, na ordem das FKs (ORDEM_LIMPEZA_DIETA, depois das do Prontuário); as filhas (sem dono)
    ficam de fora — saem com o pai em cascata."""
    if s != "staging":
        raise SystemExit("a massa só existe no staging — nada a apagar em outro schema")
    C.uuid_ok(dono)
    por: dict[str, list[str]] = {}
    for tabela, id_ in linhas:
        if (tabela in TABELAS or tabela in TABELAS_AVALIACAO or (tabela in TABELAS_DIETA and tabela not in DIETA_SEM_DONO)) and C.eh_uuid(id_):
            por.setdefault(tabela, []).append(id_)
    return [f"delete from {s}.{tabela} where nutricionista_id = '{dono}' and id = any(array[{', '.join(C.txt(i) for i in ids)}]::uuid[])"
            for tabela, ids in sorted(por.items(), key=lambda x: _ordem_do_delete(x[0]))]


def sql_contar_marca(s: str, rodada: str | None = None) -> str:
    """Só contagem (SQL só leitura): as linhas com a marca da hml-19 em cada tabela do Prontuário (vivas e na Lixeira)."""
    marca = f"{MARCA} {rodada}" if rodada else MARCA
    colunas = {
        "registros_prontuario": "texto", "consultas": "observacao", "anamneses": "titulo", "modelos_anamnese": "titulo",
        "respostas_questionario": "titulo", "questionarios": "titulo", "pedidos_exame": "observacao", "resultados_exame": "exame",
        "exames_catalogo": "nome", "avaliacoes_integradas": "titulo", "gestacoes": "observacao", "registros_gestacionais": "observacao",
        "medicamentos_paciente": "medicamento", "analises_farmaco": "titulo", "interacoes_farmaco_nutriente": "medicamento",
        "documentos": "titulo", "modelos_documento": "titulo", "anexos": "nome",
    }
    assert set(colunas) == TABELAS, sorted(TABELAS ^ set(colunas))
    partes = [f"(select count(*) from {s}.{t} where {c} like {C.txt('%' + marca.replace(' ', '%') + '%')})::int as {t}" for t, c in sorted(colunas.items())]
    return "select " + ", ".join(partes)


# ───────────────────────── hml-19b: a marca nas tabelas da Dieta (só contagem) ─────────────────────────
# a coluna de texto onde a rodada põe a marca, em cada tabela da Dieta com dono (as filhas saem com o pai)
COLUNAS_MARCA_DIETA = {
    "planos_alimentares": "titulo", "registros_diarios": "observacao", "calculos_energeticos": "observacao", "produtos": "nome",
    "indicacoes_produto": "produto_nome", "formulas_manipuladas": "titulo", "modelos_formula": "titulo", "metas": "titulo",
    "modelos_meta": "titulo", "orientacoes": "titulo", "modelos_orientacao": "titulo", "alimentos": "nome", "receitas": "nome",
    "grupos_receita": "nome", "diario_alimentar": "comentario",
}


def sql_contar_marca_dieta(s: str, rodada: str | None = None) -> str:
    """Só contagem (SQL só leitura): as linhas com a marca da hml-19 em cada tabela da Dieta com dono (vivas e na Lixeira)."""
    marca = f"{MARCA} {rodada}" if rodada else MARCA
    assert set(COLUNAS_MARCA_DIETA) == TABELAS_DIETA - DIETA_SEM_DONO, sorted((TABELAS_DIETA - DIETA_SEM_DONO) ^ set(COLUNAS_MARCA_DIETA))
    partes = [f"(select count(*) from {s}.{t} where {c} like {C.txt('%' + marca.replace(' ', '%') + '%')})::int as {t}"
              for t, c in sorted(COLUNAS_MARCA_DIETA.items())]
    return "select " + ", ".join(partes)


# ───────────────────────── hml-19c: a limpeza e a conferência da Avaliação (só contagem) ─────────────────────────
COLUNAS_MARCA_AVALIACAO = {"antropometrias": "observacao", "fotos_evolucao": "observacao"}


def sql_contar_marca_avaliacao(s: str, rodada: str | None = None) -> str:
    """Só contagem (SQL só leitura): as linhas com a marca da hml-19 nas 2 tabelas da Avaliação do principal (vivas e na Lixeira)."""
    marca = f"{MARCA} {rodada}" if rodada else MARCA
    assert set(COLUNAS_MARCA_AVALIACAO) == TABELAS_AVALIACAO, sorted(TABELAS_AVALIACAO ^ set(COLUNAS_MARCA_AVALIACAO))
    partes = [f"(select count(*) from {s}.{t} where {c} like {C.txt('%' + marca.replace(' ', '%') + '%')})::int as {t}"
              for t, c in sorted(COLUNAS_MARCA_AVALIACAO.items())]
    return "select " + ", ".join(partes)


def sql_contar_sentinela(s: str, aluno: str) -> str:
    """Só contagem (SQL só leitura, banco do Treino): as fotos mensais do aluno de TESTE no mês sentinela, no schema `s`."""
    assert s in ("public", "staging"), s
    return (f"select count(*)::int as n from {s}.physiq_registros_fotos where user_id = {C.txt(C.uuid_ok(aluno))} "
            f"and mes_ref = {C.txt(MES_SENTINELA + '-01')}::date")


def sql_apagar_fotos_treino(s: str, aluno: str, ids: list[str]) -> str:
    """O DELETE da foto mensal da rodada (só no staging, só o aluno de TESTE, só o mês sentinela, só os ids da rodada)."""
    if s != "staging":
        raise SystemExit("a massa só existe no staging — nada a apagar em outro schema")
    validos = [i for i in ids if C.eh_uuid(i)]
    if not validos:
        raise SystemExit("nenhum id da rodada para apagar")
    return (f"delete from {s}.physiq_registros_fotos where user_id = {C.txt(C.uuid_ok(aluno))} and mes_ref = {C.txt(MES_SENTINELA + '-01')}::date "
            f"and id = any(array[{', '.join(C.txt(i) for i in validos)}]::uuid[])")


def sql_apagar_avisos(s: str, destino: str, ids: list[str]) -> str:
    """O DELETE dos avisos "avaliação nova" que a rodada pôs no sino da aluna de TESTE (só no staging, só os ids da rodada)."""
    if s != "staging":
        raise SystemExit("a massa só existe no staging — nada a apagar em outro schema")
    validos = [i for i in ids if C.eh_uuid(i)]
    if not validos:
        raise SystemExit("nenhum aviso da rodada para apagar")
    return (f"delete from {s}.avisos where destino_user_id = {C.txt(C.uuid_ok(destino))} and tipo = 'avaliacao_nova' "
            f"and id = any(array[{', '.join(C.txt(i) for i in validos)}]::uuid[])")


# ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
# hml-19d (H-41 · jeito 2, 11/10/2026) — o Financeiro pela função financeiro (Painel › Financeiro e o Financeiro do aluno)
# ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
FUNCAO_FIN = f"{API_P}/functions/v1/financeiro"
REGRAS_FIN_TS = REPO / "supabase-principal" / "functions" / "_shared" / "financeiro-gravar-regras.ts"
# a marca do número do recibo (a RPC troca pelo número real) — o --seco confere que é a do servidor
MARCA_NUMERO_RECIBO = "\u0001NUMERO_RECIBO\u0001"


def funcao_fin(token: str | None, acao: str | None, corpo: dict | None = None, *, origem: str | None = None, schema_: str | None = None,
               sem_auth: bool = False, timeout: int = 60) -> tuple[int, dict, dict, float]:
    """POST na financeiro como a tela chama (apikey + Bearer + x-schema + Origin) → (status, corpo JSON, cabeçalhos, ms). acao None = sem a
    chave (o corpo vai como veio)."""
    corpo = dict(corpo or {})
    if acao is not None:
        corpo["acao"] = acao
    cab = {"apikey": B5.anon(PRINCIPAL_REF), "x-schema": schema_ or schema(), "Origin": origem or BASES["staging"]}
    if not sem_auth:
        cab["Authorization"] = f"Bearer {token}"
    t0 = time.time()
    st, r, h = B5.http("POST", FUNCAO_FIN, corpo, cab, timeout=timeout)
    return st, (r if isinstance(r, dict) else {}), h or {}, round((time.time() - t0) * 1000)


def preflight_fin(origem: str) -> tuple[int, dict]:
    """O OPTIONS da financeiro (o CORS da porta-pessoa: fora da lista → o padrão https://physiqcalc.com.br)."""
    cab = {"Origin": origem, "Access-Control-Request-Method": "POST",
           "Access-Control-Request-Headers": "authorization, apikey, content-type, x-schema, x-client-info"}
    st, _r, h = B5.http("OPTIONS", FUNCAO_FIN, None, cab, timeout=60)
    return st, h or {}


_JS_REGRAS_FIN = r"""
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const m = await import(pathToFileURL(process.argv[1]).href);
const e = JSON.parse(readFileSync(0, "utf8"));
const saida = {
  acoes: Object.fromEntries(m.ACOES_DO_FINANCEIRO.map((a) => [a, { tabela: m.ACOES_FINANCEIRO[a].tabela, operacao: m.ACOES_FINANCEIRO[a].operacao,
    rpc: m.ACOES_FINANCEIRO[a].rpc ?? null }])),
  tabelas: [...m.TABELAS_FINANCEIRO], rpcs: [...m.RPCS_DO_FINANCEIRO], status: m.STATUS_DO_ERRO_FINANCEIRO,
  categorias: [...m.CATEGORIAS_PADRAO], titulo_modelo: m.TITULO_MODELO_PADRAO, conteudo: m.CONTEUDO_MODELO_PADRAO, conteudo_nutri: m.CONTEUDO_MODELO_PADRAO_NUTRI,
  marca: m.MARCA_NUMERO_RECIBO, volta: { transacao: m.VOLTA_TRANSACAO, recibo: m.VOLTA_RECIBO, categoria: m.VOLTA_CATEGORIA, modelo: m.VOLTA_MODELO_RECIBO },
  limites: { descricao: m.DESCRICAO_MAX, categoria: m.CATEGORIA_NOME_MAX, titulo: m.TITULO_MODELO_MAX, tag: m.TAG_MAX },
  numeros: Object.fromEntries((e.numeros ?? []).map((n) => [String(n), m.numeroDoRecibo(n)])),
  modelos: (e.papeis ?? []).map((p) => m.modeloPadraoDoRecibo(p)),
  conferidos: [],
};
for (const [acao, corpo] of e.pedidos ?? []) {
  let r;
  switch (acao) {
    case "padroes_garantir": r = m.lerPadroes(corpo); break;
    case "recibo_emitir": r = m.lerReciboEmitir(corpo); break;
    case "recibo_excluir": r = m.lerReciboExcluir(corpo); break;
    case "tags_salvar": r = m.lerTags(corpo); break;
    default: r = m.montarGravacaoFinanceiro(acao, corpo, e.userId, new Date(0));
  }
  saida.conferidos.push({ acao, conhecida: m.acaoDoFinanceiro(acao) !== null, ok: r.ok === true, erro: r.erro ?? null, campo: r.campo ?? null,
    valores: r.valores ?? r.recibo ?? null, tags: r.tags ?? null, status: r.ok === true ? 200 : m.statusDoErroFinanceiro(r.erro) });
}
console.log(JSON.stringify(saida));
"""


def regras_fin(pedidos: list[tuple[str, dict]] | None = None, user_id: str = "33333333-3333-4333-8333-333333333333",
               papeis: list[list[str]] | None = None, numeros: list[int] | None = None) -> dict:
    """hml-19d: as regras da financeiro (as ações, as tabelas, as RPCs, os status, os textos da semente, a marca, os selects de volta) e,
    para cada (acao, corpo), o que o servidor faria — do próprio TS (node, sem rede). `papeis` → o modelo da semente de cada um;
    `numeros` → o número do recibo como o servidor escreve."""
    r = subprocess.run(["node", "--experimental-strip-types", "--no-warnings", "--input-type=module", "-e", _JS_REGRAS_FIN, str(REGRAS_FIN_TS)],
                       input=json.dumps({"pedidos": pedidos or [], "userId": user_id, "papeis": papeis or [], "numeros": numeros or []}),
                       capture_output=True, text=True, timeout=60)
    if r.returncode != 0:
        raise RuntimeError(f"node (regras da financeiro): {r.stderr.strip()[:400]}")
    return json.loads(r.stdout)


# a ordem do DELETE da massa do Financeiro (as FKs entre as 4 são "set null": a ordem só deixa a leitura do log fácil)
ORDEM_LIMPEZA_FIN = ("recibos", "transacoes", "categorias_financeiras", "modelos_recibo")
# a coluna de texto onde a rodada põe a marca, em cada tabela do Financeiro (a semente não tem marca: sai pelos ids do estado)
COLUNAS_MARCA_FIN = {"transacoes": "descricao", "recibos": "descricao", "categorias_financeiras": "nome", "modelos_recibo": "titulo"}


def sql_apagar_linhas_fin(s: str, linhas: list[list[str]]) -> list[str]:
    """O DELETE da massa do Financeiro (só no staging, só os ids da rodada E de cada dono de TESTE): 1 comando por tabela e dono, na ordem."""
    if s != "staging":
        raise SystemExit("a massa só existe no staging — nada a apagar em outro schema")
    por: dict[tuple[str, str], list[str]] = {}
    for tabela, id_, dono in linhas:
        if tabela in TABELAS_FINANCEIRO and C.eh_uuid(id_) and C.eh_uuid(dono):
            por.setdefault((tabela, dono), []).append(id_)
    ordem = sorted(por.items(), key=lambda x: (ORDEM_LIMPEZA_FIN.index(x[0][0]), x[0][1]))
    return [f"delete from {s}.{tabela} where nutricionista_id = '{C.uuid_ok(dono)}' and id = any(array[{', '.join(C.txt(i) for i in ids)}]::uuid[])"
            for (tabela, dono), ids in ordem]


def sql_restaurar_fin(s: str, linhas: list[list[str]]) -> list[str]:
    """As linhas da conta de teste que a rodada marcou como excluídas para semear voltam a ficar vivas (só no staging, só os ids anotados)."""
    if s != "staging":
        raise SystemExit("a massa só existe no staging — nada a restaurar em outro schema")
    por: dict[tuple[str, str], list[str]] = {}
    for tabela, id_, dono in linhas:
        if tabela in TABELAS_FINANCEIRO and C.eh_uuid(id_) and C.eh_uuid(dono):
            por.setdefault((tabela, dono), []).append(id_)
    return [f"update {s}.{tabela} set deleted_at = null where nutricionista_id = '{C.uuid_ok(dono)}' and deleted_at is not null "
            f"and id = any(array[{', '.join(C.txt(i) for i in ids)}]::uuid[])" for (tabela, dono), ids in sorted(por.items())]


def sql_contar_marca_fin(s: str, rodada: str | None = None) -> str:
    """Só contagem (SQL só leitura): as linhas com a marca da hml-19 em cada tabela do Financeiro (vivas e na Lixeira)."""
    marca = f"{MARCA} {rodada}" if rodada else MARCA
    assert set(COLUNAS_MARCA_FIN) == TABELAS_FINANCEIRO, sorted(TABELAS_FINANCEIRO ^ set(COLUNAS_MARCA_FIN))
    partes = [f"(select count(*) from {s}.{t} where {c} like {C.txt('%' + marca.replace(' ', '%') + '%')})::int as {t}"
              for t, c in sorted(COLUNAS_MARCA_FIN.items())]
    return "select " + ", ".join(partes)


def sql_vivos_fin(s: str, dono: str) -> str:
    """Só contagem: as categorias e os modelos VIVOS da pessoa (o que a semente olha)."""
    d = C.txt(C.uuid_ok(dono))
    return (f"select (select count(*) from {s}.categorias_financeiras where nutricionista_id = {d} and deleted_at is null)::int as categorias, "
            f"(select count(*) from {s}.modelos_recibo where nutricionista_id = {d} and deleted_at is null)::int as modelos")


# as colunas de cobrança do aluno (a guarda da W-P) — a foto antes × depois das tags
COLUNAS_COBRANCA = ("mensalidade_valor", "mensalidade_pago_ate", "plano_aluno_id", "plano_modalidade", "plano_valor_negociado", "cobranca_pausada")


def sql_foto_cobranca(s: str, pac: str) -> str:
    """Só leitura: as tags e as colunas de cobrança do aluno (como texto: a comparação antes × depois é exata)."""
    cols = ", ".join(f"{c}::text as {c}" for c in COLUNAS_COBRANCA)
    return f"select tags, {cols} from {s}.pacientes where id = {C.txt(C.uuid_ok(pac))}"
