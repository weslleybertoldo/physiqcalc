#!/usr/bin/env python3
"""Physiq W-A P6 — E2E de TELA do painel: o card "Rotinas" do Resumo e o "Dia a dia" da aba Dieta da ficha (Edge; painel 1280 × 883, celular
390 × 844; o app da aluna 390 × 844). Spec W-A §4.5, §4.7, §6 "P6", §7. Contas de TESTE (hml-17): w5p-personal (dono + personal da conta A
da w5p-aluna — cria a rotina pelo card), w5p-nutri (a nutricionista dela na conta A: libera/trava a Dieta pela função acessos e vê o "Dia a
dia"), w5p-aluna (o sino, a página de rotinas e o que ela registra no dia — pelas funções, como ela), w13-dono (a conta B: a 2ª matrícula da
aluna, pela Massa) e a matrícula "sem login" (Massa). Casos (na ordem; cada um depende do anterior):
  P0  o build é o de STAGING (a faixa "Ambiente de teste" na /entrar; --loja: a marca da loja no index.html) — senão nada roda com conta
  P1  p_resumo_rotinas     o personal abre o Resumo: o card Rotinas com a "<marca> Creatina" da aluna (feita hoje — o ✓ dela, só leitura) e o
                           selo "do aluno"; ao abrir, 0 gravação (só `ler` q=aluno_rotinas na aluno-dia)
  P2  p_nova_rotina        "Nova rotina" → a folha da P3 no modo do profissional → "<marca> Água 2 L" (hábito, 10:00, todos os dias) → 1
                           prof_rotina_salvar; no banco: origem profissional na matrícula A, criada pelo personal; o aviso no sino da aluna (hoje)
  P3  mudar a do profissional pelo card: 10:00 → 11:00 (no banco o horário e o histórico "mudou" — quem: profissional)
  P4  p_sino_aluno         a aluna (o app) abre o sino: "Seu profissional criou uma rotina para você"; a /perfil/rotinas com a Água e o selo
                           "do seu profissional" (aparece no app)
  P5  p_apagada_pelo_aluno a aluna apaga a Água (P8b, pela função como ela) → o card não a mostra mais; o "Ver tudo": "apagada pelo aluno em dd/mm"
  P6  p_historico          o "Ver tudo" › Histórico: criou (o personal), mudou ("horário 10:00 → 11:00"), apagou (o aluno)
  P7  a conta B (w13-dono na 2ª matrícula) vê a Creatina da aluna, NÃO vê o "<marca> Ômega 3" que o personal criou na conta A e não o muda
      nem o apaga pela função (404 nao_encontrado)
  P8  p_dia_a_dia          a nutri libera a Dieta; a aluna (pelas funções) tira o último item da 1ª refeição de hoje, põe um arroz da TACO nela,
                           dá o ✓ nela, cria a extra "<marca> Lanche" ("Já comi") com um arroz, e põe um arroz na refeição temporária
                           "<marca> Ceia" do plano — que a nutri tira do plano em seguida (o retrato). A nutri abre Dieta › Dia a dia: o ✓,
                           o riscado, o "pelo aluno", a extra, a "refeição tirada do plano", o total e as rotinas do dia; ao abrir, 0 gravação
  P9  p_dia_a_dia_travada  a nutri trava a Dieta: a faixa "A dieta está em “Só ver” (Acessos)." e o que ela registrou continua lá (§2.2-12)
  P10 p_dia_a_dia_personal o personal (só o plano, Q1 — o w5p-personal SÓ com o papel 'personal': a Massa tira o 'dono' durante o caso e devolve):
                           o Plano, a adesão e, embaixo, o Dia a dia com o mesmo dia — só ler; 0 gravação ao abrir
  P11 p_rotinas_sem_login  a matrícula "sem login" (Massa): "Ele precisa de login para receber rotinas — crie o acesso na aba Acessos."
  P12 p_dia_a_dia_celular  390 px: o card Rotinas e o Dia a dia cabem na tela (nada passa da largura)
  --loja: P0 (a marca da loja) + a massa pelas funções (a Creatina feita; a Dieta liberada, tirar e pôr) + P1 + P8 e P10 SÓ LENDO — os prints
          com o prefixo loja_.
A rodada vai para o estado (~/projetos/physiqcalc-scratch/w-a/p6-estado.json) ANTES de qualquer escrita: a foto da matrícula A (os acessos, os ✓
de hoje). A massa leva a marca "WA E2E P6 <hhmmss>". No fim (e no --limpar): os acessos da A voltam à foto, os ✓ novos de hoje saem, o que a
aluna pôs/tirou no dia e as extras desde o começo, as rotinas com a marca, a refeição temporária (se sobrou), o histórico dos acessos e os
avisos da rodada saem, e a Massa (a 2ª matrícula, a "sem login") é desfeita — as sobras = 0.
Bases: --base local (o vite preview do dist/ de STAGING em http://localhost:5173 — a 8080 é da LINUX 1) · staging (https://physiqcalc-staging.vercel.app)
· prod (https://physiqcalc.com.br, SÓ LEITURA: a Guarda da hml-17 no navegador — nenhuma gravação sai —, a conta de teste "master" do Calc
(admin.teste.claude) no aluno da conta "Admin Teste": P1 o Resumo abre com o card Rotinas só com leituras, P2 nenhuma gravação tentada; print
prod_p_resumo_rotinas; sem massa). Prints: ~/projetos/physiqcalc-scratch/prints/w-a/p6/<base>[-loja]/<caso>_<largura>.png.
Saída: ~/projetos/physiqcalc-scratch/w-a/p6/telas_painel_<base>.txt (só contagens, kcal das contas de TESTE, status e códigos). Logout local das
sessões do teste (nunca o global).
--seco: sem rede e sem navegador — cada seletor e texto que o E2E usa existe no código.
Uso: python3 e2e/wa/telas_painel.py --base local|staging|prod [--loja] [--canal msedge] | --limpar | --seco
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
import time
import uuid
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
ESTADO = B.SCRATCH / "w-a" / "p6-estado.json"
C.SAIDA = B.SCRATCH / "w-a" / "p6"
TITULO_ROTINA = "Seu profissional criou uma rotina para você"
TITULO_DIETA = "Sua dieta foi liberada: agora você pode pôr e tirar alimentos no seu dia"
TRAVADA = "A dieta está em “Só ver” (Acessos)."
SEM_LOGIN = "Ele precisa de login para receber rotinas — crie o acesso na aba Acessos."
# na produção (a Guarda), as gravações que já existem ao abrir e não são da W-A (o molde do telas_acessos.py da P4)
BARRADAS_ACEITAS = {"POST rpc:aluno_acesso", "POST fn:nutricao"}

# --seco: o arquivo → o que tem de estar nele (seletores e textos que o E2E usa)
NO_CODIGO = {
    "src/painel/aluno/resumo/CardRotinas.tsx": ["data-card-rotinas={estado}", "data-rotinas-pode-criar=", "data-rotinas-hoje={doDia.length}",
                                                "data-rotinas-nova", "data-rotinas-ver-tudo", "data-rotinas-sem-login", "data-rotinas-acessos",
                                                'modo={{ tipo: "profissional", aluno: alunoId }}'],
    "src/painel/aluno/rotinas/LinhaDaRotina.tsx": ['"data-rotina-painel": r.id', '"data-rotina-feita": feita ? "1" : "0"', "data-rotina-painel-abrir={r.id}",
                                                   "data-rotina-painel-selo", '"data-rotina-origem": r.origem'],
    "src/painel/aluno/rotinas/FolhaTodasAsRotinas.tsx": ["data-rotinas-tudo", "data-rotina-apagada={r.id}", "data-rotina-apagada-texto",
                                                        "data-rotina-evento={e.o_que}", "data-rotina-evento-mudanca", 'lado="direita"'],
    "src/painel/aluno/rotinas/regras.ts": ['semLogin: "Ele precisa de login para receber rotinas — crie o acesso na aba Acessos."',
                                           "`apagada pelo aluno em ${quando}`", "export const JANELA_DIAS = 14;"],
    "src/painel/aluno/diaADia/DiaADia.tsx": ["data-dia-a-dia={estado}", "data-dia-a-dia-botao={x}", "data-dia-a-dia-conteudo={visto}",
                                             "data-dia-refeicao={r.refeicao.id}", 'data-dia-refeicao-feita={r.concluida ? "1" : "0"}',
                                             "data-dia-item={x.item.id}", 'data-dia-item-tirado={x.tirado ? "1" : "0"}', "data-dia-posto={i.id}",
                                             "data-dia-extra={e.extra.id}", "data-dia-fora={g.refeicao}", "data-dia-fora-selo", "data-dia-rotinas=",
                                             "data-dia-a-dia-travada", "data-dia-a-dia-total", "data-kcal-comido=", "data-leitura"],
    "src/painel/aluno/diaADia/regras.ts": ['travada: "A dieta está em “Só ver” (Acessos)."', 'vazio: "Nada registrado pelo aluno nestes dias."',
                                           'refeicaoTirada: "refeição tirada do plano"'],
    "src/painel/aluno/abas/Dieta.tsx": ['case "dia-a-dia":', '<Secao secao="dia-a-dia" aluno={aluno} />', "data-acesso-dieta={acesso}"],
    "src/nutricao/editor/lib/acesso.ts": ['{ id: "dia-a-dia", rotulo: "Dia a dia" }'],
    "src/painel/aluno/catalogoAbas.ts": ['"CardRotinas",'],
    "src/rotinas/ui/FolhaRotina.tsx": ["data-folha-rotina", "data-folha-modo={modo.tipo}", "data-rotina-nome", "data-rotina-horario", "data-rotina-salvar"],
    "src/app-aluno/perfil/Rotinas.tsx": ["data-pagina-rotinas", "data-rotina-linha={r.id}"],
    "src/rotinas/ui/RotinasDeHoje.tsx": ["data-rotina-selo"],
    "src/ui/premium/Sino.tsx": ["data-sino", "data-sino-lista"],
}


class Rodada:
    def __init__(self, o, base: str, prefixo: str) -> None:
        self.o, self.base, self.prefixo = o, base, prefixo
        self.L = B.Logins()
        self.pasta = B.pasta_prints("p6") / prefixo
        self.provas: list[str] = []
        self.e: dict = {}
        self.ids: dict[str, str] = {}
        self.pre = ""

    def tela(self, nav, nome: str, desktop: bool = True, guarda=None) -> B.Tela:
        return B.Tela(nav, self.base, "p6", nome, desktop=desktop, guarda=guarda)

    def print(self, t: B.Tela, caso: str) -> None:
        caminho = t.print(self.pasta, f"{self.pre}{caso}")
        self.provas.append(caminho)
        self.o.linha(f"   print: {caminho}")

    def guardar(self) -> None:
        ESTADO.parent.mkdir(parents=True, exist_ok=True)
        ESTADO.write_text(json.dumps(self.e, ensure_ascii=False, indent=1), encoding="utf-8")


# ───────────────────────── o banco (SÓ LEITURA, menos a massa e a limpeza) e as funções ─────────────────────────
def funcao(nome: str, token: str, corpo: dict) -> tuple[int, dict]:
    cab = {"apikey": B5.anon(B.PRINCIPAL_REF), "Authorization": f"Bearer {token}", "x-schema": S, "Origin": ORIGEM}
    st, r, _h = B5.http("POST", f"{B.H.API_P}/functions/v1/{nome}", corpo, cab, timeout=60)
    return st, (r if isinstance(r, dict) else {})


def foto() -> dict:
    """SÓ LEITURA: a matrícula A, o plano ativo de hoje (a 1ª refeição com alimento e o último item dela), um arroz da TACO, os acessos e os ✓
    de hoje da A."""
    E = B.CONTAS
    u = lambda k: f"(select id from auth.users where lower(email) = {B.txt(E[k])})"  # noqa: E731
    r = B.ler(f"""
      with a as (select p.id, p.conta_id from {S}.pacientes p join {S}.contas c on c.id = p.conta_id
                  where p.user_id = {u('w5p-aluna')} and p.deleted_at is null and c.origem <> 'app' and p.nutricionista_id = {u('w5p-nutri')}
                    and p.personal_id = {u('w5p-personal')} order by p.created_at limit 1),
           hoje as (select (now() at time zone 'America/Sao_Paulo')::date as d)
      select (select id::text from a) as pac_a, (select conta_id::text from a) as conta_a, {u('w5p-aluna')}::text as aluna,
             {u('w5p-nutri')}::text as nutri, {u('w5p-personal')}::text as personal, {u('w13-dono')}::text as w13,
             (select d::text from hoje) as hoje, {S}.wa_plano_ativo({u('w5p-aluna')})::text as plano,
             (select a2.id::text from {S}.alimentos a2 where a2.fonte = 'taco' and a2.deleted_at is null and a2.busca like '%arroz%'
               order by a2.nome limit 1) as arroz,
             (select coalesce(jsonb_agg(jsonb_build_object('chave', x.chave, 'nivel', x.nivel, 'alterado_por', x.alterado_por,
                                                           'alterado_em', x.alterado_em) order by x.chave), '[]'::jsonb)
                from {S}.aluno_acessos x, a where x.paciente_id = a.id) as acessos_a,
             (select coalesce(jsonb_agg(rc.refeicao_id::text), '[]'::jsonb) from {S}.refeicoes_concluidas rc, a, hoje
               where rc.paciente_id = a.id and rc.data = hoje.d) as concluidas_a,
             (select count(*) from {S}.rotinas ro where ro.dono_user_id = {u('w5p-aluna')} and ro.arquivada_em is null) as rotinas_vivas""")[0]
    refs = B.ler(f"""select r.id::text as id, (select coalesce(json_agg(i.id::text order by i.ordem, i.created_at), '[]'::json)
                                                 from {S}.itens_refeicao i where i.refeicao_id = r.id) as itens
                       from {S}.refeicoes r
                      where r.plano_id = {B.txt(r['plano'])}
                        and (cardinality(r.dias_semana) = 0 or extract(isodow from {B.txt(r['hoje'])}::date)::smallint = any(r.dias_semana))
                      order by r.ordem, to_char(r.horario, 'HH24:MI'), r.nome""") if r["plano"] else []
    com = [x for x in refs if x["itens"]]
    if not (r["pac_a"] and com and r["arroz"]):
        raise SystemExit("massa de TESTE incompleta no staging (a matrícula A da w5p-aluna com 1 refeição de hoje com alimento e a TACO com arroz) — nada foi gravado")
    if int(r["rotinas_vivas"]) > 26:
        raise SystemExit(f"a w5p-aluna tem {r['rotinas_vivas']} rotinas vivas (a rodada cria 3; o limite é 30) — conferir no quadro (nada foi gravado)")
    sobra = B.Massa().sobras()
    if any(int(v) for v in sobra.values()):
        raise SystemExit(f"há massa da W-A de uma rodada anterior no staging ({sobra}): rode o --limpar da parte que deixou — nada foi gravado")
    return {**r, "r1": com[0]["id"], "item1": com[0]["itens"][-1]}


def nivel_dieta(e: dict) -> str:
    r = B.ler(f"select nivel from {S}.aluno_acessos where paciente_id = {B.txt(e['pac_a'])} and chave = 'dieta'")
    return r[0]["nivel"] if r else "ver"


def mudar_dieta(R: Rodada, conta: str, pac: str, valor: str) -> bool:
    st, r = funcao("acessos", R.L.token(conta), {"acao": "salvar", "aluno": pac, "chave": "dieta", "valor": valor})
    return st == 200 and (r.get("linhas") or {}).get("dieta") == valor


def rotina(e: dict, sufixo: str) -> dict | None:
    r = B.ler(f"""select r.id::text as id, r.origem, r.paciente_id::text as paciente_id, r.criada_por::text as criada_por, to_char(r.horario, 'HH24:MI') as horario,
                         r.arquivada_em is not null as arquivada, r.arquivada_por::text as arquivada_por,
                         (select coalesce(json_agg(json_build_object('o_que', h.o_que, 'quem', h.quem) order by h.em), '[]'::json)
                            from {S}.rotinas_historico h where h.rotina_id = r.id) as historico
                    from {S}.rotinas r where r.dono_user_id = {B.txt(e['aluna'])} and r.nome = {B.txt(e['marca'] + ' ' + sufixo)}""")
    return r[0] if r else None


def avisos_rotina_hoje(e: dict) -> int:
    return int(B.ler(f"""select count(*) as n from {S}.avisos where destino_user_id = {B.txt(e['aluna'])} and tipo = 'geral'
                           and titulo = {B.txt(TITULO_ROTINA)}
                           and criado_em >= date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'""")[0]["n"])


