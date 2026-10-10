import { useEffect, useMemo, useState } from "react";
import { ImagePlus, Lock, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { entrada3d } from "@/lib/exercicios3d";
import { resolverImagem } from "@/lib/imagemExercicio";
import { cn } from "@/lib/utils";
import { CAMPOS_EQUIVALENCIA_VAZIOS, camposDoExercicio, camposParaGravar, rotuloEquipamento, rotuloPadrao, type CamposEquivalencia } from "@/treino/equivalencia";
import { FormExercicioBiblioteca } from "@/treino/ui/FormExercicioBiblioteca";
import { Visualizador3D } from "@/treino/ui/Visualizador3D";
import { Botao } from "@/ui/premium/Botao";
import { Chip } from "@/ui/premium/Chip";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { Segmentado } from "@/ui/premium/Segmentado";
import { criarExercicio, criarMusculo, salvarExercicio, subirImagem, type DadosExercicio } from "./api";
import { CLASSE_CAMPO } from "./estilo";
import { erroDoNome, nomeLimpo } from "./regras";
import type { ExercicioCatalogo, GrupoMuscularRow } from "./tipos";
import { mensagemDoErro } from "./useTreinos";

/**
 * Novo / editar exercício da biblioteca (C43 + W9): nome, grupo muscular (com "+ Músculo"), musculação ou corrida, subgrupo, dica,
 * o GIF/imagem e a troca por equivalente (movimento, equipamento e variação — o FormExercicioBiblioteca da W9). O global do master
 * abre só para ver (o profissional usa, não muda).
 */
export function FolhaExercicio({
  aberto,
  aoMudar,
  exercicio,
  somenteLeitura,
  musculos,
  dono,
  aoSalvo,
}: {
  aberto: boolean;
  aoMudar: (a: boolean) => void;
  /** null = novo */
  exercicio: ExercicioCatalogo | null;
  somenteLeitura: boolean;
  musculos: GrupoMuscularRow[];
  /** o professor_id do que é criado (o master cria no global) */
  dono: string | null;
  aoSalvo: (id: string) => void;
}) {
  const [nome, setNome] = useState("");
  const [grupo, setGrupo] = useState("");
  const [tipo, setTipo] = useState<"musculacao" | "corrida">("musculacao");
  const [subgrupo, setSubgrupo] = useState("");
  const [dica, setDica] = useState("");
  const [equiv, setEquiv] = useState<CamposEquivalencia>(CAMPOS_EQUIVALENCIA_VAZIOS);
  const [imagem, setImagem] = useState<string | null>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [novoMusculo, setNovoMusculo] = useState<string | null>(null);
  const [extras, setExtras] = useState<GrupoMuscularRow[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [tentou, setTentou] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setNome(exercicio?.nome ?? "");
    setGrupo(exercicio?.grupo_muscular ?? musculos[0]?.nome ?? "");
    setTipo(exercicio?.tipo === "corrida" ? "corrida" : "musculacao");
    setSubgrupo(exercicio?.subgrupo ?? "");
    setDica(exercicio?.dica ?? "");
    setEquiv(camposDoExercicio(exercicio));
    setImagem(exercicio?.imagem_url ?? null);
    setArquivo(null);
    setNovoMusculo(null);
    setTentou(false);
  }, [aberto, exercicio, musculos]);

  const opcoesGrupo = useMemo(() => {
    const nomes = [...musculos, ...extras].map((m) => m.nome);
    if (grupo && !nomes.includes(grupo)) nomes.push(grupo);
    return [...new Set(nomes)].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [musculos, extras, grupo]);
  const tresD = entrada3d(exercicio?.id); // exercício com 3D: o boneco no lugar da prévia (mesmo visualizador do aluno)
  const previa = useMemo(() => (arquivo ? URL.createObjectURL(arquivo) : resolverImagem(imagem)), [arquivo, imagem]);
  useEffect(() => () => {
    if (arquivo && previa) URL.revokeObjectURL(previa);
  }, [arquivo, previa]);

  const erroNome = erroDoNome(nome, 80);
  const salvar = async () => {
    setTentou(true);
    if (erroNome || !grupo) return;
    setSalvando(true);
    try {
      const dados: DadosExercicio = {
        nome: nomeLimpo(nome),
        grupo_muscular: grupo,
        tipo,
        subgrupo: subgrupo.trim() || null,
        dica: dica.trim() || null,
        ...camposParaGravar(equiv),
      };
      let id = exercicio?.id ?? null;
      if (id) {
        await salvarExercicio(id, { ...dados, imagem_url: arquivo ? undefined : imagem });
      } else {
        id = await criarExercicio(dados, dono);
      }
      if (arquivo && id) {
        const url = await subirImagem(arquivo, id);
        await salvarExercicio(id, { imagem_url: url });
      }
      toast.success(exercicio ? "Exercício salvo." : "Exercício criado.");
      aoSalvo(id!);
    } catch (e) {
      toast.error(mensagemDoErro(e));
    } finally {
      setSalvando(false);
    }
  };

  const salvarMusculo = async () => {
    const n = nomeLimpo(novoMusculo ?? "");
    if (!n) return;
    try {
      const m = await criarMusculo(n, dono);
      setExtras((x) => [...x, m]);
      setGrupo(m.nome);
      setNovoMusculo(null);
      toast.success(`"${m.nome}" na lista de grupos musculares.`);
    } catch (e) {
      toast.error(mensagemDoErro(e));
    }
  };

  const titulo = somenteLeitura ? exercicio?.nome ?? "Exercício" : exercicio ? "Editar exercício" : "Novo exercício";
  return (
    <PainelDeslizante aberto={aberto} aoMudar={aoMudar} lado="direita" titulo={titulo} className="w-[min(520px,94vw)]"
      descricao={somenteLeitura ? "Exercício do catálogo global do Physiq — só leitura." : dono === null ? "Exercício do catálogo GLOBAL (todos os profissionais veem)." : "Só você e os seus alunos veem."}
      rodape={
        somenteLeitura ? undefined : (
          <Botao variante="w" onClick={() => void salvar()} disabled={salvando} data-exercicio-salvar>
            {salvando ? "Salvando…" : exercicio ? "Salvar" : "Criar exercício"}
          </Botao>
        )
      }>
      <div className="flex flex-col gap-3.5" data-folha-exercicio={exercicio?.id ?? "novo"} data-somente-leitura={somenteLeitura || undefined}>
        {tresD && <Visualizador3D entrada={tresD} nome={exercicio?.nome ?? "Exercício"} />}
        {/* GIF / imagem */}
        <div className="flex items-start gap-3">
          {!tresD && (
            <div className="flex h-[120px] w-[150px] flex-none items-center justify-center overflow-hidden rounded-2xl border border-linha bg-superficie" data-exercicio-previa={previa ? "1" : "0"}>
              {previa ? <img src={previa} alt={nome || "Exercício"} className="h-full w-full object-cover" /> : <ImagePlus aria-hidden className="h-6 w-6 text-texto-3" strokeWidth={1.5} />}
            </div>
          )}
          <div className="flex min-w-0 flex-col gap-2 pt-1">
            {somenteLeitura ? (
              <>
                <Chip tom="g" icone={Lock}>GLOBAL</Chip>
                <span className="text-[12.5px] text-texto-2">{[rotuloPadrao(exercicio?.padrao_movimento), rotuloEquipamento(exercicio?.equipamento)].filter(Boolean).join(" · ") || "Sem classificação"}</span>
              </>
            ) : (
              <>
                <label className="pq-botao pq-botao-g pq-botao-sm cursor-pointer self-start" data-exercicio-imagem>
                  <ImagePlus aria-hidden />
                  {previa ? "Trocar foto/GIF" : "Adicionar foto/GIF"}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} data-exercicio-arquivo />
                </label>
                {previa && (
                  <button type="button" onClick={() => { setArquivo(null); setImagem(null); }} className="flex items-center gap-1 self-start text-[12px] font-medium text-texto-3 hover:text-rosa-3" data-exercicio-imagem-remover>
                    <Trash2 aria-hidden className="h-3.5 w-3.5" /> Remover
                  </button>
                )}
                <span className="text-[11.5px] text-texto-3">Imagem ou GIF até 5 MB.</span>
              </>
            )}
          </div>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="pq-eyebrow">Nome</span>
          <input value={nome} onChange={(e) => setNome(e.target.value)} disabled={somenteLeitura} maxLength={100} placeholder="Ex.: Rosca martelo no cross"
            className={cn(CLASSE_CAMPO, tentou && erroNome && "border-rosa")} data-campo-nome />
          {tentou && erroNome && <span className="text-[12px] text-rosa-3">{erroNome}</span>}
        </label>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[minmax(0,1fr)_auto]">
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="pq-eyebrow">Grupo muscular</span>
            <select value={grupo} onChange={(e) => setGrupo(e.target.value)} disabled={somenteLeitura} className={cn(CLASSE_CAMPO, "[color-scheme:dark]", tentou && !grupo && "border-rosa")} data-campo-grupo>
              <option value="" className="bg-tela text-texto">Escolha…</option>
              {opcoesGrupo.map((g) => (
                <option key={g} value={g} className="bg-tela text-texto">{g}</option>
              ))}
            </select>
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="pq-eyebrow">Tipo</span>
            <Segmentado rotulo="Tipo do exercício" opcoes={[{ valor: "musculacao", rotulo: "Musculação" }, { valor: "corrida", rotulo: "Corrida" }]}
              valor={tipo} aoMudar={(v) => !somenteLeitura && setTipo(v)} />
          </div>
        </div>
        {!somenteLeitura && (
          novoMusculo === null ? (
            <button type="button" onClick={() => setNovoMusculo("")} className="-mt-1.5 flex items-center gap-1 self-start text-[12px] font-semibold text-violeta-3" data-novo-musculo>
              <Plus aria-hidden className="h-3.5 w-3.5" /> Músculo que não está na lista
            </button>
          ) : (
            <div className="-mt-1 flex items-center gap-2">
              <input autoFocus value={novoMusculo} onChange={(e) => setNovoMusculo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void salvarMusculo()}
                placeholder="Ex.: Trapézio médio" maxLength={60} className={cn(CLASSE_CAMPO, "h-9")} data-novo-musculo-campo />
              <Botao tamanho="sm" variante="v" onClick={() => void salvarMusculo()} disabled={!novoMusculo.trim()} data-novo-musculo-salvar>Salvar</Botao>
              <button type="button" aria-label="Cancelar" onClick={() => setNovoMusculo(null)} className="pq-ibtn" style={{ width: 32, height: 32, borderRadius: 10 }}><X aria-hidden /></button>
            </div>
          )
        )}

        <label className="flex flex-col gap-1.5">
          <span className="pq-eyebrow">Subgrupo (opcional)</span>
          <input value={subgrupo} onChange={(e) => setSubgrupo(e.target.value)} disabled={somenteLeitura} maxLength={120} placeholder="Ex.: Braquial · braquiorradial · bíceps" className={CLASSE_CAMPO} data-campo-subgrupo />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="pq-eyebrow">Dica de execução (opcional)</span>
          <textarea value={dica} onChange={(e) => setDica(e.target.value)} disabled={somenteLeitura} rows={3} maxLength={1000} placeholder="Ex.: Cotovelos parados ao lado do corpo."
            className={cn(CLASSE_CAMPO, "h-auto resize-y py-2.5 leading-normal")} data-campo-dica />
        </label>
        <FormExercicioBiblioteca valor={equiv} aoMudar={setEquiv} grupoMuscular={grupo} somenteLeitura={somenteLeitura} />
      </div>
    </PainelDeslizante>
  );
}
