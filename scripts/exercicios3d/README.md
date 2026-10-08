# Fábrica dos exercícios 3D (Physiq)

Gera o boneco 3D único do app e, por exercício, o movimento + equipamento + foto parada que o visualizador da
ficha toca (`src/lib/visualizador3d/`). Tudo roda no PC (WSL/Linux), por script, sem abrir a tela do Blender.

Desenho aprovado: `docs/superpowers/specs/2026-10-04-visualizador-3d-design.md`.

## Instalar (1 vez)

```bash
# Blender 5.2.2 portátil (conferir o sha256 antes de abrir)
mkdir -p ~/.local/blender && cd ~/.local/blender
curl -sSO https://download.blender.org/release/Blender5.2/blender-5.2.2-linux-x64.tar.xz
curl -s https://download.blender.org/release/Blender5.2/blender-5.2.2.sha256 | grep linux-x64 | sha256sum -c && tar -xf blender-5.2.2-linux-x64.tar.xz

# MPFB 2.0.17 (MakeHuman pro Blender; código GPL, assets CC0)
curl -sSL -o mpfb-2.0.17.zip "https://extensions.blender.org/download/sha256:4f0a879d64a39bf646fbf5f53601ac678855da329d650617dca5737548239a87/add-on-mpfb-v2.0.17.zip?repository=%2Fapi%2Fv1%2Fextensions%2F&blender_version_min=4.2.0"
./blender-5.2.2-linux-x64/blender -b --command extension install-file -r user_default -e mpfb-2.0.17.zip

# Assets CC0 do MakeHuman (cabelo, sobrancelhas…) na pasta de dados do usuário do MPFB
curl -sSLO https://files.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip
unzip -q makehuman_system_assets_cc0.zip -d ~/.config/blender/5.2/extensions/.user/user_default/mpfb/data/

# Python das texturas (fora do Blender)
cd <repo>/scripts/exercicios3d && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
```

Variáveis (opcionais): `BLENDER` (padrão `~/.local/blender/blender-5.2.2-linux-x64/blender`) e `EX3D_PY`
(padrão `scripts/exercicios3d/.venv/bin/python`). Caminhos em `lib/config.py`.

## Gerar as texturas da anatomia (1 vez, ou ao mexer em `lib/musculos_def.py`)

```bash
cd scripts/exercicios3d
$BLENDER -b -P exportar_malha.py -- tex/malha.npz     # malha de repouso do corpo atlético (~3 s)
.venv/bin/python lib/anatomia_tex.py base              # tex/anat_*.png + tex/anat_grupo.npy (~30 s)
$BLENDER -b -P ver_anatomia.py -- /tmp/anat 300 400 4  # prova: "ANATOMIA pronta" + frente/costas/lado
```

`tex/` é gerado e fica fora do git. As máscaras de músculo (`tex/alvo_*.png`) saem sozinhas quando uma cena pede.

## Peças

