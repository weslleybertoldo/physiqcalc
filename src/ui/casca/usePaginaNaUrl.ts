import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { POR_PAGINA, ultimaPagina } from "@/lib/paginacao";

/** O endereço de agora. O `setSearchParams` do react-router monta o próximo endereço a partir do render ANTERIOR: 2 escritas
 * no mesmo commit (a da tela, que grava o filtro, e a daqui, que grava a página) se atropelam e vale a última. No navegador
 * (BrowserRouter: o `history.state` tem o `idx` dele) o `window.location` já tem a escrita anterior; nos testes
 * (MemoryRouter) fica o do render. */
function enderecoDeAgora(doRender: URLSearchParams): URLSearchParams {
  const estado = typeof window === "undefined" ? null : (window.history.state as { idx?: unknown } | null);
  return typeof estado?.idx === "number" ? new URLSearchParams(window.location.search) : new URLSearchParams(doRender);
}

/**
 * A página da lista no endereço (hml-14b, B21 · D13): `?pagina=N` (ou a chave própria quando a tela tem 2 listas, ex.
 * `pagina_recibos`), gravada com `replace` — abrir um item e voltar mantém a página, e o Voltar do navegador não passa
 * página por página. A 1ª página não aparece no endereço.
 * - `filtro`: o que filtra a lista (busca, período, situação…). Mudou → página 1 já no mesmo render, e o `?pagina=` velho sai
 *   do endereço (de novo, se outra escrita do mesmo commit o trouxer de volta). O endereço que chega com `?pagina=3` vale na
 *   1ª montagem.
 * - `total`: quando a resposta chega e a página passou do fim (a lista encolheu, endereço antigo) → vai para a última.
 */
export function usePaginaNaUrl({
  chave = "pagina",
  filtro,
  total,
  porPagina = POR_PAGINA,
}: { chave?: string; filtro?: unknown; total?: number | null; porPagina?: number } = {}) {
  const [sp, setSp] = useSearchParams();
  const lida = Number.parseInt(sp.get(chave) ?? "", 10);
  const naUrl = Number.isFinite(lida) && lida >= 1 ? lida : 1;

  const assinatura = JSON.stringify(filtro ?? null);
  const assinaturaAtual = useRef(assinatura);
  assinaturaAtual.current = assinatura;
  // a página do endereço vale para o filtro com que foi escolhida
  const [validaPara, setValidaPara] = useState(assinatura);
  const pagina = validaPara === assinatura ? naUrl : 1;

  const gravar = useCallback(
    (n: number) =>
      setSp(
        (doRender) => {
          const prox = enderecoDeAgora(doRender);
          if (!Number.isFinite(n) || n <= 1) prox.delete(chave);
          else prox.set(chave, String(Math.floor(n)));
          return prox;
        },
        { replace: true },
      ),
    [chave, setSp],
  );

  const irPara = useCallback(
    (n: number) => {
      setValidaPara(assinaturaAtual.current);
      gravar(n);
    },
    [gravar],
  );

  // filtro novo com um número velho no endereço → tira (o `gravar` muda a cada endereço novo: se uma escrita da tela no mesmo
  // commit trouxer o número de volta, roda de novo)
  const velhoNoEndereco = validaPara !== assinatura && naUrl > 1;
  useEffect(() => {
    if (velhoNoEndereco) gravar(1);
  }, [velhoNoEndereco, gravar]);

  useEffect(() => {
    if (total == null) return;
    const ultima = ultimaPagina(total, porPagina);
    if (pagina > ultima) irPara(ultima);
  }, [total, pagina, porPagina, irPara]);

  return { pagina, irPara };
}
