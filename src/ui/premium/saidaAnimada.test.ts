import { describe, expect, it } from "vitest";
import { arquivosDoApp, lerDoApp, semComentarios } from "@/test/fonte";

// hml-18a (H-40, D) — guarda da saída animada (lê a fonte; Skill-wbs-navegacao, princípio 1: entrada E saída, sempre). O que já
// entrava e saía seco: o Sino (7–17 ms), a Busca (48–120 ms), o menu do usuário, 3 menus sem animação nenhuma, os painéis que o
// pai desmontava com `aberto` fixo e as sobreposições próprias que sumiam no mesmo quadro. Base = 0 em tudo.

/** Os literais de texto ("…", '…', `…`) do código, já sem os comentários. */
function literais(fonte: string): string[] {
  const limpo = semComentarios(fonte);
  return [...limpo.matchAll(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g)].map((m) => m[0]);
}

/** As classes que entram animadas (data-[state=open]:animate-in) sem a saída espelhada no mesmo literal. */
function entraSemSair(fonte: string): string[] {
  return literais(fonte)
    .filter((l) => l.includes("data-[state=open]:animate-in") && !l.includes("data-[state=closed]:animate-out"))
    .map((l) => l.slice(0, 90));
}

/**
 * Painel/janela com `aberto`/`aberta`/`open` FIXO (o atributo sem valor): quem fecha é a desmontagem do pai — a saída nunca anima.
 * O certo é o painel montado com `aberto={Boolean(x)}` e o último valor enquanto sai (useUltimoValor).
 */
function abertoFixo(fonte: string): string[] {
  const limpo = semComentarios(fonte).replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g, (s) => s.replace(/[^\n]/g, " "));
  const achados: string[] = [];
  for (const m of limpo.matchAll(/<([A-Z][\w.]*)(?=[\s/>])/g)) {
    // a tag de abertura até o ">" de fora das chaves; o que está dentro de {…} (expressões, setas) vira espaço — só os atributos
    // do nível de fora contam
    let tag = "";
    let nivel = 0;
    for (let i = m.index + m[0].length; i < limpo.length; i++) {
      const c = limpo[i];
      if (c === "{") nivel += 1;
      if (nivel === 0 && c === ">") {
        tag += c;
        break;
      }
      tag += nivel > 0 && c !== "\n" ? " " : c;
      if (c === "}") nivel -= 1;
    }
    for (const a of tag.matchAll(/\s(aberto|aberta|open)(?=\s|\/?>)/g)) {
      achados.push(`${limpo.slice(0, m.index).split("\n").length}: <${m[1]} ${a[1]}>`);
    }
  }
  return achados;
}

