#!/usr/bin/env python3
"""Physiq hml-21a (H-43 · jeito 2, etapa 3, 12/10/2026) — a REDE de cada tela da casca e do app do aluno, no navegador (Edge, celular
390 × 844), antes × depois, na MESMA planilha (hml21/medicao/rede_hml21a.tsv). Spec hml-21 §4 (rede.py) e §1.2; contrato da 21a,
decisões H, K, M e N.

Com a aluna de TESTE (w5p-aluna), a rodada abre o Início (goto: a carga fria), o sino (o clique, com os não lidos da massa) e o sino de novo
(sem não lidos), o Perfil, a Conta, a Agenda e o Meu plano (pela navegação do app; o Meu plano lê o meu_plano_app de qualquer aluno — a aluna
tem profissional: a página "com-profissional"; o print do aluno sem profissional é o telas.py) e a guarda que CONTA (_base.contar_area)
separa, em cada tela:
  · as chamadas DIRETAS da área (--area casca: GET/PATCH em avisos, as RPCs minha_situacao/marcar_aviso_mudanca/minha_senha_definida/
    push_registrar/push_esquecer/aceitar_no_acesso/criar_minha_conta; --area app: o profiles, as RPCs meu_perfil_aluno/minha_agenda/
    minha_agenda_lista/meu_plano_app/pratos_prontos_do_app/mudar_objetivo_app/entrar_sem_profissional e o Storage fotos-perfil(-staging),
    menos o PUT no link que o servidor assinou e o GET da imagem pública);
  · o `ler` da conta (com as consultas de cada um) e as ações da conta;
  · à parte (não é falha): as da OUTRA área da 21a e as de fora da 21a (a Agenda do aluno — 21b; os treinos prontos — 21d; o desvio 23);
  · as gravações ao abrir (a regra da Guarda dos E2E, com o corpo).
Depois da 21a (--base local, e o staging depois do push): 0 chamada direta da área em todas as telas; no máximo 1 `ler` por tela (2 no Início:
a casca e os cards podem pedir em voltas diferentes — a linha SÉRIE avisa; o ## TEMPO é da sessão/agente); 0 gravação ao abrir — e o sino
(decisão M): abrir com não lidos = 1 ação avisos_marcar_lidos e 0 PATCH/GET em avisos (o `ler` que relê a lista depois de marcar: ≤ 1).
Antes (--base staging com o código antigo, o 3e52fbd): as leituras iam direto (a linha de base da mesma planilha).
A massa (--area casca, fora da produção): os avisos não lidos da aluna pelos caminhos do app, com a marca, apagados no fim (o Estado; o
--limpar do api.py). Produção (--base prod, decisão N): SÓ abre as telas com a Guarda (hml17 + as 6 RPCs de leitura do front antigo) — 0
gravação tentada; o sino NÃO é clicado (abrir com não lidos grava o lido_em); sem massa.
No fim, o logout (scope=local) da sessão do TREINO que a troca do app abriu neste navegador (decisão 23 da hml-20).
Antes de CADA execução: ~/projetos/physiqcalc-scratch/hml/hml19/ferramentas/pausa.sh "rede.py …" (e o /health, aqui dentro).
Uso: python3 e2e/hml21/rede.py --area casca|app|agenda|alunos --base local|staging|prod --canal msedge [--seco]
  --seco  sem rede e sem navegador: os seletores e as rotas existem no código; a guarda acerta pedidos de exemplo (antes e depois, as duas
          áreas); a Guarda da produção deixa passar as leituras (o `ler` da conta e as 6 RPCs do front antigo) e barra o resto
hml-21b (decisão N do contrato da 21b): na produção as telas do app entram com a aluno-calc (B.PROD_CONTA — a conta de teste da produção), não
com a w5p-aluna do staging (o ## PAROU 02:04 da 21a), com a MESMA trava (a Guarda, o sino sem clique, sem a marca local de aviso visto, o
LegalDesligado). --area agenda|alunos (e2e/hml21/painel21b.py): a nutri (a Agenda — semana, mês, Novo agendamento, Regras, Travas — ou os
Alunos, o Dashboard e a Busca), o dono (a Agenda com a equipe / os Alunos) e a aluna (a Agenda dela), cada conta no seu contexto; em cada tela
0 chamada direta da área (as 6 tabelas da Agenda, os alunos e as RPCs que saíram do front na 21b), o `ler` ≤ o teto (2 na Agenda e no
Dashboard — a série aceita, decisão 04:23), 0 gravação e 0 ação ao abrir; a outra área e as de fora à parte; a planilha
hml21/medicao/rede_hml21b.tsv (antes × depois). A Agenda do painel só abre com calendário próprio e as 3 tags base (senão o app gravaria ao
abrir — PULADA com o motivo; SQL só leitura, só contagem); na produção a nutri-legado e a aluno-calc, só leitura, com a Guarda.
hml-21d (decisões H, I e N do contrato da 21d): --area treinos (e2e/hml21/treinos21d.py): o personal (Meus treinos, o Detalhe — o 1º treino da
lista —, a Biblioteca, a Folha — o 1º exercício —, os Modelos › Treinos, a Busca e o Aluno › Treino da aluna de TESTE) e o aluno sem
profissional (os Treinos prontos), cada conta no seu contexto; em cada tela 0 chamada direta da área (as tabelas, as RPCs e o bucket do Treino
que saíram do navegador e a aluno_treino do principal), o `ler` da treinos ≤ o teto (2 em Meus treinos — a série aceita, DECISÃO 12:1x), 0
gravação e 0 ação ao abrir; as de fora à parte; a planilha hml21/medicao/rede_hml21d.tsv (antes × depois). Na produção a nutri-legado (só com
o Treino na conta ativa) e a aluno-calc (só sem profissional), só leitura, com a Guarda — o editor fica de fora (sem aluno de TESTE lá).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import _base as B  # noqa: E402
import painel21b as P21  # noqa: E402  (hml-21b: as contas e as telas da Agenda e dos Alunos)
import treinos21d as T21  # noqa: E402  (hml-21d: as contas e as telas do Treino)

C = B.C
PLANILHA = B.MEDICAO / "rede_hml21a.tsv"
CABECALHO = ["quando", "base", "commit", "fase", "area", "tela", "diretas", "diretas_detalhe", "ler", "consultas", "acoes", "outra_area", "fora",
             "gravacoes", "pedidos", "t_pronto_s"]
# a tela, a rota (None = o clique no sino) e o que diz que ela abriu (o --seco confere cada seletor no código)
SINO_ABERTO = "[data-sino-lista] [data-aviso], [data-sino-vazio]"
TELAS = (
    ("inicio", "/", "[data-aba-inicio]"),
    ("sino", None, SINO_ABERTO),
    ("sino_vazio", None, SINO_ABERTO),
    ("perfil", "/perfil", "[data-aba-perfil]"),
    ("conta", "/perfil/conta", "[data-pagina-conta]"),
    ("agenda", "/perfil/agenda", "[data-pagina-agenda]"),
    ("meu_plano", "/perfil/meu-plano", "[data-pagina-meu-plano]"),
)
DO_SINO = {"sino", "sino_vazio"}
SELETORES = {
    "src/app-aluno/abas/Inicio.tsx": ["data-aba-inicio", "<Sino"],
    "src/app-aluno/abas/Perfil.tsx": ["data-aba-perfil", '"/perfil/conta"', '"/perfil/agenda"'],
    "src/app-aluno/perfil/Conta.tsx": ["data-pagina-conta"],
    "src/app-aluno/perfil/Agenda.tsx": ["data-pagina-agenda"],
    "src/app-aluno/perfil/MeuPlano.tsx": ["data-pagina-meu-plano"],
    "src/app-aluno/sozinho/pecas/GrupoDoApp.tsx": ['"/perfil/meu-plano"'],
    "src/ui/premium/Sino.tsx": ["data-sino", "data-sino-lista", "data-sino-vazio", "data-aviso", "`Avisos (${naoLidos} novos)`", "marcarLidos()"],
}
# depois: o teto de `ler` por tela (o Início pode ter a casca e os cards em 2 voltas; o sino relê a lista depois de marcar)
TETO_LER = {"inicio": 2, "sino": 1, "sino_vazio": 1, "perfil": 1, "conta": 1, "agenda": 1, "meu_plano": 1}
# as telas onde o ANTES SEMPRE lê direto da área (a carga fria do Início: o sino, o card do aluno e a agenda): a linha de base confere que o
# código antigo lia direto. Nas outras telas o antes depende do cache do React Query na mesma navegação (a 1ª rodada antes, 13/10 00:00: o
# Perfil sem nenhuma — a agenda do Início ainda fresca — e a Conta com a minha_agenda): só anotado na planilha
ANTES_DIRETO = {"casca": {"inicio"}, "app": {"inicio"}}
NAO_LIDOS = re.compile(r"\((\d+) novos?\)")


def telas_da_rodada(area: str, base: str) -> list[tuple[str, str | None, str]]:
    """O app da aluna inteiro nas 2 áreas; o sino só na casca (é dela) e nunca na produção (abrir com não lidos grava — decisão N)."""
    return [x for x in TELAS if x[0] not in DO_SINO or (area == "casca" and base != "prod")]


def nao_lidos(t) -> int:
    """Os não lidos que o sino mostra (o rótulo do botão: "Avisos (N novos)")."""
    rotulo = (t.attr("[data-sino]", "aria-label") or [""])[0] or ""
    m = NAO_LIDOS.search(rotulo)
    return int(m.group(1)) if m else 0


def abrir_sino(t) -> None:
    """Fecha o sino se estiver aberto (Escape), zera os pedidos e clica no sino (o Popover abre e, com não lidos, marca)."""
    if t.n("[data-sino-lista]"):
        t.pg.keyboard.press("Escape")
        t.pg.wait_for_timeout(400)
    t.zerar_pedidos()
    t.clicar("[data-sino]")


def conferir(o, base: str, fase: str, area: str, tela: str, cont: dict, pronta: dict, nl: int) -> None:
    acoes, grav = cont["acoes"], cont["gravacoes"]
    diretas = sum(cont["diretas"].values())
    if tela == "sino" and nl > 0:
        if fase == "depois":
            o.ok(acoes == {"avisos_marcar_lidos": 1} and grav == {"fn:conta(avisos_marcar_lidos)": 1} and diretas == 0,
                 f"[depois] sino aberto com {nl} não lido(s): 1 ação avisos_marcar_lidos e 0 PATCH/GET em avisos (decisão M) — ações {acoes or '—'}, "
                 f"gravações {grav or '—'}, diretas {cont['diretas'] or '—'}")
        else:
            o.ok(any(k.startswith("tab:avisos:PATCH") for k in cont["diretas"]) and not acoes,
                 f"[antes] sino aberto com {nl} não lido(s): o PATCH em avisos ia do navegador ({cont['diretas']})")
    elif tela == "sino":
        o.linha(f"   [{base}] sino: sem não lidos ao abrir (a massa não chegou?) — a decisão M não foi medida nesta abertura")
        o.ok(not grav, f"[{base}] sino sem não lidos: 0 gravação ({grav or '—'})")
    else:
        o.ok(not grav, f"[{base}] {tela}: 0 gravação ao abrir ({grav or '—'})")
    if fase == "antes":
        if tela in ANTES_DIRETO[area]:
            o.ok(diretas >= 1, f"[antes] {tela}: a leitura da área ia direto do navegador ({cont['diretas']})")
        return
    ler = cont["ler"]
    o.ok(diretas == 0, f"[depois] {tela}: 0 chamada direta da área {area} ({cont['diretas'] or '—'})")
    o.ok(ler <= TETO_LER[tela], f"[depois] {tela}: {ler} `ler` (≤ {TETO_LER[tela]}; consultas {cont['consultas'] or '—'}) — t_pronto {pronta['t_pronto_s']} s")
    if ler > 1:
        instantes = [(p.get("t"), ",".join(B.B20.consultas_do_corpo(p.get("corpo")))) for p in pronta["pedidos"] if B.chamada_da_conta(p) == "ler"]
        o.linha(f"SÉRIE {tela}: {ler} `ler` na mesma tela — os instantes (s desde a navegação) e as consultas: {instantes} — o ## TEMPO {tela} "
                "série, se não juntar sem mudar componente")
    if tela != "sino" and acoes:
        o.ok(False, f"[depois] {tela}: nenhuma ação da conta ao abrir ({acoes})")
    if cont["outra_area"] or cont["fora"]:
        o.linha(f"   [{base}] {tela}: à parte — da outra área da 21a {cont['outra_area'] or '—'}; de fora da 21a {cont['fora'] or '—'}")


def anotar(base: str, commit: str, fase: str, area: str, tela: str, cont: dict, pronta: dict) -> None:
    j = lambda d: ",".join(f"{k}×{v}" for k, v in sorted(d.items())) or "-"  # noqa: E731
    B.anotar_planilha(PLANILHA, CABECALHO, [
        time.strftime("%Y-%m-%d %H:%M"), base, commit, fase, area, tela, sum(cont["diretas"].values()), j(cont["diretas"]), cont["ler"],
        j(cont["consultas"]), j(cont["acoes"]), j(cont["outra_area"]), j(cont["fora"]), j(cont["gravacoes"]), len(pronta["pedidos"]),
        pronta["t_pronto_s"],
    ])


def seco(o) -> None:
    faltam = [f"{arq}: {sel}" for arq, sels in SELETORES.items() for sel in sels if sel not in (B.REPO / arq).read_text(encoding="utf-8")]
    o.ok(not faltam, f"os {sum(len(v) for v in SELETORES.values())} seletores e rotas existem no código das telas" + (f" — faltam: {faltam}" if faltam else ""))
    P, T = B.API_P, B.API_T
    uid = "33333333-3333-4333-8333-333333333333"
    rpc = lambda n: {"metodo": "POST", "tipo": "rpc", "nome": n, "url": f"{P}/rest/v1/rpc/{n}", "corpo": "{}"}  # noqa: E731
    tab = lambda n, m="GET", host=P: {"metodo": m, "tipo": "tab", "nome": n, "url": f"{host}/rest/v1/{n}?select=id", "corpo": "" if m == "GET" else "{}"}  # noqa: E731
    fn = lambda corpo: {"metodo": "POST", "tipo": "fn", "nome": "conta", "acao": corpo.get("acao"), "url": f"{P}/functions/v1/conta", "corpo": json.dumps(corpo)}  # noqa: E731
    sto = lambda m, caminho: {"metodo": m, "tipo": "storage", "nome": "objeto", "url": f"{P}/storage/v1/object/{caminho}", "corpo": ""}  # noqa: E731
    antes = [tab("avisos"), tab("avisos"), tab("avisos", "PATCH"), rpc("minha_situacao"), rpc("meu_perfil_aluno"), rpc("minha_agenda"),
             tab("profiles"), sto("POST", f"fotos-perfil-staging/{uid}/foto-1.png"), rpc("minhas_regras_agenda"),
             tab("physiq_treinos_prontos", host=T), sto("GET", f"public/fotos-perfil-staging/{uid}/foto-1.png")]
    c = B.contar_area(antes, "casca")
    o.ok(c["diretas"] == {"tab:avisos:GET": 2, "tab:avisos:PATCH": 1, "rpc:minha_situacao": 1}
         and c["outra_area"] == {"rpc:meu_perfil_aluno": 1, "rpc:minha_agenda": 1, "tab:profiles:GET": 1, "storage:fotos-perfil-staging": 1}
         and c["fora"] == {"rpc:minhas_regras_agenda": 1, "tab:physiq_treinos_prontos": 1} and not c["ler"],
         f"a guarda do ANTES (casca): o sino e a sessão diretos; o app na outra área; a Agenda e o Treino de fora à parte: {c}")
    c = B.contar_area(antes, "app")
    o.ok(c["diretas"] == {"rpc:meu_perfil_aluno": 1, "rpc:minha_agenda": 1, "tab:profiles:GET": 1, "storage:fotos-perfil-staging": 1}
         and c["outra_area"] == {"tab:avisos:GET": 2, "tab:avisos:PATCH": 1, "rpc:minha_situacao": 1}
         and any(k.startswith("rest_") for k in c["gravacoes"]) and "storage_grava" in c["gravacoes"],
         f"a guarda do ANTES (app): as RPCs, o profiles e o upload direto do bucket; as gravações (o PATCH, o upload) achadas: {c['gravacoes']}")
    ler = {"acao": "ler", "itens": [{"q": "avisos"}, {"q": "aviso_membro_removido", "tipo": "membro_removido"}, {"q": "meu_perfil_aluno"},
                                    {"desde": "2026-07-14T00:00:00.000Z", "q": "minha_agenda"}]}
    depois = [fn(ler), fn({"ids": [uid], "acao": "avisos_marcar_lidos"}), fn({"acao": "ler", "itens": [{"q": "avisos"}]}),
              {"metodo": "PUT", "tipo": "storage", "nome": "objeto", "url": f"{P}/storage/v1/object/upload/sign/fotos-perfil-staging/{uid}/foto-1.png?token=t", "corpo": ""},
              sto("GET", f"public/fotos-perfil-staging/{uid}/foto-1.png"), rpc("minhas_regras_agenda"),
              {"metodo": "OPTIONS", "tipo": "fn", "nome": "conta", "acao": None, "url": f"{P}/functions/v1/conta", "corpo": ""},
              {"metodo": "POST", "tipo": "fn", "nome": "pos-login", "acao": None, "url": f"{P}/functions/v1/pos-login", "corpo": "{}"}]
    for area in ("casca", "app"):
        c = B.contar_area(depois, area)
        o.ok(not c["diretas"] and not c["outra_area"] and c["ler"] == 2 and c["acoes"] == {"avisos_marcar_lidos": 1}
             and c["consultas"] == {"avisos": 2, "aviso_membro_removido": 1, "meu_perfil_aluno": 1, "minha_agenda": 1}
             and c["gravacoes"] == {"fn:conta(avisos_marcar_lidos)": 1, "storage_link_assinado": 1} and c["fora"] == {"rpc:minhas_regras_agenda": 1},
             f"a guarda do DEPOIS ({area}): 0 direta (o PUT no link que o servidor assinou e o GET da imagem não contam como diretas — o PUT "
             f"é gravação: só existe trocando a foto), 2 `ler` (as consultas), 1 ação (gravação), a Agenda de fora à parte: {c}")
    disfarce = B.contar_area([fn({"action": "ler", "acao": "avisos_marcar_lidos"}), fn({"acao": "ler", "x": 1})], "casca")
    o.ok(disfarce["acoes"] == {"avisos_marcar_lidos": 1} and disfarce["gravacoes"] == {"fn:conta(avisos_marcar_lidos)": 1} and disfarce["ler"] == 1,
         f"o `ler` disfarçado (action: ler, acao: <ação>) conta como a ação/gravação — o campo é o que a conta lê: {disfarce}")
    # a Guarda da produção (decisão N): o `ler` e as 6 RPCs de leitura do front antigo passam; o resto é barrado
    g = B.guarda_da_w()
    Ped = type("Ped", (), {})

    def pedido(metodo: str, url: str, corpo: dict | None = None):
        x = Ped()
        x.method, x.url, x.post_data = metodo, url, (json.dumps(corpo) if corpo is not None else None)
        return x

    passam = [pedido("POST", f"{P}/functions/v1/conta", ler)] + [pedido("POST", f"{P}/rest/v1/rpc/{n}", {}) for n in sorted(B.RPCS_DE_LEITURA_DA_21A)] \
        + [pedido("GET", f"{P}/rest/v1/avisos?select=id")]
    barram = [pedido("POST", f"{P}/functions/v1/conta", {"ids": [uid], "acao": "avisos_marcar_lidos"}),
              pedido("POST", f"{P}/functions/v1/conta", {"action": "ler", "acao": "perfil_nome"}), pedido("PATCH", f"{P}/rest/v1/avisos?id=eq.{uid}", {}),
              pedido("POST", f"{P}/rest/v1/rpc/push_registrar", {}), pedido("POST", f"{P}/rest/v1/rpc/marcar_aviso_mudanca", {}),
              pedido("POST", f"{P}/storage/v1/object/fotos-perfil/{uid}/foto-1.png", None)]
    o.ok(not any(g.escrita(x) for x in passam) and all(g.escrita(x) for x in barram),
         f"a Guarda da produção: passam o `ler` da conta e as 6 RPCs de leitura do front antigo ({len(passam)}); barram as ações da conta, o "
         f"`ler` disfarçado, o PATCH no sino, as RPCs que gravam e o upload direto ({len(barram)})")
    o.ok(not B.B17.Guarda().leitura & B.RPCS_DE_LEITURA_DA_21A,
         "a lista da Guarda do repo (o repeticao.ts) já não tem as 6 (saíram do front na 21a) — só a guarda_da_w() as soma (o front antigo)")
    o.ok([x[0] for x in telas_da_rodada("casca", "prod")] == ["inicio", "perfil", "conta", "agenda", "meu_plano"]
         and [x[0] for x in telas_da_rodada("app", "staging")] == ["inicio", "perfil", "conta", "agenda", "meu_plano"]
         and [x[0] for x in telas_da_rodada("casca", "local")] == [t for t, _r, _m in TELAS] and set(TETO_LER) == {t for t, _r, _m in TELAS},
         "a produção nunca clica no sino (decisão N); o sino só na casca; cada tela tem o teto de `ler` do depois")
    fonte = Path(__file__).read_text(encoding="utf-8")
    o.ok('if base == "prod":\n                t.ctx.add_init_script(B.JS_SEM_AVISO_VISTO)' in fonte and "class LegalDesligado(B19.LegalDesligado)" in
         (B.REPO / "e2e" / "hml21" / "_base.py").read_text(encoding="utf-8"),
         "a produção abre sem a marca local de aviso visto (o 🟡1) e o LegalDesligado da 21a cobre a situação pelo `ler` da conta")
    o.ok(NAO_LIDOS.search("Avisos (2 novos)").group(1) == "2" and NAO_LIDOS.search("Avisos (1 novos)") and not NAO_LIDOS.search("Avisos"),
         "os não lidos saem do rótulo do sino (\"Avisos (N novos)\")")
    o.ok(B.fase_do_codigo("local", "x") == "depois" and B.fase_do_codigo("staging", "53f2583") == "antes" and B.fase_do_codigo("staging", "HEAD") == "depois",
         "antes × depois vem do CÓDIGO medido (o 53f2583 não tem src/conta/ler.ts: antes; o HEAD tem: depois)")


def conta_do_app(base: str) -> str:
    """A conta das telas do app (decisão N da 21b — o ## PAROU 02:04 da 21a): na produção a aluno-calc (a conta de teste da PRODUÇÃO, a do
    smoke do W7); no local/staging a w5p-aluna. Nunca a conta do staging na produção."""
    return B.PROD_CONTA if base == "prod" else B.ALUNA


def rodar(o, area: str, base: str, canal: str | None) -> None:
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    if area in B.AREAS_DA_21D:  # hml-21d
        rodar_21d(o, base, canal)
        return
    if area in B.AREAS_DA_21B:
        rodar_21b(o, area, base, canal)
        return
    s = B.usar_base(base)
    aluna = conta_do_app(base)
    L = B.Sessoes(f"rede21 {area} {base}")  # na produção o motivo termina em "prod" (o registro: fora do teto do staging)
    commit = B.commit_medido(base)
    fase = B.fase_do_codigo(base, commit)
    massa = area == "casca" and base != "prod"
    estado = None
    try:
        B.exigir_saude(o, f"o rede.py --area {area} da hml-21a")
        if massa:
            B.guardar_sino(o, s)  # os não lidos de ANTES da etapa 2 (abrir o sino marca todos): voltam no api.py --devolver-sino
            estado = B.abrir_rodada(o, s)
            B.criar_massa_avisos(o, estado, L, s, L.uid(aluna), estado.d["rodada"])
        guarda = B.guarda_da_w() if base == "prod" else None
        with sync_playwright() as pw:
            nav = pw.chromium.launch(channel=canal, args=["--no-sandbox"]) if canal else pw.chromium.launch(args=["--no-sandbox"])
            t = B.Tela(nav, B.BASES[base], f"hml21_{base}", f"rede_{area}", desktop=False, guarda=guarda)
            if base == "prod":
                t.ctx.add_init_script(B.JS_SEM_AVISO_VISTO)  # o 🟡1: sem a marca local de aviso visto (a sessão gravaria sozinha)
            B.LegalDesligado().instalar(t.ctx)
            pend = B.Pendentes(t.pg)
            try:
                o.linha(f"[{base}] {commit}: o {fase} · área {area}" + (f" · a conta das telas na produção: {aluna}" if base == "prod" else ""))
                for i, (tela, rota, marca) in enumerate(telas_da_rodada(area, base)):
                    nl = 0
                    if i == 0:
                        t.entrar(L, aluna, rota)  # a sessão antes do 1º documento; o aceite e o "mudou" saem pelo LegalDesligado
                    elif rota is None:
                        o.ok(t.esperar(lambda: t.n("[data-sino]") > 0, 20), f"[{base}] o sino está no Início", parar=True)
                        if tela == "sino":
                            t.esperar(lambda: nao_lidos(t) > 0, 15)  # a lista do sino chegou (com a massa: os não lidos)
                        nl = nao_lidos(t)
                        abrir_sino(t)
                    else:
                        if t.n("[data-sino-lista]"):
                            t.pg.keyboard.press("Escape")
                            t.pg.wait_for_timeout(400)
                        B.navegar(t, rota)
                    pronta = B.esperar_pronto(t, pend, marca=marca, max_s=40 if i == 0 else B.MAX_S)
                    o.ok(t.n(marca) > 0, f"[{base}] {tela}: a tela abriu ({marca}; marca em {pronta['t_marca_s']} s)")
                    cont = B.contar_area(pronta["pedidos"], area)
                    conferir(o, base, fase, area, tela, cont, pronta, nl)
                    anotar(base, commit, fase, area, tela, cont, pronta)
                if guarda:
                    o.ok(not guarda.bloqueadas, f"[prod] a Guarda não barrou nada (as telas só leram; o `ler` passa): {guarda.bloqueadas or '—'}")
            finally:
                B.sair_do_treino(o, t.pg, f"[{base}] rede {area}", t)
                L.do_navegador(aluna, t.pg)
                t.fim()
                nav.close()
    finally:
        try:
            if estado is not None:
                B.fechar_rodada(o, estado, s, L)
        finally:
            L.fechar(o)


# ───────────────────────── hml-21b: a rede da Agenda e dos Alunos (--area agenda|alunos) ─────────────────────────
def rodar_21b(o, area: str, base: str, canal: str | None) -> None:
    """A rede de cada tela da 21b, conta por conta (um navegador; um contexto por conta, a sessão reaproveitada): a nutri (a Agenda — semana,
    mês e os 3 diálogos — ou os Alunos, o Dashboard e a Busca), o dono (a Agenda com a equipe / os Alunos) e a aluna (a Agenda dela). Na
    produção (decisão N): só a nutri-legado e a aluno-calc, com a Guarda (as RPCs de leitura do front antigo passam), sem a marca local de
    aviso visto e o LegalDesligado; a Agenda só com calendário e as 3 tags base (senão PULADA). Nada de massa: a rede só abre as telas."""
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    s = B.usar_base(base)
    B.usar_area(area)
    L = B.Sessoes(f"rede21 {area} {base}")  # na produção o motivo termina em "prod" (o registro: fora do teto do staging)
    commit = B.commit_medido(base)
    fase = P21.fase_do_codigo_21b(base, commit)
    try:
        B.exigir_saude(o, f"o rede.py --area {area} da hml-21b")
        o.linha(f"[{base}] {commit}: o {fase} · área {area} · contas {P21.contas_da_area(area, base)}")
        with sync_playwright() as pw:
            nav = pw.chromium.launch(channel=canal, args=["--no-sandbox"]) if canal else pw.chromium.launch(args=["--no-sandbox"])
            try:
                for conta in P21.contas_da_area(area, base):
                    telas = P21.telas_que_abrem(o, s, base, area, conta)
                    if not telas:
                        continue
                    guarda = B.guarda_da_w() if base == "prod" else None
                    t, pend = P21.abrir_conta(nav, base, conta, f"rede_{area}_{conta}", guarda)
                    try:
                        P21.entrar(o, t, pend, L, base, conta)
                        for tela in telas:
                            nome, _como, marca, teto = tela
                            pronta = P21.abrir_tela(t, pend, tela)
                            o.ok(t.n(marca) > 0, f"[{base}] {conta} · {nome}: a tela abriu ({marca}; marca em {pronta['t_marca_s']} s)")
                            cont = B.contar_area(pronta["pedidos"], area)
                            P21.conferir_tela(o, base, fase, area, conta, nome, teto, cont, pronta)
                            P21.anotar_rede(base, commit, fase, area, conta, nome, cont, pronta)
                        P21.fechar_janelas(t)
                        if guarda:
                            o.ok(not guarda.bloqueadas, f"[prod] {conta}: a Guarda não barrou nada (as telas só leram): {guarda.bloqueadas or '—'}")
                    finally:
                        P21.sair_da_conta(o, t, L, base, conta, f"rede {area}")
            finally:
                nav.close()
    finally:
        L.fechar(o)


def seco_21b(o, area: str) -> None:
    """O --seco da 21b (sem rede, sem navegador): os seletores no código, a guarda das áreas da 21b em pedidos de exemplo (antes e
    depois), a Guarda da produção com as 9 RPCs de leitura da 21b e as contas/telas de cada base (decisão N)."""
    faltam = [f"{arq}: {sel}" for arq, sels in P21.SELETORES.items() for sel in sels if sel not in (B.REPO / arq).read_text(encoding="utf-8")]
    o.ok(not faltam, f"os {sum(len(v) for v in P21.SELETORES.values())} seletores das telas da 21b existem no código" + (f" — faltam: {faltam}" if faltam else ""))
    P = B.API_P
    uid = "33333333-3333-4333-8333-333333333333"
    rpc = lambda n: {"metodo": "POST", "tipo": "rpc", "nome": n, "url": f"{P}/rest/v1/rpc/{n}", "corpo": "{}"}  # noqa: E731
    tab = lambda n, m="GET": {"metodo": m, "tipo": "tab", "nome": n, "url": f"{P}/rest/v1/{n}?select=*", "corpo": "" if m == "GET" else "{}"}  # noqa: E731
    fn = lambda corpo: {"metodo": "POST", "tipo": "fn", "nome": "conta", "acao": corpo.get("acao"), "url": f"{P}/functions/v1/conta", "corpo": json.dumps(corpo)}  # noqa: E731
    antes = [tab("calendarios"), tab("agendamentos"), tab("agenda_tags"), tab("bloqueios_agenda"), tab("agenda_travas"), tab("agenda_config"),
             tab("pacientes"), rpc("agenda_horarios"), rpc("alunos_da_conta"), rpc("alunos_novos_por_mes"), rpc("equipe_da_conta"), rpc("minhas_regras_agenda"),
             tab("calendarios", "POST"), rpc("agenda_garantir_tags"), rpc("whatsapp_resumo"), tab("physiq_treinos_prontos")]
    c = B.contar_area(antes, "agenda")
    o.ok(c["diretas"] == {"tab:calendarios:GET": 1, "tab:agendamentos:GET": 1, "tab:agenda_tags:GET": 1, "tab:bloqueios_agenda:GET": 1,
                          "tab:agenda_travas:GET": 1, "tab:agenda_config:GET": 1, "tab:pacientes:GET": 1, "rpc:agenda_horarios": 1,
                          "rpc:minhas_regras_agenda": 1, "tab:calendarios:POST": 1, "rpc:agenda_garantir_tags": 1}
         and c["outra_area"] == {"tab:pacientes:GET": 1, "rpc:alunos_da_conta": 1, "rpc:alunos_novos_por_mes": 1, "rpc:equipe_da_conta": 1}
         and c["fora"] == {"rpc:whatsapp_resumo": 1, "tab:physiq_treinos_prontos": 1} and any(k.startswith("rest_") for k in c["gravacoes"]),
         f"a guarda do ANTES (agenda): as 6 tabelas, os alunos e as RPCs da Agenda diretos; os Alunos na outra área; o de fora à parte; o insert é gravação: {c}")
    c = B.contar_area(antes, "alunos")
    o.ok(c["diretas"] == {"tab:pacientes:GET": 1, "rpc:alunos_da_conta": 1, "rpc:alunos_novos_por_mes": 1, "rpc:equipe_da_conta": 1}
         and "rpc:agenda_horarios" in c["outra_area"], f"a guarda do ANTES (alunos): a lista, o seletor, os novos por mês e a equipe diretos; a Agenda na outra área: {c}")
    ler = {"acao": "ler", "itens": [{"q": "agenda_calendarios", "conta": uid}, {"q": "agenda_agendamentos", "de": "2026-10-11T03:00:00.000Z",
                                                                                  "ate": "2026-10-18T03:00:00.000Z", "conta": uid}]}
    depois = [fn(ler), fn({"acao": "ler", "itens": [{"q": "agenda_tags", "donos": [uid]}]}), fn({"id": uid, "acao": "agendamento_excluir"}),
              {"metodo": "OPTIONS", "tipo": "fn", "nome": "conta", "acao": None, "url": f"{P}/functions/v1/conta", "corpo": ""},
              {"metodo": "POST", "tipo": "fn", "nome": "nutricao", "acao": "ler", "url": f"{P}/functions/v1/nutricao", "corpo": json.dumps({"acao": "ler", "itens": []})},
              rpc("whatsapp_resumo")]
    for ar in ("agenda", "alunos"):
        c = B.contar_area(depois, ar)
        o.ok(not c["diretas"] and not c["outra_area"] and c["ler"] == 2 and c["acoes"] == {"agendamento_excluir": 1}
             and c["consultas"] == {"agenda_calendarios": 1, "agenda_agendamentos": 1, "agenda_tags": 1}
             and c["gravacoes"] == {"fn:conta(agendamento_excluir)": 1} and c["fora"] == {"rpc:whatsapp_resumo": 1},
             f"a guarda do DEPOIS ({ar}): 0 direta, 2 `ler` (as consultas), 1 ação (gravação; o `ler` da nutricao não é da conta), o de fora à parte: {c}")
    # a Guarda da produção (decisão N): o `ler` e as RPCs de leitura do front antigo (21a e 21b) passam; o resto é barrado
    g = B.guarda_da_w()
    Ped = type("Ped", (), {})

    def pedido(metodo: str, url: str, corpo: dict | None = None):
        x = Ped()
        x.method, x.url, x.post_data = metodo, url, (json.dumps(corpo) if corpo is not None else None)
        return x

    passam = [pedido("POST", f"{P}/functions/v1/conta", ler)] + [pedido("POST", f"{P}/rest/v1/rpc/{n}", {}) for n in sorted(B.RPCS_DE_LEITURA_DA_21B)] \
        + [pedido("GET", f"{P}/rest/v1/calendarios?select=*")]
    barram = [pedido("POST", f"{P}/functions/v1/conta", {"acao": "agenda_garantir", "conta_id": uid, "papeis": [], "modulos": []}),
              pedido("POST", f"{P}/functions/v1/conta", {"acao": "tags_garantir"}),
              pedido("POST", f"{P}/functions/v1/conta", {"action": "ler", "acao": "calendario_criar"}),
              pedido("POST", f"{P}/rest/v1/rpc/agenda_garantir_tags", {}), pedido("POST", f"{P}/rest/v1/rpc/agenda_garantir_inicio", {}),
              pedido("POST", f"{P}/rest/v1/rpc/agenda_excluir_calendario", {}), pedido("POST", f"{P}/rest/v1/calendarios", {}),
              pedido("PATCH", f"{P}/rest/v1/agendamentos?id=eq.{uid}", {}), pedido("POST", f"{P}/rest/v1/rpc/aluno_definir_pacote", {})]
    o.ok(not any(g.escrita(x) for x in passam) and all(g.escrita(x) for x in barram),
         f"a Guarda da produção: passam o `ler` da conta e as 9 RPCs de leitura do front antigo da 21b ({len(passam)}); barram as ações da conta "
         f"(o agenda_garantir e o tags_garantir — a Agenda que grava ao abrir), o `ler` disfarçado, as RPCs que gravam (as 2 novas inclusive) e "
         f"a escrita direta ({len(barram)})")
    o.ok(not B.B17.Guarda().leitura & B.RPCS_DE_LEITURA_DA_21B,
         "a lista da Guarda do repo (o RPC_SO_LEITURA do repeticao.ts) já não tem as 9 (saíram do front na 21b) — só a guarda_da_w() as soma")
    # as contas e as telas de cada base (decisão N): a produção NUNCA com a conta do staging
    staging = {P21.NUTRI, P21.PERSONAL, P21.ALUNA, P21.OUTRA}
    o.ok(P21.contas_da_area("agenda", "prod") == ["nutri-legado", "aluno-calc"] and P21.contas_da_area("alunos", "prod") == ["nutri-legado"]
         and not staging & set(P21.contas_da_area("agenda", "prod") + P21.contas_da_area("alunos", "prod"))
         and P21.contas_da_area("agenda", "staging") == [P21.NUTRI, P21.PERSONAL, P21.ALUNA] and conta_do_app("prod") == "aluno-calc"
         and conta_do_app("staging") == "w5p-aluna" and conta_do_app("local") == "w5p-aluna",
         "decisão N: na produção a nutri-legado (painel) e a aluno-calc (app) — nunca a conta do staging; no local/staging as de teste da W "
         "(e o rede.py --area casca|app na produção entra com a aluno-calc)")
    fonte = Path(__file__).read_text(encoding="utf-8").split("def seco_21b", 1)[0]  # o código das rodadas (sem esta conferência)
    o.ok("t.entrar(L, aluna, rota)" in fonte and "L.do_navegador(aluna, t.pg)" in fonte and "t.entrar(L, B.ALUNA" not in fonte
         and "L.do_navegador(B.ALUNA" not in fonte,
         "decisão N no código: o rede.py --area casca|app entra e devolve a sessão com a conta da base (nenhum B.ALUNA fixo no entrar/do_navegador)")
    o.ok([x[0] for x in P21.telas_da_conta("agenda", P21.NUTRI)] == ["agenda_semana", "agenda_mes", "agenda_novo", "agenda_regras", "agenda_travas"]
         and [x[0] for x in P21.telas_da_conta("agenda", P21.PERSONAL)] == ["agenda_semana"]
         and [x[0] for x in P21.telas_da_conta("agenda", P21.ALUNA)] == ["agenda_aluno"]
         and [x[0] for x in P21.telas_da_conta("agenda", "aluno-calc")] == ["agenda_aluno"]
         and [x[0] for x in P21.telas_da_conta("alunos", P21.NUTRI)] == ["alunos", "dashboard", "busca"]
         and all(t[3] in (1, 2) for t in P21.TELAS_DA_AGENDA + P21.TELAS_DOS_ALUNOS + (P21.AGENDA_ALUNO,)),
         "as telas de cada conta (a nutri: a Agenda semana/mês e os 3 diálogos; o dono: a semana; a aluna: a Agenda dela; os Alunos, o Dashboard "
         "e a Busca) e o teto de `ler` (2 só onde a série foi aceita)")
    sql = P21.sql_agenda_sem_gravar("public", uid)
    o.ok("public.calendarios" in sql and "c.deleted_at is null" in sql and "t.base" in sql and "count(distinct t.area)" in sql and "insert" not in sql.lower(),
         "a pré-condição da Agenda (sem gravar ao abrir): calendário próprio vivo + as 3 tags base — SQL só leitura, só contagem, no schema da base")
    o.ok(P21.ENTRADA_PAINEL.startswith("/painel/configuracoes") and not any(P21.ENTRADA_PAINEL.startswith(r) for r in ("/painel/agenda", "/painel/alunos"))
         and P21.ENTRADA_APP == "/perfil", "a entrada é de fora da 21b (a carga fria não entra na medida da 1ª tela)")
    o.ok(P21.fase_do_codigo_21b("local", "x") == "depois" and P21.fase_do_codigo_21b("staging", "d357719") == "antes"
         and P21.fase_do_codigo_21b("staging", "HEAD") == "depois" and P21.fase_do_codigo_21b("staging", "0123abc") == "antes",
         "antes × depois vem do CÓDIGO medido (o d357719 lê a Agenda direto: antes; o HEAD pela conta: depois; um commit que o repo não tem — "
         "a branch de outra W no staging — antes: a 21b só existe nesta worktree)")
    # 🟡3: a tela Alunos GRAVA ao abrir sem o codigo_convite da conta ativa (meuLink.ts:13 → garantir_meu_codigo): PULADA, em toda base —
    # conferido com a situação e as contagens FALSAS (nada vai ao banco)
    meu_link = (B.REPO / "src/painel/alunos/meuLink.ts").read_text(encoding="utf-8")
    originais = (P21.situacao_como, P21.agenda_abre_sem_gravar, B.uid_da_conta)
    situacoes = {"com": {"contas": [{"id": uid, "papeis": ["nutricionista"], "modulos": ["nutricao"], "codigo_convite": "NUTRI-AB12"}]},
                 "sem": {"contas": [{"id": uid, "papeis": ["nutricionista"], "modulos": ["nutricao"], "codigo_convite": None}]},
                 "nenhuma": {"contas": []}}
    qual = {"v": "com"}

    class Calado:
        def ok(self, c: object, _t: str, parar: object = None) -> bool:
            return bool(c)

        def linha(self, _t: str) -> None:
            pass

    try:
        P21.situacao_como = lambda _s, _uid, _conta: situacoes[qual["v"]]  # type: ignore[assignment]
        P21.agenda_abre_sem_gravar = lambda _s, _uid: (True, "falso")  # type: ignore[assignment]
        B.uid_da_conta = lambda _conta: uid  # type: ignore[assignment]
        resultado = {}
        for k in ("com", "sem", "nenhuma"):
            qual["v"] = k
            resultado[k] = ([x[0] for x in P21.telas_que_abrem(Calado(), "staging", "staging", "alunos", P21.NUTRI)], P21.alunos_abre_sem_gravar("staging", uid, P21.NUTRI)[0])
        qual["v"] = "sem"
        agenda_sem = [x[0] for x in P21.telas_que_abrem(Calado(), "public", "prod", "agenda", P21.PROD_PAINEL)]
    finally:
        P21.situacao_como, P21.agenda_abre_sem_gravar, B.uid_da_conta = originais
    o.ok("codigoConta ?? (await garantirMeuCodigo(conta!.id))" in meu_link and "conta?.codigo_convite" in meu_link
         and resultado == {"com": (["alunos", "dashboard", "busca"], True), "sem": (["dashboard", "busca"], False), "nenhuma": (["alunos", "dashboard", "busca"], True)}
         and agenda_sem == ["agenda_semana", "agenda_mes", "agenda_novo", "agenda_regras", "agenda_travas"],
         "🟡3: a tela Alunos só abre com o codigo_convite da conta ativa (sem ele o useMeuLink grava — garantir_meu_codigo): PULADA, em toda base; "
         "sem conta ativa ela abre (o useMeuLink não roda); a Agenda não depende do código")


# ───────────────────────── hml-21d: a rede do Treino (--area treinos) ─────────────────────────
def rodar_21d(o, base: str, canal: str | None) -> None:
    """A rede de cada tela da 21d, conta por conta (um navegador; um contexto por conta, a sessão reaproveitada): o personal (Meus treinos,
    o Detalhe — o 1º treino da lista —, a Biblioteca, a Folha — o 1º exercício —, os Modelos › Treinos, a Busca e o Aluno › Treino da aluna
    de TESTE) e o aluno sem profissional (os Treinos prontos). Na produção (decisão N): a nutri-legado (só com o Treino na conta ativa) e a
    aluno-calc (só sem profissional), com a Guarda (as RPCs de leitura do front antigo passam), sem a marca local de aviso visto e o
    LegalDesligado — o editor fica de fora (sem aluno de TESTE lá). Nada de massa: a rede só abre as telas."""
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    s = B.usar_base(base)
    B.usar_area("treinos")
    L = B.Sessoes(f"rede21 treinos {base}")  # na produção o motivo termina em "prod" (o registro: fora do teto do staging)
    commit = B.commit_medido(base)
    fase = T21.fase_do_codigo_21d(base, commit)
    try:
        B.exigir_saude(o, "o rede.py --area treinos da hml-21d")
        o.linha(f"[{base}] {commit}: o {fase} · área treinos · contas {T21.contas_da_area(base)}")
        with sync_playwright() as pw:
            nav = pw.chromium.launch(channel=canal, args=["--no-sandbox"]) if canal else pw.chromium.launch(args=["--no-sandbox"])
            try:
                for conta in T21.contas_da_area(base):
                    telas = T21.telas_que_abrem(o, s, base, conta)
                    if not telas:
                        continue
                    guarda = B.guarda_da_w() if base == "prod" else None
                    t, pend = T21.abrir_conta(nav, base, conta, f"rede_treinos_{conta}", guarda)
                    try:
                        T21.entrar(o, t, pend, L, base, conta)
                        for tela in telas:
                            nome, (como, alvo), marca, teto = tela
                            if como == "clique" and not t.esperar(lambda: t.n(alvo) > 0, 20):
                                o.ok(True, f"[{base}] {conta} · {nome}: PULADO — a tela de cima sem item para abrir ({alvo})")
                                continue
                            pronta = T21.abrir_tela(t, pend, tela, s)
                            o.ok(t.n(marca) > 0, f"[{base}] {conta} · {nome}: a tela abriu ({marca[:60]}; marca em {pronta['t_marca_s']} s)")
                            cont = T21.contar_tela(pronta["pedidos"])
                            T21.conferir_tela(o, base, fase, conta, nome, teto, cont, pronta)
                            T21.anotar_rede(base, commit, fase, conta, nome, cont, pronta)
                        T21.fechar_janelas(t)
                        if guarda:
                            o.ok(not guarda.bloqueadas, f"[prod] {conta}: a Guarda não barrou nada (as telas só leram): {guarda.bloqueadas or '—'}")
                    finally:
                        T21.sair_da_conta(o, t, L, base, conta, "rede treinos")
            finally:
                nav.close()
    finally:
        L.fechar(o)


def seco_21d(o) -> None:  # noqa: PLR0915
    """O --seco da 21d (sem rede, sem navegador): os seletores no código, nenhuma tela da área grava ao abrir, a guarda da área em pedidos de
    exemplo (antes e depois), a Guarda da produção com as 3 RPCs de leitura da 21d e as contas/telas de cada base (decisão N)."""
    B.usar_area("treinos")
    faltam = [f"{arq}: {sel}" for arq, sels in T21.SELETORES.items() for sel in sels if sel not in (B.REPO / arq).read_text(encoding="utf-8")]
    o.ok(not faltam, f"os {sum(len(v) for v in T21.SELETORES.values())} seletores e rotas das telas da 21d existem no código" + (f" — faltam: {faltam}" if faltam else ""))
    gravam = {arq: T21.efeitos_que_gravam(arq) for arq in T21.TELAS_SEM_GRAVAR_AO_ABRIR}
    exemplo = "useEffect(() => { if (x) { void criarPasta(nome, dono); } }, [x]);\nconst f = () => criarModelo(a, b);"
    o.ok(not any(gravam.values()) and T21.gravacoes_em_efeitos(exemplo) == ["criarPasta"],
         f"nenhuma tela da área grava ao abrir: 0 gravação dentro de um useEffect nos {len(gravam)} arquivos das telas (o detector acha a de um "
         f"efeito de exemplo e não a de um clique) — {[(a, g) for a, g in gravam.items() if g] or '—'}")
    P, T = B.API_P, B.API_T
    ex = "77777777-7777-4777-8777-777777777777"
    rpc = lambda n, h=T: {"metodo": "POST", "tipo": "rpc", "nome": n, "url": f"{h}/rest/v1/rpc/{n}", "corpo": "{}"}  # noqa: E731
    tab = lambda n, m="GET", h=T: {"metodo": m, "tipo": "tab", "nome": n, "url": f"{h}/rest/v1/{n}?select=id", "corpo": "" if m == "GET" else "{}"}  # noqa: E731
    fn = lambda nome, corpo, h=T: {"metodo": "POST", "tipo": "fn", "nome": nome, "acao": corpo.get("action") or corpo.get("acao"),  # noqa: E731
                                   "url": f"{h}/functions/v1/{nome}", "corpo": json.dumps(corpo)}
    sto = lambda m, caminho: {"metodo": m, "tipo": "storage", "nome": "objeto", "url": f"{T}/storage/v1/object/{caminho}", "corpo": ""}  # noqa: E731
    antes = [tab("tb_grupos_treino"), rpc("modelos_da_lista"), tab("tb_grupos_exercicios"), tab("tb_pastas_treino_grupos"), tab("tb_exercicios"),
             rpc("exercicios_da_lista"), tab("physiq_treinos_prontos"), rpc("aluno_treino", P), tab("tb_grupos_treino", "POST"),
             sto("POST", f"exercicios-staging/{ex}.png"), tab("physiq_professores", "PATCH"), rpc("whatsapp_resumo", P), tab("physiq_profiles")]
    c = T21.contar_tela(antes)
    o.ok(c["diretas"] == {"tab:tb_grupos_treino:GET": 1, "rpc:modelos_da_lista": 1, "tab:tb_grupos_exercicios:GET": 1, "tab:tb_pastas_treino_grupos:GET": 1,
                          "tab:tb_exercicios:GET": 1, "rpc:exercicios_da_lista": 1, "tab:physiq_treinos_prontos:GET": 1, "rpc:aluno_treino": 1,
                          "tab:tb_grupos_treino:POST": 1, "storage:exercicios-staging": 1, "tab:physiq_professores:PATCH": 1}
         and c["fora"] == {"rpc:whatsapp_resumo": 1, "tab:physiq_profiles": 1} and not c["ler"]
         and any(k.startswith("rest_") for k in c["gravacoes"]) and "storage_grava" in c["gravacoes"],
         f"a guarda do ANTES: as tabelas, as RPCs e o bucket do Treino (e a aluno_treino do principal) diretos; o de fora à parte; o insert, o "
         f"PATCH e o upload direto são gravação: {c}")
    ler1 = {"acao": "ler", "itens": [{"q": "modelos", "filtros": {}, "offset": 0, "limite": 20}, {"q": "pastas"}, {"q": "exercicios_lista", "filtros": {},
                                                                                                             "offset": 0, "limite": 1}]}
    ler2 = {"acao": "ler", "itens": [{"q": "modelos_detalhes", "ids": [ex]}]}
    depois = [fn("treinos", ler1), fn("treinos", ler2), fn("conta", {"acao": "ler", "itens": [{"q": "aluno_treino", "aluno": ex}]}, P),
              fn("treinos", {"nome": "x", "acao": "modelo_criar"}),
              {"metodo": "PUT", "tipo": "storage", "nome": "objeto", "url": f"{T}/storage/v1/object/upload/sign/exercicios-staging/{ex}.png?token=t", "corpo": ""},
              sto("GET", f"public/exercicios-staging/{ex}.png"), rpc("whatsapp_resumo", P),
              {"metodo": "OPTIONS", "tipo": "fn", "nome": "treinos", "acao": None, "url": f"{T}/functions/v1/treinos", "corpo": ""}]
    c = T21.contar_tela(depois)
    o.ok(not c["diretas"] and c["ler"] == 2 and c["ler_conta"] == 1 and c["acoes"] == {"treinos:modelo_criar": 1}
         and c["consultas"] == {"modelos": 1, "pastas": 1, "exercicios_lista": 1, "modelos_detalhes": 1} and c["consultas_conta"] == {"aluno_treino": 1}
         and c["gravacoes"] == {"fn:treinos(modelo_criar)": 1, "storage_link_assinado": 1} and c["fora"] == {"rpc:whatsapp_resumo": 1},
         f"a guarda do DEPOIS: 0 direta (o PUT no link que o servidor assinou e a imagem pública não contam), 2 `ler` da treinos (as consultas), 1 "
         f"`ler` da conta (o editor), 1 ação (gravação), o de fora à parte: {c}")
    disfarce = T21.contar_tela([fn("treinos", {"action": "ler", "acao": "pasta_excluir"}), fn("treinos", {"acao": "ler", "x": 1})])
    o.ok(disfarce["acoes"] == {"treinos:pasta_excluir": 1} and disfarce["gravacoes"] == {"fn:treinos(ler)": 1} and disfarce["ler"] == 1,
         f"o `ler` disfarçado (action: ler, acao: <ação>) conta como a ação/gravação — o campo é o que a treinos lê: {disfarce}")
    # a Guarda da produção (decisão N): o `ler` das 2 funções e as 3 RPCs de leitura do front antigo passam; o resto é barrado
    g = B.guarda_da_w()
    Ped = type("Ped", (), {})

    def pedido(metodo: str, url: str, corpo: dict | None = None):
        x = Ped()
        x.method, x.url, x.post_data = metodo, url, (json.dumps(corpo) if corpo is not None else None)
        return x

    passam = [pedido("POST", f"{T}/functions/v1/treinos", ler1), pedido("POST", f"{P}/functions/v1/conta", {"acao": "ler", "itens": [{"q": "aluno_treino"}]}),
              pedido("POST", f"{T}/rest/v1/rpc/modelos_da_lista", {}), pedido("POST", f"{T}/rest/v1/rpc/exercicios_da_lista", {}),
              pedido("POST", f"{P}/rest/v1/rpc/aluno_treino", {}), pedido("GET", f"{T}/rest/v1/tb_grupos_treino?select=id")]
    barram = [pedido("POST", f"{T}/functions/v1/treinos", {"acao": a}) for a in ("modelo_criar", "exercicio_foto_preparar", "professor_perfil",
                                                                                  "treino_pronto_salvar", "modelo_ordenar")] + [
        pedido("POST", f"{T}/functions/v1/treinos", {"action": "ler", "acao": "pasta_excluir"}), pedido("POST", f"{T}/rest/v1/tb_grupos_treino", {}),
        pedido("PATCH", f"{T}/rest/v1/tb_exercicios?id=eq.{ex}", {}), pedido("POST", f"{T}/rest/v1/rpc/modelo_ordenar", {}),
        pedido("POST", f"{T}/rest/v1/rpc/treino_pronto_salvar", {}), pedido("POST", f"{T}/storage/v1/object/exercicios/{ex}.png", None),
        pedido("PUT", f"{T}/storage/v1/object/upload/sign/exercicios/{ex}.png?token=t", None)]
    o.ok(not any(g.escrita(x) for x in passam) and all(g.escrita(x) for x in barram),
         f"a Guarda da produção: passam o `ler` da treinos e da conta e as 3 RPCs de leitura do front antigo da 21d ({len(passam)}); barram as ações "
         f"da treinos (as do Master inclusive), o `ler` disfarçado, a escrita direta no Treino, as 2 RPCs novas e o upload ({len(barram)})")
    o.ok(not B.B17.Guarda().leitura & B.RPCS_DE_LEITURA_DA_21D,
         "a lista da Guarda do repo (o RPC_SO_LEITURA do repeticao.ts) já não tem as 3 (saíram do front na 21d) — só a guarda_da_w() as soma")
    # as contas e as telas de cada base (decisão N): a produção NUNCA com a conta do staging
    staging = {T21.PERSONAL, T21.SOZINHO, T21.OUTRA}
    o.ok(T21.contas_da_area("prod") == ["nutri-legado", "aluno-calc"] and not staging & set(T21.contas_da_area("prod"))
         and T21.contas_da_area("staging") == [T21.PERSONAL, T21.SOZINHO] and T21.contas_da_area("local") == [T21.PERSONAL, T21.SOZINHO],
         "decisão N: na produção a nutri-legado (painel) e a aluno-calc (app) — nunca a conta do staging; no local/staging as de teste da W")
    o.ok([x[0] for x in T21.telas_da_conta(T21.PERSONAL, "staging")] == ["meus_treinos", "detalhe", "biblioteca", "folha", "modelos_treinos", "busca", "editor"]
         and [x[0] for x in T21.telas_da_conta("nutri-legado", "prod")] == ["meus_treinos", "detalhe", "biblioteca", "folha", "modelos_treinos", "busca"]
         and [x[0] for x in T21.telas_da_conta(T21.SOZINHO, "local")] == ["treinos_prontos_aluno"]
         and [x[0] for x in T21.telas_da_conta("aluno-calc", "prod")] == ["treinos_prontos_aluno"]
         and {x[0]: x[3] for x in T21.TELAS_DO_PAINEL + (T21.PRONTOS,)} == {"meus_treinos": 2, "detalhe": 1, "biblioteca": 1, "folha": 1, "modelos_treinos": 1,
                                                                             "busca": 1, "editor": 1, "treinos_prontos_aluno": 1},
         "as telas de cada conta (o Detalhe e a Folha pelo clique na tela de cima; o editor fora da produção — sem aluno de TESTE lá) e o teto de "
         "`ler` (2 só em Meus treinos — a série aceita, DECISÃO 12:1x)")
    # a trava das telas que PULAM (decisão N): sem o Treino na conta ativa / com profissional / sem a matrícula de teste — com valores FALSOS
    originais = (T21.painel_tem_treino, T21.aluno_sem_profissional, T21.matricula_do_aluno)

    class Calado:
        def ok(self, c: object, _t: str, parar: object = None) -> bool:
            return bool(c)

        def linha(self, _t: str) -> None:
            pass

    try:
        T21.painel_tem_treino = lambda _s, _c: (False, "falso")  # type: ignore[assignment]
        T21.aluno_sem_profissional = lambda _s, _c: (False, "falso")  # type: ignore[assignment]
        T21.matricula_do_aluno = lambda _s: None  # type: ignore[assignment]
        pula = ([x[0] for x in T21.telas_que_abrem(Calado(), "public", "prod", "nutri-legado")], [x[0] for x in T21.telas_que_abrem(Calado(), "public", "prod", "aluno-calc")],
                [x[0] for x in T21.telas_que_abrem(Calado(), "staging", "local", T21.PERSONAL)])
        T21.painel_tem_treino = lambda _s, _c: (True, "falso")  # type: ignore[assignment]
        T21.aluno_sem_profissional = lambda _s, _c: (True, "falso")  # type: ignore[assignment]
        abre = ([x[0] for x in T21.telas_que_abrem(Calado(), "public", "prod", "nutri-legado")], [x[0] for x in T21.telas_que_abrem(Calado(), "public", "prod", "aluno-calc")])
    finally:
        T21.painel_tem_treino, T21.aluno_sem_profissional, T21.matricula_do_aluno = originais
    o.ok(pula == ([], [], ["meus_treinos", "detalhe", "biblioteca", "folha", "modelos_treinos", "busca"])
         and abre == (["meus_treinos", "detalhe", "biblioteca", "folha", "modelos_treinos", "busca"], ["treinos_prontos_aluno"]),
         "decisão N: na produção o painel sem o Treino na conta ativa e o aluno com profissional PULAM (com o motivo, nada aberto); o editor sem a "
         "matrícula de TESTE pula — e com as pré-condições, abrem")
    fonte = Path(__file__).read_text(encoding="utf-8").split("def seco_21d", 1)[0]
    base21d = (B.REPO / "e2e" / "hml21" / "treinos21d.py").read_text(encoding="utf-8")
    o.ok('guarda = B.guarda_da_w() if base == "prod" else None\n                    t, pend = T21.abrir_conta(nav, base, conta, f"rede_treinos_{conta}", guarda)' in fonte
         and 'if base == "prod":\n        t.ctx.add_init_script(B.JS_SEM_AVISO_VISTO)' in base21d and "B.LegalDesligado().instalar(t.ctx)" in base21d,
         "a trava da produção no código: a Guarda da W em cada contexto da produção, sem a marca local de aviso visto, e o LegalDesligado da 21a")
    o.ok(not any(T21.ENTRADA_PAINEL.startswith(r) for r in ("/painel/treinos", "/painel/modelos", "/painel/alunos")) and T21.ENTRADA_APP == "/perfil"
         and not T21.efeitos_que_gravam("src/painel/configuracoes/Perfil.tsx"),
         "a entrada é de fora da 21d (a carga fria não entra na medida da 1ª tela) e não grava ao abrir (o espelho do Treino só no salvar)")
    o.ok(T21.fase_do_codigo_21d("local", "x") == "depois" and T21.fase_do_codigo_21d("staging", "7c1a637") == "antes"
         and T21.fase_do_codigo_21d("staging", "HEAD") == "depois", "antes × depois vem do CÓDIGO medido (o 7c1a637: antes; o HEAD: depois)")


def main() -> int:
    ap = argparse.ArgumentParser(description="hml-21a/21b/21d — a rede das telas (antes × depois): a casca e o app do aluno; a Agenda e os Alunos; o Treino")
    ap.add_argument("--area", required=True, choices=("casca", "app", "agenda", "alunos", "treinos"))
    ap.add_argument("--base", default="local", choices=tuple(B.BASES))
    ap.add_argument("--canal", default=None, help="msedge (o Edge — sempre nos E2E de tela)")
    ap.add_argument("--seco", action="store_true")
    a = ap.parse_args()
    B.corte_vira_saida()
    B.usar_area(a.area)
    if a.seco:
        o = C.Saida(f"rede21_{a.area}_seco")
        if a.area in B.AREAS_DA_21D:
            seco_21d(o)
        elif a.area in B.AREAS_DA_21B:
            seco_21b(o, a.area)
        else:
            seco(o)
        return o.fim()
    o = C.Saida(f"rede21_{a.area}_{a.base}")
    try:
        rodar(o, a.area, a.base, a.canal)
    except (Exception, SystemExit) as e:  # noqa: BLE001
        o.ok(False, f"parou no meio: {type(e).__name__}: {str(e)[:300]}")
    C.C2.registrar_rodada(o.oks, o.oks + o.falhas)
    return o.fim()


if __name__ == "__main__":
    raise SystemExit(main())
