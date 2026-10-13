// Physiq W-A P3 — a folha da rotina (spec §4.3, §4.5, §5.3): nasce com os 2 modos — o do ALUNO (a página /perfil/rotinas: cria e muda
// qualquer rotina viva dele, inclusive a do profissional — P8b) e o do PROFISSIONAL (o card Rotinas do Resumo, P6, só importa: cria na
// matrícula da rota e muda/apaga só as de profissional dela). Nome, detalhe (dose), tipo, horário, dias (com os atalhos das metas) e
// lembrete (só com horário). Apagar = arquivar, com a confirmação do app (useConfirmar). A forma é conferida aqui antes (a mesma do banco)
// e o erro da função vem pela frase fixa do código. Quem abre a folha relê a lista no aoSalvo/aoApagado.
import { useEffect, useState } from "react";
import { BellRing, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { arquivarRotina, profArquivarRotina, profSalvarRotina, salvarRotina } from "@/aluno-dia/api";
import type { Rotina, TipoDeRotina } from "@/aluno-dia/tipos";
import { Campo, MensagemForm } from "@/entrada/pecas/Campo";
import { Interruptor } from "@/app-aluno/perfil/pecas/Interruptor";
import { Botao } from "@/ui/premium/Botao";
import { Segmentado, type OpcaoSegmentado } from "@/ui/premium/Segmentado";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { useConfirmar } from "@/ui/premium/useConfirmar";
import { dadosDoFormulario, formularioDe, validarFormulario, type ErroDoFormulario, type FormularioDaRotina } from "../regras";
import { ROTULO_TIPO, TEXTOS } from "../textos";
import { fraseDoErro } from "../useRotinas";
import { DiasDaSemana } from "./DiasDaSemana";

export type ModoDaFolha = { tipo: "aluno" } | { tipo: "profissional"; aluno: string };

const TIPOS: OpcaoSegmentado<TipoDeRotina>[] = (["suplemento", "remedio", "habito", "outro"] as TipoDeRotina[]).map((t) => ({ valor: t, rotulo: ROTULO_TIPO[t] }));

function textoDoApagar(modo: ModoDaFolha, r: Rotina): string {
  if (modo.tipo === "profissional") return "O aluno deixa de ver esta rotina e os lembretes param. O histórico fica no Ver tudo.";
  return r.origem === "profissional"
    ? "Ela foi criada pelo seu profissional: sai da sua lista, os lembretes param e ele vê que você apagou."
    : "Ela sai da sua lista e os lembretes param.";
}

export function FolhaRotina({
  aberta,
  aoMudar,
  modo,
  rotina,
  aoSalvo,
  aoApagado,
}: {
  aberta: boolean;
  aoMudar: (aberta: boolean) => void;
  modo: ModoDaFolha;
  /** null = nova */
  rotina: Rotina | null;
  aoSalvo?: (r: Rotina, nova: boolean) => void | Promise<void>;
  aoApagado?: (id: string) => void | Promise<void>;
}) {
  const confirmar = useConfirmar();
  const [f, setF] = useState<FormularioDaRotina>(() => formularioDe(rotina));
  const [erro, setErro] = useState<ErroDoFormulario | null>(null);
  const [ocupado, setOcupado] = useState<"salvar" | "apagar" | null>(null);

  useEffect(() => {
    if (!aberta) return;
    setF(formularioDe(rotina));
    setErro(null);
    setOcupado(null);
  }, [aberta, rotina]);

  const mudar = (p: Partial<FormularioDaRotina>) => {
    setF((x) => ({ ...x, ...p }));
    setErro(null);
  };

  const salvar = async () => {
    const v = validarFormulario(f);
    if (v) {
      setErro(v);
      return;
    }
    setOcupado("salvar");
    try {
      const dados = dadosDoFormulario(f);
      const id = rotina?.id ?? null;
      const r = modo.tipo === "aluno" ? await salvarRotina(id, dados) : await profSalvarRotina(modo.aluno, id, dados);
      toast.success(rotina ? TEXTOS.salva : TEXTOS.criada);
      aoMudar(false);
      await aoSalvo?.(r.rotina, !rotina);
    } catch (e) {
      setErro({ mensagem: fraseDoErro(e) });
    } finally {
      setOcupado(null);
    }
  };

  const apagar = async () => {
    if (!rotina) return;
    if (!(await confirmar({ titulo: "Apagar a rotina?", descricao: textoDoApagar(modo, rotina), rotuloConfirmar: "Apagar", perigo: true }))) return;
    setOcupado("apagar");
    try {
      if (modo.tipo === "aluno") await arquivarRotina(rotina.id);
      else await profArquivarRotina(modo.aluno, rotina.id);
      toast.success(TEXTOS.apagada);
      aoMudar(false);
      await aoApagado?.(rotina.id);
    } catch (e) {
      setErro({ mensagem: fraseDoErro(e) });
    } finally {
      setOcupado(null);
    }
  };

  const doCampo = (c: ErroDoFormulario["campo"]) => (erro?.campo === c ? erro.mensagem : undefined);
  return (
    <PainelDeslizante aberto={aberta} aoMudar={(v) => !ocupado && aoMudar(v)} titulo={rotina ? TEXTOS.mudar : TEXTOS.nova}
      descricao={rotina?.origem === "profissional" && modo.tipo === "aluno" ? TEXTOS.daProfissional : undefined}>
      <div className="flex flex-col gap-4 pt-1" data-folha-rotina={rotina ? "mudar" : "nova"} data-folha-modo={modo.tipo}>
        <Campo rotulo="Nome" value={f.nome} onChange={(e) => mudar({ nome: e.target.value })} maxLength={60} autoComplete="off"
          placeholder="Creatina, remédio da pressão, água…" erro={doCampo("nome")} data-rotina-nome />
        <Campo rotulo="Detalhe (opcional)" value={f.detalhe} onChange={(e) => mudar({ detalhe: e.target.value })} maxLength={120} autoComplete="off"
          placeholder="5 g, 1 comprimido, 500 ml…" erro={doCampo("detalhe")} data-rotina-detalhe />
        <div className="flex flex-col gap-1.5" data-rotina-tipo={f.tipo}>
          <span className="text-[12.5px] font-semibold text-texto-2">Tipo</span>
          <Segmentado opcoes={TIPOS} valor={f.tipo} aoMudar={(t) => mudar({ tipo: t })} rotulo="Tipo da rotina" className="self-start" />
        </div>
        <Campo rotulo="Horário (opcional)" type="time" value={f.horario} erro={doCampo("horario")} data-rotina-horario
          onChange={(e) => mudar({ horario: e.target.value, ...(e.target.value ? {} : { lembrete: false }) })} />
        <DiasDaSemana dias={f.dias} aoMudar={(d) => mudar({ dias: d })} erro={doCampo("dias")} />
        <div className="flex items-center gap-3 rounded-2xl border border-linha bg-superficie px-3.5 py-3">
          <span className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[10px] bg-superficie-2 text-suave">
            <BellRing aria-hidden className="h-4 w-4" strokeWidth={1.75} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-medium text-texto">Lembrete</span>
            <span className="block text-[11.5px] leading-snug text-texto-3">{f.horario ? `Toca às ${f.horario} nos dias marcados.` : TEXTOS.lembreteSemHorario}</span>
          </span>
          <Interruptor ligado={f.lembrete} aoMudar={(v) => mudar({ lembrete: v })} rotulo="Lembrete" desligado={!f.horario} data-rotina-lembrete={f.lembrete ? "1" : "0"} />
        </div>
        {erro && (!erro.campo || erro.campo === "lembrete") && <MensagemForm data-rotina-erro>{erro.mensagem}</MensagemForm>}
        <Botao variante="w" onClick={() => void salvar()} disabled={!!ocupado} data-rotina-salvar>
          {ocupado === "salvar" ? "Salvando…" : "Salvar"}
        </Botao>
        {rotina && (
          <button type="button" onClick={() => void apagar()} disabled={!!ocupado} data-rotina-apagar
            className="pq-botao w-full border border-[var(--p-chip-r-borda)] bg-transparent text-rosa-3 disabled:opacity-45">
            <Trash2 aria-hidden /> {ocupado === "apagar" ? "Apagando…" : "Apagar rotina"}
          </button>
        )}
      </div>
    </PainelDeslizante>
  );
}