/** O anti-padrão do front.py (B18 modal_sem_saida_animada): `{x && <div className="fixed … inset-0 …">` sem saída. */
function sobreposicaoSeca(fonte: string): string[] {
  return [...semComentarios(fonte).matchAll(/\{\s*!?[\w.]+\s*&&\s*\(?\s*<div\b[^>]*?\bfixed\b[^>]*?\binset-0\b/g)].map((m) => m[0].slice(0, 80));
}

// components/ui/menubar.tsx: o primitivo do shadcn que nenhuma tela usa (registrado na spec §2.4 item 6); o 1º conteúdo dele vem do
// gerador sem o animate-out. Fica de fora com motivo — se uma tela passar a usá-lo, a linha sai daqui e a guarda pega.
const FORA = new Set(["components/ui/menubar.tsx"]);

describe("saída animada (hml-18a, H-40 D): tudo que entra animado também sai animado", () => {
  it("toda className com data-[state=open]:animate-in tem data-[state=closed]:animate-out no mesmo literal — base = 0", () => {
    const achados: string[] = [];
    for (const c of arquivosDoApp(/\.tsx$/)) {
      if (FORA.has(c)) continue;
      for (const a of entraSemSair(lerDoApp(c))) achados.push(`${c}: ${a}`);
    }
    expect(achados).toEqual([]);
  });

  it("nenhum painel/janela com `aberto` fixo (o pai desmontando = saída seca) — base = 0 (eram 6 da spec + 5 avisos globais)", () => {
    const achados: string[] = [];
    for (const c of arquivosDoApp(/\.tsx$/)) for (const a of abertoFixo(lerDoApp(c))) achados.push(`${c}:${a}`);
    expect(achados).toEqual([]);
  });

  it("nenhuma sobreposição própria `{x && <div className=\"fixed inset-0 …\">` (some no mesmo quadro)", () => {
    const achados: string[] = [];
    for (const c of arquivosDoApp(/\.tsx$/)) for (const a of sobreposicaoSeca(lerDoApp(c))) achados.push(`${c}: ${a}`);
    expect(achados).toEqual([]);
  });

  it("a guarda lê de verdade: os primitivos que já entravam e saíam continuam na conta", () => {
    const comSaida = arquivosDoApp(/\.tsx$/).filter((c) => literais(lerDoApp(c)).some((l) => l.includes("data-[state=closed]:animate-out")));
    for (const c of ["components/ui/dialog.tsx", "components/ui/alert-dialog.tsx", "components/ui/dropdown-menu.tsx", "ui/premium/Sheet.tsx", "ui/premium/Sino.tsx", "ui/premium/Busca.tsx"]) {
      expect(comSaida).toContain(c);
    }
  });

  it("o PainelDeslizante (as ~66 folhas) no ritmo da skill: fundo 200 ms; a folha entra 300 ms ease-out e sai 200 ms ease-in", () => {
    const sheet = lerDoApp("ui/premium/Sheet.tsx");
    expect(sheet).toContain("bg-black/55 duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0");
    expect(sheet).toContain(
      "data-[state=closed]:animate-out data-[state=closed]:duration-200 data-[state=closed]:ease-in data-[state=open]:animate-in data-[state=open]:duration-300 data-[state=open]:ease-out",
    );
  });

  it("as sobreposições próprias da spec saem pelo useSaidaAnimada (montadas com data-state=closed até o fim da saída)", () => {
    for (const c of [
      "ui/avisos/AvisoSenhaProvisoria.tsx",
      "treino/ui/CartaoDescanso.tsx",
      "app-aluno/abas/Treino.tsx",
      "components/UpdateChecker.tsx",
      "components/PWAInstallBanner.tsx",
      "painel/treinos/SeletorAlunoTreino.tsx",
      "nutricao/prontuario/ui/MedicamentoDialog.tsx",
      "master/app/PratosProntos.tsx",
    ]) {
      const fonte = lerDoApp(c);
      expect(fonte, c).toMatch(/useSaidaAnimada<\w+>\(/);
      expect(fonte, c).toMatch(/data-state=\{\w+\.estado\}/);
      expect(fonte, c).toContain("data-[state=closed]:fill-mode-forwards");
    }
  });

  it.each([
    ['<div className="fixed data-[state=open]:animate-in data-[state=open]:fade-in-0" />', "só a entrada"],
    ["cn(`z-50 data-[state=open]:animate-in data-[state=open]:zoom-in-95`, x)", "template só com a entrada"],
  ])("pega a entrada sem saída: %s (%s)", (fonte) => {
    expect(entraSemSair(fonte)).toHaveLength(1);
  });

  it.each([
    ['<div className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />', "entra e sai"],
    ['<div className="animate-in fade-in-0" />', "entrada sem data-state (ex.: o tooltip) não é desta regra"],
    ['// className="data-[state=open]:animate-in"', "comentário"],
  ])("não pega: %s (%s)", (fonte) => {
    expect(entraSemSair(fonte)).toEqual([]);
  });

  it.each([
    ["<PainelDeslizante aberto aoMudar={(a) => !a && fechar()} titulo=\"x\">", "na mesma linha, depois de uma seta"],
    ["<PainelDeslizante\n  aberto\n  lado={celular ? \"baixo\" : \"direita\"}\n>", "numa linha só dele"],
    ["<Janela aberta aoMudar={f} titulo=\"t\" />", "a Janela do master"],
    ["<SheetSenhaAluno aberto criar={false} />", "a folha da senha"],
    ["<ConfirmarVinculo codigo={c} aberto aoFechar={f} />", "o popup do vínculo"],
  ])("pega o aberto fixo: %s (%s)", (fonte) => {
    expect(abertoFixo(fonte)).toHaveLength(1);
  });

  it.each([
    ["<PainelDeslizante aberto={Boolean(membro)} aoMudar={f} titulo=\"x\">", "controlado"],
    ["<PainelDeslizante aberto={x} titulo=\"O app aberto no celular\">", "a palavra num texto"],
    ["<p>Com o app aberto, o aviso aparece na tela.</p>", "texto de parágrafo"],
    ["<Dialog open={aberta} onOpenChange={f}>", "o open controlado"],
    ["<RegistroDiarioDialog\n  open={modal.aberto}\n  onOpenChange={(aberto) => setModal((m) => ({ ...m, aberto }))}\n/>", "a palavra dentro de uma expressão"],
    ["<ChevronDown aria-hidden className={cn(\"h-4 w-4\", aberto && \"rotate-180\")} />", "a palavra dentro do cn()"],
    ["const [editando, setEditando] = useState<Momento | null>(null);", "um tipo genérico"],
  ])("não pega: %s (%s)", (fonte) => {
    expect(abertoFixo(fonte)).toEqual([]);
  });

  it("pega a sobreposição própria seca: {aberto && <div className=\"fixed inset-0\">", () => {
    expect(sobreposicaoSeca('{aberto && <div className="fixed inset-0 z-50 bg-black/50" />}')).toHaveLength(1);
    expect(sobreposicaoSeca('{saida.montado && <div ref={saida.ref} data-state={saida.estado} className="absolute" />}')).toEqual([]);
  });
});
