import { describe, expect, it } from "vitest";
import {
  ATRIBUIR_POR_VEZ,
  CABECALHO_CSV,
  FILTROS_PADRAO,
  LIMITE_SELETOR,
  MAX_EXPORTACAO,
  acoesDoAluno,
  alunoDaTabela,
  alunoDoSeletor,
  contatoDoAluno,
  digitosDaBusca,
  emLotes,
  situacaoDoAluno,
  termoDoSeletor,
  textoMaisAlunos,
  chipsDosModulos,
  comPeriodo,
  dataHoraCSV,
  exportarTodos,
  filtrosAtivos,
  filtrosParaServidor,
  formatarCPF,
  intervaloPeriodo,
  limiteAtingido,
  linhaFina,
  mensagemErroAlunos,
  montarCSV,
  normalizarLista,
  rotaDoAluno,
  selosDoAluno,
  textoExportacao,
  textoVagas,
  type AlunoLinha,
} from "./regras";

function aluno(o: Partial<AlunoLinha> = {}): AlunoLinha {
  return {
    id: "p1", rota_id: "t1", treino_user_id: "t1", tem_login: true, nome: "Rafael Moura", email: "rafael@x.com", telefone: "82999990000",
    foto_url: null, tags: [], ativo: true, bloqueado: false, bloqueado_em: null, bloqueio_msg: null, conta_excluida: false, origem: "calc",
    criado_em: "2026-03-10T12:00:00Z", atualizado_em: "2026-09-01T12:00:00Z", modulos: ["treino", "nutricao"],
    personal: { id: "u-lucas", nome: "Lucas Ferreira" }, nutricionista: { id: "u-camila", nome: "Camila Rocha" },
    pagamento: null, comprovante: false, sou_eu: false, ...o,
  };
}
const dono = { id: "u-dono", dono: true, personal: true, nutricionista: false };
const lucas = { id: "u-lucas", dono: false, personal: true, nutricionista: false };
const outro = { id: "u-x", dono: false, personal: true, nutricionista: false };

describe("W13 — lista de alunos: chips e selos (tela 7, C27)", () => {
  it("módulos com o responsável, como a tela 7 (TREINO · LUCAS / NUTRIÇÃO · CAMILA)", () => {
    expect(chipsDosModulos(aluno()).map((c) => [c.tom, c.rotulo])).toEqual([["t", "TREINO · LUCAS"], ["n", "NUTRIÇÃO · CAMILA"]]);
  });
  it("sem nenhum responsável (W5: saiu da equipe) → SEM RESPONSÁVEL", () => {
    expect(chipsDosModulos(aluno({ modulos: [], personal: null, nutricionista: null })).map((c) => c.rotulo)).toEqual(["SEM RESPONSÁVEL"]);
  });
  it("selos: bloqueado, conta excluída, desativado, pago até, pendente e comprovante", () => {
    expect(selosDoAluno(aluno({ bloqueado: true })).map((s) => s.marca)).toEqual(["bloqueado"]);
    expect(selosDoAluno(aluno({ ativo: false, conta_excluida: true })).map((s) => s.rotulo)).toEqual(["CONTA EXCLUÍDA"]);
    expect(selosDoAluno(aluno({ ativo: false })).map((s) => s.rotulo)).toEqual(["DESATIVADO"]);
    expect(selosDoAluno(aluno({ pagamento: { s: "pago", ate: "2026-10-19T12:00:00Z" } })).map((s) => s.rotulo)).toEqual(["PAGO ATÉ 19/10"]);
    expect(selosDoAluno(aluno({ pagamento: { s: "pendente", ate: null }, comprovante: true })).map((s) => s.marca)).toEqual(["comprovante", "pendente"]);
  });
  it("linha fina: contato · desde mês/ano; rota pelo id do Treino (ou a matrícula)", () => {
    expect(linhaFina(aluno())).toBe("rafael@x.com · desde mar/2026");
    expect(linhaFina(aluno({ email: null }))).toBe("(82) 99999-0000 · desde mar/2026");
    expect(rotaDoAluno(aluno())).toBe("/painel/alunos/t1");
    expect(rotaDoAluno(aluno({ rota_id: "p9" }))).toBe("/painel/alunos/p9");
  });
});

