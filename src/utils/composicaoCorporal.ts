export interface ClassificacaoGordura {
  label: 'Gordura Essencial' | 'Atleta' | 'Boa Forma' | 'Aceitável' | 'Obesidade';
  cor: string;
  descricao: string;
  ajuste: number;
}

export function classificarGordura(pct: number, sexo: 'M' | 'F', idade: number): ClassificacaoGordura {
  let ajuste = 0;
  if (idade >= 40 && idade < 60) ajuste = 2;
  else if (idade >= 60) ajuste = 4;
  const p = pct - ajuste;

  if (sexo === 'F') {
    if (pct < 10)  return { label: 'Gordura Essencial', cor: '#ef4444', descricao: 'Abaixo do mínimo vital para saúde', ajuste };
    if (p <= 20)   return { label: 'Atleta',            cor: '#22c55e', descricao: 'Nível atlético — excelente condição', ajuste };
    if (p <= 24)   return { label: 'Boa Forma',         cor: '#4ade80', descricao: 'Excelente condição física', ajuste };
    if (p <= 31)   return { label: 'Aceitável',         cor: '#facc15', descricao: 'Dentro da faixa saudável', ajuste };
    return                 { label: 'Obesidade',         cor: '#f97316', descricao: 'Risco à saúde elevado', ajuste };
  } else {
    if (pct < 5)   return { label: 'Gordura Essencial', cor: '#ef4444', descricao: 'Abaixo do mínimo vital para saúde', ajuste };
    if (p <= 13)   return { label: 'Atleta',            cor: '#22c55e', descricao: 'Nível atlético — excelente condição', ajuste };
    if (p <= 17)   return { label: 'Boa Forma',         cor: '#4ade80', descricao: 'Excelente condição física', ajuste };
    if (p <= 24)   return { label: 'Aceitável',         cor: '#facc15', descricao: 'Dentro da faixa saudável', ajuste };
    return                 { label: 'Obesidade',         cor: '#f97316', descricao: 'Risco à saúde elevado', ajuste };
  }
}

export function calcularTMBMifflin(peso: number, altura: number, idade: number, sexo: 'M' | 'F'): number {
  if (sexo === 'M') return Math.round(10 * peso + 6.25 * altura - 5 * idade + 5);
  return Math.round(10 * peso + 6.25 * altura - 5 * idade - 161);
}

export function calcularTMBKatch(massaMagra: number): number {
  return Math.round(370 + 21.6 * massaMagra);
}
