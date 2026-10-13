#!/usr/bin/env python3
"""Physiq hml-21a (H-43 · jeito 2, etapa 3, 12/10/2026) — os casos de SERVIDOR da função NOVA `conta`: a casca (--area casca: o sino, o
aviso de membro removido, a situação, o aviso de mudança, a senha provisória, o push, o aceite e o onboarding) e o app do aluno (--area app:
o Perfil, a Agenda, o Meu plano, os pratos prontos, o nome e a foto do perfil). Spec hml-21 §4; contrato da 21a, decisões B, C e I.

Contas (staging, só de TESTE): A = w5p-aluna (o app); N = w5p-nutri (cria a massa do sino pelos caminhos do app); O = w13-dono (OUTRA
conta: N1 — e o P do criar_minha_conta, o caminho idempotente de quem já é dono de conta: nada é criado); S = w7b-sozinho (o Meu plano do
aluno sem profissional — SÓ se existir no staging: SQL só leitura, só contagem; senão o caso fica no Vitest, anotado na saída). No máximo 6
logins na etapa 2 (o registro: hml21/agente/logins_etapa2_21a.txt); as sessões ficam para os outros scripts e saem no --sair.
A massa (decisão I): os avisos não lidos do sino da aluna pelos CAMINHOS DO APP (a w5p-nutri: nutricao › avaliacao_avisar e a RPC
aluno_avisar_plano ['dieta'] — a trava de 10 min por título dá 2 por rodada; o sqlrw.py não aceita insert), com a marca "hml21 e2e
<rodada>" no título (o UPDATE do sqlrw.py, só no staging), os ids no Estado e o DELETE no fim (ou no --limpar), conferido por SQL só leitura,
só contagem. A foto da aluna: guardada antes (o bucket é público) e devolvida no fim pelo caminho novo (ou tirada, se ela não tinha). O
push: registra e esquece um token de TESTE (antes da massa: um aviso novo com aparelho registrado dispararia o push-enviar).
  P   cada consulta = as MESMAS linhas que o SQL FIXO da lib do 53f2583 rodado COMO A PESSOA (B.SQL_DA_LIB, com a origem); cada ação faz o
      MESMO de hoje: avisos_marcar_lidos/aviso_membro_ok mudam SÓ o lido_em dos avisos da massa (SQL); push_registrar → 1 aparelho com o
      token de teste, push_esquecer → 0; aceitar_textos com uma versão que não é a vigente → versao_desatualizada (nada gravado);
      criar_minha_conta (a w13-dono) → ja_existia/ja_tem_conta (0 conta nova); entrar_sem_profissional (a aluna, que tem profissional) →
      com_profissional/atualize_o_app/nascimento_invalido (0 matrícula nova); mudar_objetivo_app (a aluna) → sem_matricula_app; perfil_nome
      com o MESMO nome; a foto: preparar → PUT no link → salvar (a URL pública = a do getPublicUrl, a anterior da pasta saiu do bucket) → a
      de antes devolvida
  N1  outra conta (w13-dono): o sino e a foto dela (nunca uma linha da aluna); marcar os avisos da aluna → 0 marcado (SQL: seguem não
      lidos); o "Entendi" no aviso da aluna → nao_encontrado; esquecer o token da aluna → 0 apagado; salvar a foto na pasta da aluna → N8
  N2  sem login → 401 (o `ler` e uma ação) · N3 q desconhecida → o item consulta_invalida; ação desconhecida → 400 acao_invalida
  N4  destino_user_id/user_id/id no corpo → ignorados (o dono é quem chama) · N5 chave fora da lista (dados_profissionais, email, foto_url
      no perfil_nome; select/colunas no `ler`) → cai (só o nome muda; a resposta é a mesma)
  N6  x-schema inválido → 400 schema_invalido · N7 origem fora da lista → o CORS padrão (https://physiqcalc.com.br)
  N8  o caminho da foto fora da pasta de quem chama (outra pessoa, ../, subpasta, outro nome) → dados_invalidos (nada gravado)
  N9  lote de 17 → 400 lote_grande · N11 a aluna pede uma consulta do PAINEL de OUTRA função pela conta → consulta_invalida (as da
      Agenda e dos Alunos são da 21b: o N11 dela, pelo RLS)
Produção (--base prod --so-leitura) e o smoke logo depois de publicar (--base staging --so-leitura): OPTIONS (o CORS), sem login → 401,
x-schema inválido → 400 e a q desconhecida → consulta_invalida (o `ler` sem banco) — nada grava; 1 login (a conta de teste).
Antes de CADA execução que toca o staging: ~/projetos/physiqcalc-scratch/hml/hml19/ferramentas/pausa.sh "<o que ia rodar>".
Uso: python3 e2e/hml21/api.py --area casca|app|agenda|alunos [--base local|staging|prod] [--casos P,N1,…] [--seco | --limpar | --so-leitura | --sair]
  --seco  sem rede: cada corpo desta rodada passa (ou é recusado como deve) pelo leitor REAL do servidor (o TS, pelo node); o SQL da lib
          de cada consulta existe com a origem; a Guarda dos E2E trata o `ler` da conta como leitura e as ações como gravação
Da saída só saem status, códigos, contagens e tempos.
hml-21b (13/10/2026 — contrato da 21b, decisões E, I e N), --area agenda|alunos (e2e/hml21/painel21b.py: as contas, a massa e a limpeza):
  P   cada consulta da Agenda (13) e dos Alunos (6) = o SQL FIXO da lib do d357719 COMO A PESSOA (a nutri w5p-nutri com a conta ativa que o
      app escolhe; a aluna nas da Agenda do aluno; as listas com empate na ordem como conjunto); cada ação faz o MESMO de hoje, na massa de
      TESTE (a marca "hml21 e2e <rodada>"; os ids no Estado, chave hml21b): o 1º acesso idempotente (agenda_garantir/tags_garantir só com
      calendário e as 3 tags base — senão PADRÃO: criaria; a criação é a prova do Postgres local), o calendário (criar/editar/excluir pela RPC
      nova — a consulta viva e o calendário na Lixeira com o MESMO instante), a tag, a consulta sem aluno, o bloqueio, a trava, as regras (o
      MESMO valor), a Agenda do aluno numa consulta de teste com a matrícula dela (os horários, confirmar/reagendar/desistir; o marcar só sem
      pacote — sem_pacote; os avisos da agenda anotados e apagados; sem WhatsApp conectado) e o pacote (o MESMO pacote ativo ou o total 0;
      o total_invalido)
  N1  outra conta (w13-dono): não edita/exclui o calendário nem a tag da nutri (404 nao_encontrado; a RPC volta inteira), não confirma a
      consulta da aluna, não define o pacote, e não lê a agenda nem os alunos da conta da nutri · N2 · N3 · N4/N5 (o dono e as colunas de
      fora no corpo CAEM: o dono vem do token ou do calendário) · N6 · N7 · N9 · N11 a aluna pede o painel (as consultas da 21b com a conta
      da nutri) → nada (o RLS e as RPCs)
  --limpar  a massa da 21b (o Estado + o que tem a marca dos donos de teste, inclusive na Lixeira) e os avisos anotados
  --so-leitura  a MESMA conta das áreas da 21a (a aluno-calc na produção; a w5p-aluna no staging — 1 login por base) + o `ler` novo
                (minhas_regras_agenda → ok: a conta v2 publicada; a v1 responderia consulta_invalida)
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
import time
import uuid
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import _base as B  # noqa: E402
import painel21b as P21  # noqa: E402  (hml-21b: as contas, a massa e a limpeza da Agenda e dos Alunos)

C = B.C
CASOS = ("P", "N1", "N2", "N3", "N4", "N5", "N6", "N7", "N8", "N9", "N11")
FALSO = "00000000-0000-4000-8000-0000000000aa"
OUTRO = "44444444-4444-4444-8444-444444444444"
CONSULTAS = {
    "casca": ("avisos", "aviso_membro_removido", "situacao"),
    "app": ("meu_perfil_aluno", "minha_agenda", "minha_agenda_lista", "meu_plano_app", "pratos_prontos_do_app", "perfil_foto"),
    # hml-21b: a Agenda (do painel e do aluno) e os Alunos (a lista, o seletor, a Busca, o número do menu, os convites, os pendentes, os
    # novos por mês e a equipe)
    "agenda": ("agenda_calendarios", "agenda_tags", "agenda_agendamentos", "agenda_bloqueios", "agenda_bloqueios_futuros", "agenda_travas",
               "agenda_regras", "agenda_horarios", "agenda_alunos", "agenda_aluno", "aluno_compromissos", "minhas_regras_agenda",
               "aluno_agenda_horarios"),
    "alunos": ("alunos_da_conta", "aluno_do_seletor", "aluno_convites", "alunos_pendentes", "alunos_novos_por_mes", "equipe_da_conta"),
}
ACOES = {
    "casca": ("avisos_marcar_lidos", "aviso_membro_ok", "aviso_mudanca_marcar", "senha_definida", "push_registrar", "push_esquecer",
              "aceitar_textos", "criar_minha_conta", "entrar_sem_profissional"),
    "app": ("perfil_nome", "perfil_foto_preparar", "perfil_foto_salvar", "perfil_foto_tirar", "mudar_objetivo_app"),
    "agenda": ("agenda_garantir", "tags_garantir", "calendario_criar", "calendario_editar", "calendario_excluir", "tag_criar", "tag_editar",
               "tag_excluir", "agendamento_criar", "agendamento_editar", "agendamento_excluir", "bloqueio_criar", "bloqueio_excluir", "trava_criar",
               "trava_excluir", "regras_salvar", "agenda_confirmar", "agenda_desistir", "agenda_reagendar", "agenda_marcar"),
    "alunos": ("pacote_definir",),
}
AREAS = ("casca", "app", "agenda", "alunos")
# as consultas do PAINEL de OUTRAS funções (a nutricao, a financeiro): pela conta, consulta_invalida (N11 da 21a). hml-21b (PADRÃO, regra da
# sessão principal 03:25 — o esperado da 21a não muda: consulta de fora do catálogo → consulta_invalida): saíram daqui as 2 que a 21b pôs
# no catálogo da conta (alunos_da_conta, agenda_agendamentos — o N11 da 21b: a aluna as pede e o RLS não deixa nada) e entraram 2 de
# outras funções (fin_lancamentos da financeiro, planos_do_aluno da nutricao)
DO_PAINEL = ("fin_lancamentos", "planos_do_aluno", "fin_categorias", "aluno_dieta", "perfil_profissional")
VERSAO_ERRADA = "hml21-versao-que-nao-existe"


def agora_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def inicio_da_agenda() -> str:
    """O inicioDaAgenda da tela (src/app-aluno/perfil/pecas/regras.ts:148): agora − 90 dias, em ISO (o toISOString)."""
    return (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=90)).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def token_de_teste(rodada: str) -> str:
    """Um token de push de TESTE (o formato que a push_registrar aceita: 20–4096 de [A-Za-z0-9_:.-]) — nunca um token de aparelho."""
    return f"hml21-e2e-{rodada}-{uuid.uuid4().hex}"


# ───────────────────────── os pedidos (puros: o --seco confere todos contra o servidor) ─────────────────────────
def pedidos_ler(area: str, desde: str) -> list[dict]:
    """Os corpos `ler` da rodada (P e os N) — o --seco passa cada um pelo leitor do servidor."""
    if area == "casca":
        ok = [B.item("avisos"), B.item("aviso_membro_removido", tipo="membro_removido"), B.item("situacao")]
        n45 = [B.item("avisos", destino_user_id=OUTRO, user_id=OUTRO, select="*", colunas="*"),
               B.item("aviso_membro_removido", tipo="membro_removido", destino_user_id=OUTRO, lido_em="2000-01-01")]
        ruins = [B.item("aviso_membro_removido", tipo="geral"), B.item("aviso_membro_removido")]
    else:
        ok = [B.item("meu_perfil_aluno"), B.item("minha_agenda", desde=desde), B.item("minha_agenda_lista", tipo="proximas", offset=0, limite=20),
              B.item("meu_plano_app"), B.item("pratos_prontos_do_app"), B.item("perfil_foto")]
        n45 = [B.item("perfil_foto", id=OUTRO, select="dados_profissionais"), B.item("meu_perfil_aluno", p_uid=OUTRO, user_id=OUTRO),
               B.item("minha_agenda", desde=desde, p_desde="1900-01-01T00:00:00.000Z", paciente_id=OUTRO)]
        ruins = [B.item("minha_agenda", desde="ontem"), B.item("minha_agenda_lista", tipo="proximas", offset=-1, limite=20),
                 B.item("minha_agenda_lista", tipo="proximas", offset=0, limite=101)]
    return [
        {"acao": "ler", "itens": ok},
        {"acao": "ler", "itens": [ok[0], B.item("conta_inteira"), B.item("avisos_de_todo_mundo")]},  # N3
        {"acao": "ler", "itens": n45},  # N4/N5
        {"acao": "ler", "itens": ruins},  # o param fora da forma
        {"acao": "ler", "itens": [ok[0]] * 17},  # N9
        {"acao": "ler", "itens": [B.item(q) for q in DO_PAINEL]},  # N11
    ]


def pedidos_acoes(area: str, uid: str, rodada: str) -> list[tuple[str, dict, bool]]:
    """As ações da rodada: (ação, corpo, o servidor aceita?) — o --seco confere cada uma no lerCorpoDaAcao do servidor."""
    tok = token_de_teste(rodada)
    if area == "casca":
        return [
            ("avisos_marcar_lidos", {"ids": [FALSO]}, True),
            ("avisos_marcar_lidos", {"ids": [FALSO], "destino_user_id": OUTRO, "user_id": OUTRO, "lido_em": "2000-01-01"}, True),  # N4/N5
            ("avisos_marcar_lidos", {"ids": []}, False),
            ("avisos_marcar_lidos", {"ids": [str(uuid.UUID(int=i)) for i in range(31)]}, False),
            ("aviso_membro_ok", {"id": FALSO, "destino_user_id": OUTRO}, True),
            ("aviso_membro_ok", {"id": "nao-uuid"}, False),
            ("aviso_mudanca_marcar", {"versao": "1"}, True),
            ("senha_definida", {"user_id": OUTRO}, True),
            ("push_registrar", {"token": tok, "plataforma": "android", "versao": None}, True),
            ("push_registrar", {}, False),
            ("push_esquecer", {"token": tok}, True),
            ("aceitar_textos", {"versao": VERSAO_ERRADA, "origem": "site", "saude": False, "nascimento": None, "versao_app": None}, True),
            ("aceitar_textos", {"versao": "1", "origem": "site", "nascimento": "2026-02-31"}, False),
            ("criar_minha_conta", {"nome": "Conta de teste", "tipo": "personal", "registro": None, "dono_id": OUTRO}, True),
            ("entrar_sem_profissional", {"objetivo": "manter", "plano": "treino"}, True),
            ("entrar_sem_profissional", {"objetivo": "manter", "plano": "treino", "nascimento": "1899-12-31", "consentimento": "x", "origem": "site"}, True),
            ("entrar_sem_profissional", {"objetivo": "manter", "plano": "treino", "nascimento": "1990-05-20"}, True),  # o servidor recusa depois (extras pela metade)
        ]
    pasta = f"{uid}/foto-1760000000000.png"
    return [
        ("perfil_nome", {"nome": "Aluna", "dados_profissionais": {"foto_url": "x"}, "email": "x@y", "id": OUTRO}, True),  # N4/N5
        ("perfil_nome", {}, False),
        ("perfil_foto_preparar", {"tipo": "image/png", "tamanho": 1234}, True),
        ("perfil_foto_preparar", {"tipo": "image/gif", "tamanho": 1234}, False),
        ("perfil_foto_preparar", {"tipo": "image/png", "tamanho": 5 * 1024 * 1024 + 1}, False),
        ("perfil_foto_salvar", {"caminho": pasta}, True),
        ("perfil_foto_salvar", {"caminho": f"{OUTRO}/foto-1.png"}, True),  # aceito na forma; o servidor recusa a pasta (N8: dados_invalidos)
        ("perfil_foto_tirar", {"foto_url": "x"}, True),
        ("mudar_objetivo_app", {"objetivo": "manter"}, True),
        ("mudar_objetivo_app", {}, False),
    ]


# ───────────────────────── o --seco ─────────────────────────
def seco(o, area: str) -> None:
    desde = inicio_da_agenda()
    uid = "33333333-3333-4333-8333-333333333333"
    rodada = "seco"
    lers = pedidos_ler(area, desde)
    acoes = pedidos_acoes(area, uid, rodada)
    caminhos = [[f"{uid}/foto-1760000000000.png", uid], [f"{OUTRO}/foto-1.png", uid], [f"{uid}/../{OUTRO}/foto-1.png", uid],
                [f"{uid}/sub/foto-1.png", uid], [f"{uid}/foto-1.gif", uid]]
    anteriores = [[f"{B.URL_API_PROPRIA}/storage/v1/object/public/fotos-perfil-staging/{uid}/foto-17.png", "fotos-perfil-staging", uid],
                  [f"https://hkxvtsbwctxkrqzkkdoz.supabase.co/storage/v1/object/public/fotos-perfil-staging/{uid}/foto-18.jpg", "fotos-perfil-staging", uid],
                  [f"{B.URL_API_PROPRIA}/storage/v1/object/public/fotos-perfil/{uid}/foto-17.png", "fotos-perfil-staging", uid],
                  [f"{B.URL_API_PROPRIA}/storage/v1/object/public/fotos-perfil-staging/{OUTRO}/foto-17.png", "fotos-perfil-staging", uid],
                  [f"{B.URL_API_PROPRIA}/storage/v1/object/public/fotos-perfil-staging/{uid}/sub/foto-17.png", "fotos-perfil-staging", uid],
                  ["https://lh3.googleusercontent.com/a/foto", "fotos-perfil-staging", uid], ["", "fotos-perfil-staging", uid],
                  [f"{B.URL_API_PROPRIA}/storage/v1/object/public/fotos-perfil-staging/{uid}/foto%2017.jpg", "fotos-perfil-staging", uid]]
    urls = [["fotos-perfil-staging", f"{uid}/foto-1760000000000.png"], ["fotos-perfil", f"{uid}/foto-1.webp"]]
    r = B.regras_conta(lers + [{**c, "acao": a} for a, c, _ok in acoes], caminhos, anteriores, urls)
    cons = r["consultas"]
    o.ok(all(q in cons for q in CONSULTAS[area]), f"[seco] as {len(CONSULTAS[area])} consultas da área {area} estão no catálogo do servidor")
    o.ok(all(a in (r["casca"] if area == "casca" else r["app"]) for a in ACOES[area]), f"[seco] as {len(ACOES[area])} ações da área {area} estão na lista do servidor")
    o.ok(all(q in B.SQL_DA_LIB and B.SQL_DA_LIB[q][0].startswith("src/") for q in CONSULTAS[area]),
         "[seco] cada consulta tem o SQL FIXO da lib do 53f2583 (com a origem arquivo:linha) para o P")
    pl = r["pedidos"][: len(lers)]
    o.ok(pl[0].get("ok") is True and all(i.get("ok") for i in pl[0]["itens"]), "[seco] P: o lote da tela passa no leitor do servidor (cada item ok)")
    o.ok([i.get("erro") for i in pl[1]["itens"]] == [None, "consulta_invalida", "consulta_invalida"], "[seco] N3: a q desconhecida → consulta_invalida só nela")
    n45 = pl[2]["itens"]
    declarados = {q: set(cons[q]["params"]) for q in cons}
    o.ok(all(i.get("ok") and set(i["params"]) <= declarados[i["q"]] for i in n45),
         f"[seco] N4/N5: o dono/as colunas no corpo CAEM (só os params declarados chegam): {[sorted(i.get('params', {})) for i in n45]}")
    o.ok(all(i.get("erro") == "dados_invalidos" for i in pl[3]["itens"]), "[seco] o param fora da forma → dados_invalidos (nada roda)")
    o.ok(pl[4] == {"modulo": "leitura", "ok": False, "erro": "lote_grande"}, "[seco] N9: 17 itens → lote_grande")
    o.ok(all(i.get("erro") == "consulta_invalida" for i in pl[5]["itens"]), f"[seco] N11: as consultas do painel pela conta → consulta_invalida ({', '.join(DO_PAINEL)})")
    pa = r["pedidos"][len(lers):]
    certos = [(a, esperado, x) for (a, _c, esperado), x in zip(acoes, pa)]
    o.ok(all(x.get("modulo") == area and x.get("acao") == a for a, _e, x in certos), f"[seco] cada ação vai ao módulo {area} do servidor")
    o.ok(all(bool(x.get("ok")) == esperado for _a, esperado, x in certos),
         f"[seco] os corpos: os aceitos passam, os ruins → dados_invalidos ({[(a, x.get('campo')) for a, e, x in certos if not e]})")
    o.ok(all(set((x.get("valores") or {})) <= set(r["corpos"][a]) for a, e, x in certos if e),
         "[seco] N4/N5: as chaves fora da lista da ação CAEM (destino_user_id, user_id, dados_profissionais, email, id, lido_em…)")
    o.ok(r["caminhos"] == [True, False, False, False, False], f"[seco] N8: só o caminho da PRÓPRIA pasta no formato do preparar passa ({r['caminhos']})")
    o.ok(r["status"].get("sem_login") == 401 and r["status"].get("storage_falhou") == 502 and "dados_invalidos" not in r["status"],
         "[seco] os status da conta (401, 502; dados_invalidos = 400)")
    # a Guarda dos E2E: o `ler` da conta é leitura; as ações são gravação (decisão F); a w26 também
    lido = json.dumps({"acao": "ler", "itens": [{"q": "avisos"}]})
    o.ok(B.B17.funcao_grava("conta", "ler", lido) is False and all(B.B17.funcao_grava("conta", a, json.dumps({"acao": a})) for a in ACOES[area]),
         "[seco] a Guarda (hml17): o `ler` da conta passa; as ações dela são gravação")
    o.ok(r["foto"]["url_propria"] == "https://api-principal.physiqcalc.com.br" and r["foto"]["buckets"] == {"public": "fotos-perfil", "staging": "fotos-perfil-staging"},
         "[seco] a foto: a URL pública no domínio próprio e o bucket do ambiente")
    o.ok(B.sql_da_lib("minha_agenda", "staging", desde=desde).count("staging.minha_agenda(") == 1 and "order by" in B.sql_da_lib("avisos", "staging"),
         "[seco] o SQL da lib monta com o schema e os valores conferidos")
    o.ok(B.sem_relogio({"ok": True, "gerado_em": "x", "papel": {"agora": 1, "conta": 2}, "lista": [{"hoje": 1, "id": 3}]})
         == {"ok": True, "papel": {"conta": 2}, "lista": [{"id": 3}]},
         "[seco] o P compara fora das chaves do relógio do banco (o gerado_em da minha_situacao, o agora, o hoje) — em qualquer nível")
    # a foto: o E2E acha o caminho da foto anterior e monta a URL pública IGUAL ao servidor (o diferencial pelo TS)
    py_ant = [B.caminho_da_url(u, b, i) for u, b, i in anteriores]
    o.ok(py_ant == r["anteriores"] and py_ant[:2] == [f"{uid}/foto-17.png", f"{uid}/foto-18.jpg"] and py_ant[2:] == [None] * 6,
         f"[seco] a foto anterior: o caminho_da_url do E2E = o caminhoDaFotoAnterior do servidor ({py_ant})")
    o.ok([f"{B.URL_API_PROPRIA}/storage/v1/object/public/{b}/{c}" for b, c in urls] == r["urls"] and B.URL_API_PROPRIA == r["foto"]["url_propria"]
         and all(B.bucket_das_fotos(x) == r["foto"]["buckets"][x] for x in ("public", "staging")),
         "[seco] a URL pública e o bucket do ambiente: os do E2E = os do servidor")
    # as travas da escrita (nada sai: a recusa é antes do subprocesso)
    recusas = 0
    for sql in ("insert into staging.avisos (titulo) values ('x');", "delete from public.avisos where destino_user_id = 'x';",
                "update staging.avisos set lido_em = now();", "delete from staging.profiles where id = 'x';",
                "update staging.avisos set titulo = titulo || 'x' where true; delete from public.avisos where true;",
                "update staging.avisos set titulo = titulo || 'x' where true; delete from staging.profiles where true;"):
        try:
            B.sql_escrever_staging(sql)
        except SystemExit:
            recusas += 1
    try:
        B.sql_apagar_avisos("public", uid, [uid])
    except SystemExit:
        recusas += 1
    try:
        B.sql_marcar_avisos("public", uid, [uid], "x")
    except SystemExit:
        recusas += 1
    try:
        B.sql_desmarcar_lidos("public", uid, [uid])
    except SystemExit:
        recusas += 1
    o.ok(recusas == 9 and B.sql_apagar_avisos("staging", uid, [uid, "x"]).count("'") == 4
         and B.sql_marcar_avisos("staging", uid, [uid], "r1").startswith("update staging.avisos set titulo = titulo || ")
         and B.sql_desmarcar_lidos("staging", uid, [uid, "x"]).startswith("update staging.avisos set lido_em = null where destino_user_id = "),
         f"[seco] a escrita no staging: só o UPDATE da marca, o que devolve o não lido do sino de antes e o DELETE em staging.avisos, só os ids "
         f"da conta de teste, 1 instrução ({recusas}/9 recusadas)")
    # o LegalDesligado da 21a: a situação pelo `ler` da conta com o legal desligado e o aviso de mudança visto (só no item da situação)
    ped = {"acao": "ler", "itens": [{"q": "avisos"}, {"q": "situacao"}]}
    resp = {"ok": True, "itens": [{"ok": True, "linhas": [{"id": uid}]},
                                  {"ok": True, "valor": {"papel": "aluno", "legal": {"aceite_pendente": True}, "aviso_mudanca": {"versao": "1", "visto": False}}}]}
    v = B.tirar_legal_do_ler(ped, json.loads(json.dumps(resp)))["itens"]
    o.ok(v[0] == resp["itens"][0] and v[1]["valor"]["legal"]["aceite_pendente"] is False and v[1]["valor"]["aviso_mudanca"]["visto"] is True
         and v[1]["valor"]["papel"] == "aluno" and B.tirar_legal_do_ler({"acao": "perfil_nome"}, {"ok": True}) == {"ok": True},
         "[seco] o LegalDesligado da 21a: o item da situacao do `ler` com o aceite desligado e o aviso de mudança visto; o resto igual")
    o.ok("physiq_aviso_visto:" in B.JS_SEM_AVISO_VISTO and "removeItem" in B.JS_SEM_AVISO_VISTO,
         "[seco] a produção abre sem a marca local de aviso visto (o 🟡1: a sessão gravaria o aviso_mudanca_marcar sozinha)")
    o.ok(B.objetos("fotos-perfil-staging", ["../x", "nao-uuid/foto.png"]) == 0 and B.objetos("outro", [f"{uid}/foto-1.png"]) == 0,
         "[seco] a contagem dos arquivos só aceita <uuid>/<arquivo> nos 2 buckets das fotos (o resto nem vai ao banco)")


# ───────────────────────── a rodada (etapa 2) ─────────────────────────
def igual_ao_sql(o, rotulo: str, valor: object, sql_v: object) -> bool:
    return o.ok(B.canonico(B.sem_relogio(valor)) == B.canonico(B.sem_relogio(sql_v)), rotulo)


def p_leituras(o, L, area: str, s: str) -> None:
    """P: cada consulta = o SQL FIXO da lib rodado COMO A ALUNA (as linhas e o valor)."""
    tok, uid = L.token(B.ALUNA), L.uid(B.ALUNA)
    email = B.B5.CONTAS[B.ALUNA][0]
    desde = inicio_da_agenda()
    itens = [B.item("avisos"), B.item("aviso_membro_removido", tipo="membro_removido"), B.item("situacao")] if area == "casca" else [
        B.item("meu_perfil_aluno"), B.item("minha_agenda", desde=desde), B.item("minha_agenda_lista", tipo="proximas", offset=0, limite=20),
        B.item("meu_plano_app"), B.item("pratos_prontos_do_app"), B.item("perfil_foto")]
    st, r, _h, ms = B.ler(tok, itens)
    o.ok(st == 200 and len(B.itens_de(r)) == len(itens) and all(i.get("ok") for i in B.itens_de(r)),
         f"P: o lote da área {area} pela conta → 200, {len(itens)} itens ok ({ms} ms)")
    for it, resp in zip(itens, B.itens_de(r)):
        q = it["q"]
        sql = B.sql_da_lib(q, s, uid=uid, desde=desde) if q in ("perfil_foto", "minha_agenda") else B.sql_da_lib(q, s)
        v = (B.B20.ler_como(B.PRINCIPAL_REF, uid, sql, email) or [{}])[-1].get("v")
        obtido = resp.get("linhas") if q in B.LISTAS_DA_LIB else resp.get("valor")
        igual_ao_sql(o, f"P {q} = o SQL da lib ({B.SQL_DA_LIB[q][0]}) como a aluna", obtido, v)


def p_e_n1_casca(o, L, s: str, estado, rodada: str, casos: set) -> None:
    """P/N1 das ações da casca (a ordem importa: o push antes da massa; a massa → N1 → o P que marca)."""
    tok, uid = L.token(B.ALUNA), L.uid(B.ALUNA)
    # ── o push (antes da massa: o aviso novo com aparelho registrado dispararia o push-enviar)
    tk = token_de_teste(rodada)
    conta_tk = f"select count(*)::int as n from {s}.push_aparelhos where token = {C.txt(tk)} and user_id = {C.txt(uid)}"
    estado.d["hml21_push"] = tk  # anotado ANTES (o fechar_rodada esquece se a rodada cair no meio)
    estado.salvar()
    st, r, _h, _ms = B.conta(tok, "push_registrar", {"token": tk, "plataforma": "android", "versao": None})
    o.ok(st == 200 and (r.get("resultado") or {}).get("ok") is True and B.ler_principal(conta_tk)[0]["n"] == 1,
         f"P push_registrar → o aparelho de teste da aluna gravado (1) ({st})")
    if "N1" in casos:
        st, r, _h, _ms = B.conta(L.token(B.OUTRA), "push_esquecer", {"token": tk})
        o.ok(st == 200 and (r.get("resultado") or {}).get("apagados") == 0 and B.ler_principal(conta_tk)[0]["n"] == 1,
             f"N1 push_esquecer do token da aluna por OUTRA conta → 0 apagado; o aparelho segue ({st})")
    st, r, _h, _ms = B.conta(tok, "push_esquecer", {"token": tk})
    if o.ok(st == 200 and (r.get("resultado") or {}).get("apagados") == 1 and B.ler_principal(conta_tk)[0]["n"] == 0,
            f"P push_esquecer → o aparelho de teste saiu (1 apagado; 0 no banco) ({st})"):
        estado.d["hml21_push"] = None
        estado.salvar()
    # ── a massa do sino e o lido
    ids = B.criar_massa_avisos(o, estado, L, s, uid, rodada)
    lidos = lambda: B.ler_principal(f"select count(*) filter (where lido_em is not null)::int as n from {s}.avisos where id = any(array[{', '.join(C.txt(i) for i in ids)}]::uuid[])")[0]["n"]  # noqa: E731
    if ids and "N1" in casos:
        st, r, _h, _ms = B.conta(L.token(B.OUTRA), "avisos_marcar_lidos", {"ids": ids, "destino_user_id": uid})
        o.ok(st == 200 and r.get("marcados") == 0 and lidos() == 0, f"N1/N4 marcar os avisos da aluna por OUTRA conta → 0 marcado; seguem não lidos ({st})")
        st, r, _h, _ms = B.conta(L.token(B.OUTRA), "aviso_membro_ok", {"id": ids[0]})
        o.ok(st == 404 and r.get("erro") == "nao_encontrado" and lidos() == 0, f"N1 o 'Entendi' no aviso da aluna por OUTRA conta → 404 nao_encontrado ({st})")
    if ids:
        st, r, _h, _ms = B.conta(tok, "aviso_membro_ok", {"id": ids[0]})
        o.ok(st == 200 and lidos() == 1, f"P aviso_membro_ok → o lido_em só daquela linha ({st})")
        st, r, _h, _ms = B.conta(tok, "avisos_marcar_lidos", {"ids": ids})
        o.ok(st == 200 and r.get("marcados") == len(ids) and lidos() == len(ids), f"P avisos_marcar_lidos → {r.get('marcados')} marcado(s); todos lidos ({st})")
    # ── a sessão e a senha (sem mudança de estado: a aluna não tem a marca de senha provisória)
    st, r, _h, _ms = B.conta(tok, "senha_definida")
    o.ok(st == 200 and r.get("definida") is False, f"P senha_definida (a aluna sem a marca) → definida false, nada mudou ({st})")
    visto = B.ler_principal(f"select (config->'aviso_mudanca_visto') ? '1' as visto from {s}.profiles where id = {C.txt(uid)}")[0].get("visto")
    if visto:
        st, r, _h, _ms = B.conta(tok, "aviso_mudanca_marcar", {"versao": "1"})
        o.ok(st == 200, f"P aviso_mudanca_marcar (a aluna já viu a versão 1: o mesmo estado) ({st})")
    else:
        o.linha("   (aviso_mudanca_marcar: a aluna não tem a versão 1 vista — não marco por ela; o caso fica no Vitest)")
    # ── o aceite e o onboarding: os caminhos que NÃO gravam (a desfecho da RPC, como hoje)
    antes = B.ler_principal(f"select count(*)::int as n from {s}.aceites where user_id = {C.txt(uid)}")[0]["n"]
    st, r, _h, _ms = B.conta(tok, "aceitar_textos", {"versao": VERSAO_ERRADA, "origem": "site", "saude": False, "nascimento": None, "versao_app": None})
    res = r.get("resultado") or {}
    o.ok(st == 200 and res.get("ok") is False and res.get("erro") in ("versao_desatualizada", "textos_desligados")
         and B.ler_principal(f"select count(*)::int as n from {s}.aceites where user_id = {C.txt(uid)}")[0]["n"] == antes,
         f"P aceitar_textos (versão que não é a vigente) → {res.get('erro')}; 0 aceite gravado ({st})")
    # decisão I (nenhuma conta nem matrícula nova): o caminho que NÃO grava só roda com a pré-condição conferida (SQL só leitura, só
    # contagem) — a aluna com profissional (a matrícula ativa fora da conta do app: a matricular_no_app volta com_profissional antes de
    # gravar) e o w13-dono já dono/membro de uma conta (a criar_minha_conta volta ja_existia/ja_tem_conta antes de gravar); sem ela, o caso
    # fica no Vitest (PADRÃO)
    com_prof = B.ler_principal(f"select count(*)::int as n from {s}.pacientes p where p.user_id = {C.txt(uid)} and p.deleted_at is null "
                               f"and p.ativo and p.conta_id is distinct from (select c.id from {s}.contas c where c.origem = 'app' order by c.criado_em limit 1)")[0]["n"]
    if com_prof:
        pac_antes = B.ler_principal(f"select count(*)::int as n from {s}.pacientes where user_id = {C.txt(uid)}")[0]["n"]
        for corpo in ({"objetivo": "manter", "plano": "treino"},
                      {"objetivo": "manter", "plano": "treino", "nascimento": "1899-12-31", "consentimento": "x", "origem": "site"}):
            st, r, _h, _ms = B.conta(tok, "entrar_sem_profissional", corpo)
            res = r.get("resultado") or {}
            o.ok(st == 200 and res.get("ok") is False and res.get("erro") in ("com_profissional", "atualize_o_app", "nascimento_invalido"),
                 f"P entrar_sem_profissional ({len(corpo)} campos; a aluna tem profissional) → {res.get('erro')} ({st})")
        o.ok(B.ler_principal(f"select count(*)::int as n from {s}.pacientes where user_id = {C.txt(uid)}")[0]["n"] == pac_antes, "P: 0 matrícula nova da aluna")
    else:
        o.linha("   PADRÃO: a aluna sem matrícula ativa com profissional — o entrar_sem_profissional NÃO roda (gravaria); fica no Vitest")
    tok_o, uid_o = L.token(B.OUTRA), L.uid(B.OUTRA)
    ja_tem = B.ler_principal(f"select ((select count(*) from {s}.contas where dono_id = {C.txt(uid_o)} and origem = 'nova') + (select count(*) "
                             f"from {s}.conta_membros where user_id = {C.txt(uid_o)} and status = 'ativo'))::int as n")[0]["n"]
    if ja_tem:
        contas_antes = B.ler_principal(f"select count(*)::int as n from {s}.contas where dono_id = {C.txt(uid_o)}")[0]["n"]
        st, r, _h, _ms = B.conta(tok_o, "criar_minha_conta", {"nome": "Conta de teste hml21", "tipo": "personal", "registro": None})
        res = r.get("resultado") or {}
        o.ok(st == 200 and ((res.get("ok") is True and res.get("ja_existia") is True) or res.get("erro") == "ja_tem_conta")
             and B.ler_principal(f"select count(*)::int as n from {s}.contas where dono_id = {C.txt(uid_o)}")[0]["n"] == contas_antes,
             f"P criar_minha_conta (quem já é dono de conta: o caminho idempotente) → {res.get('erro') or 'ja_existia'}; 0 conta nova ({st})")
    else:
        o.linha("   PADRÃO: o w13-dono sem conta nem equipe ativa — o criar_minha_conta NÃO roda (criaria uma conta); fica no Vitest")


def p_e_n_app(o, L, s: str, estado, rodada: str, casos: set) -> None:
    """P/N das gravações do app: o nome (o mesmo), a foto (pelo link assinado; a de antes devolvida), o objetivo (sem matrícula do app)."""
    tok, uid = L.token(B.ALUNA), L.uid(B.ALUNA)
    nome = B.ler_principal(f"select nome from {s}.profiles where id = {C.txt(uid)}")[0].get("nome")
    dados_antes = B.ler_principal(f"select dados_profissionais::text as d from {s}.profiles where id = {C.txt(uid)}")[0].get("d")
    st, r, _h, _ms = B.conta(tok, "perfil_nome", {"nome": nome or "Aluna", "dados_profissionais": {"foto_url": "https://x/y.png"}, "email": "x@y", "id": OUTRO})
    depois = B.ler_principal(f"select nome, dados_profissionais::text as d from {s}.profiles where id = {C.txt(uid)}")[0]
    o.ok(st == 200 and depois.get("nome") == nome and depois.get("d") == dados_antes,
         f"P/N4/N5 perfil_nome (o mesmo nome; dados_profissionais/email/id no corpo CAEM) → só o nome; o resto igual ({st})")
    st, r, _h, _ms = B.conta(tok, "mudar_objetivo_app", {"objetivo": "manter"})
    o.ok(st == 200 and (r.get("resultado") or {}).get("erro") == "sem_matricula_app", f"P mudar_objetivo_app (a aluna, sem matrícula do app) → sem_matricula_app ({st})")
    # ── a foto (⚪5 da revisão, corrigido 23:53): a troca de teste roda quando a aluna NÃO tem foto (no fim, perfil_foto_tirar: sem foto
    # e 0 arquivo dela no bucket) ou tem uma da pasta dela (no fim, a cópia volta); só é PULADA com uma foto de fora da pasta — aí ficam o
    # preparar, o 404 de um arquivo que não subiu e o N8, que não gravam. A volta é o fechar_rodada (B.limpar_foto), mesmo se cair no meio.
    troca, motivo = B.foto_pode_trocar(s, uid)
    o.linha(f"   a foto da aluna: {motivo}")
    if troca:
        B.guardar_foto(o, estado, s, uid)
    antes = B.foto_da_conta(s, uid)
    bucket = B.bucket_das_fotos(s)

    def preparar(rotulo: str) -> dict:
        st, p, _h, _ms = B.conta(tok, "perfil_foto_preparar", {"tipo": "image/png", "tamanho": len(png)})
        o.ok(st == 200 and str(p.get("caminho", "")).startswith(f"{uid}/foto-") and p.get("token") and p.get("bucket") == bucket,
             f"P perfil_foto_preparar ({rotulo}) → o link na pasta da aluna, no bucket do ambiente ({st})", parar=troca)
        return p

    def subir_e_salvar(p: dict, rotulo: str) -> str | None:
        put = B.subir_no_link(p["bucket"], p["caminho"], p["token"], png, "image/png", tok)
        estado.objeto(p["bucket"], p["caminho"])  # o arquivo de teste, na hora (o limpar_foto confere que não fica no bucket)
        o.ok(put in (200, 201) and B.objetos(bucket, [p["caminho"]]) == 1,
             f"P ({rotulo}) o PUT no link assinado (o uploadToSignedUrl da tela) → o arquivo na pasta <uid>/ do bucket ({put})")
        st, r, _h, _ms = B.conta(tok, "perfil_foto_salvar", {"caminho": p["caminho"]})
        url = r.get("url")
        o.ok(st == 200 and url == f"{B.URL_API_PROPRIA}/storage/v1/object/public/{bucket}/{p['caminho']}" and B.foto_da_conta(s, uid) == url,
             f"P ({rotulo}) perfil_foto_salvar → a URL pública (a do getPublicUrl, no domínio próprio) gravada no perfil ({st})")
        o.ok(B.baixar_bytes(url)[0] == 200 if url else False, f"P ({rotulo}) a foto nova abre pela URL pública (200)")
        return url

    png = B.png_sintetico(16)
    p1 = preparar("1ª")
    if not troca and p1.get("caminho"):
        st4, r4, _h, _ms = B.conta(tok, "perfil_foto_salvar", {"caminho": p1.get("caminho")})
        o.ok(st4 == 404 and r4.get("erro") == "nao_encontrado" and B.foto_da_conta(s, uid) == antes and B.objetos(bucket, [p1["caminho"]]) == 0,
             f"P perfil_foto_salvar de um arquivo que NÃO subiu → 404 nao_encontrado; nada gravado ({st4})")
    if "N1" in casos or "N8" in casos:
        alvo = p1.get("caminho") or f"{uid}/foto-1760000000000.png"
        st8, r8, _h, _ms = B.conta(L.token(B.OUTRA), "perfil_foto_salvar", {"caminho": alvo})
        o.ok(st8 == 400 and r8.get("erro") == "dados_invalidos" and B.foto_da_conta(s, uid) == antes,
             f"N1/N8 OUTRA conta salva a foto na pasta da aluna → 400 dados_invalidos; a foto da aluna não mudou ({st8})")
        for ruim in (f"{uid}/../{OUTRO}/foto-1.png", f"{uid}/sub/foto-1.png", f"{OUTRO}/foto-1.png", f"{uid}/foto-1.gif"):
            st8, r8, _h, _ms = B.conta(tok, "perfil_foto_salvar", {"caminho": ruim})
            o.ok(st8 == 400 and r8.get("erro") == "dados_invalidos" and B.foto_da_conta(s, uid) == antes,
                 f"N8 o caminho fora da pasta/do formato → 400 dados_invalidos; nada gravado ({st8})")
    if not troca:
        return
    subir_e_salvar(p1, "1ª troca")
    anterior = B.caminho_da_url(antes, bucket, uid)
    if anterior:
        o.ok(B.objetos(bucket, [anterior]) == 0, "P a foto de ANTES (da pasta da aluna, neste bucket) saiu do bucket (achado 2; SQL só leitura)")
    # a troca de novo: a de teste anterior sai do bucket (achado 2); no fim, o perfil_foto_tirar (o fechar_rodada) deixa sem foto e 0 arquivo
    p2 = preparar("2ª")
    subir_e_salvar(p2, "2ª troca")
    o.ok(B.objetos(bucket, [p1["caminho"]]) == 0 and B.objetos(bucket, [p2["caminho"]]) == 1,
         "P a troca de novo: a foto de teste anterior saiu do bucket (achado 2) e a nova ficou (SQL só leitura, só contagem)")


def n_gerais(o, L, area: str, casos: set, estado=None) -> None:
    """N2, N3, N6, N7, N9, N11 e o N1 das leituras (com a massa do sino da aluna, se a rodada criou: nenhum id dela na resposta da outra conta)."""
    tok = L.token(B.ALUNA)
    q0 = "avisos" if area == "casca" else "perfil_foto"
    if "N2" in casos:
        st, r, _h, _ms = B.ler(None, [B.item(q0)], sem_auth=True)
        st2, r2, _h, _ms = B.conta(None, ACOES[area][0], {}, sem_auth=True)
        o.ok(st == 401 and st2 == 401, f"N2 sem login → 401 (o `ler` {st}, a ação {st2})")
    if "N3" in casos:
        st, r, _h, _ms = B.ler(tok, [B.item(q0), B.item("conta_inteira")])
        st2, r2, _h, _ms = B.conta(tok, "acao_que_nao_existe")
        o.ok(st == 200 and [i.get("erro") for i in B.itens_de(r)] == [None, "consulta_invalida"] and st2 == 400 and r2.get("erro") == "acao_invalida",
             f"N3 q desconhecida → o item consulta_invalida; ação desconhecida → 400 acao_invalida ({st}, {st2})")
    if "N6" in casos:
        st, r, _h, _ms = B.ler(tok, [B.item(q0)], schema_="outro")
        o.ok(st == 400 and r.get("erro") == "schema_invalido", f"N6 x-schema inválido → 400 schema_invalido ({st})")
    if "N7" in casos:
        st, h = B.preflight_conta(B.ORIGEM_FORA)
        st2, h2 = B.preflight_conta(B.BASES["staging"])
        o.ok(B.cors(h) == B.ORIGEM_PADRAO and B.cors(h2) == B.BASES["staging"], f"N7 origem fora → o CORS padrão ({st}); a do site volta ela mesma ({st2})")
    if "N9" in casos:
        st, r, _h, _ms = B.ler(tok, [B.item(q0)] * 17)
        o.ok(st == 400 and r.get("erro") == "lote_grande", f"N9 lote de 17 → 400 lote_grande ({st})")
    if "N11" in casos:
        st, r, _h, _ms = B.ler(tok, [B.item(q) for q in DO_PAINEL])
        o.ok(st == 200 and all(i.get("erro") == "consulta_invalida" for i in B.itens_de(r)), f"N11 a aluna pede o PAINEL pela conta → consulta_invalida ({st})")
    if "N1" in casos:
        tok_o = L.token(B.OUTRA)
        uid_a = L.uid(B.ALUNA)
        st, r, _h, _ms = B.ler(tok_o, [B.item("avisos"), B.item("perfil_foto"), B.item("meu_perfil_aluno"), B.item("minha_agenda")])
        texto = json.dumps(r)
        massa = [i for i in ((estado.d.get("avisos") if estado else None) or []) if isinstance(i, str)]
        o.ok(st == 200 and uid_a not in texto and not any(i in texto for i in massa) and all(i.get("ok") for i in B.itens_de(r)),
             f"N1 OUTRA conta lê o sino, a foto, o perfil e a agenda pela conta → só os dela (nenhum id da aluna; nenhum dos {len(massa)} "
             f"avisos da massa) ({st})")


# ───────────────────────── hml-21b: a Agenda e os Alunos (--area agenda|alunos) ─────────────────────────
CONTA_X = "55555555-5555-4555-8555-555555555555"  # uma conta de exemplo (só o --seco)
CAL_X = "66666666-6666-4666-8666-666666666666"    # um calendário de exemplo (só o --seco)
# o N11 da 21b: as consultas do PAINEL que a 21b pôs na conta, com params VÁLIDOS (a conta e um calendário da nutri): a aluna não vê nada —
# o RLS (as tabelas: 0 linha) e as RPCs (a conferência de quem chama: ok false ou vazio), como hoje
DO_PAINEL_21B = ("agenda_calendarios", "agenda_agendamentos", "agenda_travas", "agenda_alunos", "alunos_da_conta", "aluno_convites",
                 "alunos_pendentes", "equipe_da_conta")
CHAVES_DE_DONO = ("nutricionista_id", "profissional_id", "user_id", "dono_id", "criado_por")


def iso(d: dt.datetime) -> str:
    return d.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def janela_larga() -> tuple[str, str]:
    """Uma janela de leitura da Agenda (o P compara a função com o SQL da lib nos MESMOS params): de 30 dias atrás a 60 dias adiante."""
    agora = dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
    return iso(agora - dt.timedelta(days=30)), iso(agora + dt.timedelta(days=60))


def dia_sp(dias: int = 1) -> str:
    """Uma data de São Paulo (YYYY-MM-DD) daqui a `dias` (os horários de um dia da Agenda)."""
    return (dt.datetime.now(dt.timezone(dt.timedelta(hours=-3))) + dt.timedelta(days=dias)).date().isoformat()


def pedidos_ler_21b(area: str) -> list[dict]:
    """Os corpos `ler` da rodada da 21b (P e os N) — o --seco passa cada um pelo leitor do servidor (o catálogo inteiro da função)."""
    de, ate = janela_larga()
    uid = "33333333-3333-4333-8333-333333333333"
    if area == "agenda":
        ok = [B.item("agenda_calendarios", conta=CONTA_X), B.item("agenda_tags", donos=[uid, OUTRO]),
              B.item("agenda_agendamentos", de=de, ate=ate, conta=CONTA_X), B.item("agenda_bloqueios", de=de, ate=ate, conta=CONTA_X),
              B.item("agenda_bloqueios_futuros", agora=agora_iso(), conta=CONTA_X), B.item("agenda_travas", conta=CONTA_X),
              B.item("agenda_regras", profissional=uid), B.item("agenda_horarios", calendario=CAL_X, dia=dia_sp(1)), B.item("agenda_alunos", conta=CONTA_X),
              B.item("agenda_aluno", id=FALSO), B.item("aluno_compromissos", aluno=FALSO), B.item("minhas_regras_agenda"),
              B.item("aluno_agenda_horarios", profissional=uid)]
        n45 = [B.item("agenda_calendarios", conta=CONTA_X, nutricionista_id=OUTRO, user_id=OUTRO, select="*"),
               B.item("agenda_agendamentos", de=de, ate=ate, conta=CONTA_X, deleted_at="2000-01-01", limit=5000, colunas="*"),
               B.item("agenda_regras", profissional=uid, profissional_id=OUTRO), B.item("agenda_calendarios")]  # sem a conta: só o meu (o contaId || null)
        ruins = [B.item("agenda_agendamentos", de="ontem", ate=ate), B.item("agenda_tags"), B.item("agenda_tags", donos=[FALSO] * 201),
                 B.item("agenda_horarios", calendario=CAL_X, dia="20/10/2026"), B.item("agenda_regras"), B.item("aluno_compromissos")]
    else:
        ok = [B.item("alunos_da_conta", conta=CONTA_X, filtros={"situacao": "ativos"}, offset=0, limite=20),
              B.item("aluno_do_seletor", conta=CONTA_X, id=FALSO), B.item("aluno_convites", conta=CONTA_X), B.item("alunos_pendentes", conta=CONTA_X),
              B.item("alunos_novos_por_mes", conta=CONTA_X, meses=6), B.item("equipe_da_conta", conta=CONTA_X)]
        n45 = [B.item("alunos_da_conta", conta=CONTA_X, filtros={"situacao": "ativos", "conta_id": OUTRO, "sql": "x"}, offset=0, limite=0, p_conta=OUTRO),
               B.item("aluno_do_seletor", conta=CONTA_X, id=FALSO, colunas="cpf", select="*")]
        ruins = [B.item("alunos_da_conta", conta=CONTA_X, limite=501), B.item("alunos_da_conta", conta=CONTA_X, offset=-1),
                 B.item("alunos_novos_por_mes", conta=CONTA_X, meses=0), B.item("aluno_convites")]
    return [
        {"acao": "ler", "itens": ok},
        {"acao": "ler", "itens": [ok[0], B.item("conta_inteira"), B.item("agenda_de_todo_mundo")]},  # N3
        {"acao": "ler", "itens": n45},  # N4/N5
        {"acao": "ler", "itens": ruins},  # o param fora da forma
        {"acao": "ler", "itens": [ok[0]] * 17},  # N9
        {"acao": "ler", "itens": [B.item(q) for q in DO_PAINEL]},  # as de OUTRAS funções: consulta_invalida (o mesmo da 21a)
    ]


def pedidos_acoes_21b(area: str, uid: str, rodada: str) -> list[tuple[str, dict, bool]]:
    """As ações da rodada da 21b: (ação, corpo, o servidor aceita?) — o --seco confere cada uma no lerCorpoDaAcao do servidor."""
    cal, tag, ag = CAL_X, "77777777-7777-4777-8777-777777777777", FALSO
    consulta = P21.corpo_consulta(rodada, cal, tag, CONTA_X, None, 30, 13)
    if area == "alunos":
        return [
            ("pacote_definir", {"aluno": FALSO, "profissional": uid, "total": 4, "mes_inicio": None, "conta_id": OUTRO, "criado_por": OUTRO}, True),  # N4/N5
            ("pacote_definir", {"aluno": FALSO, "profissional": uid, "total": 4, "mes_inicio": "2026-10-01"}, True),
            ("pacote_definir", {"aluno": FALSO, "profissional": uid, "total": 0}, True),
            ("pacote_definir", {"aluno": FALSO, "profissional": uid}, False),  # sem o total
            ("pacote_definir", {"aluno": FALSO, "profissional": uid, "total": 4, "mes_inicio": "10/2026"}, False),
        ]
    return [
        ("agenda_garantir", {"conta_id": CONTA_X, "papeis": ["personal", "nutricionista"], "modulos": ["treino", "nutricao"], "nutricionista_id": OUTRO}, True),
        ("agenda_garantir", {"conta_id": None, "papeis": [], "modulos": []}, True),
        ("agenda_garantir", {"conta_id": CONTA_X, "papeis": ["x"] * 11, "modulos": []}, False),
        ("agenda_garantir", {"conta_id": CONTA_X, "papeis": [""], "modulos": []}, False),
        ("tags_garantir", {"profissional_id": OUTRO}, True),
        ("calendario_criar", {**P21.corpo_calendario(rodada, CONTA_X), "nutricionista_id": OUTRO, "id": FALSO, "deleted_at": "2000-01-01"}, True),
        ("calendario_criar", {"cor": "#a78bfa"}, False),  # sem o nome
        ("calendario_editar", {"id": cal, "nome": P21.marca(rodada) + " editado", "nutricionista_id": OUTRO}, True),
        ("calendario_editar", {"nome": "x"}, False),  # sem o id
        ("calendario_excluir", {"id": cal}, True),
        ("calendario_excluir", {"id": "nao-uuid"}, False),
        ("tag_criar", {**P21.corpo_tag(rodada), "profissional_id": OUTRO, "base": True}, True),
        ("tag_criar", {"nome": "x", "cor": "#123456", "area": "outra"}, False),
        ("tag_editar", {"id": tag, "cor": "#654321", "base": True}, True),
        ("tag_excluir", {"id": tag}, True),
        ("agendamento_criar", {**consulta, "nutricionista_id": OUTRO, "reagendamentos": 9, "origem": "pacote"}, True),
        ("agendamento_criar", {**consulta, "status": "qualquer"}, False),
        ("agendamento_criar", {k: v for k, v in consulta.items() if k != "inicio"}, False),
        ("agendamento_editar", {"id": ag, "observacao": P21.marca(rodada), "aviso_email_em": "2000-01-01"}, True),
        ("agendamento_editar", {"id": ag, "observacao": None, "paciente_id": None, "tag_id": None}, True),  # o null vai (limpa a coluna)
        ("agendamento_editar", {"id": ag, "titulo": None}, False),  # o título não aceita null
        ("agendamento_excluir", {"id": ag}, True),
        ("bloqueio_criar", {**P21.corpo_bloqueio(rodada, cal, CONTA_X), "nutricionista_id": OUTRO}, True),
        ("bloqueio_criar", {"inicio": "amanhã", "fim": P21.instante(31, 11)}, False),
        ("bloqueio_excluir", {"id": FALSO}, True),
        ("trava_criar", {**P21.corpo_trava(rodada, cal, CONTA_X), "profissional_id": OUTRO}, True),
        ("trava_criar", {**P21.corpo_trava(rodada, cal, CONTA_X), "dias": [7]}, False),
        ("trava_criar", {**P21.corpo_trava(rodada, cal, CONTA_X), "hora_inicio": "25:00"}, False),
        ("trava_excluir", {"id": FALSO}, True),
        ("regras_salvar", {"slot_minutos": 30, "atende_inicio": "08:00", "atende_fim": "18:00", "dias": [1, 2, 3, 4, 5], "reagendamentos_max": 1,
                           "janela_reagendamento": "mes", "desistencia": True, "profissional_id": OUTRO}, True),
        ("regras_salvar", {"slot_minutos": 30}, False),  # as 7, sempre (o RegrasDialog manda todas)
        ("agenda_confirmar", {"agendamento": ag}, True),
        ("agenda_desistir", {"agendamento": ag}, True),
        ("agenda_reagendar", {"agendamento": ag, "inicio": P21.instante(21, 13)}, True),
        ("agenda_reagendar", {"agendamento": ag}, False),
        ("agenda_marcar", {"profissional": uid, "inicio": P21.instante(22, 13)}, True),
        ("agenda_marcar", {"profissional": uid}, False),
    ]


def seco_21b(o, area: str) -> None:
    """O --seco da 21b (sem rede): os corpos pelo leitor REAL do servidor, o SQL da lib de cada consulta, as áreas da guarda, a trava da
    escrita da massa e as telas/pré-condições do painel21b."""
    uid = "33333333-3333-4333-8333-333333333333"
    rodada = "seco"
    lers = pedidos_ler_21b(area)
    acoes = pedidos_acoes_21b(area, uid, rodada)
    r = B.regras_conta(lers + [{**c, "acao": a} for a, c, _ok in acoes])
    cons = r["consultas"]
    o.ok(set(CONSULTAS[area]) <= set(r["consultas_21b"]) and not set(CONSULTAS[area]) & set(r["consultas_21a"]),
         f"[seco] as {len(CONSULTAS[area])} consultas da área {area} estão no catálogo do servidor (as da 21b; nenhuma da 21a)")
    o.ok(set(r["consultas_21b"]) == set(CONSULTAS["agenda"]) | set(CONSULTAS["alunos"]) and len(r["consultas_21a"]) == 9,
         "[seco] o catálogo inteiro = as 9 da 21a + as 19 da 21b (agenda 13 + alunos 6)")
    o.ok(tuple(r[area]) == ACOES[area], f"[seco] as {len(ACOES[area])} ações da área {area} = a lista do servidor, na ordem")
    o.ok(all(q in B.SQL_DA_LIB and "(d357719" in B.SQL_DA_LIB[q][0] and B.SQL_DA_LIB[q][0].startswith("src/") for q in CONSULTAS[area]),
         "[seco] cada consulta tem o SQL FIXO da lib do d357719 (com a origem arquivo:linha) para o P")
    pl = r["pedidos"][: len(lers)]
    o.ok(pl[0].get("ok") is True and all(i.get("ok") for i in pl[0]["itens"]), "[seco] P: o lote da tela passa no leitor do servidor (cada item ok)")
    o.ok([i.get("erro") for i in pl[1]["itens"]] == [None, "consulta_invalida", "consulta_invalida"], "[seco] N3: a q desconhecida → consulta_invalida só nela")
    n45 = pl[2]["itens"]
    declarados = {q: set(cons[q]["params"]) for q in cons}
    filtros_ok = all(set((i.get("params") or {}).get("filtros") or {}) <= set(r["filtros_alunos"]) for i in n45)
    o.ok(all(i.get("ok") and set(i["params"]) <= declarados[i["q"]] for i in n45) and filtros_ok,
         f"[seco] N4/N5: o dono/as colunas/os filtros de fora no corpo CAEM (só os params declarados chegam): {[sorted(i.get('params', {})) for i in n45]}")
    o.ok(all(i.get("erro") == "dados_invalidos" for i in pl[3]["itens"]), f"[seco] o param fora da forma → dados_invalidos ({[i.get('erro') for i in pl[3]['itens']]})")
    o.ok(pl[4] == {"modulo": "leitura", "ok": False, "erro": "lote_grande"}, "[seco] N9: 17 itens → lote_grande")
    o.ok(all(i.get("erro") == "consulta_invalida" for i in pl[5]["itens"]), f"[seco] as consultas de OUTRAS funções pela conta → consulta_invalida ({', '.join(DO_PAINEL)})")
    pa = r["pedidos"][len(lers):]
    certos = [(a, esperado, x) for (a, _c, esperado), x in zip(acoes, pa)]
    o.ok(all(x.get("modulo") == area and x.get("acao") == a for a, _e, x in certos), f"[seco] cada ação vai ao módulo {area} do servidor")
    o.ok(all(bool(x.get("ok")) == esperado for _a, esperado, x in certos),
         f"[seco] os corpos: os aceitos passam, os ruins → dados_invalidos ({[(a, x.get('campo')) for a, e, x in certos if not e]})")
    o.ok(all(set((x.get("valores") or {})) <= set(r["corpos"][a]) for a, e, x in certos if e)
         and not any(k in (x.get("valores") or {}) for _a, e, x in certos if e for k in CHAVES_DE_DONO),
         "[seco] N4/N5: as chaves fora da lista da ação CAEM — nenhuma chave de dono (nutricionista_id, profissional_id, user_id, criado_por…) "
         "chega ao banco: o dono vem do token (ou do calendário, lido no servidor)")
    nulos = next((x.get("valores") for a, e, x in certos if a == "agendamento_editar" and e and "paciente_id" in (x.get("valores") or {})), None)
    if area == "agenda":
        o.ok(nulos == {"id": FALSO, "observacao": None, "paciente_id": None, "tag_id": None},
             f"[seco] o null VAI ao banco onde a coluna aceita (limpar o aluno, a observação e a tag da consulta, como a tela): {nulos}")
    # a Guarda dos E2E: o `ler` da conta é leitura; as ações são gravação (decisão F)
    lido = json.dumps({"acao": "ler", "itens": [{"q": CONSULTAS[area][0]}]})
    o.ok(B.B17.funcao_grava("conta", "ler", lido) is False and all(B.B17.funcao_grava("conta", a, json.dumps({"acao": a})) for a in ACOES[area]),
         "[seco] a Guarda (hml17): o `ler` da conta passa; as ações da área são gravação")
    # o SQL da lib: monta com o schema e os valores conferidos; recusa o que não é do formato
    de, ate = janela_larga()
    s1 = B.sql_da_lib("agenda_agendamentos", "staging", uid=uid, conta=CONTA_X, de=de, ate=ate)
    s2 = B.sql_da_lib("alunos_da_conta", "staging", conta=CONTA_X, filtros={"situacao": "ativos"}, offset=0, limite=20)
    s3 = B.sql_da_lib("agenda_tags", "staging", donos=[uid, OUTRO])
    recusas = 0
    for k, v in (("conta", "x"), ("de", "ontem"), ("dia", "20/10/2026"), ("limite", "20"), ("donos", ["x"]), ("filtros", {"q": 1}), ("outra", 1)):
        try:
            B.sql_da_lib("agenda_calendarios", "staging", **{k: v})
        except (SystemExit, Exception):  # noqa: BLE001 — o uuid_ok levanta o Parou
            recusas += 1
    o.ok("staging.agendamentos" in s1 and "limit 1000" in s1 and "jsonb_agg" in s1 and "staging.alunos_da_conta(" in s2 and "::jsonb" in s2
         and "array['33333333" in s3 and recusas == 7,
         f"[seco] o SQL da lib monta com o schema e os valores conferidos (uuid, instante, data, inteiro, os donos, os filtros); {recusas}/7 fora do formato recusados")
    o.ok(B.como_conjunto([{"b": 1}, {"a": 2}]) == B.como_conjunto([{"a": 2}, {"b": 1}]) and B.SEM_ORDEM_TOTAL <= set(B.LISTAS_DA_LIB),
         "[seco] as listas com empate na ordem da lib comparam como conjunto (as tags, os bloqueios, as travas, os alunos da Agenda)")
    # a trava da escrita da massa (nada sai: a recusa é antes do subprocesso)
    recusas = 0
    for sql in ("delete from staging.agendamentos where true;", "delete from public.calendarios where nutricionista_id = any(array['" + uid + "']::uuid[]) and nome like '%hml21 e2e%';",
                "delete from staging.pacientes where nutricionista_id = any(array['" + uid + "']::uuid[]) and nome like '%hml21 e2e%';",
                "update staging.calendarios set deleted_at = null where nome like '%hml21 e2e%';",
                "delete from staging.calendarios where nutricionista_id = any(array['" + uid + "']::uuid[]) and nome like '%x%';",
                "delete from staging.calendarios where nutricionista_id = any(array['" + uid + "']::uuid[]) and nome like '%hml21 e2e%'; delete from staging.calendarios;"):
        try:
            P21.sql_escrever_staging_21b(sql)
        except SystemExit:
            recusas += 1
    try:
        P21.sql_apagar_massa("public", "calendarios", [uid])
    except SystemExit:
        recusas += 1
    try:
        P21.sql_apagar_massa("staging", "pacientes", [uid])
    except SystemExit:
        recusas += 1
    feitos = [P21.sql_apagar_massa("staging", t, [uid, "x"]) for t, _d, _m in P21.MASSA]
    o.ok(recusas == 8 and all(P21._RE_DELETE_21B.fullmatch(x) for x in feitos) and all("'%hml21 e2e%'" in x for x in feitos),
         f"[seco] a limpeza da massa: só o DELETE no staging, só os donos de teste, só a marca, 1 instrução, nas 5 tabelas da Agenda ({recusas}/8 recusadas)")
    o.ok([t for t, _d, _m in P21.MASSA] == ["agendamentos", "bloqueios_agenda", "agenda_travas", "calendarios", "agenda_tags"],
         "[seco] a ordem do DELETE segue as FKs (a consulta antes do calendário e da tag; o calendário antes da tag)")
    est = B.Estado({"rodada": "x", "schema": "staging", "area": "hml21b", "linhas": [], "storage": [], "n8": None})
    est.salvar = lambda: None  # o --seco não grava o Estado
    P21.anotar_linha(est, "calendarios", FALSO, uid)
    P21.anotar_linha(est, "pacientes", FALSO, uid)  # fora da massa: não anota
    o.ok(B.tem_massa_21b(est) and est.d[B.CHAVE_21B]["linhas"] == [["calendarios", FALSO, uid]] and est.d[B.CHAVE_21B]["donos"] == [uid],
         "[seco] o Estado: a massa da 21b na chave hml21b (só as 5 tabelas; o dono junto) — uma rodada da 21a não abre por cima")
    o.ok(len(P21.marca("10130455-ab12")) <= 40 and P21.corpo_tag("10130455-ab12")["nome"].startswith(B.MARCA),
         "[seco] a marca cabe no nome da tag (1–40 no banco)")
    o.ok(cons["minhas_regras_agenda"]["params"] == {} and cons["minhas_regras_agenda"]["rpc"] == "minhas_regras_agenda",
         "[seco] o `ler` novo do smoke só leitura (minhas_regras_agenda) não pede param: serve à conta de teste de qualquer base (1 login por base)")
    # 🟡2: o N11/N1 só reprova a linha da nutri/da conta dela que NÃO é de quem chama (o recorte devolve, com razão, as linhas de quem chama)
    nutri, aluna, pac = "11111111-1111-4111-8111-111111111111", uid, "22222222-2222-4222-8222-222222222222"
    painel = [{"q": "agenda_agendamentos"}, {"q": "agenda_alunos"}, {"q": "agenda_calendarios"}, {"q": "agenda_travas"}, {"q": "aluno_convites"},
              {"q": "alunos_da_conta"}, {"q": "equipe_da_conta"}]
    resp = {"itens": [
        {"ok": True, "linhas": [{"id": "a1", "nutricionista_id": nutri, "conta_id": CONTA_X, "paciente_id": pac}]},  # a consulta DELA
        {"ok": True, "linhas": [{"id": pac, "nutricionista_id": nutri, "user_id": aluna}]},  # a matrícula DELA
        {"ok": True, "linhas": [{"id": "c1", "nutricionista_id": nutri, "conta_id": CONTA_X}]},  # o calendário da nutri: VAZOU
        {"ok": True, "linhas": [{"id": "t1", "profissional_id": OUTRO, "conta_id": "outra"}]},  # a trava de outra pessoa/conta: não é da nutri
        {"ok": True, "valor": [{"id": "x"}]},  # um convite da conta para quem não é dela: VAZOU
        {"ok": True, "valor": {"ok": False, "erro": "sem_acesso"}}, {"ok": False, "erro": "sem_acesso"}]}
    da_outra = {"itens": [{"ok": True, "linhas": [{"id": "c9", "nutricionista_id": OUTRO, "conta_id": CONTA_X}]}]}  # a DELA, com a conta da nutri (o ⚪)
    o.ok(vazamentos(painel, resp, nutri, CONTA_X, aluna, {pac}) == ["agenda_calendarios:c1", "aluno_convites:1 item(ns)"]
         and vazamentos(painel[:1], da_outra, nutri, CONTA_X, OUTRO, set()) == []
         and vazamentos(painel[:1], {"itens": [{"ok": True, "linhas": [{"id": "a1", "nutricionista_id": nutri, "paciente_id": pac}]}]}, nutri, CONTA_X, OUTRO, set())
         == ["agenda_agendamentos:a1"],
         "[seco] 🟡2: o N11/N1 reprova SÓ a linha da nutri/da conta dela que não é de quem chama (a consulta e a matrícula da aluna passam; a "
         "linha DELA com a conta da nutri passa; o calendário da nutri e o convite da conta reprovam)")
    # 🟡1: o calendario_excluir espera as consultas VIVAS contadas antes e anota os avisos do excluir
    import inspect  # noqa: PLC0415
    fonte = inspect.getsource(p_acoes_agenda)
    corte = fonte.index('"calendario_excluir", {"id": cal})\n    n_av')
    o.ok('r.get("agendamentos") == vivas' in fonte and "deleted_at is null" in fonte[:corte] and "P21.anotar_avisos(estado, s, [ctx[\"uid_a\"], uid], t0)" in fonte[corte:],
         "[seco] 🟡1: o P do calendario_excluir conta as consultas VIVAS do calendário por SQL ANTES (a da aluna segue viva) e anota os avisos do "
         "excluir DEPOIS (a limpeza pega)")
    # ⚪8: os avisos pelo destino de teste + o tipo + o INTERVALO [t0, t1]; o --limpar com o schema gravado no Estado
    sql = P21.sql_avisos_novos("staging", [uid], "2026-10-13 06:00:00+00", "2026-10-13 06:01:00+00")
    recusas = 0
    for args in (([uid], "t0", ""), ([], "t0", "t1"), ([uid], "", "t1")):
        try:
            P21.sql_avisos_novos("staging", *args)
        except SystemExit:
            recusas += 1

    class Placar:
        def __init__(self) -> None:
            self.r: list[bool] = []

        def ok(self, c: object, _t: str, parar: object = None) -> bool:
            self.r.append(bool(c))
            return bool(c)

        def linha(self, _t: str) -> None:
            pass

    cheio = B.Estado({"rodada": "x", "schema": "staging", "area": "hml21b", "linhas": [], "storage": [], "n8": None,
                      B.CHAVE_21B: {"donos": [uid], "linhas": [["calendarios", FALSO, uid]], "avisos": []}})
    cheio.salvar = lambda: None
    cheio.d["schema"] = "public"
    pl = Placar()
    P21.limpar_massa_21b(pl, cheio, "public")
    vazio = B.Estado({"rodada": "x", "schema": "public", "area": "hml21b", "linhas": [], "storage": [], "n8": None, B.CHAVE_21B: {"donos": [], "linhas": [], "avisos": []}})
    vazio.salvar = lambda: None
    pl2 = Placar()
    P21.limpar_massa_21b(pl2, vazio, "public")
    o.ok(f"destino_user_id = any(array['{uid}']::uuid[])" in sql and "tipo = 'consulta_marcada'" in sql and "criado_em >= '2026-10-13 06:00:00+00'" in sql
         and "criado_em <= '2026-10-13 06:01:00+00'" in sql and recusas == 3 and B.CHAVE_21B in cheio.d and pl.r == [False]
         and B.CHAVE_21B not in vazio.d and pl2.r == [True],
         "[seco] ⚪8: os avisos da limpeza = destino de TESTE + tipo + o intervalo [t0, t1] da rodada (sem um deles → recusado); o --limpar usa o "
         "schema GRAVADO no Estado — num Estado fora do staging com massa anotada nada sai e a chave hml21b fica; vazia, sai")


def um(sql: str) -> dict:
    return (B.ler_principal(sql) or [{}])[0]


def comparar_21b(o, q: str, s: str, resp: dict, valores: dict, uid: str, email: str, rotulo: str) -> bool:
    """P: o item da função = o SQL FIXO da lib rodado COMO A PESSOA (as listas sem ordem total, como conjunto)."""
    sql = B.sql_da_lib(q, s, **valores)
    v = (B.B20.ler_como(B.PRINCIPAL_REF, uid, sql, email) or [{}])[-1].get("v")
    obtido = resp.get("linhas") if q in B.LISTAS_DA_LIB else resp.get("valor")
    conjunto = q in B.SEM_ORDEM_TOTAL
    if conjunto:
        obtido, v = B.como_conjunto(B.sem_relogio(obtido)), B.como_conjunto(B.sem_relogio(v))
    n = len(v) if isinstance(v, list) else "—"
    return igual_ao_sql(o, f"P {q} = o SQL da lib ({B.SQL_DA_LIB[q][0]}) como {rotulo} ({n} linha(s)" + (", como conjunto)" if conjunto else ")"), obtido, v)


def contexto_21b(o, L, s: str) -> dict:
    """As contas de teste da rodada: os uids, a conta ativa da nutri (como o app escolhe) e a matrícula da aluna (SQL só leitura)."""
    uid_n, uid_a, uid_o = L.uid(P21.NUTRI), L.uid(P21.ALUNA), L.uid(P21.OUTRA)
    conta = P21.conta_ativa(P21.situacao_como(s, uid_n, P21.NUTRI))
    o.ok(conta is not None, f"a conta ativa da nutri de teste (a 1ª da minha_situacao, como o app; SQL só leitura como ela): papéis "
         f"{(conta or {}).get('papeis')}, módulos {(conta or {}).get('modulos')}", parar=True)
    conta_o = P21.conta_ativa(P21.situacao_como(s, uid_o, P21.OUTRA))
    pac = P21.matricula_da_aluna(s, uid_a, uid_n)
    o.ok(pac is not None, "a matrícula viva da aluna de teste com a nutri de teste (SQL só leitura; outra matrícula dela, de outra W, não entra)", parar=True)
    return {"uid_n": uid_n, "uid_a": uid_a, "uid_o": uid_o, "conta": conta, "conta_o": conta_o, "pac": pac,
            "email_n": B.B5.CONTAS[P21.NUTRI][0], "email_a": B.B5.CONTAS[P21.ALUNA][0], "email_o": B.B5.CONTAS[P21.OUTRA][0]}


def p_leituras_21b(o, L, area: str, s: str, ctx: dict) -> None:
    """P: cada consulta da área = o SQL FIXO da lib COMO A PESSOA (a nutri no painel; a aluna nas da Agenda do aluno)."""
    uid, conta, pac = ctx["uid_n"], ctx["conta"]["id"], ctx["pac"]
    if area == "agenda":
        de, ate = janela_larga()
        agora = agora_iso()
        cals = (B.B20.ler_como(B.PRINCIPAL_REF, uid, B.sql_da_lib("agenda_calendarios", s, uid=uid, conta=conta), ctx["email_n"]) or [{}])[-1].get("v") or []
        donos = sorted({uid} | {c.get("nutricionista_id") for c in cals if C.eh_uuid(c.get("nutricionista_id"))})
        proprio = next((c.get("id") for c in cals if c.get("nutricionista_id") == uid and C.eh_uuid(c.get("id"))), None)
        itens: list[tuple[str, dict, dict]] = [
            ("agenda_calendarios", {"conta": conta}, {"uid": uid, "conta": conta}),
            ("agenda_tags", {"donos": donos}, {"donos": donos}),
            ("agenda_agendamentos", {"de": de, "ate": ate, "conta": conta}, {"uid": uid, "conta": conta, "de": de, "ate": ate}),
            ("agenda_bloqueios", {"de": de, "ate": ate, "conta": conta}, {"uid": uid, "conta": conta, "de": de, "ate": ate}),
            ("agenda_bloqueios_futuros", {"agora": agora, "conta": conta}, {"uid": uid, "conta": conta, "agora": agora}),
            ("agenda_travas", {"conta": conta}, {"uid": uid, "conta": conta}),
            ("agenda_regras", {"profissional": uid}, {"profissional": uid}),
            ("agenda_alunos", {"conta": conta}, {"uid": uid, "conta": conta}),
            ("agenda_aluno", {"id": pac}, {"id": pac}),
            ("aluno_compromissos", {"aluno": pac}, {"aluno": pac}),
        ]
        if proprio:
            dia = dia_sp(1)
            itens.append(("agenda_horarios", {"calendario": proprio, "dia": dia}, {"calendario": proprio, "dia": dia, "duracao": None, "ignorar": None}))
        else:
            o.linha("   PADRÃO: a nutri sem calendário próprio vivo — o agenda_horarios fica no Vitest (o P precisa de um calendário dela)")
        lote_do_aluno = [("minhas_regras_agenda", {}, {}),
                         ("aluno_agenda_horarios", {"profissional": uid}, {"agendamento": None, "profissional": uid, "de_data": None, "ate_data": None})]
    else:
        filtros = {"situacao": "ativos"}
        itens = [
            ("alunos_da_conta", {"conta": conta, "filtros": filtros, "offset": 0, "limite": 20}, {"conta": conta, "filtros": filtros, "offset": 0, "limite": 20}),
            ("alunos_da_conta", {"conta": conta, "filtros": {"situacao": "ativos"}, "offset": 0, "limite": 0},
             {"conta": conta, "filtros": {"situacao": "ativos"}, "offset": 0, "limite": 0}),  # o número do menu (limite 0) e o KPI do Dashboard
            ("aluno_do_seletor", {"conta": conta, "id": pac}, {"conta": conta, "id": pac}),
            ("aluno_convites", {"conta": conta}, {"conta": conta}),
            ("alunos_pendentes", {"conta": conta}, {"conta": conta}),
            ("alunos_novos_por_mes", {"conta": conta, "meses": 6}, {"conta": conta, "meses": 6}),
            ("equipe_da_conta", {"conta": conta}, {"conta": conta}),
        ]
        lote_do_aluno = []
    for conta_lote, lote, uid_l, email_l, rotulo in ((P21.NUTRI, itens, uid, ctx["email_n"], "a nutri"),
                                                      (P21.ALUNA, lote_do_aluno, ctx["uid_a"], ctx["email_a"], "a aluna")):
        if not lote:
            continue
        st, r, _h, ms = B.ler(L.token(conta_lote), [B.item(q, **params) for q, params, _v in lote])
        o.ok(st == 200 and len(B.itens_de(r)) == len(lote) and all(i.get("ok") for i in B.itens_de(r)),
             f"P: o lote da área {area} pela conta como {rotulo} → 200, {len(lote)} itens ok ({ms} ms)")
        for (q, _p, valores), resp in zip(lote, B.itens_de(r)):
            comparar_21b(o, q, s, resp, valores, uid_l, email_l, rotulo)


def contagens_agenda(s: str, uid: str) -> dict:
    """Só contagem: os calendários e as tags (vivos) de quem chama — o 1º acesso idempotente não muda nada."""
    u = C.txt(C.uuid_ok(uid))
    return um(f"select (select count(*) from {s}.calendarios where nutricionista_id = {u})::int as calendarios, "
              f"(select count(*) from {s}.agenda_tags where profissional_id = {u})::int as tags")


def p_acoes_agenda(o, L, s: str, estado, rodada: str, ctx: dict, casos: set) -> None:  # noqa: PLR0915
    """P/N1/N4/N5 das gravações da Agenda pela conta, na massa de TESTE (decisão I): o 1º acesso idempotente, o calendário, a tag, a consulta,
    o bloqueio, a trava, as regras (o mesmo valor), a Agenda do aluno numa consulta de teste com a matrícula dela — e o excluir calendário
    atômico (a RPC nova: a consulta e o calendário na Lixeira com o MESMO instante)."""
    tok, uid, conta, pac = L.token(P21.NUTRI), ctx["uid_n"], ctx["conta"], ctx["pac"]
    tok_o, uid_o = L.token(P21.OUTRA), ctx["uid_o"]
    mk = P21.marca(rodada)
    abre, motivo = P21.agenda_abre_sem_gravar(s, uid)
    o.linha(f"   a Agenda da nutri de teste: {motivo}")
    if abre:
        antes = contagens_agenda(s, uid)
        st, r, _h, _ms = B.conta(tok, "agenda_garantir", {"conta_id": conta["id"], "papeis": conta["papeis"], "modulos": conta["modulos"], "nutricionista_id": uid_o})
        o.ok(st == 200 and r.get("criados") == [] and contagens_agenda(s, uid) == antes,
             f"P agenda_garantir (quem já tem calendário: o caminho idempotente da RPC nova) → criados [], 0 linha nova ({st})")
        st, r, _h, _ms = B.conta(tok, "tags_garantir", {"profissional_id": uid_o})
        res = r.get("resultado") or {}
        o.ok(st == 200 and res.get("ok") is True and contagens_agenda(s, uid) == antes, f"P tags_garantir (as 3 base já existem) → ok, 0 tag nova ({st})")
    else:
        o.linha("   PADRÃO (decisão I): a nutri de teste sem calendário próprio ou sem as 3 tags base — o agenda_garantir/tags_garantir CRIARIA; "
                "a criação fica no Postgres local (pg_local_21b 40/40) e no Vitest")
    # ── a massa: o dono anotado ANTES (a rodada que cai depois do insert limpa pela marca)
    P21.anotar_dono(estado, uid)
    st, r, _h, _ms = B.conta(tok, "calendario_criar", {**P21.corpo_calendario(rodada, conta["id"]), "nutricionista_id": uid_o})
    cal = (r.get("linha") or {}).get("id")
    P21.anotar_linha(estado, "calendarios", cal, uid)
    lin = um(f"select nutricionista_id::text as dono, conta_id::text as conta, nome from {s}.calendarios where id = {C.txt(C.uuid_ok(cal))}") if C.eh_uuid(cal) else {}
    o.ok(st == 200 and lin == {"dono": uid, "conta": conta["id"], "nome": mk}, f"P/N4 calendario_criar → o dono = quem chama (o nutricionista_id do corpo "
         f"CAI), a conta da tela, a marca; a linha volta na forma da leitura ({st})", parar=True)
    st, r, _h, _ms = B.conta(tok, "tag_criar", {**P21.corpo_tag(rodada), "profissional_id": uid_o, "base": True})
    tag = (r.get("linha") or {}).get("id")
    P21.anotar_linha(estado, "agenda_tags", tag, uid)
    lin = um(f"select profissional_id::text as dono, base from {s}.agenda_tags where id = {C.txt(C.uuid_ok(tag))}") if C.eh_uuid(tag) else {}
    o.ok(st == 200 and lin == {"dono": uid, "base": False}, f"P/N4/N5 tag_criar → a tag da nutri, base false (o profissional_id e o base do corpo CAEM) ({st})")
    st, r, _h, _ms = B.conta(tok, "tag_editar", {"id": tag, "cor": "#654321", "base": True})
    o.ok(st == 200 and um(f"select cor, base from {s}.agenda_tags where id = {C.txt(tag)}") == {"cor": "#654321", "base": False},
         f"P tag_editar → só a cor (o base do corpo CAI) ({st})")
    if "N1" in casos:
        st, r, _h, _ms = B.conta(tok_o, "calendario_editar", {"id": cal, "nome": "N1"})
        st2, r2, _h, _ms = B.conta(tok_o, "calendario_excluir", {"id": cal})
        st3, r3, _h, _ms = B.conta(tok_o, "tag_excluir", {"id": tag})
        o.ok(st == 404 and st2 == 404 and r2.get("erro") == "nao_encontrado" and st3 == 404
             and um(f"select nome, deleted_at is null as vivo from {s}.calendarios where id = {C.txt(cal)}") == {"nome": mk, "vivo": True}
             and um(f"select deleted_at is null as viva from {s}.agenda_tags where id = {C.txt(tag)}") == {"viva": True},
             f"N1 OUTRA conta edita/exclui o calendário e a tag da nutri → 404 nao_encontrado (o RLS; a RPC nova volta inteira); nada mudou ({st}, {st2}, {st3})")
    st, r, _h, _ms = B.conta(tok, "calendario_editar", {"id": cal, "nome": mk + " editado", "nutricionista_id": uid_o})
    o.ok(st == 200 and um(f"select nome, nutricionista_id::text as dono from {s}.calendarios where id = {C.txt(cal)}") == {"nome": mk + " editado", "dono": uid},
         f"P calendario_editar → o nome; o dono não muda (o nutricionista_id do corpo CAI) ({st})")
    # ── a consulta de TESTE sem aluno (o gatilho W20 não avisa ninguém), o bloqueio e a trava
    st, r, _h, _ms = B.conta(tok, "agendamento_criar", {**P21.corpo_consulta(rodada, cal, tag, conta["id"], None, 30, 13), "nutricionista_id": uid_o,
                                                         "reagendamentos": 9, "origem": "pacote"})
    ag = (r.get("linha") or {}).get("id")
    P21.anotar_linha(estado, "agendamentos", ag, uid)
    lin = um(f"select nutricionista_id::text as dono, reagendamentos, origem, tag_id::text as tag from {s}.agendamentos where id = {C.txt(C.uuid_ok(ag))}") if C.eh_uuid(ag) else {}
    o.ok(st == 200 and lin.get("dono") == uid and lin.get("reagendamentos") == 0 and lin.get("origem") != "pacote" and lin.get("tag") == tag,
         f"P/N4/N5 agendamento_criar → o dono = o dono do calendário (lido no servidor); reagendamentos/origem do corpo CAEM; a tag ({st})")
    st, r, _h, _ms = B.conta(tok, "agendamento_editar", {"id": ag, "observacao": mk, "aviso_email_em": "2000-01-01"})
    o.ok(st == 200 and um(f"select observacao, aviso_email_em is null as sem_email from {s}.agendamentos where id = {C.txt(ag)}") == {"observacao": mk, "sem_email": True},
         f"P/N5 agendamento_editar → a observação (o aviso_email_em do corpo CAI) ({st})")
    st, r, _h, _ms = B.conta(tok, "bloqueio_criar", {**P21.corpo_bloqueio(rodada, cal, conta["id"]), "nutricionista_id": uid_o})
    blq = (r.get("linha") or {}).get("id")
    P21.anotar_linha(estado, "bloqueios_agenda", blq, uid)
    o.ok(st == 200 and C.eh_uuid(blq) and um(f"select nutricionista_id::text as dono from {s}.bloqueios_agenda where id = {C.txt(blq)}") == {"dono": uid},
         f"P/N4 bloqueio_criar → o dono = quem chama ({st})")
    st, r, _h, _ms = B.conta(tok, "bloqueio_excluir", {"id": blq})
    o.ok(st == 200 and um(f"select count(*)::int as n from {s}.bloqueios_agenda where id = {C.txt(blq)}") == {"n": 0}, f"P bloqueio_excluir → apagado (como hoje: delete) ({st})")
    st, r, _h, _ms = B.conta(tok, "trava_criar", {**P21.corpo_trava(rodada, cal, conta["id"]), "profissional_id": uid_o})
    trv = (r.get("linha") or {}).get("id")
    P21.anotar_linha(estado, "agenda_travas", trv, uid)
    o.ok(st == 200 and C.eh_uuid(trv) and um(f"select profissional_id::text as dono, dias from {s}.agenda_travas where id = {C.txt(trv)}") == {"dono": uid, "dias": [0]},
         f"P/N4 trava_criar → o dono = quem chama; os dias ({st})")
    st, r, _h, _ms = B.conta(tok, "trava_excluir", {"id": trv})
    o.ok(st == 200 and um(f"select count(*)::int as n from {s}.agenda_travas where id = {C.txt(trv)}") == {"n": 0}, f"P trava_excluir → apagada (delete) ({st})")
    st, r, _h, _ms = B.conta(tok, "bloqueio_excluir", {"id": blq})
    o.ok(st == 404 and r.get("erro") == "nao_encontrado", f"P excluir de novo o que já saiu → 404 nao_encontrado (antes \"dava certo\" com 0 linha) ({st})")
    # ── a Agenda do aluno numa consulta de TESTE com a matrícula dela (o WhatsApp conferido antes: 0 instância conectada)
    p_agenda_do_aluno(o, L, s, estado, rodada, ctx, cal, tag)
    # ── as regras: o MESMO valor (o upsert não muda nada); sem a linha, PADRÃO (criaria)
    regras = um(f"select slot_minutos, to_char(atende_inicio, 'HH24:MI') as ai, to_char(atende_fim, 'HH24:MI') as af, dias, reagendamentos_max, "
                f"janela_reagendamento, desistencia, updated_at::text as em from {s}.agenda_config where profissional_id = {C.txt(uid)}")
    if regras.get("ai"):
        corpo = {"slot_minutos": regras["slot_minutos"], "atende_inicio": regras["ai"], "atende_fim": regras["af"], "dias": regras["dias"],
                 "reagendamentos_max": regras["reagendamentos_max"], "janela_reagendamento": regras["janela_reagendamento"], "desistencia": regras["desistencia"],
                 "profissional_id": uid_o}
        st, r, _h, _ms = B.conta(tok, "regras_salvar", corpo)
        depois = um(f"select slot_minutos, to_char(atende_inicio, 'HH24:MI') as ai, to_char(atende_fim, 'HH24:MI') as af, dias, reagendamentos_max, "
                    f"janela_reagendamento, desistencia from {s}.agenda_config where profissional_id = {C.txt(uid)}")
        o.ok(st == 200 and depois == {k: v for k, v in regras.items() if k != "em"} and (r.get("linha") or {}).get("profissional_id") == uid,
             f"P/N4 regras_salvar (as MESMAS 7 regras) → o upsert da linha de quem chama (o profissional_id do corpo CAI); o valor igual ({st})")
    else:
        o.linha("   PADRÃO (decisão I): a nutri de teste sem a linha de regras — o regras_salvar CRIARIA; fica no Vitest")
    # ── o excluir: a consulta à Lixeira; depois o calendário (com 1 consulta viva) pela RPC nova, atômica
    st, r, _h, _ms = B.conta(tok, "agendamento_excluir", {"id": ag})
    o.ok(st == 200 and um(f"select deleted_at is not null as lixeira from {s}.agendamentos where id = {C.txt(ag)}") == {"lixeira": True},
         f"P agendamento_excluir → a Lixeira (deleted_at) ({st})")
    st, r, _h, _ms = B.conta(tok, "agendamento_criar", P21.corpo_consulta(rodada, cal, tag, conta["id"], None, 32, 13))
    ag2 = (r.get("linha") or {}).get("id")
    P21.anotar_linha(estado, "agendamentos", ag2, uid)
    # 🟡1 da revisão: as consultas VIVAS do calendário contadas por SQL só leitura ANTES (a de teste da aluna — p_agenda_do_aluno — segue viva
    # quando o desistir só muda o status ou foi recusado): a RPC devolve esse número; o excluir pode avisar a aluna ("Consulta desmarcada")
    # → os avisos anotados de novo DEPOIS (a limpeza pega)
    vivas_sql = f"select count(*)::int as n from {s}.agendamentos where calendario_id = {C.txt(cal)} and deleted_at is null"
    vivas = int(um(vivas_sql).get("n") or 0)
    t0 = P21.agora_db()
    st, r, _h, _ms = B.conta(tok, "calendario_excluir", {"id": cal})
    n_av = P21.anotar_avisos(estado, s, [ctx["uid_a"], uid], t0)
    lin = um(f"select (select deleted_at from {s}.calendarios where id = {C.txt(cal)})::text as cal, (select deleted_at from {s}.agendamentos "
             f"where id = {C.txt(C.uuid_ok(ag2))})::text as ag2") if C.eh_uuid(ag2) else {}
    o.ok(st == 200 and vivas >= 1 and r.get("agendamentos") == vivas and lin.get("cal") and lin.get("cal") == lin.get("ag2")
         and int(um(vivas_sql).get("n") or 0) == 0,
         f"P calendario_excluir (a RPC nova agenda_excluir_calendario) → as {vivas} consulta(s) viva(s) do calendário (SQL antes) e o calendário "
         f"na Lixeira com o MESMO instante; 0 viva depois; {n_av} aviso(s) da agenda anotado(s) (saem no fim) ({st}: {r.get('agendamentos')})")
    st, r, _h, _ms = B.conta(tok, "calendario_excluir", {"id": cal})
    o.ok(st == 404 and r.get("erro") == "nao_encontrado", f"P calendario_excluir de novo (já na Lixeira) → 404 nao_encontrado; nada muda ({st})")
    st, r, _h, _ms = B.conta(tok, "tag_excluir", {"id": tag})
    o.ok(st == 200 and um(f"select deleted_at is not null as lixeira from {s}.agenda_tags where id = {C.txt(tag)}") == {"lixeira": True},
         f"P tag_excluir → a Lixeira (o gatilho W2 leva as consultas dela à base da área) ({st})")


def p_agenda_do_aluno(o, L, s: str, estado, rodada: str, ctx: dict, cal: str, tag: str | None) -> None:
    """A Agenda do aluno (as 4 ações + as 2 leituras) numa consulta DE TESTE com a matrícula da aluna, que a nutri marca no calendário de
    teste. Os avisos que o banco põe (o gatilho W20 no sino da aluna; as RPCs aluno_agenda_* no da nutri) são anotados e apagados no fim.
    Sem WhatsApp conectado (o gatilho da confirmação mandaria mensagem) — senão PULA com o motivo."""
    tok, uid, uid_a, pac = L.token(P21.NUTRI), ctx["uid_n"], ctx["uid_a"], ctx["pac"]
    wa = P21.whatsapp_conectado(s, uid)
    if wa:
        o.linha(f"   PADRÃO: a nutri de teste com {wa} instância(s) de WhatsApp conectada(s) — a consulta com a matrícula da aluna mandaria a "
                "confirmação por WhatsApp: a Agenda do aluno PULADA (fica no Vitest)")
        return
    t0 = P21.agora_db()
    st, r, _h, _ms = B.conta(L.token(P21.NUTRI), "agendamento_criar", P21.corpo_consulta(rodada, cal, tag, ctx["conta"]["id"], pac, 20, 13))
    ag = (r.get("linha") or {}).get("id")
    P21.anotar_linha(estado, "agendamentos", ag, uid)
    n = P21.anotar_avisos(estado, s, [uid_a, uid], t0)
    o.ok(st == 200 and C.eh_uuid(ag), f"P agendamento_criar com a matrícula da aluna (o caminho do painel) → a consulta de teste; {n} aviso(s) da agenda "
         f"no sino (o gatilho W20 — anotados: saem no fim) ({st})", parar=True)
    tok_a = L.token(P21.ALUNA)
    st, r, _h, ms = B.ler(tok_a, [B.item("aluno_agenda_horarios", agendamento=ag), B.item("minhas_regras_agenda")])
    itens = B.itens_de(r)
    o.ok(st == 200 and len(itens) == 2 and all(i.get("ok") for i in itens), f"P a Agenda do aluno: os horários para reagendar e as regras pela conta ({ms} ms)")
    if len(itens) == 2:
        comparar_21b(o, "aluno_agenda_horarios", s, itens[0], {"agendamento": ag, "profissional": None, "de_data": None, "ate_data": None}, uid_a, ctx["email_a"], "a aluna")
        comparar_21b(o, "minhas_regras_agenda", s, itens[1], {}, uid_a, ctx["email_a"], "a aluna")
    horarios = ((itens[0].get("valor") or {}).get("horarios") if itens and isinstance(itens[0].get("valor"), dict) else None) or []
    estado_ag = lambda: um(f"select status, confirmacao, inicio::text as inicio, reagendamentos from {s}.agendamentos where id = {C.txt(ag)}")  # noqa: E731
    antes = estado_ag()
    st, r, _h, _ms = B.conta(tok_a, "agenda_confirmar", {"agendamento": ag})
    res, depois = r.get("resultado") or {}, estado_ag()
    o.ok(st == 200 and ((res.get("ok") is True and depois.get("status") == "paciente_confirmou") or (res.get("ok") is False and depois == antes)),
         f"P agenda_confirmar → {'confirmada' if res.get('ok') else res.get('erro')}; a consulta {depois.get('status')} (o MESMO de hoje) ({st})")
    if horarios:
        alvo = horarios[0].get("inicio")
        antes = estado_ag()
        st, r, _h, _ms = B.conta(tok_a, "agenda_reagendar", {"agendamento": ag, "inicio": alvo})
        res, depois = r.get("resultado") or {}, estado_ag()
        o.ok(st == 200 and ((res.get("ok") is True and depois.get("reagendamentos") == (antes.get("reagendamentos") or 0) + 1) or (res.get("ok") is False and depois == antes)),
             f"P agenda_reagendar (o 1º horário livre) → {'reagendada' if res.get('ok') else res.get('erro')} (o MESMO de hoje) ({st})")
    else:
        o.linha("   (agenda_reagendar: nenhum horário livre na janela — a RPC decide; não rodou)")
    antes = estado_ag()
    st, r, _h, _ms = B.conta(tok_a, "agenda_desistir", {"agendamento": ag})
    res, depois = r.get("resultado") or {}, estado_ag()
    o.ok(st == 200 and ((res.get("ok") is True and depois.get("status") == "paciente_desmarcou") or (res.get("ok") is False and depois == antes)),
         f"P agenda_desistir → {'desistiu' if res.get('ok') else res.get('erro')} (o MESMO de hoje) ({st})")
    # o marcar: só no caminho que NÃO grava (sem pacote com a nutri: sem_pacote); com pacote, criaria uma consulta sem a marca — PADRÃO
    regras = (itens[1].get("valor") if len(itens) == 2 else None) or []
    com_pacote = any(isinstance(x, dict) and x.get("profissional_id") == uid and x.get("pacote") for x in regras)
    if com_pacote:
        o.linha("   PADRÃO: a aluna tem pacote com a nutri — o agenda_marcar criaria uma consulta (sem a marca): fica no Vitest")
    else:
        n_antes = um(f"select count(*)::int as n from {s}.agendamentos where paciente_id = {C.txt(pac)}")
        st, r, _h, _ms = B.conta(tok_a, "agenda_marcar", {"profissional": uid, "inicio": P21.instante(22, 13)})
        res = r.get("resultado") or {}
        o.ok(st == 200 and res.get("ok") is False and um(f"select count(*)::int as n from {s}.agendamentos where paciente_id = {C.txt(pac)}") == n_antes,
             f"P agenda_marcar (sem pacote com a nutri) → {res.get('erro')}; 0 consulta nova (o MESMO de hoje) ({st})")
    if "N1" in ctx.get("casos", set()):
        antes = estado_ag()
        st, r, _h, _ms = B.conta(L.token(P21.OUTRA), "agenda_confirmar", {"agendamento": ag})
        o.ok(st != 500 and (r.get("resultado") or {}).get("ok") is not True and estado_ag() == antes,
             f"N1 OUTRA conta confirma a consulta da aluna → recusado ({st}: {(r.get('resultado') or {}).get('erro') or r.get('erro')}); a consulta igual")
    P21.anotar_avisos(estado, s, [uid_a, uid], t0)


def p_acoes_alunos(o, L, s: str, ctx: dict, casos: set) -> None:
    """P/N1 do pacote: o caminho que NÃO muda nada (o MESMO total e mês do pacote ativo; sem pacote, o total 0 — encerra o que não existe),
    o total_invalido e a outra conta (sem_acesso/nao_responsavel)."""
    tok, uid, pac = L.token(P21.NUTRI), ctx["uid_n"], ctx["pac"]
    sql_pacote = (f"select count(*)::int as n, max(total)::int as total, max(mes_inicio)::text as mes, max(encerrado_em)::text as fim "
                  f"from {s}.agenda_pacotes where paciente_id = {C.txt(pac)} and profissional_id = {C.txt(uid)}")
    vivo = um(f"select total, mes_inicio::text as mes from {s}.agenda_pacotes where paciente_id = {C.txt(pac)} and profissional_id = {C.txt(uid)} "
              f"and encerrado_em is null")
    antes = um(sql_pacote)
    corpo = {"aluno": pac, "profissional": uid, "total": vivo["total"], "mes_inicio": vivo["mes"]} if vivo.get("total") else {"aluno": pac, "profissional": uid, "total": 0}
    st, r, _h, _ms = B.conta(tok, "pacote_definir", {**corpo, "conta_id": ctx["uid_o"], "criado_por": ctx["uid_o"]})
    res = r.get("resultado") or {}
    o.ok(st == 200 and res.get("ok") is True and um(sql_pacote) == antes,
         f"P/N5 pacote_definir ({'o MESMO pacote ativo' if vivo.get('total') else 'sem pacote: total 0'}) → ok; o pacote da aluna igual ao de antes ({st})")
    st, r, _h, _ms = B.conta(tok, "pacote_definir", {"aluno": pac, "profissional": uid, "total": 61})
    o.ok(st == 200 and (r.get("resultado") or {}).get("erro") == "total_invalido" and um(sql_pacote) == antes, f"P pacote_definir com 61 → total_invalido; nada mudou ({st})")
    if "N1" in casos:
        # a conta v3 (98659b5): a recusa da w14_matricula_da_rota volta como o código (antes, 500 erro_interno + o aviso de erro inesperado)
        st, r, _h, _ms = B.conta(L.token(P21.OUTRA), "pacote_definir", {"aluno": pac, "profissional": uid, "total": 4})
        o.ok(st == 403 and r.get("erro") == "sem_acesso" and um(sql_pacote) == antes,
             f"N1 OUTRA conta define o pacote da aluna da nutri → 403 sem_acesso (a recusa de hoje, da w14_matricula_da_rota); nada mudou "
             f"({st}: {r.get('erro') or (r.get('resultado') or {}).get('erro')})")
        st, r, _h, _ms = B.ler(L.token(P21.OUTRA), [B.item("aluno_compromissos", aluno=pac)])
        itens = B.itens_de(r)
        o.ok(st == 200 and itens == [{"ok": False, "erro": "sem_acesso"}],
             f"N1 OUTRA conta lê os compromissos da aluna da nutri → o item sem_acesso (a recusa de hoje), nunca os dados ({st}: {itens})")


def n_gerais_21b(o, L, area: str, casos: set, ctx: dict) -> None:
    """N2, N3, N6, N7, N9, N11 e o N1 das leituras (a outra conta pede a agenda/os alunos da conta da nutri: nada dela)."""
    tok = L.token(P21.NUTRI)
    conta = ctx["conta"]["id"]
    q0 = B.item("agenda_calendarios", conta=conta) if area == "agenda" else B.item("aluno_convites", conta=conta)
    if "N2" in casos:
        st, _r, _h, _ms = B.ler(None, [q0], sem_auth=True)
        st2, _r2, _h, _ms = B.conta(None, ACOES[area][0], {}, sem_auth=True)
        o.ok(st == 401 and st2 == 401, f"N2 sem login → 401 (o `ler` {st}, a ação {st2})")
    if "N3" in casos:
        st, r, _h, _ms = B.ler(tok, [q0, B.item("agenda_de_todo_mundo")])
        st2, r2, _h, _ms = B.conta(tok, "agenda_apagar_tudo")
        o.ok(st == 200 and [i.get("erro") for i in B.itens_de(r)] == [None, "consulta_invalida"] and st2 == 400 and r2.get("erro") == "acao_invalida",
             f"N3 q desconhecida → o item consulta_invalida; ação desconhecida → 400 acao_invalida ({st}, {st2})")
    if "N6" in casos:
        st, r, _h, _ms = B.ler(tok, [q0], schema_="outro")
        o.ok(st == 400 and r.get("erro") == "schema_invalido", f"N6 x-schema inválido → 400 schema_invalido ({st})")
    if "N7" in casos:
        st, h = B.preflight_conta(B.ORIGEM_FORA)
        st2, h2 = B.preflight_conta(B.BASES["staging"])
        o.ok(B.cors(h) == B.ORIGEM_PADRAO and B.cors(h2) == B.BASES["staging"], f"N7 origem fora → o CORS padrão ({st}); a do site volta ela mesma ({st2})")
    if "N9" in casos:
        st, r, _h, _ms = B.ler(tok, [q0] * 17)
        o.ok(st == 400 and r.get("erro") == "lote_grande", f"N9 lote de 17 → 400 lote_grande ({st})")
    de, ate = janela_larga()
    painel = [B.item("agenda_calendarios", conta=conta), B.item("agenda_agendamentos", de=de, ate=ate, conta=conta), B.item("agenda_travas", conta=conta),
              B.item("agenda_alunos", conta=conta), B.item("alunos_da_conta", conta=conta, filtros={"situacao": "ativos"}, offset=0, limite=20),
              B.item("aluno_convites", conta=conta), B.item("alunos_pendentes", conta=conta), B.item("equipe_da_conta", conta=conta)]
    s = B.schema()
    if "N11" in casos:
        uid_a = ctx["uid_a"]
        st, r, _h, _ms = B.ler(L.token(P21.ALUNA), painel)
        achados = vazamentos(painel, r, ctx["uid_n"], conta, uid_a, P21.matriculas_de(s, uid_a))
        o.ok(st == 200 and not achados, f"N11 a aluna pede o PAINEL pela conta (as consultas da 21b, com a conta da nutri) → nada da nutri que não seja "
             f"dela (o RLS e as RPCs; as linhas DELA — a matrícula, as consultas — o recorte devolve com razão) ({st}; vazou: {achados or '—'})")
    if "N1" in casos:
        uid_o = ctx["uid_o"]
        st, r, _h, _ms = B.ler(L.token(P21.OUTRA), painel)
        achados = vazamentos(painel, r, ctx["uid_n"], conta, uid_o, P21.matriculas_de(s, uid_o))
        o.ok(st == 200 and not achados, f"N1 OUTRA conta (w13-dono) pede a agenda e os alunos da conta da nutri → nada da nutri (as linhas DELA — os "
             f"calendários, as travas — o recorte devolve com razão) ({st}; vazou: {achados or '—'})")


DONOS_DA_LINHA = ("nutricionista_id", "profissional_id", "personal_id")


def vazamentos(painel: list[dict], r: dict, uid_nutri: str, conta_nutri: str, quem: str, matriculas: set[str]) -> list[str]:
    """🟡2 da revisão: só é vazamento a linha da NUTRI (o dono = a nutri) ou da CONTA dela (conta_id = a conta) que NÃO é de quem chama
    (o dono, o user_id ou a matrícula dele) — o recorte "meu ou da conta" devolve, com razão, as linhas de quem chama (a matrícula e as
    consultas da aluna; os calendários e as travas da outra conta). As RPCs de lista (os convites, os pendentes) e a lista/a equipe da conta:
    qualquer item para quem não é da conta é vazamento."""
    achados: list[str] = []
    for it, i in zip(painel, B.itens_de(r)):
        if not i.get("ok"):
            continue
        for x in i.get("linhas") or []:
            if not isinstance(x, dict):
                continue
            da_nutri = any(x.get(k) == uid_nutri for k in DONOS_DA_LINHA) or x.get("conta_id") == conta_nutri
            de_quem_chama = (any(x.get(k) == quem for k in (*DONOS_DA_LINHA, "user_id")) or x.get("paciente_id") in matriculas
                             or x.get("id") in matriculas)
            if da_nutri and not de_quem_chama:
                achados.append(f"{it.get('q')}:{x.get('id')}")
        v = i.get("valor")
        if isinstance(v, list) and v:
            achados.append(f"{it.get('q')}:{len(v)} item(ns)")
        elif isinstance(v, dict) and v.get("ok") is not False and (v.get("itens") or v.get("membros")):
            achados.append(f"{it.get('q')}:itens")
    return achados


def so_leitura(o, base: str, area: str = "casca") -> None:
    """O smoke só leitura (a produção, no F8, ou o staging logo depois de publicar): OPTIONS (o CORS), sem login → 401, x-schema inválido →
    400 e a q desconhecida → consulta_invalida (o `ler` recusa antes do banco) — nada grava; 1 login (a conta de teste da base, a MESMA nas
    4 áreas: a sessão reaproveitada). hml-21b (--area agenda|alunos, decisão G — "o `ler` novo"): + 1 consulta da 21b que serve a qualquer
    conta (minhas_regras_agenda) → o item ok: a conta v2 publicada (a v1 responderia consulta_invalida); da resposta só sai o ok e o tempo."""
    B.usar_base(base)
    origem = B.BASES[base]
    st, h = B.preflight_conta(origem)
    st2, h2 = B.preflight_conta(B.ORIGEM_FORA)
    o.ok(st in (200, 204) and B.cors(h) == origem and B.cors(h2) == B.ORIGEM_PADRAO,
         f"[{base}] OPTIONS → {st}; a origem do site volta ela mesma e a de fora, o padrão ({st2})")
    st, r, _h, _ms = B.ler(None, [B.item("avisos")], sem_auth=True, origem=origem)
    o.ok(st == 401, f"[{base}] sem login → 401 ({st})")
    L = B.Sessoes(f"api21 so-leitura {base}")  # na produção o motivo termina em "prod" (a linha do registro em "prod)": fora do teto do staging, dentro do da produção)
    try:
        tok = L.token(B.PROD_CONTA if base == "prod" else B.ALUNA)
        st, r, _h, _ms = B.ler(tok, [B.item("avisos")], schema_="outro", origem=origem)
        o.ok(st == 400 and r.get("erro") == "schema_invalido", f"[{base}] x-schema inválido → 400 schema_invalido ({st})")
        st, r, _h, ms = B.ler(tok, [B.item("q_que_nao_existe")], origem=origem)
        o.ok(st == 200 and [i.get("erro") for i in B.itens_de(r)] == ["consulta_invalida"],
             f"[{base}] a q desconhecida → consulta_invalida (o `ler` recusa antes do banco; {ms} ms)")
        if area in B.AREAS_DA_21B:
            st, r, _h, ms = B.ler(tok, [B.item("minhas_regras_agenda")], origem=origem)
            itens = B.itens_de(r)
            o.ok(st == 200 and len(itens) == 1 and itens[0].get("ok") is True,
                 f"[{base}] o `ler` novo: minhas_regras_agenda (21b) → o item ok — a conta v2 publicada ({st}; {ms} ms)")
    finally:
        L.fechar(o)


def rodar_21b(o, area: str, base: str, casos: set) -> None:
    """A rodada da 21b (--area agenda|alunos): o P das leituras (a função = o SQL da lib como a pessoa), o P/N das gravações na massa de
    TESTE (a Agenda) ou no caminho que não muda nada (o pacote), os N — e a limpeza no finally (a massa, os avisos; o Estado)."""
    s = B.usar_base(base)
    if base == "prod":
        raise SystemExit("na produção só o --so-leitura (nada grava)")
    B.exigir_saude(o, f"o api.py --area {area} da hml-21b")
    L = B.Sessoes(f"api21 {area} {base}")
    estado = P21.abrir_rodada_21b(o, s)
    rodada = estado.d["rodada"]
    try:
        ctx = contexto_21b(o, L, s)
        ctx["casos"] = casos
        if "P" in casos:
            p_leituras_21b(o, L, area, s, ctx)
            if area == "agenda":
                p_acoes_agenda(o, L, s, estado, rodada, ctx, casos)
            else:
                p_acoes_alunos(o, L, s, ctx, casos)
        n_gerais_21b(o, L, area, casos, ctx)
    finally:
        try:
            P21.fechar_rodada_21b(o, estado, s)
        finally:
            L.fechar(o)


def rodar(o, area: str, base: str, casos: set) -> None:
    if area in B.AREAS_DA_21B:
        rodar_21b(o, area, base, casos)
        return
    s = B.usar_base(base)
    if base == "prod":
        raise SystemExit("na produção só o --so-leitura (nada grava)")
    B.exigir_saude(o, f"o api.py --area {area} da hml-21a")
    L = B.Sessoes(f"api21 {area} {base}")
    estado = B.abrir_rodada(o, s)
    rodada = estado.d["rodada"]
    try:
        if "P" in casos:
            p_leituras(o, L, area, s)
            if area == "casca":
                p_e_n1_casca(o, L, s, estado, rodada, casos)
            else:
                p_e_n_app(o, L, s, estado, rodada, casos)
        n_gerais(o, L, area, casos, estado)
    finally:
        try:
            B.fechar_rodada(o, estado, s, L)
        finally:
            L.fechar(o)


def limpar_21b(o, base: str) -> None:
    """O --limpar da 21b (--area agenda|alunos): a massa da Agenda (os ids do Estado — a chave hml21b — e, por SQL, o que tem a marca dos
    donos de teste, inclusive na Lixeira) e os avisos anotados — conferido por SQL só leitura, só contagem. Sem Estado: as linhas com a marca
    da hml-21 das contas de teste (uma rodada que caiu antes de anotar)."""
    s = B.usar_base(base)
    estado = B.Estado.ler()
    if estado.d.get("area") not in (None, "hml21b"):
        o.ok(False, f"a rodada pendente é de outra área ({estado.d.get('area')}): rode o --limpar dela", parar=True)
    s = estado.d.get("schema") or s  # ⚪8 da revisão: o schema GRAVADO no Estado (onde a rodada rodou), não o da linha de comando
    if s == "staging":
        sobra = B.ler_principal(P21.sql_contar_massa(s))[0]
        if any(int(v or 0) for v in sobra.values()):
            donos = [u for u in (B.uid_da_conta(c) for c in (P21.NUTRI, P21.PERSONAL, P21.OUTRA)) if C.eh_uuid(u)]
            for d in donos:
                P21.anotar_dono(estado, d)
    P21.fechar_rodada_21b(o, estado, s)
    if s == "staging":
        sobra = B.ler_principal(P21.sql_contar_massa(s))[0]
        o.ok(not any(int(v or 0) for v in sobra.values()), f"--limpar (21b) conferido (SQL só leitura): 0 linha com a marca da hml-21 ({sobra})")


def limpar(o, base: str) -> None:
    """O --limpar (depois de qualquer corte): a massa do sino (os ids do Estado + os da aluna de TESTE que ainda têm a marca) e a foto (a de
    antes volta pela cópia do TMPDIR; os arquivos de teste saem) — conferido por SQL só leitura, só contagem."""
    s = B.usar_base(base)
    estado = B.Estado.ler()
    if (estado.d.get("area") or B.AREA_ESTADO) != B.AREA_ESTADO:
        o.ok(False, f"a rodada pendente é de outra área ({estado.d.get('area')}): rode o --limpar dela", parar=True)
    if s == "staging" and not C.eh_uuid(estado.d.get("hml21_destino")):
        # nada anotado: ainda assim, a massa que tem a marca (uma rodada que caiu antes de anotar o destino) sai
        if B.ler_principal(B.sql_contar_avisos(s))[0].get("avisos"):
            estado.d["hml21_destino"] = B.uid_da_conta(B.ALUNA)
    L = B.Sessoes("api21 --limpar")
    try:
        B.fechar_rodada(o, estado, s, L)
    finally:
        L.fechar(o)
    if s == "staging":
        sobra = B.ler_principal(B.sql_contar_avisos(s))[0]
        o.ok(not sobra.get("avisos"), f"--limpar conferido (SQL só leitura): 0 aviso com a marca da hml-21 ({sobra.get('avisos')})")


def sair(o) -> None:
    """O logout (scope=local) das sessões guardadas — no fim da etapa 2 (as do Treino também)."""
    B.Sessoes("api21 sair").sair(o)


def main() -> int:
    ap = argparse.ArgumentParser(description="hml-21a/21b — os casos de servidor da função conta (a casca e o app do aluno; a Agenda e os Alunos)")
    ap.add_argument("--area", default="casca", choices=AREAS)
    ap.add_argument("--base", default="local", choices=tuple(B.BASES))
    ap.add_argument("--casos", default=",".join(CASOS))
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--seco", action="store_true")
    g.add_argument("--limpar", action="store_true")
    g.add_argument("--so-leitura", action="store_true")
    g.add_argument("--sair", action="store_true")
    g.add_argument("--guardar-sino", action="store_true", help="antes da 1ª rodada que abre o sino: os não lidos de antes da aluna (TMPDIR)")
    g.add_argument("--devolver-sino", action="store_true", help="no fim da etapa 2: os não lidos de antes voltam a não lidos")
    a = ap.parse_args()
    B.corte_vira_saida()
    B.usar_area(a.area)  # hml-21b: a Agenda e os Alunos gravam na área hml21b (prints/hml21/b)
    casos = {c.strip() for c in a.casos.split(",") if c.strip()}
    fora = casos - set(CASOS)
    if fora:
        raise SystemExit(f"casos desconhecidos: {sorted(fora)}")
    nome = f"api21_{a.area}_" + ("seco" if a.seco else "limpar" if a.limpar else "sair" if a.sair else f"{a.base}_so_leitura" if a.so_leitura
                                 else "guardar_sino" if a.guardar_sino else "devolver_sino" if a.devolver_sino else a.base)
    o = C.Saida(nome)
    try:
        if a.seco:
            if a.area in B.AREAS_DA_21B:
                seco_21b(o, a.area)
            else:
                seco(o, a.area)
        elif a.limpar:
            if a.area in B.AREAS_DA_21B:
                limpar_21b(o, a.base)
            else:
                limpar(o, a.base)
        elif a.sair:
            sair(o)
        elif a.so_leitura:
            so_leitura(o, a.base, a.area)
        elif a.guardar_sino:
            B.guardar_sino(o, B.usar_base(a.base))
        elif a.devolver_sino:
            B.devolver_sino(o, B.usar_base(a.base))
        else:
            rodar(o, a.area, a.base, casos)
    except (Exception, SystemExit) as e:  # noqa: BLE001
        o.ok(False, f"parou no meio: {type(e).__name__}: {str(e)[:300]}")
    if not a.seco:
        C.C2.registrar_rodada(o.oks, o.oks + o.falhas)
    return o.fim()


if __name__ == "__main__":
    raise SystemExit(main())
