import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bookmark, Check, FolderClosed, Plus, Search, Timer, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { clampSeries } from "@/lib/seriesPadrao";
import { MiniaturaGif } from "@/treino/ui/MiniaturaGif";
import { formatarDescanso } from "@/treino/prescricao";
import { Botao } from "@/ui/premium/Botao";
import { Chip } from "@/ui/premium/Chip";
import { Esqueleto, EstadoErro, EstadoVazio } from "@/ui/premium/Estados";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { carregarBiblioteca, carregarModelos } from "./api";
import { mensagemDoErro } from "./useEditorTreino";
import {
  DESCANSO_ATALHOS,
  DESCANSO_PADRAO_MAX,
  DESCANSO_PADRAO_MIN,
  GRUPOS_VOLUME,
  lerCarga,
  lerDescanso,
  lerReps,
  linhaDoAluno,
  subtituloDoExercicio,
  textoCargaCampo,
  textoDescansoCampo,
} from "./regras";
import { blocoDoGrupoMuscular } from "@/lib/gruposMusculares";
import type { ExercicioBiblioteca, ExercicioEditor, PrescricaoEditavel, TreinoEditor } from "./tipos";

const normalizar = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Em qual grupo da tela 7 o exercício cai (Peito, Costas, Pernas, Ombros, Braços…). */
function grupoDoExercicio(grupoMuscular: string): string {
  const bloco = blocoDoGrupoMuscular(grupoMuscular || "");
  return GRUPOS_VOLUME.find((g) => (g.blocos as readonly string[]).includes(bloco))?.chave ?? "outros";
}

// ───────────────────────── Adicionar exercício da biblioteca ─────────────────────────

