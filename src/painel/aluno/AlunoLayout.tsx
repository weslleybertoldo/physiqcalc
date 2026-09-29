import { Suspense } from "react";
import { Link, Navigate, Outlet, useLocation, useParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import { listar, tela } from "@/rotas/registro";
import { Carregavel } from "@/ui/casca/Carregavel";
import { useDadosCasca } from "@/ui/casca/dadosCasca";
import { LimiteDeErro } from "@/ui/casca/LimiteDeErro";
import { Cartao } from "@/ui/premium/Cartao";
import { Esqueleto, EstadoVazio } from "@/ui/premium/Estados";
import { modulosDaConta } from "../menu";
import { ABAS_ALUNO, ORDEM_RESUMO, abaAtualDaRota, estadoDaAbaAluno } from "./catalogoAbas";
import CabecalhoPadrao from "./CabecalhoPadrao";
import { AlunoCtx } from "./contexto";
import { FallbackConfigurar } from "./FallbackConfigurar";

const COR_PONTO = { treino: "var(--p-violeta)", nutricao: "var(--p-verde)" } as const;

/**
 * Perfil do aluno no painel (tela 7): cabeçalho (o padrão da W1 ou o de src/painel/aluno/Cabecalho.tsx),
 * as 6 abas (Resumo · Treino · Dieta · Avaliação · Prontuário · Financeiro) e o conteúdo da aba.
 */
export default function AlunoLayout() {
  const { id = "" } = useParams();
  const location = useLocation();
  const dados = useDadosCasca();
  const modulos = modulosDaConta(dados.conta?.modulos);
  const Cabecalho = tela("cabecalhoAluno", "Cabecalho");
  const abaAtual = abaAtualDaRota(location.pathname, id);
  const abas = ABAS_ALUNO.filter((a) => estadoDaAbaAluno(a, modulos) !== null);
  const base = `/painel/alunos/${encodeURIComponent(id)}`;

  return (
    <AlunoCtx.Provider value={{ alunoId: id }}>
      <div data-perfil-aluno={id} className="flex flex-col">
        {Cabecalho ? (
          <Carregavel nome="Cabecalho do aluno" esqueleto={<Esqueleto className="h-[112px] w-full rounded-[22px]" />}>
            <Cabecalho alunoId={id} />
          </Carregavel>
        ) : (
          <CabecalhoPadrao alunoId={id} />
        )}

        <nav aria-label="Abas do aluno" data-abas-aluno className="pq-sem-barra mt-4 flex gap-1 overflow-x-auto border-b border-linha">
          {abas.map((a) => {
            const ativa = a.id === abaAtual;
            const Icone = a.icone;
            return (
              <Link
                key={a.id}
                to={a.rota ? `${base}/${a.rota}` : base}
                aria-current={ativa ? "page" : undefined}
                data-aba-aluno={a.id}
                className={cn(
                  "relative flex h-[42px] flex-none items-center gap-2 px-3.5 text-[13.5px] font-semibold transition-colors",
                  ativa ? "text-texto" : "text-texto-3 hover:text-texto-2",
                )}
              >
                <Icone aria-hidden className="h-4 w-4" strokeWidth={1.75} />
                {a.rotulo}
                {a.modulo !== "ambos" && <i aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: COR_PONTO[a.modulo] }} />}
                {ativa && (
                  <span
                    aria-hidden
                    className="absolute inset-x-2.5 -bottom-px h-0.5 rounded-sm"
                    style={{ background: "linear-gradient(90deg,var(--p-violeta-2),var(--p-verde-2))", boxShadow: "0 0 12px rgba(167,139,250,.9)" }}
                  />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="mt-4 min-w-0" data-aba-aluno-conteudo={abaAtual}>
          <LimiteDeErro nome={`aba do aluno ${abaAtual}`}>
            <Outlet />
          </LimiteDeErro>
        </div>
      </div>
    </AlunoCtx.Provider>
  );
}

/**
 * Aba Resumo: os cards registrados (tela 7) ou, antes deles, o "Dados" do Configurar aluno antigo. Enquanto o card de dados
 * do aluno (W14) não chega, o "Dados" antigo continua embaixo dos cards que já existem (W6: o Financeiro) — conta com Treino.
 */
export function AbaResumo() {
  const { id = "" } = useParams();
  const dados = useDadosCasca();
  const modulos = modulosDaConta(dados.conta?.modulos);
  const resumo = ABAS_ALUNO[0];
  const cards = listar("resumoAluno", ORDEM_RESUMO);
  if (cards.length === 0) {
    if (estadoDaAbaAluno(resumo, modulos) === "antiga") return <FallbackConfigurar alunoId={id} opcoes={resumo.antigas!} />;
    return <EstadoVazio titulo="Resumo do aluno" texto="Os cards do resumo aparecem aqui assim que os dados do aluno estiverem no Physiq." />;
  }
  const dadosAntigosEmbaixo = !cards.some((c) => c.nome === "CardDadosAluno") && !!resumo.antigas && modulos.includes("treino");
  const cima = cards.filter((c) => ORDEM_RESUMO.indexOf(c.nome as (typeof ORDEM_RESUMO)[number]) > -1 && ORDEM_RESUMO.indexOf(c.nome as (typeof ORDEM_RESUMO)[number]) < 6);
  const baixo = cards.filter((c) => !cima.includes(c));
  const grade = (lista: typeof cards) => (
    <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3">
      {lista.map(({ nome, Componente }) => (
        <LimiteDeErro key={nome} nome={nome}>
          <Suspense fallback={<Cartao className="h-[240px] p-4"><Esqueleto className="h-full w-full" /></Cartao>}>
            <Componente alunoId={id} />
          </Suspense>
        </LimiteDeErro>
      ))}
    </div>
  );
  return (
    <div className="flex flex-col gap-3.5" data-resumo-aluno>
      {cima.length > 0 && grade(cima)}
      {baixo.length > 0 && grade(baixo)}
      {dadosAntigosEmbaixo && <FallbackConfigurar alunoId={id} opcoes={resumo.antigas!} />}
    </div>
  );
}

/** Demais abas: a nova de src/painel/aluno/abas/<arquivo>.tsx ou o grupo antigo; sem nenhuma, volta ao Resumo. */
export function AbaDoAluno() {
  const { id = "", aba = "" } = useParams();
  const dados = useDadosCasca();
  const modulos = modulosDaConta(dados.conta?.modulos);
  const def = ABAS_ALUNO.find((a) => a.rota === aba && a.id !== "resumo");
  const estado = def ? estadoDaAbaAluno(def, modulos) : null;
  if (def && estado === "nova" && def.arquivo) {
    const Nova = tela("abasAluno", def.arquivo)!;
    return (
      <Carregavel nome={`aba ${def.arquivo}`}>
        <Nova alunoId={id} />
      </Carregavel>
    );
  }
  if (def && estado === "antiga" && def.antigas) return <FallbackConfigurar alunoId={id} opcoes={def.antigas} />;
  return <Navigate to={`/painel/alunos/${encodeURIComponent(id)}`} replace />;
}

/** "Editar treino e dieta" (tela 8): página da W16; antes dela, a aba Treino. */
export function RotaEditores() {
  const { id = "" } = useParams();
  const Editores = tela("editoresAluno", "Editores");
  if (!Editores) return <Navigate to={`/painel/alunos/${encodeURIComponent(id)}/treino`} replace />;
  return (
    <AlunoCtx.Provider value={{ alunoId: id }}>
      <Carregavel nome="Editores">
        <Editores alunoId={id} />
      </Carregavel>
    </AlunoCtx.Provider>
  );
}