def conferir_sobras(e: dict) -> dict:
    """SÓ LEITURA: o que a rodada deixou (tem de dar tudo 0)."""
    al, ini, marca = B.txt(e["aluna"]), B.txt(e["inicio"]), B.txt(e["marca"] + "%")
    titulos = ", ".join(B.txt(t) for t in (TITULO_ROTINA, TITULO_DIETA))
    antes = B.txt("{" + ",".join(e.get("concluidas_a") or []) + "}")
    r = B.ler(f"""select (select count(*) from {S}.aluno_dia_itens where dono_user_id = {al} and criado_em >= {ini}) as itens_do_dia,
                         (select count(*) from {S}.aluno_dia_refeicoes where dono_user_id = {al} and criado_em >= {ini}) as extras,
                         (select count(*) from {S}.rotinas where dono_user_id = {al} and nome like {marca}) as rotinas,
                         (select count(*) from {S}.refeicoes where plano_id = {B.txt(e.get('plano'))} and nome like {marca}) as refeicao_temporaria,
                         (select count(*) from {S}.aluno_acessos_log where paciente_id = {B.txt(e['pac_a'])} and em >= {ini}) as historico,
                         (select count(*) from {S}.avisos where destino_user_id = {al} and tipo = 'geral' and titulo in ({titulos})
                            and criado_em >= {ini}) as avisos,
                         (select count(*) from {S}.refeicoes_concluidas where paciente_id = {B.txt(e['pac_a'])} and data = {B.txt(e['hoje'])}::date
                            and refeicao_id::text <> all({antes}::text[])) as concluidas_novas,
                         ((select coalesce(jsonb_agg(jsonb_build_object('chave', x.chave, 'nivel', x.nivel) order by x.chave), '[]'::jsonb)
                             from {S}.aluno_acessos x where x.paciente_id = {B.txt(e['pac_a'])})
                           is distinct from {B.txt(json.dumps([{'chave': y['chave'], 'nivel': y['nivel']} for y in e.get('acessos_a') or []]))}::jsonb)::int
                           as acessos_diferentes""")[0]
    return {k: int(v) for k, v in r.items()}


