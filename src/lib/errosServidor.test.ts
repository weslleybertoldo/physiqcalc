import { describe, expect, it } from "vitest";
import {
  assinatura,
  criarTrava,
  limparLugar,
  limparMensagem,
  limparRota,
  montarAviso,
  ondeDoErro,
  type ErroParaAviso,
} from "../../supabase-principal/functions/_shared/erros";

// PAT falso montado aqui: o literal no formato de um PAT do Supabase trava o push (secret scanning do GitHub).
const PAT_FALSO = ["sbp", "0123456789abcdef".repeat(2) + "01234567"].join("_");

// Homologação hml-10 (H-24 e H-26, D4) — o saneador dos avisos de erro e dos logs (supabase-principal/functions/_shared/erros.ts,
// cópia idêntica no Treino). Nada de dado pessoal nem segredo no texto que vai para o log, para o banco e para o Telegram.

// [texto cru, o que não pode sobrar, o que entra no lugar]
const CARGAS: Array<[string, string, string]> = [
  // as do Nativo OS (features/erros/limpar.test.ts)
  ["duplicate key (email)=(maria.silva@gmail.com)", "maria.silva", "(email)=(?)"],
  ["cliente 123.456.789-09 sem cadastro", "123.456.789-09", "[cpf]"],
  ["cliente 12345678909 sem cadastro", "12345678909", "[cpf]"],
  ["loja 12.345.678/0001-95 bloqueada", "12.345.678/0001-95", "[cnpj]"],
  ["whats (82) 99876-5432 inválido", "99876-5432", "[telefone]"],
  ["fone +55 82 998765432 inválido", "998765432", "[telefone]"],
  ["imei 356789012345678 repetido", "356789012345678", "[número]"],
  ["Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.abcDEF123 inválido", "eyJhbGci", "Bearer [token]"],
  ["chave sb_secret_AbCdEf123456789 recusada", "sb_secret_", "[token]"],
  ["mp APP_USR-1234567890-abcdef recusou", "APP_USR-", "[token]"],
  ["bot 1234567890:AAHk3j4k5l6m7n8o9p0qRsTuVwXyZ12345 caiu", "AAHk3j", "[token]"],
  ["falhou em https://nativoos.com.br/os-online/abc?token=segredo123&email=x@y.com", "segredo123", "https://nativoos.com.br/os-online/abc"],
  // as do Physiq
  ["e-mail maria.silva@gmail.com não confirmado", "maria.silva@gmail.com", "[e-mail]"],
  ["convite para maria.silva%40gmail.com falhou", "maria.silva%40gmail.com", "[e-mail]"],
  ["jwt eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.c2lnbmF0dXJh vencido", "eyJhbGciOiJIUzI1NiJ9", "[token]"],
  [`pat ${PAT_FALSO} recusado`, "sbp_0123", "[token]"],
  ["publishable sb_publishable_AbCdEf123456 recusada", "sb_publishable_", "[token]"],
  ["mp TEST-1234567890-abcdef recusou", "TEST-1234567890", "[token]"],
  ["voltou com com.physiq.app://login#access_token=eyJabc.def.ghi&refresh_token=xyz", "access_token", "com.physiq.app://login"],
  ["/entrar#access_token=abc123&refresh_token=def falhou", "access_token", "/entrar falhou"],
  ["GET /rest/v1/pacientes?nome=eq.Maria%20Silva&email=eq.x%40y.com falhou", "Maria", "GET /rest/v1/pacientes falhou"],
  ["fone 82998765432 inválido", "82998765432", "[cpf]"],
  ["celular (82) 3214-5678 fixo", "3214-5678", "[telefone]"],
  ["pedido ref_12345678909 e 1759912345678", "12345678909", "ref_[número]"],
  ['invalid input syntax for type uuid: "joao silva"', "joao", ': "?"'],
  [`Unexpected token 'J', "João Silv"... is not valid JSON`, "João", '"?" is not valid JSON'],
  ["Key (cpf)=(123.456.789-09) already exists.", "123.456", "(cpf)=(?)"],
  ["conexão de 200.123.45.67 recusada", "200.123.45.67", "[ip]"],
  ["ipv6 2804:14c:5b80:8a0e::1 recusado", "2804:14c", "[ip]"],
  ["aluno 0b9c6f1e-2a3b-4c5d-8e9f-001122334455 sumiu", "0b9c6f1e", "[id]"],
  ["apikey=abcdef123 recusada", "abcdef123", "apikey=[token]"],
  ["senha: minhaSenha!23 errada", "minhaSenha", "senha: [token]"],
  ["segredo a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8 vazou", "a1b2c3d4e5f6", "[token]"],
  ["base64 QWxhZGRpbjpvcGVuIHNlc2FtZQ+abcDEF/12345678901234567890== vazou", "QWxhZGRp", "[token]"],
];

