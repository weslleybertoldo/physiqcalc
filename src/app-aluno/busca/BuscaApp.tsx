import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@powersync/react";
import { Dumbbell, Salad } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { planoAtivo } from "@/nutricao/app/dia";
import { useDieta } from "@/nutricao/app/useDieta";
import { SheetFicha } from "@/treino/ui/SheetFicha";
import type { Exercicio } from "@/treino/tipos";
import { GrupoBusca, ItemBusca, PaletaBusca } from "@/ui/premium/Busca";
import { useTermoDaBusca } from "@/ui/premium/atalhos";
import { useOQueOAlunoTem } from "@/app-aluno/inicio/pecas/dados";
import { alimentosDaBusca, combina, destinoDoAlimento, exerciciosDaBusca, MINIMO_BUSCA, palavrasSemAcento, type ExercicioDaBusca, type LinhaExercicioBusca } from "./regras";

/** Os exercícios dos treinos do aluno no SQLite do PowerSync: os do profissional liberados para ele + os próprios (sem internet). */
const SQL_EXERCICIOS = `
  SELECT e.id AS id, e.nome AS nome, e.grupo_muscular AS grupo_muscular, e.emoji AS emoji, e.tipo AS tipo, e.imagem_url AS imagem_url,
         e.subgrupo AS subgrupo, e.dica AS dica, g.nome AS treino
    FROM tb_grupos_exercicios ge
    JOIN tb_exercicios e ON e.id = ge.exercicio_id
    JOIN tb_grupos_treino g ON g.id = ge.grupo_id
  UNION ALL
  SELECT COALESCE(e.id, eu.id) AS id, COALESCE(e.nome, eu.nome) AS nome, COALESCE(e.grupo_muscular, eu.grupo_muscular) AS grupo_muscular,
         COALESCE(e.emoji, eu.emoji) AS emoji, COALESCE(e.tipo, eu.tipo) AS tipo, e.imagem_url AS imagem_url, e.subgrupo AS subgrupo,
         e.dica AS dica, gu.nome AS treino
    FROM tb_grupos_exercicios_usuario geu
    JOIN tb_grupos_treino_usuario gu ON gu.id = geu.grupo_usuario_id
    LEFT JOIN tb_exercicios e ON e.id = geu.exercicio_id
    LEFT JOIN tb_exercicios_usuario eu ON eu.id = geu.exercicio_usuario_id
   WHERE geu.user_id = ?`;

/**
 * A consulta começa quando a busca ABRE (não na 2ª letra): no celular o SQLite leva uns instantes e, até lá, a paleta diria
 * "Nada com …" antes de mostrar os exercícios. Enquanto ela não responde, a busca diz "Buscando…" (`aoBuscando`).
 */
function FonteExercicios({ userId, termo, curto, aoBuscando, aoEscolher }: {
  userId: string;
  termo: string;
  curto: boolean;
  aoBuscando: (v: boolean) => void;
  aoEscolher: (e: ExercicioDaBusca) => void;
}) {
  const { data, isLoading } = useQuery<LinhaExercicioBusca>(SQL_EXERCICIOS, [userId]);
  useEffect(() => {
    aoBuscando(isLoading);
    return () => aoBuscando(false);
  }, [isLoading, aoBuscando]);
  const todos = useMemo(() => exerciciosDaBusca(data ?? []), [data]);
  const lista = useMemo(() => (curto ? [] : todos.filter((e) => combina(termo, [e.nome, e.grupo_muscular, ...e.treinos]))), [todos, termo, curto]);
  if (lista.length === 0) return null;
  return (
    <GrupoBusca titulo="Exercícios do seu treino">
      {lista.map((e) => (
        <ItemBusca key={e.id} icone={Dumbbell} rotulo={e.nome} detalhe={e.treinos.join(" · ")}
          palavras={[...e.treinos, e.grupo_muscular, ...palavrasSemAcento(e.nome, e.grupo_muscular, ...e.treinos)]} aoEscolher={() => aoEscolher(e)} />
      ))}
    </GrupoBusca>
  );
}

