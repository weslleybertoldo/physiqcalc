#!/usr/bin/env python3
"""Physiq hml-21a (H-43 · jeito 2, etapa 3, 12/10/2026) — as TELAS da casca e do app do aluno (Edge, celular 390 × 844): os prints a_* da
spec §5 e o tempo de cada tela antes × depois (contrato da 21a, decisões I e K), com a aluna de TESTE (w5p-aluna) e, no Meu plano, o aluno
sem profissional (w7b-sozinho) SE existir no staging (SQL só leitura, só contagem; senão a página da aluna — "com-profissional" —, anotado).
Só local e staging (a produção é o F8 da sessão principal: w07/smoke_prod.py telas + rede.py --base prod).
Prints (prints/hml21/a/<prefixo ou base>_<caso>.png + a cópia de 900 px para conferir — tela certa, sem login nem "carregando"):
  --area casca
  a_inicio        o Início (o sino com os não lidos da massa)
  a_sino_aberto   o sino aberto com os não lidos (abrir marca: 1 ação avisos_marcar_lidos depois; antes, o PATCH direto)
  a_sino_vazio    o sino aberto de novo, sem não lidos
  a_erro          o Início recarregado com a conta barrada (depois) / com as leituras diretas da área barradas (antes, o código antigo): o
                  sino sem aviso e o card da consulta com o aviso fixo — "só o texto muda"
  --area app
  a_perfil        o Perfil
  a_conta         a Conta
  a_conta_foto    a Conta depois de trocar a foto por uma de TESTE (um PNG gerado aqui, nunca foto real) PELA TELA: depois, o link que o
                  servidor assina (perfil_foto_preparar → PUT → perfil_foto_salvar; 0 upload direto; a anterior da pasta sai do bucket);
                  a foto de antes volta no fim (a cópia guardada; o caminho muda — anotado) ou sai, se ela não tinha
  a_agenda        a Agenda do aluno
  a_meu_plano     o Meu plano (o w7b-sozinho, se existir no staging; senão a aluna)
Tempo (decisão K, a regra do "pronto" da hml-20 — sem esqueleto/"carregando" e sem pedido pendente, quieto 3 s): cada tela aberta 3 vezes
pela navegação do app (aquecido), a mediana ≤ antes + 0,3 s — casca: o sino aberto (do clique até a lista na tela); app: o Início (o card
da próxima consulta com o dado), o Perfil, a Conta, a Agenda e o Meu plano. O antes = a última rodada do staging com o código antigo nesta
planilha (hml21/medicao/telas_hml21a.tsv); sem ela, o da spec (hml21/medicao/rede_por_tela.tsv). Piorou mais de 0,3 s → a linha "TEMPO
<tela> <antes> × <depois>" (o ## TEMPO do progresso; a decisão é da sessão principal).
A massa (casca) e a foto (app): o Estado (hml19/agente/e2e_estado.json) — desfeitas no fim (o finally; o --limpar do api.py depois de um
corte). No fim, o logout (scope=local) da sessão do TREINO que a troca do app abriu (decisão 23 da hml-20).
Antes de CADA execução: ~/projetos/physiqcalc-scratch/hml/hml19/ferramentas/pausa.sh "telas.py …" (e o /health, aqui dentro).
Uso: python3 e2e/hml21/telas.py --area casca|app --base local|staging --canal msedge [--casos prints,tempo] [--prefixo antes_staging] [--seco]
hml-21b (contrato da 21b, decisões I e K): --area agenda|alunos [--casos prints,tempo,fluxo] — conta por conta (e2e/hml21/painel21b.py), os
prints b_* em prints/hml21/b (a nutri: b_agenda_semana, b_agenda_mes, b_agenda_dialogos_novo/_regras/_travas, b_erro — a Agenda com a conta
barrada —, b_alunos, b_dashboard, b_busca; o dono: os _personal; a aluna: b_agenda_aluno), o tempo de cada tela (3 aberturas aquecidas, ≤ o
antes + 0,3 s; o antes = a rodada do staging com o código antigo em hml21/medicao/telas_hml21b.tsv, senão o da spec) e o FLUXO PELA TELA na
Agenda da nutri (a massa de TESTE com a marca: o calendário, a consulta sem aluno — criar/editar/excluir —, a trava, o bloqueio e a tag;
cada gravação = 1 ação da conta e 0 escrita direta; o calendário sai pela RPC nova) — a massa limpa no fim (o Estado, a chave hml21b).
"""
from __future__ import annotations

import argparse
import re
import sys
import time
from pathlib import Path
from urllib.parse import unquote, urlparse

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import _base as B  # noqa: E402
import painel21b as P21  # noqa: E402  (hml-21b: as contas, as telas e a massa da Agenda e dos Alunos)
import rede as R  # noqa: E402

C = B.C
PLANILHA = B.MEDICAO / "telas_hml21a.tsv"
CABECALHO = ["quando", "base", "commit", "fase", "area", "medida", "n", "valores_s", "mediana_s", "referencia_s", "ok"]
PRINTS = {"casca": ("a_inicio", "a_sino_aberto", "a_sino_vazio", "a_erro"),
          "app": ("a_perfil", "a_conta", "a_conta_foto", "a_agenda", "a_meu_plano")}
CASOS = ("prints", "tempo")
FOLGA_S = 0.3        # decisão K: cada tela ≤ antes + 0,3 s
ABERTURAS_TEMPO = 3
DADOS_CONSULTA = '[data-card-consulta="proxima"], [data-card-consulta="vazia"]'
# (medida, rota, marca, o valor: "marca" = o 1º instante do dado na tela; "pronto" = a regra do pronto)
TEMPOS = {
    "casca": (("sino", None, R.SINO_ABERTO, "marca"),),
    "app": (("inicio", "/", DADOS_CONSULTA, "marca"), ("perfil", "/perfil", "[data-aba-perfil]", "pronto"),
            ("conta", "/perfil/conta", "[data-pagina-conta]", "pronto"), ("agenda", "/perfil/agenda", "[data-pagina-agenda]", "pronto"),
            ("meu_plano", "/perfil/meu-plano", "[data-pagina-meu-plano]", "pronto")),
}
# o antes da spec (rede_por_tela.tsv, a w5p-aluna): a rota de cada medida (o Início e o sino não ficaram "prontos" lá: só a rodada antes)
ROTA_DA_SPEC = {"perfil": "/perfil", "conta": "/perfil/conta", "agenda": "/perfil/agenda"}
SELETORES = {
    "src/app-aluno/inicio/CardProximaConsulta.tsx": ['data-card-consulta="proxima"', 'data-card-consulta="vazia"', 'data-card-consulta={!online ? "sem-internet" : "erro"}'],
    "src/app-aluno/perfil/Conta.tsx": ["data-conta-foto-arquivo", "data-pagina-conta", "Foto trocada.", 'accept="image/jpeg,image/png,image/webp"'],
    "src/app-aluno/perfil/MeuPlano.tsx": ['data-pagina-meu-plano={m ? "app" : d?.com_profissional ? "com-profissional" : "sem-plano"}'],
    "src/ui/premium/Sino.tsx": ["data-sino-vazio", "data-sino-lista"],
}
# a_erro: depois, a função conta barrada; antes (o código antigo), as leituras DIRETAS da área no Início (o sino, o card e a sessão)
BARRA_DEPOIS = re.compile(r"https://api-principal\.physiqcalc\.com\.br/functions/v1/conta(\?|$)")
BARRA_ANTES = re.compile(r"https://api-principal\.physiqcalc\.com\.br/rest/v1/(avisos|rpc/(meu_perfil_aluno|minha_agenda|minha_situacao))(\?|$)")
PUT_DO_LINK = re.compile(r"^/storage/v1/object/upload/sign/(fotos-perfil(?:-staging)?)/([0-9a-f-]{36}/[A-Za-z0-9._-]{1,200})$")
UPLOAD_DIRETO = re.compile(r"^/storage/v1/object/(fotos-perfil(?:-staging)?)/([0-9a-f-]{36}/[A-Za-z0-9._-]{1,200})$")