export function FolhaBiblioteca({
  aberto,
  aoMudar,
  treino,
  professorDoAluno,
  aoEscolher,
}: {
  aberto: boolean;
  aoMudar: (a: boolean) => void;
  treino: TreinoEditor | null;
  professorDoAluno: string | null;
  aoEscolher: (ex: ExercicioBiblioteca) => void;
}) {
  const [busca, setBusca] = useState("");
  const [grupo, setGrupo] = useState<string>("todos");
  const q = useQuery({
    queryKey: ["treino-biblioteca", professorDoAluno],
    queryFn: () => carregarBiblioteca(professorDoAluno),
    enabled: aberto,
    staleTime: 10 * 60_000,
  });
  useEffect(() => {
    if (!aberto) {
      setBusca("");
      setGrupo("todos");
    }
  }, [aberto]);
  const noTreino = useMemo(() => new Set((treino?.exercicios ?? []).map((e) => e.exercicio_id).filter(Boolean)), [treino]);
  const lista = useMemo(() => {
    const termo = normalizar(busca.trim());
    return (q.data ?? []).filter(
      (e) => (grupo === "todos" || grupoDoExercicio(e.grupo_muscular) === grupo) && (!termo || normalizar(`${e.nome} ${e.grupo_muscular} ${e.subgrupo ?? ""}`).includes(termo)),
    );
  }, [q.data, busca, grupo]);
  const comGif = (q.data ?? []).filter((e) => e.imagem_url).length;

  return (
    <PainelDeslizante
      aberto={aberto}
      aoMudar={aoMudar}
      lado="direita"
      titulo="Adicionar exercício"
      descricao={treino ? `No treino ${treino.rotulo}. ${q.data ? `${q.data.length} na biblioteca · ${comGif} com GIF.` : ""}` : undefined}
      className="w-[min(480px,94vw)]"
    >
      <div data-folha-biblioteca className="flex flex-col gap-3">
        <label className="flex h-10 items-center gap-2 rounded-xl border border-linha bg-superficie px-3 text-[13px] text-texto-2">
          <Search aria-hidden className="h-4 w-4 text-texto-3" />
          <input
            autoFocus
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou músculo"
            className="min-w-0 flex-1 bg-transparent text-texto outline-none placeholder:text-texto-3"
            data-biblioteca-busca
          />
        </label>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Grupo muscular">
          {[{ chave: "todos", nome: "Todos" }, ...GRUPOS_VOLUME.filter((g) => g.chave !== "outros")].map((g) => (
            <button
              key={g.chave}
              type="button"
              role="radio"
              aria-checked={grupo === g.chave}
              onClick={() => setGrupo(g.chave)}
              className={cn("pq-chip h-7 cursor-pointer px-3 text-[11.5px] tracking-normal", grupo === g.chave ? "pq-chip-t" : "pq-chip-g")}
            >
              {g.nome}
            </button>
          ))}
        </div>
        {q.isLoading ? (
          <div className="flex flex-col gap-2">{[0, 1, 2, 3].map((i) => <Esqueleto key={i} className="h-[58px] w-full" />)}</div>
        ) : q.error ? (
          <EstadoErro titulo="Não deu para abrir a biblioteca" texto={mensagemDoErro(q.error)} aoTentar={() => void q.refetch()} />
        ) : lista.length === 0 ? (
          <EstadoVazio titulo="Nenhum exercício" texto="Mude a busca ou o grupo." />
        ) : (
          <ul className="flex flex-col" data-biblioteca-lista>
            {lista.map((e) => {
              const ja = noTreino.has(e.id);
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    disabled={ja}
                    onClick={() => aoEscolher(e)}
                    className="flex w-full items-center gap-3 border-t border-[rgba(255,255,255,.06)] py-2 text-left disabled:opacity-60"
                    data-biblioteca-item={e.nome}
                  >
                    <MiniaturaGif url={e.imagem_url} exercicioId={e.id} nome={e.nome} className="h-11 w-[50px] rounded-xl" semPlay />
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-[13.5px] font-semibold text-texto">{e.nome}</b>
                      <span className="block truncate text-[11.5px] text-texto-3">{subtituloDoExercicio(e)}</span>
                    </span>
                    {ja ? (
                      <Chip tom="g" icone={Check}>NO TREINO</Chip>
                    ) : (
                      <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[10px] border border-linha-2 text-violeta-3">
                        <Plus aria-hidden className="h-4 w-4" />
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </PainelDeslizante>
  );
}

// ───────────────────────── Modelos e treino novo ─────────────────────────

export function FolhaModelos({
  aberto,
  aoMudar,
  treinoUserId,
  modo,
  aoUsar,
  aoCriar,
}: {
  aberto: boolean;
  aoMudar: (a: boolean) => void;
  treinoUserId: string;
  /** "novo" = o "+" das abas (o campo do nome em cima); "modelos" = o botão Modelos */
  modo: "novo" | "modelos";
  aoUsar: (grupoId: string) => Promise<unknown>;
  aoCriar: (nome: string) => Promise<unknown>;
}) {
  const [nome, setNome] = useState("");
  const [enviando, setEnviando] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["treino-modelos", treinoUserId], queryFn: () => carregarModelos(treinoUserId), enabled: aberto, staleTime: 30_000 });
  useEffect(() => {
    if (!aberto) setNome("");
  }, [aberto]);
  const criar = async () => {
    if (!nome.trim()) return;
    setEnviando("novo");
    const r = await aoCriar(nome.trim());
    setEnviando(null);
    if (r) aoMudar(false);
  };
  const lista = q.data ?? [];
  const pastas = lista.filter((m) => m.pastas.length > 0);
  const soltos = lista.filter((m) => m.pastas.length === 0);
  const linha = (m: (typeof lista)[number]) => (
    <li key={m.id} className="flex items-center gap-3 border-t border-[rgba(255,255,255,.06)] py-2.5" data-modelo={m.nome}>
      <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl border border-linha bg-superficie text-violeta-3">
        <Bookmark aria-hidden className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <b className="block truncate text-[13.5px] font-semibold text-texto">{m.nome}</b>
        <span className="block truncate text-[11.5px] text-texto-3">
          {m.exercicios} {m.exercicios === 1 ? "exercício" : "exercícios"} · {m.global ? "da biblioteca do Physiq" : "seu"}
          {m.pastas.length ? ` · ${m.pastas.join(", ")}` : ""}
        </span>
      </span>
      {m.ja_tem ? (
        <Chip tom="g" icone={Check}>JÁ É DO ALUNO</Chip>
      ) : (
        <Botao
          tamanho="sm"
          variante="g"
          disabled={!!enviando}
          onClick={async () => {
            setEnviando(m.id);
            const r = await aoUsar(m.id);
            setEnviando(null);
            if (r) aoMudar(false);
          }}
          data-modelo-usar={m.nome}
        >
          {enviando === m.id ? "Dando…" : "Dar ao aluno"}
        </Botao>
      )}
    </li>
  );
  return (
    <PainelDeslizante
      aberto={aberto}
      aoMudar={aoMudar}
      lado="direita"
      titulo={modo === "novo" ? "Novo treino" : "Modelos"}
      descricao="O treino do modelo é o mesmo dos outros alunos que o recebem: mudar a lista de exercícios aqui cria uma cópia só deste aluno."
      className="w-[min(480px,94vw)]"
    >
      <div className="flex flex-col gap-4" data-folha-modelos={modo}>
        <div className="flex flex-col gap-2 rounded-2xl border border-linha bg-superficie p-3">
          <span className="pq-eyebrow">Treino novo, vazio</span>
          <div className="flex gap-2">
            <input
              autoFocus={modo === "novo"}
              value={nome}
              onChange={(e) => setNome(e.target.value.slice(0, 60))}
              onKeyDown={(e) => e.key === "Enter" && void criar()}
              placeholder="Ex.: Peito e tríceps"
              className="h-10 min-w-0 flex-1 rounded-xl border border-linha-2 bg-[rgba(255,255,255,.04)] px-3 text-[13.5px] text-texto outline-none placeholder:text-texto-3 focus:border-violeta-3"
              data-novo-treino-nome
            />
            <Botao variante="w" tamanho="sm" icone={Plus} disabled={!nome.trim() || !!enviando} onClick={() => void criar()} data-novo-treino-criar>
              {enviando === "novo" ? "Criando…" : "Criar"}
            </Botao>
          </div>
        </div>
        {q.isLoading ? (
          <div className="flex flex-col gap-2">{[0, 1, 2].map((i) => <Esqueleto key={i} className="h-[52px] w-full" />)}</div>
        ) : q.error ? (
          <EstadoErro titulo="Não deu para abrir os modelos" texto={mensagemDoErro(q.error)} aoTentar={() => void q.refetch()} />
        ) : lista.length === 0 ? (
          <EstadoVazio titulo="Nenhum modelo ainda" texto="Os treinos que você monta em Painel › Treinos aparecem aqui." />
        ) : (
          <>
            {pastas.length > 0 && (
              <div>
                <span className="pq-eyebrow flex items-center gap-1.5"><FolderClosed aria-hidden className="h-3.5 w-3.5" />Nas pastas</span>
                <ul className="mt-1.5">{pastas.map(linha)}</ul>
              </div>
            )}
            {soltos.length > 0 && (
              <div>
                <span className="pq-eyebrow">Outros treinos</span>
                <ul className="mt-1.5">{soltos.map(linha)}</ul>
              </div>
            )}
          </>
        )}
      </div>
    </PainelDeslizante>
  );
}

// ───────────────────────── Editar exercício ─────────────────────────

export function FolhaEditarExercicio({
  aberto,
  aoMudar,
  ex,
  descansoPadrao,
  listaFixa,
  aoSalvar,
  aoRemover,
}: {
  aberto: boolean;
  aoMudar: (a: boolean) => void;
  ex: ExercicioEditor | null;
  descansoPadrao: number;
  listaFixa: boolean;
  aoSalvar: (p: PrescricaoEditavel) => Promise<unknown>;
  aoRemover: () => void;
}) {
  const [series, setSeries] = useState(3);
  const [reps, setReps] = useState("");
  const [descanso, setDescanso] = useState("");
  const [carga, setCarga] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    if (!ex || !aberto) return;
    setSeries(ex.series);
    setReps(ex.reps ?? "");
    setDescanso(ex.descanso ? String(ex.descanso) : "");
    setCarga(ex.carga ? textoCargaCampo(ex.carga).replace(" kg", "") : "");
    setErro(null);
  }, [ex, aberto]);
  if (!ex) return null;
  const r = lerReps(reps);
  const d = lerDescanso(descanso);
  const c = lerCarga(carga);
  const valido = r.ok && d.ok && c.ok;
  const previa = valido ? linhaDoAluno({ series, reps: r.valor, descanso: d.valor, carga: c.valor, corrida: ex.corrida }, descansoPadrao) : null;
  const salvar = async (p: PrescricaoEditavel) => {
    const ok = await aoSalvar(p);
    if (ok) aoMudar(false);
  };
  const campo = (rotulo: string, ajuda: string, valor: string, setValor: (v: string) => void, dado: string, placeholder: string, erroCampo?: string) => (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-semibold text-texto-2">{rotulo}</span>
      <input
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        placeholder={placeholder}
        className={cn("h-10 rounded-xl border bg-[rgba(255,255,255,.04)] px-3 text-[14px] text-texto outline-none placeholder:text-texto-4 focus:border-violeta-3", erroCampo ? "border-rosa" : "border-linha-2")}
        data-editar-campo={dado}
      />
      <span className={cn("text-[11.5px]", erroCampo ? "text-rosa-3" : "text-texto-3")}>{erroCampo ?? ajuda}</span>
    </label>
  );
  return (
    <PainelDeslizante
      aberto={aberto}
      aoMudar={aoMudar}
      lado="direita"
      titulo={ex.nome}
      descricao={ex.subtitulo}
      className="w-[min(440px,94vw)]"
      rodape={
        <div className="flex items-center gap-2">
          {!listaFixa && (
            <Botao tamanho="sm" variante="g" icone={Trash2} onClick={aoRemover} data-editar-remover>
              Tirar do treino
            </Botao>
          )}
          <Botao
            tamanho="sm"
            variante="g"
            className="ml-auto"
            onClick={() => void salvar({ series, reps: null, descanso: null, carga: null })}
            data-editar-limpar
          >
            Limpar
          </Botao>
          <Botao
            tamanho="sm"
            variante="w"
            disabled={!valido}
            onClick={() => {
              if (!r.ok || !d.ok || !c.ok) return setErro("Confira os campos");
              void salvar({ series, reps: r.valor, descanso: d.valor, carga: c.valor });
            }}
            data-editar-salvar
          >
            Salvar
          </Botao>
        </div>
      }
    >
      <div className="flex flex-col gap-4" data-folha-editar={ex.chave}>
        <div className="flex items-center gap-3">
          <MiniaturaGif url={ex.imagem_url} exercicioId={ex.exercicio_id} nome={ex.nome} className="h-[84px] w-[96px] rounded-2xl" semPlay />
          <div className="min-w-0 text-[12.5px] leading-relaxed text-texto-2">
            O aluno vê:
            <b className="mt-0.5 block text-[15px] font-semibold text-texto" data-editar-previa>{previa ?? "—"}</b>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold text-texto-2">Séries</span>
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setSeries(n)}
                aria-pressed={series === n}
                className={cn("h-9 w-9 rounded-xl border text-[13.5px] font-semibold", series === n ? "border-violeta-3 bg-[rgba(139,92,246,.16)] text-texto" : "border-linha-2 text-texto-2")}
                data-editar-series={n}
              >
                {n}
              </button>
            ))}
            <input
              value={String(series)}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isInteger(n) && n >= 1) setSeries(clampSeries(n));
              }}
              inputMode="numeric"
              aria-label="Séries (1 a 10)"
              className="h-9 w-12 rounded-xl border border-linha-2 bg-[rgba(255,255,255,.04)] text-center text-[13.5px] text-texto outline-none"
            />
          </div>
        </div>
        {!ex.corrida && campo("Repetições", "Um número (10) ou uma faixa (8-12). Vazio: as do último treino.", reps, setReps, "reps", "10", r.ok ? undefined : r.erro)}
        {campo(
          "Descanso",
          `Segundos (60) ou minutos (1:30). Vazio: o padrão do aluno (${formatarDescanso(descansoPadrao) ?? "—"}).`,
          descanso,
          setDescanso,
          "descanso",
          String(descansoPadrao),
          d.ok ? undefined : d.erro,
        )}
        {!ex.corrida && campo("Carga sugerida (kg)", "Vazio: o app segue a carga do último treino.", carga, setCarga, "carga", "60", c.ok ? undefined : c.erro)}
        {erro && <p className="text-[12px] text-rosa-3">{erro}</p>}
      </div>
    </PainelDeslizante>
  );
}

