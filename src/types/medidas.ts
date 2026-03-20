export interface MedidasCorporais {
  pescoco: number | '';
  ombro: number | '';
  peitoral: number | '';
  cintura: number | '';
  abdomen: number | '';
  quadril: number | '';
  bracoD: number | '';
  bracoE: number | '';
  antebracoD: number | '';
  antebracoE: number | '';
  coxaD: number | '';
  coxaE: number | '';
  panturrilhaD: number | '';
  panturrilhaE: number | '';
}

export const medidasVazias: MedidasCorporais = {
  pescoco: '', ombro: '', peitoral: '', cintura: '', abdomen: '', quadril: '',
  bracoD: '', bracoE: '', antebracoD: '', antebracoE: '',
  coxaD: '', coxaE: '', panturrilhaD: '', panturrilhaE: '',
};
