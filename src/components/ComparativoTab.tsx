import { useState, useEffect } from "react";
import jsPDF from "jspdf";
import { MedidasCorporais, medidasVazias } from "@/types/medidas";
import { classificarGordura, calcularTMBMifflin, calcularTMBKatch } from "@/utils/composicaoCorporal";
import MedidasForm from "@/components/MedidasForm";
import {
  desenharCabecalho, desenharTituloSecao, desenharCard,
  desenharRodape, novaPagina, limparTexto, corDelta, textoDelta,
  TEMA, setTextColor,
} from "@/utils/gerarRelatorio";
import { agoraFormatado } from "@/utils/formatDate";
import { salvarComparativo, carregarComparativo, limparComparativo } from "@/utils/storageComparativo";

interface RefData {
  nome: string;
  data: string;
  peso: number | '';
  pctGordura: number | '';
  medidas: MedidasCorporais;
}

interface NovoData {
  data: string;
  peso: number | '';
  pctGordura: number | '';
  medidas: MedidasCorporais;
}

interface DadosComuns {
  sexo: 'M' | 'F';
  idade: number | '';
  altura: number | '';
}

const REF_VAZIO: RefData = { nome: '', data: '', peso: '', pctGordura: '', medidas: { ...medidasVazias } };
const NOVO_VAZIO: NovoData = { data: '', peso: '', pctGordura: '', medidas: { ...medidasVazias } };
const DADOS_VAZIOS: DadosComuns = { sexo: 'M', idade: '', altura: '' };

