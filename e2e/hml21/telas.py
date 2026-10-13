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


def main() -> int:
    ap = argparse.ArgumentParser(description="hml-21a — as telas: os prints a_* e o tempo antes × depois (a casca e o app do aluno)")
    ap.add_argument("--area", required=True, choices=("casca", "app"))
    ap.add_argument("--base", default="local", choices=("local", "staging"))
    ap.add_argument("--canal", default=None, help="msedge (o Edge — sempre nos E2E de tela)")
    ap.add_argument("--casos", default=",".join(CASOS))
    # o nome dos prints (<prefixo>_a_*.png; padrão = a base): o antes no staging usa antes_staging (decisão H)
    ap.add_argument("--prefixo", default=None)
    ap.add_argument("--seco", action="store_true")
    a = ap.parse_args()
    B.corte_vira_saida()
    casos = [c.strip() for c in a.casos.split(",") if c.strip()]
    if any(c not in CASOS for c in casos):
        raise SystemExit(f"caso desconhecido (os casos: {', '.join(CASOS)})")
    if a.seco:
        o = C.Saida(f"telas21_{a.area}_seco")
        seco(o)
        return o.fim()
    o = C.Saida(f"telas21_{a.area}_{a.base}")
    try:
        rodar(o, a.area, a.base, a.canal, casos, a.prefixo)
    except (Exception, SystemExit) as e:  # noqa: BLE001
        o.ok(False, f"parou no meio: {type(e).__name__}: {str(e)[:300]}")
    C.C2.registrar_rodada(o.oks, o.oks + o.falhas)
    return o.fim()


if __name__ == "__main__":
    raise SystemExit(main())
