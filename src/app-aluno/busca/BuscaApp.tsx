import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@powersync/react";
import { Dumbbell, Salad } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { planoAtivo } from "@/nutricao/app/dia";
import { useDieta } from "@/nutricao/app/useDieta";
import { SheetFicha } from "@/treino/ui/SheetFicha";
import type { Exercicio } from "@/treino/tipos";
import { GrupoBusca, ItemBusca, PaletaBusca } from "@/ui/premium/Busca";
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

function FonteExercicios({ userId, termo, aoEscolher }: { userId: string; termo: string; aoEscolher: (e: ExercicioDaBusca) => void }) {
  const { data } = useQuery<LinhaExercicioBusca>(SQL_EXERCICIOS, [userId]);
  const todos = useMemo(() => exerciciosDaBusca(data ?? []), [data]);
  const lista = useMemo(() => todos.filter((e) => combina(termo, [e.nome, e.grupo_muscular, ...e.treinos])), [todos, termo]);
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

function FonteAlimentos({ termo, aoEscolher }: { termo: string; aoEscolher: (destino: string) => void }) {
  const d = useDieta();
  const todos = useMemo(() => alimentosDaBusca(planoAtivo(d.dados?.planos ?? []), d.hoje), [d.dados, d.hoje]);
  const lista = useMemo(() => todos.filter((a) => combina(termo, [a.nome, ...a.refeicoes.map((r) => r.nome)])), [todos, termo]);
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
  const [termo, setTermo] = useState("");
  const [ficha, setFicha] = useState<Exercicio | null>(null);
  const curto = termo.trim().length < MINIMO_BUSCA;
  const fechar = () => {
    aoMudar(false);
    setTermo("");
  };
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
          ) : (
            <span data-busca-vazia>Nada com “{termo.trim()}” no seu plano.</span>
          )
        }
      >
        {!curto && tem.treino && user && (
          <FonteExercicios
            userId={user.id}
            termo={termo}
            aoEscolher={(e) => {
              fechar();
              setFicha({ id: e.id, nome: e.nome, grupo_muscular: e.grupo_muscular, emoji: e.emoji, tipo: e.tipo, imagem_url: e.imagem_url, subgrupo: e.subgrupo, dica: e.dica });
            }}
          />
        )}
        {!curto && tem.comNutricionista && (
          <FonteAlimentos
            termo={termo}
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