function DeltaBadge({ delta, dec, inverter }: { delta: number; dec: number; inverter: boolean }) {
  const positivo = inverter ? delta < 0 : delta > 0;
  const cls = delta === 0
    ? 'bg-muted text-muted-foreground'
    : positivo
      ? 'bg-[rgba(34,197,94,0.12)] text-[#22c55e]'
      : 'bg-[rgba(239,68,68,0.12)] text-[#ef4444]';
  const sinal = delta > 0 ? '▲ +' : delta < 0 ? '▼ ' : '= ';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold ${cls}`}>
      {sinal}{Math.abs(delta).toFixed(dec)}
    </span>
  );
}

function ComposicaoPreview({ peso, pct, sexo, idade, variante }: {
  peso: number | '';
  pct: number | '';
  sexo: 'M' | 'F';
  idade: number | '';
  variante: 'ref' | 'novo';
}) {
  if (!peso || !pct) return null;
  const mg = (peso as number) * (pct as number) / 100;
  const mm = (peso as number) - mg;
  const cls = classificarGordura(pct as number, sexo, (idade as number) || 25);

  return (
    <div className="mt-4 p-3 rounded border border-muted-foreground/20 bg-background/50">
      <p className="text-[9px] font-bold tracking-[0.12em] uppercase text-muted-foreground mb-2">
        {variante === 'ref' ? 'Prévia (referência)' : 'Prévia (atual)'}
      </p>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-[10px] text-muted-foreground font-body">Massa Gorda</p>
          <p className="font-heading text-sm text-foreground">{mg.toFixed(1)} kg</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground font-body">Massa Magra</p>
          <p className="font-heading text-sm text-foreground">{mm.toFixed(1)} kg</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground font-body">Classificação</p>
          <p className="font-heading text-sm" style={{ color: cls.cor }}>{cls.label}</p>
        </div>
      </div>
    </div>
  );
}

const MEDIDAS_CONFIG = [
  { label: 'Pescoço', key: 'pescoco' as keyof MedidasCorporais, inv: false },
  { label: 'Ombro', key: 'ombro' as keyof MedidasCorporais, inv: false },
  { label: 'Peitoral', key: 'peitoral' as keyof MedidasCorporais, inv: false },
  { label: 'Cintura', key: 'cintura' as keyof MedidasCorporais, inv: true },
  { label: 'Abdômen', key: 'abdomen' as keyof MedidasCorporais, inv: true },
  { label: 'Quadril', key: 'quadril' as keyof MedidasCorporais, inv: true },
  { label: 'Braço D', key: 'bracoD' as keyof MedidasCorporais, inv: false },
  { label: 'Braço E', key: 'bracoE' as keyof MedidasCorporais, inv: false },
  { label: 'Antebraço D', key: 'antebracoD' as keyof MedidasCorporais, inv: false },
  { label: 'Antebraço E', key: 'antebracoE' as keyof MedidasCorporais, inv: false },
  { label: 'Coxa D', key: 'coxaD' as keyof MedidasCorporais, inv: false },
  { label: 'Coxa E', key: 'coxaE' as keyof MedidasCorporais, inv: false },
  { label: 'Panturrilha D', key: 'panturrilhaD' as keyof MedidasCorporais, inv: false },
  { label: 'Panturrilha E', key: 'panturrilhaE' as keyof MedidasCorporais, inv: false },
];

function RelatorioComparativo({ refD, novo, dados }: { refD: RefData; novo: NovoData; dados: DadosComuns }) {
  const { sexo, idade, altura } = dados;
  const idadeN = (idade as number) || 25;
  const alturaN = (altura as number) || 170;
  const refPeso = (refD.peso as number) || 0;
  const novoPeso = (novo.peso as number) || 0;
  const refPct = (refD.pctGordura as number) || 0;
  const novoPct = (novo.pctGordura as number) || 0;

  const refMg = refPeso * refPct / 100;
  const refMm = refPeso - refMg;
  const novoMg = novoPeso * novoPct / 100;
  const novoMm = novoPeso - novoMg;
  const refCls = classificarGordura(refPct, sexo, idadeN);
  const novoCls = classificarGordura(novoPct, sexo, idadeN);
  const refTmbM = calcularTMBMifflin(refPeso, alturaN, idadeN, sexo);
  const novoTmbM = calcularTMBMifflin(novoPeso, alturaN, idadeN, sexo);
  const refTmbK = calcularTMBKatch(refMm);
  const novoTmbK = calcularTMBKatch(novoMm);

  const medidasAtivas = MEDIDAS_CONFIG.filter(m =>
    (refD.medidas[m.key] !== '' && refD.medidas[m.key] !== 0) ||
    (novo.medidas[m.key] !== '' && novo.medidas[m.key] !== 0)
  );

  const gerarPDF = () => {
    const doc = new jsPDF();
    const W = doc.internal.pageSize.getWidth();
    const nome = limparTexto(refD.nome.trim() || 'Aluno');

    let y = desenharCabecalho(
      doc,
      'Comparativo',
      `${nome} - ${sexo === 'M' ? 'Masculino' : 'Feminino'}, ${idadeN} anos, ${alturaN} cm - ${agoraFormatado({ incluirHora: false })}`
    );

    y = desenharTituloSecao(doc, 'Composicao Corporal', y);

    const compRows = [
      { lbl: 'Peso', r: `${refPeso.toFixed(1)} kg`, n: `${novoPeso.toFixed(1)} kg`, d: novoPeso - refPeso, inv: false },
      { lbl: '% Gordura', r: `${refPct.toFixed(1)}%`, n: `${novoPct.toFixed(1)}%`, d: novoPct - refPct, inv: true },
      { lbl: 'Massa Gorda', r: `${refMg.toFixed(1)} kg`, n: `${novoMg.toFixed(1)} kg`, d: novoMg - refMg, inv: true },
      { lbl: 'Massa Magra', r: `${refMm.toFixed(1)} kg`, n: `${novoMm.toFixed(1)} kg`, d: novoMm - refMm, inv: false },
      { lbl: 'TMB Mifflin', r: `${refTmbM} kcal`, n: `${novoTmbM} kcal`, d: novoTmbM - refTmbM, inv: false },
      { lbl: 'TMB Katch', r: `${refTmbK} kcal`, n: `${novoTmbK} kcal`, d: novoTmbK - refTmbK, inv: false },
    ];

    const hW = (W - 28 - 8) / 3;
    for (const row of compRows) {
      if (y > 260) { y = novaPagina(doc); }
      const cor = corDelta(row.d, row.inv);
      desenharCard(doc, row.lbl, `${row.r} -> ${row.n}`, 14, y, W - 28 - hW - 4, 16);
      desenharCard(doc, 'Variacao', textoDelta(row.d), 14 + W - 28 - hW, y, hW, 16, cor);
      y += 20;
    }

    desenharCard(doc, 'Classificacao Anterior', limparTexto(refCls.label), 14, y, (W - 28 - 4) / 2, 16, refCls.cor);
    desenharCard(doc, 'Classificacao Atual', limparTexto(novoCls.label), 14 + (W - 28 - 4) / 2 + 4, y, (W - 28 - 4) / 2, 16, novoCls.cor);
    y += 22;

    if (medidasAtivas.length > 0) {
      if (y > 220) { y = novaPagina(doc); }
      y = desenharTituloSecao(doc, 'Medidas Corporais (cm)', y);

      const mW = (W - 28 - 8) / 3;
      for (const m of medidasAtivas) {
        if (y > 260) { y = novaPagina(doc); }
        const vRef = refD.medidas[m.key];
        const vNovo = novo.medidas[m.key];
        const hasValues = vRef !== '' && vNovo !== '';
        const delta = hasValues ? (vNovo as number) - (vRef as number) : 0;
        const cor = hasValues ? corDelta(delta, m.inv) : TEMA.cinzaMedio;

        desenharCard(doc, m.label, `${vRef !== '' ? (vRef as number).toFixed(1) : '-'} -> ${vNovo !== '' ? (vNovo as number).toFixed(1) : '-'}`, 14, y, W - 28 - mW - 4, 16);
        desenharCard(doc, 'Var', hasValues ? textoDelta(delta) : '-', 14 + W - 28 - mW, y, mW, 16, cor);
        y += 20;
      }
    }

    desenharRodape(doc, 'Gallagher et al. (2000) | ACE | Lohman (1993) | ACSM');

    const safeName = nome.replace(/[^a-zA-Z0-9 ]/g, "");
    doc.save(`Comparativo ${safeName}.pdf`);
  };

  return (
    <div className="result-card mt-6">
      <div className="flex justify-between items-start mb-5 pb-4 border-b border-muted-foreground/20">
        <div>
          <p className="text-xs font-bold tracking-[0.14em] uppercase text-primary font-heading">📄 Relatório Comparativo</p>
          <p className="text-[9px] text-muted-foreground font-body mt-1">
            {refD.nome || 'Sem nome'} · {sexo === 'M' ? 'Masculino' : 'Feminino'}, {idadeN} anos
            {refD.data && ` · Ref: ${refD.data}`}
            {novo.data && ` → Atual: ${novo.data}`}
          </p>
          <p className="text-[8px] text-muted-foreground/60 font-body mt-0.5">Calculadora manual — sem vínculo com perfil do app</p>
        </div>
        <button
          onClick={gerarPDF}
          className="px-3 py-1.5 bg-muted border border-muted-foreground/20 rounded text-[10px] text-muted-foreground font-semibold uppercase tracking-wider hover:text-primary hover:border-primary/30 transition-colors"
        >
          ⬇ PDF
        </button>
      </div>

      <table className="w-full text-[11px] border-collapse">
        <thead>
          <tr className="border-b border-muted-foreground/20">
            <th className="text-left py-2 px-2 text-[9px] text-muted-foreground uppercase tracking-widest font-bold">Métrica</th>
            <th className="text-left py-2 px-2 text-[9px] text-muted-foreground uppercase tracking-widest font-bold">Anterior</th>
            <th className="text-left py-2 px-2 text-[9px] text-muted-foreground uppercase tracking-widest font-bold">Atual</th>
            <th className="text-left py-2 px-2 text-[9px] text-muted-foreground uppercase tracking-widest font-bold">Variação</th>
          </tr>
        </thead>
        <tbody>
          <tr><td colSpan={4} className="py-2 px-2 text-[9px] font-bold tracking-[0.12em] uppercase text-muted-foreground/60 border-b border-muted-foreground/20 bg-muted/50">COMPOSIÇÃO CORPORAL</td></tr>

          {[
            { lbl: 'Peso', r: `${refPeso.toFixed(1)} kg`, n: `${novoPeso.toFixed(1)} kg`, d: novoPeso - refPeso, dec: 1, inv: false },
            { lbl: '% Gordura', r: `${refPct.toFixed(1)}%`, n: `${novoPct.toFixed(1)}%`, d: novoPct - refPct, dec: 1, inv: true },
            { lbl: 'Massa Gorda', r: `${refMg.toFixed(1)} kg`, n: `${novoMg.toFixed(1)} kg`, d: novoMg - refMg, dec: 1, inv: true },
            { lbl: 'Massa Magra', r: `${refMm.toFixed(1)} kg`, n: `${novoMm.toFixed(1)} kg`, d: novoMm - refMm, dec: 1, inv: false },
            { lbl: 'TMB Mifflin', r: `${refTmbM.toLocaleString()} kcal`, n: `${novoTmbM.toLocaleString()} kcal`, d: novoTmbM - refTmbM, dec: 0, inv: false },
            { lbl: 'TMB Katch', r: `${refTmbK.toLocaleString()} kcal`, n: `${novoTmbK.toLocaleString()} kcal`, d: novoTmbK - refTmbK, dec: 0, inv: false },
          ].map(row => (
            <tr key={row.lbl} className="border-b border-muted-foreground/10">
              <td className="py-2.5 px-2 text-[10px] text-muted-foreground uppercase tracking-wider">{row.lbl}</td>
              <td className="py-2.5 px-2 text-muted-foreground">{row.r}</td>
              <td className="py-2.5 px-2 text-foreground font-semibold">{row.n}</td>
              <td className="py-2.5 px-2"><DeltaBadge delta={row.d} dec={row.dec} inverter={row.inv} /></td>
            </tr>
          ))}

          <tr className="border-b border-muted-foreground/10">
            <td className="py-2.5 px-2 text-[10px] text-muted-foreground uppercase tracking-wider">Classificação</td>
            <td className="py-2.5 px-2 font-semibold" style={{ color: refCls.cor }}>{refCls.label}</td>
            <td className="py-2.5 px-2 font-semibold" style={{ color: novoCls.cor }}>{novoCls.label}</td>
            <td className="py-2.5 px-2 text-[10px] text-muted-foreground">
              {novoCls.label === refCls.label ? '— mesmo nível' : '✓ mudou nível'}
            </td>
          </tr>

          {medidasAtivas.length > 0 && (
            <>
              <tr>
                <td colSpan={4} className="py-2 px-2 text-[9px] font-bold tracking-[0.12em] uppercase text-muted-foreground/60 border-b border-muted-foreground/20 bg-muted/50">
                  MEDIDAS CORPORAIS (cm)
                </td>
              </tr>
              {medidasAtivas.map(m => {
                const vRef = refD.medidas[m.key];
                const vNovo = novo.medidas[m.key];
                const delta = (vRef !== '' && vNovo !== '') ? (vNovo as number) - (vRef as number) : null;
                return (
                  <tr key={m.key} className="border-b border-muted-foreground/10 last:border-b-0">
                    <td className="py-2.5 px-2 text-[10px] text-muted-foreground uppercase tracking-wider">{m.label}</td>
                    <td className="py-2.5 px-2 text-muted-foreground">{vRef !== '' ? `${(vRef as number).toFixed(1)} cm` : '—'}</td>
                    <td className="py-2.5 px-2 text-foreground font-semibold">{vNovo !== '' ? `${(vNovo as number).toFixed(1)} cm` : '—'}</td>
                    <td className="py-2.5 px-2">
                      {delta != null
                        ? <DeltaBadge delta={delta} dec={1} inverter={m.inv} />
                        : <span className="text-muted-foreground/40">—</span>}
                    </td>
                  </tr>
                );
              })}
            </>
          )}
        </tbody>
      </table>

      <p className="mt-4 text-[8px] text-muted-foreground/50 font-body italic leading-relaxed">
        * Cálculo baseado nos dados inseridos manualmente. Não vinculado a nenhuma conta do PhysiqCalc.<br/>
        * Classificação: Gallagher et al. (2000) Am J Clin Nutr 72:694–701 | ACE | Lohman TG (1993) | ACSM<br/>
        * Variação das medidas: ▲ aumento · ▼ redução · verde = melhora esperada · vermelho = piora esperada
      </p>
    </div>
  );
}

const ComparativoTab = () => {
  const [refData, setRefData] = useState<RefData>({ ...REF_VAZIO });
  const [novoData, setNovoData] = useState<NovoData>({ ...NOVO_VAZIO });
  const [dadosComuns, setDadosComuns] = useState<DadosComuns>({ ...DADOS_VAZIOS });
  const [relatorioVisivel, setRelatorioVisivel] = useState(false);

  // Restore saved data on mount
  useEffect(() => {
    const saved = carregarComparativo();
    if (saved) {
      setRefData(saved.refData);
      setNovoData(saved.novoData);
      setDadosComuns(saved.dadosComuns);
    }
  }, []);

  // Auto-save on changes
  useEffect(() => {
    salvarComparativo({ refData, novoData, dadosComuns });
  }, [refData, novoData, dadosComuns]);

  const handleLimpar = () => {
    limparComparativo();
    setRefData({ ...REF_VAZIO });
    setNovoData({ ...NOVO_VAZIO });
    setDadosComuns({ ...DADOS_VAZIOS });
    setRelatorioVisivel(false);
  };

  const inputClass = "w-full bg-transparent border-b border-muted-foreground/20 py-2 text-foreground text-[16px] outline-none focus:border-primary transition-colors";
  const labelClass = "text-[10px] font-semibold tracking-[0.12em] uppercase text-muted-foreground block mb-1.5";

  return (
    <section className="py-16 sm:py-24">
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-heading text-2xl sm:text-3xl text-foreground">
          Comparativo
        </h2>
        <button
          onClick={handleLimpar}
          className="px-3 py-1.5 border border-muted-foreground/20 rounded text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:border-primary hover:text-primary transition-colors"
        >
          🗑 Limpar dados
        </button>
      </div>

      <p className="text-xs text-muted-foreground font-body leading-relaxed mb-6 result-card border-primary/20">
        <strong className="text-primary">ℹ️ Como usar:</strong> Preencha os dados anteriores e os dados atuais.
        O admin insere os dois conjuntos manualmente. Nenhum dado é salvo no servidor. Dados persistem por 24h no navegador.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <div className="result-card">
          <p className="text-xs font-bold tracking-[0.14em] uppercase text-muted-foreground mb-4 font-heading">
            📌 Dados Anteriores (referência)
          </p>
          <div className="mb-4">
            <label className={labelClass}>Nome</label>
            <input type="text" value={refData.nome} onChange={e => setRefData({ ...refData, nome: e.target.value })} placeholder="ex: Lucas" className={inputClass} />
          </div>
          <div className="mb-4">
            <label className={labelClass}>Data (opcional)</label>
            <input type="date" value={refData.data} onChange={e => setRefData({ ...refData, data: e.target.value })} className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className={labelClass}>Peso (kg)</label>
              <input type="number" step="0.1" value={refData.peso} onChange={e => setRefData({ ...refData, peso: e.target.value === '' ? '' : +e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>% Gordura</label>
              <input type="number" step="0.1" value={refData.pctGordura} onChange={e => setRefData({ ...refData, pctGordura: e.target.value === '' ? '' : +e.target.value })} className={inputClass} />
            </div>
          </div>
          <MedidasForm medidas={refData.medidas} onChange={m => setRefData({ ...refData, medidas: m })} colunas={2} />
          <ComposicaoPreview peso={refData.peso} pct={refData.pctGordura} sexo={dadosComuns.sexo} idade={dadosComuns.idade} variante="ref" />
        </div>

        <div className="result-card">
          <p className="text-xs font-bold tracking-[0.14em] uppercase text-primary mb-4 font-heading">
            📅 Dados Atuais (novos)
          </p>
          <div className="mb-4">
            <label className={labelClass}>Data (opcional)</label>
            <input type="date" value={novoData.data} onChange={e => setNovoData({ ...novoData, data: e.target.value })} className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className={labelClass}>Peso (kg)</label>
              <input type="number" step="0.1" value={novoData.peso} onChange={e => setNovoData({ ...novoData, peso: e.target.value === '' ? '' : +e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>% Gordura</label>
              <input type="number" step="0.1" value={novoData.pctGordura} onChange={e => setNovoData({ ...novoData, pctGordura: e.target.value === '' ? '' : +e.target.value })} className={inputClass} />
            </div>
          </div>
          <MedidasForm medidas={novoData.medidas} onChange={m => setNovoData({ ...novoData, medidas: m })} colunas={2} />
          <ComposicaoPreview peso={novoData.peso} pct={novoData.pctGordura} sexo={dadosComuns.sexo} idade={dadosComuns.idade} variante="novo" />
        </div>
      </div>

      <div className="mt-5 result-card">
        <p className="text-[10px] font-bold tracking-[0.12em] uppercase text-muted-foreground/60 mb-3 font-heading">
          Dados para cálculo de TMB (usados nos dois lados)
        </p>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>Sexo</label>
            <select value={dadosComuns.sexo} onChange={e => setDadosComuns({ ...dadosComuns, sexo: e.target.value as 'M' | 'F' })} className={inputClass}>
              <option value="M">Masculino</option>
              <option value="F">Feminino</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Idade (anos)</label>
            <input type="number" value={dadosComuns.idade} onChange={e => setDadosComuns({ ...dadosComuns, idade: e.target.value === '' ? '' : +e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Altura (cm)</label>
            <input type="number" value={dadosComuns.altura} onChange={e => setDadosComuns({ ...dadosComuns, altura: e.target.value === '' ? '' : +e.target.value })} className={inputClass} />
          </div>
        </div>
      </div>

      <button
        onClick={() => setRelatorioVisivel(true)}
        className="w-full mt-5 py-3 bg-primary text-primary-foreground font-bold text-[12px] uppercase tracking-wider rounded transition-all hover:bg-primary/90"
      >
        📄 Gerar Relatório Comparativo
      </button>

      {relatorioVisivel && (
        <RelatorioComparativo refD={refData} novo={novoData} dados={dadosComuns} />
      )}
    </section>
  );
};

export default ComparativoTab;