def limpar(e: dict | None = None) -> dict:
    """Desfaz a rodada pelo estado e a Massa do _base.py (a 2ª matrícula, a "sem login"); devolve as sobras (tudo 0 = limpo)."""
    e = e if e is not None else (json.loads(ESTADO.read_text(encoding="utf-8") or "{}") if ESTADO.exists() else {})
    sobras: dict = {}
    if e.get("pac_a") and e.get("marca"):
        al, ini, marca, pa = B.txt(e["aluna"]), B.txt(e["inicio"]), B.txt(e["marca"] + "%"), B.txt(e["pac_a"])
        titulos = ", ".join(B.txt(t) for t in (TITULO_ROTINA, TITULO_DIETA))
        antes = B.txt("{" + ",".join(e.get("concluidas_a") or []) + "}")
        comandos = [
            f"delete from {S}.aluno_dia_itens where dono_user_id = {al} and criado_em >= {ini}",
            f"delete from {S}.aluno_dia_refeicoes where dono_user_id = {al} and criado_em >= {ini}",
            f"delete from {S}.rotinas where dono_user_id = {al} and nome like {marca}",
            f"""delete from {S}.refeicoes_concluidas where paciente_id = {pa} and data = {B.txt(e['hoje'])}::date
                 and refeicao_id::text <> all({antes}::text[])""",
            f"delete from {S}.aluno_acessos where paciente_id = {pa}",
            *[f"""insert into {S}.aluno_acessos (paciente_id, chave, nivel, alterado_por, alterado_em)
                  values ({pa}, {B.txt(y['chave'])}, {B.txt(y['nivel'])}, {B.txt(y.get('alterado_por'))}, {B.txt(y.get('alterado_em'))})"""
              for y in e.get("acessos_a") or []],
            f"delete from {S}.aluno_acessos_log where paciente_id = {pa} and em >= {ini}",
            f"delete from {S}.avisos where destino_user_id = {al} and tipo = 'geral' and criado_em >= {ini} and titulo in ({titulos})",
        ]
        if e.get("plano"):
            comandos.append(f"delete from {S}.refeicoes where plano_id = {B.txt(e['plano'])} and nome like {marca}")
        for c in comandos:
            B.escrever(c)
        sobras = conferir_sobras(e)
    massa = B.Massa().limpar()
    ESTADO.parent.mkdir(parents=True, exist_ok=True)
    ESTADO.write_text("{}", encoding="utf-8")
    return {**sobras, **{f"massa_{k}": int(v) for k, v in massa.items()}}


