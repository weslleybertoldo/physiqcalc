import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, BellRing, CalendarDays, Download, Moon, Receipt, Settings, Sun, Trash2, Volume2 } from "lucide-react";
import { useResumoFinanceiro } from "@/financeiro/useResumoFinanceiro";
import { lerSomDescanso, nomeDoSom, type SomDescanso } from "@/lib/somDescanso";
import { useSessao } from "@/nucleo/sessao";
import { usePerfilReduzido } from "@/app-aluno/gates/pecas/modoReduzido";
import { meuPerfilAluno, minhaAgenda } from "@/app-aluno/perfil/pecas/api";
import { CartaoAluno } from "@/app-aluno/perfil/pecas/CartaoAluno";
import { aplicarLembreteNoAparelho, lerLembrete } from "@/app-aluno/perfil/pecas/lembrete";
import { MeusProfissionais } from "@/app-aluno/perfil/pecas/MeusProfissionais";
import { chipDePagamentos, diaCurto, inicioDaAgenda, linhaDoAluno, proximosAgendamentos, valorDoLembrete } from "@/app-aluno/perfil/pecas/regras";
import { RodapePerfil } from "@/app-aluno/perfil/pecas/RodapePerfil";
import { SheetExcluir } from "@/app-aluno/perfil/pecas/SheetExcluir";
import { SheetExportar } from "@/app-aluno/perfil/pecas/SheetExportar";
import { SheetLembrete } from "@/app-aluno/perfil/pecas/SheetLembrete";
import { SheetSom } from "@/app-aluno/perfil/pecas/SheetSom";
import { CLASSE_PAGINA_APP, TituloApp } from "@/app-aluno/perfil/pecas/TopoItem";
import { BotaoIcone } from "@/ui/premium/Botao";
import { Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { GrupoLista, ItemLista } from "@/ui/premium/Lista";
import { useTema } from "@/ui/tema/useTema";

type Folha = "lembrete" | "som" | "exportar" | "excluir" | null;

/**
 * Aba Perfil do app do aluno (W7 — spec 4.3, tela 5): engrenagem (Conta), card do aluno, Meus profissionais (WhatsApp — P24;
 * sem profissional, o código dele), Agenda, Pagamentos, Lembrete de treino, Som do descanso, Aparência, Exportar meus dados,
 * Excluir minha conta (falha F4 — C88, R11, P19), Sair e a versão. Aluno bloqueado (spec 9): só Sair, Exportar e Excluir.
 * Lembrete, som e aparência ficam no aparelho, com as chaves de hoje; o resto vem do banco principal (online — 9A).
 */
export default function Perfil() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { usuario, situacao } = useSessao();
  const reduzido = usePerfilReduzido();
  const uid = usuario?.id ?? null;
  const modulos = situacao?.modulos_aluno ?? [];
  const temTreino = modulos.includes("treino");
  const [folha, setFolha] = useState<Folha>(null);
  const [lembrete, setLembrete] = useState(lerLembrete);
  const [som, setSom] = useState<SomDescanso>(lerSomDescanso);
  const { tema } = useTema();

  const perfil = useQuery({ queryKey: ["perfil-aluno", uid], queryFn: meuPerfilAluno, enabled: Boolean(uid), staleTime: 60_000, retry: 1, networkMode: "online" });
  const agenda = useQuery({
    queryKey: ["agenda-aluno", uid], queryFn: () => minhaAgenda(inicioDaAgenda()), enabled: Boolean(uid) && !reduzido, staleTime: 60_000, retry: 1,
    networkMode: "online",
  });
  const { resumo } = useResumoFinanceiro({ ativo: !reduzido, atrasoMs: 200 });

  // o lembrete de hoje só fica agendado enquanto a TreinosPage está aberta (ela cancela ao sair): no APK, abrir o Perfil
  // reagenda na hora guardada — o aviso continua tocando mesmo se o app for fechado daqui
  useEffect(() => {
    if (temTreino && lembrete.enabled && !reduzido) void aplicarLembreteNoAparelho(lembrete);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só na abertura da aba
  }, [temTreino]);

  const nome = perfil.data?.nome || situacao?.nome || usuario?.email?.split("@")[0] || "Você";
  const foto = perfil.data?.foto_url ?? situacao?.foto_url ?? null;
  const linha = linhaDoAluno(perfil.data?.aluno_desde, perfil.data?.objetivo);
  const proxima = agenda.data ? proximosAgendamentos(agenda.data, new Date(), 1)[0] ?? null : null;
  const chipPag = chipDePagamentos(resumo);

  return (
    <div data-aba-perfil={reduzido ? "reduzido" : "completo"} className={CLASSE_PAGINA_APP}>
      <div className="mt-1 flex items-center justify-between">
        <TituloApp>Perfil</TituloApp>
        {!reduzido && <BotaoIcone icone={Settings} rotulo="Conta" onClick={() => navigate("/perfil/conta")} data-perfil-conta />}
      </div>

      <CartaoAluno nome={nome} foto={foto} linha={linha} modulos={modulos} carregando={perfil.isLoading} />

      {reduzido ? (
        <Cartao className="flex items-start gap-3 px-3.5 py-3.5" data-perfil-reduzido={reduzido.motivo}>
          <span className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[10px] bg-superficie text-rosa-3">
            <Ban aria-hidden className="h-4 w-4" strokeWidth={1.75} />
          </span>
          <span className="min-w-0 text-[12.5px] leading-relaxed text-texto-2">
            <b className="block text-[13.5px] font-semibold text-texto">{reduzido.titulo}</b>
            {reduzido.mensagem} Enquanto isso, você pode levar os seus dados ou excluir a conta.
          </span>
        </Cartao>
      ) : (
        <>
          <MeusProfissionais
            profissionais={perfil.data?.profissionais ?? null}
            carregando={perfil.isLoading}
            aoVincular={() => {
              void qc.invalidateQueries({ queryKey: ["perfil-aluno", uid] });
              void qc.invalidateQueries({ queryKey: ["agenda-aluno", uid] });
            }}
          />
          <GrupoLista>
            <ItemLista icone={CalendarDays} rotulo="Agenda" para="/perfil/agenda"
              valor={<span data-perfil-agenda-valor>{agenda.isLoading ? "…" : proxima ? diaCurto(proxima.inicio) : "Nenhuma"}</span>} />
            <ItemLista icone={Receipt} rotulo="Pagamentos" para="/perfil/pagamentos"
              valor={chipPag ? <Chip tom={chipPag.tom} data-perfil-pagamentos-chip>{chipPag.texto}</Chip> : undefined} />
            {temTreino && (
              <ItemLista icone={BellRing} rotulo="Lembrete de treino" aoTocar={() => setFolha("lembrete")}
                valor={<span data-perfil-lembrete-valor>{valorDoLembrete(lembrete)}</span>} />
            )}
            {temTreino && (
              <ItemLista icone={Volume2} rotulo="Som do descanso" aoTocar={() => setFolha("som")} valor={<span data-perfil-som-valor>{nomeDoSom(som)}</span>} />
            )}
            <ItemLista icone={tema === "claro" ? Sun : Moon} rotulo="Aparência" para="/perfil/aparencia"
              valor={<span data-perfil-tema-valor>{tema === "claro" ? "Claro" : "Escuro"}</span>} />
          </GrupoLista>
        </>
      )}

      <GrupoLista>
        <ItemLista icone={Download} rotulo="Exportar meus dados" aoTocar={() => setFolha("exportar")} />
        <ItemLista icone={Trash2} rotulo="Excluir minha conta" aoTocar={() => setFolha("excluir")} perigo />
      </GrupoLista>

      <RodapePerfil />

      {temTreino && !reduzido && (
        <>
          <SheetLembrete aberto={folha === "lembrete"} aoMudar={(v) => setFolha(v ? "lembrete" : null)} valor={lembrete} aoSalvar={setLembrete} />
          <SheetSom aberto={folha === "som"} aoMudar={(v) => setFolha(v ? "som" : null)} valor={som} aoEscolher={setSom} />
        </>
      )}
      <SheetExportar aberto={folha === "exportar"} aoMudar={(v) => setFolha(v ? "exportar" : null)} />
      <SheetExcluir aberto={folha === "excluir"} aoMudar={(v) => setFolha(v ? "excluir" : null)} />
    </div>
  );
}
