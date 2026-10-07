# Crucifixo na Máquina — cena da fábrica 3D (lote 5, 07/10/2026). Máquina nova: equip3d.voador (voador com pegadores verticais: 2
# braços pendurados no alto, cada um girando em volta da vertical do ombro do mesmo lado; assento, encosto, estrutura e pilha) — a
# mesma peça serve ao Crucifixo Invertido na Máquina.
# t = 0 braços abertos pros lados, um pouco abaixo da altura dos ombros, cotovelos levemente dobrados e apontando pra trás, o braço
# um pouco atrás da linha dos ombros e as mãos nela · t = 1 braços fechados na frente do peito, as mãos quase se encostando, os
# cotovelos apontando pros lados.
# Técnica: ExRx, Lever Seated Fly: "Sit on machine with back on pad. Grasp handles to both sides, shoulder height. Slightly bend
# elbows and internally rotate shoulders so elbows are back." / "Keeping elbows pointed high, push lever handles forward and
# together. Return to back toward original position until mild stretch is felt in chest or shoulder." / "Shoulders are kept
# internally rotated so elbows are pointing out to sides." NSCA (Achievable CSCS, Pec deck (machine)): "Sit with five-point
# contact." / "Grasp the handles with a closed, neutral grip." / "Align your midchest with the handles." / "Pull the handles toward
# each other with a slight bend in your elbows until they touch." / "Let the handles return outward to the starting position."
# eGym, M13 Butterfly: "Sit with your back straight against the backrest." / "Hold the handles between chest and shoulder height.
# Keep your elbows slightly bent." / "Start with your arms open to the sides until light tension is felt in the chest." / "Bring the
# handles together against the resistance. Keep your shoulders lowered and elbows slightly bent." Hoist HD-3900 Pec Fly/Rear Delt:
# "Sit facing away from the machine with your back in an upright position against the pad." / "bring your hands together in a
# sweeping arc until they are almost touching".
# Como o rig faz: sentado como no supino sentado (o corpo inclina pra trás em volta do quadril até o glúteo e a parte de cima das
# costas encostarem juntos num encosto 5° atrás da vertical; coxas na horizontal e um pouco abertas, canelas em pé, pés chapados no
# chão) e a cabeça encosta no encosto (o pescoço estende o mínimo pra nuca chegar nele: o contato de 5 pontos da NSCA). O braço todo
# é UMA peça: o braço BAIXA° abaixo da horizontal e o antebraço na horizontal, girado pro lado que o braço fecha até o cotovelo
# dobrar COTOVELO° (o cotovelo aponta pra trás com o braço aberto e pro lado com o braço fechado), a mão quase reta no antebraço com a
# palma virada pra onde o braço anda (pegada neutra no pegador vertical, o polegar pra cima). Na montagem (t=0) a mão é posta no
# pegador (IK do braço + mão fechada em volta dele, o polegar dando a volta); daí o braço inteiro gira em volta da vertical do ombro
# (o úmero gira na articulação do ombro e o antebraço e a mão vão junto) e o braço da máquina gira o MESMO ângulo em volta do mesmo
# eixo: a mão não escorrega no pegador e o polegar fica na mesma postura em todos os quadros. Tronco, escápulas, cabeça, quadril,
# pernas e pés não mexem.
import math
import numpy as np
from mathutils import Matrix, Vector
from mathutils.kdtree import KDTree
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
import tecnica3d as tc
from maos3d import Maos
from cena import Cena

LADOS = (("Left", 1), ("Right", -1))      # s = +1 no esquerdo (+X)
ENCOSTO = 5.0             # encosto 5° atrás da vertical: tronco em pé ("Sit facing away from the machine with your back in an upright
                          # position against the pad", Hoist; "Sit with your back straight against the backrest", eGym)
