import { useEffect, useRef, useState } from "react";
import { FolderOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { criarGrupo, excluirGrupo, renomearGrupo, type GrupoReceita } from "@/nutricao/editor/lib/receitas";
import { NOME_GRUPO_MAX, validarGrupo } from "@/nutricao/editor/lib/receitasUtil";
import { BTN_PRI, BTN_SEC, DESCRICAO_JANELA, INPUT, JANELA, TITULO_JANELA } from "@/nutricao/editor/ui/estilos";
import { AcaoLinha, ConfirmarExclusao } from "./pecas";

// Physiq W24 — porta do PhysiqNutri (src/components/receitas/GruposDialog.tsx) no visual premium: os grupos de receitas com a contagem
// de cada um, Renomear na linha, Excluir (soft: as receitas do grupo ficam sem grupo) e "Novo grupo". Nome único entre os vivos (sem
// caixa) — validado aqui e pelo índice do banco. hml-14b (B21): o número de cada grupo vem do banco (a lista de receitas é paginada).

interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  nutricionistaId: string;
  grupos: GrupoReceita[];
  /** receitas vivas por grupo (do banco — a tela de receitas só tem a página) */
  porGrupo: Record<string, number>;
  onMudou: () => Promise<void> | void;
}

export default function GruposDialog({ open, onOpenChange, nutricionistaId, grupos, porGrupo, onMudou }: Props) {
  const [novo, setNovo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [renomeando, setRenomeando] = useState<{ id: string; nome: string } | null>(null);
  const [paraExcluir, setParaExcluir] = useState<GrupoReceita | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const jaAberto = useRef(false);

  useEffect(() => {
    if (!open) {
      jaAberto.current = false;
      return;
    }
    if (jaAberto.current) return;
    jaAberto.current = true;
    setNovo("");
    setErro(null);
    setRenomeando(null);
    setParaExcluir(null);
  }, [open]);

  const rodar = async (acao: () => Promise<void>, erroPadrao: string) => {
    setOcupado(true);
    setErro(null);
    try {
      await acao();
      await onMudou();
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      setErro(/row-level security|violates/i.test(m) ? "Só a nutricionista da conta muda os grupos." : m || erroPadrao);
    } finally {
      setOcupado(false);
    }
  };

  const criar = () =>
    rodar(async () => {
      const problema = validarGrupo(novo, grupos.map((g) => g.nome));
      if (problema) throw new Error(problema);
      await criarGrupo(nutricionistaId, novo);
      setNovo("");
      toast.success("Grupo criado");
    }, "Não foi possível criar o grupo");

  const salvarRenome = () =>
    rodar(async () => {
      if (!renomeando) return;
      const alvo = renomeando;
      const problema = validarGrupo(alvo.nome, grupos.filter((g) => g.id !== alvo.id).map((g) => g.nome));
      if (problema) throw new Error(problema);
      await renomearGrupo(alvo.id, alvo.nome);
      setRenomeando(null);
      toast.success("Grupo renomeado");
    }, "Não foi possível renomear o grupo");

  const excluir = () =>
    rodar(async () => {
      if (!paraExcluir) return;
      await excluirGrupo(paraExcluir.id);
      setParaExcluir(null);
      toast.success("Grupo excluído");
    }, "Não foi possível excluir o grupo");

  const nExcluir = paraExcluir ? (porGrupo[paraExcluir.id] ?? 0) : 0;
  const avisoExcluir = paraExcluir
    ? `"${paraExcluir.nome}" vai para a lixeira. ` + (nExcluir === 0 ? "Nenhuma receita usa este grupo." : `As ${nExcluir} receita(s) dele continuam — só ficam sem grupo.`)
    : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${JANELA} max-h-[88vh] overflow-y-auto sm:max-w-lg`} data-modal-grupos data-grupos-total={grupos.length} data-grupos-ocupado={ocupado ? "1" : "0"}>
        <DialogHeader>
          <DialogTitle className={TITULO_JANELA}>Grupos de receitas</DialogTitle>
          <DialogDescription className={DESCRICAO_JANELA}>Organize as receitas em grupos (Lanches, Sobremesas, Low carb…). Excluir um grupo deixa as receitas dele sem grupo.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex items-end gap-2">
            <input
              className={INPUT}
              value={novo}
              maxLength={NOME_GRUPO_MAX}
              placeholder="Novo grupo (ex.: Lanches)"
              onChange={(e) => {
                setNovo(e.target.value);
                setErro(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void criar();
                }
              }}
              data-campo-novo-grupo
            />
            <button type="button" className={`${BTN_PRI} shrink-0`} onClick={() => void criar()} disabled={ocupado} data-btn-criar-grupo>
              <Plus aria-hidden /> Criar
            </button>
          </div>
          {erro && <p role="alert" className="text-[12px] text-rosa-3" data-erro-grupo>{erro}</p>}

          {grupos.length === 0 ? (
            <p className="flex items-center gap-2 rounded-[14px] border border-linha bg-superficie px-3.5 py-3 text-[13px] text-texto-2" data-grupos-vazio>
              <FolderOpen aria-hidden className="h-4 w-4 text-texto-3" /> Nenhum grupo ainda — crie o primeiro.
            </p>
          ) : (
            <ul className="divide-y divide-linha-3 rounded-[16px] border border-linha bg-superficie px-3.5" data-lista-grupos>
              {grupos.map((g) => {
                const n = porGrupo[g.id] ?? 0;
                const emRenome = renomeando?.id === g.id;
                return (
                  <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5" data-grupo={g.id} data-grupo-receitas={n}>
                    {emRenome ? (
                      <div className="flex min-w-0 flex-1 items-end gap-2">
                        <input
                          className={INPUT}
                          value={renomeando.nome}
                          maxLength={NOME_GRUPO_MAX}
                          autoFocus
                          onChange={(e) => setRenomeando({ id: g.id, nome: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void salvarRenome();
                            }
                          }}
                          data-campo-renomear-grupo
                        />
                        <button type="button" className={`${BTN_SEC} shrink-0`} onClick={() => void salvarRenome()} disabled={ocupado} data-btn-salvar-renomear-grupo>Salvar</button>
                        <button type="button" className={`${BTN_SEC} shrink-0`} onClick={() => setRenomeando(null)} data-btn-cancelar-renomear-grupo>Cancelar</button>
                      </div>
                    ) : (
                      <>
                        <div className="min-w-0">
                          <p className="truncate text-[13.5px] font-semibold text-texto" data-grupo-nome>{g.nome}</p>
                          <p className="text-[12px] text-texto-3" data-grupo-contagem>{n === 0 ? "nenhuma receita" : n === 1 ? "1 receita" : `${n} receitas`}</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <AcaoLinha icone={Pencil} onClick={() => setRenomeando({ id: g.id, nome: g.nome })} data-btn-renomear-grupo>Renomear</AcaoLinha>
                          <AcaoLinha icone={Trash2} perigo onClick={() => setParaExcluir(g)} data-btn-excluir-grupo>Excluir</AcaoLinha>
                        </div>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex justify-end">
            <button type="button" className={BTN_SEC} onClick={() => onOpenChange(false)} data-btn-fechar-grupos>Fechar</button>
          </div>
        </div>

        <ConfirmarExclusao
          aberto={!!paraExcluir}
          aoMudar={(a) => !a && setParaExcluir(null)}
          titulo="Excluir este grupo?"
          texto={avisoExcluir}
          rotulo="Excluir grupo"
          ocupado={ocupado}
          aoConfirmar={() => void excluir()}
          data-confirmar-excluir-grupo
        />
      </DialogContent>
    </Dialog>
  );
}
