# Mobilidade Cervical — cena da fábrica 3D (lote 15, 13/10/2026; exercício novo do catálogo, categoria "Alongamento e mobilidade").
# Peso corporal, MOBILIDADE do pescoço: a cabeça inclina de lado devagar (a orelha em direção ao ombro), volta ao centro e inclina pro
# outro lado, sem segurar o alongamento. CÍCLICO ("ciclo": true na ficha, t = 1 igual a t = 0; o app repete o ciclo):
#   t = 0 (a FOTO parada do app): a cabeça inclinada pra DIREITA, no meio da pausa curta do fim · volta ao centro · pausa curta · inclina
#   pra ESQUERDA (t = 0,5 = o meio da pausa do lado esquerdo) · volta ao centro · pausa curta · inclina pra direita de novo (t = 1).
# Técnica (só o que foi lido; as frases completas, as fontes e os tempos estão na ficha):
#  · ACE, Lateral Neck Flexion (#202): "Slowly draw your right ear toward your right shoulder stopping when you feel the stretch. Be sure
#    to maintain body alignment keeping your shoulders down and back." · "Slowly return to starting position. Repeat on the left side."
#  · Mayo Clinic, Neck stretches for the workplace (vídeo, sentado): "tilt your head so that you're moving your ear toward your
#    shoulder. Don't bring your shoulder up to your ear." · "Relax and slowly return to the starting position."
#  · NHS (Musculoskeletal Physiotherapy OCATS, Neck Mobility Exercises — a MOBILIDADE, sem segurar): "Sit upright" · "Hold onto a chair
#    with both hands to fix your shoulders down." · "Bend your neck to the side bringing your Left ear towards your Left shoulder. Go as far
#    as comfortable then return to the starting position." · "at a relatively moderate pace (you are trying to get your joints / muscles
#    moving)" · "Repeat 10 times".
#  · Mayfield Clinic (Neck Rotation, a outra mobilidade da página): "Rotate head gently and slowly from side to side" · foto: SENTADA, as
#    MÃOS NAS COXAS, o tronco ereto.
#  · ExRx, Upper Trapezius Stretch: "Tilt head away from lowered shoulder" (Target "Trapezius, Upper").
# Montagem: sentado na ponta do banco reto (e3.banco, o da Rosca Punho com Halter), o tronco ereto e parado, os pés chapados na largura
# do quadril com a canela em pé, as 2 mãos soltas apoiadas em cima das coxas (palma pra baixo, dedos pra frente, cada dedo caindo até
# encostar). Só o pescoço e a cabeça mexem: a inclinação gira o osso Neck (base do pescoço) e o osso Head (base do crânio) em volta do
# eixo frente-trás do tronco, a maior parte embaixo (NECK_FRAC) — o pescoço dobra ao longo dele e a cabeça não "quebra" num ponto só —,
# sem girar o rosto (o rosto continua de frente: fotos da ACE, quadros da Mayo) e sem levar a cabeça pra frente nem pra trás (ACE, Neck
# Flexion and Extension: "Avoid any movement of the shoulders or shifting the head anterior and posterior"). Os ombros não sobem e o
# tronco não inclina junto. Contas e tentativas: physiqcalc-scratch/lote4/mobilidade_cervical/exp/.
import math
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
import deitado3d as dt
import tecnica3d as tc
from cena import Cena

ASSENTO = 0.44           # topo do banco reto (m), igual aos outros bancos da fábrica (Rosca Punho, Rosca Concentrada)
LARGURA = 0.30           # largura do estofado
FRENTE = 0.20            # borda da frente do banco à frente da articulação do quadril (m): glúteo e metade de trás das coxas em cima
                         # do banco, joelhos e pernas pra fora dele (sentado na ponta do banco)
PE_X = 0.12              # tornozelos pra fora do meio do corpo (m): pés na largura do quadril (articulações em ±0,106)
INCLINA = 0.0            # tronco à frente da vertical (graus): ereto ("Sit upright", NHS; "Sit up tall with good posture", Mayfield)
ESCAPULA = (4.0, 3.0)    # cintura escapular (graus): retração e depressão leves — os ombros um pouco pra trás e pra baixo, parados
                         # (ACE #202: "depress and retract your scapulae (pull shoulders down and back) without arching your low back";
                         # NHS: "Sit upright with your shoulder blades squeezed together"; Mayfield: "keeping shoulders down")