// texto técnico que tem de ficar igual
const SEM_MUDANCA = [
  "Cannot read properties of undefined (reading 'nome')",
  "x is not a function",
  "Failed to fetch",
  "falhou na linha 12",
  "às 12:30:45 deu ruim",
  "HTTP 502 na cobranca-conta",
  'duplicate key value violates unique constraint "profiles_email_key"',
  'new row for relation "pacientes" violates check constraint "nome_curto"',
  "rota /rest/v1/rpc/registrar_aviso_erro respondeu 500",
  "PGRST116: JSON object requested, multiple (or no) rows returned",
];

describe("limparMensagem — nada de dado pessoal nem segredo", () => {
  it.each(CARGAS)("%s", (bruta, nao, sim) => {
    const limpa = limparMensagem(bruta);
    expect(limpa).not.toContain(nao);
    expect(limpa).toContain(sim);
  });

  it.each(SEM_MUDANCA)("texto técnico fica igual: %s", (texto) => {
    expect(limparMensagem(texto)).toBe(texto);
  });

  it("é idempotente (limpar 2× = limpar 1×): o app e o servidor chegam ao mesmo código", () => {
    for (const texto of [...CARGAS.map(([b]) => b), ...SEM_MUDANCA, "x ".repeat(400), "🙂".repeat(400)]) {
      const uma = limparMensagem(texto);
      expect(limparMensagem(uma)).toBe(uma);
    }
  });

  it("corta em 300 caracteres (ou no limite pedido), junta espaços e tira caracteres invisíveis", () => {
    const limpa = limparMensagem(`linha   1\n\n${"x ".repeat(400)}`);
    expect(limpa.length).toBe(300);
    expect(limpa.endsWith("…")).toBe(true);
    expect(limpa.startsWith("linha 1 x")).toBe(true);
    expect(limparMensagem("y ".repeat(400), 200).length).toBe(200);
    const invisiveis = [0x00, 0x07, 0x1b, 0x7f, 0x200b, 0x2028, 0x202e, 0x2066, 0xfeff].map((c) => String.fromCharCode(c)).join("");
    expect(limparMensagem(`a${invisiveis}b`)).toBe("a b");
  });

  it("não parte um emoji ao meio no corte", () => {
    const limpa = limparMensagem(`${"a".repeat(298)}🙂🙂🙂`);
    const ultimo = limpa.charCodeAt(limpa.length - 2);
    expect(limpa.endsWith("…")).toBe(true);
    expect(ultimo >= 0xd800 && ultimo <= 0xdbff).toBe(false);
  });

  it("vazio, nulo e indefinido viram texto vazio", () => {
    expect(limparMensagem("")).toBe("");
    expect(limparMensagem("   \n ")).toBe("");
    expect(limparMensagem(null)).toBe("");
    expect(limparMensagem(undefined)).toBe("");
  });

  it("texto enorme (página HTML dentro do erro) é cortado antes de limpar, sem meio e-mail no corte", () => {
    const pagina = `${"palavra ".repeat(499)}maria.silva@gmail.com ${"fim ".repeat(500)}`;
    const limpa = limparMensagem(pagina);
    expect(limpa).not.toContain("maria");
    expect(limpa.length).toBeLessThanOrEqual(300);
    expect(limparMensagem("x".repeat(5000))).toBe("[texto longo]");
  });

  it("limparLugar limpa e corta em 60", () => {
    expect(limparLugar("aba do aluno")).toBe("aba do aluno");
    expect(limparLugar(`aba de maria@x.com ${"y".repeat(80)}`)).not.toContain("maria");
    expect(limparLugar("z ".repeat(80)).length).toBe(60);
  });
});

