# Medidas de TÉCNICA do movimento, além de mão no peso e colisão (correção dele 04/10/2026, na remada com os
# cotovelos abertos ~70°: "Você está checando a anatomia do movimento… Posição dos pés (aberto, fechado, para dentro
# ou para fora, cotovelo próximo ao corpo entre outras coisas)" + "a checagem é exatamente para verificar todo o
# movimento"). Funções puras sobre as posições das juntas — cabeça de cada osso do rig no mundo, em metros, Z pra
# cima — medidas no referencial do PRÓPRIO corpo (tronco ou pelve), então valem com o boneco em pé, curvado ou
# deitado. Testes sem o Blender: .venv/bin/python -m pytest -q test_tecnica.py
import math

import numpy as np

CIMA = np.array([0.0, 0.0, 1.0])
LADOS = (("Left", -1.0), ("Right", 1.0))     # "pra fora" = −lado no esquerdo, +lado no direito
JUNTAS = ("Hips", "Spine1", "Neck", "LeftArm", "RightArm", "LeftForeArm", "RightForeArm", "LeftHand", "RightHand",
          "LeftHandMiddle1",
          "RightHandMiddle1", "LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg", "LeftFoot", "RightFoot",
          "LeftToeBase", "RightToeBase")


def _u(v):
    v = np.asarray(v, float)
    n = np.linalg.norm(v)
    return v / n if n > 1e-9 else v * 0.0


def _chao(v):
    return np.array([v[0], v[1], 0.0])


def _ang(a, b):
    c = _u(a) @ _u(b)
    return math.degrees(math.acos(max(-1.0, min(1.0, c))))


def eixos_tronco(j):
    """Referencial do tronco: cima (quadril → pescoço), lado (ombro esquerdo → direito, ⟂ cima) e frente."""
    cima = _u(j["Neck"] - j["Hips"])
    lado = j["RightArm"] - j["LeftArm"]
    lado = _u(lado - cima * (lado @ cima))
    return cima, lado, np.cross(cima, lado)


def eixos_pelve(j):
    """Referencial dos pés, no plano do chão: lado (quadril esquerdo → direito) e frente da pelve."""
    lado = _u(_chao(j["RightUpLeg"] - j["LeftUpLeg"]))
    return lado, np.cross(CIMA, lado)


def cotovelo_tronco(j):
    """Abertura do braço (ombro → cotovelo) pra fora do plano sagital do tronco, graus [E, D]: 0 = cotovelo rente
    ao corpo (braço pra baixo, pra frente ou pra trás), 90 = braço aberto pro lado (em T), − = cruzando pra dentro.
    É o "cotovelo perto do corpo" das remadas, roscas e supinos."""
    _, lado, _ = eixos_tronco(j)
    return [math.degrees(math.asin(max(-1.0, min(1.0, _u(j[L + "ForeArm"] - j[L + "Arm"]) @ (s * lado)))))
            for L, s in LADOS]


def braco_frente(j):
    """Braço à frente (+) ou atrás (−) do tronco, no plano sagital do tronco, graus [E, D]: 0 = pendurado ao lado
    do tronco, 90 = na horizontal à frente (flexão do ombro), −30 = cotovelo atrás do corpo (fim da remada)."""
    cima, lado, frente = eixos_tronco(j)
    out = []
    for L, _ in LADOS:
        b = j[L + "ForeArm"] - j[L + "Arm"]
        b = b - lado * (b @ lado)
        out.append(math.degrees(math.atan2(b @ frente, b @ -cima)))
    return out


def braco_elevacao(j):
    """Braço levantado em relação ao tronco, graus [E, D]: 0 = pendurado, 90 = na altura do ombro, 180 = pra cima
    (pra qualquer lado: frente, lado ou trás)."""
    cima, _, _ = eixos_tronco(j)
    return [_ang(j[L + "ForeArm"] - j[L + "Arm"], -cima) for L, _ in LADOS]


