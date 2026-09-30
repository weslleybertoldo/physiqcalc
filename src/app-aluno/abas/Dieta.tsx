import { useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { CalendarDays, Camera, ChevronLeft, NotebookPen, Salad, Target, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { useSessao } from "@/nucleo/sessao";
import { matriculaDoApp, temAlimentacaoDoApp } from "@/nucleo/situacao";
import { CLASSE_PAGINA_APP, TituloApp } from "@/app-aluno/perfil/pecas/TopoItem";
import { planoAtivo, planoVariaPorDia, proximaPendente, refeicoesDoDia, resumoDoDia, rotuloDoDia } from "@/nutricao/app/dia";
import { diaMesCurto, fmtHorario, fmtKcal, formatarDataPlano, resumoDaRefeicao, totaisDosItens } from "@/nutricao/app/dietaUtil";
import { registroDaRefeicao, TEXTO_DIARIO_DESLIGADO, tipoDaRefeicaoDoPlano, type Refeicao } from "@/nutricao/app/diarioUtil";
import { textoErroMeta } from "@/nutricao/app/metasUtil";
import { refeicaoMarcavel, textoErroMarcar } from "@/nutricao/app/refeicaoConcluidaUtil";
import type { RefeicaoDoPlano } from "@/nutricao/app/tipos";
import { useDieta } from "@/nutricao/app/useDieta";
import { CartaoPlano } from "@/nutricao/app/ui/CartaoPlano";
import { LinhaRefeicao, type EstadoRefeicao } from "@/nutricao/app/ui/LinhaRefeicao";
import { PratosProntos } from "@/nutricao/app/ui/PratosProntos";
import { SheetDia } from "@/nutricao/app/ui/SheetDia";
import { SheetDiario } from "@/nutricao/app/ui/SheetDiario";
import { SheetMetas } from "@/nutricao/app/ui/SheetMetas";
import { SheetOrientacoes } from "@/nutricao/app/ui/SheetOrientacoes";
import { SheetPlano } from "@/nutricao/app/ui/SheetPlano";
import { SheetRefeicao } from "@/nutricao/app/ui/SheetRefeicao";
import { Botao, BotaoIcone } from "@/ui/premium/Botao";
import { Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { Esqueleto, EstadoErro, EstadoSemInternet, EstadoVazio } from "@/ui/premium/Estados";
import { fotoDaRefeicao } from "@/ui/premium/fotos";
import { useOnline } from "@/ui/premium/useOnline";

type Folha = "orientacoes" | "metas" | "diario" | "plano" | "dia" | "refeicao";
const FOLHAS: Folha[] = ["orientacoes", "metas", "diario", "plano", "dia", "refeicao"];
const SEM_INTERNET = "A dieta aparece quando a internet voltar.";

/**
 * Aba Dieta do app do aluno (W11 — spec 4.3, tela 3; paridade N-49 a N-52, NF3, NF4, NF5 e P29). Quem tem nutricionista: o cartão do
 * plano (kcal e macros MARCADOS no dia contra os do dia), as refeições de hoje (as que valem no dia da semana) com foto, itens, kcal
 * e o ✓ (a MESMA função do site antigo; zera todo dia em São Paulo; só no plano atual; só refeição com alimento), a folha de cada
 * refeição com os substitutos, o PDF e os planos anteriores, o calendário para ver outro dia, as orientações, as metas com ✓ e a
 * foto pro diário. O aluno sem profissional no Treino + Alimentação vê os pratos prontos (W7b). Online (9A): sem internet, o aviso.
 * As folhas abrem pelo `?ver=` (orientacoes, metas, diario — os links antigos /app/* do Nutri caem aqui), e o Voltar do aparelho fecha.
 */
export default function Dieta() {
  const { situacao } = useSessao();
  const doApp = matriculaDoApp(situacao);
  const temNutricionista = (situacao?.matriculas ?? []).some((m) => !m.app && m.modulos.includes("nutricao"));
  if (!temNutricionista && temAlimentacaoDoApp(doApp)) return <DietaDoApp />;
  return <DietaDaNutricionista />;
}

/** Aluno sem profissional no plano Treino + Alimentação: os pratos prontos pelo objetivo (W7b), agora na aba Dieta. */
function DietaDoApp() {
  return (
    <div className={CLASSE_PAGINA_APP} data-aba-dieta="pratos">
      <div className="mt-1 flex items-center justify-between gap-3">
        <TituloApp>Dieta</TituloApp>
      </div>
      <PratosProntos />
    </div>
  );
}

function EsqueletoDieta() {
  return (
    <div role="status" aria-busy="true" aria-label="Carregando a sua dieta" data-estado="carregando" className="flex flex-col gap-2">
      <Cartao className="mt-3 flex items-center gap-[18px] px-4 py-4">
        <Esqueleto className="h-[104px] w-[104px] flex-none rounded-full" />
        <div className="flex flex-1 flex-col gap-3">
          <Esqueleto className="h-3 w-4/5" />
          <Esqueleto className="h-3 w-3/5" />
          <Esqueleto className="h-3 w-2/3" />
        </div>
      </Cartao>
      <Esqueleto className="mx-0.5 mb-1 mt-3 h-4 w-2/5" />
      {[0, 1, 2, 3].map((i) => (
        <Cartao key={i} className="flex h-16 items-center gap-3 rounded-[18px] px-2">
          <Esqueleto className="h-[50px] w-[50px] flex-none rounded-[14px]" />
          <div className="flex flex-1 flex-col gap-2">
            <Esqueleto className="h-3.5 w-2/5" />
            <Esqueleto className="h-3 w-3/5" />
          </div>
        </Cartao>
      ))}
      <span className="sr-only">Carregando…</span>
    </div>
  );
}

function DietaDaNutricionista() {
  const d = useDieta();
  const online = useOnline();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [diaVisto, setDiaVisto] = useState<string | null>(null);
  const [planoVistoId, setPlanoVistoId] = useState<string | null>(null);
  const [refeicaoDoDiario, setRefeicaoDoDiario] = useState<Refeicao | null>(null);

  const verBruto = params.get("ver");
  const folha: Folha | null = FOLHAS.includes(verBruto as Folha) ? (verBruto as Folha) : null;
  const abrir = (f: Folha, extra: Record<string, string> = {}, substituir = false) =>
    navigate({ search: `?${new URLSearchParams({ ver: f, ...extra }).toString()}` }, { replace: substituir, state: { folha: true } });
  const fechar = () => {
    if ((location.state as { folha?: boolean } | null)?.folha) navigate(-1);
    else setParams({}, { replace: true });
  };
  const mudarFolha = (f: Folha) => (aberta: boolean) => (aberta ? abrir(f) : fechar());

  const dados = d.dados;
  const hoje = d.hoje;
  const planos = useMemo(() => dados?.planos ?? [], [dados]);
  const atual = useMemo(() => planoAtivo(planos), [planos]);
  const plano = planos.find((p) => p.id === planoVistoId) ?? atual;
  const ehAtual = !!plano && plano.id === atual?.id;
  const dia = diaVisto ?? hoje;
  const ehHoje = dia === hoje;
  const marcavelHoje = ehAtual && ehHoje;
  const refeicoes = useMemo(() => refeicoesDoDia(plano, dia), [plano, dia]);
  const concluidas = useMemo(() => new Set(marcavelHoje ? dados?.refeicoes_concluidas ?? [] : []), [marcavelHoje, dados]);
  const resumo = useMemo(() => resumoDoDia(refeicoes, concluidas), [refeicoes, concluidas]);
  const proxima = marcavelHoje ? proximaPendente(refeicoes, concluidas) : null;
  const matriculas = dados?.matriculas ?? [];
  const matricula = matriculas.find((m) => m.id === plano?.paciente_id) ?? matriculas[0] ?? null;
  const nutricionista = matricula?.nutricionista.nome ?? null;
  const aluno = matricula?.nome || "Aluno";
  // W14 (R12): o profissional pode desligar o diário do aluno — a foto some daqui e o servidor também recusa
  const diarioLigado = matricula?.diario_alimentar !== false;
  const diario = dados?.diario ?? [];
  const varia = planoVariaPorDia(plano);
  const desligado = !online;

  const fotoDe = (r: RefeicaoDoPlano): { foto: string; padrao: string } => {
    const padrao = fotoDaRefeicao(r.nome, r.horario);
    const reg = ehHoje ? registroDaRefeicao(diario, r, dia) : null;
    return { foto: (reg && d.fotos[reg.id]) || padrao, padrao };
  };

  const marcar = async (id: string, concluida: boolean) => {
    try {
      await d.marcarRefeicao({ id, concluida });
    } catch (e) {
      toast.error(textoErroMarcar(e instanceof Error ? e : null));
    }
  };
  const marcarMeta = async (id: string, concluida: boolean) => {
    try {
      await d.marcarMeta({ id, concluida });
    } catch (e) {
      toast.error(textoErroMeta(e instanceof Error ? e : null));
    }
  };

  const refeicaoAberta = folha === "refeicao" ? refeicoes.find((r) => r.id === params.get("r")) ?? null : null;
  const estadoDe = (r: RefeicaoDoPlano): EstadoRefeicao => {
    if (!refeicaoMarcavel(r)) return "vazia";
    if (!marcavelHoje) return "leitura";
    if (concluidas.has(r.id)) return "feita";
    return proxima?.id === r.id ? "agora" : "pendente";
  };

  // ───── estados sem dados ─────
  const erroRede = d.erro?.message === "sem_internet";
  let conteudo: React.ReactNode;
  let marca: string;
  if (!dados && (!online || erroRede)) {
    marca = "sem-internet";
    conteudo = (
      <div className="mt-3" data-dieta-sem-internet>
        <EstadoSemInternet titulo="Sem conexão" texto={SEM_INTERNET} />
      </div>
    );
  } else if (!dados && d.erro) {
    marca = "erro";
    conteudo = (
      <div className="mt-3" data-dieta-erro>
        <EstadoErro titulo="Não deu para carregar a sua dieta" aoTentar={d.recarregar} />
      </div>
    );
  } else if (!dados) {
    marca = "carregando";
    conteudo = <EsqueletoDieta />;
  } else if (matriculas.length === 0) {
    marca = "vazia";
    conteudo = (
      <EstadoVazio icone={Salad} titulo="Sua dieta aparece aqui" texto="Quando a sua nutricionista liberar o seu plano alimentar, ele aparece nesta aba." />
    );
  } else {
    marca = plano ? "plano" : "sem-plano";
    conteudo = (
      <>
        {desligado && (
          <div className="mt-3 flex items-center gap-2.5 rounded-2xl border px-3.5 py-2.5" style={{ borderColor: "var(--p-chip-a-borda)", background: "var(--p-chip-a-fundo)" }} data-dieta-aviso="sem-conexao">
            <WifiOff aria-hidden className="h-4 w-4 flex-none text-ambar-3" strokeWidth={1.75} />
            <span className="min-w-0 flex-1 text-[12.5px] leading-snug text-texto">Sem conexão · marcar e enviar fotos voltam quando a internet voltar.</span>
          </div>
        )}
        {!plano ? (
          <div className="mt-3" data-dieta-sem-plano>
            <EstadoVazio icone={Salad} titulo="Nenhum plano alimentar ainda" texto="Quando a sua nutricionista montar o plano, ele aparece aqui com as refeições e as quantidades." />
          </div>
        ) : (
          <>
            {!ehAtual && (
              <div className="mt-3 flex items-center gap-2.5 rounded-2xl border border-linha bg-superficie px-3.5 py-2.5" data-dieta-plano-anterior>
                <span className="min-w-0 flex-1 text-[12.5px] text-texto-2">
                  <b className="block text-[13px] font-semibold text-texto">Plano anterior · {formatarDataPlano(plano.created_at)}</b>
                  Só para consulta: a marcação é no plano atual.
                </span>
                <Botao variante="g" tamanho="sm" onClick={() => setPlanoVistoId(null)} data-voltar-plano-atual>Plano atual</Botao>
              </div>
            )}
            <CartaoPlano
              nutricionista={nutricionista}
              foto={matricula?.nutricionista.foto_url ?? null}
              atualizadoEm={diaMesCurto(plano.updated_at)}
              resumo={resumo.marcaveis > 0 ? resumo : null}
              aviso={refeicoes.length === 0 ? `O seu plano não tem refeição para ${rotuloDoDia(dia, hoje)}.` : resumo.marcaveis === 0 ? "As refeições deste dia ainda não têm alimentos." : null}
              leitura={!marcavelHoje}
              aoAbrir={() => abrir("plano")}
            />
            <div className="mx-0.5 mb-2 mt-3.5 flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2">
                {!ehHoje && (
                  <button type="button" onClick={() => setDiaVisto(null)} aria-label="Voltar para hoje" data-voltar-hoje
                    className="flex h-7 w-7 flex-none items-center justify-center rounded-[10px] border border-linha bg-superficie text-texto-2">
                    <ChevronLeft aria-hidden className="h-4 w-4" />
                  </button>
                )}
                <b className="truncate text-[15px] font-semibold text-texto" data-refeicoes-titulo>Refeições de {rotuloDoDia(dia, hoje)}</b>
              </span>
              {refeicoes.length > 0 &&
                (marcavelHoje && resumo.marcaveis > 0 ? (
                  <Chip tom="n" data-refeicoes-contagem={`${resumo.concluidas}/${resumo.marcaveis}`}>{resumo.concluidas} de {resumo.marcaveis}</Chip>
                ) : (
                  <Chip tom="g" data-refeicoes-contagem={`${refeicoes.length}`}>{refeicoes.length} {refeicoes.length === 1 ? "REFEIÇÃO" : "REFEIÇÕES"}</Chip>
                ))}
            </div>
            {refeicoes.length === 0 ? (
              <div data-dieta-dia-sem-refeicao>
                <EstadoVazio
                  icone={CalendarDays}
                  titulo={`Nenhuma refeição ${ehHoje ? "hoje" : "neste dia"}`}
                  texto="O seu plano muda conforme o dia da semana. Veja os outros dias no calendário."
                  acao={<Botao variante="g" tamanho="sm" icone={CalendarDays} onClick={() => abrir("dia")} data-ver-outro-dia>Ver outro dia</Botao>}
                />
              </div>
            ) : (
              <div className="flex flex-col gap-2" data-refeicoes={refeicoes.length}>
                {refeicoes.map((r) => {
                  const hora = fmtHorario(r.horario);
                  const itens = r.itens.length ? resumoDaRefeicao(r.itens) : "Sem alimentos";
                  const { foto, padrao } = fotoDe(r);
                  return (
                    <LinhaRefeicao
                      key={r.id}
                      id={r.id}
                      nome={r.nome}
                      linha={[hora, itens].filter(Boolean).join(" · ")}
                      kcal={r.itens.length ? fmtKcal(totaisDosItens(r.itens).energia_kcal) : "—"}
                      foto={foto}
                      fotoPadrao={padrao}
                      estado={estadoDe(r)}
                      salvando={d.salvandoRefeicao === r.id}
                      desligado={desligado}
                      aoAbrir={() => abrir("refeicao", { r: r.id })}
                      aoMarcar={(c) => void marcar(r.id, c)}
                    />
                  );
                })}
              </div>
            )}
          </>
        )}
        <div className="mt-3 flex gap-2.5">
          <Botao variante="w" icone={Camera} className="flex-1" onClick={() => { setRefeicaoDoDiario(null); abrir("diario"); }} disabled={!diarioLigado}
            title={diarioLigado ? undefined : TEXTO_DIARIO_DESLIGADO} data-abrir-diario data-diario-ligado={diarioLigado ? "1" : "0"}>
            Foto pro diário
          </Botao>
          <Botao variante="g" icone={Target} className="flex-1" onClick={() => abrir("metas")} data-abrir-metas>
            Metas
          </Botao>
        </div>
        {!diarioLigado && (
          <p className="mt-2 text-center text-[12px] text-texto-3" data-diario-desligado>
            {TEXTO_DIARIO_DESLIGADO}
          </p>
        )}
      </>
    );
  }

  return (
    <div className={CLASSE_PAGINA_APP} data-aba-dieta={marca} data-dieta-dia={dia} data-dieta-hoje={hoje}>
      <div className="mt-1 flex items-center justify-between gap-3">
        <TituloApp>Dieta</TituloApp>
        {dados && matriculas.length > 0 && (
          <div className="flex flex-none gap-2">
            <BotaoIcone icone={NotebookPen} rotulo="Orientações" onClick={() => abrir("orientacoes")} data-abrir-orientacoes />
            {plano && <BotaoIcone icone={CalendarDays} rotulo="Ver outro dia" onClick={() => abrir("dia")} data-abrir-dia />}
          </div>
        )}
      </div>

      {conteudo}

      {dados && (
        <>
          <SheetRefeicao
            refeicao={refeicaoAberta}
            aoFechar={fechar}
            foto={refeicaoAberta && ehHoje ? (() => { const reg = registroDaRefeicao(diario, refeicaoAberta, dia); return reg ? d.fotos[reg.id] ?? null : null; })() : null}
            podeMarcar={!!refeicaoAberta && marcavelHoje && refeicaoMarcavel(refeicaoAberta)}
            marcada={!!refeicaoAberta && concluidas.has(refeicaoAberta.id)}
            salvando={!!refeicaoAberta && d.salvandoRefeicao === refeicaoAberta.id}
            desligado={desligado}
            aoMarcar={(c) => refeicaoAberta && void marcar(refeicaoAberta.id, c)}
            aoFoto={
              refeicaoAberta && ehHoje && matricula && diarioLigado
                ? () => {
                    setRefeicaoDoDiario(tipoDaRefeicaoDoPlano(refeicaoAberta.nome, refeicaoAberta.horario));
                    abrir("diario", {}, true);
                  }
                : null
            }
          />
          <SheetPlano
            aberto={folha === "plano"}
            aoMudar={mudarFolha("plano")}
            plano={plano}
            atualId={atual?.id ?? null}
            planos={planos}
            nutricionista={nutricionista}
            aluno={aluno}
            dia={dia}
            hoje={hoje}
            aoEscolher={(id) => {
              setPlanoVistoId(id === atual?.id ? null : id);
              setDiaVisto(null);
              fechar();
            }}
          />
          <SheetDia
            aberto={folha === "dia"}
            aoMudar={mudarFolha("dia")}
            hoje={hoje}
            selecionado={dia}
            varia={varia}
            refeicoesNoDia={(x) => refeicoesDoDia(plano, x).length}
            aoEscolher={(x) => {
              setDiaVisto(x === hoje ? null : x);
              fechar();
            }}
          />
          <SheetOrientacoes aberto={folha === "orientacoes"} aoMudar={mudarFolha("orientacoes")} orientacoes={dados.orientacoes} aluno={aluno} nutricionista={nutricionista} />
          <SheetMetas
            aberto={folha === "metas"}
            aoMudar={mudarFolha("metas")}
            metas={dados.metas}
            hoje={hoje}
            marcadas={dados.metas_concluidas}
            salvando={d.salvandoMeta}
            desligado={desligado}
            aoMarcar={(id, c) => void marcarMeta(id, c)}
            aluno={aluno}
            nutricionista={nutricionista}
          />
          <SheetDiario
            aberto={folha === "diario" && diarioLigado}
            aoMudar={mudarFolha("diario")}
            matricula={matricula}
            registros={diario}
            fotos={d.fotos}
            refeicaoInicial={refeicaoDoDiario}
            desligado={desligado}
            aoEnviar={d.recarregar}
          />
        </>
      )}
    </div>
  );
}
