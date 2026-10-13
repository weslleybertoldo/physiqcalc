// Physiq W-A P5 — "Meus alimentos e receitas" (spec §4.4, P6: só DELE — não entram na base da nutri): a lista (Alimentos · Receitas), criar,
// mudar e apagar o alimento por 100 g (com a porção de referência) e a receita (os ingredientes em gramas, achados na busca, e quantas
// porções rende; os macros de 1 porção antes de salvar). Apagar = lixeira, com a confirmação do app: o que ele já pôs nos dias segue pelo
// retrato. Tudo na mesma folha (a lista ↔ o formulário).
import { useEffect, useState } from "react";
import { ArrowLeft, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { excluirAlimento, excluirReceita, salvarAlimento, salvarReceita } from "@/aluno-dia/api";
import type { MeuAlimento, MinhaReceita } from "@/aluno-dia/tipos";
import { Campo, MensagemForm } from "@/entrada/pecas/Campo";
import { fmtKcal } from "@/nutricao/app/dietaUtil";
import { Botao } from "@/ui/premium/Botao";
import { Esqueleto } from "@/ui/premium/Estados";
import { Segmentado } from "@/ui/premium/Segmentado";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { useConfirmar } from "@/ui/premium/useConfirmar";
import {
  MACROS_DO_ALIMENTO, dadosDaReceita, dadosDoAlimento, formularioDaReceita, formularioDoAlimento, ingredienteDaBusca, macrosDaReceitaNoFormulario,
  textoDosMacros, validarAlimento, validarReceita, type CampoDaReceita, type CampoDoAlimento, type ErroDoCampo, type FormularioDaReceita,
  type FormularioDoAlimento,
} from "../regras";
import { TEXTOS } from "../textos";
import { useMinhaBiblioteca, type Gravacao } from "../useDietaLivre";
import { BuscaDeAlimentos } from "./BuscaDeAlimentos";

type Vista = { tipo: "lista" } | { tipo: "alimento"; alimento: MeuAlimento | null } | { tipo: "receita"; receita: MinhaReceita | null };
type Aba = "alimentos" | "receitas";

function FormAlimento({ alimento, ocupado, desligado, gravar, aoVoltar }: {
  alimento: MeuAlimento | null;
  ocupado: string | null;
  desligado: boolean;
  gravar: (g: Gravacao) => Promise<boolean>;
  aoVoltar: () => void;
}) {
  const confirmar = useConfirmar();
  const [f, setF] = useState<FormularioDoAlimento>(() => formularioDoAlimento(alimento));
  const [erro, setErro] = useState<ErroDoCampo<CampoDoAlimento> | null>(null);
  const mudar = (p: Partial<FormularioDoAlimento>) => {
    setF((x) => ({ ...x, ...p }));
    setErro(null);
  };
  const travado = desligado || !!ocupado;
  const salvar = async () => {
    const v = validarAlimento(f);
    if (v) {
      setErro(v);
      return;
    }
    const id = alimento?.id ?? null;
    if (await gravar({ chave: "alimento", fazer: () => salvarAlimento(id, dadosDoAlimento(f)), biblioteca: true, ok: TEXTOS.alimentoSalvo })) aoVoltar();
  };
  const apagar = async () => {
    if (!alimento) return;
    if (!(await confirmar({ titulo: "Apagar o alimento?", descricao: TEXTOS.alimentoApagarTexto, rotuloConfirmar: "Apagar", perigo: true }))) return;
    if (await gravar({ chave: "alimento-apagar", fazer: () => excluirAlimento(alimento.id), biblioteca: true, ok: TEXTOS.alimentoApagado })) aoVoltar();
  };
  const doCampo = (c: CampoDoAlimento) => (erro?.campo === c ? erro.mensagem : undefined);
  return (
    <div className="flex flex-col gap-4" data-form-alimento={alimento ? alimento.id : "novo"}>
      <Campo rotulo="Nome" value={f.nome} onChange={(e) => mudar({ nome: e.target.value })} maxLength={80} autoComplete="off"
        placeholder="Pão da padaria, whey da marca X…" erro={doCampo("nome")} data-alimento-nome />
      <Campo rotulo={TEXTOS.porcaoReferencia} inputMode="decimal" value={f.porcao_g} onChange={(e) => mudar({ porcao_g: e.target.value })}
        dica={TEXTOS.porcaoReferenciaDica} erro={doCampo("porcao_g")} data-alimento-porcao />
      <span className="text-[12.5px] font-semibold text-texto-2">{TEXTOS.por100}</span>
      <div className="grid grid-cols-2 gap-3">
        {MACROS_DO_ALIMENTO.map((m) => (
          <Campo key={m.chave} rotulo={m.rotulo} inputMode="decimal" value={f[m.chave]} placeholder="0" onChange={(e) => mudar({ [m.chave]: e.target.value })}
            erro={doCampo(m.chave)} data-alimento-macro={m.chave} />
        ))}
      </div>
      {erro && !erro.campo && <MensagemForm>{erro.mensagem}</MensagemForm>}
      <Botao variante="w" onClick={() => void salvar()} disabled={travado} data-alimento-salvar>{ocupado === "alimento" ? TEXTOS.salvando : TEXTOS.salvar}</Botao>
      {alimento && (
        <button type="button" onClick={() => void apagar()} disabled={travado} data-alimento-apagar
          className="pq-botao w-full border border-[var(--p-chip-r-borda)] bg-transparent text-rosa-3 disabled:opacity-45">
          <Trash2 aria-hidden /> {TEXTOS.apagar}
        </button>
      )}
    </div>
  );
}

function FormReceita({ receita, ocupado, desligado, gravar, aoVoltar }: {
  receita: MinhaReceita | null;
  ocupado: string | null;
  desligado: boolean;
  gravar: (g: Gravacao) => Promise<boolean>;
  aoVoltar: () => void;
}) {
  const confirmar = useConfirmar();
  const [f, setF] = useState<FormularioDaReceita>(() => formularioDaReceita(receita));
  const [erro, setErro] = useState<ErroDoCampo<CampoDaReceita> | null>(null);
  const [buscando, setBuscando] = useState(() => !receita);
  const [n, setN] = useState(0);
  const mudar = (p: Partial<FormularioDaReceita>) => {
    setF((x) => ({ ...x, ...p }));
    setErro(null);
  };
  const travado = desligado || !!ocupado;
  const macros = macrosDaReceitaNoFormulario(f, receita);
  const apagadoNaLista = f.itens.some((i) => !i.origem);
  const salvar = async () => {
    const v = validarReceita(f);
    if (v) {
      setErro(v);
      return;
    }
    const id = receita?.id ?? null;
    if (await gravar({ chave: "receita", fazer: () => salvarReceita(id, dadosDaReceita(f, !receita)), biblioteca: true, ok: TEXTOS.receitaSalva })) aoVoltar();
  };
  const apagar = async () => {
    if (!receita) return;
    if (!(await confirmar({ titulo: "Apagar a receita?", descricao: TEXTOS.receitaApagarTexto, rotuloConfirmar: "Apagar", perigo: true }))) return;
    if (await gravar({ chave: "receita-apagar", fazer: () => excluirReceita(receita.id), biblioteca: true, ok: TEXTOS.receitaApagada })) aoVoltar();
  };
  const doCampo = (c: CampoDaReceita) => (erro?.campo === c ? erro.mensagem : undefined);
  return (
    <div className="flex flex-col gap-4" data-form-receita={receita ? receita.id : "nova"}>
      <Campo rotulo="Nome" value={f.nome} onChange={(e) => mudar({ nome: e.target.value })} maxLength={80} autoComplete="off"
        placeholder="Vitamina de banana, bolo de caneca…" erro={doCampo("nome")} data-receita-nome />
      <Campo rotulo="Rende (porções)" inputMode="numeric" value={f.porcoes} onChange={(e) => mudar({ porcoes: e.target.value })} erro={doCampo("porcoes")} data-receita-porcoes />
      <div className="flex flex-col gap-2" data-receita-itens={f.itens.length}>
        <span className="text-[12.5px] font-semibold text-texto-2">{TEXTOS.ingredientes}</span>
        {f.itens.length === 0 && <p className="text-[12.5px] text-texto-3">{TEXTOS.semIngredientes}</p>}
        {f.itens.map((i) => (
          <div key={i.chave} className="flex items-end gap-2" data-receita-item={i.chave}>
            <span className="min-w-0 flex-1 pb-3 text-[13px] font-medium text-texto">
              <span className={i.origem ? "block truncate" : "block truncate text-texto-3 line-through"}>{i.nome}</span>
            </span>
            <span className="w-24 flex-none">
              <Campo rotulo="g" inputMode="decimal" value={i.quantidade_g} disabled={!i.origem}
                onChange={(e) => mudar({ itens: f.itens.map((x) => (x.chave === i.chave ? { ...x, quantidade_g: e.target.value } : x)), itensMudaram: true })}
                data-receita-item-qtd={i.chave} />
            </span>
            <button type="button" aria-label={`Tirar ${i.nome} da receita`} onClick={() => mudar({ itens: f.itens.filter((x) => x.chave !== i.chave), itensMudaram: true })}
              className="mb-1.5 flex h-9 w-9 flex-none items-center justify-center rounded-xl border border-linha bg-superficie-2 text-texto-3" data-receita-item-tirar={i.chave}>
              <X aria-hidden className="h-4 w-4" />
            </button>
          </div>
        ))}
        {apagadoNaLista && <p className="text-[12px] text-ambar-3" data-receita-apagado>{TEXTOS.ingredienteApagado}</p>}
        {doCampo("itens") && <MensagemForm data-receita-erro-itens>{doCampo("itens")}</MensagemForm>}
        {buscando ? (
          <BuscaDeAlimentos ativo semReceitas aoEscolher={(x) => {
            mudar({ itens: [...f.itens, ingredienteDaBusca(x, `novo-${n}`)], itensMudaram: true });
            setN((k) => k + 1);
            setBuscando(false);
          }} />
        ) : (
          <Botao variante="g" tamanho="sm" icone={Plus} className="self-start" onClick={() => setBuscando(true)} disabled={f.itens.length >= 30} data-receita-adicionar>
            {TEXTOS.adicionarIngrediente}
          </Botao>
        )}
      </div>
      <p className="text-[12.5px] text-texto-2" data-receita-por-porcao={macros ? Math.round(Number(macros.energia_kcal) || 0) : ""}>
        {TEXTOS.porPorcao}: {textoDosMacros(macros)}
      </p>
      {erro && !erro.campo && <MensagemForm>{erro.mensagem}</MensagemForm>}
      <Botao variante="w" onClick={() => void salvar()} disabled={travado} data-receita-salvar>{ocupado === "receita" ? TEXTOS.salvando : TEXTOS.salvar}</Botao>
      {receita && (
        <button type="button" onClick={() => void apagar()} disabled={travado} data-receita-apagar
          className="pq-botao w-full border border-[var(--p-chip-r-borda)] bg-transparent text-rosa-3 disabled:opacity-45">
          <Trash2 aria-hidden /> {TEXTOS.apagar}
        </button>
      )}
    </div>
  );
}

export function FolhaMeusAlimentos({ aberta, aoMudar, ocupado, desligado, gravar }: {
  aberta: boolean;
  aoMudar: (aberta: boolean) => void;
  ocupado: string | null;
  desligado: boolean;
  gravar: (g: Gravacao) => Promise<boolean>;
}) {
  const [vista, setVista] = useState<Vista>({ tipo: "lista" });
  const [aba, setAba] = useState<Aba>("alimentos");
  const bib = useMinhaBiblioteca(aberta);
  useEffect(() => {
    if (aberta) setVista({ tipo: "lista" });
  }, [aberta]);

  const titulo = vista.tipo === "alimento" ? (vista.alimento ? TEXTOS.mudarAlimento : TEXTOS.novoAlimento)
    : vista.tipo === "receita" ? (vista.receita ? TEXTOS.mudarReceita : TEXTOS.novaReceita) : TEXTOS.meus;
  const voltar = () => setVista({ tipo: "lista" });

  let corpo: React.ReactNode;
  if (vista.tipo === "alimento") {
    corpo = <FormAlimento key={vista.alimento?.id ?? "novo"} alimento={vista.alimento} ocupado={ocupado} desligado={desligado} gravar={gravar} aoVoltar={voltar} />;
  } else if (vista.tipo === "receita") {
    corpo = <FormReceita key={vista.receita?.id ?? "nova"} receita={vista.receita} ocupado={ocupado} desligado={desligado} gravar={gravar} aoVoltar={voltar} />;
  } else if (!bib.data) {
    corpo = bib.isError ? (
      <span className="flex items-center justify-between gap-3" data-meus-estado="erro">
        <span className="text-[12.5px] text-texto-2">{TEXTOS.bibliotecaErro}</span>
        <Botao tamanho="sm" icone={RefreshCw} onClick={() => void bib.refetch()}>Tentar de novo</Botao>
      </span>
    ) : (
      <div role="status" aria-busy="true" aria-label="Carregando" className="flex flex-col gap-2" data-meus-estado="carregando">
        {[0, 1, 2].map((i) => <Esqueleto key={i} className="h-12 w-full rounded-xl" />)}
      </div>
    );
  } else {
    const alimentos = bib.data.alimentos;
    const receitas = bib.data.receitas;
    corpo = (
      <div className="flex flex-col gap-3" data-meus-estado="lista" data-meus-alimentos={alimentos.length} data-minhas-receitas={receitas.length}>
        <Segmentado<Aba> rotulo="Meus alimentos ou receitas" className="self-start" valor={aba} aoMudar={setAba}
          opcoes={[{ valor: "alimentos", rotulo: `${TEXTOS.alimentos} (${alimentos.length})` }, { valor: "receitas", rotulo: `${TEXTOS.receitas} (${receitas.length})` }]} />
        {aba === "alimentos" ? (
          <>
            {alimentos.length === 0 && <p className="text-[12.5px] leading-snug text-texto-3">{TEXTOS.semAlimentos}</p>}
            <ul className="flex flex-col gap-1.5">
              {alimentos.map((a) => (
                <li key={a.id}>
                  <button type="button" onClick={() => setVista({ tipo: "alimento", alimento: a })} data-meu-alimento={a.id}
                    className="flex w-full items-center gap-3 rounded-xl border border-linha bg-superficie px-3 py-2.5 text-left">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium text-texto">{a.nome}</span>
                      <span className="block truncate text-[11.5px] text-texto-3">{fmtKcal(Number(a.energia_kcal))} kcal em 100 g · porção {Number(a.porcao_g)} g</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <Botao variante="g" icone={Plus} onClick={() => setVista({ tipo: "alimento", alimento: null })} disabled={desligado} data-meus-novo-alimento>{TEXTOS.novoAlimento}</Botao>
          </>
        ) : (
          <>
            {receitas.length === 0 && <p className="text-[12.5px] leading-snug text-texto-3">{TEXTOS.semReceitas}</p>}
            <ul className="flex flex-col gap-1.5">
              {receitas.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => setVista({ tipo: "receita", receita: r })} data-minha-receita={r.id}
                    className="flex w-full items-center gap-3 rounded-xl border border-linha bg-superficie px-3 py-2.5 text-left">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium text-texto">{r.nome}</span>
                      <span className="block truncate text-[11.5px] text-texto-3">
                        {r.porcoes} {r.porcoes === 1 ? "porção" : "porções"} · {fmtKcal(Number(r.por_porcao.energia_kcal))} kcal a porção · {r.itens.length} ingrediente{r.itens.length === 1 ? "" : "s"}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <Botao variante="g" icone={Plus} onClick={() => setVista({ tipo: "receita", receita: null })} disabled={desligado} data-meus-nova-receita>{TEXTOS.novaReceita}</Botao>
          </>
        )}
      </div>
    );
  }

  return (
    <PainelDeslizante aberto={aberta} aoMudar={(v) => !ocupado && aoMudar(v)} titulo={titulo}
      descricao={vista.tipo === "lista" ? "Só seus: a nutricionista vê quando você usa no dia." : undefined}>
      <div className="flex flex-col gap-4 pt-1" data-folha-meus={vista.tipo}>
        {vista.tipo !== "lista" && (
          <Botao variante="g" tamanho="sm" icone={ArrowLeft} className="self-start" onClick={voltar} disabled={!!ocupado} data-meus-voltar>{TEXTOS.meus}</Botao>
        )}
        {corpo}
      </div>
    </PainelDeslizante>
  );
}