def massa_sem_login(R: Rodada) -> str:
    """A matrícula 'sem login' (personal + nutri, na conta A) pela Massa do _base.py: o id vai ao estado ANTES do insert (o molde da P4)."""
    m = B.Massa()
    novo = str(uuid.uuid4())
    m.estado["matriculas"].append(novo)
    m._guardar()  # noqa: SLF001 — o mesmo estado do --limpar do _base.py
    B.escrever(f"""insert into {S}.pacientes (id, conta_id, personal_id, nutricionista_id, nome, config)
                   values ({B.txt(novo)}, {B.txt(R.e['conta_a'])}, {B.txt(R.e['personal'])}, {B.txt(R.e['nutri'])},
                           {B.txt(R.e['marca'] + ' sem login')}, '{{"wa_e2e": true}}'::jsonb)""")
    return novo


# ───────────────────────── a tela ─────────────────────────
def gravacoes_ao_abrir(t: B.Tela) -> list[str]:
    """As idas às funções da W-A que NÃO são leitura (a Guarda: leitura = { acao: "ler" }). A nutricao da ficha não é da P6 (o garantir dela no
    1º acesso é de antes — o BARRADAS_ACEITAS da P4)."""
    return [f"{p['metodo']} {p['nome']}({p['acao']})" for p in t.pedidos
            if p["tipo"] == "fn" and p["nome"] in ("aluno-dia", "acessos") and p["acao"] != "ler"]


def leituras(t: B.Tela, q: str) -> int:
    return sum(1 for p in t.pedidos if p["tipo"] == "fn" and p["nome"] == "aluno-dia" and p["acao"] == "ler"
               and f'"q":"{q}"' in (p["corpo"] or "").replace(" ", ""))


def estado_card(t: B.Tela) -> str:
    return (t.attr("[data-card-rotinas]", "data-card-rotinas") or [""])[0]


def abrir_resumo(t: B.Tela, R: Rodada, conta: str, pac: str, conta_ativa: str | None) -> bool:
    t.entrar(R.L, conta, f"/painel/alunos/{pac}", conta_ativa=conta_ativa)
    t.caso.fechar_avisos()
    ok = t.esperar(lambda: estado_card(t) not in ("", "carregando"), 60)
    if ok:  # o card fica abaixo dos 6 de cima: o print (só a janela) rola até ele
        t.pg.eval_on_selector("[data-card-rotinas]", "e => e.scrollIntoView({ block: 'center' })")
    return ok


def abrir_dia_a_dia(t: B.Tela, R: Rodada, conta: str, sufixo: str = "?secao=dia-a-dia") -> bool:
    e = R.e
    t.entrar(R.L, conta, f"/painel/alunos/{e['pac_a']}/dieta{sufixo}", conta_ativa=e["conta_a"])
    t.caso.fechar_avisos()
    ok = t.esperar(lambda: (t.attr("[data-dia-a-dia]", "data-dia-a-dia") or ["carregando"])[0] not in ("carregando",), 60)
    if ok:
        t.pg.eval_on_selector("[data-dia-a-dia]", "e => e.scrollIntoView({ block: 'start' })")
    return ok


def caso_build(o, nav, R: Rodada, loja: bool) -> bool:
    t = R.tela(nav, "build", False)
    try:
        t.ir("/entrar")
        ok = t.esperar(lambda: t.tem("[data-entrada-staging]"), 60)
        o.ok(ok, "P0 o build é o de staging (a faixa 'Ambiente de teste' na /entrar) — senão nada roda com conta")
        if loja:
            marca = t.pg.evaluate("() => document.querySelector('meta[name=\"physiq-distribuicao\"]')?.getAttribute('content') ?? ''")
            ok = o.ok(ok and marca == "play", f"P0 --loja: o index.html é o do build:loja (physiq-distribuicao = {marca!r})") and ok
        return ok
    finally:
        t.fim()


def semear_rotina_da_aluna(o, R: Rodada) -> None:
    """A rotina DA ALUNA (pela função, como ela) com o ✓ de hoje — o que o card mostra no P1."""
    e = R.e
    tok = R.L.token("w5p-aluna")
    st, r = funcao("aluno-dia", tok, {"acao": "rotina_salvar", "dados": {"nome": f"{e['marca']} Creatina", "detalhe": "5 g", "tipo": "suplemento",
                                                                       "horario": "08:00", "dias_semana": [1, 2, 3, 4, 5, 6, 7], "lembrete": False}})
    rid = (r.get("rotina") or {}).get("id")
    st2, _r2 = funcao("aluno-dia", tok, {"acao": "rotina_marcar", "id": rid, "dia": e["hoje"], "feita": True}) if rid else (0, {})
    o.ok(st == 200 and bool(rid) and st2 == 200, f"semear: a Creatina da aluna (rotina_salvar {st}) feita hoje (rotina_marcar {st2})")
    if rid:
        R.ids["creatina"] = rid


