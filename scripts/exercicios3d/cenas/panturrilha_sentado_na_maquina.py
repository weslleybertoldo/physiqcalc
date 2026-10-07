# Panturrilha Sentado na Máquina — cena da fábrica 3D (lote 5, 07/10/2026). Máquina nova: equip3d.panturrilha_sentado (assento fixo,
# degrau dos pés, braço com a almofada das coxas que gira em volta do eixo na reta dos quadris, barra com os pegadores em cima da
# almofada).
# t = 0 calcanhares embaixo, abaixo do degrau: tornozelo em 20° de flexão dorsal (panturrilha alongada) · t = 1 calcanhares em cima:
# 30° de flexão plantar. Técnica (ExRx, Lever Seated Calf Raise): "Sit on seat facing lever. [...] Place forefeet on platform with
# heels extending off. Position lower thighs under lever pads. [...] Place hands on top of thigh pads." / "Raise heels by
# extending ankles as high as possible. Lower heels by bending ankles until calves are stretched. Repeat." / "Movement is
# predominately Soleus. Gastrocnemius are in active insufficiency since knees are significantly bent." Amplitude do tornozelo da
# panturrilha sentado com o joelho a 90° de Kinoshita et al. (Front Physiol 2023, na máquina sentada Body-Solid GSCR349): "the
# ankle joint angle ranging from 20° dorsiflexed to 30° plantarflexed positions". Joelho a ~90° (Titan Seated Calf Raise Machine:
# "keeps your knees at a 90-degree angle"; Signorile et al. 2002: "the SOL can be targeted most effectively with the knee flexed
# at 90 degrees").
# Como o rig faz: sentado com o tronco em pé (sem encosto), as coxas 4° abertas (pés na largura do quadril), a canela em pé e o pé
# apontando na direção da coxa; a ponta do pé fica no degrau: a articulação da base dos dedos (MTP, cabeça do osso ToeBase) PARADA
# e os dedos deitados no degrau como no chão. Cada perna é um quadrilátero articulado no plano dela — quadril (parado, glúteo no
# assento) → joelho → tornozelo → base dos dedos (parada no degrau) —: pra cada ângulo do tornozelo sai a posição da coxa e da
# canela (um grau de liberdade só). Quando o calcanhar sobe, o tornozelo sobe e o joelho sobe junto: a coxa gira em volta do
# quadril (~15° no movimento todo, de 7° descendo pro joelho a 8° subindo), o joelho fica entre ~83° e ~93° de flexão. O braço da
# máquina gira em volta do eixo na reta dos quadris o MESMO ângulo da coxa: a almofada (inclinada como o topo da coxa logo acima
# do joelho, que desce pro joelho) fica encostada em cima das coxas sem escorregar, e as mãos vão junto com os pegadores da barra
# em cima dela (pegada pronada, os dedos na linha do antebraço; IK do braço + mão fechada em volta deles). Tronco, pelve, cabeça
# e dedos dos pés não mexem. O assento fica embaixo do glúteo e do começo da coxa: encosta em todo quadro e, no começo (coxa
# descendo), a pele de baixo dela afunda até ~14 mm no estofado de 3".
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
Z = Vector((0.0, 0.0, 1.0))
DORSI, PLANTAR = 20.0, 30.0   # tornozelo: 20° de flexão dorsal embaixo → 30° de flexão plantar em cima, a partir do neutro (o pé
                              # em pé, chapado; Kinoshita et al. 2023: "from 20° dorsiflexed to 30° plantarflexed"); amplitude
                              # normal 0–20° e 0–50° (Alazzawi et al. 2017, tabela 5)
ABRE = 4.0                    # coxas 4° pra fora: pés na largura do quadril (juntas, as coxas musculosas se tocam na virilha)
Z_DEGRAU = 0.18               # topo do degrau (escolha da fábrica): a almofada fica a ~0,75 m do chão, dentro da faixa da Titan
                              # ("Adjustable Knee Pad Height: 28.25-in. - 32-in." = 0,72–0,81 m) e o calcanhar embaixo fica longe
                              # da base no chão
PROF_DEGRAU, LARG_DEGRAU = 0.102, 0.508   # degrau de 20" × 4" (Life Fitness Signature Series Plate-Loaded Seated Calf Raise:
                                          # "Footplate: Textured, non-slip steel (20"L x 4"W)")
