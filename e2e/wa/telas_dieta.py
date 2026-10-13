#!/usr/bin/env python3
"""Physiq W-A P5 — E2E de TELA da dieta liberada no app do aluno (Edge; celular 390 × 844). Spec W-A §4.3, §4.4, §6 "P5", §7.
Contas de TESTE (hml-17): w5p-aluna (a aluna dos 2 profissionais: a matrícula A com o plano de 22 itens), w5p-nutri (libera e trava a Dieta da
A pela função acessos — o interruptor da P4), w13-dono (a 2ª matrícula da aluna na conta dele, com a nutricionista = ele SÓ no caso D10, pela
Massa do _base.py) e w7b-sozinho (o app sem profissional com Alimentação: os pratos prontos — só lê). Casos (na ordem; cada um depende do anterior):
  D0  o build é o de STAGING (a faixa "Ambiente de teste" na /entrar; --loja: a marca da loja no index.html) — senão nada roda com conta
  D1  d_travada        a Dieta "Só ver" (o padrão): a tela de hoje — nenhum botão da dieta liberada, a folha sem "Tirar hoje"; ao abrir, 0
                       gravação e ≥ 1 `ler` q=dia (data-dieta-dia-livre = travada)
  D2  d_liberada       a nutri libera (acessos › salvar dieta=mexer): "Nova refeição" e "Meus alimentos e receitas" aparecem
  D3  d_tirar          a folha da 1ª refeição com alimento: "Tirar hoje" no último item → riscado + "Voltar"; no banco o "tirado" de hoje;
                       "Voltar" → desfeito; tira de novo (fica para o anel); sem internet (o navegador offline) → os botões desligados
  D4  d_adicionar      "Adicionar alimento" → a busca "arroz" → um da TACO → 150 g → "Pôr no dia"; no banco o "adicionado" com as gramas
  D5  d_receita        "Meus alimentos e receitas": o alimento "<marca> pão" (por 100 g, porção 50 g) e a receita "<marca> vitamina" (o pão +
                       um arroz da TACO, 2 porções); no banco: dela, com os ingredientes
  D6  d_extra          "Nova refeição" "<marca> lanche" ("Já comi" ligado) → abrir → "Adicionar alimento" → a receita (1 porção) e o pão dela
                       em PORÇÕES (2 × 50 g); no banco a extra da matrícula A com a receita e o pão em 100 g; os 2 botões do fim da folha
                       ("Mudar nome e horário", "Apagar refeição") inteiros na largura do celular
  D7  d_totais         a linha da 1ª refeição = a conta do banco (os itens do plano sem o tirado + o que ela pôs); ✓ nela → o anel sobe o mesmo
                       tanto (o que ela comeu); no banco a refeição feita hoje; desmarca no fim
  D8  d_rotinas        a seção "Rotinas de hoje" no fim da Dieta com a "<marca> Creatina" (pela função, como a aluna) · d_rotinas_pratos: nos
                       pratos prontos (w7b-sozinho), só lendo
  D9  d_voltou_travada com a folha de outra refeição aberta, a nutri trava (dieta=ver) → "Tirar hoje" → o toast "A sua dieta voltou a ser só para
                       ver." e a tela volta ao "só ver"; no banco nada novo
  D10 2 matrículas     a 2ª matrícula (conta do w13-dono, a nutri = ele) liberada pelo dono e a A travada → a tela segue travada (o plano ativo é o
                       da A); a A liberada → liberada
  D11 mudar e apagar   "Meus alimentos e receitas": o pão 280 → 300 kcal (no banco); apagar a receita e o pão com a confirmação do app (no banco a
                       lixeira; o dia segue com o retrato)
  --loja: D0 + D1 + D2 + D3 + D8 (só a aluna) — os prints com o prefixo loja_.
  --velho: o "APK velho" — o build de ANTES da P5 (a main sem ela, servido na 5173 pelo velho.sh) com a Dieta LIBERADA: V1 d_apk_velho a tela de
           hoje (nada da P5, nenhum `ler` q=dia) e o ✓ do plano marca e desmarca como antes.
A rodada vai para o estado (~/projetos/physiqcalc-scratch/w-a/p5-estado.json) ANTES de qualquer escrita: a foto da matrícula A (os acessos, os ✓ de
hoje); a massa leva a marca "WA E2E P5 <hhmmss>". No fim (e no --limpar): os acessos da A voltam à foto, os ✓ de hoje também, o que ela pôs/tirou no
dia desde o começo, as extras, os alimentos, as receitas e as rotinas com a marca, o histórico e os avisos da rodada saem, e a Massa (a 2ª
matrícula) é desfeita — as sobras = 0.
Bases: --base local (o vite preview do dist/ de STAGING em http://localhost:5173 — a 8080 é da LINUX 1) · staging (https://physiqcalc-staging.vercel.app)
· prod (https://physiqcalc.com.br, SÓ LEITURA: a Guarda da hml-17 no navegador; a conta de teste da produção aluno-calc é só de Treino — P1 o Início e
a Dieta (se a conta a tiver) abrem sem gravar; print prod_d_inicio; sem massa). Prints: ~/projetos/physiqcalc-scratch/prints/w-a/p5/<base>[-loja|-velho]/.
Saída: ~/projetos/physiqcalc-scratch/w-a/p5/telas_dieta_<base>.txt (só contagens, kcal das contas de TESTE, status e códigos). Logout local das
sessões do teste (nunca o global).
--seco: sem rede e sem navegador — cada seletor e texto que o E2E usa existe no código.
Uso: python3 e2e/wa/telas_dieta.py --base local|staging|prod [--loja | --velho] [--canal msedge] | --limpar | --seco
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
import time
from pathlib import Path
from zoneinfo import ZoneInfo

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import _base as B  # noqa: E402

C, B5 = B.C, B.B5
S = "staging"
SP = ZoneInfo("America/Sao_Paulo")
BASES = {"local": "http://localhost:5173", "staging": "https://physiqcalc-staging.vercel.app", "prod": "https://physiqcalc.com.br"}
ORIGEM = "https://physiqcalc-staging.vercel.app"
ESTADO = B.SCRATCH / "w-a" / "p5-estado.json"
C.SAIDA = B.SCRATCH / "w-a" / "p5"
TITULOS_WA = ("Sua dieta foi liberada: agora você pode pôr e tirar alimentos no seu dia", "Seu profissional criou uma rotina para você")
TRAVOU = "A sua dieta voltou a ser só para ver."

# --seco: o arquivo → o que tem de estar nele (seletores e textos que o E2E usa)
NO_CODIGO = {
    "src/app-aluno/abas/Dieta.tsx": ["data-dieta-dia-livre={livre.estado}", "data-dieta-rotinas", "<RotinasDeHoje origem=\"dieta\" />",
                                     "conteudoDoDia=", "totaisDoDia="],
    "src/dieta-livre/useDiaLivre.ts": ['"sem" | "lendo" | "travada" | "liberada"'],
    "src/dieta-livre/ui/DiaLivre.tsx": ['data-dieta-livre="liberada"', "data-dieta-nova-refeicao", "data-dieta-meus", "data-extra={e.extra.id}"],
    "src/dieta-livre/ui/ItensDoDia.tsx": ["data-item-tirar={item.id}", "data-item-voltar={item.id}", 'data-item-tirado={tirado ? "1" : "0"}',
                                          "data-item-posto={i.id}", "data-item-posto-tirar={i.id}", "data-dieta-adicionar"],
    "src/dieta-livre/ui/BuscaDeAlimentos.tsx": ["data-busca-termo", "data-busca-item={i.id}", "data-busca-tipo={i.tipo}", "data-busca-alimentos="],
    "src/dieta-livre/ui/FolhaAdicionar.tsx": ["data-folha-adicionar=", "data-quantidade", "data-escolha-por", "data-quantidade-macros="],
    "src/dieta-livre/ui/FolhaExtra.tsx": ["data-folha-extra=", "data-extra-nome", "data-extra-salvar", "data-extra-feita=", "data-extra-mudar", "data-extra-apagar"],
    "src/dieta-livre/ui/FolhaMeusAlimentos.tsx": ["data-folha-meus={vista.tipo}", "data-meus-estado=\"lista\"", "data-meus-novo-alimento", "data-alimento-nome",
                                                  "data-alimento-porcao", "data-alimento-macro={m.chave}", "data-alimento-salvar", "data-meus-nova-receita",
                                                  "data-receita-nome", "data-receita-porcoes", "data-receita-adicionar", "data-receita-item-qtd={i.chave}",
                                                  "data-receita-salvar", "data-meu-alimento={a.id}", "data-minha-receita={r.id}", "data-alimento-apagar",
                                                  "data-receita-apagar"],
    "src/dieta-livre/textos.ts": ['"Tirar hoje"', '"Nova refeição"', '"Meus alimentos e receitas"', '"Pôr no dia"'],
    "src/aluno-dia/api.ts": ['dieta_travada: "A sua dieta voltou a ser só para ver."'],
    "src/rotinas/ui/RotinasDeHoje.tsx": ['"data-card-rotinas-dieta"'],
    "src/nutricao/app/ui/LinhaRefeicao.tsx": ["data-refeicao-abrir", 'data-refeicao-marcar="feito"', 'data-refeicao-marcar="desmarcar"', "data-refeicao-kcal"],
    "src/nutricao/app/ui/CartaoPlano.tsx": ["data-kcal-marcadas="],
}


class Rodada:
    def __init__(self, o, base: str, prefixo: str) -> None:
        self.o, self.base, self.prefixo = o, base, prefixo
        self.L = B.Logins()
        self.pasta = B.pasta_prints("p5") / prefixo
        self.provas: list[str] = []
        self.e: dict = {}
        self.ids: dict[str, str] = {}
        self.pre = ""

    def tela(self, nav, nome: str, desktop: bool = False, guarda=None) -> B.Tela:
        return B.Tela(nav, self.base, "p5", nome, desktop=desktop, guarda=guarda)

    def print(self, t: B.Tela, caso: str) -> None:
        caminho = t.print(self.pasta, f"{self.pre}{caso}")
        self.provas.append(caminho)
        self.o.linha(f"   print: {caminho}")

    def guardar(self) -> None:
        ESTADO.parent.mkdir(parents=True, exist_ok=True)
        ESTADO.write_text(json.dumps(self.e, ensure_ascii=False, indent=1), encoding="utf-8")


# ───────────────────────── o banco (SÓ LEITURA, menos a limpeza) e as funções ─────────────────────────
def funcao(nome: str, token: str, corpo: dict) -> tuple[int, dict]:
    cab = {"apikey": B5.anon(B.PRINCIPAL_REF), "Authorization": f"Bearer {token}", "x-schema": S, "Origin": ORIGEM}
    st, r, _h = B5.http("POST", f"{B.H.API_P}/functions/v1/{nome}", corpo, cab, timeout=60)
    return st, (r if isinstance(r, dict) else {})


def foto() -> dict:
    """SÓ LEITURA: a matrícula A, o plano ativo de hoje (as refeições com alimento, na ordem da tela, com os itens), os acessos e os ✓ de hoje."""
    E = B.CONTAS
    u = lambda k: f"(select id from auth.users where lower(email) = {B.txt(E[k])})"  # noqa: E731
    r = B.ler(f"""
      with a as (select p.id from {S}.pacientes p join {S}.contas c on c.id = p.conta_id
                  where p.user_id = {u('w5p-aluna')} and p.deleted_at is null and c.origem <> 'app' and p.nutricionista_id = {u('w5p-nutri')}
                    and p.personal_id = {u('w5p-personal')} order by p.created_at limit 1),
           hoje as (select (now() at time zone 'America/Sao_Paulo')::date as d)
      select (select id::text from a) as pac_a, {u('w5p-aluna')}::text as aluna, {u('w5p-nutri')}::text as nutri, {u('w13-dono')}::text as w13,
             (select d::text from hoje) as hoje, {S}.wa_plano_ativo({u('w5p-aluna')})::text as plano,
             (select coalesce(jsonb_agg(jsonb_build_object('chave', x.chave, 'nivel', x.nivel, 'alterado_por', x.alterado_por,
                                                           'alterado_em', x.alterado_em) order by x.chave), '[]'::jsonb)
                from {S}.aluno_acessos x, a where x.paciente_id = a.id) as acessos_a,
             (select coalesce(jsonb_agg(rc.refeicao_id::text), '[]'::jsonb) from {S}.refeicoes_concluidas rc, a, hoje
               where rc.paciente_id = a.id and rc.data = hoje.d) as concluidas_a""")[0]
    refs = B.ler(f"""select r.id::text as id, (select coalesce(json_agg(i.id::text order by i.ordem, i.created_at), '[]'::json)
                                                 from {S}.itens_refeicao i where i.refeicao_id = r.id) as itens
                       from {S}.refeicoes r
                      where r.plano_id = {B.txt(r['plano'])}
                        and (cardinality(r.dias_semana) = 0 or extract(isodow from {B.txt(r['hoje'])}::date)::smallint = any(r.dias_semana))
                      order by r.ordem, to_char(r.horario, 'HH24:MI'), r.nome""") if r["plano"] else []
    com = [x for x in refs if x["itens"]]
    if not (r["pac_a"] and len(com) >= 2):
        raise SystemExit("massa de TESTE incompleta no staging (a matrícula A da w5p-aluna com 2 refeições de hoje com alimento) — nada foi gravado")
    if r["concluidas_a"]:
        raise SystemExit(f"a w5p-aluna já tem {len(r['concluidas_a'])} refeição(ões) feita(s) hoje: o D7 precisa da 1ª pendente — conferir no quadro (nada foi gravado)")
    sobra = B.Massa().sobras()
    if any(int(v) for v in sobra.values()):
        raise SystemExit(f"há massa da W-A de uma rodada anterior no staging ({sobra}): rode o --limpar da parte que deixou — nada foi gravado")
    return {**r, "r1": com[0]["id"], "item1": com[0]["itens"][-1], "r2": com[1]["id"], "item2": com[1]["itens"][0]}


def nivel_dieta(e: dict, pac: str | None = None) -> str:
    r = B.ler(f"select nivel from {S}.aluno_acessos where paciente_id = {B.txt(pac or e['pac_a'])} and chave = 'dieta'")
    return r[0]["nivel"] if r else "ver"


def mudar_dieta(R: Rodada, conta: str, pac: str, valor: str) -> bool:
    st, r = funcao("acessos", R.L.token(conta), {"acao": "salvar", "aluno": pac, "chave": "dieta", "valor": valor})
    return st == 200 and (r.get("linhas") or {}).get("dieta") == valor


def itens_do_dia(e: dict) -> list[dict]:
    return B.ler(f"""select i.id::text as id, i.tipo, i.refeicao_id::text as refeicao_id, i.extra_id::text as extra_id,
                            i.item_refeicao_id::text as item, i.alimento_id::text as alimento_id, i.aluno_receita_id::text as receita_id,
                            i.quantidade_g::float as gramas, i.porcoes::float as porcoes, i.deleted_at is not null as desfeito, i.paciente_id::text as pac
                       from {S}.aluno_dia_itens i
                      where i.dono_user_id = {B.txt(e['aluna'])} and i.dia = {B.txt(e['hoje'])}::date and i.criado_em >= {B.txt(e['inicio'])}
                      order by i.criado_em""")


def da_marca(e: dict, tabela: str) -> list[dict]:
    return B.ler(f"""select x.id::text as id, x.nome from {S}.{tabela} x where x.dono_user_id = {B.txt(e['aluna'])} and x.nome like {B.txt(e['marca'] + '%')}
                      order by x.criado_em""")


def kcal_do_dia(e: dict, refeicao: str) -> float:
    """A conta do BANCO da refeição no dia: os itens do plano que ela não tirou (as gramas pela medida caseira, como o app) + o que ela pôs."""
    r = B.ler(f"""
      with plano as (
        select i.id, round(coalesce((select round(i.quantidade_medida * m.gramas, 2) from {S}.medidas_caseiras m
                                      where m.id = i.medida_caseira_id and m.alimento_id = i.alimento_id and i.quantidade_medida > 0),
                                    i.quantidade_g) * coalesce(a.energia_kcal, 0) / 100, 2) as kcal
          from {S}.itens_refeicao i join {S}.alimentos a on a.id = i.alimento_id where i.refeicao_id = {B.txt(refeicao)}),
      dia as (select * from {S}.aluno_dia_itens x where x.dono_user_id = {B.txt(e['aluna'])} and x.dia = {B.txt(e['hoje'])}::date
                and x.deleted_at is null and x.refeicao_id = {B.txt(refeicao)})
      select ((select coalesce(sum(kcal), 0) from plano where id not in (select item_refeicao_id from dia where tipo = 'tirado' and item_refeicao_id is not null))
             + (select coalesce(sum(energia_kcal), 0) from dia where tipo = 'adicionado'))::float as kcal""")
    return float(r[0]["kcal"] or 0)


def concluida_hoje(e: dict, refeicao: str) -> bool:
    return bool(B.ler(f"""select count(*) as n from {S}.refeicoes_concluidas where paciente_id = {B.txt(e['pac_a'])} and refeicao_id = {B.txt(refeicao)}
                          and data = {B.txt(e['hoje'])}::date""")[0]["n"])


def _acessos_sql(e: dict) -> list[str]:
    pa = B.txt(e["pac_a"])
    return [f"delete from {S}.aluno_acessos where paciente_id = {pa}",
            *[f"""insert into {S}.aluno_acessos (paciente_id, chave, nivel, alterado_por, alterado_em)
                  values ({pa}, {B.txt(y['chave'])}, {B.txt(y['nivel'])}, {B.txt(y.get('alterado_por'))}, {B.txt(y.get('alterado_em'))})"""
              for y in e.get("acessos_a") or []]]


def conferir_sobras(e: dict) -> dict:
    """SÓ LEITURA: o que a rodada deixou (tem de dar tudo 0)."""
    al, ini, marca = B.txt(e["aluna"]), B.txt(e["inicio"]), B.txt(e["marca"] + "%")
    titulos = ", ".join(B.txt(t) for t in TITULOS_WA)
    r = B.ler(f"""select (select count(*) from {S}.aluno_dia_itens where dono_user_id = {al} and criado_em >= {ini}) as itens_do_dia,
                         (select count(*) from {S}.aluno_dia_refeicoes where dono_user_id = {al} and criado_em >= {ini}) as extras,
                         (select count(*) from {S}.aluno_alimentos where dono_user_id = {al} and nome like {marca}) as alimentos,
                         (select count(*) from {S}.aluno_receitas where dono_user_id = {al} and nome like {marca}) as receitas,
                         (select count(*) from {S}.rotinas where dono_user_id = {al} and nome like {marca}) as rotinas,
                         (select count(*) from {S}.aluno_acessos_log where paciente_id = {B.txt(e['pac_a'])} and em >= {ini}) as historico,
                         (select count(*) from {S}.avisos where destino_user_id = {al} and tipo = 'geral' and titulo in ({titulos})
                            and criado_em >= {ini}) as avisos,
                         (select count(*) from {S}.refeicoes_concluidas where paciente_id = {B.txt(e['pac_a'])} and data = {B.txt(e['hoje'])}::date
                            and refeicao_id::text <> all({B.txt('{' + ','.join(e.get('concluidas_a') or []) + '}')}::text[])) as concluidas_novas,
                         ((select coalesce(jsonb_agg(jsonb_build_object('chave', x.chave, 'nivel', x.nivel) order by x.chave), '[]'::jsonb)
                             from {S}.aluno_acessos x where x.paciente_id = {B.txt(e['pac_a'])})
                           is distinct from {B.txt(json.dumps([{'chave': y['chave'], 'nivel': y['nivel']} for y in e.get('acessos_a') or []]))}::jsonb)::int
                           as acessos_diferentes""")[0]
    return {k: int(v) for k, v in r.items()}


def limpar(e: dict | None = None) -> dict:
    """Desfaz a rodada pelo estado e a Massa do _base.py (a 2ª matrícula); devolve as sobras (tudo 0 = limpo)."""
    e = e if e is not None else (json.loads(ESTADO.read_text(encoding="utf-8") or "{}") if ESTADO.exists() else {})
    sobras: dict = {}
    if e.get("pac_a") and e.get("marca"):
        al, ini, marca, pa = B.txt(e["aluna"]), B.txt(e["inicio"]), B.txt(e["marca"] + "%"), B.txt(e["pac_a"])
        titulos = ", ".join(B.txt(t) for t in TITULOS_WA)
        antes = B.txt("{" + ",".join(e.get("concluidas_a") or []) + "}")
        for c in (
            f"delete from {S}.aluno_dia_itens where dono_user_id = {al} and criado_em >= {ini}",
            f"delete from {S}.aluno_dia_refeicoes where dono_user_id = {al} and criado_em >= {ini}",
            f"delete from {S}.aluno_receitas where dono_user_id = {al} and nome like {marca}",
            f"delete from {S}.aluno_alimentos where dono_user_id = {al} and nome like {marca}",
            f"delete from {S}.rotinas where dono_user_id = {al} and nome like {marca}",
            f"""delete from {S}.refeicoes_concluidas where paciente_id = {pa} and data = {B.txt(e['hoje'])}::date
                 and refeicao_id::text <> all({antes}::text[])""",
            *_acessos_sql(e),
            f"delete from {S}.aluno_acessos_log where paciente_id = {pa} and em >= {ini}",
            f"delete from {S}.avisos where destino_user_id = {al} and tipo = 'geral' and criado_em >= {ini} and titulo in ({titulos})",
        ):
            B.escrever(c)
        sobras = conferir_sobras(e)
    massa = B.Massa().limpar()
    ESTADO.parent.mkdir(parents=True, exist_ok=True)
    ESTADO.write_text("{}", encoding="utf-8")
    return {**sobras, **{f"massa_{k}": int(v) for k, v in massa.items()}}


# ───────────────────────── a tela ─────────────────────────
def gravacoes_ao_abrir(t: B.Tela) -> list[str]:
    """As idas à aluno-dia que NÃO são leitura (a Guarda: leitura = { acao: "ler" })."""
    return [f"{p['metodo']} {p['nome']}({p['acao']})" for p in t.pedidos if p["tipo"] == "fn" and p["nome"] == "aluno-dia" and p["acao"] != "ler"]


def leituras_do_dia(t: B.Tela) -> int:
    return sum(1 for p in t.pedidos if p["tipo"] == "fn" and p["nome"] == "aluno-dia" and p["acao"] == "ler" and '"q":"dia"' in (p["corpo"] or "").replace(" ", ""))


def estado_livre(t: B.Tela) -> str:
    return (t.attr("[data-aba-dieta]", "data-dieta-dia-livre") or [""])[0] or ""


def abrir_dieta(t: B.Tela, R: Rodada, conta: str, rota: str = "/dieta", esperar: str | None = "travada") -> bool:
    t.entrar(R.L, conta, rota)
    t.caso.fechar_avisos()
    ok = t.esperar(lambda: t.tem('[data-aba-dieta="plano"]'), 60)
    if ok and esperar:
        ok = t.esperar(lambda: estado_livre(t) == esperar, 45)
    return ok


def ir_dieta(t: B.Tela, rota: str = "/dieta", esperar: str = "liberada") -> bool:
    t.ir(rota)
    return t.esperar(lambda: t.tem('[data-aba-dieta="plano"]'), 60) and t.esperar(lambda: estado_livre(t) == esperar, 45)


def numero(texto: str) -> float:
    m = re.search(r"-?[\d.]+", (texto or "").replace(".", "").replace(",", "."))
    return float(m.group(0)) if m else 0.0


def kcal_marcadas(t: B.Tela) -> float:
    return float((t.attr("[data-kcal-marcadas]", "data-kcal-marcadas") or ["0"])[0] or 0)


def kcal_da_linha(t: B.Tela, refeicao: str) -> float:
    return numero(t.texto(f'[data-refeicao="{refeicao}"] [data-refeicao-kcal] b'))


def caso_build(o, nav, R: Rodada, loja: bool) -> bool:
    t = R.tela(nav, "build")
    try:
        t.ir("/entrar")
        ok = t.esperar(lambda: t.tem("[data-entrada-staging]"), 60)
        o.ok(ok, "D0 o build é o de staging (a faixa 'Ambiente de teste' na /entrar) — senão nada roda com conta")
        if loja:
            marca = t.pg.evaluate("() => document.querySelector('meta[name=\"physiq-distribuicao\"]')?.getAttribute('content') ?? ''")
            ok = o.ok(ok and marca == "play", f"D0 --loja: o index.html é o do build:loja (physiq-distribuicao = {marca!r})") and ok
        return ok
    finally:
        t.fim()


def caso_travada(o, nav, R: Rodada) -> None:
    e = R.e
    t = R.tela(nav, "travada")
    try:
        ok = abrir_dieta(t, R, "w5p-aluna")
        t.pg.wait_for_timeout(2000)
        o.ok(ok and t.n("[data-dieta-livre]") == 0 and t.n("[data-dieta-nova-refeicao]") == 0 and t.n("[data-dieta-meus]") == 0,
             f"D1 'Só ver': a Dieta de hoje, sem nada da dieta liberada (estado {estado_livre(t)!r})")
        o.ok(not gravacoes_ao_abrir(t) and leituras_do_dia(t) >= 1, f"D1 ao abrir: 0 gravação na aluno-dia ({gravacoes_ao_abrir(t) or '—'}) e {leituras_do_dia(t)} `ler` q=dia")
        R.print(t, "d_travada")
        t.clicar(f'[data-refeicao="{e["r1"]}"] [data-refeicao-abrir]')
        ok = t.esperar(lambda: t.tem(f'[data-folha-refeicao="{e["r1"]}"]'), 20)
        o.ok(ok and t.n("[data-item-tirar]") == 0 and t.n("[data-dieta-adicionar]") == 0, "D1 a folha da refeição como hoje (sem 'Tirar hoje' nem 'Adicionar alimento')")
    finally:
        t.fim()


def caso_liberada_e_tirar(o, nav, R: Rodada) -> None:
    e = R.e
    ok = mudar_dieta(R, "w5p-nutri", e["pac_a"], "mexer")
    o.ok(ok and nivel_dieta(e) == "mexer", "D2 a nutri libera a Dieta da A pela função acessos (no banco: 'mexer')")
    t = R.tela(nav, "liberada")
    try:
        ok = abrir_dieta(t, R, "w5p-aluna", esperar="liberada")
        o.ok(ok and t.tem('[data-dieta-livre="liberada"]') and t.n("[data-dieta-meus]") == 1 and t.n("[data-dieta-nova-refeicao]") == 1,
             "D2 'Pode mexer': 'Nova refeição' e 'Meus alimentos e receitas' embaixo das refeições")
        # 13/10 (o 1º E2E real): os 2 botões lado a lado passavam de 390 px → a página ia a 431 px e as folhas (fixas no fundo) ficavam com os
        # botões abaixo da tela (os cliques de pôr, criar e salvar não aconteciam). A tela tem que caber na largura do celular.
        larg = t.pg.evaluate("() => [window.innerWidth, document.documentElement.scrollWidth]")
        o.ok(larg[0] <= t.largura and larg[1] <= t.largura, f"D2 a tela 'Pode mexer' cabe em {t.largura} px, sem rolar para o lado (innerWidth, scrollWidth = {larg})")
        t.pg.eval_on_selector('[data-dieta-livre="liberada"]', "e => e.scrollIntoView({ block: 'center' })")
        R.print(t, "d_liberada")
        r1, it = e["r1"], e["item1"]
        t.clicar(f'[data-refeicao="{r1}"] [data-refeicao-abrir]')
        t.esperar(lambda: t.tem(f'[data-folha-refeicao="{r1}"] [data-item-tirar="{it}"]'), 20)
        t.clicar(f'[data-item-tirar="{it}"]')
        tirado = lambda: (t.attr(f'[data-item="{it}"]', "data-item-tirado") or [""])[0]  # noqa: E731
        ok = t.esperar(lambda: tirado() == "1", 20)
        linhas = [x for x in itens_do_dia(e) if x["tipo"] == "tirado" and x["item"] == it and not x["desfeito"]]
        o.ok(ok and len(linhas) == 1 and linhas[0]["pac"] == e["pac_a"], f"D3 'Tirar hoje': riscado na hora e no banco o 'tirado' de hoje da A ({len(linhas)})")
        R.print(t, "d_tirar")
        t.clicar(f'[data-item-voltar="{it}"]')
        ok = t.esperar(lambda: tirado() == "0", 20)
        desfeitos = [x for x in itens_do_dia(e) if x["tipo"] == "tirado" and x["item"] == it and x["desfeito"]]
        o.ok(ok and len(desfeitos) == 1, "D3 'Voltar': o item volta (no banco, o 'tirado' desfeito)")
        t.clicar(f'[data-item-tirar="{it}"]')
        o.ok(t.esperar(lambda: tirado() == "1", 20), "D3 tira de novo (fica para o anel do D7)")
        desligado = lambda s: bool(t.pg.evaluate("(s) => { const b = document.querySelector(s); return !!b && b.disabled; }", s))  # noqa: E731
        t.ctx.set_offline(True)
        ok = t.esperar(lambda: desligado(f'[data-item-voltar="{it}"]') and desligado(f'[data-folha-refeicao="{r1}"] [data-dieta-adicionar]'), 15)
        t.ctx.set_offline(False)
        o.ok(ok and t.esperar(lambda: not desligado(f'[data-item-voltar="{it}"]'), 15), "D3 sem internet: os botões desligados (como o ✓ de hoje); a rede voltou → ligados")
    finally:
        t.fim()


def caso_adicionar(o, nav, R: Rodada) -> None:
    e = R.e
    r1 = e["r1"]
    t = R.tela(nav, "adicionar")
    try:
        ok = abrir_dieta(t, R, "w5p-aluna", f"/dieta?ver=refeicao&r={r1}", esperar="liberada")
        ok = ok and t.esperar(lambda: t.tem(f'[data-folha-refeicao="{r1}"] [data-dieta-adicionar]'), 20)
        t.clicar(f'[data-folha-refeicao="{r1}"] [data-dieta-adicionar]')
        t.esperar(lambda: t.tem('[data-folha-adicionar="refeicao"] [data-busca-termo]'), 20)
        t.pg.locator("[data-busca-termo]").fill("arroz")
        ok = t.esperar(lambda: t.n('[data-busca-tipo="taco"]') > 0, 30)
        o.ok(ok, f"D4 a busca 'arroz' acha a TACO ({t.n('[data-busca-tipo]')} resultados)")
        escolhido = (t.attr('[data-busca-tipo="taco"]', "data-busca-item") or [""])[0]
        t.pg.locator('[data-busca-tipo="taco"]').first.click()
        t.esperar(lambda: t.tem("[data-quantidade]"), 15)
        t.pg.locator("[data-quantidade]").fill("150")
        t.pg.wait_for_timeout(400)
        R.print(t, "d_adicionar")
        t.clicar("[data-escolha-por]")
        ok = t.esperar(lambda: t.tem(f'[data-folha-refeicao="{r1}"] [data-item-posto]'), 30)
        postos = [x for x in itens_do_dia(e) if x["tipo"] == "adicionado" and x["refeicao_id"] == r1 and not x["desfeito"]]
        o.ok(ok and len(postos) == 1 and postos[0]["alimento_id"] == escolhido and abs(postos[0]["gramas"] - 150) < 0.01,
             f"D4 'Pôr no dia': volta à refeição com o 'você pôs'; no banco o adicionado de 150 g ({[(x['alimento_id'] == escolhido, x['gramas']) for x in postos]})")
    finally:
        t.fim()


def caso_meus(o, nav, R: Rodada) -> None:
    e = R.e
    t = R.tela(nav, "meus")
    try:
        abrir_dieta(t, R, "w5p-aluna", "/dieta?ver=meus", esperar="liberada")
        t.esperar(lambda: t.tem('[data-folha-meus="lista"] [data-meus-estado="lista"]'), 30)
        t.clicar("[data-meus-novo-alimento]")
        t.esperar(lambda: t.tem("[data-alimento-nome]"), 15)
        pao = f"{e['marca']} pão"
        t.pg.locator("[data-alimento-nome]").fill(pao)
        t.pg.locator("[data-alimento-porcao]").fill("50")
        for chave, valor in (("energia_kcal", "280"), ("proteina_g", "9"), ("carboidrato_g", "50"), ("lipidio_g", "3")):
            t.pg.locator(f'[data-alimento-macro="{chave}"]').fill(valor)
        t.clicar("[data-alimento-salvar]")
        ok = t.esperar(lambda: t.tem('[data-folha-meus="lista"]') and any(x["nome"] == pao for x in da_marca(e, "aluno_alimentos")), 30, 1)
        o.ok(ok, "D5 o alimento dela (por 100 g, porção 50 g) pela folha; no banco: dela")
        t.pg.get_by_role("radio", name=re.compile("Receitas")).click()
        t.clicar("[data-meus-nova-receita]")
        t.esperar(lambda: t.tem("[data-receita-nome]"), 15)
        vitamina = f"{e['marca']} vitamina"
        t.pg.locator("[data-receita-nome]").fill(vitamina)
        t.pg.locator("[data-receita-porcoes]").fill("2")
        termo = e["marca"].split(" ")[-1]   # o hhmmss da marca: acha o pão desta rodada
        t.pg.locator('[data-busca-alimentos="ingrediente"] [data-busca-termo]').fill(termo)
        t.esperar(lambda: t.n('[data-busca-alimentos="ingrediente"] [data-busca-tipo="meu"]') > 0, 30)
        t.pg.locator('[data-busca-alimentos="ingrediente"] [data-busca-tipo="meu"]').first.click()
        t.clicar("[data-receita-adicionar]")
        t.pg.locator('[data-busca-alimentos="ingrediente"] [data-busca-termo]').fill("arroz")
        t.esperar(lambda: t.n('[data-busca-alimentos="ingrediente"] [data-busca-tipo="taco"]') > 0, 30)
        t.pg.locator('[data-busca-alimentos="ingrediente"] [data-busca-tipo="taco"]').first.click()
        t.esperar(lambda: t.n("[data-receita-item]") == 2, 10)
        R.print(t, "d_receita")
        t.clicar("[data-receita-salvar]")
        ok = t.esperar(lambda: t.tem('[data-folha-meus="lista"]') and any(x["nome"] == vitamina for x in da_marca(e, "aluno_receitas")), 30, 1)
        rec = next((x for x in da_marca(e, "aluno_receitas") if x["nome"] == vitamina), None)
        n_itens = int(B.ler(f"select count(*) as n from {S}.aluno_receita_itens where receita_id = {B.txt(rec['id'])}")[0]["n"]) if rec else 0
        o.ok(ok and n_itens == 2, f"D5 a receita dela (o pão + a TACO, 2 porções) pela folha; no banco com {n_itens} ingredientes")
        if rec:
            R.ids["receita"] = rec["id"]
    finally:
        t.fim()


def caso_extra(o, nav, R: Rodada) -> None:
    e = R.e
    t = R.tela(nav, "extra")
    try:
        abrir_dieta(t, R, "w5p-aluna", esperar="liberada")
        t.clicar("[data-dieta-nova-refeicao]")
        t.esperar(lambda: t.tem('[data-folha-extra="nova"] [data-extra-nome]'), 15)
        lanche = f"{e['marca']} lanche"
        t.pg.locator("[data-extra-nome]").fill(lanche)
        t.clicar("[data-extra-salvar]")
        ok = t.esperar(lambda: any(x["nome"] == lanche for x in B.ler(f"""select nome from {S}.aluno_dia_refeicoes where dono_user_id = {B.txt(e['aluna'])}
                                                                         and criado_em >= {B.txt(e['inicio'])}""")), 30, 1)
        ext = B.ler(f"""select id::text as id, paciente_id::text as pac, concluida_em is not null as comi from {S}.aluno_dia_refeicoes
                         where dono_user_id = {B.txt(e['aluna'])} and nome = {B.txt(lanche)}""")
        o.ok(ok and ext and ext[0]["pac"] == e["pac_a"] and ext[0]["comi"], f"D6 'Nova refeição' com 'Já comi': no banco a extra da matrícula A ({ext[:1]})")
        if not ext:
            return
        eid = ext[0]["id"]
        t.esperar(lambda: t.tem(f'[data-extra="{eid}"] [data-refeicao-abrir]'), 20)
        t.clicar(f'[data-extra="{eid}"] [data-refeicao-abrir]')
        t.esperar(lambda: t.tem(f'[data-folha-extra="{eid}"] [data-dieta-adicionar]'), 20)
        t.clicar(f'[data-folha-extra="{eid}"] [data-dieta-adicionar]')
        t.esperar(lambda: t.tem('[data-folha-adicionar="extra"] [data-busca-termo]'), 20)
        t.pg.locator("[data-busca-termo]").fill(f"{e['marca'].split(' ')[-1]} vitamina")
        t.esperar(lambda: t.n('[data-busca-tipo="receita"]') > 0, 30)
        t.pg.locator('[data-busca-tipo="receita"]').first.click()
        t.esperar(lambda: t.tem("[data-quantidade]"), 15)
        t.clicar("[data-escolha-por]")
        ok = t.esperar(lambda: t.tem(f'[data-folha-extra="{eid}"] [data-item-posto]'), 30)
        R.print(t, "d_extra")
        postos = [x for x in itens_do_dia(e) if x["extra_id"] == eid and not x["desfeito"]]
        o.ok(ok and len(postos) == 1 and postos[0]["receita_id"] == R.ids.get("receita") and postos[0]["porcoes"] == 1,
             f"D6 a receita (1 porção) na extra pela busca; no banco: {[(x['receita_id'] == R.ids.get('receita'), x['porcoes']) for x in postos]}")
        # o alimento DELE em porções (2 × a porção de 50 g = 100 g no banco — o servidor só aceita porções na receita)
        t.clicar(f'[data-folha-extra="{eid}"] [data-dieta-adicionar]')
        t.esperar(lambda: t.tem('[data-folha-adicionar="extra"] [data-busca-termo]'), 20)
        t.pg.locator("[data-busca-termo]").fill(e["marca"].split(" ")[-1])
        t.esperar(lambda: t.n('[data-busca-tipo="meu"]') > 0, 30)
        t.pg.locator('[data-busca-tipo="meu"]').first.click()
        t.esperar(lambda: t.tem("[data-quantidade]"), 15)
        t.pg.get_by_role("radio", name=re.compile("Porções")).click()
        t.pg.locator("[data-quantidade]").fill("2")
        t.clicar("[data-escolha-por]")
        ok = t.esperar(lambda: t.n(f'[data-folha-extra="{eid}"] [data-item-posto]') == 2, 30)
        meus = [x for x in itens_do_dia(e) if x["extra_id"] == eid and not x["desfeito"] and x["receita_id"] is None]
        o.ok(ok and len(meus) == 1 and abs((meus[0]["gramas"] or 0) - 100) < 0.01, f"D6 o pão dela em porções (2 × 50 g) na extra; no banco: {[x['gramas'] for x in meus]} g")
        # 13/10 (o print do staging): "Mudar nome e horário" + "Apagar refeição" lado a lado passavam de 390 px — o "Apagar refeição" ficava
        # cortado na borda direita. Cada botão do fim da folha tem de caber inteiro na largura do celular.
        caixas = t.pg.evaluate("""(sel) => [...document.querySelectorAll(sel)].map((b) => {
                                   const r = b.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right)]; })""",
                               f'[data-folha-extra="{eid}"] [data-extra-mudar], [data-folha-extra="{eid}"] [data-extra-apagar]')
        larg = t.pg.evaluate("() => window.innerWidth")
        o.ok(len(caixas) == 2 and all(c[0] >= 0 and c[1] <= larg for c in caixas),
             f"D6 os 2 botões do fim da folha da extra cabem em {larg} px (esquerda, direita de cada = {caixas})")
    finally:
        t.fim()


def caso_totais(o, nav, R: Rodada) -> None:
    e = R.e
    r1 = e["r1"]
    t = R.tela(nav, "totais")
    try:
        abrir_dieta(t, R, "w5p-aluna", esperar="liberada")
        t.pg.wait_for_timeout(1500)
        linha, banco = kcal_da_linha(t, r1), kcal_do_dia(e, r1)
        o.ok(abs(linha - round(banco)) <= 1, f"D7 a linha da 1ª refeição = a conta do banco (sem o tirado, com o que ela pôs): tela {linha} × banco {banco:.2f}")
        x0 = kcal_marcadas(t)
        t.clicar(f'[data-refeicao="{r1}"] [data-refeicao-marcar="feito"]')
        estado = lambda: (t.attr(f'[data-refeicao="{r1}"]', "data-refeicao-estado") or [""])[0]  # noqa: E731
        ok = t.esperar(lambda: estado() == "feita", 20) and t.esperar(lambda: concluida_hoje(e, r1), 20, 1)
        t.pg.wait_for_timeout(1500)
        x1 = kcal_marcadas(t)
        o.ok(ok and abs((x1 - x0) - linha) <= 2, f"D7 ✓ na refeição: o anel sobe o que ela comeu nela ({x0} → {x1}; a linha {linha}); no banco feita hoje")
        R.print(t, "d_totais")
        t.clicar(f'[data-refeicao="{r1}"] [data-refeicao-marcar="desmarcar"]')
        o.ok(t.esperar(lambda: not concluida_hoje(e, r1), 20, 1), "D7 desmarca (o ✓ de antes volta)")
    finally:
        t.fim()


def caso_rotinas(o, nav, R: Rodada, so_aluna: bool = False) -> None:
    e = R.e
    hora = (dt.datetime.now(SP) + dt.timedelta(minutes=30)).strftime("%H:%M")
    st, r = funcao("aluno-dia", R.L.token("w5p-aluna"), {"acao": "rotina_salvar", "dados": {"nome": f"{e['marca']} Creatina", "detalhe": "5 g",
                                                                                              "tipo": "suplemento", "horario": hora, "dias_semana": [1, 2, 3, 4, 5, 6, 7], "lembrete": False}})
    o.ok(st == 200 and r.get("ok") is True, f"D8 a rotina 'Creatina' pela função, como a aluna ({st})")
    t = R.tela(nav, "rotinas")
    try:
        abrir_dieta(t, R, "w5p-aluna", esperar=None)
        ok = t.esperar(lambda: (t.attr("[data-card-rotinas-dieta]", "data-card-rotinas-dieta") or [""])[0] == "lista", 45)
        o.ok(ok and "Creatina" in t.texto("[data-card-rotinas-dieta]"), "D8 'Rotinas de hoje' no fim da Dieta com a Creatina")
        if ok:
            t.pg.eval_on_selector("[data-card-rotinas-dieta]", "e => e.scrollIntoView({ block: 'center' })")
        R.print(t, "d_rotinas")
    finally:
        t.fim()
    if so_aluna:
        return
    t = R.tela(nav, "rotinas-pratos")
    try:
        t.entrar(R.L, "w7b-sozinho", "/dieta")
        t.caso.fechar_avisos()
        ok = t.esperar(lambda: t.tem('[data-aba-dieta="pratos"]'), 60)
        ok = ok and t.esperar(lambda: (t.attr("[data-card-rotinas-dieta]", "data-card-rotinas-dieta") or [""])[0] not in ("", "carregando"), 45)
        o.ok(ok and not gravacoes_ao_abrir(t), f"D8 nos pratos prontos (o app sem profissional): a seção no fim ({(t.attr('[data-card-rotinas-dieta]', 'data-card-rotinas-dieta') or ['—'])[0]}); 0 gravação")
        if ok:
            t.pg.eval_on_selector("[data-card-rotinas-dieta]", "e => e.scrollIntoView({ block: 'center' })")
        R.print(t, "d_rotinas_pratos")
    finally:
        t.fim()


def caso_travou_no_meio(o, nav, R: Rodada) -> None:
    e = R.e
    r2, it = e["r2"], e["item2"]
    t = R.tela(nav, "travou")
    try:
        abrir_dieta(t, R, "w5p-aluna", f"/dieta?ver=refeicao&r={r2}", esperar="liberada")
        t.esperar(lambda: t.tem(f'[data-folha-refeicao="{r2}"] [data-item-tirar="{it}"]'), 20)
        ok = mudar_dieta(R, "w5p-nutri", e["pac_a"], "ver")
        o.ok(ok, "D9 com a folha aberta, a nutri trava a Dieta (dieta=ver)")
        t.clicar(f'[data-item-tirar="{it}"]')
        toast = t.pg.locator("[data-sonner-toast]", has_text=TRAVOU)
        ok = t.esperar(lambda: toast.count() > 0, 20)
        ok = ok and t.esperar(lambda: estado_livre(t) == "travada" and t.n("[data-dieta-livre]") == 0, 30)
        R.print(t, "d_voltou_travada")
        tirados = [x for x in itens_do_dia(e) if x["item"] == it]
        o.ok(ok and not tirados, f"D9 'Tirar hoje' → o toast '{TRAVOU}' e a tela volta ao 'só ver'; no banco nada novo ({len(tirados)})")
    finally:
        t.fim()


def caso_duas_matriculas(o, nav, R: Rodada) -> None:
    e = R.e
    b = B.Massa().segunda_matricula()
    B.escrever(f"update {S}.pacientes set nutricionista_id = {B.txt(e['w13'])} where id = {B.txt(b)} and config ? 'wa_e2e'")
    ok = mudar_dieta(R, "w13-dono", b, "mexer")
    o.ok(ok and nivel_dieta(e) == "ver", f"D10 a 2ª matrícula (conta do w13-dono, a nutri = ele) liberada; a A segue 'ver' ({nivel_dieta(e)})")
    t = R.tela(nav, "duas")
    try:
        ok = abrir_dieta(t, R, "w5p-aluna", esperar="travada")
        o.ok(ok and t.n("[data-dieta-livre]") == 0, "D10 a outra matrícula liberada NÃO libera a tela: vale a do plano ativo (a A)")
        mudar_dieta(R, "w5p-nutri", e["pac_a"], "mexer")
        ok = ir_dieta(t, esperar="liberada")
        o.ok(ok and t.tem('[data-dieta-livre="liberada"]'), "D10 a A liberada → a tela liberada")
    finally:
        t.fim()


def caso_mudar_e_apagar(o, nav, R: Rodada) -> None:
    e = R.e
    pao = next((x for x in da_marca(e, "aluno_alimentos") if x["nome"].endswith(" pão")), None)
    rec = R.ids.get("receita")
    t = R.tela(nav, "apagar")
    try:
        abrir_dieta(t, R, "w5p-aluna", "/dieta?ver=meus", esperar="liberada")
        t.esperar(lambda: t.tem('[data-folha-meus="lista"] [data-meus-estado="lista"]'), 30)
        if not (pao and rec):
            o.ok(False, "D11 sem o pão ou a receita (o D5 falhou)")
            return
        t.clicar(f'[data-meu-alimento="{pao["id"]}"]')
        t.esperar(lambda: t.tem("[data-alimento-nome]"), 15)
        t.pg.locator('[data-alimento-macro="energia_kcal"]').fill("300")
        t.clicar("[data-alimento-salvar]")
        kcal = lambda: float((B.ler(f"select energia_kcal::float as k from {S}.aluno_alimentos where id = {B.txt(pao['id'])}") or [{"k": 0}])[0]["k"])  # noqa: E731
        o.ok(t.esperar(lambda: kcal() == 300, 20, 1), f"D11 mudar o pão 280 → 300 kcal em 100 g (no banco: {kcal()})")
        apagado = lambda tab, i: bool(B.ler(f"select deleted_at is not null as a from {S}.{tab} where id = {B.txt(i)}")[0]["a"])  # noqa: E731
        t.pg.get_by_role("radio", name=re.compile("Receitas")).click()
        t.clicar(f'[data-minha-receita="{rec}"]')
        t.esperar(lambda: t.tem("[data-receita-apagar]"), 15)
        t.clicar("[data-receita-apagar]")
        ok1 = t.caso.confirmar_no_app() and t.esperar(lambda: apagado("aluno_receitas", rec), 20, 1)
        t.esperar(lambda: t.tem('[data-folha-meus="lista"]'), 15)
        t.pg.get_by_role("radio", name=re.compile("Alimentos")).click()
        t.clicar(f'[data-meu-alimento="{pao["id"]}"]')
        t.esperar(lambda: t.tem("[data-alimento-apagar]"), 15)
        t.clicar("[data-alimento-apagar]")
        ok2 = t.caso.confirmar_no_app() and t.esperar(lambda: apagado("aluno_alimentos", pao["id"]), 20, 1)
        retrato = [x for x in itens_do_dia(e) if not x["desfeito"] and (x["receita_id"] == rec or x["receita_id"] is None and x["extra_id"])]
        o.ok(ok1 and ok2 and len(retrato) >= 1, f"D11 apagar a receita e o pão com a confirmação do app (no banco a lixeira); o dia segue com o retrato ({len(retrato)})")
    finally:
        t.fim()


def caso_velho(o, nav, R: Rodada) -> None:
    """--velho: o build de ANTES da P5 (o JS do APK de hoje) com a Dieta LIBERADA: a tela de hoje, sem nada novo, e o ✓ como antes."""
    e = R.e
    r1 = e["r1"]
    ok = mudar_dieta(R, "w5p-nutri", e["pac_a"], "mexer")
    o.ok(ok, "V1 a nutri libera a Dieta da A (no banco: 'mexer')")
    t = R.tela(nav, "velho")
    try:
        ok = abrir_dieta(t, R, "w5p-aluna", esperar=None)
        t.pg.wait_for_timeout(2500)
        o.ok(ok and t.n("[data-dieta-livre]") == 0 and t.n("[data-dieta-dia-livre]") == 0 and leituras_do_dia(t) == 0,
             f"V1 o app de antes: a Dieta de hoje, sem nada da P5 e sem ler o dia livre ({leituras_do_dia(t)} `ler` q=dia)")
        t.clicar(f'[data-refeicao="{r1}"] [data-refeicao-marcar="feito"]')
        ok = t.esperar(lambda: concluida_hoje(e, r1), 20, 1)
        R.print(t, "d_apk_velho")
        t.clicar(f'[data-refeicao="{r1}"] [data-refeicao-marcar="desmarcar"]')
        ok = ok and t.esperar(lambda: not concluida_hoje(e, r1), 20, 1)
        o.ok(ok, "V1 o ✓ do plano marca e desmarca como antes (paciente_marcar_refeicao), com a Dieta liberada")
    finally:
        t.fim()


def caso_prod(o, nav, R: Rodada) -> None:
    """PRODUÇÃO, SÓ LEITURA: o Início e a Dieta (se a conta a tiver) da conta de teste aluno-calc com a Guarda."""
    guarda = B.Guarda()
    t = R.tela(nav, "prod", guarda=guarda)
    try:
        t.entrar(R.L, "aluno-calc", "/")
        t.caso.fechar_avisos()
        ok = t.esperar(lambda: t.tem("[data-card-rotinas-hoje]"), 60)
        t.pg.wait_for_timeout(2500)
        o.ok(ok, "P1 produção: o Início abre (o card das rotinas da P3)")
        R.print(t, "prod_d_inicio")
        t.ir("/dieta")
        t.pg.wait_for_timeout(4000)
        estado = (t.attr("[data-aba-dieta]", "data-aba-dieta") or ["(sem a aba)"])[0]
        o.linha(f"   P1 produção: /dieta → {estado} (a aluno-calc é só de Treino: a Dieta liberada é provada no staging)")
        o.ok(not guarda.bloqueadas and not gravacoes_ao_abrir(t), f"P2 produção: nenhuma gravação tentada (a Guarda bloqueou: {guarda.bloqueadas or '—'})")
    finally:
        t.fim()


def seco() -> int:
    raiz = Path(__file__).resolve().parents[2]
    falta = [f"{arq} › {x}" for arq, itens in NO_CODIGO.items() for x in itens
             if not (raiz / arq).exists() or x not in (raiz / arq).read_text(encoding="utf-8")]
    for f in falta:
        print("❌ falta no código:", f)
    total = sum(len(v) for v in NO_CODIGO.values())
    print(f"{total - len(falta)}/{total} seletores e textos do E2E no código")
    return 1 if falta else 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", choices=sorted(BASES))
    ap.add_argument("--loja", action="store_true")
    ap.add_argument("--velho", action="store_true")
    ap.add_argument("--canal", default="msedge")
    ap.add_argument("--limpar", action="store_true")
    ap.add_argument("--seco", action="store_true")
    a = ap.parse_args()
    if a.seco:
        return seco()
    if a.base == "prod":
        return producao(a)
    B.usar_schema(S)
    if a.limpar:
        print("sobras depois de limpar:", limpar())
        return 0
    if not a.base:
        ap.error("--base local|staging|prod (ou --limpar / --seco)")
    if a.velho and a.base != "local":
        ap.error("--velho só com --base local (o build de antes da P5 na 5173 — velho.sh)")
    prefixo = f"{a.base}{'-loja' if a.loja else ''}{'-velho' if a.velho else ''}"
    o = C.Saida(f"telas_dieta_{prefixo}")
    base = BASES[a.base]
    o.linha(f"base {base} · {'build da loja' if a.loja else 'o build de ANTES da P5' if a.velho else 'build do site'} · canal {a.canal}")
    B.exigir_saude("as telas da dieta liberada")
    agora = dt.datetime.now(SP)
    if agora.hour == 23 and agora.minute >= 30:
        raise SystemExit("perto da meia-noite de SP (o dia de hoje viraria no meio da rodada): rode depois das 00:05 — nada foi gravado")
    if ESTADO.exists() and json.loads(ESTADO.read_text(encoding="utf-8") or "{}"):
        raise SystemExit(f"há massa de uma rodada anterior no estado ({ESTADO}): rode --limpar antes — nada foi gravado")
    f = foto()
    R = Rodada(o, base, prefixo)
    R.pre = "loja_" if a.loja else ""
    R.e = {**f, "marca": f"{B.MARCA} P5 {time.strftime('%H%M%S')}", "inicio": dt.datetime.now(dt.timezone.utc).isoformat()}
    R.guardar()
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    try:
        with sync_playwright() as pw:
            def rodar(fn, *args) -> None:
                nav = pw.chromium.launch(channel=a.canal, args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"])
                try:
                    fn(o, nav, R, *args)
                except Exception as ex:  # noqa: BLE001
                    o.ok(False, f"{fn.__name__}: {type(ex).__name__}: {str(ex)[:300]}")
                    caso = B5.ESTADO.get("caso")
                    if caso:
                        caso.diagnostico()
                finally:
                    nav.close()

            ok_build = {"v": False}

            def build(o_, nav, R_) -> None:
                ok_build["v"] = caso_build(o_, nav, R_, a.loja)

            rodar(build)
            if ok_build["v"]:
                if a.velho:
                    rodar(caso_velho)
                elif a.loja:
                    for fn in (caso_travada, caso_liberada_e_tirar):
                        B.exigir_saude(fn.__name__)
                        rodar(fn)
                    rodar(caso_rotinas, True)
                else:
                    for fn in (caso_travada, caso_liberada_e_tirar, caso_adicionar, caso_meus, caso_extra, caso_totais, caso_rotinas,
                               caso_travou_no_meio, caso_duas_matriculas, caso_mudar_e_apagar):
                        B.exigir_saude(fn.__name__)
                        rodar(fn)
    finally:
        R.L.fechar(o)
        sobras = limpar(R.e)
        o.ok(all(v == 0 for v in sobras.values()), f"limpeza: as sobras da rodada {sobras}")
    o.linha(f"\nprints ({len(R.provas)}): {R.provas}")
    C.C2.registrar_rodada(o.oks, o.oks + o.falhas)  # H-50: a rodada no e2e-rodadas.tsv (nunca derruba o teste)
    return o.fim()


def producao(a) -> int:
    B.usar_schema("public")
    o = C.Saida("telas_dieta_prod")
    R = Rodada(o, BASES["prod"], "prod")
    o.linha(f"base {R.base} · PRODUÇÃO, SÓ LEITURA (a Guarda no navegador) · canal {a.canal}")
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    try:
        with sync_playwright() as pw:
            nav = pw.chromium.launch(channel=a.canal, args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"])
            try:
                caso_prod(o, nav, R)
            except Exception as ex:  # noqa: BLE001
                o.ok(False, f"caso_prod: {type(ex).__name__}: {str(ex)[:300]}")
            finally:
                nav.close()
    finally:
        R.L.fechar(o)
    o.linha(f"\nprints ({len(R.provas)}): {R.provas}")
    C.C2.registrar_rodada(o.oks, o.oks + o.falhas)
    return o.fim()


if __name__ == "__main__":
    raise SystemExit(main())
