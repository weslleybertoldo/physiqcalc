import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Copy, Link2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { fmtBRL, fmtData, fmtDataHora, linkConviteProfessor, masterProfessores, planoComValor, type ProfessorRow } from "@/lib/saasApi";
import {
  BTN_MINI_NEUTRO, BTN_MINI_PRIMARIO, Carregando, Dado, ErroCarregar, Etiqueta, INTEGRACAO_LABEL, alunosTexto, copiar, mensagemErro,
} from "@/components/master/masterUi";

type ProfessorDetalhe = ProfessorRow & { integracaoConfig?: Record<string, unknown> };

interface Props {
  userId: string | null;
  onClose: () => void;
}

// Sheet lateral "Ver detalhes" de um professor (master-professores `get`).
export default function ProfessorDetalhesSheet({ userId, onClose }: Props) {
  const navigate = useNavigate();
  const [p, setP] = useState<ProfessorDetalhe | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async (id: string) => {
    setLoading(true); setErro(null); setP(null);
    try {
      const r = await masterProfessores<{ professor: ProfessorDetalhe }>("get", { userId: id });
      setP(r.professor);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (userId) void carregar(userId); }, [userId, carregar]);

  const linkConvite = p ? linkConviteProfessor(p.codigo_convite) : "";
  const recriar = !!(p?.integracaoConfig as { recriar_assinatura?: boolean } | undefined)?.recriar_assinatura;

  return (
    <Sheet open={!!userId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="bg-background border-muted-foreground/30 w-full sm:max-w-md overflow-y-auto" data-sheet-professor={userId ?? undefined}>
        <SheetHeader className="text-left">
          <SheetTitle className="font-heading text-foreground uppercase tracking-wider text-base break-words">{p?.nome ?? "Professor"}</SheetTitle>
          <SheetDescription className="font-body text-xs break-all">{p?.email ?? (loading ? "Carregando..." : "")}</SheetDescription>
        </SheetHeader>

        {loading && <div className="mt-4"><Carregando /></div>}
        {erro && <div className="mt-4"><ErroCarregar texto={erro} onRetry={() => userId && void carregar(userId)} /></div>}

        {p && (
          <div className="mt-4 space-y-5">
            <div className="flex flex-wrap gap-1.5">
              {p.ehMaster && <Etiqueta tom="ok">Master</Etiqueta>}
              <Etiqueta tom={p.status === "ativo" ? "ok" : "ruim"}>{p.status}</Etiqueta>
              <Etiqueta tom={p.acessoOk ? "ok" : "ruim"}>{p.acessoOk ? "acesso ok" : "travado"}</Etiqueta>
              {p.cobranca_pausada && <Etiqueta>cobrança pausada</Etiqueta>}
              {p.alunos_bloqueados_em && <Etiqueta tom="ruim">alunos bloqueados</Etiqueta>}
              {recriar && <Etiqueta tom="aviso">recriar assinatura MP</Etiqueta>}
            </div>

            <div>
              <Dado k="Código de convite" v={<span className="font-heading tracking-wider">{p.codigo_convite}</span>} destaque />
              <div className="flex flex-wrap gap-1.5 mt-2">
                <button type="button" onClick={() => void copiar(p.codigo_convite, "Código copiado!")} className={BTN_MINI_PRIMARIO} data-btn-copiar-codigo>
                  <Copy size={10} className="inline mr-1" />Copiar código
                </button>
                <button type="button" onClick={() => void copiar(linkConvite, "Link copiado!")} className={BTN_MINI_NEUTRO} data-btn-copiar-link>
                  <Link2 size={10} className="inline mr-1" />Copiar link
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground font-body mt-1 break-all">{linkConvite}</p>
            </div>

            <div>
              <h3 className="font-heading text-xs text-muted-foreground uppercase tracking-wider mb-1">Plano e alunos</h3>
              <Dado k="Plano" v={planoComValor(p.plano)} destaque />
              <Dado k="Alunos" v={alunosTexto(p.alunos, p.plano?.max_alunos)} />
              <Dado k="Recebimento" v={INTEGRACAO_LABEL[p.integracao] ?? p.integracao} />
            </div>

            <div>
              <h3 className="font-heading text-xs text-muted-foreground uppercase tracking-wider mb-1">Ciclo</h3>
              <Dado k="Teste grátis até" v={fmtData(p.trial_ate)} />
              <Dado k="Adesão paga em" v={fmtData(p.adesao_paga_em)} />
              <Dado k="Ciclo" v={p.ciclo_inicio || p.ciclo_vence_em ? `${fmtData(p.ciclo_inicio)} → ${fmtData(p.ciclo_vence_em)}` : "—"} />
              <Dado k="Valor do ciclo" v={fmtBRL(p.ciclo_valor)} />
              <Dado k="Anual até" v={fmtData(p.anual_ate)} />
              <Dado k="Acesso liberado até" v={fmtData(p.acesso_liberado_ate)} />
              {p.alunos_bloqueados_em && (
                <Dado k="Alunos bloqueados em" v={`${fmtDataHora(p.alunos_bloqueados_em)}${p.alunos_bloqueados_msg ? ` — ${p.alunos_bloqueados_msg}` : ""}`} />
              )}
              <Dado k="Cadastrado em" v={fmtDataHora(p.created_at)} />
            </div>

            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => navigate(`/master/alunos?professorId=${p.id}`)} className={BTN_MINI_PRIMARIO} data-btn-ver-alunos>Ver alunos</button>
              {!p.ehMaster && (
                <button type="button" onClick={() => navigate(`/master/financeiro?professorId=${p.id}`)} className={BTN_MINI_PRIMARIO} data-btn-financeiro>Financeiro</button>
              )}
              <button type="button" onClick={() => navigate("/master/integracoes")} className={BTN_MINI_NEUTRO}>Integrações</button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
