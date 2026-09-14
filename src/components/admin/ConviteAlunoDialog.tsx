import { useCallback, useEffect, useState } from "react";
import { Copy, MessageCircle, Send, Share2, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtDataHora, professorConvites } from "@/lib/saasApi";

/**
 * Convidar aluno (SaaS 12/09/2026): link + código fixo do professor, convite por e-mail e
 * lista de convites pendentes (revogar). A edge manda o e-mail com o link via Resend quando
 * RESEND_API_KEY está configurada; sem ela, o professor manda o link pelo WhatsApp. Usado como popup na lista de Alunos e embutido em Configurações › Convite.
 */

export interface ConviteAluno {
  id: string;
  email: string;
  status: "pendente" | "aceito" | "revogado";
  enviado_em: string;
  aceito_em: string | null;
}

export const TEXTO_CONVITE = "Entre na minha lista de alunos no PhysiqCalc pelo link:";

const MSG_ERRO_CONVITE: Record<string, string> = {
  email_invalido: "E-mail inválido.",
  limite_plano: "Você atingiu o limite de alunos do seu plano — mude de plano em Planos.",
  aluno_de_outro_professor: "Esse aluno já está na lista de outro professor.",
  email_de_professor: "Esse e-mail é de um professor — não dá pra convidar como aluno.",
  plano_vencido: "Seu plano está vencido — regularize em Planos para convidar.",
  nao_professor: "Sua conta ainda não é de professor.",
  rate_limited: "Muitas tentativas — aguarde um minuto.",
  not_authenticated: "Sessão expirada — entre de novo.",
};

/** Mensagem amigável pro código de erro da edge (EdgeError.message). */
export const erroConviteMsg = (e: unknown, fallback: string): string =>
  MSG_ERRO_CONVITE[(e as { message?: string } | null)?.message ?? ""] || fallback;

export async function copiarTexto(texto: string, aviso = "Copiado!") {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success(aviso);
  } catch {
    toast.error("Não foi possível copiar. Selecione o texto e copie manualmente.");
  }
}

/** navigator.share quando existe (celular); senão copia pro clipboard. */
export async function compartilharLink(url: string, texto = TEXTO_CONVITE) {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title: "PhysiqCalc", text: texto, url });
      return;
    } catch (e) {
      if ((e as { name?: string } | null)?.name === "AbortError") return; // usuário fechou o painel
      // sem suporte real → cai pro clipboard
    }
  }
  await copiarTexto(url, "Link copiado! Cole no WhatsApp do aluno.");
}

const BTN_SEC = "inline-flex items-center gap-1.5 border border-primary/40 text-primary font-heading text-xs uppercase tracking-wider px-3 py-2 hover:bg-primary/10 rounded-lg transition-colors disabled:opacity-50";
const BTN_PRI = "inline-flex items-center gap-1.5 bg-primary text-primary-foreground font-heading text-xs uppercase tracking-widest px-3 py-2 hover:bg-primary/90 rounded-lg transition-colors disabled:opacity-50";

interface ConteudoProps {
  /** Convite por e-mail que vinculou na hora → o pai recarrega a lista de alunos. */
  onVinculado?: () => void;
  /** Esconde a seção do link/código (quando a tela em volta já mostra). */
  mostrarLink?: boolean;
}