def caso_resumo_e_nova(o, nav, R: Rodada, so_ler: bool = False) -> None:
    """P1 (+ P2 e P3 no site): o card do personal; criar e mudar a do profissional."""
    e = R.e
    cre = R.ids.get("creatina")
    t = R.tela(nav, "resumo")
    try:
        ok = abrir_resumo(t, R, "w5p-personal", e["pac_a"], e["conta_a"])
        linha = f'[data-card-rotinas] [data-rotina-painel="{cre}"]'
        o.ok(ok and estado_card(t) == "lista" and t.tem(linha), f"P1 o card Rotinas do personal com a Creatina da aluna ({estado_card(t)})")
        o.ok((t.attr(linha, "data-rotina-feita") or [""])[0] == "1" and (t.attr(linha, "data-rotina-editavel") or [""])[0] == "0"
             and "do aluno" in t.texto(f"{linha} [data-rotina-painel-selo]"),
             "P1 o ✓ que a aluna deu (só leitura), o selo 'do aluno' e sem abrir a folha (a rotina é dela)")
        t.pg.wait_for_timeout(1500)
        o.ok(not gravacoes_ao_abrir(t) and leituras(t, "aluno_rotinas") >= 1,
             f"P1 ao abrir: 0 gravação ({gravacoes_ao_abrir(t) or '—'}); `ler` q=aluno_rotinas {leituras(t, 'aluno_rotinas')}")
        R.print(t, "p_resumo_rotinas")
        if so_ler:
            return
        # P2 — "Nova rotina" pela folha da P3 no modo do profissional
        t.clicar("[data-rotinas-nova]")
        ok = t.esperar(lambda: t.tem('[data-folha-rotina="nova"][data-folha-modo="profissional"]'), 15)
        t.pg.locator("[data-rotina-nome]").fill(f"{e['marca']} Água 2 L")
        t.pg.get_by_role("radio", name="Hábito").click()
        t.pg.locator("[data-rotina-horario]").fill("10:00")
        t.clicar('[data-rotina-atalho="todos"]')
        R.print(t, "p_nova_rotina")
        t.zerar_pedidos()
        t.clicar("[data-rotina-salvar]")
        ok = ok and t.esperar(lambda: not t.tem('[data-folha-rotina="nova"]'), 20) and t.esperar(lambda: rotina(e, "Água 2 L") is not None, 20, 1)
        r = rotina(e, "Água 2 L") or {}
        n = t.contar("fn", "aluno-dia", lambda p: p["acao"] == "prof_rotina_salvar")
        o.ok(ok and n == 1 and r.get("origem") == "profissional" and r.get("paciente_id") == e["pac_a"] and r.get("criada_por") == e["personal"],
             f"P2 a Água pela folha do profissional: 1 prof_rotina_salvar ({n}); no banco: {({k: r.get(k) for k in ('origem', 'horario')})}, na matrícula A, criada pelo personal")
        o.ok(avisos_rotina_hoje(e) >= 1, f"P2 o aviso 'Seu profissional criou uma rotina para você' no sino da aluna (hoje: {avisos_rotina_hoje(e)})")
        if r.get("id"):
            R.ids["agua"] = r["id"]
        agua = f'[data-card-rotinas] [data-rotina-painel="{r.get("id")}"]'
        ok = t.esperar(lambda: t.tem(agua), 20)
        o.ok(ok and (t.attr(agua, "data-rotina-editavel") or [""])[0] == "1" and "do aluno" not in t.texto(f"{agua} [data-rotina-painel-selo]"),
             "P2 a Água no card, com o selo de quem criou e editável (a do profissional desta matrícula)")
        # P3 — mudar pelo card: 10:00 → 11:00
        t.clicar(f'[data-rotina-painel-abrir="{r.get("id")}"]')
        t.esperar(lambda: t.tem('[data-folha-rotina="mudar"][data-folha-modo="profissional"]'), 15)
        t.pg.locator("[data-rotina-horario]").fill("11:00")
        t.clicar("[data-rotina-salvar]")
        ok = t.esperar(lambda: (rotina(e, "Água 2 L") or {}).get("horario") == "11:00", 20, 1)
        hist = [h["o_que"] + ":" + h["quem"] for h in (rotina(e, "Água 2 L") or {}).get("historico") or []]
        o.ok(ok and hist == ["criou:profissional", "mudou:profissional"], f"P3 mudar 10:00 → 11:00 pelo card: no banco o horário e o histórico {hist}")
    finally:
        t.fim()


def caso_sino_e_app(o, nav, R: Rodada) -> None:
    """P4: a aluna (o app, 390 px): o sino com o aviso e a página de rotinas com a Água e o selo."""
    agua = R.ids.get("agua")
    t = R.tela(nav, "sino", desktop=False)
    try:
        t.entrar(R.L, "w5p-aluna", "/")
        t.caso.fechar_avisos()
        ok = t.esperar(lambda: t.tem("[data-sino]"), 60)
        if ok:
            t.clicar("[data-sino]")
        ok = ok and t.esperar(lambda: TITULO_ROTINA in t.texto("[data-sino-lista]"), 30)
        o.ok(ok, "P4 o sino da aluna: 'Seu profissional criou uma rotina para você'")
        R.print(t, "p_sino_aluno")
        t.ir("/perfil/rotinas")
        linha = f'[data-rotina-linha="{agua}"]'
        ok = t.esperar(lambda: t.tem(linha), 45)
        o.ok(ok and t.n(f"{linha} [data-rotina-selo]") == 1, "P4 a Água aparece no app (/perfil/rotinas) com o selo 'do seu profissional'")
    finally:
        t.fim()


