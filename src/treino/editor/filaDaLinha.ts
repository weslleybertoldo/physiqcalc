/**
 * hml-24 (H-127) — a FILA POR LINHA do editor do treino (Painel › Alunos › Treino): cada linha do banco que o editor grava (a
 * prescrição de um exercício; a observação do treino) tem no máximo 1 pedido em voo. PURA e FORA do React: a gravação termina
 * mesmo saindo da tela (dentro do app); quem usa (useEditorTreino.ts) cuida da tela, dos avisos e do cache.
 *
 * Por linha: o DESEJADO (o valor inteiro que a pessoa quer — a prescrição toda), a versão e o envio em voo.
 *   · mudar(chave, base, novo) aplica ao desejado SÓ os campos em que `novo` difere de `base` (o que a tela mostrava quando a
 *     pessoa mexeu: o campo muda 1; a folha "Editar", até 4) — um campo digitado com a tela velha não desfaz o que outro campo da
 *     mesma linha acabou de mudar. Linha parada → envia na hora; com um pedido em voo → espera; quando ele volta, se a versão andou,
 *     vai 1 pedido com TUDO o que juntou (nunca 2 da mesma linha ao mesmo tempo; o último valor de cada campo vence).
 *   · A promessa de cada mudança resolve com o envio que a levou (a folha espera e fecha no ok).
 *   · Erro → as promessas da linha (a do envio e as que esperavam) dão null; NADA reenvia sozinho; a linha guarda o que queria para
 *     o "Tentar de novo" (até a próxima mudança dela, que vence).
 *   · descartar: o exercício que sai do treino leva a fila dele (o pedido em voo termina, mas nada mais vai depois e o resultado é
 *     ignorado).
 *   · algoPendente(): algo em voo ou esperando — o aviso do navegador ao fechar/recarregar a aba (vigiarSaida).
 */

export type Valor = Record<string, unknown>;

/** O que um envio levou: o valor inteiro da linha e os campos que as mudanças dele trocaram. */
export interface Envio<V extends Valor> {
  valor: V;
  campos: ReadonlySet<string>;
}

/** Como gravar uma linha (o mais novo de cada mudança vale para os próximos envios). */
export interface Manejo<V extends Valor, R> {
  /** 1 pedido ao servidor com o valor inteiro da linha. */
  enviar: (valor: V) => Promise<R>;
  /** o envio voltou ok (chamado antes de as promessas resolverem). */
  aoOk?: (r: R, envio: Envio<V>) => void;
  /** o envio falhou (chamado antes de as promessas darem null): `desejado` = o que a linha queria (o "Tentar de novo"). */
  aoErro?: (erro: unknown, desejado: V) => void;
  /** a linha foi descartada com algo pendente (o exercício saiu do treino). */
  aoDescartar?: () => void;
}

interface Espera<R> {
  versao: number;
  campos: string[];
  resolver: (r: R | null) => void;
}

interface Linha<V extends Valor, R> {
  desejado: V;
  versao: number;
  emVoo: boolean;
  esperas: Espera<R>[];
  manejo: Manejo<V, R>;
  descartada: boolean;
}

export interface Fila<V extends Valor, R> {
  mudar(chave: string, base: V, novo: V, manejo: Manejo<V, R>): Promise<R | null>;
  /** Reenvia o que a linha queria quando falhou (null = nada a tentar: não falhou ou já mudou de novo). */
  tentarDeNovo(chave: string): Promise<R | null> | null;
  /** Tira a linha da fila (e o erro guardado dela): as promessas pendentes dão null; o pedido em voo é ignorado ao voltar. */
  descartar(chave: string): void;
  /** O desejado da linha com algo em voo ou esperando (null = parada). */
  pendente(chave: string): V | null;
  /** As linhas com algo em voo ou esperando, com o desejado de cada uma (a tela sobrepõe ao que o servidor devolveu). */
  pendentes(): ReadonlyArray<readonly [string, V]>;
  /** A linha tem um erro guardado (o "Tentar de novo" ainda vale). */
  temErro(chave: string): boolean;
  algoPendente(): boolean;
  /** Avisa a cada mudança do estado (para o useSyncExternalStore). Devolve o "parar de avisar". */
  assinar(aviso: () => void): () => void;
  /** Um número que muda a cada mudança do estado (o retrato do useSyncExternalStore). */
  versao(): number;
}

const igual = (a: unknown, b: unknown) => Object.is(a, b);

/** Os campos em que `novo` difere de `base` (a mudança que a pessoa fez). */
export function camposMudados<V extends Valor>(base: V, novo: V): string[] {
  return Object.keys(novo).filter((k) => !igual(novo[k], base[k]));
}

