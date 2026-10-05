# Barra Fixa — cena da fábrica 3D (lote 2, 05/10/2026).
# t = 0 pendurado na barra com os braços estendidos acima da cabeça e os ombros soltos (subidos, perto das orelhas):
# ExRx — Pull-up ("Lower body until arms and shoulders are fully extended") · t = 1 queixo acima da barra (ExRx: "Pull
# body up until chin is above bar"), cotovelos dobrados descendo pelo lado do tronco, escápulas pra baixo e pra trás e
# o peito perto da barra (NFPT: "Your chest should nearly touch the bar and your chin is over the bar").
# Pegada pronada (palmas pra frente, dedos fechados por cima da barra) com as mãos a 1,5 × a largura dos ombros (Snarr
# 2017: "hands in a pronated position at a distance of 1.5 times their bi-acromial width"). As escápulas descem e vão pra
# trás logo no começo e ficam lá (ACE: "pull the shoulder blades down the back and together... Maintain this position
# of the shoulder blades as you engage the back and arms to pull yourself upward"; NFPT: "Start by depressing the
# scapulae first and keep the shoulders down"). Corpo reto, pernas estendidas e soltas, sem cruzar os tornozelos, pés
# fora do chão (NFPT: "Keep your body straight without arching or swinging"; "keep your legs straight so long as your
# feet don't touch the floor"; "Don't cross ankles"). Pescoço neutro (NFPT: "Do not overextend your cervical spine").
# Quem sobe é o CORPO: as mãos ficam paradas na barra e o Hips anda (o GLB leva a translação dele). Sem balanço: o
# centro de massa do corpo fica embaixo da barra em todo quadro (pendurado parado, a única posição de equilíbrio) —
# massas e centros dos segmentos de Dempster adaptados por Winter (2009). Por isso, pra cara passar ATRÁS da barra, o
# tronco inclina um pouco pra trás na subida e as pernas vão um pouco à frente (o corpo fica levemente côncavo).
# Pose do corpo direto na matrix_basis de cada osso, calculada do repouso (um update só por quadro).
import math
import numpy as np
from mathutils import Matrix, Vector
import bpy
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
from maos3d import Maos
from cena import Cena

RAIO = 0.016            # barra de 32 mm (1,25"): a medida comum de barra fixa (TITAN: "Overall Diameter 1.25-in.")
MEIA = 0.75             # meia distância entre os braços que seguram a barra (barra de 1,5 m entre os suportes)
RECUO = 0.45            # colunas 45 cm à frente da barra (o boneco fica de frente pra elas, como na barra de parede)
PEGADA = 1.72           # distância entre os vãos das mãos ÷ entre as articulações dos ombros: 1,5 × a largura biacromial
                        # (Snarr 2017), com o acrômio ~2,5 cm por fora do centro da articulação de cada lado (estimativa);
                        # mais fechada, o cotovelo passa de ~138° em cima e o antebraço entra no bíceps (1,65: 140°, 3 mm)
Y_BAR = 0.0             # barra no Y = 0 (o boneco olha pra −Y)
PE_FOLGA = 0.06         # pele mais baixa dos pés acima do chão no pendurado (m): pés soltos, fora do chão
COTOVELO0 = 6           # flexão do cotovelo embaixo (graus): estendido sem travar
QUEIXO = 0.012          # em cima, a pele mais baixa da cabeça (embaixo do queixo) fica isso acima do topo da barra (m)
FOLGA_CABECA = 0.015    # barra (superfície) → pele/cabelo da cabeça, pescoço e tronco: mínimo no movimento todo (m)
ELEVA = (20, -5)        # escápula (osso Shoulder do Mixamo) subindo em volta do eixo frente-trás, graus: ombro subido no
                        # pendurado (ombros "fully extended", ExRx) → um pouco abaixo do repouso em cima ("down", ACE/NFPT)
