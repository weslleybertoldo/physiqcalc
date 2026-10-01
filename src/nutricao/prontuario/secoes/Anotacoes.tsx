// Physiq W18 — Prontuário › Anotações da equipe (N-43, P4, tela 7). Vem da seção "Prontuário do paciente" do site antigo do Nutri
// (src/pages/paciente/secoes/Prontuario.tsx, main ca9f66f): registros datados, agrupados por mês, mais recente primeiro, com Ver,
// Editar e Excluir (soft) e o "PDF do prontuário" inteiro. Novo: a linha do tempo é da EQUIPE — personal, nutricionista e dono
// escrevem, cada anotação com o autor (foto, nome, papel) e a visibilidade ("Equipe" ou "Só nutricionistas"); quem não vê o
// clínico não recebe as "Só nutricionistas" (o banco filtra). Só o autor edita e exclui a própria anotação (o master também).
import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ChevronDown, ChevronUp, FileDown, FolderOpen, Lock, Pencil, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { agruparPorMes, formatarDataHoraRegistro, resumoRegistro, ultimoRegistro } from "@/nutricao/editor/lib/prontuarioUtil";
import { nomeDaNutricionista } from "@/nutricao/editor/lib/profissional";
import Blocos from "@/nutricao/editor/ui/Blocos";
import { BTN_PERIGO, BTN_PRI, BTN_SEC, DESCRICAO_JANELA, TITULO_JANELA } from "@/nutricao/editor/ui/estilos";
import { ROTULO_PAPEL, ROTULO_VISIBILIDADE, papelDaAnotacao, textoAnotacoes, type PapelAutor, type Visibilidade } from "@/nutricao/prontuario/lib/acesso";
import { excluirAnotacao, useAnotacoes, type Anotacao } from "@/nutricao/prontuario/lib/anotacoes";
import { baixarPDFProntuario } from "@/nutricao/prontuario/lib/prontuarioPdf";
import AnotacaoDialog from "@/nutricao/prontuario/ui/AnotacaoDialog";
import { useAbrirPeloParametro, useAuth, useProntuario } from "@/nutricao/prontuario/ui/contexto";
import type { PerfilAluno } from "@/painel/aluno/dados/tipos";
import { Avatar } from "@/ui/premium/Avatar";
import { Chip, type TomChip } from "@/ui/premium/Chip";
import { EstadoCarregando, EstadoErro } from "@/ui/premium/Estados";

const BTN_MINI = "inline-flex h-7 items-center gap-1 rounded-[9px] border border-linha-2 bg-[rgba(255,255,255,.04)] px-2.5 text-[11.5px] font-semibold text-texto-2 transition-colors hover:text-texto disabled:cursor-not-allowed disabled:opacity-40";
const BTN_MINI_PERIGO = "inline-flex h-7 items-center gap-1 rounded-[9px] border border-[rgba(244,63,94,.35)] bg-transparent px-2.5 text-[11.5px] font-semibold text-rosa-3 transition-colors hover:bg-[rgba(244,63,94,.08)] disabled:opacity-40";

const TOM_PAPEL: Record<PapelAutor, TomChip> = { personal: "t", nutricionista: "n", dono: "g", master: "c" };

function ChipVisibilidade({ v }: { v: Visibilidade }) {
  return (
    <Chip tom={v === "equipe" ? "g" : "n"} icone={v === "equipe" ? Users : Lock} data-chip-visibilidade={v}>
      {ROTULO_VISIBILIDADE[v]}
    </Chip>
  );
}

interface Props {
  alunoId: string;
  perfil: PerfilAluno;
}