/** Conteúdo do convite (sem o Dialog) — embutido em Configurações › Convite. */
export const ConviteAlunoConteudo = ({ onVinculado, mostrarLink = true }: ConteudoProps) => {
  const [link, setLink] = useState<{ codigo: string; url: string } | null>(null);
  const [erroLink, setErroLink] = useState<string | null>(null);
  const [convites, setConvites] = useState<ConviteAluno[]>([]);
  const [email, setEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ tipo: "vinculado" | "ja_era" | "pendente"; email: string; emailEnviado?: boolean } | null>(null);

  const carregar = useCallback(async () => {
    try {
      const [l, c] = await Promise.all([
        professorConvites<{ codigo: string; url: string }>("link"),
        professorConvites<{ convites: ConviteAluno[] }>("list"),
      ]);
      setLink(l);
      setConvites(c.convites || []);
      setErroLink(null);
    } catch (e) {
      setErroLink(erroConviteMsg(e, "Erro ao carregar o link de convite."));
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  const convidar = async () => {
    const em = email.trim().toLowerCase();
    if (!em) return;
    setEnviando(true);
    try {
      const r = await professorConvites<{ vinculado: boolean; jaEra?: boolean; jaExistia?: boolean; convite?: ConviteAluno; emailEnviado?: boolean }>("email", { email: em });
      if (r.vinculado) {
        setResultado({ tipo: r.jaEra ? "ja_era" : "vinculado", email: em });
        if (!r.jaEra) {
          toast.success(`${em} entrou na sua lista.`);
          onVinculado?.();
        }
      } else {
        setResultado({ tipo: "pendente", email: em, emailEnviado: !!r.emailEnviado });
        toast.success(r.jaExistia ? "Esse convite já estava pendente." : r.emailEnviado ? "Convite enviado por e-mail." : "Convite registrado.");
      }
      setEmail("");
      void carregar();
    } catch (e) {
      toast.error(erroConviteMsg(e, "Erro ao convidar."));
    } finally {
      setEnviando(false);
    }
  };

  const revogar = async (c: ConviteAluno) => {
    if (!window.confirm(`Revogar o convite de ${c.email}? Ele não entra mais na sua lista por esse convite (o link continua valendo).`)) return;
    try {
      await professorConvites("revoke", { id: c.id });
      toast.success("Convite revogado.");
      void carregar();
    } catch (e) {
      toast.error(erroConviteMsg(e, "Erro ao revogar o convite."));
    }
  };

  const pendentes = convites.filter((c) => c.status === "pendente");
  const aceitos = convites.filter((c) => c.status === "aceito").length;
  const whatsappHref = link ? `https://wa.me/?text=${encodeURIComponent(`${TEXTO_CONVITE} ${link.url}`)}` : undefined;

  return (
    <div className="space-y-6 font-body" data-convite-conteudo>
      {erroLink && <p className="text-xs text-destructive">{erroLink}</p>}

      {mostrarLink && link && (
        <section className="space-y-3">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Seu link de convite</p>
            <input readOnly value={link.url} onFocus={(e) => e.currentTarget.select()} className="input-underline text-sm py-2" data-convite-link />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => copiarTexto(link.url, "Link copiado!")} className={BTN_SEC} data-btn-copiar-link>
              <Copy size={12} /> Copiar link
            </button>
            <button type="button" onClick={() => compartilharLink(link.url)} className={BTN_SEC} data-btn-compartilhar-link>
              <Share2 size={12} /> Compartilhar
            </button>
            {whatsappHref && (
              <a href={whatsappHref} target="_blank" rel="noreferrer" className={BTN_SEC} data-btn-whatsapp>
                <MessageCircle size={12} /> WhatsApp
              </a>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Código fixo:</span>
            <span className="font-heading text-base text-primary tracking-wider" data-convite-codigo>{link.codigo}</span>
            <button type="button" onClick={() => copiarTexto(link.codigo, "Código copiado!")} title="Copiar código" className="p-1.5 text-muted-foreground hover:text-primary transition-colors">
              <Copy size={13} />
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            O aluno abre o link, entra com Google e cai direto na sua lista. O código não muda.
          </p>
        </section>
      )}

      <section className="space-y-3">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">Convidar por e-mail</p>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void convidar(); } }}
            placeholder="email@do.aluno"
            className="input-underline text-sm py-2 flex-1"
            data-convite-email-input
          />
          <button type="button" onClick={convidar} disabled={enviando || !email.trim()} className={`${BTN_PRI} shrink-0`} data-btn-convidar-email>
            <Send size={12} /> {enviando ? "Enviando..." : "Convidar"}
          </button>
        </div>
        {resultado && (
          <div
            className={`border rounded-lg p-3 text-xs ${resultado.tipo === "pendente" ? "border-muted-foreground/30 bg-muted/20 text-foreground" : "border-primary/40 bg-primary/10 text-foreground"}`}
            data-convite-resultado={resultado.tipo}
          >
            {resultado.tipo === "vinculado" && <>✅ <b>{resultado.email}</b> já tinha conta e entrou na sua lista.</>}
            {resultado.tipo === "ja_era" && <>👍 <b>{resultado.email}</b> já está na sua lista.</>}
            {resultado.tipo === "pendente" && (
              <div className="space-y-2">
                <p>⏳ Convite pendente — <b>{resultado.email}</b> ainda não tem conta. {resultado.emailEnviado ? "Enviamos um e-mail com o link. " : "Mande o link pelo WhatsApp: "}Ao entrar com Google, entra na sua lista automaticamente.</p>
                {whatsappHref && (
                  <a href={whatsappHref} target="_blank" rel="noreferrer" className={BTN_SEC}>
                    <MessageCircle size={12} /> Mandar o link pelo WhatsApp
                  </a>
                )}
              </div>
            )}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          Se a pessoa já tem conta e está sem professor, entra na hora; senão fica pendente até entrar com Google — o link vai por e-mail e você também pode mandar pelo WhatsApp.
        </p>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Convites pendentes ({pendentes.length})</p>
          {aceitos > 0 && <span className="text-[11px] text-muted-foreground">{aceitos} aceito{aceitos > 1 ? "s" : ""}</span>}
        </div>
        {pendentes.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum convite pendente.</p>
        ) : (
          <div className="space-y-0">
            {pendentes.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 py-2 border-b border-muted-foreground/20 last:border-0" data-convite-pendente={c.id}>
                <div className="min-w-0">
                  <p className="text-sm text-foreground truncate">{c.email}</p>
                  <p className="text-[11px] text-muted-foreground">enviado em {fmtDataHora(c.enviado_em)}</p>
                </div>
                <button type="button" onClick={() => revogar(c)} title="Revogar convite"
                  className="shrink-0 inline-flex items-center gap-1 text-[10px] font-heading uppercase tracking-wider text-muted-foreground hover:text-destructive transition-colors" data-btn-revogar={c.id}>
                  <X size={12} /> Revogar
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVinculado?: () => void;
}

const ConviteAlunoDialog = ({ open, onOpenChange, onVinculado }: DialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="bg-background border-muted-foreground/30 max-w-lg max-h-[90vh] overflow-y-auto" data-dialog-convite>
      <DialogHeader>
        <DialogTitle className="font-heading text-foreground uppercase tracking-wider text-base">Convidar aluno</DialogTitle>
        <DialogDescription className="font-body text-xs">
          Compartilhe seu link (ou convide por e-mail). O aluno entra com Google e já aparece na sua lista.
        </DialogDescription>
      </DialogHeader>
      <ConviteAlunoConteudo onVinculado={onVinculado} />
    </DialogContent>
  </Dialog>
);

export default ConviteAlunoDialog;