def referencia(medida: str) -> float | None:
    """O ANTES desta medida: a última rodada do staging com o código antigo nesta planilha; sem ela, o número da spec."""
    if PLANILHA.exists():
        linhas = PLANILHA.read_text(encoding="utf-8").splitlines()
        cab = linhas[0].split("\t") if linhas else []
        antes = [dict(zip(cab, x.split("\t"))) for x in linhas[1:]]
        antes = [x for x in antes if x.get("fase") == "antes" and x.get("medida") == medida and x.get("mediana_s") not in ("", "None")]
        if antes:
            return float(antes[-1]["mediana_s"])
    nome = medida.split(":", 1)[-1]
    return B.antes_da_spec().get(ROTA_DA_SPEC.get(nome, "?"))


def anotar(base: str, commit: str, fase: str, area: str, medida: str, valores: list, mediana: float | None, ref: float | None, ok: object) -> None:
    B.anotar_planilha(PLANILHA, CABECALHO, [time.strftime("%Y-%m-%d %H:%M"), base, commit, fase, area, medida, len(valores),
                                            ",".join(str(v) for v in valores), mediana, ref, ok])


def abrir(t, pend, rota: str, marca: str, desvio: str) -> dict:
    """Sai para outra tela e volta (a navegação do app: a tela monta de novo) e espera ficar pronta."""
    if t.n("[data-sino-lista]"):
        t.pg.keyboard.press("Escape")
        t.pg.wait_for_timeout(400)
    B.navegar(t, desvio)
    t.pg.wait_for_timeout(600)
    B.navegar(t, rota)
    return B.esperar_pronto(t, pend, marca=marca)


def arquivos_de_teste(pedidos: list[dict]) -> tuple[list[tuple[str, str]], int]:
    """Os arquivos que a tela subiu: pelo link assinado (o PUT — depois) e o upload DIRETO no bucket (antes): ([(bucket, caminho)], diretos)."""
    achados: list[tuple[str, str]] = []
    diretos = 0
    for p in pedidos:
        caminho = unquote(urlparse(p.get("url", "")).path)
        m = PUT_DO_LINK.match(caminho) if p.get("metodo") == "PUT" else None
        d = UPLOAD_DIRETO.match(caminho) if p.get("metodo") in ("POST", "PUT") else None
        if m:
            achados.append((m.group(1), m.group(2)))
        elif d:
            achados.append((d.group(1), d.group(2)))
            diretos += 1
    return achados, diretos


# ───────────────────────── os prints ─────────────────────────
def prints_casca(o, t, pend, base: str, fase: str, prefixo: str | None) -> None:
    pr = lambda caso: B.print_reduzido(t.pg, prefixo or base, caso, o)  # noqa: E731
    ok = t.esperar(lambda: R.nao_lidos(t) > 0, 30)
    o.ok(ok, f"[{base}] a_inicio: o Início com o sino mostrando {R.nao_lidos(t)} não lido(s) (a massa)")
    pr("a_inicio")
    nl = R.nao_lidos(t)
    R.abrir_sino(t)
    r = B.esperar_pronto(t, pend, marca=R.SINO_ABERTO)
    cont = B.contar_area(r["pedidos"], "casca")
    o.ok(t.n("[data-sino-lista] [data-aviso]") >= nl > 0, f"[{base}] a_sino_aberto: a lista com os avisos ({t.n('[data-sino-lista] [data-aviso]')}; "
         f"{nl} não lido(s) ao abrir) — ações {cont['acoes'] or '—'}, diretas {cont['diretas'] or '—'}")
    pr("a_sino_aberto")
    R.abrir_sino(t)
    r = B.esperar_pronto(t, pend, marca=R.SINO_ABERTO)
    cont = B.contar_area(r["pedidos"], "casca")
    o.ok(R.nao_lidos(t) == 0 and not cont["acoes"] and not cont["gravacoes"],
         f"[{base}] a_sino_vazio: aberto de novo, 0 não lido e 0 gravação ({cont['gravacoes'] or '—'})")
    pr("a_sino_vazio")
    t.pg.keyboard.press("Escape")
    # a_erro: o Início RECARREGADO com a conta barrada (depois) ou com as leituras diretas da área barradas (antes)
    barra = BARRA_DEPOIS if fase == "depois" else BARRA_ANTES
    barrados: list[str] = []

    def barrar(route, req) -> None:
        barrados.append(req.method)
        route.abort()

    t.ctx.route(barra, barrar)
    try:
        t.ir("/")
        ok = t.esperar(lambda: t.n('[data-card-consulta="erro"]') > 0, 45)
        o.ok(ok and barrados and R.nao_lidos(t) == 0,
             f"[{base}] a_erro: {'a conta barrada' if fase == 'depois' else 'as leituras diretas da área barradas'} ({len(barrados)} pedido(s)) → o card "
             f"da consulta com o aviso fixo (\"{t.texto('[data-card-consulta]')[:60]}\") e o sino sem aviso")
        pr("a_erro")
    finally:
        t.ctx.unroute(barra)
    t.ir("/")
    t.esperar(lambda: t.n(DADOS_CONSULTA) > 0, 45)


