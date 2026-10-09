import { useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { POR_PAGINA, ultimaPagina } from "@/lib/paginacao";

/**
 * A página da lista no endereço (hml-14b, B21 · D13): `?pagina=N` (ou a chave própria quando a tela tem 2 listas, ex.
 * `pagina_recibos`), gravada com `replace` — abrir um item e voltar mantém a página, e o Voltar do navegador não passa
 * página por página. A 1ª página não aparece no endereço.
 * - `filtro`: o que filtra a lista (busca, período, situação…). Mudou → volta à 1 (o endereço que já chega com
 *   `?pagina=3` vale na 1ª montagem).
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
  const pagina = Number.isFinite(lida) && lida >= 1 ? lida : 1;

  const irPara = useCallback(
    (n: number) =>
      setSp(
        (atual) => {
          const prox = new URLSearchParams(atual);
          if (!Number.isFinite(n) || n <= 1) prox.delete(chave);
          else prox.set(chave, String(Math.floor(n)));
          return prox;
        },
        { replace: true },
      ),
    [chave, setSp],
  );

  const assinatura = JSON.stringify(filtro ?? null);
  const filtroAnterior = useRef(assinatura);
  // no mesmo render em que o filtro muda a página já é a 1 (a consulta não sai com a página velha e o filtro novo)
  const filtroMudou = filtroAnterior.current !== assinatura;
  const efetiva = filtroMudou ? 1 : pagina;
  useEffect(() => {
    if (!filtroMudou) return;
    filtroAnterior.current = assinatura;
    irPara(1);
  }, [filtroMudou, assinatura, irPara]);

  useEffect(() => {
    if (total == null) return;
    const ultima = ultimaPagina(total, porPagina);
    if (efetiva > ultima) irPara(ultima);
  }, [total, efetiva, porPagina, irPara]);

  return { pagina: efetiva, irPara };
}