def braco_plano(j):
    """Pra onde o braço levantado aponta, visto de cima do tronco, graus [E, D]: 0 = pro lado (plano frontal),
    30 = plano da escápula, 90 = pra frente, − = atrás do corpo. Só faz sentido com o braço levantado."""
    _, lado, frente = eixos_tronco(j)
    out = []
    for L, s in LADOS:
        b = j[L + "ForeArm"] - j[L + "Arm"]
        out.append(math.degrees(math.atan2(b @ frente, b @ (s * lado))))
    return out


def braco_abertura(j):
    """Abertura do braço no plano frontal do tronco (vista de frente do peito), graus [E, D]: 0 = colado na lateral
    apontando pros pés, 90 = em T. No supino é o "cotovelo a 45–75° do tronco" (90 = cotovelo aberto demais)."""
    cima, lado, _ = eixos_tronco(j)
    out = []
    for L, s in LADOS:
        b = j[L + "ForeArm"] - j[L + "Arm"]
        out.append(math.degrees(math.atan2(b @ (s * lado), b @ -cima)))
    return out


def antebraco_vertical(j):
    """Antebraço (cotovelo → punho) × a vertical do mundo, graus [E, D]: 0 = em pé, punho bem em cima (ou bem
    embaixo) do cotovelo — o "antebraço perpendicular ao chão" dos supinos e desenvolvimentos."""
    out = []
    for L, _ in LADOS:
        a = _ang(j[L + "Hand"] - j[L + "ForeArm"], CIMA)
        out.append(min(a, 180 - a))
    return out


def ombro_frente(j):
    """Articulação do ombro (cabeça do úmero) à frente (+) ou atrás (−) da base do pescoço, no eixo frente do tronco,
    mm [E, D]: protração (+) / retração (−) da escápula. Subir e descer o ombro não mexe nela — no encolhimento ela
    fica parada (o ombro só sobe e desce, sem rolar pra frente nem pra trás; lote 2, 04/10/2026)."""
    _, _, frente = eixos_tronco(j)
    return [float((j[L + "Arm"] - j["Neck"]) @ frente) * 1000 for L, _ in LADOS]


def pes_largura(j):
    """Distância entre os tornozelos (no chão) ÷ distância entre as articulações do quadril: ~1 = pés na largura do
    quadril, ~2 = na largura dos ombros, < 0,7 = pés colados ou cruzando."""
    return [float(np.linalg.norm(_chao(j["LeftFoot"] - j["RightFoot"]))
                  / max(np.linalg.norm(j["LeftUpLeg"] - j["RightUpLeg"]), 1e-9))]


def ponta_pe(j):
    """Ponta do pé (tornozelo → base dos dedos, no chão) virada pra fora (+) ou pra dentro (−) em relação à frente
    da pelve, graus [E, D]."""
    lado, frente = eixos_pelve(j)
    out = []
    for L, s in LADOS:
        p = _chao(j[L + "ToeBase"] - j[L + "Foot"])
        out.append(math.degrees(math.atan2(p @ (s * lado), p @ frente)))
    return out


def ponta_pe_diferenca(j):
    """Um pé mais virado que o outro, graus (valor absoluto)."""
    e, d = ponta_pe(j)
    return [abs(e - d)]


PONTAS = ("LeftToeBase", "RightToeBase")     # ossos que também entram pela PONTA (chave "<osso>_ponta")


def ponta_dedos(j):
    """Dedos (base dos dedos → ponta dos dedos, deitados no chão) virados pra fora (+) ou pra dentro (−) da frente da
    pelve, graus [E, D]. É a direção do pé que vale também com o calcanhar levantado (pé de trás do afundo, lote 2):
    com o pé quase em pé, o tornozelo → base dos dedos visto de cima fica curtinho e o ponta_pe perde o sentido."""
    lado, frente = eixos_pelve(j)
    out = []
    for L, s in LADOS:
        p = _chao(j[L + "ToeBase_ponta"] - j[L + "ToeBase"])
        out.append(math.degrees(math.atan2(p @ (s * lado), p @ frente)))
    return out


