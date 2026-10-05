# Agachamento Búlgaro com Halteres — cena da fábrica 3D (lote 2, 04/10/2026).
# Afundo com o PEITO DO PÉ DE TRÁS em cima do banco reto (ExRx "Dumbbell Single Leg Split Squat": "Stand with
# dumbbells grasped to sides facing away from bench. Extend leg back and place top of foot on bench"; Sussex: "The lace
# of your foot should be on the bench behind you"). t = 0 em cima (perna da frente quase estendida) · t = 1 embaixo
# (coxa da frente perto da horizontal, joelho de trás quase encostando no chão, sem bater).
# Perna esquerda à frente, pé chapado e parado (Helme 2020: "The heel of the front foot maintained contact with the
# ground throughout the exercise"). Pé direito virado, com o dorso no estofado e os dedos pra trás: os dedos ficam
# deitados no banco e o pé gira em volta da base dos dedos — em cima o tornozelo fica um pouco levantado do estofado
# (sem isso a flexão plantar passava dos 50° normais) e embaixo o dorso assenta no banco.
# O quadril desce quase reto e um pouco pra trás (Sussex: "The hips should drop straight down and slightly back"),
# tronco ereto com uma leve inclinação à frente embaixo, coxa de trás na linha do tronco (Helme 2020: "hip angle of
# approximately 180°, from the rear leg"); o joelho da frente vai à frente do tornozelo sem passar da ponta do pé
# (Sussex: "Make sure the front knee does not go past the toes").
# Braços pendurados e estendidos com um halter em cada mão, pegada neutra: igual ao afundo com halteres.
import math
from mathutils import Vector, Matrix
import numpy as np
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
from cena import Cena

FRENTE, TRAS = "Left", "Right"
X_PE = 0.13            # tornozelos a ±13 cm do meio do corpo: cada pé embaixo do seu quadril, o de trás fora da linha
                       # do da frente (Sussex, erro: "back foot directly in line with the front foot")
Y_FRENTE = -0.40       # tornozelo da frente (m; o boneco olha pra −Y)
PASSADA = 0.89         # base dos dedos de trás (no banco) atrás do tornozelo da frente (m)
TOPO = 0.44            # altura do estofado (m), o banco reto dos supinos (Helme 2020: blocos de 40 cm; Mackey 2021:
                       # caixa na altura da base da patela)
AFUNDA = 0.004         # dorso do pé de trás afundando no estofado (m)
BORDA = 0.065          # beirada do banco atrás do tornozelo de trás embaixo (m): a canela desce na frente do banco
CANELA_BAIXO = 16      # canela da frente à frente da vertical embaixo (graus): joelho à frente do tornozelo, atrás da
                       # ponta do pé
COXA_BAIXO = -3        # coxa da frente embaixo, graus abaixo da horizontal (0 = paralela; −3 = o quadril 2 cm
                       # abaixo do joelho, joelho de trás quase no chão)
JOELHO_FRENTE_CIMA = 10   # flexão do joelho da frente em cima (graus): quase estendido, sem travar
RECUO = 0.04           # o quadril desce e vai 4 cm pra trás (Sussex: "drop straight down and slightly back")
INCLINA = (3, 12)      # tronco à frente da vertical (graus), em cima → embaixo
BETA_CIMA = 24         # pé de trás em cima: tornozelo → base dos dedos descendo 24° — o tornozelo fica uns 5 cm acima
                       # do estofado e a flexão plantar em ~47° (com o dorso chapado em cima ela passava de 60°)
ALFA = 2               # braço (ombro → cotovelo) à frente da vertical do MUNDO (o halter pende pra baixo), graus
TETA = 8               # antebraço (cotovelo → punho) à frente da vertical, graus: cotovelo estendido, sem travar
LARG_COT = 0.05        # cotovelo um pouco pra fora do ombro: o halter passa por fora da coxa
FORA_PUNHO = 0.05      # punho um pouco pra fora do cotovelo (ângulo de carregamento ~10°)
RAIO = 0.0145          # pegada do halter: 29 mm, o cilindro da mão de referência (igual à rosca martelo)
PEGADA_H = 0.13        # comprimento da pegada do halter (entre as anilhas)


def _bissecao(f, lo, hi, alvo, voltas=30):
    """x em [lo, hi] com f(x) = alvo (f monótona)."""
    flo = f(lo) - alvo
    for _ in range(voltas):
        m = (lo + hi) / 2
        fm = f(m) - alvo
        if (fm > 0) == (flo > 0):
            lo, flo = m, fm
        else:
            hi = m
    return (lo + hi) / 2


