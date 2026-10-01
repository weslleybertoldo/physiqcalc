import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Check, Plus, Save, X } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Campo, MensagemForm } from "@/entrada/pecas/Campo";
import { CampoSelect } from "@/painel/configuracoes/pecas/Form";
import { cn } from "@/lib/utils";
import { Botao } from "@/ui/premium/Botao";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { METODOS_LANCAMENTO, type Categoria, type MetodoLancamento, type TipoLancamento } from "../lancamentos";
import { hojeSP, lerValor, reais, ROTULO_METODO } from "../regras";
import type { CobrancaVista } from "../tipos";

function Painel({ aberto, aoFechar, titulo, descricao, children }: { aberto: boolean; aoFechar: () => void; titulo: string; descricao?: ReactNode; children: ReactNode }) {
  const celular = useIsMobile();
  return (
    <PainelDeslizante aberto={aberto} aoMudar={(a) => !a && aoFechar()} lado={celular ? "baixo" : "direita"} titulo={titulo} descricao={descricao}>
      {children}
    </PainelDeslizante>
  );
}

export function CaixaMarcar({ marcado, aoMudar, children, marca }: { marcado: boolean; aoMudar: (v: boolean) => void; children: ReactNode; marca?: string }) {
  return (
    <button type="button" role="checkbox" aria-checked={marcado} onClick={() => aoMudar(!marcado)} data-caixa={marca}
      className="flex items-start gap-2.5 rounded-2xl border border-linha bg-superficie px-3 py-2.5 text-left text-[12.5px] text-texto-2">
      <span className={cn("mt-px flex h-5 w-5 flex-none items-center justify-center rounded-[7px] border",
        marcado ? "border-transparent bg-[var(--p-botao-w-fundo)] text-[var(--p-botao-w-texto)]" : "border-linha-2")}>
        {marcado && <Check aria-hidden className="h-3.5 w-3.5" strokeWidth={3} />}
      </span>
      <span>{children}</span>
    </button>
  );
}

/** Registrar pagamento feito por fora (dinheiro, Pix por fora…): a mensalidade (+1 mês) ou uma cobrança avulsa em aberto. */
export function DialogoRegistrar({
  aberto,
  aoFechar,
  cobranca,
  mensalidade,
  aoSalvar,
}: {
  aberto: boolean;
  aoFechar: () => void;
  cobranca: CobrancaVista | null;
  mensalidade: number | null;
  aoSalvar: (d: { data: string; metodo: string; valor: number | null; lancar: boolean }) => Promise<boolean>;
}) {
  const [data, setData] = useState(hojeSP());
  const [metodo, setMetodo] = useState("dinheiro");
  const [valor, setValor] = useState("");
  const [lancar, setLancar] = useState(true);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    if (!aberto) return;
    setData(hojeSP());
    setMetodo("dinheiro");
    setValor(cobranca ? String(cobranca.valor).replace(".", ",") : mensalidade ? String(mensalidade).replace(".", ",") : "");
    setLancar(true);
    setErro("");
  }, [aberto, cobranca, mensalidade]);
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!data || data > hojeSP()) return setErro("A data do pagamento não pode ser no futuro.");
    const v = cobranca ? Number(cobranca.valor) : lerValor(valor);
    if (!v) return setErro("Informe o valor.");
    setSalvando(true);
    const ok = await aoSalvar({ data, metodo, valor: v, lancar });
    setSalvando(false);
    if (ok) aoFechar();
  };
  return (
    <Painel aberto={aberto} aoFechar={aoFechar} titulo="Registrar pagamento feito por fora"
      descricao={cobranca ? `${cobranca.descricao} · ${reais(cobranca.valor)}` : "Cobre 1 mês a partir da data — o aluno fica em dia."}>
      <form onSubmit={enviar} className="flex flex-col gap-4 pt-2" data-form-registrar>
        <Campo rotulo="Data do pagamento" type="date" max={hojeSP()} value={data} onChange={(e) => { setData(e.target.value); setErro(""); }} data-registrar-data />
        <CampoSelect rotulo="Como foi pago" value={metodo} onChange={(e) => setMetodo(e.target.value)} data-registrar-metodo>
          {Object.entries(ROTULO_METODO).map(([v, r]) => <option key={v} value={v}>{r === "Pix" ? "Pix (por fora)" : r === "Cartão" ? "Cartão (por fora)" : r}</option>)}
        </CampoSelect>
        {!cobranca && <Campo rotulo="Valor (R$)" inputMode="decimal" value={valor} onChange={(e) => { setValor(e.target.value); setErro(""); }} placeholder="Ex.: 150,00" data-registrar-valor />}
        <CaixaMarcar marcado={lancar} aoMudar={setLancar} marca="registrar-lancar">Lançar como entrada nos lançamentos do aluno (para emitir o recibo)</CaixaMarcar>
        {erro && <MensagemForm>{erro}</MensagemForm>}
        <Botao type="submit" variante="w" icone={Check} disabled={salvando} data-registrar-salvar>{salvando ? "Registrando…" : "Registrar pagamento"}</Botao>
      </form>
    </Painel>
  );
}