| Arquivo | O que faz |
|---|---|
| `lib/boneco3d.py` | boneco MakeHuman (MPFB) com o esqueleto do Mixamo, estúdio de luz, câmera, render |
| `lib/anatomia3d.py` | corpo atlético + músculos por textura + relevo (visual v4) + alvo/auxiliares em vermelho |
| `lib/anatomia_tex.py` + `lib/musculos_def.py` | desenha os músculos na textura do corpo (roda no `.venv`) |
| `lib/cabelo3d.py` | cabelo curto e sobrancelhas (assets CC0) em cinza |
| `lib/poses3d.py` | IK, giro de osso no mundo, dedos, utilidades de pose |
| `lib/pegada3d.py` | mão fechando em volta da barra com ângulos medidos de pegada real |
| `lib/polegar3d.py` | polegar dando a volta na barra (modo opcional `polegar_modo="volta"`, só exercícios novos): eixos anatômicos, pele por LBS, busca — testes em `test_polegar.py` |
| `lib/equip3d.py` | barra, anilhas, caixas e tubos dos equipamentos; polia (`polia()`: estação de cabo com torre, roldana e o cabo que gira e estica até o engate — marca `anima_escala`, a única peça com escala no GLB; acessório `barra_polia()` + `por_acessorio()`; `polia(gira=True)`: o garfo da roldana gira em volta do cabo que desce e fica virado pro cabo na diagonal, até ±90° — `PoliaGiratoria`; acessórios `corda_polia()` e `puxador_polia()`, o puxador D com pegador, aro e engate); `apoio_nordico()`: prancha da flexão nórdica (almofada dos joelhos numa chapa no chão e 2 rolos em cima dos calcanhares num poste entre as pernas — almofada e rolos são apoio, a estrutura não encosta); `cadeira_joelho()`: a 1ª MÁQUINA, cadeira extensora/flexora sentada montada em volta do corpo (eixo da alavanca nos 2 joelhos, assento e encosto a 100°, rolo na frente da canela — ou atrás, com a `almofada` das coxas (ou o `rolo_coxa`: um rolo por cima delas, logo acima dos joelhos, preso num braço que sai do alto da torre do eixo — o que a Cadeira Flexora usa), na flexora —, pegadores do lado do assento, torre do eixo e pilha em carenagem); `CadeiraJoelho.girar()` gira a alavanca e o rolo juntos em volta do eixo; assento, encosto, rolo e almofada são apoio; `cadeira_quadril()`: cadeira abdutora/adutora sentada (2 braços, cada um girando em volta da vertical do quadril do mesmo lado, com a almofada do joelho — por fora na abdutora, `almofada="dentro"` na adutora — e o apoio do pé); `CadeiraQuadril.girar()` abre ou fecha os 2 braços (`poste_alinhado=True`, na adutora: o poste de cada braço sai com as faces viradas pra coxa, que já é montada aberta); assento, encosto, almofadas e apoios dos pés são apoio; `leg_press_45()`: leg press 45° montado em volta do corpo deitado (2 trilhos a 45°, o carrinho com as luvas, o chassi, a plataforma ⟂ ao trilho e 2 suportes de anilha de cada lado — `anilhas=True` põe uma anilha —, assento e encosto reclinado com o apoio lombar, pegadores dos lados do assento, travas nos trilhos, postes e base); `LegPress.mover()` anda o carrinho e a plataforma juntos no trilho; assento, encosto e plataforma são apoio; `smith()`: Smith de barra guiada montado em volta do corpo (base, 2 colunas com a travessa, 2 trilhos verticais na frente delas com os pinos dos ganchos a cada 10 cm, a barra com os 2 carrinhos que abraçam os trilhos, os ganchos, as luvas e as anilhas, e as travas de segurança embaixo do curso); `Smith.mover(z)` só sobe e desce a barra (não passa do curso); a barra é apoio (o trapézio encosta nela) e a estrutura não encosta no corpo; `voador()`: voador (pec deck) sentado — 2 braços pendurados em mancais no alto, cada um girando em volta da vertical que passa pelo ombro do mesmo lado, com o pegador vertical na ponta, assento, encosto, estrutura e pilha em carenagem; `Voador.girar()` abre ou fecha os 2 braços juntos; `tras=-1` vira a máquina pro Crucifixo Invertido (de frente pro encosto, que vira apoio do peito); assento e encosto são apoio; `supino_sentado()`: máquina de supino sentado montada em volta do corpo (2 braços de alavanca no mesmo eixo, com os pegadores na ponta, assento e encosto de apoio, torre da pilha); `MaquinaSupino.girar()` gira os braços e `pegada(s)` dá onde a mão fecha; com o eixo dos braços atrás do encosto, na altura do pescoço, e a `cabeceira` (almofada da cabeça na face do encosto, apoio), serve ao Desenvolvimento na Máquina; `panturrilha_sentado()`: máquina de panturrilha sentado (assento sem encosto, degrau com borracha e chanfro, braço com a almofada das coxas girando num eixo na reta dos quadris, barra com 2 pegadores, pino de anilha e torre); `MaquinaPanturrilha.girar()` sobe e desce o braço junto com as coxas; assento, degrau e almofada são apoio (apoio com quina viva engana a medida de zona da checagem: use chanfro); `rosca_scott()`: máquina de rosca Scott sentada montada em volta do corpo (almofada dos braços inclinada — inteira ou com `recorte` em U pro peito —, assento atrás dela, alavanca girando num eixo que passa pelos 2 cotovelos, com o pegador na ponta: barra com 2 manoplas de borracha, pilha e poste); `RoscaScott.girar()` gira a alavanca (`lado` gira um braço só) e `pegada(s)` dá onde a mão fecha; `independentes=True` separa os 2 braços da alavanca, pra Rosca Alternada na Máquina; assento e almofada são apoio; `remada_sentada()`: máquina de remada sentada com apoio de peito montada em volta do corpo (2 braços girando num eixo baixo na frente dos pés, cada um com a barra de aço e os 2 pegadores — o neutro, que gira em volta da barra, e o pronado —, assento, almofada do peito inclinada e a torre da pilha na frente, ou uma coluna de aço com `pilha=False`; com o eixo no alto e o `caminho` do braço pendurado, serve ao High Row; com `poste` = y de um poste na frente, o pedestal de cada mancal sobe nele e uma viga vai até o mancal — Remada Baixa na Máquina, eixo no alto com o braço passando embaixo dele; padrão None = idêntico); `MaquinaRemada.girar()` gira os braços (`lado` gira um só) e `pegada(s, tipo)` dá onde a mão fecha (`"neutro"` ou `"pronado"`, o da Remada Aberta na Máquina); assento e almofada são apoio (a torre da pilha na frente tapa a vista de frente, como na máquina de verdade); `remada_cavalinho()`: remada cavalinho com apoio de peito (alavanca única com o pivô atrás dos pés, perto do chão, passando entre as pernas até a ponta com o pino de anilha e a travessa dos 2 pegadores neutros; almofada do peito inclinada presa na coluna da frente, um pedal embaixo de cada pé e a base); `MaquinaCavalinho.girar()` sobe e desce a alavanca e `pegada(s)` dá onde a mão fecha; almofada e pedais são apoio; `supino_deitado()`: supino deitado articulado de anilhas (banco reto de apoio; pórtico atrás da cabeça com um mancal em cada coluna; 2 braços de alavanca no mesmo eixo, por fora da cabeça e dos ombros, até os pegadores em cima do peito; pino com anilha em cada braço); `MaquinaSupinoDeitado` herda de `MaquinaSupino`: `girar()` gira os 2 braços e `pegada(s)` dá onde a mão fecha; `mesa_flexora()`: mesa flexora de bruços (almofadas do peito e das coxas em V invertido a 15°, o quadril no ápice; alavanca com o rolo atrás das pernas, perto dos tornozelos, girando no eixo dos joelhos; um pegador de cada lado da almofada do peito, na altura da cabeça; torre do eixo e pilha do lado −X); `MesaFlexora` herda de `CadeiraJoelho`: `girar()` gira a alavanca e o rolo juntos; `supino_declinado_alto()`: supino declinado com o eixo no ALTO (tipo Hammer Strength MTS Decline Press: pórtico, encosto reclinado ~30° num trilho de assento inclinado, 2 braços de alavanca pendurados do eixo de cima até os pegadores na parte de baixo do peito, torre de pilha de cada lado; empurrar = pêndulo pra frente); `esteira()`: esteira ergométrica (base, lona com faixas que andam pra trás na velocidade da corrida, rolos, colunas, corrimãos e painel); `Esteira`: as faixas emendam o ciclo (t=1 igual a t=0). Exercício CÍCLICO: a ficha leva `"ciclo": true` (o exportador anda o tempo em passo constante, sem o ease das idas e voltas, e o app repete o ciclo) e pode levar `"fps"` (quadros por segundo; padrão 16) pra movimento rápido não passar do salto máximo entre quadros; `estacao_puxada()`: estação de puxada (assento, 2 rolos das coxas num poste entre as pernas, torre com a pilha, braço de cima com a roldana alta; parametrizada pras outras puxadas) + `barra_puxada()` (barra de 48" com as pontas dobradas a 25°, sobre a `barra_polia()`); o acessório vai por `por_acessorio` a cada quadro (o triângulo da remada baixa encaixa sem mudar a peça); `polia(so_roldana=True)`: só a roldana e o cabo, sem a torre (padrão False = idêntico); `panturrilha_em_pe()`: máquina de panturrilha em pé (braço com o eixo em cima da torre, 2 ombreiras, garfo com os pegadores, torre com a pilha, base) + `degrau_panturrilha()` solto (borracha, chapa e corpo com quinas chanfradas; serve às outras panturrilhas). Medida da técnica `coxa_abertura` (`lib/tecnica3d.py`): o quanto cada coxa abre pro lado, vista de cima |
| `lib/checagem3d.py` | checagem de realismo em todos os quadros (mãos, pés, juntas, colisões, equipamento); `checagens.eixos` da ficha: o eixo da máquina passa pela junta que trabalha (distância do centro do joelho até a reta do eixo da alavanca, todo quadro) |

## Licença dos assets
Só assets nossos ou CC0 (MakeHuman/MPFB) e código aberto (Blender, three.js). Nada de mídia de terceiros:
os exercícios também viram vídeos à venda no futuro.
