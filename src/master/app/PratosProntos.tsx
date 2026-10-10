import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Salad, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Botao } from "@/ui/premium/Botao";
import { Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { EstadoCarregando, EstadoErro, EstadoVazio } from "@/ui/premium/Estados";
import { buscarAlimentos, ErroMaster, pratosProntos, salvarPrato } from "../api";
import { Campo, INPUT, Janela, SELECT, TEXTAREA } from "../pecas/ui";
import { textoErro } from "../regras";
import type { ItemPrato, Prato } from "../tipos";
import { OBJETIVOS, ROTULO_OBJETIVO } from "./treinosProntos";

const REFEICOES: Array<{ id: Prato["refeicao"]; rotulo: string }> = [
  { id: "cafe_da_manha", rotulo: "Café da manhã" }, { id: "almoco", rotulo: "Almoço" }, { id: "lanche", rotulo: "Lanche" },
  { id: "jantar", rotulo: "Jantar" }, { id: "ceia", rotulo: "Ceia" },
];
const ROTULO_REFEICAO = Object.fromEntries(REFEICOES.map((r) => [r.id, r.rotulo])) as Record<string, string>;
const kcalDoPrato = (p: Pick<Prato, "itens">) => Math.round(p.itens.reduce((s, i) => s + (i.kcal ?? 0), 0));

function BuscaTaco({ aoEscolher }: { aoEscolher: (a: { id: string; nome: string; energia_kcal: number | null }) => void }) {
  const [termo, setTermo] = useState("");
  const q = useQuery({ queryKey: ["master-taco", termo], queryFn: () => buscarAlimentos(termo), enabled: termo.trim().length >= 2, staleTime: 60_000 });
  return (
    <div className="relative">
      <input className={INPUT} value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="Buscar alimento na TACO (ex.: arroz)" data-busca-taco />
      {termo.trim().length >= 2 && (q.data?.alimentos ?? []).length > 0 && (
        <div className="absolute inset-x-0 top-11 z-10 max-h-56 overflow-y-auto rounded-xl border border-linha-2 bg-tela p-1 shadow-xl">
          {(q.data?.alimentos ?? []).map((a) => (
            <button key={a.id} type="button" className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-superficie-3"
              onClick={() => { aoEscolher(a); setTermo(""); }} data-opcao-taco={a.nome}>
              <span className="min-w-0 flex-1 truncate">{a.nome}</span>
              <span className="text-[11.5px] text-texto-3">{Math.round(a.energia_kcal ?? 0)} kcal/100 g</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EditorPrato({ prato, aoFechar, aoSalvo }: { prato: Prato | null; aoFechar: () => void; aoSalvo: () => void }) {
  const [p, setP] = useState<Prato | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => { setP(prato ? structuredClone(prato) : null); setErro(null); }, [prato]);
  if (!p) return null;
  const mudarItem = (i: number, v: Partial<ItemPrato>) => setP({ ...p, itens: p.itens.map((x, k) => (k === i ? { ...x, ...v } : x)) });

  async function salvar() {
    if (!p) return;
    setOcupado(true);
    setErro(null);
    try {
      await salvarPrato({ id: p.id || null, codigo: p.codigo || null, nome: p.nome, refeicao: p.refeicao, objetivos: p.objetivos, descricao: p.descricao,
        modo_preparo: p.modo_preparo, ordem: p.ordem, ativo: p.ativo,
        itens: p.itens.map((i) => ({ alimento_id: i.alimento_id, nome: i.nome, quantidade_g: i.quantidade_g, medida: i.medida })) });
      toast.success(`Prato "${p.nome}" salvo.`);
      aoSalvo();
    } catch (e) {
      setErro(textoErro(e instanceof ErroMaster ? e.codigo : "erro_interno"));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Janela aberta aoMudar={(a) => !a && aoFechar()} titulo={p.id ? "Editar prato pronto" : "Novo prato pronto"} largura="sm:max-w-2xl" data-janela-prato
      descricao="Aparece na aba Dieta do aluno sem profissional (plano Treino + Alimentação), pelo objetivo dele. kcal e macros vêm da TACO."
      rodape={(
        <>
          <Botao tamanho="sm" onClick={aoFechar}>Cancelar</Botao>
          <Botao tamanho="sm" variante="w" onClick={() => void salvar()} disabled={ocupado} data-salvar-prato>{ocupado ? "Salvando…" : "Salvar prato"}</Botao>
        </>
      )}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo rotulo="Nome"><input className={INPUT} value={p.nome} onChange={(e) => setP({ ...p, nome: e.target.value })} maxLength={120} data-campo-nome-prato /></Campo>
        <Campo rotulo="Refeição">
          <select className={SELECT} value={p.refeicao} onChange={(e) => setP({ ...p, refeicao: e.target.value as Prato["refeicao"] })}>{REFEICOES.map((r) => <option key={r.id} value={r.id}>{r.rotulo}</option>)}</select>
        </Campo>
      </div>
      <div className="flex flex-wrap gap-3 text-[13px] text-texto-2" role="group" aria-label="Objetivos">
        {OBJETIVOS.map((o) => (
          <label key={o} className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4 accent-violeta" checked={p.objetivos.includes(o)}
              onChange={(e) => setP({ ...p, objetivos: e.target.checked ? [...p.objetivos, o] : p.objetivos.filter((x) => x !== o) })} />
            {ROTULO_OBJETIVO[o]}
          </label>
        ))}
      </div>
      <Campo rotulo="Descrição"><textarea className={TEXTAREA} value={p.descricao ?? ""} onChange={(e) => setP({ ...p, descricao: e.target.value })} maxLength={300} /></Campo>
      <Campo rotulo="Modo de preparo"><textarea className={TEXTAREA} value={p.modo_preparo ?? ""} onChange={(e) => setP({ ...p, modo_preparo: e.target.value })} maxLength={600} /></Campo>
      <div className="flex flex-col gap-1.5" data-itens-prato={p.itens.length}>
        <span className="text-[12px] font-semibold text-texto-2">Itens ({p.itens.length}) · {kcalDoPrato(p)} kcal</span>
        {p.itens.map((i, k) => (
          <div key={k} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_72px_minmax(0,0.8fr)_36px] items-center gap-1.5">
            <span className="truncate text-[12.5px] text-texto-2" title={i.alimento}>{i.alimento ?? "—"}</span>
            <input className={`${INPUT} h-9`} aria-label="Nome para o aluno" value={i.nome ?? ""} placeholder="Nome para o aluno" onChange={(e) => mudarItem(k, { nome: e.target.value })} />
            <input className={`${INPUT} h-9`} inputMode="decimal" aria-label="Gramas" value={i.quantidade_g} onChange={(e) => mudarItem(k, { quantidade_g: Number(e.target.value.replace(",", ".")) || 0 })} />
            <input className={`${INPUT} h-9`} aria-label="Medida caseira" value={i.medida ?? ""} placeholder="1 colher" onChange={(e) => mudarItem(k, { medida: e.target.value })} />
            <button type="button" className="pq-ibtn" style={{ width: 36, height: 36, borderRadius: 12 }} aria-label="Remover item" onClick={() => setP({ ...p, itens: p.itens.filter((_, j) => j !== k) })}>
              <Trash2 aria-hidden className="h-4 w-4" />
            </button>
          </div>
        ))}
        <BuscaTaco aoEscolher={(a) => setP({ ...p, itens: [...p.itens, { alimento_id: a.id, alimento: a.nome, nome: null, quantidade_g: 100, medida: null, kcal: a.energia_kcal ?? 0 }] })} />
      </div>
      <label className="flex items-center gap-2.5 text-[13px] text-texto-2">
        <input type="checkbox" className="h-4 w-4 accent-violeta" checked={p.ativo} onChange={(e) => setP({ ...p, ativo: e.target.checked })} />
        No catálogo do app
      </label>
      {erro && <p role="alert" className="text-[13px] font-medium text-rosa-3" data-erro-prato>{erro}</p>}
    </Janela>
  );
}

/** Aba "Pratos prontos" do App do aluno (master): por refeição e objetivo; o arquivo pratos_prontos.json segue valendo para recarregar. */
export function PratosProntos() {
  const q = useQuery({ queryKey: ["master-pratos-prontos"], queryFn: pratosProntos });
  const [editar, setEditar] = useState<Prato | null>(null);
  if (q.isLoading) return <EstadoCarregando linhas={5} />;
  if (q.isError) return <EstadoErro aoTentar={() => void q.refetch()} />;
  const lista = q.data?.pratos ?? [];
  const novo: Prato = { id: "", codigo: "", nome: "", refeicao: "almoco", objetivos: ["manter"], descricao: "", modo_preparo: "", ordem: 99, ativo: true, itens: [] };
  return (
    <div className="flex flex-col gap-3" data-pratos-prontos={lista.length}>
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 break-words text-[12.5px] text-texto-3">{lista.filter((p) => p.ativo).length} no catálogo · o arquivo scripts/conteudo/pratos_prontos.json continua valendo para recarregar.</p>
        <Botao tamanho="sm" variante="w" icone={Plus} onClick={() => setEditar(novo)} data-novo-prato>Novo prato</Botao>
      </div>
      {lista.length === 0 ? <EstadoVazio icone={Salad} titulo="Nenhum prato pronto" /> : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {lista.map((p) => (
            <Cartao key={p.id} className={cn("flex flex-col gap-2 p-4", !p.ativo && "opacity-60")} data-prato={p.codigo}>
              <div className="flex flex-wrap gap-1.5">
                <Chip tom="n">{ROTULO_REFEICAO[p.refeicao]}</Chip>
                {p.objetivos.map((o) => <Chip key={o} tom="g">{ROTULO_OBJETIVO[o]}</Chip>)}
                {!p.ativo && <Chip tom="a">Fora do catálogo</Chip>}
              </div>
              <b className="text-[15px] text-texto">{p.nome}</b>
              <span className="text-[12.5px] text-texto-2">{kcalDoPrato(p)} kcal · {p.itens.length} itens</span>
              <div className="mt-auto pt-1"><Botao tamanho="sm" onClick={() => setEditar(p)} data-editar-prato={p.codigo}>Editar</Botao></div>
            </Cartao>
          ))}
        </div>
      )}
      <EditorPrato prato={editar} aoFechar={() => setEditar(null)} aoSalvo={() => { setEditar(null); void q.refetch(); }} />
    </div>
  );
}
