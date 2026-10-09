// Physiq W21 — Pré-consulta › Formulários (porta de src/pages/consultorio/PreConsulta.tsx do PhysiqNutri, main 294887a, no padrão das
// telas 6/7): os formulários da conta agrupados pela origem (Pré-anamnese · Questionários de saúde · Personalizados), cada um com o
// link público /f/<slug> (Copiar link mostra o endereço sempre — o clipboard pode faltar), Abrir, Editar, Duplicar (slug novo),
// Desativar/Ativar e Excluir (soft — as respostas já recebidas continuam), e quantas respostas chegaram (e quantas são novas).
// O dono vê os da equipe (com o autor); o membro, os seus (P1). hml-14d (B21 · D35): o "N respostas · M novas" de cada um vem
// contado do banco (preconsulta_numeros) — antes, de uma lista de até 1000 respostas no navegador.
import { useMemo, useState } from "react";
import { ClipboardList, Copy, CopyPlus, ExternalLink, FileText, Link2, ListChecks, Lock, Pencil, PenLine, Plus, Power, PowerOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { BTN_PERIGO, BTN_SEC, DESCRICAO_JANELA, JANELA, TITULO_JANELA } from "@/nutricao/editor/ui/estilos";
import { Botao } from "@/ui/premium/Botao";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { EstadoErro, EstadoVazio, Esqueleto } from "@/ui/premium/Estados";
import { atualizarFormulario, duplicarFormulario, excluirFormulario, type FormularioPreconsulta } from "./dados";
import { linkDoFormulario } from "./link";
import { Acao, BTN_MINI } from "./pecas";
import { agruparPorOrigem, lerOrigem, resumoFormulario, textoContagemFormularios, type Origem } from "./preconsultaUtil";
import { textoContagemRespostas } from "./respostasUtil";
import type { ContextoPreConsulta, DadosPreConsulta } from "./usePreConsulta";

const ICONE_ORIGEM: Record<Origem, typeof FileText> = { anamnese: FileText, questionario: ListChecks, personalizado: PenLine };

export default function Formularios({ ctx, d, aoNovo, aoEditar, aoVerRespostas }: {
  ctx: ContextoPreConsulta;
  d: DadosPreConsulta;
  aoNovo: () => void;
  aoEditar: (f: FormularioPreconsulta) => void;
  aoVerRespostas: (titulo: string) => void;
}) {
  const formularios = d.formularios;
  const grupos = useMemo(() => agruparPorOrigem(formularios), [formularios]);
  // os números do banco (null enquanto carregam ou se falharam: o botão mostra "…" — nunca "Nenhuma resposta" inventado)
  const contagens = d.numeros?.porFormulario ?? null;
  const ativos = formularios.filter((f) => f.ativo).length;
  const [linkMostrado, setLinkMostrado] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(0); // gravações fora do modal — o E2E espera voltar a 0
  const [paraExcluir, setParaExcluir] = useState<FormularioPreconsulta | null>(null);

  const comOcupado = async (id: string, fn: () => Promise<void>) => {
    setOcupado(id);
    setSalvando((n) => n + 1);
    try {
      await fn();
    } finally {
      setOcupado(null);
      setSalvando((n) => n - 1);
    }
  };

  const copiar = async (f: FormularioPreconsulta) => {
    const url = linkDoFormulario(f.slug);
    setLinkMostrado(f.id); // o link SEMPRE aparece na tela — o clipboard pode não estar disponível (http, permissão, headless)
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado — mande para quem vai responder");
    } catch {
      toast.message("Copie o link mostrado embaixo do formulário");
    }
  };

  const alternarAtivo = (f: FormularioPreconsulta) => comOcupado(f.id, async () => {
    try {
      const novo = await atualizarFormulario(f.id, { ativo: !f.ativo });
      await d.recarregar("formularios");
      toast.success(novo.ativo ? "Formulário ativado — o link volta a receber respostas" : "Formulário desativado — o link para de receber respostas");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível alterar o formulário");
    }
  });

  const duplicar = (f: FormularioPreconsulta) => comOcupado(f.id, async () => {
    try {
      const copia = await duplicarFormulario(f, ctx.uid, ctx.contaId);
      await d.recarregar("formularios");
      toast.success(`Cópia criada: ${copia.titulo} (/f/${copia.slug})`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível duplicar o formulário");
    }
  });

  const excluir = async () => {
    const alvo = paraExcluir;
    if (!alvo) return;
    await comOcupado(alvo.id, async () => {
      try {
        await excluirFormulario(alvo.id);
        await d.recarregar("formularios");
        toast.success(`${alvo.titulo} excluído — o link deixa de responder`);
        setParaExcluir(null);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Não foi possível excluir");
      }
    });
  };

  const q = d.formulariosQ;
  return (
    <div data-aba-formularios data-salvando-formulario={salvando} data-atualizando={q.isFetching ? "1" : "0"}>
      <Cartao className="px-[22px] pb-3 pt-[18px]" data-cartao-formularios data-contagem-formularios={formularios.length}>
        <CabecalhoCartao titulo="Formulários" extra={!q.isLoading && formularios.length > 0 ? <Chip tom="g" className="h-[22px] text-[10.5px]" data-formularios-ativos={ativos}>{ativos} {ativos === 1 ? "ATIVO" : "ATIVOS"}</Chip> : undefined}
          acao={<span className="text-[12px] text-texto-3">{q.isLoading ? "" : textoContagemFormularios(formularios.length)}</span>} />

        {q.isError ? (
          <EstadoErro titulo="Não deu para carregar os formulários" texto={q.error instanceof Error ? q.error.message : undefined} aoTentar={() => void q.refetch()} className="my-3" />
        ) : q.isLoading ? (
          <div className="flex flex-col gap-2 py-2" data-carregando-formularios>{[0, 1, 2].map((i) => <Esqueleto key={i} className="h-[58px] w-full" />)}</div>
        ) : formularios.length === 0 ? (
          <EstadoVazio icone={ClipboardList} className="my-3 border-dashed" titulo="Nenhum formulário de pré-consulta"
            texto={ctx.souNutri
              ? "Monte um a partir de um modelo de anamnese, de um questionário de saúde ou em branco, e mande o link para responder antes da consulta."
              : "Monte um formulário em branco com as suas perguntas e mande o link para o aluno responder antes da primeira conversa."}
            acao={<Botao variante="w" tamanho="sm" icone={Plus} onClick={aoNovo} data-btn-novo-formulario-vazio>Novo formulário</Botao>} />
        ) : (
          <div className="flex flex-col gap-1.5" data-lista-formularios>
            {grupos.map((g) => (
              <div key={g.origem} data-grupo-origem={g.origem}>
                <div className="pq-eyebrow pb-1 pt-3" data-grupo-rotulo>{g.rotulo}</div>
                <div className="divide-y divide-linha-3">
                  {g.itens.map((f) => {
                    const Icone = ICONE_ORIGEM[lerOrigem(f.origem)];
                    const url = linkDoFormulario(f.slug);
                    const c = contagens?.[f.id] ?? { total: 0, novas: 0 };
                    const pessoa = f.nutricionista_id !== ctx.uid ? ctx.pessoas.get(f.nutricionista_id) : undefined;
                    const autor = f.nutricionista_id !== ctx.uid ? pessoa?.nome ?? "outro profissional" : null;
                    // formulário de nutricionista visto por quem não é nutri: as respostas são clínicas (regra da W18) — não "Nenhuma resposta"
                    const clinicoDeOutro = !!autor && !ctx.souNutri && !!pessoa?.papeis.includes("nutricionista");
                    return (
                      <div key={f.id} className="py-3" data-formulario={f.id} data-formulario-titulo={f.titulo} data-formulario-slug={f.slug}
                        data-formulario-ativo={f.ativo ? "1" : "0"} data-formulario-respostas={c.total} data-formulario-novas={c.novas}>
                        <div className="flex flex-wrap items-center gap-3">
                          <span className={cn("flex h-10 w-10 flex-none items-center justify-center rounded-[12px] border border-linha bg-superficie", f.ativo ? "text-texto-2" : "text-texto-4")}>
                            <Icone aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.75} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <b className={cn("text-[14px] font-semibold tracking-[-0.01em]", f.ativo ? "text-texto" : "text-texto-3 line-through decoration-texto-4")} data-formulario-nome>{f.titulo}</b>
                              <Chip tom={f.ativo ? "n" : "g"} className="h-[20px] text-[10px]" data-formulario-situacao>{f.ativo ? "ATIVO" : "INATIVO"}</Chip>
                              {c.novas > 0 && <Chip tom="a" className="h-[20px] text-[10px]" data-formulario-chip-novas>{c.novas} {c.novas === 1 ? "NOVA" : "NOVAS"}</Chip>}
                            </p>
                            <p className="mt-0.5 truncate text-[12px] text-texto-3" data-formulario-resumo>
                              {resumoFormulario(f)}
                              {autor && <span data-formulario-autor> · de {autor}</span>}
                            </p>
                          </div>
                          {clinicoDeOutro ? (
                            <span className="flex flex-none items-center gap-1.5 text-[12.5px] text-texto-3" title="Pré-anamnese é dado de saúde: as respostas ficam com a nutricionista"
                              data-respostas-com-a-nutri>
                              <Lock aria-hidden className="h-3.5 w-3.5" /> Com a nutricionista
                            </span>
                          ) : (
                            <button type="button" onClick={() => aoVerRespostas(f.titulo)} className="flex-none text-[12.5px] font-semibold text-violeta-3 hover:text-violeta-2 disabled:text-texto-4"
                              disabled={!contagens || c.total === 0} data-btn-ver-respostas-formulario>
                              {contagens ? textoContagemRespostas(c.total) : "…"}
                            </button>
                          )}
                          <span className="flex flex-none flex-wrap items-center gap-1.5">
                            <button type="button" className={BTN_MINI} onClick={() => void copiar(f)} title={f.ativo ? "Copiar o link público" : "O link só recebe respostas com o formulário ativo"}
                              data-btn-copiar-link><Copy aria-hidden /> Copiar link</button>
                            <a href={url} target="_blank" rel="noreferrer" className={BTN_MINI} data-link-abrir-formulario><ExternalLink aria-hidden /> Abrir</a>
                            <Acao icone={Pencil} rotulo="Editar" onClick={() => aoEditar(f)} marca="data-btn-editar-formulario" />
                            <Acao icone={CopyPlus} rotulo="Duplicar (link novo, no seu nome)" onClick={() => void duplicar(f)} marca="data-btn-duplicar-formulario" desabilitado={ocupado === f.id} />
                            <Acao icone={f.ativo ? PowerOff : Power} rotulo={f.ativo ? "Desativar (o link para de receber respostas)" : "Ativar"} onClick={() => void alternarAtivo(f)}
                              marca="data-btn-ativo-formulario" desabilitado={ocupado === f.id} />
                            <Acao icone={Trash2} rotulo="Excluir" perigo onClick={() => setParaExcluir(f)} marca="data-btn-excluir-formulario" desabilitado={ocupado === f.id} />
                          </span>
                        </div>
                        {linkMostrado === f.id && (
                          <p className="ml-[52px] mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-linha bg-superficie-3 px-3 py-2 text-[12.5px] text-texto-2" data-link-publico={url}>
                            <Link2 aria-hidden className="h-[14px] w-[14px] flex-none text-violeta-3" />
                            <span>Link público:</span>
                            <a href={url} target="_blank" rel="noreferrer" className="break-all font-medium text-texto hover:underline" data-link-publico-texto>{url}</a>
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </Cartao>

      <AlertDialog open={!!paraExcluir} onOpenChange={(aberto) => { if (!aberto) setParaExcluir(null); }}>
        <AlertDialogContent className={JANELA}>
          <AlertDialogHeader>
            <AlertDialogTitle className={TITULO_JANELA}>Excluir este formulário?</AlertDialogTitle>
            <AlertDialogDescription className={DESCRICAO_JANELA}>
              <span className="text-texto">{paraExcluir?.titulo}</span> vai para a lixeira e o link /f/{paraExcluir?.slug} deixa de responder. As respostas já recebidas continuam em Respostas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={BTN_SEC}>Cancelar</AlertDialogCancel>
            <AlertDialogAction className={BTN_PERIGO} onClick={(e) => { e.preventDefault(); void excluir(); }} disabled={!!paraExcluir && ocupado === paraExcluir.id}
              data-btn-confirmar-excluir-formulario>
              {paraExcluir && ocupado === paraExcluir.id ? "Excluindo…" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
