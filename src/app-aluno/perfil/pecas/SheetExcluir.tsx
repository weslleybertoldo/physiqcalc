import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LayoutDashboard, TriangleAlert, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Campo, MensagemForm } from "@/entrada/pecas/Campo";
import { useSessao } from "@/nucleo/sessao";
import { CONTATO_SUPORTE, linkDoSuporte } from "@/nucleo/suporte";
import { lembrarArea } from "@/ui/casca/area";
import { Botao } from "@/ui/premium/Botao";
import { Esqueleto } from "@/ui/premium/Estados";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { ErroExclusao, conferirExclusaoProfissional, type Conferencia } from "@/painel/configuracoes/excluirConta/api";
import { FluxoExclusao } from "@/painel/configuracoes/excluirConta/FluxoExclusao";
import {
  ErroPerfil, MENSAGEM_ERRO_CONTA, PALAVRA_CONFIRMACAO, conferirExclusao, excluirMinhaConta, mensagemErroConta, type ResultadoExclusao,
} from "./api";

/**
 * W2 da loja: quem é (ou já foi) profissional exclui pelo caminho do profissional — o caminho novo da borda responde
 * "nao_profissional" para quem é só aluno (aí segue o de sempre). Falha de rede/servidor nesse passo = o de sempre também.
 */
async function caminhoDoProfissional(): Promise<{ conferencia: Conferencia | null; master: boolean }> {
  try {
    return { conferencia: await conferirExclusaoProfissional(), master: false };
  } catch (e) {
    if (e instanceof ErroExclusao && e.codigo === "profissional") return { conferencia: null, master: true };
    return { conferencia: null, master: false };
  }
}

const soma = (o: Record<string, number> | null | undefined, chaves: string[]) => chaves.reduce((t, k) => t + (Number(o?.[k]) || 0), 0);

/** O resumo "vai ser apagado / fica com o seu profissional" (contagens da conferência — nada muda nela). */
function resumoDaExclusao(r: ResultadoExclusao): { apaga: string[]; fica: string[] } {
  const ap = r.apaga.principal ?? {};
  const at = r.apaga.treino ?? {};
  const mp = r.mantem.principal ?? {};
  const mt = r.mantem.treino ?? {};
  const apaga = ["O seu login no Physiq (e-mail, senha e o acesso pelo Google)"];
  // o mesmo treino feito aparece no histórico e no "concluído" do dia: vale o maior dos dois
  const treinos = Math.max(soma(at, ["treino_historico"]), soma(at, ["tb_treino_concluido"]));
  const series = soma(at, ["tb_treino_series"]);
  if (treinos || series) apaga.push(`O seu histórico de treino: ${treinos} treino(s) feito(s) e ${series} série(s) com cargas`);
  const proprios = soma(at, ["tb_exercicios_usuario", "tb_grupos_treino_usuario", "tb_academias"]);
  if (proprios) apaga.push(`Treinos, exercícios e academias que você criou (${proprios})`);
  const enviados = soma(ap, ["diario_alimentar", "refeicoes_concluidas", "metas_concluidas"]);
  if (enviados) apaga.push(`O que você enviou: fotos do diário e refeições/metas marcadas (${enviados})`);
  apaga.push("A foto do seu perfil e os seus avisos");
  const fica: string[] = [];
  if (Number(mp.matriculas)) fica.push("O seu cadastro e a matrícula (desligados do seu login)");
  const avaliacoes = soma(mt, ["physiq_avaliacoes", "physiq_registros_fotos"]) + soma(mp, ["antropometrias"]);
  if (avaliacoes) fica.push(`Avaliações e fotos de avaliação (${avaliacoes})`);
  const planos = soma(mt, ["tb_semana_treinos", "tb_series_padrao_usuario"]) + soma(mp, ["planos_alimentares"]);
  if (planos) fica.push("O plano de treino e de dieta montado pelo profissional");
  const financeiro = soma(mp, ["cobrancas", "recibos"]) + soma(mt, ["physiq_pagamentos"]);
  if (financeiro) fica.push(`Pagamentos e recibos (${financeiro})`);
  if (Number(mp.agendamentos)) fica.push(`Agenda (${mp.agendamentos})`);
  if (Number(mp.prontuario)) fica.push("O prontuário");
  return { apaga, fica };
}

/**
 * Perfil › Excluir minha conta (falha F4 — C88, R11, P19): confere antes (nada muda) e mostra o que sai e o que fica com o
 * profissional; exclui só com a palavra digitada. Cobrança automática ligada: cancelar em Pagamentos antes.
 * W2 da loja: o profissional (dono, membro de equipe) exclui no painel › Configurações › Excluir minha conta — a folha aponta o
 * caminho (antes dizia que não dava); quem já foi membro de equipe (sem painel) exclui aqui mesmo, pelo fluxo do profissional; o
 * master continua recusado (fale com o suporte).
 */