export function criarFila<V extends Valor, R>(): Fila<V, R> {
  const linhas = new Map<string, Linha<V, R>>();
  const erros = new Map<string, { desejado: V; manejo: Manejo<V, R> }>();
  const avisos = new Set<() => void>();
  let retrato = 0;
  let cache: ReadonlyArray<readonly [string, V]> = [];

  const avisar = () => {
    retrato++;
    cache = [...linhas.entries()].filter(([, l]) => !l.descartada).map(([k, l]) => [k, { ...l.desejado }] as const);
    for (const a of [...avisos]) {
      try {
        a();
      } catch {
        /* um assinante com erro não para a fila */
      }
    }
  };

  const disparar = (chave: string, l: Linha<V, R>) => {
    l.emVoo = true;
    const versao = l.versao;
    const valor = { ...l.desejado };
    const campos = new Set(l.esperas.filter((w) => w.versao <= versao).flatMap((w) => w.campos));
    let pedido: Promise<R>;
    try {
      pedido = Promise.resolve(l.manejo.enviar(valor));
    } catch (e) {
      pedido = Promise.reject(e);
    }
    pedido.then(
      (r) => {
        l.emVoo = false;
        if (l.descartada) return;
        const levadas = l.esperas.filter((w) => w.versao <= versao);
        l.esperas = l.esperas.filter((w) => w.versao > versao);
        // juntou mais enquanto este voava: o próximo (com TUDO) sai já — antes dos avisos, para nunca haver 2 da linha no ar
        if (l.versao > versao) disparar(chave, l);
        else linhas.delete(chave);
        try {
          l.manejo.aoOk?.(r, { valor, campos });
        } finally {
          for (const w of levadas) w.resolver(r);
          avisar();
        }
      },
      (e) => {
        l.emVoo = false;
        if (l.descartada) return;
        const todas = l.esperas;
        l.esperas = [];
        linhas.delete(chave);
        const desejado = { ...l.desejado };
        erros.set(chave, { desejado, manejo: l.manejo });
        try {
          l.manejo.aoErro?.(e, desejado);
        } finally {
          for (const w of todas) w.resolver(null);
          avisar();
        }
      },
    );
  };

  const mudar = (chave: string, base: V, novo: V, manejo: Manejo<V, R>): Promise<R | null> => {
    const campos = camposMudados(base, novo);
    // a mudança nova vence o erro antigo da linha (o "Tentar de novo" dele não vale mais)
    erros.delete(chave);
    let l = linhas.get(chave);
    const parada = !l;
    if (!l) {
      l = { desejado: { ...base }, versao: 0, emVoo: false, esperas: [], manejo, descartada: false };
      linhas.set(chave, l);
    }
    l.manejo = manejo;
    for (const k of campos) (l.desejado as Valor)[k] = novo[k];
    // sem campo novo com a linha ocupada: vai junto com o envio que já leva o desejado; senão é uma versão nova
    if (campos.length || parada) l.versao++;
    const linha = l;
    const promessa = new Promise<R | null>((resolver) => linha.esperas.push({ versao: linha.versao, campos, resolver }));
    if (!linha.emVoo) disparar(chave, linha);
    avisar();
    return promessa;
  };

  return {
    mudar,
    tentarDeNovo(chave) {
      const e = erros.get(chave);
      if (!e || linhas.has(chave)) return null;
      erros.delete(chave);
      // o que a linha queria, inteiro: a base vazia faz todos os campos entrarem como mudados
      return mudar(chave, {} as V, e.desejado, e.manejo);
    },
    descartar(chave) {
      erros.delete(chave);
      const l = linhas.get(chave);
      if (!l) return;
      l.descartada = true;
      linhas.delete(chave);
      const todas = l.esperas;
      l.esperas = [];
      try {
        l.manejo.aoDescartar?.();
      } finally {
        for (const w of todas) w.resolver(null);
        avisar();
      }
    },
    pendente(chave) {
      const l = linhas.get(chave);
      return l && !l.descartada ? { ...l.desejado } : null;
    },
    pendentes: () => cache,
    temErro: (chave) => erros.has(chave),
    algoPendente: () => [...linhas.values()].some((l) => !l.descartada),
    assinar(aviso) {
      avisos.add(aviso);
      return () => avisos.delete(aviso);
    },
    versao: () => retrato,
  };
}

/** O mínimo da janela que o vigia usa (o window do navegador; nos testes, um EventTarget). */
export interface JanelaComSaida {
  addEventListener(tipo: "beforeunload", f: (e: BeforeUnloadEvent) => void): void;
  removeEventListener(tipo: "beforeunload", f: (e: BeforeUnloadEvent) => void): void;
}

/**
 * O aviso do navegador ao fechar ou recarregar a aba com gravação pendente: o "beforeunload" só fica ligado enquanto a fila tem algo
 * em voo ou esperando (sem nada pendente, a página fica sem o ouvinte). Devolve o "parar de vigiar".
 */
export function vigiarSaida(fila: Pick<Fila<Valor, unknown>, "algoPendente" | "assinar">, janela: JanelaComSaida): () => void {
  let ligado = false;
  const ouvinte = (e: BeforeUnloadEvent) => {
    if (!fila.algoPendente()) return;
    e.preventDefault();
    // os navegadores antigos pedem o returnValue (o texto não aparece: cada navegador mostra a frase dele)
    e.returnValue = "";
  };
  const conferir = () => {
    const pendente = fila.algoPendente();
    if (pendente && !ligado) janela.addEventListener("beforeunload", ouvinte);
    if (!pendente && ligado) janela.removeEventListener("beforeunload", ouvinte);
    ligado = pendente;
  };
  const parar = fila.assinar(conferir);
  conferir();
  return () => {
    parar();
    if (ligado) janela.removeEventListener("beforeunload", ouvinte);
    ligado = false;
  };
}
