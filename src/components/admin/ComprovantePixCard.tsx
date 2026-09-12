import { useState } from "react";
import { Check, ExternalLink, Eye, X } from "lucide-react";
import { toast } from "sonner";
import { invokeMp } from "@/lib/mpClient";
import { fmtBRL, fmtDataHora } from "@/lib/saasApi";

/**
 * Comprovante de Pix manual aguardando confirmação do professor (SaaS 12/09/2026).
 * Item de `admin-pix-pendentes` (traz `aluno`) ou pagamento `pix_manual` com status
 * `aguardando_confirmacao` vindo do `admin-status` (sem `aluno`).
 * Usado na aba Cobrança e na aba Plano & Cobrança do aluno (AdminUserConfig).
 */
export interface PixPendente {
  id: string;
  user_id?: string;
  valor: number | string;
  mes_ref: string;
  comprovante_path?: string | null;
  created_at: string;
  aluno?: { id: string; nome: string | null; email: string | null; user_code?: number | null } | null;
}

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

/** "2026-09" → "Setembro/2026" */
function mesRefLabel(mesRef: string): string {
  const [ano, mes] = (mesRef || "").split("-");
  const nome = MESES[parseInt(mes, 10) - 1];
  return nome ? `${nome}/${ano}` : mesRef;
}

const dataBR = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

/** Badge pago/pendente do `admin-badges` (badgesData[alunoId] = { s, ate }) — mesmo texto do painel antigo. */
export const BadgePagamento = ({ badge }: { badge: { s: string; ate: string | null } }) => (
  <span
    className={`text-xs font-heading uppercase px-2 py-0.5 rounded-full ${badge.s === "pago" ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"}`}
    data-badge-pagamento={badge.s}
  >
    {badge.s === "pago"
      ? `pago${badge.ate ? ` até ${dataBR(badge.ate)}` : ""}`
      : `pendente${badge.ate ? ` desde ${dataBR(badge.ate)}` : ""}`}
  </span>
);

const BTN_SEC = "inline-flex items-center gap-1.5 border border-primary/40 text-primary font-heading text-xs uppercase tracking-wider px-3 py-2 hover:bg-primary/10 rounded-lg transition-colors disabled:opacity-50";
const BTN_PRI = "inline-flex items-center gap-1.5 bg-primary text-primary-foreground font-heading text-xs uppercase tracking-widest px-3 py-2 hover:bg-primary/90 rounded-lg transition-colors disabled:opacity-50";
const BTN_DES = "inline-flex items-center gap-1.5 border border-destructive/40 text-destructive font-heading text-xs uppercase tracking-wider px-3 py-2 hover:bg-destructive/10 rounded-lg transition-colors disabled:opacity-50";