def prints_app(o, t, pend, L, nav, base: str, fase: str, s: str, estado, prefixo: str | None) -> None:
    pr = lambda caso, pg=None: B.print_reduzido(pg or t.pg, prefixo or base, caso, o)  # noqa: E731
    r = abrir(t, pend, "/perfil", "[data-aba-perfil]", "/")
    o.ok(t.n("[data-aba-perfil]") > 0 and t.n("[data-perfil-agenda-valor]") > 0, f"[{base}] a_perfil: o Perfil (pronto em {r['t_pronto_s']} s)")
    pr("a_perfil")
    r = abrir(t, pend, "/perfil/conta", "[data-pagina-conta]", "/perfil")
    o.ok(t.n("[data-conta-foto-arquivo]") > 0 and t.n("[data-conta-nome]") > 0, f"[{base}] a_conta: a Conta com os dados (pronta em {r['t_pronto_s']} s)")
    pr("a_conta")
    # a_conta_foto: trocar a foto PELA TELA (o PNG de teste) — a aluna sem foto (no fim, perfil_foto_tirar) ou com uma da pasta dela (a
    # cópia volta); PULADO só com uma foto de fora da pasta (⚪5, corrigido 23:53)
    uid = L.uid(B.ALUNA)
    troca, motivo = B.foto_pode_trocar(s, uid)
    if not troca:
        o.linha(f"   PADRÃO (⚪5): [{base}] a_conta_foto PULADO — {motivo}: a aluna tem uma foto de fora da pasta dela (não voltaria exatamente "
                "como estava); a troca pelo link assinado fica no api.py e no Vitest")
    else:
        o.linha(f"   a foto da aluna: {motivo}")
        B.guardar_foto(o, estado, s, uid)
        antes = (estado.d.get("hml21_foto") or {}).get("url")
        t.zerar_pedidos()
        t.pg.set_input_files("[data-conta-foto-arquivo]", files=[{"name": "teste-hml21.png", "mimeType": "image/png", "buffer": B.png_sintetico(48)}])
        ok = t.esperar(lambda: "Foto trocada." in t.texto("body"), 45)
        B.esperar_pronto(t, pend, min_s=2.0)
        subidos, diretos = arquivos_de_teste(t.pedidos)
        for bucket, caminho in subidos:
            estado.objeto(bucket, caminho)  # o arquivo de teste: o limpar_foto confere que não fica no bucket
        agora = B.foto_da_conta(s, uid)
        cont = B.contar_area(t.pedidos, "app")
        if fase == "depois":
            o.ok(ok and diretos == 0 and len(subidos) == 1 and cont["acoes"] == {"perfil_foto_preparar": 1, "perfil_foto_salvar": 1}
                 and not cont["diretas"] and agora and agora != antes and B.caminho_da_url(agora, B.bucket_das_fotos(s), uid) == subidos[0][1],
                 f"[{base}] a_conta_foto: a foto de teste pela tela → o link que o servidor assinou (1 PUT, 0 upload direto; ações {cont['acoes']}) "
                 f"e a URL nova no perfil")
            anterior = B.caminho_da_url(antes, B.bucket_das_fotos(s), uid)
            if anterior:
                o.ok(B.objetos(B.bucket_das_fotos(s), [anterior]) == 0, f"[{base}] a_conta_foto: a foto anterior (da pasta da aluna) saiu do bucket (achado 2)")
        else:
            o.ok(ok and len(subidos) >= 1 and agora != antes,
                 f"[{base}] a_conta_foto (antes): a foto de teste pela tela — upload direto {diretos}, diretas {cont['diretas']}")
        pr("a_conta_foto")
    r = abrir(t, pend, "/perfil/agenda", "[data-pagina-agenda]", "/perfil")
    o.ok(t.n("[data-pagina-agenda]") > 0, f"[{base}] a_agenda: a Agenda do aluno (pronta em {r['t_pronto_s']} s)")
    pr("a_agenda")
    # a_meu_plano: o aluno sem profissional, se existir no staging (decisão I); senão a página da aluna
    n = B.sozinho_no_staging(s)
    if n:
        t2 = B.Tela(nav, B.BASES[base], f"hml21_{base}", "telas_sozinho", desktop=False)
        B.LegalDesligado().instalar(t2.ctx)
        try:
            t2.entrar(L, B.SOZINHO, "/perfil/meu-plano")
            ok = t2.esperar(lambda: t2.n("[data-pagina-meu-plano]") > 0 and not t2.n('[data-estado="carregando"]'), 60)
            estado_pg = (t2.attr("[data-pagina-meu-plano]", "data-pagina-meu-plano") or ["?"])[0]
            o.ok(ok and estado_pg in ("app", "sem-plano"), f"[{base}] a_meu_plano: o Meu plano do aluno SEM profissional (w7b-sozinho: {estado_pg})")
            pr("a_meu_plano", t2.pg)
        finally:
            B.sair_do_treino(o, t2.pg, f"[{base}] telas (w7b-sozinho)", t2, conta=B.SOZINHO)
            L.do_navegador(B.SOZINHO, t2.pg)
            t2.fim()
    else:
        o.linha("   PADRÃO: o w7b-sozinho não existe no staging (SQL só leitura, só contagem) — o a_meu_plano é a página da aluna "
                "(\"com-profissional\"); o Meu plano do aluno sem profissional fica no Vitest + api.py")
        r = abrir(t, pend, "/perfil/meu-plano", "[data-pagina-meu-plano]", "/perfil")
        o.ok(t.n("[data-pagina-meu-plano]") > 0, f"[{base}] a_meu_plano: o Meu plano da aluna ({(t.attr('[data-pagina-meu-plano]', 'data-pagina-meu-plano') or ['?'])[0]})")
        pr("a_meu_plano")


# ───────────────────────── o tempo ─────────────────────────
def caso_tempo(o, t, pend, area: str, base: str, commit: str, fase: str) -> None:
    for medida, rota, marca, valor in TEMPOS[area]:
        valores: list[float | None] = []
        for _ in range(ABERTURAS_TEMPO):
            if rota is None:  # o sino: do clique até a lista na tela
                if t.n("[data-sino]") == 0:
                    abrir(t, pend, "/", "[data-aba-inicio]", "/perfil")
                R.abrir_sino(t)
                r = B.esperar_pronto(t, pend, marca=marca)
                t.pg.keyboard.press("Escape")
            else:
                r = abrir(t, pend, rota, marca, "/perfil" if rota == "/" else "/")
            valores.append(r["t_marca_s"] if valor == "marca" else r["t_pronto_s"])
        med = B.mediana(valores)
        chave = f"tempo:{medida}"
        ref = referencia(chave)
        ok = None if fase == "antes" or ref is None or med is None else med <= ref + FOLGA_S
        anotar(base, commit, fase, area, chave, valores, med, ref, ok)
        if fase == "antes":
            o.linha(f"   [antes] {medida}: {valores} → mediana {med} s (a referência do depois)")
            continue
        if not o.ok(ok is not False, f"[depois] {medida}: mediana {med} s ≤ antes {ref} + {FOLGA_S} s ({valores})" + (" — sem o antes medido" if ref is None else "")):
            o.linha(f"TEMPO {medida} {ref} × {med} (valores {valores}) — o ## TEMPO no progresso; a decisão é da sessão principal")