ESP_ENCOSTO, LARG_ENCOSTO = 0.06, 0.28    # estofado de 60 mm; largura: escolha da fábrica (os braços passam por fora dele)
ESP_ASSENTO, LARG_ASSENTO = 0.06, 0.38    # estofado de 60 mm; largura: escolha da fábrica
PROF_ASSENTO = 0.36       # do encosto até a borda da frente (escolha da fábrica: a coxa passa da borda, o joelho fica livre)
AFUNDA = 0.002            # pele afundando no estofado do assento e do encosto
ABRE_COXA = 5.0           # coxas abertas 5° pra fora: pés um pouco mais abertos que o quadril (juntas, as coxas se tocavam)
COTOVELO = 20.0           # flexão do cotovelo, parada ("Slightly bend elbows", ExRx; "with a slight bend in your elbows", NSCA)
BAIXA = 12.0              # braço 12° abaixo da horizontal e o antebraço na horizontal: o cotovelo e a mão ficam uns 6 cm abaixo da
                          # articulação do ombro ("Grasp handles to both sides, shoulder height" e "Keeping elbows pointed high", ExRx;
                          # "Hold the handles between chest and shoulder height", eGym). Com o antebraço inclinado pra baixo junto com
                          # o braço, o pegador vertical pedia 15–17° de desvio radial no punho (prévia de 07/10/2026)
ABRE0 = -12.0             # começo: o braço (ombro → cotovelo) 12° atrás do plano dos ombros, visto de cima; com o cotovelo dobrado a
                          # mão fica na linha dos ombros ("until mild stretch is felt in chest or shoulder", ExRx; "Start with your
                          # arms open to the sides until light tension is felt in the chest", eGym)
VAO_MAOS = 0.020          # fim: as 2 mãos a 2 cm uma da outra ("until they are almost touching", Hoist; "until they touch", NSCA)
RAIO = 0.0145             # pegador de 29 mm (o cilindro da mão de referência; escolha da fábrica)
COMP_PEGADOR = 0.16
QUEDA = 0.68              # do topo do pegador até o cubo dos braços no alto (a máquina fica com ~1,85 m de altura)
MAO = {L: tuple([L + "Hand"] + ["%sHand%s%d" % (L, d, i) for d in ("Thumb", "Index", "Middle", "Ring", "Pinky")
                                for i in (1, 2, 3)]) for L, _ in LADOS}


def _malha(bon):
    return ck._avaliar(bon.corpo, 1)


def _grupo(nomes, dono, partes):
    return np.array([n in partes for n in nomes] + [False])[dono]