export default function Anotacoes({ alunoId, perfil }: Props) {
  const { paciente: p, recarregar, acesso } = useProntuario();
  const { user } = useAuth();
  const qc = useQueryClient();
  const q = useAnotacoes(alunoId);
  const [modal, setModal] = useState<{ aberto: boolean; anotacao: Anotacao | null }>({ aberto: false, anotacao: null });
  const [abertos, setAbertos] = useState<string[]>([]);
  const [paraExcluir, setParaExcluir] = useState<Anotacao | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [gerando, setGerando] = useState(false);

  const abrirNova = useCallback(() => setModal({ aberto: true, anotacao: null }), []);
  useAbrirPeloParametro("nova", "anotacao", abrirNova, true, "anotacoes");

  const atualizar = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ["prontuario-anotacoes", alunoId] });
    void recarregar(); // o banco mexeu em pacientes.updated_at (gatilho)
  }, [qc, alunoId, recarregar]);

  const itens = useMemo(() => q.data?.anotacoes ?? [], [q.data]);
  const grupos = useMemo(() => agruparPorMes(itens), [itens]);
  const ultimo = ultimoRegistro(itens);
  const papel = useCallback((v: Visibilidade) => papelDaAnotacao(perfil, v), [perfil]);
  const alternar = (id: string) => setAbertos((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
  const podeMexer = (a: Anotacao) => a.minha || perfil.eu?.master;

  const pdf = async () => {
    setGerando(true);
    try {
      const emissor = user ? await nomeDaNutricionista(user.id) : null;
      const nome = baixarPDFProntuario({
        paciente: p.nome,
        nascimento: p.nascimento,
        nutricionista: emissor,
        rotuloProfissional: acesso.clinico ? "Nutricionista" : "Profissional",
        emitidoEm: new Date(),
        registros: itens.map((a) => ({
          data: a.data,
          texto: a.texto,
          created_at: a.created_at,
          autor: a.autor_id === user?.id ? null : `${a.autor_nome ?? "Profissional"} (${ROTULO_PAPEL[a.autor_papel].toLowerCase()})`,
        })),
      });
      toast.success(`PDF gerado: ${nome}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar o PDF");
    } finally {
      setGerando(false);
    }
  };

  const excluir = async () => {
    if (!paraExcluir) return;
    const alvo = paraExcluir;
    setExcluindo(true);
    try {
      await excluirAnotacao(alvo.id);
      setParaExcluir(null);
      toast.success("Anotação excluída");
      await atualizar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível excluir a anotação");
    } finally {
      setExcluindo(false);
    }
  };

  if (q.isLoading) return <EstadoCarregando linhas={3} rotulo="Abrindo as anotações" />;
  if (q.error) return <EstadoErro titulo="Não deu para abrir as anotações" aoTentar={() => void q.refetch()} />;

  return (
    <div className="space-y-4" data-secao-anotacoes data-anotacoes-total={q.data?.total ?? 0} data-anotacoes-clinico={acesso.clinico ? "1" : "0"}>
      <section className="pq-cartao space-y-3 px-[18px] py-4" data-card="anotacoes">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-texto font-body normal-case">Anotações da equipe</h2>
            <p className="font-body text-[11.5px] text-texto-3" data-contagem={itens.length}>
              {textoAnotacoes(itens.length)}
              {ultimo && (
                <>
                  {" · última em "}
                  <span className="text-texto-2" data-ultima-anotacao={ultimo.id}>{formatarDataHoraRegistro(ultimo.data)}</span>
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void pdf()}
              className={BTN_SEC}
              disabled={itens.length === 0 || gerando}
              title={itens.length === 0 ? "Sem anotações para gerar o PDF" : "PDF com todas as anotações que você vê"}
              data-btn-pdf-prontuario
            >
              <FileDown size={14} /> PDF do prontuário
            </button>
            <button type="button" onClick={abrirNova} className={BTN_PRI} data-btn-nova-anotacao>
              <Plus size={14} /> Nova anotação
            </button>
          </div>
        </header>

        {acesso.clinico && (
          <p className="flex items-start gap-2 rounded-xl border border-linha bg-superficie px-3 py-2 font-body text-[12px] leading-relaxed text-texto-2" data-aviso-visibilidade>
            <Lock aria-hidden className="mt-0.5 h-3.5 w-3.5 flex-none text-verde-3" />
            As anotações “Só nutricionistas” ficam só com as nutricionistas da conta; as “Equipe” todos que acompanham o aluno leem.
          </p>
        )}

        {itens.length === 0 && (
          <div className="space-y-2 rounded-2xl border border-dashed border-linha-2 p-6 text-center" data-anotacoes-vazio>
            <FolderOpen className="mx-auto h-6 w-6 text-texto-3" />
            <p className="font-body text-sm text-texto">Nenhuma anotação ainda</p>
            <p className="font-body text-xs text-texto-2">Cada anotação fica datada, com quem escreveu — a evolução do aluno contada pela equipe.</p>
            <button type="button" onClick={abrirNova} className={BTN_SEC} data-btn-primeira-anotacao>
              Nova anotação
            </button>
          </div>
        )}

        {grupos.length > 0 && (
          <div className="space-y-4" data-lista-anotacoes data-grupos={grupos.length}>
            {grupos.map((g) => (
              <section key={g.chave} className="space-y-1" data-grupo-mes={g.chave} data-grupo-anotacoes={g.registros.length}>
                <h3 className="flex items-center gap-2 border-b border-linha pb-1.5 text-[12px] font-semibold text-verde-3 font-body normal-case">
                  <CalendarDays size={13} className="shrink-0" />
                  <span data-grupo-mes-rotulo>{g.rotulo}</span>
                  <span className="font-body font-normal text-texto-3" data-grupo-mes-contagem>· {textoAnotacoes(g.registros.length)}</span>
                </h3>
                <ul className="divide-y divide-linha">
                  {g.registros.map((a) => {
                    const aberto = abertos.includes(a.id);
                    return (
                      <li key={a.id} className="space-y-2 py-3" data-anotacao={a.id} data-visibilidade={a.visibilidade} data-autor-papel={a.autor_papel} data-aberto={aberto ? "1" : "0"}>
                        <div className="flex flex-wrap items-start justify-between gap-2 sm:flex-nowrap">
                          <div className="flex min-w-0 flex-1 items-start gap-2.5">
                            <Avatar src={a.autor_foto} nome={a.autor_nome} tamanho={30} className="mt-0.5 flex-none" />
                            <div className="min-w-0">
                              <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 font-body text-[11.5px] text-texto-3">
                                <span data-anotacao-data>{formatarDataHoraRegistro(a.data)}</span>
                                <span>·</span>
                                <span className="text-texto-2" data-anotacao-autor>{a.autor_nome ?? "Profissional"}</span>
                                <Chip tom={TOM_PAPEL[a.autor_papel]} className="!h-5 !px-1.5 !text-[9.5px]" data-chip-papel={a.autor_papel}>
                                  {ROTULO_PAPEL[a.autor_papel]}
                                </Chip>
                                <ChipVisibilidade v={a.visibilidade} />
                              </p>
                              {!aberto && (
                                <p className="mt-1 line-clamp-2 max-w-2xl font-body text-[13px] leading-[1.45] text-texto" data-anotacao-resumo>{resumoRegistro(a.texto, 220)}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-none flex-wrap items-center gap-1.5">
                            <button type="button" onClick={() => alternar(a.id)} className={BTN_MINI} data-btn-ver-anotacao>
                              {aberto ? <ChevronUp size={12} /> : <ChevronDown size={12} />} {aberto ? "Ocultar" : "Ver"}
                            </button>
                            {podeMexer(a) && (
                              <>
                                <button type="button" onClick={() => setModal({ aberto: true, anotacao: a })} className={BTN_MINI} data-btn-editar-anotacao>
                                  <Pencil size={12} /> Editar
                                </button>
                                <button type="button" onClick={() => setParaExcluir(a)} className={BTN_MINI_PERIGO} data-btn-excluir-anotacao>
                                  <Trash2 size={12} /> Excluir
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                        {aberto && (
                          <div className={cn("ml-10 border-l-2 pl-3", a.visibilidade === "equipe" ? "border-violeta/40" : "border-verde/40")} data-anotacao-texto>
                            <Blocos conteudo={a.texto} />
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </section>

      <AnotacaoDialog
        open={modal.aberto}
        onOpenChange={(aberto) => setModal((m) => ({ ...m, aberto }))}
        pacienteId={p.id}
        anotacao={modal.anotacao}
        visibilidades={acesso.visibilidades}
        papel={papel}
        onSalvo={() => void atualizar()}
      />

      <AlertDialog open={!!paraExcluir} onOpenChange={(aberto) => { if (!aberto) setParaExcluir(null); }}>
        <AlertDialogContent className="border-linha-2 bg-tela">
          <AlertDialogHeader>
            <AlertDialogTitle className={TITULO_JANELA}>Excluir esta anotação?</AlertDialogTitle>
            <AlertDialogDescription className={DESCRICAO_JANELA}>
              {paraExcluir ? `Anotação de ${formatarDataHoraRegistro(paraExcluir.data)}. ` : ""}Ela sai do prontuário do aluno e vai pra lixeira.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={BTN_SEC}>Cancelar</AlertDialogCancel>
            <AlertDialogAction className={BTN_PERIGO} onClick={(e) => { e.preventDefault(); void excluir(); }} disabled={excluindo} data-btn-confirmar-excluir-anotacao>
              {excluindo ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