describe("W13 — vagas do plano e limite da faixa (C96, spec 6.4 e 9)", () => {
  it("texto e limite atingido", () => {
    expect(textoVagas({ em_uso: 9, limite: 10, origem: "nova", faixa: "f10" })).toBe("9 de 10 alunos ativos");
    expect(textoVagas({ em_uso: 12, limite: null, origem: "legado_nutri", faixa: "livre" })).toBe("12 alunos ativos · sem limite");
    expect(limiteAtingido({ em_uso: 10, limite: 10, origem: "nova", faixa: "f10" })).toBe(true);
    expect(limiteAtingido({ em_uso: 9, limite: 10, origem: "nova", faixa: "f10" })).toBe(false);
    expect(limiteAtingido({ em_uso: 500, limite: null, origem: "legado_nutri", faixa: "livre" })).toBe(false);
  });
  it("a recusa do servidor vira a mensagem da W4 com o uso atual (dono e membro)", () => {
    expect(mensagemErroAlunos("limite_plano", { limite: 10, em_uso: 10, sou_dono: true }))
      .toBe("Seu plano permite 10 alunos ativos. Mude de faixa em Configurações › Plano. (10 de 10 em uso)");
    expect(mensagemErroAlunos("limite_plano", { limite: 10, em_uso: 10, sou_dono: false, dono_nome: "Lucas" }))
      .toBe("O plano da conta permite 10 alunos ativos. Fale com Lucas.");
    expect(mensagemErroAlunos("outro_profissional")).toBe("Este aluno já está com outro profissional.");
    expect(mensagemErroAlunos("codigo_que_nao_existe")).toBe("Não deu certo agora. Tente de novo.");
  });
});

describe("W13 — menu ⋮ (C31): quem pode (dono, responsável; a regra também está no banco)", () => {
  it("dono e responsável gerem; outro membro não", () => {
    expect(acoesDoAluno(aluno(), dono)).toMatchObject({ abrir: true, pdf: true, bloquear: true, desbloquear: false, desativar: true, remover: true });
    expect(acoesDoAluno(aluno(), lucas)).toMatchObject({ bloquear: true, remover: true });
    expect(acoesDoAluno(aluno(), outro)).toMatchObject({ abrir: true, bloquear: false, desativar: false, remover: false });
  });
  it("bloqueado mostra Desbloquear; desativado mostra Reativar; conta excluída não reativa; sem Treino não tem PDF", () => {
    expect(acoesDoAluno(aluno({ bloqueado: true }), dono)).toMatchObject({ bloquear: false, desbloquear: true });
    expect(acoesDoAluno(aluno({ ativo: false }), dono)).toMatchObject({ desativar: false, reativar: true, bloquear: false });
    expect(acoesDoAluno(aluno({ ativo: false, conta_excluida: true }), dono)).toMatchObject({ reativar: false });
    expect(acoesDoAluno(aluno({ treino_user_id: null }), dono).pdf).toBe(false);
  });
});

describe("W13 — filtros e leitura da resposta", () => {
  it("padrão = Ativos (o número do menu) e só manda o que está preenchido", () => {
    expect(filtrosAtivos(FILTROS_PADRAO)).toBe(false);
    expect(filtrosParaServidor(FILTROS_PADRAO)).toEqual({ situacao: "ativos" });
    expect(filtrosParaServidor({ ...FILTROS_PADRAO, q: " ana ", responsavel: "sem", pagamento: "pendente" }))
      .toEqual({ situacao: "ativos", q: "ana", responsavel: "sem", pagamento: "pendente" });
    expect(filtrosAtivos({ ...FILTROS_PADRAO, situacao: "bloqueados" })).toBe(true);
  });
  it("normaliza a resposta do banco sem quebrar com campo faltando", () => {
    const l = normalizarLista({ ok: true, total: "3", itens: [{ ...aluno(), modulos: ["treino", "x"], tags: null }], contagens: { ativos: 3 } });
    expect(l?.total).toBe(3);
    expect(l?.itens[0].modulos).toEqual(["treino"]);
    expect(l?.itens[0].tags).toEqual([]);
    expect(l?.contagens).toEqual({ ativos: 3, bloqueados: 0, desativados: 0, excluidas: 0, todos: 0 });
    expect(normalizarLista({ ok: false, erro: "sem_acesso" })).toBeNull();
  });
});