def seco(o) -> None:
    faltam = [f"{arq}: {sel}" for arq, sels in SELETORES.items() for sel in sels if sel not in (B.REPO / arq).read_text(encoding="utf-8")]
    o.ok(not faltam, f"os {sum(len(v) for v in SELETORES.values())} seletores existem no código" + (f" — faltam: {faltam}" if faltam else ""))
    o.ok(set(PRINTS["casca"]) | set(PRINTS["app"]) == {"a_inicio", "a_sino_aberto", "a_sino_vazio", "a_perfil", "a_conta", "a_conta_foto", "a_agenda",
                                                        "a_meu_plano", "a_erro"}, "os 9 prints a_* da spec §5 (contrato F6)")
    o.ok(B.PRINTS == Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "hml21" / "a", f"a pasta dos prints: {B.PRINTS}")
    o.ok({m for m, *_ in TEMPOS["casca"]} | {m for m, *_ in TEMPOS["app"]} == {"inicio", "sino", "perfil", "conta", "agenda", "meu_plano"}
         and (FOLGA_S, ABERTURAS_TEMPO) == (0.3, 3), "o tempo das 6 telas da decisão K (o Início, o sino aberto, o Perfil, a Conta, a Agenda, o Meu plano): ≤ antes + 0,3 s, 3 aberturas")
    spec = B.antes_da_spec()
    o.ok(spec.get("/perfil") == 0.21 and spec.get("/perfil/conta") == 0.22 and spec.get("/perfil/agenda") == 0.43,
         f"o antes da spec (rede_por_tela.tsv): Perfil {spec.get('/perfil')} s, Conta {spec.get('/perfil/conta')} s, Agenda {spec.get('/perfil/agenda')} s")
    o.ok(B.mediana([1.0, None, 3.0, 2.0]) == 2.0 and B.mediana([None]) is None, "a mediana ignora a abertura que não ficou pronta")
    P = "https://api-principal.physiqcalc.com.br"
    o.ok(BARRA_DEPOIS.match(f"{P}/functions/v1/conta") and not BARRA_DEPOIS.match(f"{P}/functions/v1/contas")
         and not BARRA_DEPOIS.match(f"{P}/functions/v1/nutricao") and BARRA_ANTES.match(f"{P}/rest/v1/avisos?select=id")
         and BARRA_ANTES.match(f"{P}/rest/v1/rpc/minha_agenda") and not BARRA_ANTES.match(f"{P}/rest/v1/rpc/minha_dieta")
         and not BARRA_ANTES.match(f"{P}/functions/v1/conta"),
         "o a_erro barra SÓ a área: depois a função conta; antes as leituras diretas do Início (avisos, meu_perfil_aluno, minha_agenda, minha_situacao)")
    uid = "33333333-3333-4333-8333-333333333333"
    peds = [{"metodo": "PUT", "url": f"{P}/storage/v1/object/upload/sign/fotos-perfil-staging/{uid}/foto-1.png?token=x"},
            {"metodo": "POST", "url": f"{P}/storage/v1/object/fotos-perfil-staging/{uid}/foto-2.png"},
            {"metodo": "GET", "url": f"{P}/storage/v1/object/public/fotos-perfil-staging/{uid}/foto-3.png"},
            {"metodo": "POST", "url": f"{P}/storage/v1/object/sign/evolucao-staging/{uid}/x.png"}]
    o.ok(arquivos_de_teste(peds) == ([("fotos-perfil-staging", f"{uid}/foto-1.png"), ("fotos-perfil-staging", f"{uid}/foto-2.png")], 1),
         "a foto de teste: o arquivo que subiu pelo link assinado (depois) e o upload direto (antes) são achados e anotados para a limpeza")
    o.ok(R.NAO_LIDOS.search("Avisos (5 novos)").group(1) == "5", "os não lidos do sino pelo rótulo (o mesmo do rede.py)")


def rodar(o, area: str, base: str, canal: str | None, casos: list[str], prefixo: str | None = None) -> None:
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    if base == "prod":
        raise SystemExit("telas.py é local e staging (a produção é o F8 da sessão principal: w07/smoke_prod.py telas + rede.py --base prod)")
    s = B.usar_base(base)
    L = B.Sessoes(f"telas21 {area} {base}")
    commit = B.commit_medido(base)
    fase = B.fase_do_codigo(base, commit)
    estado = None
    try:
        B.exigir_saude(o, f"o telas.py --area {area} da hml-21a")
        if "prints" in casos:
            if area == "casca":
                B.guardar_sino(o, s)  # os não lidos de ANTES da etapa 2: voltam no api.py --devolver-sino
            estado = B.abrir_rodada(o, s)
            if area == "casca":
                B.criar_massa_avisos(o, estado, L, s, L.uid(B.ALUNA), estado.d["rodada"])
        with sync_playwright() as pw:
            nav = pw.chromium.launch(channel=canal, args=["--no-sandbox"]) if canal else pw.chromium.launch(args=["--no-sandbox"])
            t = B.Tela(nav, B.BASES[base], f"hml21_{base}", f"telas_{area}", desktop=False)
            B.LegalDesligado().instalar(t.ctx)
            pend = B.Pendentes(t.pg)
            try:
                o.linha(f"[{base}] {commit}: o {fase} · área {area}")
                t.entrar(L, B.ALUNA, "/")
                o.ok(t.esperar(lambda: t.n("[data-aba-inicio]") > 0, 60), f"[{base}] o app da aluna de teste abriu no Início", parar=True)
                if "prints" in casos:
                    if area == "casca":
                        prints_casca(o, t, pend, base, fase, prefixo)
                    else:
                        prints_app(o, t, pend, L, nav, base, fase, s, estado, prefixo)
                if "tempo" in casos:
                    caso_tempo(o, t, pend, area, base, commit, fase)
            finally:
                B.sair_do_treino(o, t.pg, f"[{base}] telas {area}", t)
                L.do_navegador(B.ALUNA, t.pg)
                t.fim()
                nav.close()
    finally:
        try:
            if estado is not None:
                B.fechar_rodada(o, estado, s, L)
        finally:
            L.fechar(o)


# ───────────────────────── hml-21b: as telas da Agenda e dos Alunos (--area agenda|alunos) ─────────────────────────
PLANILHA_21B = B.MEDICAO / "telas_hml21b.tsv"
CAB_21B = ["quando", "base", "commit", "fase", "area", "conta", "medida", "n", "valores_s", "mediana_s", "referencia_s", "ok"]
CASOS_21B = ("prints", "tempo", "fluxo")
# os prints b_* (contrato da 21b, F5): a nutri — a Agenda semana/mês, os 3 diálogos, os Alunos, o Dashboard, a Busca e o erro; o dono — a
# Agenda (com a equipe) e o Dashboard; a aluna — a Agenda dela
PRINTS_21B = {
    "agenda": {P21.NUTRI: ("b_agenda_semana", "b_agenda_mes", "b_agenda_dialogos_novo", "b_agenda_dialogos_regras", "b_agenda_dialogos_travas", "b_erro"),
               P21.PERSONAL: ("b_agenda_semana_personal",), P21.ALUNA: ("b_agenda_aluno",)},
    "alunos": {P21.NUTRI: ("b_alunos", "b_dashboard", "b_busca"), P21.PERSONAL: ("b_alunos_personal", "b_dashboard_personal")},
}
CASO_DA_TELA = {"agenda_semana": "b_agenda_semana", "agenda_mes": "b_agenda_mes", "agenda_novo": "b_agenda_dialogos_novo",
                "agenda_regras": "b_agenda_dialogos_regras", "agenda_travas": "b_agenda_dialogos_travas", "agenda_aluno": "b_agenda_aluno",
                "alunos": "b_alunos", "dashboard": "b_dashboard", "busca": "b_busca"}
