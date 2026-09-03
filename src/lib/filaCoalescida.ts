/**
 * Fila de gravações com coalescência por alvo — a UI muda na hora (otimista) e a rede corre atrás.
 *
 * - só UMA gravação em voo por vez (respostas nunca chegam fora de ordem);
 * - vários cliques no mesmo alvo enquanto há gravação em voo viram UMA gravação com o último valor;
 * - re-enfileirar um alvo o move pro FIM: a ordem cronológica da intenção do usuário é preservada
 *   ("aplicar a todos" depois de um "+" não é engolido pelo "+" antigo);
 * - erro: descarta o que estava na fila e chama `aoErro` (quem usa recarrega do servidor);
 * - `aoEsvaziar` roda quando a fila esvazia e nada está em voo — hora segura de aplicar uma leitura do servidor.
 */
export interface FilaCoalescida<T> {
  /** agenda a gravação do alvo; substitui a pendente do mesmo alvo (e a move pro fim) */
  enfileirar(chave: string, item: T): void;
  /** há gravação em voo? */
  emVoo(): boolean;
  /** quantas gravações aguardam */
  pendentes(): number;
  /** nada em voo e nada pendente */
  ociosa(): boolean;
}

export interface OpcoesFila<T> {
  executar: (item: T) => Promise<void>;
  aoErro?: (item: T, erro: unknown) => void | Promise<void>;
  aoEsvaziar?: () => void;
  /** true ao começar uma gravação, false ao terminar */
  aoMudarEstado?: (emVoo: boolean) => void;
}

export function criarFilaCoalescida<T>(opts: OpcoesFila<T>): FilaCoalescida<T> {
  const fila = new Map<string, T>();
  let voando = false;

  const processar = async (): Promise<void> => {
    if (voando) return;
    const prox = fila.entries().next();
    if (prox.done) {
      opts.aoEsvaziar?.();
      return;
    }
    const [chave, item] = prox.value;
    fila.delete(chave);
    voando = true;
    opts.aoMudarEstado?.(true);
    try {
      await opts.executar(item);
    } catch (erro) {
      fila.clear();
      await opts.aoErro?.(item, erro);
    } finally {
      voando = false;
      opts.aoMudarEstado?.(false);
      void processar();
    }
  };

  return {
    enfileirar(chave, item) {
      fila.delete(chave);
      fila.set(chave, item);
      void processar();
    },
    emVoo: () => voando,
    pendentes: () => fila.size,
    ociosa: () => !voando && fila.size === 0,
  };
}
