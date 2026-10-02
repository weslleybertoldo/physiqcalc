// Physiq W27 — as peças do visual antigo que a Biblioteca global (a única página antiga do master que ficou) usa; vieram de
// src/components/master/masterUi.tsx, que saiu com as outras páginas antigas do master. W28: os rótulos, os textos e o hook da
// cobrança antiga do Calc (planos, ciclo e situação do professor — master-planos/master-financeiro do Treino) saíram com o legado.
import { useCallback, useEffect, useState, type HTMLAttributes, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Peças compartilhadas da área MASTER (SaaS 12/09/2026). Só estilo/utilidades — nada de regra de negócio.

// ─────────────────────────── classes (seguem o design do app) ───────────────────────────
export const BTN_PRIMARIO = "bg-primary text-primary-foreground font-heading text-xs uppercase tracking-widest px-4 py-2 hover:bg-primary/90 transition-colors disabled:opacity-50";
export const BTN_SECUNDARIO = "border border-primary/40 text-primary font-heading text-xs uppercase tracking-wider px-4 py-2 hover:bg-primary/10 rounded-lg transition-colors disabled:opacity-50";
export const BTN_PERIGO = "border border-destructive/40 text-destructive font-heading text-xs uppercase tracking-wider px-4 py-2 hover:bg-destructive/10 rounded-lg transition-colors disabled:opacity-50";
export const BTN_NEUTRO = "border border-border text-muted-foreground font-heading text-xs uppercase tracking-wider px-4 py-2 hover:text-foreground rounded-lg transition-colors disabled:opacity-50";
/** botão pequeno pra ações inline (linhas compactas) */
export const BTN_MINI = "font-heading uppercase tracking-wider text-[10px] px-2.5 py-1 rounded-lg border transition-colors disabled:opacity-50";
export const BTN_MINI_PRIMARIO = `${BTN_MINI} border-primary/40 text-primary hover:bg-primary/10`;
export const BTN_MINI_PERIGO = `${BTN_MINI} border-destructive/40 text-destructive hover:bg-destructive/10`;
export const BTN_MINI_NEUTRO = `${BTN_MINI} border-border text-muted-foreground hover:text-foreground`;

export const INPUT = "input-underline text-sm py-2";
export const TEXTAREA = "w-full bg-card border border-border rounded-lg px-3 py-2 text-foreground font-body text-sm resize-y outline-hidden focus:border-primary";
export const SELECT_TRIGGER = "h-9 text-sm bg-transparent border-muted-foreground/40 font-body text-foreground";
export const SELECT_CONTENT = "bg-background border-muted-foreground/30 text-foreground font-body";
export const DIALOG_CONTENT = "bg-background border-muted-foreground/30";
export const MENU_CONTENT = "bg-background border-muted-foreground/30 font-body text-sm";
export const LINHA = "py-3 border-b border-muted-foreground/30 last:border-0";

// ─────────────────────────── utilidades ───────────────────────────
export function nomeDoUser(user: { user_metadata?: Record<string, unknown>; email?: string | null } | null | undefined): string {
  const m = (user?.user_metadata ?? {}) as { full_name?: string; name?: string };
  return m.full_name || m.name || user?.email || "";
}

// ─────────────────────────── datas ───────────────────────────
const pad = (n: number) => String(n).padStart(2, "0");
export function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function addDiasISO(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ─────────────────────────── erros das edges → texto ───────────────────────────
const ERROS_COMUNS: Record<string, string> = {
  not_authenticated: "Sessão expirada — entre de novo.",
  missing_auth: "Sessão expirada — entre de novo.",
  invalid_token: "Sessão expirada — entre de novo.",
  forbidden: "Só o master pode fazer isso.",
  plano_vencido: "Acesso travado pelo plano.",
  rate_limited: "Muitas ações em pouco tempo. Aguarde um instante e tente de novo.",
  not_found: "Registro não encontrado.",
  internal: "Erro interno no servidor. Tente de novo.",
  unknown_action: "Ação desconhecida — o contrato da edge mudou?",
  // master-professores
  ja_professor: "Essa pessoa já é professor.",
  tem_alunos: "Esse professor ainda tem alunos. Mova os alunos antes de remover.",
  limite_plano_destino: "O plano do professor de destino não comporta esses alunos.",
  destino_invalido: "Professor de destino inválido ou suspenso.",
  missing_alunos: "Selecione pelo menos um aluno.",
  mercadopago_so_master: "Mercado Pago só pode ser ativado na conta do master (por enquanto).",
  tipo_invalido: "Tipo de integração inválido.",
  plano_invalido: "Plano inválido.",
  nao_pode_suspender_master: "O master não pode ser suspenso.",
  nao_pode_remover_master: "O master não pode ser removido.",
  email_invalido: "E-mail inválido.",
  // master-financeiro
  sem_valor: "Informe o valor do pagamento.",
  data_futura: "A data do pagamento não pode ser no futuro.",
  nao_manual: "Só pagamentos manuais podem ser removidos.",
  no_fields: "Nada para salvar.",
  invalid_ate: "Data inválida.",
  sem_assinatura: "Esse professor não tem assinatura ativa.",
  mp_error: "O Mercado Pago recusou a operação. Tente de novo em instantes.",
  nao_reembolsavel: "Esse pagamento não está aprovado — não dá pra reembolsar.",
  sem_transacao_mp: "Pagamento sem transação no Mercado Pago — não dá pra reembolsar por aqui.",
  // master-planos
  nome_duplicado: "Já existe um plano com esse nome.",
  missing_nome: "Informe o nome do plano.",
  invalid_valor_mensal: "Informe um valor mensal válido.",
  missing_id: "Plano sem id.",
};
export function mensagemErro(e: unknown, extras: Record<string, string> = {}, padrao = "Algo deu errado. Tente de novo."): string {
  const code = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  if (code && extras[code]) return extras[code];
  if (code && ERROS_COMUNS[code]) return ERROS_COMUNS[code];
  if (code.startsWith("invalid_")) return `Campo inválido: ${code.slice(8)}.`;
  if (code.startsWith("missing_")) return `Faltou informar: ${code.slice(8)}.`;
  if (code.startsWith("http_")) return `Falha na rede (${code.slice(5)}).`;
  return padrao;
}

export async function copiar(texto: string, msg = "Copiado!") {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success(msg);
  } catch {
    toast.error("Não foi possível copiar.");
  }
}

// ─────────────────────────── hooks ───────────────────────────
export function useDebounce<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

interface ConfirmOpts { titulo: string; descricao?: ReactNode; confirmar?: string; perigo?: boolean }
/** `const { confirmar, dialogo } = useConfirmacao(); if (!(await confirmar({...}))) return;` — renderize `{dialogo}` na página. */
export function useConfirmacao() {
  const [estado, setEstado] = useState<{ opts: ConfirmOpts; resolve: (v: boolean) => void } | null>(null);
  const confirmar = useCallback((opts: ConfirmOpts) => new Promise<boolean>((resolve) => setEstado({ opts, resolve })), []);
  const fechar = (v: boolean) => {
    estado?.resolve(v);
    setEstado(null);
  };
  const dialogo = (
    <AlertDialog open={!!estado} onOpenChange={(o) => { if (!o) fechar(false); }}>
      <AlertDialogContent className={DIALOG_CONTENT} data-dialogo-confirmacao>
        <AlertDialogHeader>
          <AlertDialogTitle className="font-heading text-foreground">{estado?.opts.titulo}</AlertDialogTitle>
          {estado?.opts.descricao && <AlertDialogDescription className="font-body">{estado.opts.descricao}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="border-muted-foreground/30 text-foreground">Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => fechar(true)}
            className={estado?.opts.perigo ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : "bg-primary text-primary-foreground hover:bg-primary/90"}
            data-btn-confirmar
          >
            {estado?.opts.confirmar ?? "Confirmar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
  return { confirmar, dialogo };
}

// ─────────────────────────── componentes ───────────────────────────
export type Tom = "ok" | "ruim" | "neutro" | "aviso" | "info";
const TOM_CLS: Record<Tom, string> = {
  ok: "bg-primary/15 text-primary",
  ruim: "bg-destructive/15 text-destructive",
  neutro: "bg-muted text-muted-foreground",
  aviso: "bg-classify-yellow/20 text-classify-yellow",
  info: "bg-primary/10 text-primary",
};
/** Badge do app. `cls` substitui o tom (classes próprias). */
export function Etiqueta({ tom = "neutro", cls, className = "", children, ...rest }: { tom?: Tom; cls?: string; className?: string; children: ReactNode } & Omit<HTMLAttributes<HTMLSpanElement>, "children">) {
  return (
    <span className={`text-xs font-heading uppercase px-2 py-0.5 rounded-full whitespace-nowrap leading-tight ${cls ?? TOM_CLS[tom]} ${className}`} {...rest}>
      {children}
    </span>
  );
}

/** Chip de filtro (pílula). */
export function Chip({ ativo, onClick, children, className = "", ...rest }: { ativo: boolean; onClick: () => void; children: ReactNode; className?: string } & Omit<HTMLAttributes<HTMLButtonElement>, "onClick" | "children">) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={`font-heading uppercase tracking-wider text-[10px] px-3 py-1.5 rounded-full border transition-colors whitespace-nowrap ${ativo ? "bg-primary text-primary-foreground border-primary" : "border-muted-foreground/40 text-muted-foreground hover:text-foreground hover:border-muted-foreground"} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Card de KPI clicável (link ou botão). */
export function KpiCard({ rotulo, valor, to, onClick, tom = "neutro", ...rest }: { rotulo: string; valor: ReactNode; to?: string; onClick?: () => void; tom?: Tom } & Record<`data-${string}`, string | undefined>) {
  const cls = "border border-muted-foreground/30 p-3 sm:p-4 text-left hover:border-primary/60 hover:bg-primary/5 transition-colors block w-full min-w-0";
  const corValor = tom === "ruim" ? "text-destructive" : tom === "ok" ? "text-primary" : tom === "aviso" ? "text-classify-yellow" : "text-foreground";
  const inner = (
    <>
      <p className={`font-heading text-2xl leading-none ${corValor}`}>{valor}</p>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-body mt-2 leading-tight">{rotulo}</p>
    </>
  );
  if (to) return <Link to={to} className={cls} {...rest}>{inner}</Link>;
  return <button type="button" onClick={onClick} className={cls} {...rest}>{inner}</button>;
}

/** Título padrão das páginas do Master (dentro do MasterLayout). */
export function TituloPagina({ titulo, sub, acao }: { titulo: string; sub?: ReactNode; acao?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
      <div className="min-w-0">
        <h1 className="font-heading text-xl text-foreground uppercase tracking-wider">{titulo}</h1>
        {sub && <p className="text-xs text-muted-foreground font-body mt-1">{sub}</p>}
      </div>
      {acao && <div className="flex flex-wrap gap-2 shrink-0">{acao}</div>}
    </div>
  );
}

export function Secao({ titulo, children, acao, id }: { titulo: string; children: ReactNode; acao?: ReactNode; id?: string }) {
  return (
    <section id={id} className="mt-8 first:mt-0">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="font-heading text-sm text-foreground uppercase tracking-wider">{titulo}</h2>
        {acao}
      </div>
      {children}
    </section>
  );
}

/** Rótulo + campo (não usa <label> pra não brigar com o Select do Radix). */
export function Campo({ rotulo, children, dica, className = "" }: { rotulo: ReactNode; children: ReactNode; dica?: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col gap-1 min-w-0 ${className}`}>
      <span className="text-[10px] text-muted-foreground font-body uppercase tracking-wider">{rotulo}</span>
      {children}
      {dica && <span className="text-[10px] text-muted-foreground font-body">{dica}</span>}
    </div>
  );
}

/** Linha "chave · valor" em painéis de detalhe. */
export function Dado({ k, v, destaque }: { k: string; v: ReactNode; destaque?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/40 py-1.5 last:border-0 text-sm font-body">
      <span className="text-muted-foreground text-[10px] uppercase tracking-wider pt-0.5 shrink-0">{k}</span>
      <span className={`text-right wrap-break-word min-w-0 ${destaque ? "text-primary" : "text-foreground"}`}>{v ?? "—"}</span>
    </div>
  );
}

export const Carregando = ({ texto = "Carregando..." }: { texto?: string }) => (
  <p className="text-muted-foreground font-body text-sm" data-carregando>{texto}</p>
);
export const Vazio = ({ texto }: { texto: string }) => (
  <p className="text-muted-foreground font-body text-sm py-4" data-vazio>{texto}</p>
);
export const ErroCarregar = ({ texto, onRetry }: { texto?: string | null; onRetry?: () => void }) => (
  <div className="flex flex-wrap items-center gap-3 text-sm font-body text-destructive py-2" data-erro>
    <span>{texto || "Erro ao carregar."}</span>
    {onRetry && <button type="button" onClick={onRetry} className={BTN_MINI_NEUTRO}>Tentar de novo</button>}
  </div>
);