def pes_alinhados(j):
    """Um pé à frente do outro, mm (valor absoluto, ao longo da frente da pelve): base paralela = ~0."""
    _, frente = eixos_pelve(j)
    meio = {L: (j[L + "Foot"] + j[L + "ToeBase"]) / 2 for L, _ in LADOS}
    return [abs(float((meio["Left"] - meio["Right"]) @ frente)) * 1000]


def pegada_largura(j):
    """Distância entre as mãos (base do dedo médio = meio da pegada) ÷ distância entre os ombros (cabeça do úmero):
    ~1,2 = mãos na largura dos ombros, ~1,6 = pegada aberta."""
    return [float(np.linalg.norm(j["LeftHandMiddle1"] - j["RightHandMiddle1"])
                  / max(np.linalg.norm(j["LeftArm"] - j["RightArm"]), 1e-9))]


def joelho_fora_do_pe(j):
    """Joelho pra fora (+) ou pra dentro (−, valgo) da base dos dedos, mm [E, D], medido de lado a lado da pelve."""
    lado, _ = eixos_pelve(j)
    return [float((j[L + "Leg"] - j[L + "ToeBase"]) @ (s * lado)) * 1000 for L, s in LADOS]


def joelho_valgo(j):
    """Joelho pra fora (+) ou pra dentro (−, valgo) da reta quadril → tornozelo, mm [E, D], de lado a lado da pelve:
    perna reta = 0, com qualquer largura de base; dobrando, o joelho vai na direção do pé (0 ou um pouco pra fora)."""
    lado, _ = eixos_pelve(j)
    out = []
    for L, s in LADOS:
        h, a, k = j[L + "UpLeg"], j[L + "Foot"], j[L + "Leg"]
        d = a - h
        perto = h + d * (((k - h) @ d) / max(d @ d, 1e-12))
        out.append(float((k - perto) @ (s * lado)) * 1000)
    return out


def coluna(j):
    """Curvatura da coluna, graus: ângulo entre a lombar (quadril → Spine1) e a torácica (Spine1 → pescoço)."""
    return [_ang(j["Spine1"] - j["Hips"], j["Neck"] - j["Spine1"])]


def pes_base_lateral(j):
    """Distância entre os tornozelos SÓ de lado a lado da pelve (sem contar um pé à frente do outro) ÷ distância
    entre as articulações do quadril: ~1 = cada pé embaixo do seu quadril. É a "largura do quadril" da base do
    afundo (lote 2, 04/10/2026), em que o pes_largura (distância no chão inteiro) também conta a passada."""
    lado, _ = eixos_pelve(j)
    return [abs(float((j["LeftFoot"] - j["RightFoot"]) @ lado))
            / max(float(np.linalg.norm(j["LeftUpLeg"] - j["RightUpLeg"])), 1e-9)]


def joelho_altura(j):
    """Altura do centro do joelho acima do chão (z = 0), mm [E, D]: no afundo o joelho de trás desce até quase
    encostar no chão (lote 2). A pele da frente do joelho fica uns 5 cm à frente do centro da junta."""
    return [float(j[L + "Leg"][2]) * 1000 for L, _ in LADOS]


MEDIDAS = {
    "cotovelo_tronco": cotovelo_tronco, "braco_frente": braco_frente, "braco_elevacao": braco_elevacao,
    "braco_plano": braco_plano, "braco_abertura": braco_abertura, "antebraco_vertical": antebraco_vertical,
    "pegada_largura": pegada_largura, "ombro_frente": ombro_frente,
    "pes_largura": pes_largura, "ponta_pe": ponta_pe, "ponta_pe_diferenca": ponta_pe_diferenca,
    "pes_alinhados": pes_alinhados, "joelho_valgo": joelho_valgo, "joelho_fora_do_pe": joelho_fora_do_pe,
    "coluna": coluna,
    "pes_base_lateral": pes_base_lateral, "joelho_altura": joelho_altura, "ponta_dedos": ponta_dedos,
}
UNIDADE = {"pes_alinhados": "mm", "joelho_valgo": "mm", "joelho_fora_do_pe": "mm", "pes_largura": "×",
           "pegada_largura": "×", "ombro_frente": "mm", "pes_base_lateral": "×", "joelho_altura": "mm"}

