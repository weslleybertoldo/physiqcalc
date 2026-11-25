# Supino Declinado Sentado Articulado — cena da fábrica 3D (24/11/2026; exercício novo do catálogo, pedido do Weslley: "Não é esse
# [o Supino Declinado na Máquina, a MTS de placas], o apoio é mais inclinado olha a empunhadura e o movimento não é pra frente reto é
# para o meio do peito"). Máquina nova: equip3d.supino_declinado_articulado, a máquina anilhada iso-lateral das fotos de loja que ele
# mandou ("Supino Declinado Sentado Angular Anilhado", "Supino Sentado Declinado Profissional"): 2 braços em "V" independentes,
# PENDURADOS de um eixo no ALTO, em cima de um poste de cada lado; o "V" desce do cubo pra frente até o joelho (com o pino de anilha) e
# volta até o PEGADOR INCLINADO, do lado da parte de baixo do peito; encosto bem reclinado e comprido (a cabeça apoiada), assento numa
# coluna com regulagem, pés no chão. Cada braço gira no SEU eixo, deitado e virado no plano do chão (a ponta de fora pra frente): o
# pegador sai pra frente, sobe um pouco e vem pro MEIO (as mãos convergem).
# t = 0 pegadores do lado da parte de baixo do peito (o vão da mão na altura da parte de baixo do peito, FRENTE0 à frente dele), mãos
# abertas (PEGADA0 × a distância entre os ombros), cotovelos dobrados, pra trás e pro lado, abaixo da linha dos ombros · t = 1 braços
# quase esticados (COTOVELO1°, sem travar), as mãos na frente da parte de baixo do peito, mais perto uma da outra (PEGADA1).
# Técnica (frases exatas na ficha): ExRx, Lever Decline Chest Press (o título da página em 2026: "Lever Isolateral Decline Chest
# Press"): "Sit on seat with lever grips lower chest height. Grasp grips with wide overhand grip; elbows out to sides just below
# shoulders." / "Press lever until arms are extended. Return weight until chest muscles are slightly stretched."; ACE, Seated Decline
# Cable Press: "Sit with your back firmly supported against the backrest." / "position your hands just below chest level, maintaining a
# neutral wrist position (i.e., wrists in line with your forearms)" / "Position your feet firmly on the floor" / "Depress and retract
# your scapulae (pull shoulders back and down) and attempt to hold this position throughout the exercise." / "extending your arms
# forward towards your thighs" / "Continue pressing until your elbows are fully extended, but not locked." / "moving the handles back
# towards your lower chest, stopping when they lightly touch, or are close to, the lower portion of your chest"; NSCA (posição de 5
# pontos): "Head on the bench or pad"; Life Fitness, MTS Iso-Lateral Decline Press: "independent diverging and converging motions";
# Hammer Strength Iso-Lateral (linha de anilhas): pegadores entre a pronada e a neutra ("between a neutral and overhand grip", IL-IP).
# Vídeo do Weslley (um personal, câmera de frente; só pra entender o movimento, nada dele entra no app): no começo as mãos do lado da
# parte de baixo do peito, ~1,4 vez a largura dos ombros, os cotovelos pra trás e pro lado; no fim as mãos na frente da parte de baixo
# do peito, ~0,75 vez a largura dos ombros, os braços quase esticados; os pegadores inclinados (a ponta de baixo pra fora).
# Como o rig faz: sentado como no supino sentado (o corpo inclina pra trás em volta do quadril até o glúteo e a parte de cima das
# costas encostarem juntos no encosto ENCOSTO° atrás da vertical; coxas na horizontal e um pouco abertas, canelas em pé, pés chapados
# no chão; escápulas pra trás e pra baixo, paradas). A cabeça fica na linha do tronco e encosta na almofada da cabeça (a espessura
# dela leva a face até a nuca, como no Desenvolvimento na Máquina e na Paralela na Máquina). A "parte de baixo do peito" é o ponto da
# pele PEITO_BAIXO do boneco em pé (o mesmo do Supino Declinado na Máquina), levado junto com o tronco quando ele senta. No começo o vão
# da mão fica nessa altura, FRENTE0 à frente do peito, em |x| = PEGADA0 × (distância entre os ombros) / 2; o pegador é girado
# GIRO_PEGADA° da pegada pronada pra neutra em volta do antebraço do começo (a ponta do polegar pra dentro e pra cima, a de baixo pra
# fora) e inclinado do perpendicular a ele (pro lado do antebraço); o cotovelo fica no círculo que o braço deixa (ombro e punho dados)
# com a abertura ABRE0 e o antebraço perto da linha do empurrão. O eixo de cada braço fica Z_EIXO no alto, com o cubo em |x| = X_EIXO,
# e vira PSI° no plano do chão (a ponta de fora pra frente). A cena acha 3 números juntos: o PSI que leva as mãos a PEGADA1 no fim, o
# quanto o pegador fica à frente da vertical do eixo no começo (PENDE0, no plano do giro) pra o fim ficar DECL° abaixo da
# perpendicular ao tronco, e a inclinação do pegador que divide o desvio do punho entre o começo e o fim (GEO_MEIO). Quadro a quadro os braços da máquina giram no arco e a mão vai junto com o pegador (IK
# do braço + mão fechada em volta dele); o cotovelo fica no círculo que o braço deixa sempre na mesma posição do "relógio" em volta da
# reta ombro → punho (a do começo), sem salto entre quadros. Os dedos e o polegar fecham UMA vez, no começo (mão rígida no pegador
# redondo, de 38 mm). Tronco, escápulas, cabeça, quadril, pernas e pés não mexem.
import math
import numpy as np
from mathutils import Matrix, Vector
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
import tecnica3d as tc
from maos3d import Maos
from cena import Cena