describe("limparRota — sem query, sem #, sem id nem código do link", () => {
  it.each([
    ["/c/ABC123", "/c/:codigo"],
    ["/d/xyz9", "/d/:codigo"],
    ["/f/avaliacao-maria", "/f/:codigo"],
    ["/p/QWERTY?x=1", "/p/:codigo"],
    ["/painel/alunos/0b9c6f1e-2a3b-4c5d-8e9f-001122334455/editar", "/painel/alunos/:id/editar"],
    ["https://physiqcalc.com.br/painel/123?aba=1#x", "/painel/:n"],
    ["/entrar#access_token=eyJhbGciOi&refresh_token=abc", "/entrar"],
    ["com.physiq.app://login-callback#access_token=eyJ", "/login-callback"],
    ["capacitor://localhost/painel/123?x=1", "/painel/:n"],
    ["https://localhost/agenda", "/agenda"],
    ["/busca/jo%C3%A3o", "/busca/:texto"],
    ["/busca/joão silva", "/busca/:texto"],
    ["/convite/maria@gmail.com", "/convite/:e-mail"],
    ["/x/Xk3j9QpL2mN8vB7cT1zR4yW6", "/x/:token"],
    ["/painel/alunos/:id", "/painel/alunos/:id"],
    ["painel", "/painel"],
    ["https://physiqcalc.com.br", "/"],
    ["?email=x@y.com", "/"],
    ["", ""],
  ])("%s → %s", (bruta, esperada) => {
    expect(limparRota(bruta)).toBe(esperada);
  });

  it("até 120 caracteres: o resto vira /:mais; idempotente", () => {
    const longa = limparRota(`/${"abcdefghij/".repeat(20)}`);
    expect(longa.length).toBeLessThanOrEqual(120);
    expect(longa.endsWith("/:mais")).toBe(true);
    for (const r of ["/c/ABC123", "/convite/maria@gmail.com", "/busca/jo%C3%A3o", `/${"abcdefghij/".repeat(20)}`, "/a/12/b"]) {
      expect(limparRota(limparRota(r))).toBe(limparRota(r));
    }
  });
});

describe("assinatura — o código de 8 caracteres que a tela mostra e o aviso repete", () => {
  const tela: ErroParaAviso = {
    origem: "tela",
    rota: "/painel/alunos/0b9c6f1e-2a3b-4c5d-8e9f-001122334455",
    lugar: "aba do aluno",
    mensagem: "Cannot read properties of undefined (reading 'nome')",
  };
  const servidor: ErroParaAviso = {
    origem: "servidor",
    funcao: "cobranca-conta",
    codigo: "mp_pix_falhou",
    status: 502,
    acao: "pix_criar",
    mensagem: "mp_erro bad_request · mp_causas 2067",
  };

  it("8 hex, estável entre versões (FNV-1a de 32 bits: mudar a conta muda todos os códigos)", () => {
    expect(assinatura(tela)).toBe("65f98d61");
    expect(assinatura(servidor)).toBe("0b521190");
    expect(assinatura({ origem: "tela" })).toBe("b984b701"); // FNV-1a("tela||||||||"), conferido fora do JS
    expect(assinatura(tela)).toMatch(/^[0-9a-f]{8}$/);
  });

  it("cru ou já limpo dá o mesmo código (o app calcula; o servidor recalcula do corpo)", () => {
    const limpo: ErroParaAviso = { ...tela, rota: limparRota(tela.rota), mensagem: limparMensagem(tela.mensagem), lugar: limparLugar(tela.lugar) };
    expect(assinatura(limpo)).toBe(assinatura(tela));
    expect(assinatura({ ...tela, rota: "/painel/alunos/11111111-2222-4333-8444-555555555555?aba=x#y" })).toBe(assinatura(tela));
  });

  it("números trocados por #: o mesmo erro em outra linha conta igual; outra tela ou outra função, não", () => {
    const a = assinatura({ origem: "tela", rota: "/painel", mensagem: "falhou na linha 12" });
    expect(assinatura({ origem: "tela", rota: "/painel", mensagem: "falhou na linha 13" })).toBe(a);
    expect(assinatura({ origem: "tela", rota: "/agenda", mensagem: "falhou na linha 12" })).not.toBe(a);
    expect(assinatura({ ...servidor, funcao: "pagamentos-aluno" })).not.toBe(assinatura(servidor));
    expect(assinatura({ ...servidor, banco: "treino" })).not.toBe(assinatura(servidor));
  });

  it("versão, plataforma e a tela de quem viu a função cair não mudam o código", () => {
    expect(assinatura({ ...tela, versao: "3.74", plataforma: "app" })).toBe(assinatura(tela));
    const funcao: ErroParaAviso = { origem: "funcao", funcao: "painel-resumo-treino", banco: "treino", status: 503 };
    expect(assinatura({ ...funcao, rota: "/painel" })).toBe(assinatura({ ...funcao, rota: "/agenda" }));
  });
});