# ── remada unilateral (lote 2, 04/10/2026): escápula de UM lado e tronco sem girar. O ombro_frente usa a linha dos
# ombros como eixo de lado a lado, e ela gira junto quando só um ombro vai pra frente (os dois lados mexem igual,
# metade cada); aqui o eixo vem da base das clavículas (cabeça dos ossos Shoulder), presa no tórax.
JUNTAS = JUNTAS + ("LeftShoulder", "RightShoulder")


def eixos_torax(j):
    """Referencial do tórax: cima (quadril → pescoço), lado (base da clavícula esquerda → direita, ⟂ cima) e frente.
    A base da clavícula é presa no tórax: subir, levar pra frente ou pra trás a escápula não mexe nesses eixos."""
    cima = _u(j["Neck"] - j["Hips"])
    lado = j["RightShoulder"] - j["LeftShoulder"]
    lado = _u(lado - cima * (lado @ cima))
    return cima, lado, np.cross(cima, lado)


def escapula_frente(j):
    """Ombro (cabeça do úmero) à frente (+, protração) ou atrás (−, retração) da base do pescoço, no eixo frente do
    TÓRAX, mm [E, D]: como o ombro_frente, mas um ombro mexendo sozinho não muda o número do outro (remada
    unilateral: a escápula que rema desce pro chão embaixo e volta pra trás em cima; a do apoio fica parada)."""
    _, _, frente = eixos_torax(j)
    return [float((j[L + "Arm"] - j["Neck"]) @ frente) * 1000 for L, _ in LADOS]


def ombros_nivel(j):
    """Eixo de lado a lado do tórax (base das clavículas, ⟂ ao tronco) × o chão, graus: 0 = nivelado, + = lado
    direito mais alto. Com o tronco curvado perto da horizontal é o giro do tronco em volta do próprio eixo (o "do not
    rotate torso" da remada unilateral); em pé é a inclinação do tórax pro lado."""
    _, lado, _ = eixos_torax(j)
    return [math.degrees(math.asin(max(-1.0, min(1.0, float(lado[2])))))]


def pelve_nivel(j):
    """Linha das articulações do quadril × o chão, graus: 0 = pelve nivelada, + = lado direito mais alto."""
    d = j["RightUpLeg"] - j["LeftUpLeg"]
    return [math.degrees(math.atan2(d[2], math.hypot(d[0], d[1])))]


MEDIDAS.update({"escapula_frente": escapula_frente, "ombros_nivel": ombros_nivel, "pelve_nivel": pelve_nivel})
UNIDADE.update({"escapula_frente": "mm"})


# ── agachamento búlgaro (lote 2, 04/10/2026): o pé de trás fica com o peito do pé em cima do banco, em flexão
# plantar — o tornozelo não pode passar da amplitude normal (Alazzawi S et al., World J Orthop 2017;8(1):21-29,
# tabela 5: flexão plantar 0–50°, dorsiflexão 0–20°). O limites.py não tem o tornozelo.
def tornozelo(j):
    """Ângulo canela × pé (joelho → tornozelo × tornozelo → base dos dedos), graus [E, D]. O boneco em pé com o pé
    chapado mede ~76°; flexão plantar (ponta do pé descendo) diminui o número e dorsiflexão (joelho indo à frente do
    pé) aumenta: flexão plantar de 0 a 50° = ~76° a ~26° no boneco."""
    return [_ang(j[L + "Foot"] - j[L + "Leg"], j[L + "ToeBase"] - j[L + "Foot"]) for L, _ in LADOS]


MEDIDAS.update({"tornozelo": tornozelo})


def medir(j):
    """Todas as medidas de técnica do quadro (o relatório mostra todas, com ou sem regra na ficha)."""
    return {nome: f(j) for nome, f in MEDIDAS.items()}


def valores(medida, vals):
    """"35/37" (graus, mm) ou "1.23" (razão)."""
    return "/".join(("%.2f" if UNIDADE.get(medida) == "×" else "%.0f") % v for v in vals)