def caso_apagada_e_historico(o, nav, R: Rodada) -> None:
    """P5 + P6: a aluna apaga a Água (P8b, pela função); o card e o 'Ver tudo' (a apagada e o histórico)."""
    e = R.e
    agua = R.ids.get("agua")
    st, r = funcao("aluno-dia", R.L.token("w5p-aluna"), {"acao": "rotina_arquivar", "id": agua})
    rot = rotina(e, "Água 2 L") or {}
    o.ok(st == 200 and rot.get("arquivada") and rot.get("arquivada_por") == e["aluna"], f"P5 a aluna apaga a Água pela função (P8b): {st}; no banco arquivada por ela")
    t = R.tela(nav, "apagada")
    try:
        abrir_resumo(t, R, "w5p-personal", e["pac_a"], e["conta_a"])
        o.ok(not t.tem(f'[data-card-rotinas] [data-rotinas-hoje] [data-rotina-painel="{agua}"]'), "P5 o card não mostra mais a Água entre as de hoje")
        t.clicar("[data-rotinas-ver-tudo]")
        ok = t.esperar(lambda: t.tem(f'[data-rotina-apagada="{agua}"]'), 20)
        txt = t.texto(f'[data-rotina-apagada="{agua}"] [data-rotina-apagada-texto]')
        hoje_ddmm = f"{e['hoje'][8:10]}/{e['hoje'][5:7]}"
        o.ok(ok and txt == f"apagada pelo aluno em {hoje_ddmm}", f"P5 o 'Ver tudo': {txt!r}")
        R.print(t, "p_apagada_pelo_aluno")
        eventos = t.attr(f'[data-rotinas-historico] [data-rotina-evento]', "data-rotina-evento")
        mudancas = [x.strip() for x in t.pg.locator("[data-rotina-evento-mudanca]").all_inner_texts()]
        o.ok(eventos[:3] == ["arquivou", "mudou", "criou"] and "horário 10:00 → 11:00" in mudancas,
             f"P6 o histórico (o mais novo em cima): {eventos[:3]}; {mudancas[:2]}")
        t.pg.eval_on_selector("[data-rotinas-historico]", "e => e.scrollIntoView({ block: 'center' })")
        R.print(t, "p_historico")
    finally:
        t.fim()


def caso_outra_conta(o, nav, R: Rodada) -> None:
    """P7: o personal cria o Ômega 3 na conta A (pela função); o w13-dono na 2ª matrícula (conta B) não o vê nem o muda."""
    e = R.e
    st, r = funcao("aluno-dia", R.L.token("w5p-personal"), {"acao": "prof_rotina_salvar", "aluno": e["pac_a"],
                                                             "dados": {"nome": f"{e['marca']} Ômega 3", "tipo": "suplemento", "dias_semana": [1, 2, 3, 4, 5, 6, 7]}})
    omega = (r.get("rotina") or {}).get("id")
    o.ok(st == 200 and bool(omega), f"P7 o Ômega 3 do personal na conta A (pela função): {st}")
    b = B.Massa().segunda_matricula()
    tok = R.L.token("w13-dono")
    st1, r1 = funcao("aluno-dia", tok, {"acao": "prof_rotina_salvar", "aluno": b, "id": omega, "dados": {"horario": "07:00"}})
    st2, r2 = funcao("aluno-dia", tok, {"acao": "prof_rotina_arquivar", "aluno": b, "id": omega})
    o.ok((st1, r1.get("erro"), st2, r2.get("erro")) == (404, "nao_encontrado", 404, "nao_encontrado"),
         f"P7 a conta B não muda nem apaga a rotina da conta A: {st1} {r1.get('erro')} · {st2} {r2.get('erro')}")
    t = R.tela(nav, "conta-b")
    try:
        ok = abrir_resumo(t, R, "w13-dono", b, B.Massa().conta_do_dono("w13-dono"))
        cre = R.ids.get("creatina")
        o.ok(ok and t.tem(f'[data-rotina-painel="{cre}"]') and not t.tem(f'[data-rotina-painel="{omega}"]'),
             f"P7 a conta B vê a Creatina da aluna e NÃO vê o Ômega 3 da conta A ({estado_card(t)})")
        R.print(t, "p_rotinas_conta_b")
    finally:
        t.fim()


def semear_dia(o, R: Rodada, so_o_basico: bool = False) -> None:
    """P8 (a massa): a nutri libera; a aluna tira, põe, marca o ✓, cria a extra e põe na refeição temporária — que a nutri tira do plano."""
    e = R.e
    ok = mudar_dieta(R, "w5p-nutri", e["pac_a"], "mexer")
    o.ok(ok, f"P8 a nutri libera a Dieta da A (no banco: {nivel_dieta(e)})")
    tok = R.L.token("w5p-aluna")
    st1, r1 = funcao("aluno-dia", tok, {"acao": "dia_tirar", "dia": e["hoje"], "item": e["item1"]})
    st2, r2 = funcao("aluno-dia", tok, {"acao": "dia_adicionar", "dia": e["hoje"], "dados": {"refeicao_id": e["r1"], "alimento_id": e["arroz"], "quantidade_g": 150}})
    st3, _r3 = funcao("nutricao", tok, {"acao": "aluno_marcar_refeicao", "refeicao_id": e["r1"], "data": e["hoje"], "concluida": True})
    o.ok((st1, st2, st3) == (200, 200, 200), f"P8 a aluna tira o último item da 1ª refeição, põe 150 g de arroz nela e dá o ✓ ({st1} {st2} {st3})")
    R.ids["posto"] = (r2.get("item") or {}).get("id", "")
    if so_o_basico:
        return
    hora = dt.datetime.now(SP).strftime("%H:%M")
    st4, r4 = funcao("aluno-dia", tok, {"acao": "extra_salvar", "dados": {"dia": e["hoje"], "nome": f"{e['marca']} Lanche", "horario": hora, "ja_comi": True}})
    extra = (r4.get("extra") or {}).get("id")
    st5, _r5 = funcao("aluno-dia", tok, {"acao": "dia_adicionar", "dia": e["hoje"], "dados": {"extra_id": extra, "alimento_id": e["arroz"], "quantidade_g": 80}})
    o.ok(st4 == 200 and bool(extra) and st5 == 200, f"P8 a extra '<marca> Lanche' (Já comi) com 80 g de arroz ({st4} {st5})")
    R.ids["extra"] = extra or ""
    # o retrato: uma refeição TEMPORÁRIA no plano (marcada), ela põe nela, a "nutri" tira a refeição do plano (o SET NULL + o retrato da P1)
    ceia = str(uuid.uuid4())
    e["ceia"] = ceia
    R.guardar()
    B.escrever(f"insert into {S}.refeicoes (id, plano_id, nome, horario, ordem) values ({B.txt(ceia)}, {B.txt(e['plano'])}, {B.txt(e['marca'] + ' Ceia')}, '22:00', 99)")
    st6, _r6 = funcao("aluno-dia", tok, {"acao": "dia_adicionar", "dia": e["hoje"], "dados": {"refeicao_id": ceia, "alimento_id": e["arroz"], "quantidade_g": 50}})
    B.escrever(f"delete from {S}.refeicoes where id = {B.txt(ceia)} and nome like {B.txt(e['marca'] + '%')}")
    r = B.ler(f"""select count(*) as n from {S}.aluno_dia_itens where dono_user_id = {B.txt(e['aluna'])} and criado_em >= {B.txt(e['inicio'])}
                   and refeicao_id is null and extra_id is null and refeicao_nome = {B.txt(e['marca'] + ' Ceia')} and deleted_at is null""")[0]
    o.ok(st6 == 200 and int(r["n"]) == 1, f"P8 a refeição temporária: ela pôs ({st6}); a nutri a tirou do plano → o item ficou com o retrato ({r['n']})")