MAO_COXA = 0.62          # mãos apoiadas em cima das coxas, a essa fração do quadril até o joelho (foto da Mayfield, Neck Rotation)
MAO_DENTRO = 12.0        # dedos virados pra dentro (graus) a partir da frente: a mão solta em cima da coxa
AFUNDA = 0.001           # palma encostando na coxa: a pele afunda até isso (m)
POLO_COTOVELO = (0.30, 0.45, 0.0)  # polo do IK do cotovelo (pra fora, pra trás, pra cima; m): o cotovelo dobra pra trás, perto do tronco,
                         # com o braço solto (foto da Mayfield); com o polo da Rosca Punho (0,5 pra fora) os cotovelos abriam pros lados
# ── o pescoço ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
INCLINA_CAB = 28.0       # inclinação da cabeça de cada lado (graus, a cabeça inteira: base → topo, × o eixo do tronco, vista de frente):
                         # "Go as far as comfortable" (NHS) / "stopping when you feel the stretch" (ACE), abaixo da média ativa MÁXIMA de
                         # jovens saudáveis sentados (31–37°: Farooq et al. 2016, Pak J Med Sci 32(2):457–461, tabela II)
NECK_FRAC = 0.75         # fração da inclinação no osso Neck (base do pescoço); o resto no osso Head (base do crânio)
# ── o ciclo (s) ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
VAI_S = 1.5              # do centro até o lado (no vídeo da Mayo, a 12 quadros/s, a cabeça inclina em ~0,85 s e volta em ~0,6 s — a versão
                         # alongamento; aqui mais devagar: "Slowly", ACE; "gently and slowly", Mayfield; "Use smooth, slow movements", NHS de
                         # Wolverhampton)
VOLTA_S = 1.5            # do lado de volta ao centro ("Slowly return to starting position", ACE)
FIM_S = 1.0              # parado no fim de cada lado: chega e volta, sem segurar o alongamento (mobilidade: "Go as far as comfortable
                         # then return to the starting position", NHS) — as seguradas de 5–30 s são da versão alongamento
MEIO_S = 0.5             # parado no centro entre um lado e o outro ("return to the starting position", NHS; "Repeat on the left side", ACE)
CICLO_S = 2 * (VAI_S + VOLTA_S + FIM_S + MEIO_S)
PERNA = ("LeftUpLeg", "LeftLeg", "RightUpLeg", "RightLeg")
OMBRO_PARTES = ("Spine2", "LeftArm", "RightArm", "LeftShoulder", "RightShoulder")
OMBRO_X = 0.09           # o ombro e o trapézio de cima começam a essa distância do meio do corpo (m): o pescoço tem ±0,079 (sonda)


def _bvh_de(bon, partes):
    co, tri, (nomes, dono) = ck._avaliar(bon.corpo, 1)
    m = np.array([n in partes for n in nomes] + [False])[dono]
    t = tri[m[tri].all(axis=1)]
    return BVHTree.FromPolygons([tuple(p) for p in co], [tuple(x) for x in t], all_triangles=True), co, nomes, dono


def _distancia(bvh, pts):
    """Menor distância com sinal dos pontos até a superfície (− = dentro), como o checagem3d.contatos."""
    menor = 1e9
    for p in pts:
        v = Vector(p)
        loc, nor, idx, dist = bvh.find_nearest(v)
        if loc is None:
            continue
        menor = min(menor, -dist if (dist < 0.03 and (v - loc).dot(nor) < 0) else dist)
    return menor


def inclinacao(t):
    """Inclinação da cabeça (graus, + = pra DIREITA) no instante t do ciclo: t = 0 no meio da pausa do lado direito; t = 0,5 no meio da
    do esquerdo; t = 1 igual a t = 0. Cada ida e cada volta começa e acaba parada (ease seno)."""
    s = (t % 1.0) * CICLO_S
    fases = ((FIM_S / 2, 1, 1), (VOLTA_S, 1, 0), (MEIO_S, 0, 0), (VAI_S, 0, -1), (FIM_S, -1, -1), (VOLTA_S, -1, 0),
             (MEIO_S, 0, 0), (VAI_S, 0, 1), (FIM_S / 2, 1, 1))
    for dur, a, b in fases:
        if s <= dur + 1e-9:
            return INCLINA_CAB * p3.lerp(a, b, p3.suave(min(s / dur, 1.0)))
        s -= dur
    return INCLINA_CAB