LADOS = (("Left", 1), ("Right", -1))      # s = +1 no esquerdo (+X)
ENCOSTO = 40.0            # encosto 40° atrás da vertical: "mais inclinado" que os 30° da MTS (Weslley); estimado nas fotos de loja da
                          # máquina (sem medida de fabricante: a escala das fotos dá de ~36° a ~47°)
LARG_ENCOSTO, ESP_ENCOSTO = 0.30, 0.06    # encosto de 30 cm (MTS: "PAD, BACK 32-1/2 X 11-1/4"), estofado de 60 mm
ESP_ASSENTO, LARG_ASSENTO = 0.06, 0.38    # estofado de 60 mm; largura: escolha da fábrica
PROF_ASSENTO = 0.34       # do encosto até a borda da frente (a coxa passa da borda, o joelho fica livre)
AFUNDA = 0.002            # pele afundando no estofado do assento e do encosto
ABRE_COXA = 8.0           # coxas abertas 8° pra fora: pés afastados, mais abertos que o quadril (vídeo)
PEITO_BAIXO = (0.11, 1.21)    # (|x|, z) do boneco em pé: abaixo da borda de baixo do peitoral, na linha do mamilo, 3,5 cm abaixo do
                              # ponto do Supino Declinado na Máquina: "lever grips lower chest height" (ExRx), "just below chest level"
                              # (ACE); no vídeo, de frente, as mãos começam do lado da parte de baixo do peito, ~45% do ombro pra cintura
FRENTE0 = 0.08            # começo: o vão da mão 8 cm à frente da frente do peito, nessa altura ("lightly touch, or are close to, the
                          # lower portion of your chest", ACE; mais perto, o cotovelo iria além da abdução horizontal normal)
PEGADA0 = 1.45            # começo: mãos a 1,45 × a distância entre os ombros (vídeo: ~1,4 × a largura dos ombros)
PEGADA1 = 0.70            # fim: o meio dos pegadores a 0,70 × (a medida da técnica, na base do dedo médio, dá ~0,8; vídeo: ~0,75 ×
                          # a largura dos ombros) — a cena acha o PSI que dá isso
GIRO_PEGADA = 50.0        # pegador girado 50° da pegada pronada pra neutra (vídeo e fotos: o pegador inclinado, a ponta de baixo
                          # pra fora; "between a neutral and overhand grip", IL-IP)
GEO_MEIO = 9.0            # e inclinado do perpendicular ao antebraço até o desvio do punho ficar dividido entre o começo do arco (pro
                          # lado do mindinho) e o fim (pro lado do polegar): asin(antebraço · pegador) com o meio em GEO_MEIO° (a
                          # cena acha a inclinação; o pegador é fixo no braço da máquina e o antebraço vira mais que ele no arco)
ABRE0 = 58.0              # abertura do braço no começo (vista de frente do tronco): cotovelos pro lado e abaixo dos ombros
DECL = 37.0               # fim: a reta ombro → punho 37° abaixo da perpendicular ao tronco (declinado; "extending your arms forward
                          # towards your thighs", ACE): o braço quase na horizontal e as mãos na frente da parte de baixo do peito /
                          # começo do abdome, como no vídeo de frente — a cena acha quanto o pegador fica à frente da vertical do eixo
COTOVELO1 = 12.0          # flexão do cotovelo no fim: quase esticado, sem travar
Z_EIXO = 1.85             # eixo dos braços no alto: 1,85 m do chão (nas fotos o cubo fica no topo da máquina, bem acima da cabeça)
X_EIXO = 0.50             # cubo de cada braço em |x| = 0,50
X_POSTE = 0.64            # postes e trilhos da base em |x| = 0,64 (por fora dos cubos)
BARRA_PEG = 0.09          # barra de aço do pegador: 9 cm da ponta de baixo dele até a ponta do braço, na linha dele (vídeo)
DOBRA = (0.36, 0.45)      # joelho do "V": a 36% do cubo pra ponta e 0,45 × (cubo → ponta) pra frente (−Y, no mundo: nas fotos o "V" fica
                          # de lado, por fora do ombro — no plano do giro, virado PSI°, o joelho entraria ~20 cm pro meio, na frente do peito)
ANILHA = (0.175, 0.040)   # anilha de 10 kg em cada braço: Ø 350 mm (Eleiko 10 kg: "Diameter 350 mm"), 40 mm de espessura
RAIO = 0.019              # pegador de 38 mm (como o "Grip 1.5" OD" das MTS)
COMP_PEGADOR = 0.14
PUNHO = 0.0               # punho reto: a mão na linha do antebraço ("neutral wrist position", ACE)
RETRAI, DESCE = 6.0, 4.0  # escápulas pra trás (retração) e pra baixo (depressão), graus de giro da clavícula (ACE: "Depress and
                          # retract your scapulae")


def _malha(bon):
    return ck._avaliar(bon.corpo, 1)


def _grupo(nomes, dono, partes):
    return np.array([n in partes for n in nomes] + [False])[dono]


def _abertura(v, cima, lado, s):
    """Abertura do braço (vetor ombro → cotovelo) vista de frente do tronco, graus (a mesma conta do tc.braco_abertura)."""
    return math.degrees(math.atan2(v.dot(s * lado), v.dot(-cima)))


def _gira(v, c, a, graus):
    """Ponto v girado `graus` em volta do eixo que passa por c na direção a (regra da mão direita)."""
    return c + Matrix.Rotation(math.radians(graus), 3, a) @ (v - c)