AFUNDA_PE = 0.001             # a pele dos dedos afunda na borracha do degrau
BORDA = 0.012                 # a borda de trás do degrau fica 1,2 cm atrás da base dos dedos (a cabeça dos metatarsos em cima)
PROF_ASSENTO, LARG_ASSENTO, ESP_ASSENTO = 0.254, 0.330, 0.076   # assento de 10" × 13" (Titan Seated Calf Raise Machine: "Seat
                              # Dimensions: 10-in. x 13-in.") com estofado de 3" (Body-Solid GSCR349: "ultra-thick 3" DuraFirm™
                              # padding on the seat and knee pads")
AFUNDA = 0.002                # pele afundando no estofado do assento
ALM_COMP, ALM_PROF, ALM_ESP = 0.419, 0.13, 0.076   # almofada de 16,5" (Titan: "Adjustable Knee Pad Length: 16.5-in."), 3" de
                              # estofado (GSCR349, acima); 13 cm ao longo da coxa: escolha da fábrica
ALM_ATRAS = 0.105             # meio da almofada 10,5 cm atrás do centro do joelho, ao longo da coxa: "lower thighs" (ExRx), logo
                              # acima do joelho, com a borda da frente atrás da patela
AFUNDA_ALM = 0.002            # a pele da coxa afunda na almofada (presa por cima)
RAIO = 0.0159                 # pegadores de 31,8 mm (os 2 tubos do quadro da almofada da GSCR349: "ø31.8 round end cap")
COMP_PEGADOR = 0.13
X_PEG = 0.19                  # pegadores na largura dos ombros (antebraços pra frente, paralelos)
ALT_PEG = 0.055               # eixo da barra dos pegadores 5,5 cm acima do topo da travessa (os dedos fecham por baixo dela)
FOLGA_BRACO = 0.02            # o braço da máquina passa 2 cm por fora da pele do quadril e da coxa do lado dele


def _malha(bon):
    return ck._avaliar(bon.corpo, 1)


def _grupo(nomes, dono, partes):
    return np.array([n in partes for n in nomes] + [False])[dono]