/** Nova cobrança avulsa (a do Nutri: descrição, valor, vencimento). */
export function DialogoNovaCobranca({ aberto, aoFechar, aoSalvar }: { aberto: boolean; aoFechar: () => void; aoSalvar: (d: { descricao: string; valor: number; vencimento: string }) => Promise<boolean> }) {
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [vencimento, setVencimento] = useState(hojeSP());
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    if (!aberto) return;
    setDescricao("");
    setValor("");
    setVencimento(hojeSP());
    setErro("");
  }, [aberto]);
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!descricao.trim()) return setErro("Descreva a cobrança.");
    const v = lerValor(valor);
    if (!v) return setErro("Informe o valor.");
    if (!vencimento) return setErro("Informe o vencimento.");
    setSalvando(true);
    const ok = await aoSalvar({ descricao: descricao.trim(), valor: v, vencimento });
    setSalvando(false);
    if (ok) aoFechar();
  };
  return (
    <Painel aberto={aberto} aoFechar={aoFechar} titulo="Nova cobrança" descricao="O aluno vê em Perfil › Pagamentos e paga por Pix com comprovante quando a conta tem chave.">
      <form onSubmit={enviar} className="flex flex-col gap-4 pt-2" data-form-nova-cobranca>
        <Campo rotulo="Descrição" maxLength={160} value={descricao} onChange={(e) => { setDescricao(e.target.value); setErro(""); }} placeholder="Ex.: Consulta de retorno" data-cobranca-descricao />
        <Campo rotulo="Valor (R$)" inputMode="decimal" value={valor} onChange={(e) => { setValor(e.target.value); setErro(""); }} placeholder="Ex.: 180,00" data-cobranca-valor />
        <Campo rotulo="Vencimento" type="date" value={vencimento} onChange={(e) => { setVencimento(e.target.value); setErro(""); }} data-cobranca-vencimento />
        {erro && <MensagemForm>{erro}</MensagemForm>}
        <Botao type="submit" variante="w" icone={Plus} disabled={salvando} data-cobranca-salvar>{salvando ? "Criando…" : "Criar cobrança"}</Botao>
      </form>
    </Painel>
  );
}