def montar(bon):
    pg.usar_cilindro(RAIO * 2000)     # mão de referência do pegador de 38 mm (antes do Maos)
    pg.usar_polegar("volta")          # polegar dando a volta no pegador (padrão dos exercícios novos)
    rig = bon.rig
    PB = rig.pose.bones

    def cab(n):
        return p3.cabeca(rig, n)

    def pele(partes):
        co, _, (nomes, dono) = _malha(bon)
        return co[_grupo(nomes, dono, partes)]

    # ── 0) a parte de baixo do peito no boneco em pé: o vértice da pele do tronco mais perto de PEITO_BAIXO (|x|, z), na frente ───
    co, _, (nomes, dono) = _malha(bon)
    tronco = _grupo(nomes, dono, ("Spine1", "Spine2"))
    i_peito = {}
    for _, s in LADOS:
        cand = np.where(tronco & (co[:, 1] < -0.03) & (s * co[:, 0] > 0))[0]
        d = np.hypot(np.abs(co[cand, 0]) - PEITO_BAIXO[0], co[cand, 2] - PEITO_BAIXO[1])
        i_peito[s] = int(cand[d.argmin()])

    # ── 1) sentado: coxas na horizontal e um pouco abertas, canelas em pé, pés chapados no chão (a planta no chão) ──────────────
    PERNA_OSSOS = ("Hips",) + tuple(L + o for L, _ in LADOS for o in ("UpLeg", "Leg", "Foot", "ToeBase"))
    repouso = {n: PB[p3.P + n].matrix_basis.copy() for n in PERNA_OSSOS}
    pivo0 = (cab("LeftUpLeg") + cab("RightUpLeg")) / 2
    pe_rep = {L: p3.mundo_osso(rig, L + "Foot").to_3x3().normalized() for L, _ in LADOS}   # sola chapada (repouso)
    f_rep = {L: cab(L + "ToeBase") - cab(L + "Foot") for L, _ in LADOS}
    a_enc = math.radians(ENCOSTO)
    n_enc = Vector((0, -math.cos(a_enc), math.sin(a_enc)))   # normal da face do encosto (pro corpo)
    u_enc = Vector((0, math.sin(a_enc), math.cos(a_enc)))    # ao longo do encosto, pra cima

    def sentar(reclina):
        for n, M in repouso.items():
            PB[p3.P + n].matrix_basis = M.copy()
        p3.atualizar()
        p3.girar_osso(rig, "Hips", p3.rot_x(-reclina), pivo=pivo0)
        for L, s in LADOS:
            h, k = cab(L + "UpLeg"), cab(L + "Leg")
            alvo = Vector((s * math.sin(math.radians(ABRE_COXA)), -math.cos(math.radians(ABRE_COXA)), 0.0))
            p3.girar_osso(rig, L + "UpLeg", (k - h).rotation_difference(alvo).to_matrix())
            k, a = cab(L + "Leg"), cab(L + "Foot")
            p3.girar_osso(rig, L + "Leg", (a - k).rotation_difference(Vector((0, 0, -1))).to_matrix())
            f = cab(L + "ToeBase") - cab(L + "Foot")       # a canela gira em volta dela mesma até o pé apontar como no repouso
            giro = math.atan2(f_rep[L].x, -f_rep[L].y) - math.atan2(f.x, -f.y)
            p3.girar_osso(rig, L + "Leg", Matrix.Rotation(giro, 3, (cab(L + "Foot") - cab(L + "Leg")).normalized()))
            F = p3.mundo_osso(rig, L + "Foot").to_3x3().normalized()
            p3.girar_osso(rig, L + "Foot", pe_rep[L] @ F.inverted())    # sola chapada, como em pé
        pes = pele(("LeftFoot", "LeftToeBase", "RightFoot", "RightToeBase"))
        p3.girar_osso(rig, "Hips", Matrix.Identity(3), mover=Vector((0, 0, -0.0005 - float(pes[:, 2].min()))))

    def costas():
        """Quanto o glúteo e a parte de cima das costas chegam no encosto (n·p, m; menor = mais pra trás)."""
        co, _, (nomes, dono) = _malha(bon)
        g = co[_grupo(nomes, dono, ("Hips",))]
        c = co[_grupo(nomes, dono, ("Spine1", "Spine2", "LeftShoulder", "RightShoulder"))]
        c = c[np.abs(c[:, 0]) < LARG_ENCOSTO / 2]
        nn = np.array(n_enc)
        return float((g @ nn).min()), float((c @ nn).min())

    # escápulas pra trás e pra baixo, paradas o movimento todo (ACE: "Depress and retract your scapulae (pull shoulders back and
    # down) and attempt to hold this position throughout the exercise"): cada clavícula gira RETRAI° em volta do eixo do tronco e
    # DESCE° em volta do eixo da frente, feito em pé, antes de sentar (como no supino sentado)
    cima0 = (cab("Neck") - cab("Hips")).normalized()
    lado0 = cab("RightShoulder") - cab("LeftShoulder")
    lado0 = (lado0 - cima0 * lado0.dot(cima0)).normalized()
    frente0 = cima0.cross(lado0)
    ombro_antes = {L: cab(L + "Arm") for L, _ in LADOS}
    for L, s in LADOS:
        if RETRAI:
            p3.girar_osso(rig, L + "Shoulder", Matrix.Rotation(math.radians(s * RETRAI), 3, cima0))
        if DESCE:
            p3.girar_osso(rig, L + "Shoulder", Matrix.Rotation(math.radians(-s * DESCE), 3, frente0))
    print("ESCÁPULAS | retração %.0f° e depressão %.0f° | ombro E andou %.1f mm pra trás e %.1f mm pra baixo" % (
        RETRAI, DESCE, (cab("LeftArm") - ombro_antes["Left"]).dot(-frente0) * 1000,
        -(cab("LeftArm") - ombro_antes["Left"]).dot(cima0) * 1000), flush=True)

    # o quanto o corpo inclina pra trás: o glúteo e as costas encostam JUNTOS no encosto ("Sit with your back firmly supported
    # against the backrest", ACE)
    lo, hi = -5.0, 60.0
    for _ in range(15):
        meio = (lo + hi) / 2
        sentar(meio)
        dg, dc = costas()
        if dg < dc:            # o glúteo chega antes: as costas estão longe → inclina mais
            lo = meio
        else:
            hi = meio
    reclina = (lo + hi) / 2
    sentar(reclina)
    dg, dc = costas()
    d_enc = min(dg, dc) + AFUNDA                             # face do encosto: n·p = d_enc
    H = (cab("LeftUpLeg") + cab("RightUpLeg")) / 2
    # assento: embaixo do glúteo (a pele mais baixa no pedaço do assento afunda AFUNDA); o encosto cruza o topo dele em y_base
    G = pele(("Hips", "LeftUpLeg", "RightUpLeg"))
    topo = float(G[:, 2].min()) + AFUNDA
    for _ in range(3):
        y_base = (math.sin(a_enc) * topo - d_enc) / math.cos(a_enc)
        y_tras, y_frente = y_base + 0.06, y_base - (PROF_ASSENTO - 0.06)
        Gs = G[(G[:, 1] > y_frente) & (G[:, 1] < y_tras) & (np.abs(G[:, 0]) < LARG_ASSENTO / 2)]
        topo = float(Gs[:, 2].min()) + AFUNDA
    y_base = (math.sin(a_enc) * topo - d_enc) / math.cos(a_enc)
    y_tras, y_frente = y_base + 0.06, y_base - (PROF_ASSENTO - 0.06)
    base = Vector((0, y_base, topo))                         # onde a face do encosto cruza o topo do assento (h = 0)

    # cabeça × encosto: a almofada da cabeça tem a espessura que leva a face dela até a parte de trás da cabeça (ela afunda AFUNDA)
    co, _, (nomes, dono) = _malha(bon)
    nn, uu = np.array(n_enc), np.array(u_enc)
    cabeca_p = co[_grupo(nomes, dono, ("Head",))]
    nuca = float((cabeca_p @ nn).min()) - d_enc
    esp_cab = nuca + AFUNDA
    h_nuca = float((cabeca_p[(cabeca_p @ nn).argmin()] - np.array(base)) @ uu)
    CABECEIRA = (h_nuca - 0.06, h_nuca + 0.10, esp_cab)
    ALT_ENCOSTO = max(0.80, CABECEIRA[1] + 0.03)            # o encosto vai até um pouco acima da almofada da cabeça
    resto = co[_grupo(nomes, dono, ("Neck", "Spine2", "LeftShoulder", "RightShoulder"))]
    hr = (resto - np.array(base)) @ uu
    na_faixa = resto[(hr > CABECEIRA[0] - 0.03) & (np.abs(resto[:, 0]) < LARG_ENCOSTO / 2)]
    folga_pescoco = float((na_faixa @ nn).min() - d_enc - esp_cab) if len(na_faixa) else 1.0
    print("SENTADO | reclina %.2f° | glúteo × costas %.1f mm | quadril (%.4f %.4f %.4f) | assento topo %.4f, y %.3f → %.3f | "
          "encosto y_base %.4f, %.3f m | cabeça %.1f mm à frente do encosto (em h %.3f) → almofada da cabeça de %.1f mm, de h %.2f "
          "a %.2f | pescoço e ombros (de 3 cm abaixo da almofada pra cima) a %.1f mm da face dela" % (
              reclina, (dg - dc) * 1000, *H, topo, y_frente, y_tras, y_base, ALT_ENCOSTO, nuca * 1000, h_nuca, esp_cab * 1000,
              CABECEIRA[0], CABECEIRA[1], folga_pescoco * 1000), flush=True)

    # ── 2) ombros, referencial do tronco, a parte de baixo do peito (sentado) ──────────────────────────────────────────────────────
    S = {L: cab(L + "Arm") for L, _ in LADOS}
    cima, lado, frente = (Vector(v) for v in tc.eixos_tronco(ck.posicoes(rig)))
    So = (S["Left"] + S["Right"]) / 2                        # meio dos ombros
    larg_ombros = (S["Left"] - S["Right"]).length
    baixo_p = {s: Vector(co[i_peito[s]]) for _, s in LADOS}
    z_baixo = (baixo_p[1].z + baixo_p[-1].z) / 2
    T = co[_grupo(nomes, dono, ("Spine", "Spine1", "Spine2"))]

    def frente_peito(z):
        """y da frente do peito (a pele mais à frente do tronco) na altura z."""
        ff = T[(np.abs(T[:, 2] - z) < 0.01) & (np.abs(T[:, 0]) < 0.15)]
        return float(ff[:, 1].min())

    print("OMBROS | E (%.4f %.4f %.4f) D (%.4f %.4f %.4f), %.3f m entre eles | tronco: cima (%.3f %.3f %.3f) frente (%.3f %.3f %.3f) | "
          "parte de baixo do peito E (%.4f %.4f %.4f), %.0f mm abaixo do ombro ao longo do tronco | frente do peito nessa altura y "
          "%.4f" % (*S["Left"], *S["Right"], larg_ombros, *cima, *frente, *baixo_p[1], -(baixo_p[1] - S["Left"]).dot(cima) * 1000,
                    frente_peito(z_baixo)), flush=True)

    # ── 3) mãos: o vão da mão em relação ao punho, no referencial da mão (dedos, palma) ──────────────────────────────────────────
    Lb = (cab("LeftForeArm") - cab("LeftArm")).length
    La = (cab("LeftHand") - cab("LeftForeArm")).length
    maos = Maos(bon, RAIO, polo_inicial=(0, 0.5, 0), polegar_modo="volta")

    def orientacao(s, u, f):
        """Dedos e palma da mão no pegador de eixo u (do lado do mindinho pro do polegar) com o antebraço na direção f: dedos ⟂ ao
        pegador, na direção do antebraço, PUNHO° pro lado do dorso (extensão); a palma do lado que a mão `s` fecha (dedos × polegar)."""
        u = Vector(u).normalized()
        d = (f - u * f.dot(u)).normalized()
        p0 = d.cross(u) * s
        dq = (d * math.cos(math.radians(PUNHO)) - p0 * math.sin(math.radians(PUNHO))).normalized()
        pq = (dq.cross(u) * s).normalized()
        return dq, pq

    def eixo_pegada(s, f, inclina=10.0):
        """Eixo do pegador (do mindinho pro polegar) ⟂ ao antebraço f, GIRO_PEGADA° da pegada pronada (polegar pro meio do corpo) pra
        neutra (polegar pra cima), inclinado `inclina`° pro lado do antebraço."""
        m = Vector((-s, 0.0, 0.0))
        u_pr = (m - f * m.dot(f)).normalized()
        u_ne = f.cross(u_pr).normalized()
        if u_ne.z < 0:
            u_ne = -u_ne
        g, i = math.radians(GIRO_PEGADA), math.radians(inclina)
        u = (u_pr * math.cos(g) + u_ne * math.sin(g)).normalized()
        return (u * math.cos(i) + f * math.sin(i)).normalized()

    # vão − punho no referencial (dedos, palma, dedos × palma) de cada mão: igual em qualquer pose dela (o vão é fixo no osso)
    OFF = {}
    for L, s in LADOS:
        f_r = (frente * 0.8 - cima * 0.3).normalized()
        dq_r, pq_r = orientacao(s, eixo_pegada(s, f_r), f_r)
        g_r = S[L] + Vector((s * 0.10, 0.0, 0.0)) + frente * 0.30 - cima * 0.08
        maos.segurar(L, g_r, dq_r, pq_r, polo=S[L] + Vector((s * 0.4, 0.3, -0.3)), zerar=True)
        off = g_r - cab(L + "Hand")
        OFF[L] = (off.dot(dq_r), off.dot(pq_r), off.dot(dq_r.cross(pq_r)))
        print("MÃO %s | vão − punho %.1f mm ao longo dos dedos, %.1f mm pra palma, %.1f mm de lado | erro do vão %.1f mm" % (
            L, OFF[L][0] * 1000, OFF[L][1] * 1000, OFF[L][2] * 1000, maos.erro[L] * 1000), flush=True)

    def vao_menos_punho(L, dq, pq):
        o = OFF[L]
        return dq * o[0] + pq * o[1] + dq.cross(pq) * o[2]

    def cotovelo(L, s, W, D, alvo=None):
        """Cotovelo no círculo que o braço deixa (ombro e punho dados): sem `alvo`, o ponto em que o antebraço fica o mais perto
        da direção D (a do empurrão naquele ponto do arco); com `alvo`, o que deixa a abertura do cotovelo mais perto de `alvo`
        graus, com o antebraço perto de D (meio peso). Devolve o centro do círculo, a direção do cotovelo (a partir do centro) e o
        raio."""
        d = W - S[L]
        u = d.normalized()
        a = (Lb ** 2 - La ** 2 + d.length_squared) / (2 * d.length)
        rho = math.sqrt(max(Lb ** 2 - a * a, 1e-8))
        Cc = S[L] + u * a
        e1 = -(D - u * u.dot(D)).normalized()
        if alvo is None:
            return Cc, e1, rho
        e2 = u.cross(e1)
        melhor = None
        for k in range(-120, 121, 2):
            e = e1 * math.cos(math.radians(k)) + e2 * math.sin(math.radians(k))
            E = Cc + e * rho
            custo = abs(_abertura(E - S[L], cima, lado, -s) - alvo) + 0.5 * math.degrees((W - E).angle(D))
            if melhor is None or custo < melhor[0]:
                melhor = (custo, e)
        return Cc, melhor[1], rho

    def relogio(L, s, W):
        """Círculo que o braço deixa (ombro e punho dados): centro, raio e as 2 direções de referência no plano dele — `baixo` (o
        pra baixo do tronco, ⟂ à reta ombro → punho) e `fora` (pro lado de fora do corpo, ⟂ às duas)."""
        d = W - S[L]
        u = d.normalized()
        a = (Lb ** 2 - La ** 2 + d.length_squared) / (2 * d.length)
        rho = math.sqrt(max(Lb ** 2 - a * a, 1e-8))
        baixo = -cima - u * u.dot(-cima)
        baixo.normalize()
        fora = -s * lado
        fora = (fora - u * u.dot(fora) - baixo * baixo.dot(fora)).normalized()
        return S[L] + u * a, rho, baixo, fora

    def cotovelo_relogio(L, s, W, theta):
        """Cotovelo no círculo que o braço deixa, na posição `theta` graus do "relógio" (0 = embaixo da reta ombro → punho, 90 = pro
        lado de fora): o mesmo theta o movimento todo = o cotovelo fica sempre do mesmo jeito em relação à reta ombro → mão."""
        Cc, rho, baixo, fora = relogio(L, s, W)
        t_ = math.radians(theta)
        return Cc, baixo * math.cos(t_) + fora * math.sin(t_), rho

    # ── 4) o começo (t=0), o eixo do braço esquerdo e o fim (t=1): a cena acha o giro do eixo no plano do chão (PSI: as mãos chegam a
    #    PEGADA1), o quanto o pegador fica à frente da vertical do eixo no começo (o fim fica DECL° abaixo da perpendicular ao tronco)
    #    e a inclinação do pegador (o desvio do punho dividido entre o começo e o fim do arco) ──────────────────────────────────────
    x_peg0 = PEGADA0 * larg_ombros / 2
    g0 = {s: Vector((s * x_peg0, frente_peito(z_baixo) - FRENTE0, z_baixo)) for _, s in LADOS}
    d1 = math.sqrt(Lb ** 2 + La ** 2 + 2 * Lb * La * math.cos(math.radians(COTOVELO1)))   # ombro → punho com o cotovelo em COTOVELO1

    def tangente(g, P, a):
        """Direção em que o pegador anda no arco em volta do eixo (P, a) quando o braço gira > 0: o empurrão."""
        return a.cross(g - P).normalized()

    def eixo_de(psi_g, pende_g):
        """Eixo do braço esquerdo com o giro psi_g° no plano do chão: (cubo, direção), com o pegador do começo pende_g° atrás da
        vertical do eixo (− = à frente), no plano do giro, e o cubo em |x| = X_EIXO."""
        psi, a0 = math.radians(psi_g), math.radians(pende_g)
        a = Vector((-math.cos(psi), math.sin(psi), 0.0))     # girar > 0 = empurrar (pra frente e pro meio)
        h = Vector((-math.sin(psi), -math.cos(psi), 0.0))    # pra frente no plano do giro (a tangente embaixo do eixo)
        R = (Z_EIXO - g0[1].z) / math.cos(a0)
        C = g0[1] + Vector((0, 0, 1)) * (R * math.cos(a0)) + h * (R * math.sin(a0))
        return C + a * ((X_EIXO - C.x) / a.x), a

    def comeco(L, s, D, inclina):
        """Cotovelo, punho, antebraço e eixo do pegador no começo, com o antebraço perto da linha do empurrão D."""
        f = D.copy()
        for _ in range(8):                         # antebraço ↔ eixo do pegador ↔ orientação da mão ↔ cotovelo
            u = eixo_pegada(s, f, inclina)
            dq, pq = orientacao(s, u, f)
            W = g0[s] - vao_menos_punho(L, dq, pq)
            Cc, e, rho = cotovelo(L, s, W, D, alvo=ABRE0)
            E = Cc + e * rho
            f = (W - E).normalized()
        return E, W, f, u

    def no_arco(P, a, u0, beta):
        """Pegador esquerdo (centro e eixo) com o braço girado `beta` graus em volta do eixo (P, a)."""
        return _gira(g0[1], P, a, beta), Matrix.Rotation(math.radians(beta), 3, a) @ u0

    def punho_no(g, u, f=None):
        dq, pq = orientacao(1, u, (g - S["Left"]).normalized() if f is None else f)
        return g - vao_menos_punho("Left", dq, pq)

    def fim(P, a, u0):
        """Arco (graus) em que o cotovelo esquerdo fica dobrado só COTOVELO1°."""
        lo, hi = 0.0, 90.0
        for _ in range(36):
            meio = (lo + hi) / 2
            if (punho_no(*no_arco(P, a, u0, meio)) - S["Left"]).length < d1:
                lo = meio
            else:
                hi = meio
        return (lo + hi) / 2

    def montar_eixo(psi_g, pende_g, inclina):
        P, a = eixo_de(psi_g, pende_g)
        E0, W0, f0, u0 = comeco("Left", 1, tangente(g0[1], P, a), inclina)
        arco = fim(P, a, u0)
        g1, u1 = no_arco(P, a, u0, arco)
        w1 = punho_no(g1, u1) - S["Left"]
        w1s = w1 - lado * w1.dot(lado)
        decl = -math.degrees(math.atan2(w1s.dot(cima), w1s.dot(frente)))
        # o antebraço no fim: o cotovelo no mesmo "relógio" do começo
        Cc0, _, b0, fo0 = relogio("Left", 1, W0)
        e0_ = (E0 - Cc0).normalized()
        th = math.degrees(math.atan2(e0_.dot(fo0), e0_.dot(b0)))
        W1 = punho_no(g1, u1)
        Cc1, e1_, r1 = cotovelo_relogio("Left", 1, W1, th)
        f1 = (W1 - (Cc1 + e1_ * r1)).normalized()
        geo0 = math.degrees(math.asin(max(-1, min(1, f0.dot(u0)))))
        geo1 = math.degrees(math.asin(max(-1, min(1, f1.dot(u1)))))
        return dict(P=P, a=a, E0=E0, W0=W0, f0=f0, u0=u0, arco=arco, g1=g1, u1=u1, decl=decl, geo0=geo0, geo1=geo1, theta=th)

    psi, pende, inclina = 20.0, 0.0, 10.0
    for volta in range(4):
        lo, hi = 0.0, 40.0                                   # PSI: mais giro = as mãos fecham mais no fim
        for _ in range(12):
            meio = (lo + hi) / 2
            if 2 * montar_eixo(meio, pende, inclina)["g1"].x / larg_ombros > PEGADA1:
                lo = meio
            else:
                hi = meio
        psi = (lo + hi) / 2
        lo, hi = -35.0, 15.0                                 # pegador atrás da vertical do eixo: mais = o fim mais declinado
        for _ in range(12):
            meio = (lo + hi) / 2
            if montar_eixo(psi, meio, inclina)["decl"] < DECL:
                lo = meio
            else:
                hi = meio
        pende = (lo + hi) / 2
        m = montar_eixo(psi, pende, inclina)
        inclina -= (m["geo0"] + m["geo1"]) / 2 - GEO_MEIO
        print("   volta %d | PSI %.2f° | pegador %.2f° atrás da vertical do eixo | inclinação do pegador %.1f° | fim %.1f° abaixo da "
              "perpendicular | antebraço × pegador %.1f° → %.1f° | pegada no fim %.2f" % (
                  volta, psi, pende, inclina, m["decl"], m["geo0"], m["geo1"], 2 * m["g1"].x / larg_ombros), flush=True)
    PSI, PENDE0, INCLINA_PEGADA = psi, pende, inclina
    m = montar_eixo(PSI, PENDE0, INCLINA_PEGADA)
    P_L, a_L, E0, W0, f0, u0, ARCO, g1, u1 = (m[k] for k in ("P", "a", "E0", "W0", "f0", "u0", "arco", "g1", "u1"))
    D0 = tangente(g0[1], P_L, a_L)
    flex0 = math.degrees((E0 - S["Left"]).angle(W0 - E0))
    R_alav = (g0[1] - P_L).length

    def ao_longo(v):
        """(frente, cima) do ponto v em relação aos ombros, no referencial do tronco (m)."""
        r = v - So
        return r.dot(frente), r.dot(cima)

    w1 = punho_no(g1, u1) - S["Left"]
    w1s = w1 - lado * w1.dot(lado)
    print("COMEÇO | pegador E (%.4f %.4f %.4f): %.0f mm à frente da frente do peito, %.0f mm abaixo dos ombros (ao longo do tronco) | "
          "cotovelo (%.3f %.3f %.3f) dobrado %.0f°, %.0f mm abaixo do ombro (ao longo do tronco) | abertura %.0f° | antebraço %.1f° "
          "da linha do empurrão (que sai %.1f° acima da horizontal) | pegada %.2f × ombros | eixo do pegador (%.3f %.3f %.3f), "
          "inclinado %.1f° | pegador %.1f° atrás da vertical do eixo" % (
              *g0[1], (frente_peito(z_baixo) - g0[1].y) * 1000, -ao_longo(g0[1])[1] * 1000, *E0, flex0,
              -(E0 - S["Left"]).dot(cima) * 1000, _abertura(E0 - S["Left"], cima, lado, -1), math.degrees(f0.angle(D0)),
              math.degrees(math.asin(max(-1, min(1, D0.z)))), 2 * x_peg0 / larg_ombros, *u0, INCLINA_PEGADA, PENDE0), flush=True)
    print("FIM | pegador E (%.4f %.4f %.4f), %.0f mm acima do começo | pegada %.2f × ombros (convergiu %.0f mm cada mão) | curso %.3f m "
          "| arco %.1f° | PSI %.1f° | reta ombro → punho %.1f° abaixo da perpendicular ao tronco, %.1f° acima da horizontal | eixo do "
          "braço E: cubo (%.3f %.4f %.3f), %.0f mm à frente dos ombros e %.0f mm acima (no mundo) | braço da alavanca %.3f m" % (
              *g1, (g1.z - g0[1].z) * 1000, 2 * g1.x / larg_ombros, (x_peg0 - g1.x) * 1000, (g1 - g0[1]).length, ARCO, PSI,
              -math.degrees(math.atan2(w1s.dot(cima), w1s.dot(frente))), math.degrees(math.atan2(w1.z, w1.xy.length)),
              *P_L, (So.y - P_L.y) * 1000, (P_L.z - So.z) * 1000, R_alav), flush=True)

    # ── 5) a máquina em volta do corpo: a barra do pegador vai BARRA_PEG da ponta de baixo dele até a ponta do braço, na linha dele;
    #    o braço em "V" (cubo → joelho → ponta), com o joelho pra frente, por fora do ombro ──────────────────────────────────────────
    ponta = g0[1] - u0 * (COMP_PEGADOR / 2 + BARRA_PEG)
    dd = ponta - P_L
    joelho = P_L + dd * DOBRA[0] + Vector((0.0, -1.0, 0.0)) * (DOBRA[1] * dd.length)
    mq = e3.supino_declinado_articulado("decl_art", eixo=tuple(P_L), direcao=tuple(a_L), braco=[tuple(joelho), tuple(ponta)],
                                        pegadores=(tuple(g0[1]), tuple(u0), COMP_PEGADOR, RAIO),
                                        assento=(y_frente, y_tras, topo, LARG_ASSENTO, ESP_ASSENTO),
                                        encosto=(y_base, ENCOSTO, ALT_ENCOSTO, LARG_ENCOSTO, ESP_ENCOSTO), cabeceira=CABECEIRA,
                                        x_poste=X_POSTE, y_frente=float(H.y) - 0.62, anilha=ANILHA)
    print("MÁQUINA | cubo E (%.3f %.3f %.3f), eixo (%.3f %.3f %.3f) | joelho E (%.3f %.3f %.3f) | ponta E (%.3f %.3f %.3f) | braço "
          "cubo → ponta %.3f m" % (*P_L, *a_L, *joelho, *ponta, dd.length), flush=True)

    # ── 6) pose: os braços da máquina giram no arco e cada mão vai junto com o pegador ─────────────────────────────────────────
    Cc0, _, baixo0, fora0 = relogio("Left", 1, W0)
    e0_ = (E0 - Cc0).normalized()
    THETA0 = math.degrees(math.atan2(e0_.dot(fora0), e0_.dot(baixo0)))
    print("COTOVELO no relógio da reta ombro → punho: %.1f° (0 = embaixo dela, 90 = pro lado de fora) — fica assim o movimento todo"
          % THETA0, flush=True)
    DEDOS, estado = {}, {}

    def maos_no_pegador(acertar=False):
        for L, s in LADOS:
            g, u = mq.pegada(s)
            P, a = mq.eixos[s]
            f = estado.get(L, tangente(g, P, a))
            for _ in range(4):                  # antebraço ↔ cotovelo ↔ orientação da mão (converge em 2–3 voltas)
                dq, pq = orientacao(s, u, f)
                W = g - vao_menos_punho(L, dq, pq)
                Cc, e, rho = cotovelo_relogio(L, s, W, THETA0)
                f = (W - (Cc + e * rho)).normalized()
            estado[L] = f
            maos.segurar(L, g, dq, pq, polo=Cc + e * (rho + 0.4), zerar=True)
            if acertar:
                maos.iks[L].mute = False
                p3.acertar_polo(rig, maos.iks[L], L + "ForeArm", L + "Arm", L + "Hand")
                maos.segurar(L, g, dq, pq, polo=Cc + e * (rho + 0.4), zerar=True)
            if L in DEDOS:                      # mão rígida no pegador redondo: os dedos e o polegar fechados no começo
                for n, M in DEDOS[L].items():
                    PB[n].matrix_basis = M.copy()
                p3.atualizar()

    def pose(t):
        """t=0 pegadores do lado da parte de baixo do peito, cotovelos dobrados; t=1 braços quase esticados, pra frente e pro meio."""
        if t <= 1e-9:
            estado.clear()                       # o começo não depende do quadro anterior
        mq.girar(p3.lerp(0.0, ARCO, t))
        maos_no_pegador()

    mq.girar(0.0)
    maos_no_pegador(acertar=True)               # polo certo do cotovelo com ele bem dobrado (embaixo)
    estado.clear()
    pose(0.0)
    pose.dedos = {}
    for L, s in LADOS:                          # dedos e polegar fecham UMA vez (o pegador é redondo: a mão gira em volta dele igual)
        g, u = mq.pegada(s)
        pose.dedos[L] = pg.fechar_em_volta(bon, L, g, u, RAIO)
        DEDOS[L] = {pb.name: pb.matrix_basis.copy() for pb in PB
                    if pb.name[len(p3.P):].startswith(L + "Hand") and pb.name[len(p3.P):] != L + "Hand"}
        print("DEDOS %s | %s" % (L, pose.dedos[L]), flush=True)

    def desvio_geo():
        """asin(antebraço · eixo do pegador), graus [E, D]: o quanto o antebraço sai do perpendicular ao pegador."""
        out = []
        for L, s in LADOS:
            f = (cab(L + "Hand") - cab(L + "ForeArm")).normalized()
            out.append(math.degrees(math.asin(max(-1.0, min(1.0, f.dot(mq.pegada(s)[1]))))))
        return out

    def info():
        jj = ck.posicoes(rig)
        juntas = ck.medir_juntas(rig)
        g, _ = mq.pegada(1)
        fr, ci = ao_longo(g)
        cE = cab("LeftForeArm") - S["Left"]
        return ("braços da máquina %.1f° | pegador E (%.3f %.3f %.3f), %.0f mm à frente e %.0f mm acima dos ombros (tronco) | "
                "cotovelo %.0f/%.0f°, %.0f mm abaixo do ombro (tronco) | abertura %s° | braço à frente %s° | braço no plano %s° | "
                "elevação %s° | antebraço × horizontal %s° | punho %.0f/%.0f° (flexão %s, desvio %s, antebraço × pegador %s) | "
                "palma × cima %s° | palma pro meio %s° | pegada %.2f | escápula %s mm | tronco %.1f° | coluna %.1f° | cabeça %s° | %s" % (
                    mq.angulo, *g, fr * 1000, ci * 1000, juntas["cotoveloE"], juntas["cotoveloD"], -cE.dot(cima) * 1000,
                    "/".join("%.0f" % v for v in tc.braco_abertura(jj)), "/".join("%.0f" % v for v in tc.braco_frente(jj)),
                    "/".join("%.0f" % v for v in tc.braco_plano(jj)), "/".join("%.0f" % v for v in tc.braco_elevacao(jj)),
                    "/".join("%.0f" % v for v in ck.angulo_chave(rig, {"medida": "inclinacao", "segmento": ["ForeArm", "Hand"]})),
                    juntas["punhoE"], juntas["punhoD"], "/".join("%.0f" % v for v in tc.punho_flexao(jj)),
                    "/".join("%.0f" % v for v in tc.punho_desvio(jj)), "/".join("%.0f" % v for v in desvio_geo()),
                    "/".join("%.0f" % v for v in tc.palma_cima(jj)),
                    "/".join("%.0f" % v for v in tc.palma_dentro(jj)), tc.pegada_largura(jj)[0],
                    "/".join("%.0f" % v for v in tc.escapula_frente(jj)),
                    math.degrees(math.atan2(math.hypot(*(jj["Neck"][:2] - jj["Hips"][:2])), jj["Neck"][2] - jj["Hips"][2])),
                    tc.coluna(jj)[0], "/".join("%.0f" % v for v in tc.cabeca_tronco(jj)), maos.info()))

    for k in range(25):                         # os 25 quadros da exportação (o cotovelo segue o quadro anterior)
        t = p3.suave(k / 24)
        pose(t)
        if k % 6 == 0:
            print("t=%.2f | %s" % (t, info()), flush=True)
    pose(0.0)

    pegs = [(L, ck.Barra(mq.pegadores[s], RAIO, COMP_PEGADOR / 2, eixo=(0, 0, 1))) for L, s in LADOS]
    yq = float(H.y)
    return Cena(pose, mq.equipamentos, pegadas=pegs, apoio_mm=0.0, foco_luz=(0, yq + 0.05, 1.0),
                camera_video=((3.6, yq - 3.0, 1.75), (0, yq + 0.05, 1.0), 50), info=info, apoios=mq.apoios,
                afunda_apoio_mm=20)