# b_erro: depois, a função conta barrada; antes (o código antigo), as leituras DIRETAS da Agenda (os calendários e as consultas)
BARRA_ANTES_21B = re.compile(r"https://api-principal\.physiqcalc\.com\.br/rest/v1/(calendarios|agendamentos)(\?|$)")
ERRO_DA_AGENDA = '[data-pagina-agenda-painel] [data-estado="erro"]'
# o fluxo PELA TELA (spec §5: criar/editar/excluir a consulta e o calendário de teste pela função; e a tag, a trava e o bloqueio): cada
# gravação = 1 ação da conta e 0 escrita direta (depois); antes, a escrita direta (a referência)
ACOES_DO_FLUXO = ("calendario_criar", "agendamento_criar", "agendamento_editar", "trava_criar", "trava_excluir", "bloqueio_criar", "bloqueio_excluir",
                  "tag_criar", "tag_excluir", "agendamento_excluir", "calendario_excluir")


def referencia_21b(conta: str, medida: str) -> float | None:
    """O ANTES desta medida: a última rodada do staging com o código antigo nesta planilha (a mesma conta); sem ela, o da spec."""
    if PLANILHA_21B.exists():
        linhas = PLANILHA_21B.read_text(encoding="utf-8").splitlines()
        cab = linhas[0].split("\t") if linhas else []
        antes = [dict(zip(cab, x.split("\t"))) for x in linhas[1:]]
        antes = [x for x in antes if x.get("fase") == "antes" and x.get("conta") == conta and x.get("medida") == medida and x.get("mediana_s") not in ("", "None")]
        if antes:
            return float(antes[-1]["mediana_s"])
    return P21.antes_da_spec(conta).get(P21.ROTA_DA_SPEC.get(medida.split(":", 1)[-1], "?"))


def tempo_21b(o, t, pend, base: str, commit: str, fase: str, area: str, conta: str, telas: list[tuple]) -> None:
    """Decisão K: cada tela 3 vezes pela navegação do app (aquecido: a tela já foi aberta), a mediana do "pronto" ≤ o antes + 0,3 s."""
    for tela in telas:
        nome = tela[0]
        valores: list[float | None] = []
        for _ in range(ABERTURAS_TEMPO):
            if tela[1][0] == "rota":
                P21.fechar_janelas(t)
                B.navegar(t, P21.ENTRADA_APP if P21.eh_do_app(conta) else P21.ENTRADA_PAINEL)
                t.pg.wait_for_timeout(600)
            r = P21.abrir_tela(t, pend, tela)
            valores.append(r["t_pronto_s"])
        P21.fechar_janelas(t)
        med = B.mediana(valores)
        chave = f"tempo:{nome}"
        ref = referencia_21b(conta, chave)
        ok = None if fase == "antes" or ref is None or med is None else med <= ref + FOLGA_S
        B.anotar_planilha(PLANILHA_21B, CAB_21B, [time.strftime("%Y-%m-%d %H:%M"), base, commit, fase, area, conta, chave, len(valores),
                                                 ",".join(str(v) for v in valores), med, ref, ok])
        if fase == "antes":
            o.linha(f"   [antes] {conta} · {nome}: {valores} → mediana {med} s (a referência do depois)")
            continue
        if not o.ok(ok is not False, f"[depois] {conta} · {nome}: mediana {med} s ≤ antes {ref} + {FOLGA_S} s ({valores})" + (" — sem o antes medido" if ref is None else "")):
            o.linha(f"TEMPO {nome} {ref} × {med} (valores {valores}) — o ## TEMPO no progresso; a decisão é da sessão principal")


def print_erro_21b(o, t, pend, base: str, fase: str, prefixo: str | None) -> None:
    """b_erro: a Agenda RECARREGADA com a conta barrada (depois) / com as leituras diretas dos calendários e das consultas barradas (antes):
    o aviso de erro da Agenda ("Não deu para carregar a agenda"), nunca a agenda vazia."""
    barra = BARRA_DEPOIS if fase == "depois" else BARRA_ANTES_21B
    barrados: list[str] = []

    def barrar(route, req) -> None:
        barrados.append(req.method)
        route.abort()

    t.ctx.route(barra, barrar)
    try:
        t.ir("/painel/agenda?visao=semana")
        ok = t.esperar(lambda: t.n(ERRO_DA_AGENDA) > 0, 60)
        o.ok(ok and bool(barrados), f"[{base}] b_erro: {'a conta barrada' if fase == 'depois' else 'as leituras diretas da Agenda barradas'} "
             f"({len(barrados)} pedido(s)) → o aviso de erro da Agenda (\"{t.texto(ERRO_DA_AGENDA)[:60]}\")")
        B.print_reduzido(t.pg, prefixo or base, "b_erro", o)
    finally:
        t.ctx.unroute(barra)
    t.ir("/painel/agenda?visao=semana")
    t.esperar(lambda: t.n(P21.SEMANA[2]) > 0, 60)
    B.esperar_pronto(t, pend, max_s=40)