// ───────────────────────── Descanso padrão ─────────────────────────

export function FolhaDescanso({
  aberto,
  aoMudar,
  atual,
  aoSalvar,
}: {
  aberto: boolean;
  aoMudar: (a: boolean) => void;
  atual: number;
  aoSalvar: (seg: number) => Promise<unknown>;
}) {
  const [texto, setTexto] = useState(String(atual));
  useEffect(() => {
    if (aberto) setTexto(String(atual));
  }, [aberto, atual]);
  const l = lerDescanso(texto, DESCANSO_PADRAO_MIN, DESCANSO_PADRAO_MAX);
  return (
    <PainelDeslizante
      aberto={aberto}
      aoMudar={aoMudar}
      lado="direita"
      titulo="Descanso padrão"
      descricao="O tempo que o cronômetro do aluno começa entre as séries, nos exercícios sem descanso próprio."
      className="w-[min(400px,94vw)]"
      rodape={
        <Botao
          variante="w"
          tamanho="sm"
          className="ml-auto"
          disabled={!l.ok || !l.valor}
          onClick={async () => {
            if (!l.ok || !l.valor) return;
            const r = await aoSalvar(l.valor);
            if (r) aoMudar(false);
          }}
          data-descanso-salvar
        >
          Salvar
        </Botao>
      }
    >
      <div className="flex flex-col gap-3" data-folha-descanso>
        <div className="flex flex-wrap gap-2">
          {DESCANSO_ATALHOS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setTexto(String(s))}
              aria-pressed={l.ok && l.valor === s}
              className={cn("pq-chip h-9 cursor-pointer px-3.5 text-[12.5px] tracking-normal", l.ok && l.valor === s ? "pq-chip-t" : "pq-chip-g")}
              data-descanso-atalho={s}
            >
              <Timer aria-hidden />
              {formatarDescanso(s)}
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold text-texto-2">Outro tempo</span>
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            className="h-10 rounded-xl border border-linha-2 bg-[rgba(255,255,255,.04)] px-3 text-[14px] text-texto outline-none focus:border-violeta-3"
            data-descanso-input
          />
          <span className={cn("text-[11.5px]", l.ok ? "text-texto-3" : "text-rosa-3")}>{l.ok ? `= ${textoDescansoCampo(l.valor)}` : l.erro}</span>
        </label>
      </div>
    </PainelDeslizante>
  );
}