RETRAI = (0, 14)        # escápula pra trás em volta do eixo do tronco, graus (ACE: "and together"; Prinold 2016: "More ScT
                        # retraction towards the top of the front pull-up", 22° de amplitude de pro/retração nessa pegada)
ESCAPULA_ATE = 0.35     # a escápula desce no começo (até t = 0,35) e fica lá (ACE/NFPT: primeiro as escápulas)
RETRAI_ATE = 0.70       # e vai pra trás até t = 0,70, mais perto do topo (Prinold 2016)
QUADRIL = (0, 6)        # flexão do quadril, graus: pernas na linha do corpo embaixo → um pouco à frente em cima (com 10°
                        # e a inclinação até t = 0,6 a ponta do pé andava 85–91 mm entre 2 quadros, no meio da subida)
JOELHO = 0              # joelhos quase estendidos, soltos: os ~7° do repouso (graus a mais)
PLANTAR = 20            # pés soltos, a ponta um pouco pra baixo (flexão plantar, graus)
FECHA_PERNA = 2         # cada perna fecha um pouco em relação à base de repouso (graus): pernas paralelas, sem cruzar
INCLINA_ATE = (0.0, 0.75)    # o tronco inclina pra trás entre esses t: o alto da cabeça chega na altura da barra no
                             # meio da subida e tem que estar atrás dela; mais curto, as pernas giram rápido demais
SUBIDA_MEIO = 0.25      # o corpo sobe 25% mais devagar no meio (e mais rápido no começo e no fim) que em linha reta no t:
                        # o exportador já acelera o meio, e lá as pernas ainda giram pra frente (salto da ponta do pé)
ALINHAR = 0.2           # quanto os dedos seguem o antebraço em vez de apontar pra cima (menos punho dobrado em cima; mais
                        # que isso o punho vai pra trás e o cotovelo dobra demais em cima: antebraço entrando no bíceps)
DEDOS_Q = Vector((0, 0, 1))      # dedos pra cima
PALMA_Q = Vector((0, -1, 0))     # pegada pronada: palma pra frente (pro lado oposto do rosto)
POLO = (0.35, 0.0, -0.6)         # polo do cotovelo em relação ao ombro, no referencial do tronco inclinado (m: pra fora, pra
                                 # trás, pra cima): o cotovelo desce pelo lado do tronco, no plano do corpo
LADOS = (("Left", 1), ("Right", -1))
# Dempster adaptado por Winter (2009), tabela do BMClab (Duarte M., "Body segment parameters"): fração da massa e
# posição do centro a partir da ponta de cima do segmento
SEG = {"tronco": (0.497, 0.5), "cabeca": (0.081, 1.0), "braco": (0.028, 0.436), "antebraco": (0.016, 0.430),
       "mao": (0.006, 0.506), "coxa": (0.100, 0.433), "perna": (0.0465, 0.433), "pe": (0.0145, 0.5)}
CORPO = ("Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "LeftShoulder", "RightShoulder",
         "LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg", "LeftFoot", "RightFoot")