describe("montarAviso — o texto do Telegram (spec D4)", () => {
  it("tela no staging, com versão, plataforma e segurados", () => {
    const texto = montarAviso(
      {
        origem: "tela",
        rota: "/painel/alunos/0b9c6f1e-2a3b-4c5d-8e9f-001122334455?aba=1",
        lugar: "aba do aluno",
        mensagem: "Cannot read properties of undefined (reading 'nome')",
        versao: "3.74",
        plataforma: "app",
      },
      { schema: "staging", segurados: 3 },
    );
    expect(texto).toBe(
      [
        "🔴 Erro no Physiq [staging]",
        "📍 tela · /painel/alunos/:id (aba do aluno)",
        "💬 Cannot read properties of undefined (reading 'nome')",
        "🧩 v3.74 · app",
        "🔑 65f98d61",
        "🔁 +3 iguais segurados",
      ].join("\n"),
    );
  });

  it("função do principal na produção: sem [staging], sem 🔁 quando ninguém foi segurado", () => {
    const texto = montarAviso(
      { origem: "servidor", funcao: "cobranca-conta", codigo: "mp_pix_falhou", status: 502, acao: "pix_criar", mensagem: "mp_erro bad_request · mp_causas 2067" },
      { schema: "public", segurados: 0 },
    );
    expect(texto).toBe(
      [
        "🔴 Erro no Physiq",
        "📍 função cobranca-conta · mp_pix_falhou · HTTP 502 · ação pix_criar",
        "💬 mp_erro bad_request · mp_causas 2067",
        "🧩 servidor",
        "🔑 0b521190",
      ].join("\n"),
    );
  });

  it("função do Treino que o app viu cair (5xx), com 1 segurado", () => {
    const erro: ErroParaAviso = { origem: "funcao", funcao: "painel-resumo-treino", banco: "treino", status: 503, rota: "/painel?x=1", versao: "v3.74", plataforma: "site" };
    expect(montarAviso(erro, { schema: "public", segurados: 1 })).toBe(
      [
        "🔴 Erro no Physiq",
        "📍 função painel-resumo-treino (Treino) · HTTP 503 · na tela /painel",
        "🧩 v3.74 · site",
        `🔑 ${assinatura(erro)}`,
        "🔁 +1 igual segurado",
      ].join("\n"),
    );
  });

  it("não leva e-mail, CPF, telefone, token, query nem # — e nada de Markdown/HTML montado", () => {
    const texto = montarAviso(
      {
        origem: "promessa",
        rota: "/entrar?email=maria@x.com#access_token=eyJabcdefghij",
        lugar: "login de maria@x.com",
        mensagem: "falhou para maria@x.com cpf 123.456.789-09 tel (82) 99876-5432 Bearer eyJhbGciOiJIUzI1NiJ9.e30.abc",
        versao: "3.74<b>",
        plataforma: "outra",
      },
      { schema: "staging" },
    );
    for (const proibido of ["maria", "123.456", "99876", "eyJ", "access_token", "?email", "<b>", "outra"]) expect(texto).not.toContain(proibido);
    expect(texto).toContain("📍 promessa sem catch · /entrar (login de [e-mail])");
    expect(texto).not.toContain("🧩"); // versão e plataforma fora do formato não entram
  });

  it("ondeDoErro: sincronização, rota desconhecida e função sem nome", () => {
    expect(ondeDoErro({ origem: "sync", rota: "/treino/hoje" })).toBe("sincronização · /treino/hoje");
    expect(ondeDoErro({ origem: "tela" })).toBe("tela · (rota desconhecida)");
    expect(ondeDoErro({ origem: "servidor", funcao: "Nome Errado", codigo: "x" })).toBe("função ? · x");
  });
});

describe("criarTrava — 1 aviso igual a cada 10 min na memória da instância", () => {
  it("segura dentro da janela e solta depois; cada chave é uma", () => {
    const trava = criarTrava(10 * 60 * 1000);
    expect(trava.segura("staging:a1b2c3d4", 0)).toBe(false);
    expect(trava.segura("staging:a1b2c3d4", 9 * 60 * 1000)).toBe(true);
    expect(trava.segura("public:a1b2c3d4", 9 * 60 * 1000)).toBe(false);
    expect(trava.segura("staging:a1b2c3d4", 10 * 60 * 1000)).toBe(false);
    expect(trava.segura("staging:a1b2c3d4", 15 * 60 * 1000)).toBe(true);
  });

  it("guarda no máximo N chaves (as vencidas saem primeiro, depois as mais antigas)", () => {
    const trava = criarTrava(1000, 3);
    trava.segura("a", 0);
    trava.segura("b", 0);
    trava.segura("c", 500);
    trava.segura("d", 1200); // a e b venceram e saem
    expect(trava.segura("c", 1300)).toBe(true);
    trava.segura("e", 1300);
    trava.segura("f", 1300); // passou de 3: sai a mais antiga (c)
    expect(trava.segura("c", 1400)).toBe(false);
  });
});