class Fluxo:
    """O fluxo PELA TELA na Agenda da nutri (a massa de TESTE com a marca; os ids no Estado na hora, achados por SQL só leitura): cada
    gravação conferida pela rede — depois, 1 ação da conta e 0 escrita direta; antes, a escrita direta (a referência)."""

    def __init__(self, o, t, pend, base: str, fase: str, s: str, estado, uid: str, rodada: str, prefixo: str | None) -> None:
        self.o, self.t, self.pend, self.base, self.fase, self.s, self.estado, self.uid = o, t, pend, base, fase, s, estado, uid
        self.marca, self.prefixo = P21.marca(rodada), prefixo

    def assentar(self, seletor: str, timeout: float = 15) -> bool:
        """Espera a janela aparecer E assentar: os diálogos zeram o formulário num useEffect ao abrir (depois da pintura — o
        AgendamentoDialog.tsx:124 faz o setConfirmarExclusao(false)); mexer antes disso corre contra o efeito (gente não clica tão rápido)."""
        ok = self.t.esperar(lambda: self.t.n(seletor) > 0, timeout)
        self.t.pg.wait_for_timeout(600)
        return ok

    def gravou(self, acao: str, fazer, pronto, timeout: float = 40) -> bool:
        t = self.t
        t.zerar_pedidos()
        fazer()
        ok = t.esperar(pronto, timeout)
        B.esperar_pronto(t, self.pend, min_s=2.0)
        cont = B.contar_area(t.pedidos, "agenda")
        escrita_direta = {k: v for k, v in cont["diretas"].items() if not k.endswith(":GET") and not k.startswith("rpc:agenda_horarios")}
        if self.fase == "depois":
            return self.o.ok(ok and cont["acoes"].get(acao) == 1 and set(cont["acoes"]) == {acao} and not cont["diretas"]
                             and cont["gravacoes"] == {f"fn:conta({acao})": 1},
                             f"[{self.base}] fluxo {acao} PELA TELA → 1 ação da conta, 0 chamada direta (ações {cont['acoes'] or '—'}; diretas "
                             f"{cont['diretas'] or '—'}; gravações {cont['gravacoes'] or '—'})")
        return self.o.ok(ok, f"[antes] fluxo {acao} PELA TELA → a escrita ia direto do navegador ({escrita_direta or cont['gravacoes'] or '—'})")

    def id_por_sql(self, tabela: str, coluna: str, valor: str, extra: str = "") -> str | None:
        dono = P21.COLUNA_DO_DONO[tabela]
        linhas = B.ler_principal(f"select id::text as id from {self.s}.{tabela} where {dono} = {C.txt(self.uid)} and {coluna} = {C.txt(valor)}{extra} "
                                 f"order by created_at desc limit 1")
        i = (linhas[0] if linhas else {}).get("id")
        if C.eh_uuid(i):
            P21.anotar_linha(self.estado, tabela, i, self.uid)
            return i
        return None

    def rodar(self) -> None:  # noqa: PLR0915
        t, mk = self.t, self.marca
        P21.anotar_dono(self.estado, self.uid)
        # 1. o calendário de teste (CalendarioDialog)
        def criar_cal() -> None:
            t.clicar("[data-btn-novo-calendario]")
            self.assentar('[data-modal-calendario="novo"]')
            t.pg.locator("[data-campo-nome-calendario]").fill(mk)
            t.clicar("[data-btn-salvar-calendario]")
        self.gravou("calendario_criar", criar_cal, lambda: t.n("[data-modal-calendario]") == 0)
        cal = self.id_por_sql("calendarios", "nome", mk, " and deleted_at is null")
        if not self.o.ok(bool(cal), f"[{self.base}] fluxo: o calendário de teste existe (SQL só leitura) — o resto do fluxo depende dele", parar=False):
            return
        t.esperar(lambda: t.n(f'[data-calendario="{cal}"]') > 0, 20)
        # 2. a consulta de teste sem aluno (AgendamentoDialog — "Sem aluno (compromisso avulso)"; o "avisar" só existe com aluno)
        dia = (time.time() + 30 * 86400)
        data = time.strftime("%Y-%m-%d", time.gmtime(dia - 3 * 3600))

        def criar_ag() -> None:
            t.clicar("[data-btn-novo-agendamento]")
            self.assentar('[data-modal-agendamento="novo"]')
            t.pg.locator("[data-campo-titulo]").fill(mk)
            t.pg.locator("[data-campo-data]").fill(data)
            t.pg.locator("[data-campo-calendario]").select_option(cal)
            t.pg.locator("[data-campo-hora]").fill("10:00")
            t.clicar("[data-btn-salvar-agendamento]")
        self.gravou("agendamento_criar", criar_ag, lambda: t.n("[data-modal-agendamento]") == 0)
        ag = self.id_por_sql("agendamentos", "titulo", mk, f" and calendario_id = {C.txt(cal)} and deleted_at is null")
        self.o.ok(bool(ag), f"[{self.base}] fluxo: a consulta de teste existe no calendário de teste (SQL só leitura)")
        if ag:
            B.navegar(t, f"/painel/agenda?visao=semana&data={data}")
            t.esperar(lambda: t.n(f'[data-evento="{ag}"]') > 0, 30)

            def editar_ag() -> None:
                t.clicar(f'[data-evento="{ag}"]')
                self.assentar('[data-modal-agendamento="editar"]')
                t.pg.locator("[data-campo-observacao]").fill(mk)
                t.clicar("[data-btn-salvar-agendamento]")
            self.gravou("agendamento_editar", editar_ag, lambda: t.n("[data-modal-agendamento]") == 0)
        # 3. a trava (recorrente, de madrugada) e o bloqueio (avulso, no dia da consulta de teste) — TravaDialog
        def criar_trava() -> None:
            t.clicar("[data-btn-travar]")
            self.assentar("[data-modal-trava]")
            t.clicar('[data-modo-trava="recorrente"]')
            t.pg.locator("[data-campo-trava-das]").fill("05:00")
            t.pg.locator("[data-campo-trava-as]").fill("05:30")
            t.pg.locator("[data-campo-trava-motivo]").fill(mk)
            t.clicar("[data-btn-salvar-trava]")
        self.gravou("trava_criar", criar_trava, lambda: t.n("[data-modal-trava]") == 0)
        trv = self.id_por_sql("agenda_travas", "motivo", mk)
        if trv:
            self.gravou("trava_excluir", lambda: t.clicar(f'[data-btn-liberar-trava="{trv}"]'), lambda: t.n(f'[data-trava-item="{trv}"]') == 0)

        def criar_bloqueio() -> None:
            t.clicar("[data-btn-travar]")
            self.assentar("[data-modal-trava]")
            t.clicar('[data-modo-trava="avulsa"]')
            t.pg.locator("[data-campo-trava-data]").fill(data)
            t.pg.locator("[data-campo-trava-das]").fill("05:00")
            t.pg.locator("[data-campo-trava-as]").fill("05:30")
            t.pg.locator("[data-campo-trava-motivo]").fill(mk)
            t.clicar("[data-btn-salvar-trava]")
        self.gravou("bloqueio_criar", criar_bloqueio, lambda: t.n("[data-modal-trava]") == 0)
        blq = self.id_por_sql("bloqueios_agenda", "motivo", mk)
        if blq:
            t.esperar(lambda: t.n(f'[data-bloqueio-item="{blq}"]') > 0, 20)
            self.gravou("bloqueio_excluir", lambda: t.clicar(f'[data-btn-excluir-bloqueio="{blq}"]'), lambda: t.n(f'[data-bloqueio-item="{blq}"]') == 0)
        # 4. a tag de teste (TagDialog) e a exclusão dela (a confirmação)
        def criar_tag() -> None:
            t.clicar("[data-btn-nova-tag]")
            self.assentar('[data-modal-tag="nova"]')
            t.pg.locator("[data-campo-nome-tag]").fill(mk[:40])
            t.clicar("[data-btn-salvar-tag]")
        self.gravou("tag_criar", criar_tag, lambda: t.n("[data-modal-tag]") == 0)
        tag = self.id_por_sql("agenda_tags", "nome", mk[:40], " and deleted_at is null")
        if tag:
            t.esperar(lambda: t.n(f'[data-tag-item="{tag}"]') > 0, 20)

            def excluir_tag() -> None:
                t.clicar(f'[data-btn-excluir-tag="{tag}"]')
                self.assentar("[data-btn-confirmar-excluir-tag]")
                t.clicar("[data-btn-confirmar-excluir-tag]")
            self.gravou("tag_excluir", excluir_tag, lambda: t.n(f'[data-tag-item="{tag}"]') == 0)
        # 5. a consulta à Lixeira (o diálogo dela) e o calendário (com a consulta de teste) pela RPC nova, atômica
        if ag:
            B.navegar(t, f"/painel/agenda?visao=semana&data={data}")
            t.esperar(lambda: t.n(f'[data-evento="{ag}"]') > 0, 30)

            def excluir_ag() -> None:
                t.clicar(f'[data-evento="{ag}"]')
                self.assentar("[data-btn-excluir-agendamento]")
                t.clicar("[data-btn-excluir-agendamento]")
                if not self.assentar("[data-btn-confirmar-excluir]", 5):
                    t.clicar("[data-btn-excluir-agendamento]")  # o efeito do diálogo zerou o confirmar: de novo, 1 vez
                    self.assentar("[data-btn-confirmar-excluir]")
                t.clicar("[data-btn-confirmar-excluir]")
            self.gravou("agendamento_excluir", excluir_ag, lambda: t.n(f'[data-evento="{ag}"]') == 0)

        def excluir_cal() -> None:
            t.clicar(f'[data-btn-editar-calendario="{cal}"]')
            self.assentar("[data-btn-excluir-calendario]")
            t.clicar("[data-btn-excluir-calendario]")
            if not self.assentar("[data-btn-confirmar-excluir-calendario]", 5):
                t.clicar("[data-btn-excluir-calendario]")  # idem: 1 vez
                self.assentar("[data-btn-confirmar-excluir-calendario]")
            t.clicar("[data-btn-confirmar-excluir-calendario]")
        self.gravou("calendario_excluir", excluir_cal, lambda: t.n(f'[data-calendario="{cal}"]') == 0)
        vivos = B.ler_principal(f"select (select count(*) from {self.s}.calendarios where id = {C.txt(cal)} and deleted_at is null)::int as cal, "
                                f"(select count(*) from {self.s}.agendamentos where calendario_id = {C.txt(cal)} and deleted_at is null)::int as ags")[0]
        self.o.ok(vivos == {"cal": 0, "ags": 0}, f"[{self.base}] fluxo: o calendário de teste e as consultas dele na Lixeira (SQL só leitura: {vivos}) — "
                  "saem de vez na limpeza")