def montar(bon):
    rig = bon.rig
    PB = rig.pose.bones
    # ── pernas por IK: alvos nascem no tornozelo de repouso (alvo = polo dá NaN) e os polos ficam à frente ────────
    pernas, tornozelos, polos_j = {}, {}, {}
    for lado, s in (("Left", 1), ("Right", -1)):
        tornozelos[lado] = p3.vazio("tornozelo_" + lado, p3.ponta(rig, lado + "Leg"))
        # polo bem à frente, no x que deixa cada joelho na reta quadril → tornozelo vista de frente (sem valgo).
        # Testado: o de trás a −0,09 abria 38 mm embaixo e a −0,03 fechava 8 mm; o da frente a +0,16 abria 14 mm
        x_polo = s * (X_PE + 0.01 if lado == FRENTE else X_PE - 0.085)
        polos_j[lado] = p3.vazio("polo_joelho_" + lado, (x_polo, -1.2, 0.55 if lado == FRENTE else 0.0))
        pernas[lado] = p3.ik(rig, lado + "Leg", tornozelos[lado], polos_j[lado])
    p3.travar_rotacao(rig, FRENTE + "Foot")              # pé da frente chapado, apontando pra frente
    rot_pe = p3.travar_rotacao(rig, TRAS + "Foot")       # pé de trás virado no banco (gira em volta da base dos dedos)
    M_pe = rot_pe.matrix_world.copy()
    rot_dedos = p3.travar_rotacao(rig, TRAS + "ToeBase")  # dedos de trás deitados no banco
    M_dedos = rot_dedos.matrix_world.copy()
    tz0 = p3.cabeca(rig, TRAS + "Foot")                   # tornozelo, base dos dedos e ponta dos dedos no repouso
    mtp0 = p3.cabeca(rig, TRAS + "ToeBase")
    ponta0 = p3.ponta(rig, TRAS + "ToeBase")
    v_pe = tz0 - mtp0                                     # base dos dedos → tornozelo, pé chapado
    a_pe0 = math.degrees(math.atan2((mtp0 - tz0).z, (mtp0 - tz0).y))       # tornozelo → base dos dedos (plano YZ)
    a_dedos0 = math.degrees(math.atan2((ponta0 - mtp0).z, (ponta0 - mtp0).y))
    tornozelo_frente = Vector((X_PE, Y_FRENTE, p3.cabeca(rig, FRENTE + "Foot").z))
    mtp = Vector((-X_PE + (mtp0.x - tz0.x), Y_FRENTE + PASSADA, TOPO + 0.0085 - AFUNDA))   # base dos dedos de trás
    estado = {"dedos": 8.0}                               # dedos de trás: graus descendo pra ponta (acertado abaixo)

    def _rot(angulo0, desce):
        """Giro em volta do X que leva o osso (ângulo angulo0 no plano YZ) a apontar pra trás (+Y), descendo
        `desce` graus em direção à ponta."""
        return p3.rot_x(-desce - angulo0)

    def _corpo(yq, zq, inclina, beta):
        """Articulações do quadril em (yq, zq) (meio das duas), tronco inclinado `inclina` graus, pé de trás com o
        tornozelo → base dos dedos descendo `beta` graus (gira em volta da base dos dedos, que não sai do lugar)."""
        for n in ("Hips", "Neck", "Head"):
            PB[p3.P + n].matrix_basis = Matrix()
        p3.atualizar()
        pivo = (p3.cabeca(rig, "LeftUpLeg") + p3.cabeca(rig, "RightUpLeg")) / 2
        p3.girar_osso(rig, "Hips", p3.rot_x(inclina), pivo=pivo, mover=Vector((0, yq - pivo.y, zq - pivo.z)))
        tornozelos[FRENTE].location = tornozelo_frente
        R = _rot(a_pe0, beta)
        rot_pe.matrix_world = R.to_4x4() @ M_pe
        tornozelos[TRAS].location = mtp + R @ v_pe
        rot_dedos.matrix_world = _rot(a_dedos0, estado["dedos"]).to_4x4() @ M_dedos
        p3.atualizar()
        p3.girar_osso(rig, "Neck", p3.rot_x(-inclina * 0.8))   # cabeça em pé, olhando pra frente

    def _pele(partes):
        co, _, (nomes, dono) = ck._avaliar(bon.corpo, 1)
        return co[np.array([n in partes for n in nomes] + [False])[dono]]

    def _medir():
        j = ck.posicoes(rig)
        f = ck.medir_juntas(rig)
        d = j[FRENTE + "Leg"] - j[FRENTE + "UpLeg"]
        c = j[FRENTE + "Leg"] - j[FRENTE + "Foot"]
        return {"joelhoF": f["joelhoE" if FRENTE == "Left" else "joelhoD"],
                "coxa": math.degrees(math.atan2(-d[2], math.hypot(d[0], d[1]))),      # + = joelho abaixo do quadril
                "canela": math.degrees(math.atan2(-c[1], c[2]))}                       # + = joelho à frente

    def _acertar_pe(yq, zq, inclina, beta):
        """Base dos dedos na altura em que a pele do pé encosta no estofado e dedos deitados nele (3 voltas)."""
        for _ in range(3):
            _corpo(yq, zq, inclina, beta)
            pe = _pele((TRAS + "Foot",))
            mtp.z += (TOPO - AFUNDA) - pe[:, 2].min()

            def _ponta_dedos(g):
                estado["dedos"] = g
                _corpo(yq, zq, inclina, beta)
                return -_pele((TRAS + "ToeBase",))[:, 2].min()
            estado["dedos"] = _bissecao(_ponta_dedos, -25.0, 35.0, -(TOPO - AFUNDA), 18)
        _corpo(yq, zq, inclina, beta)

    def _beta_baixo(yq, zq, inclina):
        """Ângulo do pé de trás embaixo: o dorso assenta no estofado (a pele do meio do pé, entre a beirada do banco
        e 3,5 cm antes da base dos dedos, encosta no estofado; perto da base dos dedos ela já encosta em cima)."""
        def _dorso(b):
            _corpo(yq, zq, inclina, b)
            pe = _pele((TRAS + "Foot",))
            borda = tornozelos[TRAS].location.y + BORDA
            meio = pe[(pe[:, 1] > borda) & (pe[:, 1] < mtp.y - 0.035)]
            return -meio[:, 2].min()
        return _bissecao(_dorso, 0.0, BETA_CIMA, -(TOPO - AFUNDA), 18)

    # ── posição do quadril: embaixo a coxa da frente fica paralela e a canela da frente a CANELA_BAIXO graus;
    # em cima o joelho da frente fica a 10°. Antes, os polos dos joelhos certos na pose de baixo (o polo gira o joelho
    # em volta da reta quadril → tornozelo); 2 voltas: polo → posições → polo de novo.
    yb, zb = Y_FRENTE + 0.30, 0.49
    yc, zc = yb - RECUO, 0.87
    _acertar_pe(yc, zc, INCLINA[0], BETA_CIMA)
    beta_b = _beta_baixo(yb, zb, INCLINA[1])
    for volta in range(2):
        _corpo(yb, zb, INCLINA[1], beta_b)
        for lado in ("Left", "Right"):
            e = p3.acertar_polo(rig, pernas[lado], lado + "Leg", lado + "UpLeg", lado + "Foot")
            print("polo joelho", lado, "erro %.3f ang %d" % e)

        def _z_coxa(y):
            return _bissecao(lambda z: (_corpo(y, z, INCLINA[1], beta_b), _medir()["coxa"])[1], 0.38, 0.62,
                             COXA_BAIXO, 20)
        yb = _bissecao(lambda y: (_corpo(y, _z_coxa(y), INCLINA[1], beta_b), _medir()["canela"])[1],
                       Y_FRENTE + 0.15, Y_FRENTE + 0.45, CANELA_BAIXO, 16)
        zb = _z_coxa(yb)
        yc = yb - RECUO
        zc = _bissecao(lambda z: (_corpo(yc, z, INCLINA[0], BETA_CIMA), _medir()["joelhoF"])[1], 0.70, 0.93,
                       JOELHO_FRENTE_CIMA, 26)
        _acertar_pe(yc, zc, INCLINA[0], BETA_CIMA)
        beta_b = _beta_baixo(yb, zb, INCLINA[1])
    _corpo(yb, zb, INCLINA[1], beta_b)
    tz_baixo = tornozelos[TRAS].location.copy()
    print("BÚLGARO quadril y %.3f z %.3f → y %.3f z %.3f | pé de trás %d° → %.1f° | base dos dedos (%.3f %.3f %.3f) | "
          "dedos %.1f°" % (yc, zc, yb, zb, BETA_CIMA, beta_b, *mtp, estado["dedos"]))

    # ── banco reto: estofado debaixo do pé de trás, a beirada BORDA atrás do tornozelo de trás embaixo ───────────
    y0 = tz_baixo.y + BORDA
    banco = e3.banco("banco", y0, y0 + 1.20, topo=TOPO, largura=0.30)
    banco.location.x = mtp.x
    p3.atualizar()
    print("BANCO x %.3f | y %.3f → %.3f" % (mtp.x, y0, y0 + 1.20))

    # ── braços por IK (igual ao afundo) ─────────────────────────────────────────────────────────────────────
    punhos, polos, iks = {}, {}, {}
    for lado in ("Left", "Right"):
        punhos[lado] = p3.vazio("punho_" + lado, p3.ponta(rig, lado + "ForeArm"))
        polos[lado] = p3.vazio("polo_cotovelo_" + lado, p3.cabeca(rig, lado + "ForeArm") + Vector((0, 0.6, 0)))
        iks[lado] = p3.ik(rig, lado + "ForeArm", punhos[lado], polos[lado])
    braco = (p3.cabeca(rig, "LeftForeArm") - p3.cabeca(rig, "LeftArm")).length
    antebraco = (p3.cabeca(rig, "LeftHand") - p3.cabeca(rig, "LeftForeArm")).length
    halteres = {l: e3.halter("halter_" + l, pegada=PEGADA_H, raio=RAIO, raio_anilha=0.055) for l in ("Left", "Right")}

    def _bracos():
        """Braços pendurados na vertical do mundo (o halter pende pra baixo), a partir do ombro já posto."""
        alfa, teta = math.radians(ALFA), math.radians(TETA)
        for lado, s in (("Left", 1), ("Right", -1)):
            S = p3.cabeca(rig, lado + "Arm")
            E = S + Vector((s * LARG_COT, -math.sin(alfa) * braco, -math.cos(alfa) * braco)).normalized() * braco
            dx = s * FORA_PUNHO
            rho = math.sqrt(antebraco ** 2 - dx ** 2)
            W = E + Vector((dx, -math.sin(teta) * rho, -math.cos(teta) * rho))
            iks[lado].mute = False
            punhos[lado].location = W
            eixo = (W - S).normalized()                # polo do lado em que o cotovelo calculado fica
            fora = (E - S) - eixo * (E - S).dot(eixo)
            polos[lado].location = E + fora.normalized() * 0.4
        p3.atualizar()

    def pose(t):
        """t=0 em cima, t=1 embaixo (coxa da frente paralela, joelho de trás quase no chão)."""
        _corpo(p3.lerp(yc, yb, t), p3.lerp(zc, zb, t), p3.lerp(*INCLINA, t), p3.lerp(BETA_CIMA, beta_b, t))
        _bracos()
        for lado, s in (("Left", 1), ("Right", -1)):
            nomes = (lado + "Arm", lado + "ForeArm")       # congela o IK em FK pra girar o antebraço
            mats = [PB[p3.P + n].matrix.copy() for n in nomes]
            iks[lado].mute = True
            for n, M in zip(nomes, mats):
                PB[p3.P + n].matrix = M
                p3.atualizar()
            pg.mao_de_referencia(rig, lado)
            f0, f1 = p3.cabeca(rig, lado + "ForeArm"), p3.cabeca(rig, lado + "Hand")
            ax = (f1 - f0).normalized()
            quer = Vector((-s, 0, 0))                     # pegada neutra: palma pro corpo (pra coxa)
            quer = (quer - ax * quer.dot(ax)).normalized()
            tem = pg._base(rig, lado)[0]
            tem = (tem - ax * tem.dot(ax)).normalized()
            ang = math.atan2(tem.cross(quer).dot(ax), tem.dot(quer))
            p3.girar_osso(rig, lado + "ForeArm", Matrix.Rotation(ang, 3, ax))
            pg.mao_de_referencia(rig, lado)
            g, _ = pg.ponto_na_mao(bon, lado, RAIO)
            eixo = pg._base(rig, lado)[1]                  # o halter fica na linha dos nós dos dedos
            h = halteres[lado]
            h.rotation_mode = "QUATERNION"
            h.rotation_quaternion = Vector((1, 0, 0)).rotation_difference(eixo)
            h.location = g
            p3.atualizar()
            antes = pose.dedos.get(lado, {}).get("Thumb") if t > 0 else None
            pose.dedos[lado] = pg.fechar_em_volta(bon, lado, g, eixo, RAIO, polegar_antes=antes)

    pose.dedos = {}

    def _canela_pe(j, lado):
        """Ângulo canela × pé (joelho → tornozelo × tornozelo → base dos dedos) e pé × dedos, graus."""
        canela = j[lado + "Foot"] - j[lado + "Leg"]
        pe = j[lado + "ToeBase"] - j[lado + "Foot"]
        dedos = j[lado + "Ponta"] - j[lado + "ToeBase"]
        return math.degrees(canela.angle(pe)), math.degrees(pe.angle(dedos))

    def _juntas_pe(cab, ponta):
        return {L + n: cab(L + n) for L in ("Left", "Right") for n in ("Leg", "Foot", "ToeBase")} | {
            L + "Ponta": ponta(L + "ToeBase") for L in ("Left", "Right")}

    repouso = {l: _canela_pe(_juntas_pe(bon.cabeca_osso, bon.ponta_osso), l) for l in ("Left", "Right")}
    print("REPOUSO canela × pé E %.1f° D %.1f°" % (repouso["Left"][0], repouso["Right"][0]))

    def info():
        """Pele do joelho de trás até o chão, tornozelo de trás (flexão plantar + em relação ao pé chapado em pé),
        dedos de trás dobrados, pele do pé de trás e da canela de trás até o banco, joelho da frente × ponta do pé."""
        co, _, (nomes, dono) = ck._avaliar(bon.corpo, 1)
        m = lambda *ps: np.array([n in ps for n in nomes] + [False])[dono]
        j = _juntas_pe(lambda n: p3.cabeca(rig, n), lambda n: p3.ponta(rig, n))
        jt = j[TRAS + "Leg"]
        perna = co[m(TRAS + "Leg", TRAS + "UpLeg")]
        perna = perna[np.linalg.norm(perna - np.array(jt), axis=1) < 0.09]
        tr = _canela_pe(j, TRAS)
        fr = _canela_pe(j, FRENTE)
        pe = co[m(TRAS + "Foot", TRAS + "ToeBase")]
        canela = co[m(TRAS + "Leg")]
        folga = ck._zona_no_apoio(canela, [banco], "banco") * 1000
        apoio = ck._zona_no_apoio(pe, [banco], "banco") * 1000           # − = afundando no estofado
        jf = j[FRENTE + "Leg"]
        joelho_f = co[m(FRENTE + "Leg", FRENTE + "UpLeg")]
        joelho_f = joelho_f[np.linalg.norm(joelho_f - np.array(jf), axis=1) < 0.08]
        ponta_f = j[FRENTE + "Ponta"]
        return ("joelho de trás: pele a %.0f mm do chão (centro %.0f) | tornozelo de trás %+.0f° (flexão plantar) | "
                "dedos de trás dobrados %.0f° | pé de trás × banco %+.1f mm | canela de trás × banco %+.0f mm | "
                "tornozelo da frente %+.0f° (dorsiflexão) | joelho da frente %+.0f mm da ponta do pé (− = atrás)" % (
                    perna[:, 2].min() * 1000, jt.z * 1000, repouso[TRAS][0] - tr[0], tr[1] - repouso[TRAS][1],
                    apoio, folga, fr[0] - repouso[FRENTE][0],
                    (ponta_f.y - joelho_f[:, 1].min()) * 1000))

    # polo certo dos cotovelos no meio do movimento
    _corpo(p3.lerp(yc, yb, 0.5), p3.lerp(zc, zb, 0.5), p3.lerp(*INCLINA, 0.5), p3.lerp(BETA_CIMA, beta_b, 0.5))
    _bracos()
    for lado in ("Left", "Right"):
        e = p3.acertar_polo(rig, iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
        print("polo cotovelo", lado, "erro %.3f ang %d" % e)

    pegs = [(l, ck.Barra(halteres[l], raio=RAIO, meio_compr=PEGADA_H / 2)) for l in ("Left", "Right")]
    return Cena(pose, [halteres["Left"], halteres["Right"]], pegadas=pegs, apoio_mm=0.0, foco_luz=(0, 0.1, 0.7),
                camera_video=((-3.6, -2.6, 1.1), (0, 0.15, 0.62), 50), info=info, apoios=[banco],
                afunda_apoio_mm=20)