def caso_dia_a_dia(o, nav, R: Rodada, so_ler: bool = False) -> None:
    """P8 (a tela) + P9: a nutri abre Dieta › Dia a dia; trava a Dieta e a faixa aparece."""
    e = R.e
    t = R.tela(nav, "dia-a-dia")
    try:
        ok = abrir_dia_a_dia(t, R, "w5p-nutri")
        estado = (t.attr("[data-dia-a-dia]", "data-dia-a-dia") or [""])[0]
        conteudo = (t.attr("[data-dia-a-dia-conteudo]", "data-dia-a-dia-conteudo") or [""])[0]
        o.ok(ok and estado == "pronto" and conteudo == e["hoje"], f"P8 a nutri abre Dieta › Dia a dia: {estado}, o dia {conteudo} (hoje)")
        r1 = f'[data-dia-refeicao="{e["r1"]}"]'
        o.ok((t.attr(r1, "data-dia-refeicao-feita") or [""])[0] == "1"
             and (t.attr(f'{r1} [data-dia-item="{e["item1"]}"]', "data-dia-item-tirado") or [""])[0] == "1"
             and t.tem(f'{r1} [data-dia-posto="{R.ids.get("posto")}"]'),
             "P8 a 1ª refeição com o ✓, o item que ela tirou riscado e o arroz 'pelo aluno'")
        if not so_ler:
            o.ok((t.attr(f'[data-dia-extra="{R.ids.get("extra")}"]', "data-dia-extra-feita") or [""])[0] == "1"
                 and t.n(f'[data-dia-extra="{R.ids.get("extra")}"] [data-dia-posto]') == 1, "P8 a extra com 'Já comi' e o arroz dela")
            fora = f'[data-dia-fora="{e["marca"]} Ceia"]'
            o.ok(t.tem(fora) and t.texto(f"{fora} [data-dia-fora-selo]") == "refeição tirada do plano",
                 "P8 o retrato: a 'Ceia' que a nutri tirou do plano com 'refeição tirada do plano'")
        cre = R.ids.get("creatina")
        o.ok((t.attr(f'[data-dia-rotinas] [data-rotina-painel="{cre}"]', "data-rotina-feita") or [""])[0] == "1", "P8 as rotinas do dia: a Creatina feita")
        kc = [int(x or 0) for x in (t.attr("[data-dia-a-dia-total]", "data-kcal-comido") + t.attr("[data-dia-a-dia-total]", "data-kcal-plano"))]
        o.ok(len(kc) == 2 and kc[0] > 0 and kc[1] > 0, f"P8 o total comido × plano do dia: {kc[0] if kc else '?'} de {kc[1] if len(kc) > 1 else '?'} kcal")
        o.ok(not t.tem("[data-dia-a-dia-travada]") and not gravacoes_ao_abrir(t) and leituras(t, "aluno_dia") >= 1,
             f"P8 liberada (sem a faixa); ao abrir: 0 gravação ({gravacoes_ao_abrir(t) or '—'}), `ler` q=aluno_dia {leituras(t, 'aluno_dia')}")
        R.print(t, "p_dia_a_dia")
        if so_ler:
            return
        # P9 — a nutri trava: a faixa e o que ela registrou continua
        ok = mudar_dieta(R, "w5p-nutri", e["pac_a"], "ver")
        t.ir(f"/painel/alunos/{e['pac_a']}/dieta?secao=dia-a-dia")
        ok = ok and t.esperar(lambda: t.tem("[data-dia-a-dia-travada]"), 45)
        o.ok(ok and t.texto("[data-dia-a-dia-travada]") == TRAVADA and t.tem(f'[data-dia-posto="{R.ids.get("posto")}"]'),
             f"P9 travada: a faixa {t.texto('[data-dia-a-dia-travada]')!r} e o que ela registrou continua (§2.2-12)")
        t.pg.eval_on_selector("[data-dia-a-dia]", "e => e.scrollIntoView({ block: 'start' })")
        R.print(t, "p_dia_a_dia_travada")
    finally:
        t.fim()


def devolver_papeis() -> None:
    """Os papéis que a Massa trocou voltam JÁ (o resto da Massa — as matrículas — fica para o fim; o molde do telas_acessos.py da P4)."""
    m = B.Massa()
    for x in m.estado["papeis"]:
        lista = "array[" + ", ".join(B.txt(p) for p in x["antes"]) + "]::text[]"
        B.escrever(f"update {S}.conta_membros set papeis = {lista} where id = {B.txt(x['id'])}")
    m.estado["papeis"] = []
    m._guardar()  # noqa: SLF001


def caso_personal(o, nav, R: Rodada) -> None:
    """P10: o personal SÓ personal (a Massa tira o papel 'dono' do w5p-personal durante o caso — ele é dono e personal da conta A; o 'só o plano'
    da ficha é de quem é só personal; a volta vai ao estado ANTES): o Dia a dia embaixo da adesão, só para ler (Q1)."""
    e = R.e
    B.Massa().trocar_papeis("w5p-personal", "w5p-personal", ["personal"])
    t = R.tela(nav, "personal")
    try:
        ok = abrir_dia_a_dia(t, R, "w5p-personal", "")
        acesso = (t.attr("[data-aba-dieta-aluno]", "data-acesso-dieta") or [""])[0]
        ordem = t.pg.evaluate("""() => { const a = document.querySelector('[data-card="concluidas"]'), d = document.querySelector('[data-dia-a-dia]');
                                    return !!a && !!d && !!(a.compareDocumentPosition(d) & Node.DOCUMENT_POSITION_FOLLOWING); }""")
        o.ok(ok and acesso == "so-plano" and ordem, f"P10 o personal ({acesso}): o Dia a dia embaixo da adesão")
        o.ok(t.tem(f'[data-dia-posto="{R.ids.get("posto")}"]') and t.n("[data-secao-dieta-botao]") == 0,
             "P10 o mesmo dia (o arroz que ela pôs), sem as seções da nutri")
        t.pg.wait_for_timeout(1500)
        o.ok(not gravacoes_ao_abrir(t), f"P10 ao abrir: 0 gravação ({gravacoes_ao_abrir(t) or '—'})")
        R.print(t, "p_dia_a_dia_personal")
    finally:
        t.fim()
        devolver_papeis()