def rodar_21b(o, area: str, base: str, canal: str | None, casos: list[str], prefixo: str | None = None) -> None:
    """As telas da 21b, conta por conta: os prints b_* (conferir cada um: tela certa, sem login nem "carregando", nomes de teste), o tempo
    (decisão K) e — na nutri, --area agenda — o fluxo PELA TELA (a massa de TESTE, limpa no fim: o Estado + a marca)."""
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    if base == "prod":
        raise SystemExit("telas.py é local e staging (a produção é o F8 da sessão principal: rede.py --base prod)")
    s = B.usar_base(base)
    B.usar_area(area)
    L = B.Sessoes(f"telas21 {area} {base}")
    commit = B.commit_medido(base)
    fase = P21.fase_do_codigo_21b(base, commit)
    estado = None
    try:
        B.exigir_saude(o, f"o telas.py --area {area} da hml-21b")
        o.linha(f"[{base}] {commit}: o {fase} · área {area}")
        with sync_playwright() as pw:
            nav = pw.chromium.launch(channel=canal, args=["--no-sandbox"]) if canal else pw.chromium.launch(args=["--no-sandbox"])
            try:
                for conta in P21.contas_da_area(area, base):
                    telas = P21.telas_que_abrem(o, s, base, area, conta)
                    if not telas:
                        continue
                    t, pend = P21.abrir_conta(nav, base, conta, f"telas_{area}_{conta}")
                    try:
                        P21.entrar(o, t, pend, L, base, conta)
                        if "prints" in casos:
                            for tela in telas:
                                nome = tela[0]
                                caso = CASO_DA_TELA[nome] + ("_personal" if conta == P21.PERSONAL else "")
                                r = P21.abrir_tela(t, pend, tela)
                                o.ok(t.n(tela[2]) > 0 and r["t_pronto_s"] is not None,
                                     f"[{base}] {conta} · {caso}: a tela pronta em {r['t_pronto_s']} s ({tela[2]})")
                                B.print_reduzido(t.pg, prefixo or base, caso, o)
                            if area == "agenda" and conta == P21.NUTRI:
                                print_erro_21b(o, t, pend, base, fase, prefixo)
                        if "tempo" in casos:
                            tempo_21b(o, t, pend, base, commit, fase, area, conta, telas)
                        if "fluxo" in casos and area == "agenda" and conta == P21.NUTRI and any(x[0] == "agenda_semana" for x in telas):
                            if estado is None:
                                estado = P21.abrir_rodada_21b(o, s)
                            P21.fechar_janelas(t)
                            B.navegar(t, "/painel/agenda?visao=semana")
                            t.esperar(lambda: t.n(P21.SEMANA[2]) > 0, 60)
                            B.esperar_pronto(t, pend, max_s=40)
                            Fluxo(o, t, pend, base, fase, s, estado, L.uid(conta), estado.d["rodada"], prefixo).rodar()
                    finally:
                        P21.sair_da_conta(o, t, L, base, conta, f"telas {area}")
            finally:
                nav.close()
    finally:
        try:
            if estado is not None:
                P21.fechar_rodada_21b(o, estado, s)
        finally:
            L.fechar(o)