def texto(medidas):
    return " ".join("%s %s" % (nome, valores(nome, vals)) for nome, vals in medidas.items())


# Regras padrão pra todo exercício com os dois pés apoiados no chão (checagens.pes_no_chao), sem precisar escrever
# na ficha. Faixas largas de propósito: pegam o erro grosseiro (pé cruzando, virado pra dentro, aberto demais, um à
# frente do outro, joelho entrando, coluna curvada) e a ficha estreita o que for do exercício. Ponta do pé de 0 a 30°
# pra fora, joelho na direção do pé e coluna neutra: Escamilla RF, Med Sci Sports Exerc 2001;33(1):127-141;
# Schoenfeld BJ, J Strength Cond Res 2010;24(12):3497-3506. Mudar uma faixa: checagens.tecnica_padrao =
# {"ponta_pe": [0, 15]}; desligar todas (base diferente de propósito, ex. avanço): checagens.tecnica_padrao = false.
PADRAO_PES_NO_CHAO = (
    ("pes_largura", "pés nem colados nem abertos demais", (0.8, 2.6)),
    ("ponta_pe", "ponta do pé pra frente ou um pouco pra fora", (-5, 30)),
    ("ponta_pe_diferenca", "os dois pés virados igual", (0, 12)),
    ("pes_alinhados", "um pé não fica à frente do outro", (0, 40)),
    ("joelho_valgo", "joelho na direção do pé (sem valgo)", (-20, 100)),
    ("coluna", "coluna neutra", (0, 20)),
)


def regras_padrao(checagens):
    troca = checagens.get("tecnica_padrao", {})
    if not checagens.get("pes_no_chao", True) or troca is False:
        return []
    return [{"nome": nome + " (padrão)", "medida": medida, "t": "todos", "faixa": list(troca.get(medida, faixa))}
            for medida, nome, faixa in PADRAO_PES_NO_CHAO]


def vale_no_quadro(t_regra, t):
    """A regra vale neste quadro? t_regra: número (só aquele quadro), [t0, t1] (faixa) ou "todos"."""
    if t_regra == "todos":
        return True
    if isinstance(t_regra, (list, tuple)):
        return t_regra[0] - 1e-6 <= t <= t_regra[1] + 1e-6
    return abs(t_regra - t) <= 1e-6


def faixa(regra):
    return regra.get("faixa") or regra.get("graus") or regra.get("mm")


def fora_da_faixa(regra, vals):
    lo, hi = faixa(regra)
    return any(not lo <= v <= hi for v in vals)


def do_lado(regra, vals):
    """Regra de UM membro só: regra["lado"] = "E" (esquerdo) ou "D" (direito) fica só com o valor daquele lado; sem
    "lado" vale pros dois, como sempre. No afundo a perna da frente e a de trás têm ângulos diferentes (lote 2)."""
    lado = regra.get("lado")
    if lado is None or len(vals) != 2:
        return vals
    if lado not in ("E", "D"):
        raise ValueError("lado da regra %r: use \"E\" ou \"D\"" % lado)
    return [vals[0 if lado == "E" else 1]]


# ── abdominal bicicleta (lote 2, 05/10/2026): mãos atrás da cabeça com os cotovelos abertos pro lado (Livestrong,
# reproduzido pelo ACE: "hands behind your head (elbows out wide)"). O braco_abertura é medido no referencial quadril →
# pescoço, que muda quando o tronco enrola e gira; a distância entre os cotovelos não depende disso.
def cotovelos_largura(j):
    """Distância entre os cotovelos (cabeça do antebraço) ÷ distância entre os ombros (cabeça do úmero): ~1 = cotovelos
    na largura dos ombros (braços pendurados ou fechados pra frente), ~1,7 = abertos pro lado com as mãos na cabeça."""
    return [float(np.linalg.norm(j["LeftForeArm"] - j["RightForeArm"])
                  / max(np.linalg.norm(j["LeftArm"] - j["RightArm"]), 1e-9))]


MEDIDAS.update({"cotovelos_largura": cotovelos_largura})
UNIDADE.update({"cotovelos_largura": "×"})