def montar(bon):
    pg.usar_polegar("volta")             # padrão dos exercícios novos (a mão não fecha em nada aqui: não muda nada)
    rig = bon.rig
    PB = rig.pose.bones
    coxa = (p3.cabeca(rig, "LeftLeg") - p3.cabeca(rig, "LeftUpLeg")).length
    canela = (p3.cabeca(rig, "LeftFoot") - p3.cabeca(rig, "LeftLeg")).length
    tornozelo_z = p3.cabeca(rig, "LeftFoot").z                                     # pé chapado em pé

    # ── pernas por IK (alvos nascem no tornozelo de repouso: alvo = polo dá NaN) e pés chapados ──────────────────────────────────
    tornozelos, polos_j, pernas = {}, {}, {}
    for lado, s in dt.LADOS:
        tornozelos[lado] = p3.vazio("tornozelo_" + lado, p3.ponta(rig, lado + "Leg"))
        polos_j[lado] = p3.vazio("polo_joelho_" + lado, p3.cabeca(rig, lado + "Leg") + Vector((s * 0.04, -0.6, 0.3)))
        pernas[lado] = p3.ik(rig, lado + "Leg", tornozelos[lado], polos_j[lado])
        p3.travar_rotacao(rig, lado + "Foot")
    # ── braços por IK (as 2 mãos apoiadas nas coxas) ────────────────────────────────────────────────────────────────────────────
    punhos, polos, iks = {}, {}, {}
    for lado, s in dt.LADOS:
        punhos[lado] = p3.vazio("punho_" + lado, p3.ponta(rig, lado + "ForeArm"))
        polos[lado] = p3.vazio("polo_cotovelo_" + lado, p3.cabeca(rig, lado + "ForeArm") + Vector((s * 0.3, 0.3, -0.5)))
        iks[lado] = p3.ik(rig, lado + "ForeArm", punhos[lado], polos[lado])
    pivo0 = (p3.cabeca(rig, "LeftUpLeg") + p3.cabeca(rig, "RightUpLeg")) / 2
    y_frente = pivo0.y - FRENTE

    def _sentar(inclina):
        """Tronco `inclina` graus à frente em volta das articulações do quadril, canelas em pé (joelho em cima do tornozelo) e a pele
        do glúteo e das coxas em cima do banco afundando 2 mm no estofado (o jeito da Rosca Punho com Halter)."""
        PB[p3.P + "Hips"].matrix_basis = Matrix()
        p3.atualizar()
        p3.girar_osso(rig, "Hips", p3.rot_x(inclina), pivo=pivo0)
        for volta in range(25):
            for lado, s in dt.LADOS:
                q = p3.cabeca(rig, lado + "UpLeg")
                dz = q.z - (tornozelo_z + canela)
                dx = s * PE_X - q.x
                dy = math.sqrt(max(coxa ** 2 - dz ** 2 - dx ** 2, 1e-6))
                tz = Vector((s * PE_X, q.y - dy, tornozelo_z))
                tornozelos[lado].location = tz
                d = tz - q
                cima = Vector((0, -d.z, d.y)).normalized()
                if cima.z < 0:
                    cima.negate()
                polos_j[lado].location = (q + tz) / 2 + cima * 0.6 + Vector((s * 0.04, 0, 0))
            p3.atualizar()
            if volta == 0:
                for lado, _ in dt.LADOS:
                    p3.acertar_polo(rig, pernas[lado], lado + "Leg", lado + "UpLeg", lado + "Foot")
            v = dt.malha(bon, ("Hips", "LeftUpLeg", "RightUpLeg"))
            v = v[(v[:, 1] > y_frente) & (np.abs(v[:, 0]) < LARGURA / 2)]
            desce = ASSENTO - 0.002 - v[:, 2].min()
            p3.girar_osso(rig, "Hips", Matrix.Identity(3), mover=Vector((0, 0, desce)))
            if abs(desce) < 0.0003 and volta > 0:
                break
        return volta + 1

    def _congelar(lado):
        nomes = (lado + "Arm", lado + "ForeArm")
        mats = [PB[p3.P + n].matrix.copy() for n in nomes]
        iks[lado].mute = True
        for n, M in zip(nomes, mats):
            PB[p3.P + n].matrix = M
            p3.atualizar()

    def _girar_antebraco(lado, quer):
        """Prona/supina o antebraço em volta do próprio eixo pra palma ir pra `quer` (projetado ⟂ antebraço)."""
        f0, f1 = p3.cabeca(rig, lado + "ForeArm"), p3.cabeca(rig, lado + "Hand")
        ax = (f1 - f0).normalized()
        quer = (quer - ax * quer.dot(ax)).normalized()
        tem = pg._base(rig, lado)[0]
        tem = (tem - ax * tem.dot(ax)).normalized()
        ang = math.atan2(tem.cross(quer).dot(ax), tem.dot(quer))
        p3.girar_osso(rig, lado + "ForeArm", Matrix.Rotation(ang, 3, ax))

    def _mao_quadro(lado, dq, pq):
        """Mão `lado` com o 3º metacarpo (punho → base do dedo médio) apontando pra `dq` e a palma pra `pq` (mundo), girando em volta
        do punho."""
        f1 = p3.cabeca(rig, lado + "Hand")
        d = (p3.cabeca(rig, lado + "HandMiddle1") - f1).normalized()
        n = pg._base(rig, lado)[0]
        n = (n - d * n.dot(d)).normalized()
        pq = (pq - dq * pq.dot(dq)).normalized()
        F_tem = Matrix((d, n, d.cross(n))).transposed()
        F_quer = Matrix((dq, pq, dq.cross(pq))).transposed()
        p3.girar_osso(rig, lado + "Hand", F_quer @ F_tem.transposed())

    def _dedos_encostando(lado, bvh):
        """Cada dedo (fora o polegar) dobra as 3 juntas na proporção da mão de referência, do mais esticado pro mais dobrado, até a
        pele encostar na pele da perna (sem entrar)."""
        co, _, (nomes, dono) = ck._avaliar(bon.corpo, 1)
        pos = {n: i for i, n in enumerate(nomes)}
        palma_n, eixo_nos = pg._base(rig, lado)[:2]
        for d in p3.DEDOS:
            ossos = ["%sHand%s%d" % (lado, d, i) for i in (1, 2, 3)]
            pts = {o: co[dono == pos[o]] for o in ossos}
            cab = {o: np.array(p3.cabeca(rig, o)) for o in ossos}
            ponta = np.array(p3.ponta(rig, ossos[-1]))
            f = (p3.ponta(rig, ossos[0]) - p3.cabeca(rig, ossos[0])).normalized()
            sinal = 1 if eixo_nos.cross(f).dot(palma_n) > 0 else -1
            ref = pg.ANGULOS_REF[d]
            escolha = None
            for lam in np.arange(-0.10, 0.61, 0.02):
                angs = [lam * ref[k] * sinal for k in range(3)]
                pp = pg._cadeia_pts(pts, cab, ponta, ossos, [eixo_nos] * 3, angs)
                dmin = _distancia(bvh, np.concatenate([pp[o] for o in ossos])[::2])
                if dmin < -0.0015:                               # entrou: fica no anterior
                    break
                escolha = angs
                if dmin < 0.001:                                 # encostou
                    break
            for k, o in enumerate(ossos):
                if escolha and escolha[k]:
                    p3.girar_osso(rig, o, p3.rot_eixo(escolha[k], eixo_nos))

    def _polegar_encostando(lado, bvh):
        """Polegar solto do lado do indicador: dobra (ou abre) até encostar na pele da perna sem entrar."""
        ossos = [lado + "HandThumb%d" % i for i in (1, 2, 3)]
        melhor = None
        for lam in np.arange(-1.5, 1.51, 0.1):
            for o in ossos:
                PB[p3.P + o].matrix_basis = Matrix()
            p3.atualizar()
            p3.fechar_mao(rig, lado, angulos=(0, 0, 0), polegar=tuple(lam * g for g in (10, 20, 15)))
            co, _, (nomes, dono) = ck._avaliar(bon.corpo, 1)
            d = _distancia(bvh, co[np.array([n in ossos for n in nomes] + [False])[dono]])
            nota = abs(d - 0.0005) if d >= -0.0015 else 1 + abs(d)
            if melhor is None or nota < melhor[0]:
                melhor = (nota, lam, d)
        for o in ossos:
            PB[p3.P + o].matrix_basis = Matrix()
        p3.atualizar()
        p3.fechar_mao(rig, lado, angulos=(0, 0, 0), polegar=tuple(melhor[1] * g for g in (10, 20, 15)))
        return melhor

    def _mao_na_coxa(lado, frac, dentro):
        """Mão solta apoiada em cima da coxa, palma pra baixo e dedos pra frente (`dentro` graus pra dentro), com o centro do apoio da
        palma em cima do fêmur a `frac` do quadril até o joelho e a pele afundando AFUNDA; o punho vai por IK (cotovelo dobrado pra fora
        e pra trás) e cada dedo cai até encostar (o jeito da mão de descanso da Rosca Punho com Halter)."""
        s = 1 if lado == "Left" else -1
        H, K = p3.cabeca(rig, lado + "UpLeg"), p3.cabeca(rig, lado + "Leg")
        alvo = H.lerp(K, frac)
        a = math.radians(dentro)
        dq = Vector((-s * math.sin(a), -math.cos(a), 0))
        pq = Vector((0, 0, -1))
        p3.soltar_dedos(rig, lado)
        pg.juntar_dedos(rig, lado, 0.6)
        p3.fechar_mao(rig, lado, angulos=(6, 8, 4), polegar=(10, 20, 15))       # mão relaxada: dedos quase retos
        bvh = _bvh_de(bon, PERNA)[0]
        S = p3.cabeca(rig, lado + "Arm")
        W = alvo + Vector((0, 0.07, 0.12))
        polos[lado].location = (S + W) / 2 + Vector((s * POLO_COTOVELO[0], POLO_COTOVELO[1], POLO_COTOVELO[2]))
        PB[p3.P + lado + "Hand"].matrix_basis = Matrix()
        dz = 0.0
        for volta in range(12):
            iks[lado].mute = False
            punhos[lado].location = W
            p3.atualizar()
            if volta == 0:
                p3.acertar_polo(rig, iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
            _congelar(lado)
            _girar_antebraco(lado, pq)
            _mao_quadro(lado, dq, pq)
            co, _, (nomes, dono) = ck._avaliar(bon.corpo, 1)
            P = co[np.array([n == lado + "Hand" for n in nomes] + [False])[dono]]
            baixo = P[P[:, 2] < P[:, 2].min() + 0.008].mean(axis=0)              # onde a palma apoia
            pol = co[np.array([n.startswith(lado + "HandThumb") for n in nomes] + [False])[dono]]
            dz = min(_distancia(bvh, P), _distancia(bvh, pol)) + AFUNDA          # a base do polegar também apoia
            mexe = Vector((alvo.x - baixo[0], alvo.y - baixo[1], -dz))
            if mexe.length < 0.0007:
                break
            W = W + mexe
        _dedos_encostando(lado, bvh)
        _polegar_encostando(lado, bvh)
        return dz - AFUNDA

    # ── sentado ereto na ponta do banco ────────────────────────────────────────────────────────────────────────────────────────────
    voltas = _sentar(INCLINA)
    zq = ((p3.cabeca(rig, "LeftUpLeg") + p3.cabeca(rig, "RightUpLeg")) / 2).z
    print("SENTADO (%d voltas): tronco %.2f° à frente | quadril z %.3f | joelho E %.0f° D %.0f°" % (
        voltas, INCLINA, zq, ck.medir_juntas(rig)["joelhoE"], ck.medir_juntas(rig)["joelhoD"]), flush=True)
    # ── escápulas um pouco pra trás e pra baixo (a clavícula gira na base, no esterno) ─────────────────────────────────────────────
    cima_t = (p3.cabeca(rig, "Neck") - p3.cabeca(rig, "Hips")).normalized()
    for lado, s in dt.LADOS:
        PB[p3.P + lado + "Shoulder"].matrix_basis = Matrix()
        p3.atualizar()
        p3.girar_osso(rig, lado + "Shoulder", Matrix.Rotation(math.radians(s * ESCAPULA[0]), 3, cima_t))           # + = pra trás
        p3.girar_osso(rig, lado + "Shoulder", Matrix.Rotation(math.radians(s * ESCAPULA[1]), 3, Vector((0, 1, 0))))  # + = desce
    # ── as 2 mãos apoiadas em cima das coxas ───────────────────────────────────────────────────────────────────────────────────────
    for lado, _ in dt.LADOS:
        palma = _mao_na_coxa(lado, MAO_COXA, MAO_DENTRO)
        mj = ck.medir_juntas(rig)
        k = "E" if lado == "Left" else "D"
        print("MÃO %s na coxa: palma %+.1f mm da pele | punho %.0f° cotovelo %.0f° ombro %.0f°" % (
            k, palma * 1000, mj["punho" + k], mj["cotovelo" + k], mj["ombro" + k]), flush=True)

    # ── banco reto debaixo do glúteo e da metade de trás das coxas ─────────────────────────────────────────────────────────────────
    banco = e3.banco("banco", y_frente, y_frente + 1.20, topo=ASSENTO, largura=LARGURA)

    # ── pescoço: o eixo frente-trás do tronco (parado) e as matrizes de partida do Neck e do Head ──────────────────────────────────
    j0 = ck.posicoes(rig)
    _, _, frente = tc.eixos_tronco(j0)
    FRENTE_V = Vector(tuple(frente)).normalized()
    ombro0 = {lado: p3.cabeca(rig, lado + "Arm").copy() for lado, _ in dt.LADOS}
    REPOUSO = tc.cabeca_inclinacao(j0)[0]        # o boneco no repouso já tem a cabeça um pouco inclinada: o centro do ciclo fica em 0
    print("CABEÇA no repouso: %+.2f° de lado (compensado) | cabeca_tronco %+.1f°" % (REPOUSO, tc.cabeca_tronco(j0)[0]), flush=True)

    def _cabeca(graus):
        """Inclina a cabeça `graus` (+ = direita: o topo da cabeça vai pro lado direito do corpo, −X) em volta do eixo frente-trás do
        tronco: NECK_FRAC no osso Neck (em volta da base do pescoço) e o resto no osso Head (em volta da base do crânio)."""
        PB[p3.P + "Neck"].matrix_basis = Matrix()
        PB[p3.P + "Head"].matrix_basis = Matrix()
        p3.atualizar()
        g = graus - REPOUSO
        p3.girar_osso(rig, "Neck", p3.rot_eixo(g * NECK_FRAC, FRENTE_V))
        p3.girar_osso(rig, "Head", p3.rot_eixo(g * (1 - NECK_FRAC), FRENTE_V))

    def pose(t):
        """t = 0 cabeça inclinada pra direita (pausa do fim), t = 0,5 pra esquerda, t = 1 igual a t = 0 (ciclo)."""
        pose.t = t
        _cabeca(inclinacao(t))

    pose.t = 0.0

    def _bvh_tri(co, tri):
        return BVHTree.FromPolygons([tuple(p) for p in co], [tuple(x) for x in tri], all_triangles=True)

    def _cabeca_ombro(co, tri, G):
        """Menor distância (mm) da pele de cima do ombro e do trapézio de cada lado (Spine2 e braço, a mais de OMBRO_X do meio do corpo:
        fora do pescoço, que tem ~8 cm de cada lado) até a cabeça — a pele dela ou o cabelo por cima (− = entrou): [esquerdo, direito].
        co, tri, G: a malha do quadro (ck._avaliar) e G(partes) = os vértices dessas partes."""
        mc = G(("Head",))
        bvh = BVHTree.FromPolygons([tuple(p) for p in co], [tuple(x) for x in tri[mc[tri].all(axis=1)]], all_triangles=True)
        cab = ck._avaliar_simples(bon.cabelo)
        bvh_c = BVHTree.FromPolygons([tuple(p) for p in cab[0]], [tuple(x) for x in cab[1]], all_triangles=True)
        mo = G(OMBRO_PARTES)
        out = []
        for _, s in dt.LADOS:
            pts = co[mo & (s * co[:, 0] > OMBRO_X)]
            menor = 1e9
            for p in pts[pts[:, 2] > pts[:, 2].max() - 0.20]:
                v = Vector(p)
                loc, nor, idx, dist = bvh.find_nearest(v)
                d = -dist if (loc is not None and dist < 0.03 and (v - loc).dot(nor) < 0) else dist
                lc, nc, ic, dc = bvh_c.find_nearest(v)
                if lc is not None and d >= 0:
                    d = min(d, dc)
                menor = min(menor, d)
            out.append(menor * 1000)
        return out

    def _dobra(co, tri, G):
        """Do lado que dobra o pescoço fica comprimido: triângulos da pele que se cruzam (fora os vizinhos, que dividem vértice) entre a
        cabeça (Head) e o pescoço (Neck), e entre a cabeça + o pescoço e o tronco e os ombros (Spine2 + braços), de cada lado do corpo
        (pelo x do meio do triângulo): [E, D], [E, D]. A distância com sinal não serve aqui: a pele da cabeça, a do pescoço e a do tronco
        são pedaços abertos que se emendam no pescoço, e perto da emenda a normal da borda dá "dentro" falso (−30 mm já no repouso)."""
        out = []
        for a, b in ((("Head",), ("Neck",)), (("Head", "Neck"), ("Spine2", "LeftArm", "RightArm"))):
            ta, tb = tri[G(a)[tri].all(axis=1)], tri[G(b)[tri].all(axis=1)]
            ba, bb = _bvh_tri(co, ta), _bvh_tri(co, tb)
            conta = [0, 0]
            for i, k in ba.overlap(bb):
                if set(ta[i]) & set(tb[k]):
                    continue                                     # vizinhos (dividem vértice): encostar é a emenda da pele
                conta[0 if co[ta[i]].mean(axis=0)[0] > 0 else 1] += 1
            out.append(conta)
        return out[0], out[1]

    def _giro_rosto():
        """Giro do rosto (graus, + = virado pra DIREITA) em volta do eixo do tronco: a frente da cabeça (eixo Z local do osso Head) × a
        frente do tronco, as 2 no plano ⟂ ao tronco."""
        jj = ck.posicoes(rig)
        cima, lado, fr = tc.eixos_tronco(jj)
        f = np.array(p3.mundo_osso(rig, "Head").to_3x3().col[2])
        f = f - cima * (f @ cima)
        fr = fr - cima * (fr @ cima)
        return math.degrees(math.atan2(float(np.cross(fr, f) @ -cima), float(f @ fr)))

    def info():
        jj = ck.posicoes(rig)
        mj = ck.medir_juntas(rig)
        sobe = ["%+.1f" % ((p3.cabeca(rig, lado + "Arm").z - ombro0[lado].z) * 1000) for lado, _ in dt.LADOS]
        co, tri, (nomes, dono) = ck._avaliar(bon.corpo, 1)          # a malha do quadro, avaliada 1 vez só
        G = lambda partes: np.array([n in partes for n in nomes] + [False])[dono]
        bvh = _bvh_tri(co, tri[G(PERNA)[tri].all(axis=1)])
        maos = []
        for lado, _ in dt.LADOS:
            dedos = ["%sHand%s%d" % (lado, d, i) for d in p3.DEDOS + ("Thumb",) for i in (1, 2, 3)]
            maos.append("%+.1f" % (_distancia(bvh, co[G([lado + "Hand"] + dedos)]) * 1000))
        co_ = _cabeca_ombro(co, tri, G)
        dob, todo = _dobra(co, tri, G)
        return ("t %.3f | cabeça %+.1f° de lado (alvo %+.1f) | cabeca_tronco %+.1f° | pescoço %.0f° | rosto girado %+.1f° | "
                "cabeça × ombro E/D %.0f/%.0f mm | triângulos cruzados cabeça×pescoço E/D %d/%d, cabeça+pescoço×tronco E/D %d/%d | "
                "ombros sobem E/D %s/%s mm | "
                "ombros_nivel %+.1f° | tronco_giro %+.1f° | mãos × coxas E/D %s/%s mm | cotovelo E/D %.0f/%.0f° punho E/D %.0f/%.0f°" % (
                    pose.t, (tc.cabeca_inclinacao(jj) or [float("nan")])[0], inclinacao(pose.t), tc.cabeca_tronco(jj)[0],
                    mj["pescoco"], _giro_rosto(), co_[0], co_[1], dob[0], dob[1], todo[0], todo[1], sobe[0], sobe[1],
                    tc.ombros_nivel(jj)[0], tc.tronco_giro(jj)[0], maos[0], maos[1], mj["cotoveloE"], mj["cotoveloD"],
                    mj["punhoE"], mj["punhoD"]))

    return Cena(pose, [], pegadas=[], apoio_mm=0.0, foco_luz=(0, -0.05, 1.0),
                camera_video=((1.2, -3.6, 1.25), (0, -0.05, 0.95), 50), info=info, apoios=[banco], afunda_apoio_mm=20)