NAO_BRACO = ("Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "LeftShoulder", "RightShoulder")
PES = ("LeftFoot", "LeftToeBase", "RightFoot", "RightToeBase")


def _suave(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def _subida(t):
    """Fração da subida do corpo no quadro t (0 → 1), mais lenta no meio: derivada 1 + A·cos(2πt), A = SUBIDA_MEIO."""
    return t + SUBIDA_MEIO * math.sin(2 * math.pi * t) / (2 * math.pi)


def montar(bon):
    pg.usar_cilindro(RAIO * 2000)                        # mão de referência de 32 mm (Shimawaki 2019, interpolada)
    rig = bon.rig
    PB = rig.pose.bones
    c = lambda n: p3.cabeca(rig, n)
    Lb = (c("LeftForeArm") - c("LeftArm")).length       # braço
    La = (c("LeftHand") - c("LeftForeArm")).length      # antebraço
    meia_pegada = PEGADA * (c("LeftArm") - c("RightArm")).length / 2
    pivo = (c("LeftUpLeg") + c("RightUpLeg")) / 2        # o corpo inclina em volta das articulações do quadril
    repouso = {n: rig.data.bones[p3.P + n].matrix_local.copy() for n in CORPO}
    ombro0 = {l: rig.data.bones[p3.P + l + "Arm"].head_local.copy() for l, _ in LADOS}   # articulação do ombro no repouso
    extras = [o for o in bpy.data.objects if o.type == "MESH" and o is not bon.corpo and o.parent is rig]
    maos = Maos(bon, RAIO)
    zb = [2.2]                                           # altura do eixo da barra (acertada pelos pés, abaixo)

    def pegadas():
        return {l: Vector((s * meia_pegada, Y_BAR, zb[0])) for l, s in LADOS}

    def base(nome, R, pivo_=None, mover=Vector()):
        """matrix_basis do osso girado R (mundo, com o pai no repouso) em volta do pivô (padrão: a cabeça dele) e
        deslocado `mover`. Com o pai girado, o giro vai junto no referencial do pai (é o mesmo jeito do girar_osso)."""
        M = repouso[nome]
        h = M.to_translation() if pivo_ is None else Vector(pivo_)
        return M.inverted() @ Matrix.Translation(h + mover) @ R.to_4x4() @ Matrix.Translation(-h) @ M

    # ── perfis no tempo (t já vem suavizado pelo exportador) ──────────────────────────────────────────────────────
    inc = [0.0]                                          # inclinação do tronco em cima (graus), acertada pela folga

    def perfil(t):
        e = _suave(t / ESCAPULA_ATE)
        a = _suave((t - INCLINA_ATE[0]) / (INCLINA_ATE[1] - INCLINA_ATE[0]))
        return dict(eleva=p3.lerp(*ELEVA, e), retrai=p3.lerp(*RETRAI, _suave(t / RETRAI_ATE)), inclina=inc[0] * a,
                    quadril=p3.lerp(*QUADRIL, a))

    Y, Z = Vector((0, 1, 0)), Vector((0, 0, 1))

    def corpo(t, dy=0.0, dz=0.0):
        """Tronco inclinado, escápulas, pernas e o corpo todo deslocado (dy, dz) — os braços vêm depois (segurar)."""
        f = perfil(t)
        for n in ("Spine", "Spine1", "Spine2", "Neck", "Head"):
            PB[p3.P + n].matrix_basis = Matrix()
        PB[p3.P + "Hips"].matrix_basis = base("Hips", p3.rot_x(-f["inclina"]), pivo, Vector((0, dy, dz)))  # − = pra trás
        for lado, s in LADOS:
            # escápula: sobe/desce em volta do eixo frente-trás e vai pra trás em volta do eixo do tronco (na base do
            # osso Shoulder); perna: fecha um pouco, quadril dobra, joelho quase reto, pé solto
            # o osso do boneco vai da base do pescoço ao centro da articulação, caído ~26°: só girar levava o ombro ~15 mm
            # pra fora no pendurado; na clavícula de verdade (quase horizontal) ele sobe sem abrir — o que sobra de lado
            # vira deslize da base do osso, como no encolhimento (lote 2)
            R = Matrix.Rotation(math.radians(s * f["retrai"]), 3, Z) @ Matrix.Rotation(math.radians(-s * f["eleva"]), 3, Y)
            h = repouso[lado + "Shoulder"].to_translation()
            girado = h + R @ (ombro0[lado] - h)
            PB[p3.P + lado + "Shoulder"].matrix_basis = base(lado + "Shoulder", R, None,
                                                             Vector((ombro0[lado].x - girado.x, 0, 0)))
            R = p3.rot_x(-f["quadril"]) @ Matrix.Rotation(math.radians(s * FECHA_PERNA), 3, Y)
            PB[p3.P + lado + "UpLeg"].matrix_basis = base(lado + "UpLeg", R)
            PB[p3.P + lado + "Leg"].matrix_basis = base(lado + "Leg", p3.rot_x(JOELHO))
            PB[p3.P + lado + "Foot"].matrix_basis = base(lado + "Foot", p3.rot_x(PLANTAR))
        p3.atualizar()

    def centro_massa(g, bracos_reais=False):
        """Centro de massa (Dempster/Winter). Sem os braços postos (bracos_reais=False), cada braço inteiro fica na reta
        ombro → vão da mão, a 42% do ombro (onde fica o centro dele com o cotovelo estendido)."""
        tot = Vector()
        quadril = (c("LeftUpLeg") + c("RightUpLeg")) / 2
        ombros = (c("LeftArm") + c("RightArm")) / 2
        m, k = SEG["tronco"]
        tot += m * quadril.lerp(ombros, k)
        m, k = SEG["cabeca"]                             # do C7/T1 ao ouvido, centro no ouvido (~0,4 do osso Head)
        tot += m * c("Head").lerp(p3.ponta(rig, "Head"), 0.4)
        for lado, _ in LADOS:
            S = c(lado + "Arm")
            if bracos_reais:
                for seg, a, b in (("braco", lado + "Arm", lado + "ForeArm"), ("antebraco", lado + "ForeArm", lado + "Hand"),
                                  ("mao", lado + "Hand", lado + "HandMiddle1")):
                    m, k = SEG[seg]
                    tot += m * c(a).lerp(c(b), k)
            else:
                tot += 0.05 * S.lerp(g[lado], 0.42)
            for seg, a, b in (("coxa", lado + "UpLeg", lado + "Leg"), ("perna", lado + "Leg", lado + "Foot"),
                              ("pe", lado + "Foot", lado + "ToeBase")):
                m, k = SEG[seg]
                tot += m * c(a).lerp(c(b), k)
        return tot

    def no_lugar(t, dz):
        """Corpo no quadro t com o centro de massa embaixo da barra (2 voltas: o braço inteiro anda 58% com o ombro)."""
        g = pegadas()
        dy = 0.0
        for _ in range(2):
            corpo(t, dy, dz)
            dy += (Y_BAR - centro_massa(g).y) / 0.958
        corpo(t, dy, dz)
        return dy

    # ── punho em relação ao vão da mão com os dedos pra cima e a palma pra frente (1º chute da altura do corpo) ─────
    corpo(0.0, 0.0, 0.6)
    off = {}
    for lado, s in LADOS:
        S = c(lado + "Arm")
        g = S + Vector((s * 0.12, 0.0, 0.5))
        maos.segurar(lado, g, DEDOS_Q, PALMA_Q, polo=S + Vector((s * POLO[0], POLO[1], POLO[2])))
        off[lado] = g - c(lado + "Hand")
        nos = pg._base(rig, lado)[1]
        print("VÃO − PUNHO %s (%.3f %.3f %.3f) | nós dos dedos × barra %.1f° | erro do vão %.1f mm" % (
            lado, *off[lado], math.degrees(min(nos.angle(Vector((1, 0, 0))), nos.angle(Vector((-1, 0, 0))))),
            maos.erro[lado] * 1000))

    def flexao_cotovelo(lado, g):
        """Flexão do cotovelo (graus) que leva o punho até o vão `g` com o ombro onde está (geometria: braço + antebraço)."""
        d = (g - off[lado] - c(lado + "Arm")).length
        cos = (d * d - Lb * Lb - La * La) / (2 * Lb * La)
        return math.degrees(math.acos(max(-1.0, min(1.0, cos))))

    def dz_cotovelo(t, alvo_graus):
        """Altura do corpo (dz) com o cotovelo mais esticado dos dois a `alvo_graus` (bissecção: subir dobra o cotovelo)."""
        lo, hi = -0.5, 1.5
        for _ in range(22):
            meio = (lo + hi) / 2
            no_lugar(t, meio)
            g = pegadas()
            if min(flexao_cotovelo(l, g[l]) for l, _ in LADOS) < alvo_graus:
                lo = meio
            else:
                hi = meio
        return (lo + hi) / 2

    def pele(partes, niveis=1):
        co, _, (nomes, dono) = ck._avaliar(bon.corpo, niveis)
        return co[np.array([n in partes for n in nomes] + [False])[dono]]

    def dz_queixo(t):
        """Altura do corpo (dz) com a pele mais baixa da cabeça QUEIXO acima do topo da barra."""
        dz = 0.6
        for _ in range(3):
            no_lugar(t, dz)
            dz += (zb[0] + RAIO + QUEIXO) - pele(("Head",), 0)[:, 2].min()
        return dz

    def folga_agora(niveis=1):
        """Barra (superfície) → pele da cabeça, pescoço e tronco + cabelo, sobrancelhas e olhos (m) e onde."""
        P = np.concatenate([pele(NAO_BRACO, niveis)] + [ck._avaliar_simples(o)[0] for o in extras])
        P = P[np.abs(P[:, 0]) < meia_pegada - 0.05]
        d = np.hypot(P[:, 1] - Y_BAR, P[:, 2] - zb[0]) - RAIO
        i = int(d.argmin())
        return float(d[i]), P[i]

    # ── inclinação do tronco em cima: a menor que deixa a cara, o pescoço e o peito FOLGA_CABECA longe da barra ────
    def pior_folga(graus, dz0):
        inc[0] = graus
        dz1 = dz_queixo(1.0)
        piores = []
        for t in np.arange(0.20, 1.001, 0.05):
            no_lugar(float(t), p3.lerp(dz0, dz1, _subida(float(t))))
            d, p = folga_agora(0)
            piores.append((d, round(float(t), 2), tuple(round(float(x), 3) for x in p)))
        return min(piores), dz1

    def inclinacao(dz0):
        lo, hi = 0.0, 30.0
        for _ in range(8):
            meio = (lo + hi) / 2
            if pior_folga(meio, dz0)[0][0] < FOLGA_CABECA:
                lo = meio
            else:
                hi = meio
        (pf, tpf, ppf), dz1 = pior_folga(hi, dz0)
        print("INCLINAÇÃO em cima %.1f° | pior folga barra → cabeça/tronco %.1f mm em t=%.2f no ponto %s | dz %.3f → "
              "%.3f" % (inc[0], pf * 1000, tpf, ppf, dz0, dz1))
        return dz1

    def polo(lado, s, t):
        a = math.radians(perfil(t)["inclina"])          # eixos do tronco inclinado pra trás
        tras, cima = Vector((0, math.cos(a), -math.sin(a))), Vector((0, math.sin(a), math.cos(a)))
        return c(lado + "Arm") + Vector((s * POLO[0], 0, 0)) + tras * POLO[1] + cima * POLO[2]

    def bracos(t):
        """Os 2 braços até as mãos na barra. O IK parte sempre do braço de repouso (cotovelo dobrado pra frente, como o
        do corpo): partindo do quadro anterior, o braço podia girar no próprio eixo e o cotovelo dobrar de lado."""
        g = pegadas()
        for lado, s in LADOS:
            for n in ("Arm", "ForeArm", "Hand"):
                PB[p3.P + lado + n].matrix_basis = Matrix()
            p3.atualizar()
            maos.segurar(lado, g[lado], DEDOS_Q, PALMA_Q, polo=polo(lado, s, t), alinhar=ALINHAR)

    def acertar_polos(t):
        for lado, _ in LADOS:
            for n in ("Arm", "ForeArm", "Hand"):
                PB[p3.P + lado + n].matrix_basis = Matrix()
            maos.iks[lado].mute = False
            e = p3.acertar_polo(rig, maos.iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
            print("polo cotovelo", lado, "erro %.3f ang %d" % e)
        bracos(t)

    # 1º chute (mão fixa, sem o ALINHAR): cotovelo quase estendido embaixo, pés PE_FOLGA acima do chão e a inclinação
    dz0 = dz_cotovelo(0.0, COTOVELO0)
    no_lugar(0.0, dz0)
    d = PE_FOLGA - pele(PES)[:, 2].min()
    zb[0], dz0 = zb[0] + d, dz0 + d                        # barra e corpo sobem juntos (nada muda nos braços)
    dz1 = inclinacao(dz0)
    no_lugar(0.5, p3.lerp(dz0, dz1, _subida(0.5)))       # polo certo do cotovelo no meio do movimento
    bracos(0.5)
    acertar_polos(0.5)

    # embaixo com os braços de verdade (a mão segue o antebraço ALINHAR): bissecção no cotovelo medido
    lo, hi = dz0 - 0.05, dz0 + 0.05
    for _ in range(16):
        meio = (lo + hi) / 2
        no_lugar(0.0, meio)
        bracos(0.0)
        j = ck.medir_juntas(rig)
        if min(j["cotoveloE"], j["cotoveloD"]) < COTOVELO0 or max(maos.erro.values()) > 0.002:
            lo = meio
        else:
            hi = meio
    dz0 = hi
    no_lugar(0.0, dz0)
    d = PE_FOLGA - pele(PES)[:, 2].min()
    zb[0], dz0 = zb[0] + d, dz0 + d
    print("BARRA eixo em z %.3f (pés %.0f mm do chão no pendurado) | corpo dz %.3f embaixo" % (zb[0], PE_FOLGA * 1000, dz0))
    dz1 = inclinacao(dz0)

    barra = e3.barra_fixa("barra_fixa", altura=zb[0], meia=MEIA, raio=RAIO, recuo=RECUO)
    barra.location = (0, Y_BAR, zb[0])
    p3.atualizar()

    def pose(t):
        """t=0 pendurado com os braços estendidos, t=1 queixo acima da barra."""
        pose.dy = no_lugar(t, p3.lerp(dz0, dz1, _subida(t)))
        bracos(t)
        for lado, _ in LADOS:                             # dedos e polegar fecham até a pele encostar na barra
            antes = pose.dedos.get(lado, {}).get("Thumb") if t > 0 else None
            pose.dedos[lado] = pg.fechar_em_volta(bon, lado, Vector((0, Y_BAR, zb[0])), Vector((1, 0, 0)), RAIO,
                                                  polegar_antes=antes)

    pose.dedos = {}
    pose.dy = 0.0

    def info():
        """Centro de massa × barra, barra × cabeça/tronco (e onde), queixo × topo da barra e o polegar de cada mão."""
        g = pegadas()
        cm = centro_massa(g, bracos_reais=True)
        cab = pele(("Head",))
        f, p = folga_agora()
        def pol(lado):
            v = pose.dedos.get(lado, {}).get("Thumb", ())
            return str(tuple(round(float(x), 2) if isinstance(x, float) else x for x in v) if isinstance(v, tuple) else v)
        return (maos.info() + " | centro de massa − barra %+.0f mm (frente−/trás+) | barra → cabeça/tronco %.0f mm "
                "(%.2f %.2f %.2f) | queixo − topo da barra %+.0f mm | corpo dy %+.3f | polegar E %s D %s" % (
                    (cm.y - Y_BAR) * 1000, f * 1000, *p, (cab[:, 2].min() - zb[0] - RAIO) * 1000, pose.dy,
                    pol("Left"), pol("Right")))

    bk = ck.Barra(barra, raio=RAIO, meio_compr=MEIA)
    return Cena(pose, [barra], pegadas=[("Left", bk), ("Right", bk)], apoio_mm=0.0, foco_luz=(0, 0.0, 1.3),
                camera_video=((3.4, 4.6, 1.7), (0, 0.0, 1.3), 35), info=info)