describe("W13/H4 — exportar CSV (N-66)", () => {
  it("BOM, separador ; e o que a lista mostra + as colunas do CSV do Nutri (Apelido, CPF, Nascimento, Gênero, Modificado em)", () => {
    const csv = montarCSV([
      aluno({ tags: ["VIP", "Manhã"], pagamento: { s: "pago", ate: "2026-10-19T12:00:00Z" }, apelido: "Rafa", cpf: "52998224725", nascimento: "1998-03-10", genero: "masculino" }),
      aluno({ nome: "Ana; Souza", ativo: false }),
    ]);
    expect(csv.startsWith("﻿Nome;Apelido;CPF;E-mail;Telefone;Nascimento;Gênero;Módulos;Personal;Nutricionista;Tags;Situação;Pagamento;Cadastro;Modificado em\r\n")).toBe(true);
    expect(CABECALHO_CSV).toHaveLength(15);
    expect(csv).toContain("Rafael Moura;Rafa;529.982.247-25;rafael@x.com;(82) 99999-0000;10/03/1998;Masculino;Treino + Nutrição;Lucas Ferreira;Camila Rocha;VIP, Manhã;Ativo;Pago até 19/10;10/03/2026;01/09/2026 - 09:00:00");
    // sem os campos (lista antiga, APK velho): as colunas novas saem vazias, o resto igual
    expect(csv).toContain('"Ana; Souza";;;rafael@x.com;');
    expect(csv).toContain(";Desativado;");
  });
  it("CPF com máscara (11 dígitos) e a data e hora da modificação no horário de São Paulo", () => {
    expect(formatarCPF("52998224725")).toBe("529.982.247-25");
    expect(formatarCPF("529.982.247-25")).toBe("529.982.247-25");
    expect(formatarCPF("123")).toBe("123");
    expect(formatarCPF(null)).toBe("");
    expect(dataHoraCSV("2026-10-02T02:30:05Z")).toBe("01/10/2026 - 23:30:05");
    expect(dataHoraCSV(null)).toBe("");
  });
  it("célula que começa com fórmula vira texto (sem injeção no Excel)", () => {
    expect(montarCSV([aluno({ nome: "=HYPERLINK(1)" })])).toContain("'=HYPERLINK(1)");
  });
});

describe("H4 — filtros do Nutri na lista (N-10): gênero, cadastro, modificação e a ordem", () => {
  const agora = new Date("2026-10-02T15:00:00Z");
  it("o padrão segue só com a situação (o número do menu não muda) e a ordem alfabética não vai para o servidor", () => {
    expect(filtrosParaServidor(FILTROS_PADRAO, agora)).toEqual({ situacao: "ativos" });
    expect(FILTROS_PADRAO.ordem).toBe("nome");
  });
  it("gênero e ordem vão como a alunos_da_conta entende", () => {
    expect(filtrosParaServidor({ ...FILTROS_PADRAO, genero: "feminino", ordem: "modificados" }, agora))
      .toEqual({ situacao: "ativos", genero: "feminino", ordem: "modificados" });
    expect(filtrosParaServidor({ ...FILTROS_PADRAO, ordem: "recentes" }, agora)).toEqual({ situacao: "ativos", ordem: "recentes" });
  });
  it("período relativo (1/2/3 meses atrás) = desde aquele instante até agora; personalizado = os dias inteiros escolhidos", () => {
    expect(intervaloPeriodo("todo", "", "", agora)).toEqual({});
    expect(intervaloPeriodo("1m", "", "", agora)).toEqual({ de: "2026-09-02T15:00:00.000Z" });
    expect(intervaloPeriodo("3m", "", "", agora)).toEqual({ de: "2026-07-02T15:00:00.000Z" });
    const c = intervaloPeriodo("custom", "2026-09-01", "2026-09-30", agora);
    expect(new Date(c.de!).getDate()).toBe(1);
    expect(new Date(c.de!).getHours()).toBe(0);
    expect(new Date(c.ate!).getDate()).toBe(30);
    expect(new Date(c.ate!).getHours()).toBe(23);
    // data faltando ou inválida: aquele lado fica sem limite
    expect(intervaloPeriodo("custom", "2026-09-01", "", agora)).toEqual({ de: c.de });
    expect(intervaloPeriodo("custom", "2026-02-31", "xx", agora)).toEqual({});
  });
  it("cadastro vira cadastro_de/_ate e modificação vira modificado_de/_ate", () => {
    const r = filtrosParaServidor({ ...FILTROS_PADRAO, cadastro: "2m", modificacao: "custom", modificacaoDe: "2026-09-10", modificacaoAte: "2026-09-12" }, agora);
    expect(r.cadastro_de).toBe("2026-08-02T15:00:00.000Z");
    expect(r.cadastro_ate).toBeUndefined();
    expect(new Date(r.modificado_de).getDate()).toBe(10);
    expect(new Date(r.modificado_ate).getDate()).toBe(12);
  });
  it("os filtros novos ligam o 'Limpar'; a ordem sozinha não é filtro", () => {
    expect(filtrosAtivos({ ...FILTROS_PADRAO, genero: "outro" })).toBe(true);
    expect(filtrosAtivos({ ...FILTROS_PADRAO, cadastro: "1m" })).toBe(true);
    expect(filtrosAtivos({ ...FILTROS_PADRAO, modificacao: "custom" })).toBe(true);
    expect(filtrosAtivos({ ...FILTROS_PADRAO, ordem: "recentes" })).toBe(false);
  });
  it("trocar o período limpa as datas personalizadas; 'Personalizar data' mantém", () => {
    const f = { ...FILTROS_PADRAO, cadastro: "custom" as const, cadastroDe: "2026-09-01", cadastroAte: "2026-09-30" };
    expect(comPeriodo(f, "cadastro", "1m")).toMatchObject({ cadastro: "1m", cadastroDe: "", cadastroAte: "" });
    expect(comPeriodo(f, "cadastro", "custom")).toMatchObject({ cadastro: "custom", cadastroDe: "2026-09-01", cadastroAte: "2026-09-30" });
    expect(comPeriodo(f, "modificacao", "2m")).toMatchObject({ modificacao: "2m", cadastroDe: "2026-09-01" });
  });
});