/** Recusar o comprovante (o aluno vê o motivo). */
export function DialogoRecusar({ cobranca, aoFechar, aoRecusar }: { cobranca: CobrancaVista | null; aoFechar: () => void; aoRecusar: (motivo: string) => Promise<boolean> }) {
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  useEffect(() => setMotivo(""), [cobranca]);
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!motivo.trim()) return;
    setSalvando(true);
    const ok = await aoRecusar(motivo.trim());
    setSalvando(false);
    if (ok) aoFechar();
  };
  return (
    <Painel aberto={!!cobranca} aoFechar={aoFechar} titulo="Recusar o comprovante" descricao={cobranca ? `${cobranca.descricao} · ${reais(cobranca.valor)}` : undefined}>
      <form onSubmit={enviar} className="flex flex-col gap-4 pt-2" data-form-recusar>
        <Campo rotulo="Motivo (o aluno vê)" maxLength={200} autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: valor diferente da mensalidade" data-recusar-motivo />
        <Botao type="submit" variante="g" icone={X} disabled={salvando || !motivo.trim()} data-recusar-confirmar>{salvando ? "Recusando…" : "Confirmar a recusa"}</Botao>
      </form>
    </Painel>
  );
}

/** Registrar um lançamento (entrada/saída) ligado ao aluno — o "Registrar financeiro" do Nutri. */
export function DialogoLancamento({
  aberto,
  aoFechar,
  categorias,
  aoSalvar,
}: {
  aberto: boolean;
  aoFechar: () => void;
  categorias: Categoria[];
  aoSalvar: (d: { tipo: TipoLancamento; descricao: string; valor: number; data: string; metodo: MetodoLancamento; categoriaId: string | null; observacao: string | null }) => Promise<boolean>;
}) {
  const [tipo, setTipo] = useState<TipoLancamento>("entrada");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(hojeSP());
  const [metodo, setMetodo] = useState<MetodoLancamento>("pix");
  const [categoria, setCategoria] = useState("");
  const [obs, setObs] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    if (!aberto) return;
    setTipo("entrada");
    setDescricao("");
    setValor("");
    setData(hojeSP());
    setMetodo("pix");
    setCategoria("");
    setObs("");
    setErro("");
  }, [aberto]);
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!descricao.trim()) return setErro("Descreva o lançamento.");
    const v = lerValor(valor);
    if (!v) return setErro("Informe o valor.");
    setSalvando(true);
    const ok = await aoSalvar({ tipo, descricao: descricao.trim(), valor: v, data, metodo, categoriaId: categoria || null, observacao: obs.trim() || null });
    setSalvando(false);
    if (ok) aoFechar();
  };
  return (
    <Painel aberto={aberto} aoFechar={aoFechar} titulo="Registrar lançamento" descricao="Entrada ou saída ligada a este aluno.">
      <form onSubmit={enviar} className="flex flex-col gap-4 pt-2" data-form-lancamento>
        <CampoSelect rotulo="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoLancamento)} data-lancamento-tipo>
          <option value="entrada">Entrada (recebi)</option>
          <option value="saida">Saída (gastei com o aluno)</option>
        </CampoSelect>
        <Campo rotulo="Descrição" maxLength={160} value={descricao} onChange={(e) => { setDescricao(e.target.value); setErro(""); }} placeholder="Ex.: Consulta" data-lancamento-descricao />
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Valor (R$)" inputMode="decimal" value={valor} onChange={(e) => { setValor(e.target.value); setErro(""); }} placeholder="150,00" data-lancamento-valor />
          <Campo rotulo="Data" type="date" value={data} onChange={(e) => setData(e.target.value)} data-lancamento-data />
        </div>
        <CampoSelect rotulo="Forma" value={metodo} onChange={(e) => setMetodo(e.target.value as MetodoLancamento)} data-lancamento-metodo>
          {METODOS_LANCAMENTO.map((m) => <option key={m.valor} value={m.valor}>{m.rotulo}</option>)}
        </CampoSelect>
        <CampoSelect rotulo="Categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)} data-lancamento-categoria>
          <option value="">Sem categoria</option>
          {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </CampoSelect>
        <Campo rotulo="Observação" maxLength={500} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Opcional" />
        {erro && <MensagemForm>{erro}</MensagemForm>}
        <Botao type="submit" variante="w" icone={Save} disabled={salvando} data-lancamento-salvar>{salvando ? "Salvando…" : "Salvar lançamento"}</Botao>
      </form>
    </Painel>
  );
}