def seco_21b(o, area: str) -> None:
    """O --seco da 21b: os seletores das telas e do fluxo, os prints b_* (na pasta da 21b), as telas do tempo (decisão K), o antes da spec e
    a barra do b_erro."""
    B.usar_area(area)
    faltam = [f"{arq}: {sel}" for arq, sels in P21.SELETORES.items() for sel in sels if sel not in (B.REPO / arq).read_text(encoding="utf-8")]
    fluxo = {
        "src/painel/agenda/PainelAgenda.tsx": ["data-btn-novo-calendario", "data-calendario={c.id}", "data-btn-editar-calendario={c.id}", "data-btn-nova-tag",
                                               "data-tag-item={t.id}", "data-btn-excluir-tag={t.id}", "data-trava-item={t.id}", "data-btn-liberar-trava={t.id}",
                                               "data-bloqueio-item={b.id}", "data-btn-excluir-bloqueio={b.id}"],
        "src/painel/agenda/CalendarioDialog.tsx": ['data-modal-calendario={editando ? "editar" : "novo"}', "data-campo-nome-calendario", "data-btn-salvar-calendario",
                                                   "data-btn-excluir-calendario", "data-btn-confirmar-excluir-calendario"],
        "src/painel/agenda/AgendamentoDialog.tsx": ['data-modal-agendamento={editando ? "editar" : "novo"}', "data-campo-titulo", "data-campo-data",
                                                    "data-campo-calendario", "data-campo-hora", "data-campo-observacao", "data-btn-excluir-agendamento",
                                                    "data-btn-confirmar-excluir", "Sem aluno (compromisso avulso)"],
        "src/painel/agenda/TravaDialog.tsx": ["data-modo-trava={m.valor}", "data-campo-trava-das", "data-campo-trava-as", "data-campo-trava-motivo", "data-campo-trava-data"],
        "src/painel/agenda/TagDialog.tsx": ['data-modal-tag={editando ? "editar" : "nova"}', "data-campo-nome-tag"],
        "src/painel/agenda/ChipEvento.tsx": ["data-evento={ev.id}"],
        "src/painel/paginas/Agenda.tsx": ["data-btn-confirmar-excluir-tag", 'titulo="Não deu para carregar a agenda"'],
        "src/ui/premium/Estados.tsx": ["data-estado={estado}", 'estado="erro"'],
    }
    faltam += [f"{arq}: {sel}" for arq, sels in fluxo.items() for sel in sels if sel not in (B.REPO / arq).read_text(encoding="utf-8")]
    o.ok(not faltam, f"os seletores das telas e do fluxo pela tela existem no código" + (f" — faltam: {faltam}" if faltam else ""))
    o.ok(B.PRINTS == Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "hml21" / "b" and B.AREA_ESTADO == "hml21b",
         f"a 21b grava os prints em prints/hml21/b e a rodada na área hml21b ({B.PRINTS})")
    casos = {c for d in PRINTS_21B.values() for v in d.values() for c in v}
    o.ok({"b_agenda_semana", "b_agenda_mes", "b_agenda_dialogos_novo", "b_agenda_dialogos_regras", "b_agenda_dialogos_travas", "b_alunos", "b_dashboard",
          "b_busca", "b_agenda_aluno", "b_erro"} <= casos and set(CASO_DA_TELA) == {x[0] for x in P21.TELAS_DA_AGENDA + P21.TELAS_DOS_ALUNOS + (P21.AGENDA_ALUNO,)},
         "os prints b_* do contrato (a Agenda semana/mês, os 3 diálogos, os Alunos, o Dashboard, a Busca, a Agenda do aluno e o erro) + os do dono")
    spec_n, spec_p, spec_a = P21.antes_da_spec(P21.NUTRI), P21.antes_da_spec(P21.PERSONAL), P21.antes_da_spec(P21.ALUNA)
    o.ok(spec_n.get("/painel/agenda") == 0.48 and spec_p.get("/painel/agenda") == 0.38 and spec_n.get("/painel/alunos") == 0.16
         and spec_a.get("/perfil/agenda") == 0.43 and spec_n.get("/painel") == 0.76,
         f"o antes da spec (rede_por_tela.tsv, aquecido): a Agenda {spec_n.get('/painel/agenda')}/{spec_p.get('/painel/agenda')} s, os Alunos "
         f"{spec_n.get('/painel/alunos')} s, o Dashboard {spec_n.get('/painel')} s, a Agenda do aluno {spec_a.get('/perfil/agenda')} s")
    P = "https://api-principal.physiqcalc.com.br"
    o.ok(BARRA_ANTES_21B.match(f"{P}/rest/v1/calendarios?select=*") and BARRA_ANTES_21B.match(f"{P}/rest/v1/agendamentos?select=*")
         and not BARRA_ANTES_21B.match(f"{P}/rest/v1/calendarios_x") and not BARRA_ANTES_21B.match(f"{P}/functions/v1/conta")
         and BARRA_DEPOIS.match(f"{P}/functions/v1/conta"), "o b_erro barra SÓ a área: depois a função conta; antes as leituras diretas da Agenda")
    do_servidor = B.regras_conta()["agenda"]
    o.ok(set(ACOES_DO_FLUXO) <= set(do_servidor) and len(set(ACOES_DO_FLUXO)) == 11
         and B.B17.funcao_grava("conta", "ler", '{"acao": "ler", "itens": []}') is False,
         f"o fluxo pela tela cobre {len(ACOES_DO_FLUXO)} gravações da Agenda do painel (criar/editar/excluir a consulta e o calendário; a trava, o "
         "bloqueio e a tag) — todas ações da conta no servidor; cada uma = 1 ação e 0 escrita direta (depois)")
    o.ok(CASOS_21B == ("prints", "tempo", "fluxo") and (FOLGA_S, ABERTURAS_TEMPO) == (0.3, 3), "o tempo: 3 aberturas, ≤ antes + 0,3 s (decisão K)")


def main() -> int:
    ap = argparse.ArgumentParser(description="hml-21a/21b — as telas: os prints a_*/b_* e o tempo antes × depois (a casca e o app do aluno; a Agenda e os Alunos)")
    ap.add_argument("--area", required=True, choices=("casca", "app", "agenda", "alunos"))
    ap.add_argument("--base", default="local", choices=("local", "staging"))
    ap.add_argument("--canal", default=None, help="msedge (o Edge — sempre nos E2E de tela)")
    ap.add_argument("--casos", default=None, help="prints,tempo (21a) · prints,tempo,fluxo (21b)")
    # o nome dos prints (<prefixo>_a_*.png; padrão = a base): o antes no staging usa antes_staging (decisão H)
    ap.add_argument("--prefixo", default=None)
    ap.add_argument("--seco", action="store_true")
    a = ap.parse_args()
    B.corte_vira_saida()
    B.usar_area(a.area)
    da_21b = a.area in B.AREAS_DA_21B
    validos = CASOS_21B if da_21b else CASOS
    casos = [c.strip() for c in (a.casos or ",".join(validos)).split(",") if c.strip()]
    if any(c not in validos for c in casos):
        raise SystemExit(f"caso desconhecido (os casos: {', '.join(validos)})")
    if a.seco:
        o = C.Saida(f"telas21_{a.area}_seco")
        if da_21b:
            seco_21b(o, a.area)
        else:
            seco(o)
        return o.fim()
    o = C.Saida(f"telas21_{a.area}_{a.base}")
    try:
        if da_21b:
            rodar_21b(o, a.area, a.base, a.canal, casos, a.prefixo)
        else:
            rodar(o, a.area, a.base, a.canal, casos, a.prefixo)
    except (Exception, SystemExit) as e:  # noqa: BLE001
        o.ok(False, f"parou no meio: {type(e).__name__}: {str(e)[:300]}")
    C.C2.registrar_rodada(o.oks, o.oks + o.falhas)
    return o.fim()


if __name__ == "__main__":
    raise SystemExit(main())