function FonteAlimentos({ termo, curto, aoEscolher }: { termo: string; curto: boolean; aoEscolher: (destino: string) => void }) {
  const d = useDieta();
  const todos = useMemo(() => alimentosDaBusca(planoAtivo(d.dados?.planos ?? []), d.hoje), [d.dados, d.hoje]);
  const lista = useMemo(() => (curto ? [] : todos.filter((a) => combina(termo, [a.nome, ...a.refeicoes.map((r) => r.nome)]))), [todos, termo, curto]);
  if (lista.length === 0) return null;
  return (
    <GrupoBusca titulo="Alimentos da sua dieta">
      {lista.map((a) => (
        <ItemBusca key={a.nome} icone={Salad} rotulo={a.nome} detalhe={a.refeicoes.map((r) => r.nome).join(" · ")}
          palavras={[...a.refeicoes.map((r) => r.nome), ...palavrasSemAcento(a.nome)]} aoEscolher={() => aoEscolher(destinoDoAlimento(a))} />
      ))}
    </GrupoBusca>
  );
}

/**
 * A busca do Início (W12 — tela 1; NF10): exercícios dos treinos do aluno (a ficha com o GIF) e alimentos do plano alimentar
 * atual (abre a refeição na aba Dieta). Cada um só com o seu módulo; os exercícios funcionam sem internet (SQLite do PowerSync).
 */
export function BuscaApp({ aberto, aoMudar }: { aberto: boolean; aoMudar: (v: boolean) => void }) {
  const navigate = useNavigate();
  const tem = useOQueOAlunoTem();
  const { user } = useAuth();
  // hml-18a (H-40, D): o termo só volta a "" depois da saída da janela (a lista não pisca vazia enquanto ela esmaece)
  const [termo, setTermo] = useTermoDaBusca(aberto);
  const [ficha, setFicha] = useState<Exercicio | null>(null);
  const [buscando, setBuscando] = useState(false);
  const curto = termo.trim().length < MINIMO_BUSCA;
  const fechar = () => aoMudar(false);
  const placeholder = tem.treino && tem.comNutricionista ? "Buscar exercício ou alimento" : tem.treino ? "Buscar exercício do seu treino" : "Buscar alimento da sua dieta";

  return (
    <>
      <PaletaBusca
        aberto={aberto}
        aoMudar={(v) => (v ? aoMudar(true) : fechar())}
        termo={termo}
        aoMudarTermo={setTermo}
        placeholder={placeholder}
        vazio={
          curto ? (
            <span data-busca-dica>{tem.treino && tem.comNutricionista ? "Digite o nome de um exercício do seu treino ou de um alimento da sua dieta." : tem.treino ? "Digite o nome de um exercício do seu treino." : "Digite o nome de um alimento da sua dieta."}</span>
          ) : buscando ? (
            <span data-busca-buscando>Buscando no seu plano…</span>
          ) : (
            <span data-busca-vazia>Nada com “{termo.trim()}” no seu plano.</span>
          )
        }
      >
        {tem.treino && user && (
          <FonteExercicios
            userId={user.id}
            termo={termo}
            curto={curto}
            aoBuscando={setBuscando}
            aoEscolher={(e) => {
              fechar();
              setFicha({ id: e.id, nome: e.nome, grupo_muscular: e.grupo_muscular, emoji: e.emoji, tipo: e.tipo, imagem_url: e.imagem_url, subgrupo: e.subgrupo, dica: e.dica });
            }}
          />
        )}
        {tem.comNutricionista && (
          <FonteAlimentos
            termo={termo}
            curto={curto}
            aoEscolher={(destino) => {
              fechar();
              navigate(destino);
            }}
          />
        )}
      </PaletaBusca>
      <SheetFicha exercicio={ficha} aoFechar={() => setFicha(null)} />
    </>
  );
}