describe("H4 — exportar TODOS os alunos (N-66: sem o corte calado em 500)", () => {
  const fila = (n: number) => Array.from({ length: n }, (_, i) => aluno({ id: `p${i}`, nome: `Aluno ${String(i).padStart(4, "0")}` }));
  function servidor(todos: AlunoLinha[]) {
    const pedidos: Array<[number, number]> = [];
    const buscar = async (offset: number, limite: number) => {
      pedidos.push([offset, limite]);
      return { itens: todos.slice(offset, offset + Math.min(limite, 500)), total: todos.length };
    };
    return { pedidos, buscar };
  }
  it("1.203 alunos: pede 3 páginas (0, 500, 1000) e junta todos, na ordem", async () => {
    const todos = fila(1203);
    const s = servidor(todos);
    const e = await exportarTodos(s.buscar);
    expect(s.pedidos).toEqual([[0, 500], [500, 500], [1000, 500]]);
    expect(e.itens).toHaveLength(1203);
    expect(e.itens[0].id).toBe("p0");
    expect(e.itens[1202].id).toBe("p1202");
    expect(e).toMatchObject({ total: 1203, completo: true });
    expect(textoExportacao(e)).toBe("1203 alunos exportados.");
  });
  it("até 500: 1 página só; exatamente 500: para no total (não pede página vazia)", async () => {
    const s1 = servidor(fila(37));
    expect((await exportarTodos(s1.buscar)).itens).toHaveLength(37);
    expect(s1.pedidos).toHaveLength(1);
    const s2 = servidor(fila(500));
    expect((await exportarTodos(s2.buscar)).itens).toHaveLength(500);
    expect(s2.pedidos).toHaveLength(1);
    const s3 = servidor(fila(501));
    expect((await exportarTodos(s3.buscar)).itens).toHaveLength(501);
    expect(s3.pedidos).toEqual([[0, 500], [500, 500]]);
  });
  it("a lista muda no meio (alguém entrou): ninguém sai repetido", async () => {
    const todos = fila(600);
    let chamada = 0;
    const e = await exportarTodos(async (offset, limite) => {
      chamada += 1;
      // na 2ª página, um aluno novo empurra a lista: o último da 1ª volta no começo da 2ª
      const lista = chamada === 1 ? todos : [aluno({ id: "novo", nome: "Aaa Novo" }), ...todos];
      return { itens: lista.slice(offset, offset + limite), total: lista.length };
    });
    const ids = e.itens.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("passou do limite de segurança: exporta o que deu e AVISA quantos ficaram de fora", async () => {
    const s = servidor(fila(1300));
    const e = await exportarTodos(s.buscar, 500, 1000);
    expect(e).toMatchObject({ total: 1300, completo: false });
    expect(e.itens).toHaveLength(1000);
    expect(textoExportacao(e)).toMatch(/^1000 alunos exportados de 1300: o arquivo parou no limite/);
    expect(MAX_EXPORTACAO).toBeGreaterThanOrEqual(5000); // o Nutri ia até 5.000
  });
  it("1 aluno: texto no singular", async () => {
    expect(textoExportacao({ itens: fila(1), total: 1, completo: true })).toBe("1 aluno exportado.");
  });
});

describe("hml-14b (D15) — seleção em lote: a gravação vai em lotes de 200", () => {
  it("450 ids → 200 + 200 + 50, na ordem; 200 → 1 lote; nenhum → nenhum lote", () => {
    const ids = Array.from({ length: 450 }, (_, i) => `p${i}`);
    const lotes = emLotes(ids);
    expect(ATRIBUIR_POR_VEZ).toBe(200);
    expect(lotes.map((l) => l.length)).toEqual([200, 200, 50]);
    expect(lotes.flat()).toEqual(ids);
    expect(emLotes(ids.slice(0, 200))).toHaveLength(1);
    expect(emLotes([])).toEqual([]);
    expect(emLotes(["a", "b", "c"], 2)).toEqual([["a", "b"], ["c"]]);
  });
});

describe("hml-14b (B19 · D16) — regras do seletor de aluno", () => {
  it('"20 de N — refine a busca"; 20 por busca', () => {
    expect(LIMITE_SELETOR).toBe(20);
    expect(textoMaisAlunos(20, 41)).toBe("20 de 41 — refine a busca");
  });
  it("o termo vai ao banco sem espaço sobrando; os dígitos são os do CPF e do telefone", () => {
    expect(termoDoSeletor("  Zé   Último ")).toBe("Zé Último");
    expect(termoDoSeletor(null)).toBe("");
    expect(digitosDaBusca("123.456.789-00")).toBe("12345678900");
    expect(digitosDaBusca("(82) 99999-1234")).toBe("82999991234");
    expect(digitosDaBusca("Zé")).toBe("");
  });
  it("item da alunos_da_conta → aluno do seletor (responsáveis pelo id, apelido e CPF da exportação)", () => {
    expect(alunoDoSeletor(aluno({ apelido: "Rafa", cpf: "12345678900", tem_login: false, bloqueado: true }))).toEqual({
      id: "p1", nome: "Rafael Moura", apelido: "Rafa", email: "rafael@x.com", telefone: "82999990000", cpf: "12345678900", foto_url: null,
      ativo: true, bloqueado: true, conta_excluida: false, tem_login: false, personal_id: "u-lucas", nutricionista_id: "u-camila",
    });
    expect(alunoDoSeletor(aluno({ personal: null, nutricionista: null }))).toMatchObject({ apelido: null, cpf: null, personal_id: null, nutricionista_id: null });
  });
  it("linha de pacientes (lida pelo id) → aluno do seletor: foto só endereço (a regra da w13_foto_do_aluno), login, bloqueio e conta excluída", () => {
    const base = {
      id: "p9", nome: "Ana", apelido: null, email: null, telefone: null, cpf: null, foto_url: "https://x/f.jpg", ativo: true,
      acesso_bloqueado_em: null, user_id: null, personal_id: "u1", nutricionista_id: null, conta_excluida_em: null,
    };
    expect(alunoDaTabela(base)).toMatchObject({ foto_url: "https://x/f.jpg", tem_login: false, bloqueado: false, conta_excluida: false, ativo: true });
    expect(alunoDaTabela({ ...base, foto_url: "fotos/p9.jpg", user_id: "u9", acesso_bloqueado_em: "2026-10-01", ativo: false, conta_excluida_em: "2026-10-02" }))
      .toMatchObject({ foto_url: null, tem_login: true, bloqueado: true, ativo: false, conta_excluida: true });
  });
  it("o que a linha diz além do nome: conta excluída > desativado > bloqueado; contato ou 'sem contato'", () => {
    const a = alunoDoSeletor(aluno());
    expect(situacaoDoAluno(a)).toBe("");
    expect(situacaoDoAluno({ ...a, bloqueado: true })).toBe("bloqueado");
    expect(situacaoDoAluno({ ...a, ativo: false, bloqueado: true })).toBe("desativado");
    expect(situacaoDoAluno({ ...a, ativo: false, conta_excluida: true })).toBe("conta excluída");
    expect(contatoDoAluno(a)).toBe("rafael@x.com · (82) 99999-0000");
    expect(contatoDoAluno({ email: null, telefone: null })).toBe("sem contato");
  });
});