def montar(bon):
    pg.usar_polegar("volta")          # polegar dando a volta no pegador (padrão dos exercícios novos)
    pg.usar_cilindro(2000 * RAIO)     # mão de referência de um cilindro de 31,8 mm
    rig = bon.rig
    PB = rig.pose.bones

    def cab(n):
        return p3.cabeca(rig, n)

    def pele(partes):
        co, _, (nomes, dono) = _malha(bon)
        return co[_grupo(nomes, dono, partes)]

    # ── 1) medidas do repouso (em pé): ângulo neutro do tornozelo e a direção dos dedos (deitados no chão) ─────────────────────────
    PERNA = ("Hips",) + tuple(L + o for L, _ in LADOS for o in ("UpLeg", "Leg", "Foot", "ToeBase"))
    repouso = {n: PB[p3.P + n].matrix_basis.copy() for n in PERNA}
    jr = ck.posicoes(rig)
    TAU0 = {L: tc.tornozelo(jr)[k] for k, (L, _) in enumerate(LADOS)}       # neutro (pé chapado em pé), ~76°
    dedos_rep = {L: p3.ponta(rig, L + "ToeBase") - cab(L + "ToeBase") for L, _ in LADOS}
    print("REPOUSO | tornozelo neutro E %.1f° D %.1f°" % (TAU0["Left"], TAU0["Right"]), flush=True)

    # ── 2) sentado, no NEUTRO: coxa na horizontal (aberta ABRE°), canela em pé, pé no ângulo neutro apontando na direção da coxa,
    #    dedos deitados como no chão; o corpo desce até a pele dos dedos ficar no topo do degrau ────────────────────────────────────
    plano = {}                        # (d, n): direção pra frente no plano da perna e a normal do plano (giro + = sobe pra frente)
    for L, s in LADOS:
        a = math.radians(ABRE)
        d = Vector((s * math.sin(a), -math.cos(a), 0.0))
        plano[L] = (d, d.cross(Z).normalized())
    for n, M in repouso.items():
        PB[p3.P + n].matrix_basis = M.copy()
    p3.atualizar()
    for L, s in LADOS:
        d, nn = plano[L]
        h, k = cab(L + "UpLeg"), cab(L + "Leg")
        p3.girar_osso(rig, L + "UpLeg", (k - h).rotation_difference(d).to_matrix())
        k, a_ = cab(L + "Leg"), cab(L + "Foot")
        p3.girar_osso(rig, L + "Leg", (a_ - k).rotation_difference(-Z).to_matrix())
        f = cab(L + "ToeBase") - cab(L + "Foot")              # a canela (em pé) gira em volta dela mesma até o pé apontar pra d
        fh = Vector((f.x, f.y, 0.0))
        giro = math.atan2(fh.cross(d).dot(Z), fh.dot(d))
        p3.girar_osso(rig, L + "Leg", Matrix.Rotation(giro, 3, Z))
        tau = tc.tornozelo(ck.posicoes(rig))[0 if s > 0 else 1]
        p3.girar_osso(rig, L + "Foot", Matrix.Rotation(math.radians(TAU0[L] - tau), 3, nn))   # + = dorsal (o pé sobe)
        b = math.radians(s * ABRE)                            # dedos: a direção do repouso, virada ABRE° junto com a perna
        alvo = Matrix.Rotation(b, 3, Z) @ dedos_rep[L]
        t_ = p3.ponta(rig, L + "ToeBase") - cab(L + "ToeBase")
        p3.girar_osso(rig, L + "ToeBase", t_.rotation_difference(alvo).to_matrix())
    dedos = pele(("LeftToeBase", "RightToeBase"))           # a polpa dos dedos (2 cm ou mais à frente da base deles) no degrau
    dedos = dedos[dedos[:, 1] < cab("LeftToeBase").y - 0.02]
    p3.girar_osso(rig, "Hips", Matrix.Identity(3), mover=Vector((0, 0, Z_DEGRAU - AFUNDA_PE - float(dedos[:, 2].min()))))
    base = {n: PB[p3.P + n].matrix_basis.copy() for n in PERNA}

    # ── 3) o quadrilátero de cada perna (no plano dela): quadril H e base dos dedos M parados; coxa, canela e pé giram ─────────────
    geo = {}
    for L, s in LADOS:
        d, nn = plano[L]
        H, K, A, M = (cab(L + o) for o in ("UpLeg", "Leg", "Foot", "ToeBase"))

        def uv(P, H=H, d=d):
            v = P - H
            return np.array([v.dot(d), v.z])

        def ang(v):
            return math.atan2(v[1], v[0])

        k2, a2, m2 = uv(K), uv(A), uv(M)
        geo[L] = dict(H=H, M=m2, lt=float(np.linalg.norm(k2)), ls=float(np.linalg.norm(a2 - k2)), r=float(np.linalg.norm(m2 - a2)),
                      th0=ang(k2), as0=ang(a2 - k2), af0=ang(m2 - a2),
                      fora=max(abs((P - H).dot(nn)) for P in (K, A, M)))
        print("PERNA %s | coxa %.4f canela %.4f pé %.4f m | base dos dedos (no plano) %.4f à frente e %.4f abaixo do quadril | "
              "fora do plano %.1f mm | coxa %.1f° canela %.1f° pé %.1f°" % (
                  L, geo[L]["lt"], geo[L]["ls"], geo[L]["r"], m2[0], -m2[1], geo[L]["fora"] * 1000,
                  *(math.degrees(geo[L][k]) for k in ("th0", "as0", "af0"))), flush=True)

    def resolver(L, tau):
        """Ângulos da coxa e da canela (no plano da perna, rad, a partir da frente, + pra cima) com o tornozelo em `tau` graus
        (canela × pé) e a base dos dedos parada: H → joelho (lt) → tornozelo (ls) → M (r)."""
        g = geo[L]
        t = math.radians(tau)
        v = complex(g["ls"], 0.0) + g["r"] * complex(math.cos(t), math.sin(t))   # canela + pé, no referencial da canela
        R, dl = abs(v), math.atan2(v.imag, v.real)
        D = g["M"]
        dd = float(np.linalg.norm(D))
        cH = (g["lt"] ** 2 + dd ** 2 - R ** 2) / (2 * g["lt"] * dd)
        th = math.atan2(D[1], D[0]) + math.acos(max(-1.0, min(1.0, cH)))        # joelho pra cima
        Kp = g["lt"] * np.array([math.cos(th), math.sin(th)])
        E = D - Kp
        return th, math.atan2(E[1], E[0]) - dl

    TAU = {L: (TAU0[L] + DORSI, TAU0[L] - PLANTAR) for L, _ in LADOS}

    def pernas(t):
        """Tornozelo em lerp(neutro + DORSI, neutro − PLANTAR, t): coxa, canela, pé e dedos giram na normal do plano de cada perna a
        partir do neutro (os dedos voltam pra direção de sempre). Devolve o giro da coxa (graus, + = joelho subindo) por lado."""
        for n in PERNA:
            if n != "Hips":
                PB[p3.P + n].matrix_basis = base[n].copy()
        p3.atualizar()
        dth = {}
        for L, s in LADOS:
            g = geo[L]
            nn = plano[L][1]
            tau = p3.lerp(TAU[L][0], TAU[L][1], t)
            th, a_s = resolver(L, tau)
            a_f = a_s + math.radians(tau)
            p3.girar_osso(rig, L + "UpLeg", Matrix.Rotation(th - g["th0"], 3, nn))
            p3.girar_osso(rig, L + "Leg", Matrix.Rotation((a_s - g["as0"]) - (th - g["th0"]), 3, nn))
            p3.girar_osso(rig, L + "Foot", Matrix.Rotation((a_f - g["af0"]) - (a_s - g["as0"]), 3, nn))
            p3.girar_osso(rig, L + "ToeBase", Matrix.Rotation(-(a_f - g["af0"]), 3, nn))
            dth[L] = math.degrees(th - g["th0"])
        return dth

    TS = [k / 8 for k in range(9)]
    giros = {}
    for t in TS:
        dth = pernas(t)
        giros[t] = (dth["Left"] + dth["Right"]) / 2
        jj = ck.posicoes(rig)
        if t in (0.0, 0.5, 1.0):
            print("PERNAS t=%.2f | coxa %+.1f° | tornozelo %s | joelho %s | base dos dedos E (%.4f %.4f %.4f) | joelho E z %.4f" % (
                t, giros[t], "/".join("%.1f" % v for v in tc.tornozelo(jj)),
                "/".join("%.1f" % ck.medir_juntas(rig)[k] for k in ("joelhoE", "joelhoD")), *cab("LeftToeBase"),
                cab("LeftLeg").z), flush=True)

    # ── 4) o eixo do braço na reta das 2 articulações do quadril (paradas) ─────────────────────────────────────────────────────────
    pernas(0.0)
    HL, HR = cab("LeftUpLeg"), cab("RightUpLeg")
    ye, ze = (HL.y + HR.y) / 2, (HL.z + HR.z) / 2
    C = Vector((0.0, ye, ze))
    print("EIXO | quadris E (%.4f %.4f %.4f) D (%.4f %.4f %.4f) | eixo y %.4f z %.4f (desnível %.1f mm)" % (
        *HL, *HR, ye, ze, (HL - HR).yz.length * 1000), flush=True)

    def no_braco(P, graus):
        """Pontos (N×3) do mundo no quadro com o braço em `graus` → onde ficam no braço na montagem (gira de volta em volta do eixo)."""
        R = np.array(Matrix.Rotation(math.radians(-graus), 3, "X"))     # o braço gira −graus no X (girar(> 0) sobe): volta
        c = np.array(C)                                                   # +graus = linhas (P − c) @ R(−graus)
        return (P - c) @ R + c

    # ── 5) assento: embaixo do glúteo, 5 cm passando dele atrás (a frente do assento fica mais perto do quadril: ali a coxa quase não
    #    sobe nem desce quando gira). Quem senta é a pele de baixo do glúteo e do começo da coxa (ossos Hips e UpLeg): o topo fica
    #    na pele mais baixa do quadro em que ela está mais ALTA (no fim, coxa subindo), afundando AFUNDA — encosta em todo quadro;
    #    no começo (coxa descendo) a coxa afunda um pouco mais no estofado, na frente dele ───────────────────────────────────────
    G0 = pele(("Hips",))
    baixo = G0[G0[:, 2] < float(G0[:, 2].min()) + 0.03]
    y_tras = float(baixo[:, 1].max()) + 0.05
    y_frente = y_tras - PROF_ASSENTO
    minimo = {}
    for t in TS:
        pernas(t)
        co, _, (nomes, dono) = _malha(bon)
        P = co[_grupo(nomes, dono, ("Hips", "LeftUpLeg", "RightUpLeg"))]
        P = P[(P[:, 1] > y_frente) & (P[:, 1] < y_tras) & (np.abs(P[:, 0]) < LARG_ASSENTO / 2)]
        k = int(np.argmin(P[:, 2]))
        minimo[t] = (float(P[k, 2]), float(P[k, 1]))
    topo = max(z for z, _ in minimo.values()) + AFUNDA
    print("ASSENTO | y %.3f → %.3f (quadril y %.3f) | topo %.4f (%.0f mm abaixo do quadril) | pele mais baixa no assento: %s" % (
        y_frente, y_tras, ye, topo, (ze - topo) * 1000,
        " ".join("t%.2f %+.1f mm em y %.3f" % (t, (minimo[t][0] - topo) * 1000, minimo[t][1]) for t in (0.0, 0.5, 1.0))),
        flush=True)

    # ── 6) degrau: a borda de trás BORDA atrás da base dos dedos (a planta embaixo das cabeças dos metatarsos fica em cima dele, o
    #    arco e o calcanhar pra fora, atrás); quanto a sola afunda na borracha em cada quadro ──────────────────────────────────────
    pernas(0.0)
    MTP = cab("LeftToeBase")
    y_borda = MTP.y + BORDA
    for t in TS:
        pernas(t)
        co, _, (nomes, dono) = _malha(bon)
        m = _grupo(nomes, dono, ("LeftFoot", "LeftToeBase", "RightFoot", "RightToeBase"))
        P, dn = co[m], dono[m]
        em_cima = P[:, 1] < y_borda
        k = int(np.argmin(np.where(em_cima, P[:, 2], 9.0)))
        j = int(np.argmin(P[:, 2]))
        if t in (0.0, 0.25, 0.5, 0.75, 1.0):
            print("SOLA t=%.2f | em cima do degrau: mais baixa %+.1f mm do topo, %.1f mm à frente da base dos dedos (%s) | pé todo: "
                  "%+.1f mm (%.0f mm atrás da base dos dedos, %s)" % (
                      t, (P[k, 2] - Z_DEGRAU) * 1000, (MTP.y - P[k, 1]) * 1000, nomes[dn[k]], (P[j, 2] - Z_DEGRAU) * 1000,
                      (P[j, 1] - MTP.y) * 1000, nomes[dn[j]]), flush=True)
    pernas(0.0)
    P = pele(("LeftToeBase", "RightToeBase"))
    ponta = float(P[:, 1].min())
    print("DEGRAU | topo %.3f | borda de trás y %.4f (%.0f mm atrás da base dos dedos) | ponta dos dedos y %.4f (%.0f mm da frente "
          "do degrau)" % (Z_DEGRAU, y_borda, BORDA * 1000, ponta, (ponta - (y_borda - PROF_DEGRAU)) * 1000), flush=True)

    # ── 7) almofada: em cima das coxas, ALM_ATRAS atrás do joelho; inclinação e altura que encostam na pele do movimento todo (a pele
    #    de cada quadro levada pro braço na montagem) ─────────────────────────────────────────────────────────────────────────────
    pernas(0.0)
    KL, KR = cab("LeftLeg"), cab("RightLeg")
    Km = (KL + KR) / 2
    u0 = Vector((0.0, Km.y - ye, Km.z - ze)).normalized()      # ao longo das coxas, pro joelho (na montagem)
    w0 = u0.cross(Vector((1.0, 0.0, 0.0)))
    c0 = Vector((0.0, Km.y, Km.z)) - u0 * ALM_ATRAS            # meio da almofada na linha das coxas
    pts = []
    for t in TS:
        pernas(t)
        P = pele(("LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg"))
        P = no_braco(P, giros[t] - giros[0.0])
        pts.append(P)
    P = np.concatenate(pts) - np.array(c0)
    su, sw = P @ np.array(u0), P @ np.array(w0)
    dentro = (np.abs(P[:, 0]) < ALM_COMP / 2) & (np.abs(su) < ALM_PROF / 2 + 0.01) & (sw > 0)
    su, sw = su[dentro], sw[dentro]
    perfil = []
    for k in range(-7, 8):                                      # perfil da pele mais alta ao longo da almofada (debug)
        m_ = np.abs(su - k * 0.01) < 0.005
        if m_.any():
            perfil.append("%+.0f:%.0f" % (k * 10, float(sw[m_].max()) * 1000))
    print("PERFIL da coxa embaixo da almofada (mm ao longo → mm acima da linha): %s" % " ".join(perfil), flush=True)
    melhor = None
    for k in range(-60, 61):                                    # inclinação da almofada em volta do X (graus)
        b = math.tan(math.radians(k * 0.5))
        h = float((sw - b * su).max())                          # a face de baixo encosta no ponto mais alto
        perto = np.abs(su) < ALM_PROF / 2
        folgas = h + b * su[perto] - sw[perto]
        ruim = max(float(np.percentile(folgas[su[perto] > 0.02], 5)), float(np.percentile(folgas[su[perto] < -0.02], 5)))
        if melhor is None or ruim < melhor[0]:
            melhor = (ruim, k * 0.5, h)
    _, inc, h = melhor
    u_a = (u0 * math.cos(math.radians(inc)) + w0 * math.sin(math.radians(inc))).normalized()
    c_a = c0 + w0 * (h - AFUNDA_ALM)
    print("ALMOFADA | meio da face de baixo (%.4f %.4f) | inclinada %+.1f° em relação à linha das coxas | %.0f mm acima da linha | "
          "a %.3f m do chão | folga nas pontas %.1f mm" % (c_a.y, c_a.z, inc, (h - AFUNDA_ALM) * 1000, c_a.z, melhor[0] * 1000),
          flush=True)

    # ── 8) o braço passa por fora do quadril e da coxa do lado dele ─────────────────────────────────────────────────────────────
    pernas(0.0)
    P = pele(("Hips", "RightUpLeg"))
    P = P[(P[:, 2] > ze - 0.12) & (P[:, 1] > Km.y)]
    x_braco = float(np.abs(P[:, 0]).max()) + FOLGA_BRACO + 0.025
    print("BRAÇO | quadril/coxa direitos até |x| %.3f → braço em |x| %.3f" % (float(np.abs(P[:, 0]).max()), x_braco), flush=True)

    # ── 9) a máquina em volta do corpo (montada no começo, t=0) ──────────────────────────────────────────────────────────────────
    mq = e3.panturrilha_sentado("panturrilha", eixo=(ye, ze), assento=(y_frente, y_tras, topo, LARG_ASSENTO, ESP_ASSENTO),
                                degrau=(y_borda, Z_DEGRAU, PROF_DEGRAU, LARG_DEGRAU),
                                almofada=(c_a, u_a, (ALM_COMP, ALM_PROF, ALM_ESP)),
                                pegadores=(X_PEG, ALT_PEG, COMP_PEGADOR, RAIO), lado=-1, x_braco=x_braco, x_torre=x_braco + 0.09)

    # ── 10) mãos nos pegadores da barra em cima da almofada (pegada pronada: palma pra baixo e pra frente, dedos na linha do
    #    antebraço, punho reto) — "Place hands on top of thigh pads" (ExRx) ───────────────────────────────────────────────────────
    maos = Maos(bon, RAIO, polo_inicial=(0, 0.5, 0), polegar_modo="volta")
    S = {L: cab(L + "Arm") for L, _ in LADOS}
    X = Vector((1.0, 0.0, 0.0))

    def orientacao(f):
        """Dedos na direção do antebraço f, ⟂ à barra (X); palma ⟂ aos dois, pro lado de baixo/frente (pronada)."""
        dq = (f - X * f.dot(X)).normalized()
        pq = X.cross(dq).normalized()
        if pq.z > 0:
            pq = -pq
        return dq, pq

    def maos_no_pegador(t, acertar=False):
        for L, s in LADOS:
            g, u = mq.pegada(s)
            polo = S[L] + Vector((s * 0.30, 0.30, -0.60))      # cotovelo pra baixo, pra trás e um pouco pra fora
            f = (g - (S[L] + Vector((s * 0.03, 0.02, -0.25)))).normalized()   # 1ª volta: antebraço saindo de um cotovelo baixo
            for _ in range(2):                                  # 2ª volta: os dedos na linha do antebraço que o IK deu
                dq, pq = orientacao(f)
                maos.segurar(L, g, dq, pq, polo=polo)
                if acertar:
                    maos.iks[L].mute = False
                    p3.acertar_polo(rig, maos.iks[L], L + "ForeArm", L + "Arm", L + "Hand")
                    maos.segurar(L, g, dq, pq, polo=polo)
                f = (cab(L + "Hand") - cab(L + "ForeArm")).normalized()
        for L, s in LADOS:                                     # dedos e polegar fecham até a pele encostar no pegador
            g, u = mq.pegada(s)
            # semente do polegar = a última postura "volta" VIÁVEL dessa mão (não a do quadro anterior: se ele caiu no polegar
            # antigo, a busca seguinte começava do zero e o polegar ficava levantado até o fim da subida — export de
            # 07/10/2026, mão direita, quadros 20–24); se mesmo assim nenhuma postura nova servir, o polegar fica como no
            # último quadro bom (a mão quase não muda em volta da barra redonda: só gira junto com o antebraço)
            antes = pose.ultimo[L][0] if (t > 0 and L in pose.ultimo) else None
            angs = pg.fechar_em_volta(bon, L, g, u, RAIO, polegar_antes=antes)
            th = angs.get("Thumb")
            pol = [p3.P + L + "HandThumb%d" % i for i in (1, 2, 3)]
            if isinstance(th, tuple) and th and th[0] == "volta" and th[-1]:
                pose.ultimo[L] = (th, [PB[o].matrix_basis.copy() for o in pol])
            elif L in pose.ultimo:
                for o, M in zip(pol, pose.ultimo[L][1]):
                    PB[o].matrix_basis = M.copy()
                p3.atualizar()
                angs["Thumb"] = pose.ultimo[L][0]
                print("POLEGAR %s t=%.3f: sem postura nova viável, ficou o do último quadro bom" % (L, t), flush=True)
            pose.dedos[L] = angs

    def pose(t):
        """t=0 calcanhares embaixo (alongado), t=1 calcanhares em cima (flexão plantar)."""
        dth = pernas(t)
        mq.girar((dth["Left"] + dth["Right"]) / 2 - giros[0.0])   # o braço gira o mesmo ângulo das coxas
        maos_no_pegador(t)

    pose.dedos = {}
    pose.ultimo = {}                  # por mão: (postura "volta" viável, matrix_basis dos 3 ossos do polegar) do último quadro bom
    pernas(0.0)
    mq.girar(0.0)
    maos_no_pegador(0.0, acertar=True)

    def info():
        jj = ck.posicoes(rig)
        juntas = ck.medir_juntas(rig)
        g, _ = mq.pegada(1)
        pol = "/".join("volta" if (isinstance(pose.dedos.get(L, {}).get("Thumb"), tuple)
                                   and pose.dedos[L]["Thumb"][0] == "volta") else "antigo" for L, _ in LADOS)
        return ("tornozelo %s° | joelho %.1f/%.1f° | quadril %.0f/%.0f° | braço da máquina %+.1f° | coxa %s° | tronco %.1f° | "
                "pegador E (%.3f %.3f %.3f) | cotovelo %.0f/%.0f° | punho %.0f/%.0f° | palma pra dentro %s° | polegar %s | %s" % (
                    "/".join("%.1f" % v for v in tc.tornozelo(jj)), juntas["joelhoE"], juntas["joelhoD"], juntas["quadrilE"],
                    juntas["quadrilD"], mq.angulo,
                    "/".join("%.1f" % v for v in ck.angulo_chave(rig, {"medida": "inclinacao", "segmento": ["UpLeg", "Leg"]})),
                    math.degrees(math.atan2(math.hypot(*(jj["Neck"][:2] - jj["Hips"][:2])), jj["Neck"][2] - jj["Hips"][2])),
                    *g, juntas["cotoveloE"], juntas["cotoveloD"], juntas["punhoE"], juntas["punhoD"],
                    "/".join("%.0f" % v for v in tc.palma_dentro(jj)), pol, maos.info()))

    for t in (0.0, 0.5, 1.0):
        pose(t)
        print("t=%.2f | %s" % (t, info()), flush=True)
    pose(0.0)

    pegs = [(L, ck.Barra(mq.pegadores[s], RAIO, COMP_PEGADOR / 2, eixo=(0, 0, 1))) for L, s in LADOS]
    return Cena(pose, mq.equipamentos, pegadas=pegs, apoio_mm=0.0, foco_luz=(0, ye - 0.3, 0.6),
                camera_video=((3.4, ye - 2.4, 1.2), (0, ye - 0.3, 0.62), 50), info=info, apoios=mq.apoios,
                afunda_apoio_mm=20)
