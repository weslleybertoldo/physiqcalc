import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LayoutDashboard, Search } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { useSessao } from "@/nucleo/sessao";
import { ehProfissional } from "@/nucleo/situacao";
import { AvisosDoTopo } from "@/app-aluno/AppAlunoLayout";
import { BuscaApp } from "@/app-aluno/busca/BuscaApp";
import { usePerfilDoAluno } from "@/app-aluno/inicio/pecas/dados";
import { primeiroNome, saudacao } from "@/app-aluno/inicio/pecas/regras";
import { CLASSE_PAGINA_APP } from "@/app-aluno/perfil/pecas/TopoItem";
import { listar, type ItemRegistro } from "@/rotas/registro";
import { lembrarArea } from "@/ui/casca/area";
import { Carregavel } from "@/ui/casca/Carregavel";
import { useDadosCasca } from "@/ui/casca/dadosCasca";
import { Avatar } from "@/ui/premium/Avatar";
import { BotaoIcone } from "@/ui/premium/Botao";
import { Esqueleto } from "@/ui/premium/Estados";
import { Sino } from "@/ui/premium/Sino";

/**
 * As linhas do Início na ordem da tela 1: o treino de hoje; a dieta e as metas lado a lado; a próxima consulta; o peso. Cada card
 * é um arquivo em src/app-aluno/inicio/<Card>.tsx (registro por convenção — spec 11.1) e decide sozinho se aparece (módulo do
 * aluno). Card novo de outra worktree entra no fim, numa linha só dele.
 */
const LINHAS: string[][] = [["CardTreinoHoje"], ["CardDietaHoje", "CardMetasHoje"], ["CardProximaConsulta"], ["CardPeso"]];

/** O espaço de cada card enquanto o arquivo dele chega (o esqueleto no formato do card). */
const ESQUELETO: Record<string, string> = {
  CardTreinoHoje: "h-[212px] rounded-[26px]",
  CardDietaHoje: "h-[150px] rounded-[22px]",
  CardMetasHoje: "h-[150px] rounded-[22px]",
  CardProximaConsulta: "h-[66px] rounded-[22px]",
  CardPeso: "h-[84px] rounded-[22px]",
};

function Card({ item }: { item: ItemRegistro }) {
  const C = item.Componente;
  return (
    <Carregavel nome={`card ${item.nome}`} esqueleto={<Esqueleto className={ESQUELETO[item.nome] ?? "h-[84px] rounded-[22px]"} />}>
      <C />
    </Carregavel>
  );
}

/** Monta as linhas com os cards registrados (os que não estão na lista da tela 1 vão para o fim). */
function linhasDosCards(itens: ItemRegistro[]): ItemRegistro[][] {
  const porNome = new Map(itens.map((i) => [i.nome, i]));
  const usados = new Set<string>();
  const linhas: ItemRegistro[][] = [];
  for (const nomes of LINHAS) {
    const linha = nomes.map((n) => porNome.get(n)).filter((i): i is ItemRegistro => !!i);
    linha.forEach((i) => usados.add(i.nome));
    if (linha.length) linhas.push(linha);
  }
  for (const i of itens) if (!usados.has(i.nome)) linhas.push([i]);
  return linhas;
}

function Topo({ aoBuscar }: { aoBuscar: () => void }) {
  const navigate = useNavigate();
  const { usuario } = useDadosCasca();
  const { situacao } = useSessao();
  const { isStaff } = useAuth();
  const perfil = usePerfilDoAluno();
  const nome = perfil.data?.nome || situacao?.nome || usuario?.nome || "";
  const foto = perfil.data?.foto_url ?? situacao?.foto_url ?? usuario?.fotoUrl ?? null;
  const profissional = isStaff || ehProfissional(situacao);
  const primeiro = primeiroNome(nome);
  return (
    <div className="mt-0.5 flex items-center justify-between gap-3" data-inicio-topo>
      <div className="flex min-w-0 items-center gap-3">
        <Avatar src={foto} nome={nome} tamanho={46} />
        <div className="min-w-0">
          <div className="text-[12px] font-medium text-texto-2" data-inicio-saudacao>
            {saudacao()}
            {primeiro ? "," : ""}
          </div>
          <div className="truncate text-[21px] font-bold leading-tight tracking-[-0.025em] text-texto" data-inicio-nome>
            {primeiro || "Bem-vindo"}
          </div>
        </div>
      </div>
      <div className="flex flex-none items-center gap-2">
        {profissional && (
          <BotaoIcone icone={LayoutDashboard} rotulo="Painel" onClick={() => { lembrarArea("painel"); navigate("/painel"); }} data-inicio-painel />
        )}
        <BotaoIcone icone={Search} rotulo="Buscar" onClick={aoBuscar} data-inicio-busca />
        <Sino />
      </div>
    </div>
  );
}

function Linha({ itens }: { itens: ItemRegistro[] }) {
  if (itens.length === 1) return <Card item={itens[0]} />;
  // Dieta e Metas lado a lado; se só um aparece (o outro não é do aluno), ele ocupa a linha inteira e só a altura do conteúdo
  return (
    <div className="grid grid-cols-2 gap-3 empty:hidden [&>*:only-child]:col-span-2 [&>*:only-child]:h-auto" data-inicio-linha={itens.map((i) => i.nome).join(" ")}>
      {itens.map((i) => (
        <Card key={i.nome} item={i} />
      ))}
    </div>
  );
}

/**
 * Aba Início do app do aluno (W12 — spec 4.3, tela 1; paridade N-48, C15, C85): a saudação com a foto e o nome, a busca
 * (exercícios e alimentos do plano) e o sino; as faixas do topo da casca (a da mensalidade — W6); e os cards: Treino de hoje
 * (W8), Dieta de hoje e Metas de hoje (W11), próxima consulta (W7) e Seu peso (W10) — cada um com os dados e as regras da aba
 * que ele abre. É a tela de abertura do app (depois do login e ao abrir o APK); o profissional continua abrindo no painel.
 */
export default function Inicio() {
  const [busca, setBusca] = useState(false);
  const linhas = linhasDosCards(listar("inicioApp"));
  return (
    <div className={cn(CLASSE_PAGINA_APP, "gap-3")} data-aba-inicio>
      <Topo aoBuscar={() => setBusca(true)} />
      <AvisosDoTopo />
      {linhas.map((itens) => (
        <Linha key={itens.map((i) => i.nome).join("+")} itens={itens} />
      ))}
      <BuscaApp aberto={busca} aoMudar={setBusca} />
    </div>
  );
}