def caso_sem_login(o, nav, R: Rodada) -> None:
    e = R.e
    t = R.tela(nav, "sem-login")
    try:
        ok = abrir_resumo(t, R, "w5p-personal", e["sem_login"], e["conta_a"])
        o.ok(ok and estado_card(t) == "sem-login" and t.texto("[data-rotinas-sem-login]") == SEM_LOGIN and t.tem("[data-rotinas-acessos]")
             and not t.tem("[data-rotinas-nova]"), f"P11 sem login: {t.texto('[data-rotinas-sem-login]')!r} e o atalho para a aba Acessos")
        R.print(t, "p_rotinas_sem_login")
    finally:
        t.fim()


JS_LARGURA = "() => [document.documentElement.scrollWidth, window.innerWidth]"


def caso_celular(o, nav, R: Rodada) -> None:
    """P12: 390 px — o card do personal e o Dia a dia da nutri (cada um no seu contexto: a sessão entra antes do 1º documento)."""
    e = R.e
    t = R.tela(nav, "celular-card", desktop=False)
    try:
        ok = abrir_resumo(t, R, "w5p-personal", e["pac_a"], e["conta_a"])
        l1 = t.pg.evaluate(JS_LARGURA)
        R.print(t, "p_resumo_rotinas_celular")
    finally:
        t.fim()
    t = R.tela(nav, "celular-dia", desktop=False)
    try:
        ok2 = abrir_dia_a_dia(t, R, "w5p-nutri")
        l2 = t.pg.evaluate(JS_LARGURA)
        o.ok(ok and ok2 and l1[0] <= l1[1] + 1 and l2[0] <= l2[1] + 1, f"P12 390 px: o card ({l1[0]} × {l1[1]}) e o Dia a dia ({l2[0]} × {l2[1]}) cabem na tela")
        R.print(t, "p_dia_a_dia_celular")
    finally:
        t.fim()


def caso_prod(o, nav, R: Rodada) -> None:
    """PRODUÇÃO, SÓ LEITURA: a conta de teste 'master' do Calc no aluno da conta 'Admin Teste' (o mesmo do telas_acessos.py), com a Guarda."""
    aluno = B.ler("""select coalesce(p.treino_user_id, p.id)::text as rota from public.pacientes p join public.contas c on c.id = p.conta_id
                      where c.dono_id = (select id from auth.users where email = 'admin.teste.claude@physiqcalc.app')
                        and p.deleted_at is null order by p.created_at limit 1""")
    if not o.ok(bool(aluno), "P0 produção: a conta de teste tem 1 aluno para abrir"):
        return
    rota = aluno[0]["rota"]
    guarda = B.Guarda()
    t = R.tela(nav, "prod", guarda=guarda)
    try:
        t.entrar(R.L, "master", f"/painel/alunos/{rota}")
        t.caso.fechar_avisos()
        ok = t.esperar(lambda: estado_card(t) not in ("", "carregando"), 90)
        t.pg.wait_for_timeout(2500)
        o.ok(ok and estado_card(t) != "erro" and leituras(t, "aluno_rotinas") >= 1 and not gravacoes_ao_abrir(t),
             f"P1 produção: o Resumo abre com o card Rotinas ({estado_card(t)}), só `ler` na aluno-dia ({leituras(t, 'aluno_rotinas')}); 0 gravação")
        if ok:
            t.pg.eval_on_selector("[data-card-rotinas]", "e => e.scrollIntoView({ block: 'center' })")
        R.print(t, "prod_p_resumo_rotinas")
        outras = [b for b in guarda.bloqueadas if b not in BARRADAS_ACEITAS]
        o.ok(not outras, f"P2 produção: nenhuma gravação tentada fora das conhecidas ({sorted(set(guarda.bloqueadas)) or '—'})")
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
    prefixo = f"{a.base}{'-loja' if a.loja else ''}"
    o = C.Saida(f"telas_painel_{prefixo}")
    base = BASES[a.base]
    o.linha(f"base {base} · {'build da loja' if a.loja else 'build do site'} · canal {a.canal}")
    B.exigir_saude("as telas do painel (rotinas e dia a dia)")
    agora = dt.datetime.now(SP)
    if agora.hour == 23 and agora.minute >= 30:
        raise SystemExit("perto da meia-noite de SP (o dia de hoje viraria no meio da rodada): rode depois das 00:05 — nada foi gravado")
    if ESTADO.exists() and json.loads(ESTADO.read_text(encoding="utf-8") or "{}"):
        raise SystemExit(f"há massa de uma rodada anterior no estado ({ESTADO}): rode --limpar antes — nada foi gravado")
    f = foto()
    R = Rodada(o, base, prefixo)
    R.pre = "loja_" if a.loja else ""
    R.e = {**f, "marca": f"{B.MARCA} P6 {time.strftime('%H%M%S')}", "inicio": dt.datetime.now(dt.timezone.utc).isoformat()}
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
                semear_rotina_da_aluna(o, R)
                if a.loja:
                    semear_dia(o, R, so_o_basico=True)
                    for fn, args in ((caso_resumo_e_nova, (True,)), (caso_dia_a_dia, (True,)), (caso_personal, ())):
                        B.exigir_saude(fn.__name__)
                        rodar(fn, *args)
                else:
                    for fn in (caso_resumo_e_nova, caso_sino_e_app, caso_apagada_e_historico, caso_outra_conta):
                        B.exigir_saude(fn.__name__)
                        rodar(fn)
                    semear_dia(o, R)
                    R.e["sem_login"] = massa_sem_login(R)
                    R.guardar()
                    for fn in (caso_dia_a_dia, caso_personal, caso_sem_login, caso_celular):
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
    o = C.Saida("telas_painel_prod")
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
