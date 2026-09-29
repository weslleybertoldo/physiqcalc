import { Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dumbbell, Lock, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { buscarFinanceiroDoAluno } from "@/financeiro/api";
import { listar } from "@/rotas/registro";
import { TopoPagina } from "@/ui/casca/topo";
import { LimiteDeErro } from "@/ui/casca/LimiteDeErro";
import { Avatar } from "@/ui/premium/Avatar";
import { Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { Esqueleto, EstadoErro } from "@/ui/premium/Estados";
import { ORDEM_KPIS } from "./catalogoAbas";
import { linhaDoAluno } from "./linha";

interface PerfilTreino {
  nome: string | null;
  email: string | null;
  foto_url: string | null;
  idade: number | null;
  altura: number | null;
  created_at: string | null;
  status: string | null;
  plano_nome: string | null;
  /** De onde vieram os dados: o Banco do Treino (aluno do Calc) ou a matrícula do banco principal (W6). */
  origem?: "treino" | "principal";
}

async function perfilDoTreino(alunoId: string): Promise<PerfilTreino> {
  const { data, error } = await supabase.functions.invoke("admin-get-user", { body: { userId: alunoId } });
  if (error) throw error;
  const perfil = (data as { profile?: PerfilTreino } | null)?.profile;
  if (!perfil) throw new Error("Aluno não encontrado.");
  return { ...perfil, origem: "treino" };
}

/**
 * Os dados do Treino; sem eles (paciente do Nutri, que não tem conta no Treino, ou o Treino fora do ar), os da matrícula no
 * banco principal — a mesma consulta do Financeiro do aluno (W6), que também acha o aluno pelo id do Treino.
 */
async function buscarPerfil(alunoId: string): Promise<PerfilTreino> {
  try {
    return await perfilDoTreino(alunoId);
  } catch (erroTreino) {
    try {
      const f = await buscarFinanceiroDoAluno(alunoId);
      return {
        nome: f.aluno.nome, email: f.aluno.email, foto_url: f.aluno.foto_url, idade: null, altura: null, created_at: null,
        status: f.aluno.ativo ? "ativo" : "inativo", plano_nome: f.mensalidade?.plano ?? null, origem: "principal",
      };
    } catch {
      throw erroTreino;
    }
  }
}

/**
 * Cabeçalho padrão do perfil do aluno (tela 7) com os dados do Banco do Treino: trilha
 * "Alunos › nome" no topo, foto, nome, idade · altura · aluno desde e os chips; à direita, os
 * números registrados em src/painel/aluno/kpis/. A W14 troca por src/painel/aluno/Cabecalho.tsx
 * (ações Mensagem e ⋯, dados da matrícula).
 */
export default function CabecalhoPadrao({ alunoId }: { alunoId: string }) {
  const consulta = useQuery({ queryKey: ["painel-aluno", alunoId], queryFn: () => buscarPerfil(alunoId), staleTime: 60_000, retry: 1 });
  const perfil = consulta.data;
  const nome = perfil?.nome || perfil?.email || "Aluno";
  const kpis = listar("kpisAluno", ORDEM_KPIS);

  return (
    <>
      <TopoPagina trilha={[{ rotulo: "Alunos", para: "/painel/alunos", icone: Users }, { rotulo: consulta.isLoading ? "…" : nome }]} />
      {consulta.isError ? (
        <EstadoErro titulo="Não deu para abrir este aluno" texto="Confira se ele ainda é seu aluno e tente de novo." aoTentar={() => void consulta.refetch()} />
      ) : (
        <Cartao brilho data-cabecalho-aluno className="flex flex-col gap-4 px-5 py-[18px] md:flex-row md:items-center md:gap-[18px]">
          <div className="flex min-w-0 flex-1 items-center gap-[18px]">
            {consulta.isLoading ? <Esqueleto className="h-[76px] w-[76px] flex-none rounded-full" /> : <Avatar src={perfil?.foto_url} nome={nome} tamanho={76} />}
            <div className="min-w-0 flex-1">
              {consulta.isLoading ? (
                <div className="flex flex-col gap-2">
                  <Esqueleto className="h-6 w-48" />
                  <Esqueleto className="h-4 w-64" />
                </div>
              ) : (
                <>
                  <h2 className="truncate font-body text-[24px] font-bold normal-case tracking-[-0.03em] text-texto">{nome}</h2>
                  <div className="mb-2.5 mt-1 truncate text-[13px] text-texto-2">{linhaDoAluno(perfil!) || perfil?.email}</div>
                  <div className="flex flex-wrap items-center gap-2">
                    {perfil?.origem !== "principal" && (
                      <Chip tom="t" icone={Dumbbell}>
                        TREINO
                      </Chip>
                    )}
                    {perfil?.status === "bloqueado" && (
                      <Chip tom="r" icone={Lock}>
                        BLOQUEADO
                      </Chip>
                    )}
                    {perfil?.plano_nome && <Chip tom="g">{perfil.plano_nome}</Chip>}
                  </div>
                </>
              )}
            </div>
          </div>
          {kpis.length > 0 && (
            <div className="flex flex-wrap gap-2.5 md:ml-auto" data-kpis-aluno>
              {kpis.map(({ nome: n, Componente }) => (
                <LimiteDeErro key={n} silencioso nome={n}>
                  <Suspense fallback={<Esqueleto className="h-[76px] w-[138px] rounded-2xl" />}>
                    <Componente alunoId={alunoId} />
                  </Suspense>
                </LimiteDeErro>
              ))}
            </div>
          )}
        </Cartao>
      )}
    </>
  );
}
