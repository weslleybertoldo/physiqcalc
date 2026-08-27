import { describe, expect, it } from 'vitest';
import { chaveParaConcluido, contarDiasTreinados, diasTreinados } from './contagemTreinos';

describe('contagemTreinos — conta dias, não sessões', () => {
  it('2 treinos no mesmo dia contam 1', () => {
    const rows = [
      { data_treino: '2026-08-27', slot_idx: 0 },
      { data_treino: '2026-08-27', slot_idx: 1 },
    ];
    expect(contarDiasTreinados(rows)).toBe(1);
  });

  it('dias distintos somam normalmente', () => {
    const rows = [
      { data_treino: '2026-08-25' },
      { data_treino: '2026-08-26' },
      { data_treino: '2026-08-27' },
      { data_treino: '2026-08-27' },
    ];
    expect(contarDiasTreinados(rows)).toBe(3);
    expect([...diasTreinados(rows)].sort()).toEqual(['2026-08-25', '2026-08-26', '2026-08-27']);
  });

  it('lista vazia = 0 e ignora linhas sem data', () => {
    expect(contarDiasTreinados([])).toBe(0);
    expect(contarDiasTreinados([{ data_treino: '' }, { data_treino: undefined as unknown as string }])).toBe(0);
  });

  it('chave local "data|slot" vira {data_treino} e deduplica com o servidor', () => {
    expect(chaveParaConcluido('2026-08-27|1')).toEqual({ data_treino: '2026-08-27' });
    const servidor = [{ data_treino: '2026-08-27' }];
    const local = ['2026-08-27|1', '2026-08-28|0'].map(chaveParaConcluido);
    expect(contarDiasTreinados([...servidor, ...local])).toBe(2);
  });
});