/** Modal com a imagem (ou PDF) do comprovante — URL assinada de 5 min vinda do `comprovante-url`. */
export const ComprovanteImagemModal = ({ url, ehPdf, onClose }: { url: string; ehPdf: boolean; onClose: () => void }) => {
  // imagem que não renderiza (ex.: PDF sem extensão) cai pro iframe
  const [falhou, setFalhou] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={onClose} data-modal-comprovante>
      <div className="bg-card border border-border rounded-xl p-4 max-w-lg w-full space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-heading text-sm text-foreground uppercase tracking-wider">Comprovante</h3>
          <button type="button" onClick={onClose} aria-label="Fechar" className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={18} />
          </button>
        </div>
        {ehPdf || falhou ? (
          <iframe src={url} title="Comprovante" className="w-full h-[60vh] rounded-lg bg-background border border-border" />
        ) : (
          <img src={url} alt="Comprovante" className="w-full max-h-[60vh] object-contain rounded-lg bg-background" onError={() => setFalhou(true)} />
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <a href={url} target="_blank" rel="noreferrer" className={BTN_SEC}>
            <ExternalLink size={12} /> Abrir em nova aba
          </a>
          <p className="text-[10px] text-muted-foreground font-body">Link válido por 5 minutos.</p>
        </div>
      </div>
    </div>
  );
};

interface Props {
  item: PixPendente;
  /** Chamado depois de confirmar/recusar (ou quando o servidor diz que já foi tratado) — o pai recarrega. */
  onResolvido?: (acao: "confirmado" | "recusado" | "ja_tratado") => void;
}

const ComprovantePixCard = ({ item, onResolvido }: Props) => {
  const [busy, setBusy] = useState(false);
  const [urlModal, setUrlModal] = useState<string | null>(null);
  const [recusando, setRecusando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const ehPdf = /\.pdf($|\?)/i.test(item.comprovante_path || "");
  const tituloAluno = item.aluno ? item.aluno.nome || item.aluno.email || "Aluno" : null;

  const tratarErro = (e: unknown, fallback: string) => {
    const msg = (e as { message?: string } | null)?.message;
    if (msg === "nao_pendente") {
      toast.error("Esse comprovante já foi tratado.");
      onResolvido?.("ja_tratado");
    } else if (msg === "forbidden") toast.error("Esse aluno não está na sua lista.");
    else if (msg === "not_found") toast.error("Comprovante não encontrado.");
    else toast.error(fallback);
  };

  const verComprovante = async () => {
    setBusy(true);
    try {
      const r = await invokeMp<{ url: string }>("comprovante-url", { pagamentoId: item.id });
      setUrlModal(r.url);
    } catch (e) {
      tratarErro(e, "Erro ao abrir o comprovante.");
    } finally {
      setBusy(false);
    }
  };

  const confirmar = async () => {
    if (!window.confirm(`Confirmar o recebimento de ${fmtBRL(item.valor)} (${mesRefLabel(item.mes_ref)})? O aluno fica em dia.`)) return;
    setBusy(true);
    try {
      await invokeMp("admin-confirmar-pix", { pagamentoId: item.id });
      toast.success("Pagamento confirmado — aluno em dia.");
      onResolvido?.("confirmado");
    } catch (e) {
      tratarErro(e, "Erro ao confirmar o pagamento.");
    } finally {
      setBusy(false);
    }
  };

  const recusar = async () => {
    const m = motivo.trim();
    if (!m) { toast.error("Informe o motivo da recusa — o aluno vai ver."); return; }
    setBusy(true);
    try {
      await invokeMp("admin-recusar-pix", { pagamentoId: item.id, motivo: m });
      toast.success("Comprovante recusado. O aluno vê o motivo na tela Pagamentos.");
      setRecusando(false);
      setMotivo("");
      onResolvido?.("recusado");
    } catch (e) {
      tratarErro(e, "Erro ao recusar o comprovante.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="result-card border-primary/40 p-4 space-y-3" data-comprovante-pendente={item.id}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {tituloAluno && <p className="font-heading text-sm text-foreground truncate">{tituloAluno}</p>}
          {item.aluno?.nome && item.aluno.email && (
            <p className="text-xs text-muted-foreground font-body truncate">{item.aluno.email}</p>
          )}
          <p className="text-xs text-muted-foreground font-body mt-1">
            <span className="font-heading uppercase tracking-wider text-foreground">{mesRefLabel(item.mes_ref)}</span>
            {" · "}enviado em {fmtDataHora(item.created_at)}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="font-heading text-lg text-primary">{fmtBRL(item.valor)}</p>
          <span className="text-[10px] font-heading uppercase px-2 py-0.5 rounded-full bg-muted text-muted-foreground">aguardando</span>
        </div>
      </div>

      {recusando ? (
        <div className="space-y-2" data-recusa-form>
          <label className="text-xs text-muted-foreground font-body uppercase tracking-wider">Motivo da recusa (o aluno vê)</label>
          <input
            autoFocus
            type="text"
            value={motivo}
            maxLength={200}
            onChange={(e) => setMotivo(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void recusar(); } }}
            placeholder="Ex.: valor diferente da mensalidade, comprovante ilegível..."
            className="input-underline text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={recusar} disabled={busy} className={BTN_DES} data-btn-confirmar-recusa>
              <X size={12} /> Confirmar recusa
            </button>
            <button type="button" onClick={() => { setRecusando(false); setMotivo(""); }} disabled={busy}
              className="text-xs font-heading uppercase tracking-wider text-muted-foreground border border-border rounded-lg px-3 py-2 hover:text-foreground transition-colors disabled:opacity-50">
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={verComprovante} disabled={busy} className={BTN_SEC} data-btn-ver-comprovante>
            <Eye size={12} /> Ver comprovante
          </button>
          <button type="button" onClick={confirmar} disabled={busy} className={BTN_PRI} data-btn-confirmar-pix>
            <Check size={12} /> Confirmar
          </button>
          <button type="button" onClick={() => setRecusando(true)} disabled={busy} className={BTN_DES} data-btn-recusar-pix>
            <X size={12} /> Recusar
          </button>
        </div>
      )}

      {urlModal && <ComprovanteImagemModal url={urlModal} ehPdf={ehPdf} onClose={() => setUrlModal(null)} />}
    </div>
  );
};

export default ComprovantePixCard;