export function SheetExcluir({ aberto, aoMudar }: { aberto: boolean; aoMudar: (v: boolean) => void }) {
  const navigate = useNavigate();
  const { sair } = useSessao();
  const [conferencia, setConferencia] = useState<ResultadoExclusao | null>(null);
  const [recusa, setRecusa] = useState<{ codigo: string; texto: string; motivo: string } | null>(null);
  const [profissional, setProfissional] = useState<Conferencia | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState("");
  const [excluindo, setExcluindo] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    setConferencia(null);
    setRecusa(null);
    setProfissional(null);
    setTexto("");
    setErro("");
    setCarregando(true);
    void (async () => {
      const prof = await caminhoDoProfissional();
      if (!vivo) return;
      if (prof.master) {
        setRecusa({ codigo: "profissional", texto: "", motivo: "master" });
        return setCarregando(false);
      }
      if (prof.conferencia) {
        setProfissional(prof.conferencia);
        return setCarregando(false);
      }
      try {
        const r = await conferirExclusao();
        if (vivo) setConferencia(r);
      } catch (e) {
        if (vivo) setRecusa({ codigo: e instanceof ErroPerfil ? e.codigo : "erro_interno", texto: mensagemErroConta(e),
          motivo: e instanceof ErroPerfil ? String(e.extra?.motivo ?? "") : "" });
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [aberto]);

  const confere = texto.trim().toUpperCase() === PALAVRA_CONFIRMACAO;
  const irParaOPainel = () => {
    lembrarArea("painel");
    aoMudar(false);
    navigate("/painel/configuracoes/excluir-conta");
  };

  const excluir = async () => {
    if (!confere) return setErro(`Digite ${PALAVRA_CONFIRMACAO} para confirmar.`);
    setErro("");
    setExcluindo(true);
    try {
      await excluirMinhaConta(texto);
      toast.success("Sua conta foi excluída.");
      aoMudar(false);
      await sair();
      navigate("/entrar", { replace: true });
    } catch (e) {
      setExcluindo(false);
      setErro(mensagemErroConta(e));
    }
  };

  const resumo = conferencia ? resumoDaExclusao(conferencia) : null;

  return (
    <PainelDeslizante aberto={aberto} aoMudar={(v) => !excluindo && aoMudar(v)} titulo="Excluir minha conta">
      <div className="flex flex-col gap-4 pt-1" data-sheet-excluir
        data-estado-excluir={carregando ? "conferindo" : recusa ? `recusa-${recusa.codigo}` : profissional ? `profissional-${profissional.perfil}` : "pronto"}>
        {carregando ? (
          <div className="flex flex-col gap-2" aria-busy="true" aria-label="Conferindo">
            <Esqueleto className="h-4 w-3/4" />
            <Esqueleto className="h-4 w-2/3" />
            <Esqueleto className="h-4 w-1/2" />
          </div>
        ) : profissional && profissional.perfil !== "ex_profissional" ? (
          <div className="flex flex-col gap-3" data-excluir-recusa="profissional" data-excluir-perfil={profissional.perfil}>
            <p className="flex items-start gap-2 text-[13.5px] leading-relaxed text-texto">
              <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 flex-none text-ambar-3" />
              <span>{MENSAGEM_ERRO_CONTA.profissional}</span>
            </p>
            <Botao icone={LayoutDashboard} onClick={irParaOPainel} data-excluir-painel>Excluir no painel</Botao>
          </div>
        ) : profissional ? (
          // quem já foi membro de equipe (sem painel): o fluxo do profissional aqui mesmo (o que ele registrou fica com a conta)
          <div data-excluir-fluxo-profissional><FluxoExclusao conferenciaInicial={profissional} /></div>
        ) : recusa ? (
          <div className="flex flex-col gap-3" data-excluir-recusa={recusa.codigo}>
            <p className="flex items-start gap-2 text-[13.5px] leading-relaxed text-texto">
              <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 flex-none text-ambar-3" />
              {recusa.codigo === "profissional" && recusa.motivo === "master" ? (
                <span>Contas master não são excluídas pelo app: fale com o suporte do Physiq em{" "}
                  <a href={linkDoSuporte("Excluir minha conta")} className="font-semibold text-violeta-3 underline-offset-2 hover:underline" data-excluir-suporte={CONTATO_SUPORTE}>{CONTATO_SUPORTE}</a>.</span>
              ) : (
                <span>{recusa.texto}</span>
              )}
            </p>
            {recusa.codigo === "profissional" && recusa.motivo !== "master" && (
              <Botao icone={LayoutDashboard} onClick={irParaOPainel} data-excluir-painel>Excluir no painel</Botao>
            )}
            {recusa.codigo === "assinatura_ativa" && (
              <Botao icone={Wallet} onClick={() => { aoMudar(false); navigate("/perfil/pagamentos"); }} data-excluir-pagamentos>
                Abrir Pagamentos
              </Botao>
            )}
          </div>
        ) : resumo ? (
          <>
            <div className="rounded-2xl border border-[var(--p-chip-r-borda)] bg-[var(--p-chip-r-fundo)] px-3.5 py-3" data-excluir-apaga>
              <b className="block text-[13px] font-semibold text-rosa-3">Vai ser apagado (não dá para desfazer)</b>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[12.5px] leading-relaxed text-texto">
                {resumo.apaga.map((l) => <li key={l}>{l}</li>)}
              </ul>
            </div>
            {resumo.fica.length > 0 && (
              <div className="rounded-2xl border border-linha bg-superficie px-3.5 py-3" data-excluir-fica>
                <b className="block text-[13px] font-semibold text-texto">Fica com o seu profissional, sem ligação com o seu login</b>
                <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[12.5px] leading-relaxed text-texto-2">
                  {resumo.fica.map((l) => <li key={l}>{l}</li>)}
                </ul>
              </div>
            )}
            <Campo rotulo={`Para confirmar, digite ${PALAVRA_CONFIRMACAO}`} value={texto} onChange={(e) => { setTexto(e.target.value); setErro(""); }}
              placeholder={PALAVRA_CONFIRMACAO} autoCapitalize="characters" autoComplete="off" spellCheck={false} data-excluir-confirmacao />
            {erro && <MensagemForm data-excluir-erro>{erro}</MensagemForm>}
            <button type="button" onClick={() => void excluir()} disabled={!confere || excluindo} data-excluir-confirmar
              className="pq-botao w-full border border-[var(--p-chip-r-borda)] bg-rosa text-white disabled:opacity-45">
              {excluindo ? "Excluindo…" : "Excluir minha conta"}
            </button>
          </>
        ) : null}
      </div>
    </PainelDeslizante>
  );
}