def montar(bon):
    pg.usar_polegar("volta")          # polegar dando a volta no pegador (padrão dos exercícios novos)
    rig = bon.rig
    PB = rig.pose.bones
    Z = Vector((0.0, 0.0, 1.0))

    def cab(n):
        return p3.cabeca(rig, n)

    def pele(partes):
        co, _, (nomes, dono) = _malha(bon)
        return co[_grupo(nomes, dono, partes)]

    # ── 1) sentado: coxas na horizontal e um pouco abertas, canelas em pé, pés chapados no chão (a planta no chão) ──────────────
    PERNA = ("Hips",) + tuple(L + o for L, _ in LADOS for o in ("UpLeg", "Leg", "Foot", "ToeBase"))
    repouso = {n: PB[p3.P + n].matrix_basis.copy() for n in PERNA}
    pivo0 = (cab("LeftUpLeg") + cab("RightUpLeg")) / 2
    pe_rep = {L: p3.mundo_osso(rig, L + "Foot").to_3x3().normalized() for L, _ in LADOS}   # sola chapada (repouso)
    f_rep = {L: cab(L + "ToeBase") - cab(L + "Foot") for L, _ in LADOS}
    a_enc = math.radians(ENCOSTO)
    n_enc = Vector((0, -math.cos(a_enc), math.sin(a_enc)))   # normal da face do encosto (pro corpo)
    nn = np.array(n_enc)

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
        return float((g @ nn).min()), float((c @ nn).min())

    # o quanto o corpo inclina pra trás: o glúteo e as costas encostam JUNTOS no encosto ("Sit facing away from the machine with
    # your back in an upright position against the pad", Hoist; "Sit with five-point contact", NSCA)
    lo, hi = -5.0, 25.0
    for _ in range(12):
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
    # a cabeça fica como está, na linha do tronco e olhando pra frente: no boneco a nuca fica ~6 cm à frente da linha das costas e
    # encostá-la no encosto pedia ~19° de pescoço pra trás (olhando pra cima; sonda de 07/10/2026) — o encosto sobe até atrás dela
    cabeca_v = pele(("Head",))
    nuca = Vector(cabeca_v[(cabeca_v @ nn).argmin()])
    z_baixo = topo + 0.012                                   # o estofado do encosto começa 1,2 cm acima do assento
    y_face = (math.sin(a_enc) * z_baixo - d_enc) / math.cos(a_enc)
    alt_enc = (nuca.z + 0.07 - z_baixo) / math.cos(a_enc)    # até 7 cm acima de onde a nuca encosta
    print("SENTADO | reclina %.2f° | glúteo × costas %.1f mm | quadril (%.4f %.4f %.4f) | assento topo %.4f, y %.3f → %.3f | "
          "encosto y_base %.4f | nuca (%.3f %.3f %.3f) a %.1f mm do encosto | encosto %.3f m" % (
              reclina, (dg - dc) * 1000, *H, topo, y_frente, y_tras, y_base, *nuca,
              (float(nuca.dot(n_enc)) - d_enc) * 1000, alt_enc), flush=True)

    # ── 2) o braço como uma peça só: direção do braço, do antebraço e da palma em função do giro em volta da vertical do ombro ──
    S = {L: cab(L + "Arm") for L, _ in LADOS}                # articulação do ombro: o eixo do braço da máquina passa aqui
    Lb = (cab("LeftForeArm") - cab("LeftArm")).length
    La = (cab("LeftHand") - cab("LeftForeArm")).length
    maos = Maos(bon, RAIO, polo_inicial=(0, 0.5, 0), polegar_modo="volta")

    def modelo(s, psi):
        """Braço, antebraço e palma (mundo) do lado s com o braço girado psi graus a partir do lado (0 = braço apontando pro
        lado, 90 = pra frente), BAIXA° abaixo da horizontal; o antebraço na horizontal, girado pro lado em que o braço fecha até o
        cotovelo dobrar COTOVELO°, e a palma virada pra onde o braço anda (horizontal, ⟂ ao antebraço)."""
        lat, fr = Vector((s, 0.0, 0.0)), Vector((0.0, -1.0, 0.0))
        ps, eb, fi = math.radians(psi), math.radians(BAIXA), math.radians(COTOVELO)
        h = lat * math.cos(ps) + fr * math.sin(ps)          # braço visto de cima
        f = -lat * math.sin(ps) + fr * math.cos(ps)         # pra onde o braço anda fechando (horizontal, ⟂ a h)
        b = h * math.cos(eb) - Z * math.sin(eb)
        ga = math.acos(min(1.0, math.cos(fi) / math.cos(eb)))   # ângulo, visto de cima, entre o braço e o antebraço
        a = h * math.cos(ga) + f * math.sin(ga)
        p = -h * math.sin(ga) + f * math.cos(ga)
        return b, a, p

    def juntas(L, s, psi):
        b, a, p = modelo(s, psi)
        E = S[L] + b * Lb
        return b, a, p, E, E + a * La

    def polo(L, E, W):
        eixo = (W - S[L]).normalized()
        fora = (E - S[L]) - eixo * (E - S[L]).dot(eixo)
        return E + fora.normalized() * 0.4

    # referência no começo: (1) quanto a mão gira em volta da normal da palma pra a linha dos nós dos dedos (onde passa o eixo do
    # pegador) ficar na VERTICAL (o pegador é vertical) — o giro fica no punho, de lado; (2) o vão da mão em relação ao punho, no
    # referencial da mão (dedos, palma, dedos × palma)
    giro, OFF = {}, {}
    for L, s in LADOS:
        b, a, p, E, W = juntas(L, s, ABRE0)
        maos.segurar(L, W + a * 0.08, a, p, polo=polo(L, E, W))
        maos.iks[L].mute = False
        e = p3.acertar_polo(rig, maos.iks[L], L + "ForeArm", L + "Arm", L + "Hand")
        maos.segurar(L, W + a * 0.08, a, p, polo=polo(L, E, W))
        nos = pg._base(rig, L)[1]
        nos_p = (nos - p * nos.dot(p)).normalized()
        quer = Z if nos_p.dot(Z) > 0 else -Z
        giro[L] = math.atan2(nos_p.cross(quer).dot(p), nos_p.dot(quer))
        dq = Matrix.Rotation(giro[L], 3, p) @ a
        maos.segurar(L, W + dq * 0.08, dq, p, polo=polo(L, E, W))
        g = W + dq * 0.08
        off = g - cab(L + "Hand")
        lat = dq.cross(p)
        OFF[L] = (off.dot(dq), off.dot(p), off.dot(lat))
        nos2 = pg._base(rig, L)[1]
        print("REF %s | polo erro %.3f ang %d | giro da mão %.1f° | nós × vertical antes %.1f° depois %.1f° | vão − punho no "
              "referencial da mão (%.3f %.3f %.3f)" % (L, e[0], e[1], math.degrees(giro[L]), math.degrees(nos.angle(quer)),
                                                      math.degrees(min(nos2.angle(Z), nos2.angle(-Z))), *OFF[L]), flush=True)

    def mao_no_pegador(L, s, psi):
        """Vão da mão (eixo do pegador), dedos e palma com o braço girado psi graus."""
        b, a, p, E, W = juntas(L, s, psi)
        dq = Matrix.Rotation(giro[L], 3, p) @ a
        o = OFF[L]
        return W + dq * o[0] + p * o[1] + dq.cross(p) * o[2], dq, p, E, W

    # ── 3) mãos no pegador no começo (t=0): IK do braço, dedos e polegar fecham em volta do pegador vertical ─────────────────────
    g0, dedos = {}, {}
    for L, s in LADOS:
        g, dq, p, E, W = mao_no_pegador(L, s, ABRE0)
        maos.segurar(L, g, dq, p, polo=polo(L, E, W))
        g0[L] = g
        print("MÃO %s no começo | vão (%.4f %.4f %.4f) | cotovelo fora do calculado %.1f mm | punho fora %.1f mm | %s" % (
            L, *g, (cab(L + "ForeArm") - E).length * 1000, (cab(L + "Hand") - W).length * 1000, maos.info()), flush=True)
    for L, s in LADOS:
        dedos[L] = pg.fechar_em_volta(bon, L, g0[L], Z, RAIO)
        print("DEDOS %s | %s" % (L, dedos[L]), flush=True)

    # ── 4) o braço inteiro gira em volta da vertical do ombro: o úmero gira na articulação, o antebraço e a mão vão junto ────────
    M_ref = {L: PB[p3.P + L + "Arm"].matrix.copy() for L, _ in LADOS}

    def bracos(graus):
        for L, _ in LADOS:
            PB[p3.P + L + "Arm"].matrix = M_ref[L]
        p3.atualizar()
        if graus:
            for L, s in LADOS:
                p3.girar_osso(rig, L + "Arm", Matrix.Rotation(math.radians(-s * graus), 3, "Z"), pivo=S[L])

    def vao_maos():
        """Menor distância (m) entre a pele das 2 mãos."""
        co, _, (nomes, dono) = _malha(bon)
        A, B = co[_grupo(nomes, dono, MAO["Left"])], co[_grupo(nomes, dono, MAO["Right"])]
        kd = KDTree(len(B))
        for i, v in enumerate(B):
            kd.insert(Vector(v), i)
        kd.balance()
        return min(kd.find(Vector(v))[2] for v in A[::2])

    # fim: o giro em que as mãos ficam a VAO_MAOS uma da outra (bissecção; com as mãos se cruzando a distância é 0)
    lo, hi = 60.0, 130.0
    for _ in range(14):
        meio = (lo + hi) / 2
        bracos(meio)
        if vao_maos() > VAO_MAOS:
            lo = meio
        else:
            hi = meio
    ARCO = (lo + hi) / 2
    bracos(ARCO)
    jj = ck.posicoes(rig)
    print("FIM | giro dos braços %.1f° (braço de %.1f° a %.1f° visto de cima) | vão entre as mãos %.1f mm | braço_plano %s | "
          "pegada %.2f × ombros" % (ARCO, ABRE0, ABRE0 + ARCO, vao_maos() * 1000,
                                    "/".join("%.0f" % v for v in tc.braco_plano(jj)), tc.pegada_largura(jj)[0]), flush=True)
    bracos(0.0)

    # ── 5) a máquina em volta do corpo: eixos nas verticais dos ombros, pegadores onde as mãos fecham, assento e encosto ─────────
    vd = e3.voador("voador", eixos={s: (S[L].x, S[L].y) for L, s in LADOS}, pegadores={s: tuple(g0[L]) for L, s in LADOS},
                   assento=(y_frente, y_tras, topo, LARG_ASSENTO, ESP_ASSENTO),
                   encosto=(y_face, ENCOSTO, z_baixo, alt_enc, LARG_ENCOSTO, ESP_ENCOSTO), tras=1,
                   pegador=(COMP_PEGADOR, RAIO), queda=QUEDA)
    print("VOADOR | eixos E (%.4f %.4f) D (%.4f %.4f) | cubo dos braços z %.3f | pegador E (%.4f %.4f %.4f) a %.3f m do eixo" % (
        S["Left"].x, S["Left"].y, S["Right"].x, S["Right"].y, vd.eixos[1].z, *g0["Left"],
        Vector((g0["Left"].x - S["Left"].x, g0["Left"].y - S["Left"].y)).length), flush=True)

    def pose(t):
        """t=0 braços abertos (as mãos na linha dos ombros), t=1 braços fechados (as mãos quase se encostando)."""
        g = p3.lerp(0.0, ARCO, t)
        bracos(g)
        vd.girar(g)

    def info():
        jj = ck.posicoes(rig)
        jt = ck.medir_juntas(rig)
        c, _ = vd.pegada(1)
        cot = []                                         # pra onde o cotovelo aponta (o lado de fora da dobra), visto de cima
        cima_t, lado_t, frente_t = (Vector(v) for v in tc.eixos_tronco(jj))
        for L, s in LADOS:
            sh, el, wr = (Vector(jj[L + n]) for n in ("Arm", "ForeArm", "Hand"))
            ax = (wr - sh).normalized()
            pt = (el - sh) - ax * (el - sh).dot(ax)
            cot.append(math.degrees(math.atan2(pt.dot(frente_t), pt.dot(-s * lado_t))))
        dev = []                                         # punho de lado: + = a mão aponta mais pra baixo que o antebraço (ulnar)
        for L, s in LADOS:
            fa = (Vector(jj[L + "Hand"]) - Vector(jj[L + "ForeArm"])).normalized()
            mo = (Vector(jj[L + "HandMiddle1"]) - Vector(jj[L + "Hand"])).normalized()
            dev.append(math.degrees(math.asin(max(-1.0, min(1.0, fa.z))) - math.asin(max(-1.0, min(1.0, mo.z)))))
        return ("braços da máquina %.1f° | pegador E (%.3f %.3f %.3f), %.0f mm abaixo do ombro | cotovelo %.0f/%.0f° aponta %s° "
                "(0 = pro lado, −90 = pra trás) | braço plano %s° elevação %s° | antebraço × horizontal %s° | punho %.0f/%.0f° "
                "(mão %s° mais baixa que o antebraço) | "
                "palma × cima %s° | pegada %.2f | tronco %.1f° | escápula %s mm | %s" % (
                    vd.angulo, *c, (S["Left"].z - c.z) * 1000, jt["cotoveloE"], jt["cotoveloD"],
                    "/".join("%.0f" % v for v in cot), "/".join("%.0f" % v for v in tc.braco_plano(jj)),
                    "/".join("%.0f" % v for v in tc.braco_elevacao(jj)),
                    "/".join("%.0f" % v for v in ck.angulo_chave(rig, {"medida": "inclinacao", "segmento": ["ForeArm", "Hand"]})),
                    jt["punhoE"], jt["punhoD"], "/".join("%+.0f" % v for v in dev), "/".join("%.0f" % v for v in tc.palma_cima(jj)),
                    tc.pegada_largura(jj)[0],
                    math.degrees(math.atan2(math.hypot(*(jj["Neck"][:2] - jj["Hips"][:2])), jj["Neck"][2] - jj["Hips"][2])),
                    "/".join("%.0f" % v for v in tc.escapula_frente(jj)), maos.info()))

    for t in (0.0, 0.5, 1.0):
        pose(t)
        print("t=%.2f | %s" % (t, info()), flush=True)
    pose(0.0)

    pegs = [(L, ck.Barra(vd.pegadores[s], RAIO, COMP_PEGADOR / 2, eixo=(0, 0, 1))) for L, s in LADOS]
    yq = float(H.y)
    return Cena(pose, vd.equipamentos, pegadas=pegs, apoio_mm=0.0, foco_luz=(0, yq - 0.2, 1.0),
                camera_video=((2.6, yq - 3.0, 1.9), (0, yq - 0.15, 0.95), 50), info=info, apoios=vd.apoios,
                afunda_apoio_mm=20)
