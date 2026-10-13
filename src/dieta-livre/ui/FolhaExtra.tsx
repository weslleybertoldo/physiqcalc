// Physiq W-A P5 — a refeição EXTRA (spec §4.4, padrão 10): "Nova refeição" (nome, horário, "Já comi" ligado por padrão — a extra vai para a
// matrícula do plano ativo: o servidor decide) e, aberta, o que ele pôs nela (com "Tirar" e "Adicionar alimento"), o "Já comi" (só o que tem
// "Já comi" conta no anel), "Mudar nome e horário" e "Apagar refeição" (com a confirmação do app). Só hoje; a Dieta travada no meio fecha a
// folha (useGravarNoDia).
import { useEffect, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { dadosDaExtra, formularioDaExtra, totaisDaExtra, validarExtra, type ErroDoCampo, type FormularioDaExtra } from "../regras";
import { desfazerNoDia, excluirExtra, marcarExtra, salvarExtra } from "@/aluno-dia/api";
import type { ExtraNoDia } from "@/aluno-dia/regras";
import { Campo, MensagemForm } from "@/entrada/pecas/Campo";
import { Interruptor } from "@/app-aluno/perfil/pecas/Interruptor";
import { fmtKcal } from "@/nutricao/app/dietaUtil";
import { Botao } from "@/ui/premium/Botao";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { useConfirmar } from "@/ui/premium/useConfirmar";
import { TEXTOS } from "../textos";
import type { Gravacao } from "../useDietaLivre";
import { ItensDoDia } from "./ItensDoDia";

export function FolhaExtra({
  aberta,
  aoMudar,
  extra,
  hoje,
  ocupado,
  desligado,
  gravar,
  aoAdicionar,
}: {
  aberta: boolean;
  aoMudar: (aberta: boolean) => void;
  /** null = nova */
  extra: ExtraNoDia | null;
  hoje: string;
  ocupado: string | null;
  desligado: boolean;
  gravar: (g: Gravacao) => Promise<boolean>;
  /** abre o "Adicionar alimento" nesta extra */
  aoAdicionar: (id: string) => void;
}) {
  const confirmar = useConfirmar();
  const [f, setF] = useState<FormularioDaExtra>(() => formularioDaExtra(extra?.extra ?? null));
  const [erro, setErro] = useState<ErroDoCampo<"nome" | "horario"> | null>(null);
  const [mudando, setMudando] = useState(false);

  useEffect(() => {
    if (!aberta) return;
    setF(formularioDaExtra(extra?.extra ?? null));
    setErro(null);
    setMudando(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recomeça ao abrir ou ao trocar de extra (não a cada releitura do dia)
  }, [aberta, extra?.extra.id]);

  const mudar = (p: Partial<FormularioDaExtra>) => {
    setF((x) => ({ ...x, ...p }));
    setErro(null);
  };
  const travado = desligado || !!ocupado;

  const salvar = async () => {
    const v = validarExtra(f);
    if (v) {
      setErro(v);
      return;
    }
    const id = extra?.extra.id ?? null;
    const ok = await gravar({ chave: id ? `extra:${id}` : "extra-nova", fazer: () => salvarExtra(id, dadosDaExtra(f, id ? null : hoje)),
      ok: id ? TEXTOS.refeicaoSalva : TEXTOS.refeicaoCriada });
    if (ok && !id) aoMudar(false);
    if (ok && id) setMudando(false);
  };

  const apagar = async () => {
    if (!extra) return;
    if (!(await confirmar({ titulo: "Apagar a refeição?", descricao: TEXTOS.extraApagarTexto, rotuloConfirmar: "Apagar", perigo: true }))) return;
    const ok = await gravar({ chave: `extra-apagar:${extra.extra.id}`, fazer: () => excluirExtra(extra.extra.id), ok: TEXTOS.refeicaoApagada });
    if (ok) aoMudar(false);
  };

  const doCampo = (c: "nome" | "horario") => (erro?.campo === c ? erro.mensagem : undefined);
  const formulario = (
    <>
      <Campo rotulo="Nome" value={f.nome} onChange={(e) => mudar({ nome: e.target.value })} maxLength={40} autoComplete="off"
        placeholder="Lanche, sobremesa, ceia…" erro={doCampo("nome")} data-extra-nome />
      <Campo rotulo="Horário (opcional)" type="time" value={f.horario} onChange={(e) => mudar({ horario: e.target.value })} erro={doCampo("horario")} data-extra-horario />
      {!extra && (
        <div className="flex items-center gap-3 rounded-2xl border border-linha bg-superficie px-3.5 py-3">
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-medium text-texto">{TEXTOS.jaComi}</span>
            <span className="block text-[11.5px] leading-snug text-texto-3">{f.ja_comi ? TEXTOS.jaComiDica : TEXTOS.naoComiDica}</span>
          </span>
          <Interruptor ligado={f.ja_comi} aoMudar={(v) => mudar({ ja_comi: v })} rotulo={TEXTOS.jaComi} data-extra-ja-comi={f.ja_comi ? "1" : "0"} />
        </div>
      )}
      {erro && !erro.campo && <MensagemForm>{erro.mensagem}</MensagemForm>}
      <Botao variante="w" onClick={() => void salvar()} disabled={travado} data-extra-salvar>
        {ocupado === "extra-nova" || ocupado === `extra:${extra?.extra.id}` ? TEXTOS.salvando : extra ? TEXTOS.salvar : TEXTOS.criarRefeicao}
      </Botao>
    </>
  );

  const t = extra ? totaisDaExtra(extra) : null;
  return (
    <PainelDeslizante aberto={aberta} aoMudar={(v) => !ocupado && aoMudar(v)} titulo={extra ? extra.extra.nome : TEXTOS.novaRefeicao}
      descricao={extra ? [extra.extra.horario, t && t.itens ? `${fmtKcal(t.energia_kcal)} kcal` : null, "refeição extra"].filter(Boolean).join(" · ") : "Só no seu dia — o plano não muda."}>
      <div className="flex flex-col gap-4 pt-1" data-folha-extra={extra ? extra.extra.id : "nova"}>
        {!extra || mudando ? (
          formulario
        ) : (
          <>
            <ItensDoDia itensDoPlano={[]} adicionados={extra.adicionados} ocupado={ocupado} desligado={desligado} podeAdicionar vazio={TEXTOS.nadaNaExtra}
              aoVoltar={(id) => void gravar({ chave: `voltar:${id}`, fazer: () => desfazerNoDia(id) })} aoAdicionar={() => aoAdicionar(extra.extra.id)} />
            <div className="flex items-center gap-3 rounded-2xl border border-linha bg-superficie px-3.5 py-3">
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-medium text-texto">{TEXTOS.jaComi}</span>
                <span className="block text-[11.5px] leading-snug text-texto-3">{extra.concluida ? TEXTOS.jaComiDica : TEXTOS.naoComiDica}</span>
              </span>
              <Interruptor ligado={extra.concluida} rotulo={TEXTOS.jaComi} desligado={travado} data-extra-feita={extra.concluida ? "1" : "0"}
                aoMudar={(v) => void gravar({ chave: `extra-marcar:${extra.extra.id}`, fazer: () => marcarExtra(extra.extra.id, v) })} />
            </div>
            {/* `flex-wrap`: "Mudar nome e horário" + "Apagar refeição" (o botão não quebra texto) não cabem lado a lado em 390 px — sem isso o
                "Apagar refeição" ficava cortado na borda direita. Não cabendo, o 2º desce para a linha de baixo, cada um com a largura toda. */}
            <div className="flex flex-wrap gap-2.5">
              <Botao variante="g" icone={Pencil} className="flex-1" onClick={() => setMudando(true)} disabled={travado} data-extra-mudar>{TEXTOS.mudarRefeicao}</Botao>
              <button type="button" onClick={() => void apagar()} disabled={travado} data-extra-apagar
                className="pq-botao flex-1 border border-[var(--p-chip-r-borda)] bg-transparent text-rosa-3 disabled:opacity-45">
                <Trash2 aria-hidden /> {TEXTOS.apagarRefeicao}
              </button>
            </div>
          </>
        )}
      </div>
    </PainelDeslizante>
  );
}
