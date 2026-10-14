# Alongamento Abraçando os Joelhos — cena da fábrica 3D (lote 15, 13/10/2026). Peso corporal, ALONGAMENTO PARADO, deitado de costas no
# colchonete de 12 mm dos prontos de costas (a caixa é da própria cena, de apoio; nenhuma peça do lib/).
# Ciclo (regra do lote 15 por coerência com a Prancha — fica pra validação final do Weslley): CÍCLICO ("ciclo": true, t = 1 igual a t = 0;
# o app repete): t = 0 é o ABRAÇO SEGURADO (a foto parada do app: os 2 joelhos no peito, cada mão segurando a sua canela logo abaixo do
# joelho, a lombar encostada e o sacro um pouco fora do colchonete, a cabeça e os ombros no colchonete); segura 5 s; no meio do ciclo
# solta devagar até a posição de começo da fonte (deitado, joelhos dobrados, pés chapados, mãos na barriga — t = 0,5 é o meio do tempo
# lá) e abraça de novo.
# Técnica (só o que foi lido; as frases completas e as fontes estão na ficha e em lote4/alongamento_abracando_os_joelhos/fontes.md):
#  · free-exercise-db, Hug Knees To Chest: "Lie down on your back and pull both knees up to your chest." · "Hold your arms under the
#    knees, not over (that would put to much pressure on your knee joints)." · "Slowly pull the knees toward your shoulders. This also
#    stretches your buttocks muscles."
#  · ExRx, Lying Lower Back Stretch: "Lie supine on floor or mat. Raise both knees and grasp back of thighs behind knees." · "Pull knees
#    toward shoulders allowing hips to be raised further off floor. Hold stretch."
#  · Mayo Clinic, Knee-to-chest stretch: "Lie on your back with your knees bent and your feet flat on the floor (A)." · "Tighten the
#    muscles in your belly and press your spine to the floor. Hold for five seconds." · "Then repeat with both legs at the same time (D)."
#  · AAOS, Spine Conditioning Program, 5. Knee to Chest: "Grasp your knee or shin and pull your leg in as far as it will go." · "Tighten
#    your abdominals and press your spine to the floor. Hold for 5 seconds." · "then pull both legs in together".
#  · NHS inform, Double knee hug: "Lying on your back, slowly bring your knees in towards your chest. You can place the hands over the
#    knees to feel the stretch a little deeper." · "Slowly release the knee hug."
#  · Arthritis Research UK, 1. Hugging knees to chest: "Lying on your back with bent knees, lift one leg and hold on to it with one hand
#    and then lift and hold the other leg. Pull both knees gently closer to your chest, hold for a count of 5".
# Decisões: COMEÇO = joelhos dobrados (~100°), pés chapados juntos (o mais junto sem uma coxa entrar na outra) e as mãos na barriga
# (Mayo A; foto 0 do free-exercise-db). ENTRADA = os 2 joelhos juntos (free-exercise-db, ExRx, NHS inform): sobem por flexão do quadril,
# a pelve começa a enrolar e as mãos saem da barriga e sobem por FORA das coxas até a face de fora das canelas. MÃOS = cada mão na SUA
# canela, logo abaixo do joelho (free-exercise-db: "under the knees, not over"; AAOS: "knee or shin"; Arthritis Research UK: "hold on
# to it with one hand ... hold the other leg"; desenho D da Mayo): a palma na face de fora da canela e os dedos por cima dela (pela
# frente), o polegar do lado do joelho. PUXAR = os cotovelos dobram e a pelve enrola até o fim: a LOMBAR fica encostada no colchonete
# (Mayo/AAOS: "press your spine to the floor") e o SACRO sobe ~4 cm (ExRx: "allowing hips to be raised further off floor"); a coxa passa
# ~39° da vertical (os joelhos sobre o peito). A cabeça e os ombros ficam no colchonete o ciclo todo; os pés soltos no ar segurando.
# Como o rig faz: deitado (o jeito do Abdominal Infra), o Spine2 (~T8–C7: escápulas e ombros) fica PARADO num pino e a coluna enrola nas
# juntas de baixo (ângulos de MUNDO do Spine1, do Spine e da pelve × k); o corpo sobe ou desce até a pele mais funda do tronco ficar
# AFUNDA dentro do colchonete. As pernas: no começo por IK (pés chapados), congeladas em FK; depois a coxa dobra no quadril, o joelho e o
# pé no plano sagital (os joelhos e os pés continuam juntos). Os braços: IK do ombro ao punho com o cotovelo num ângulo do círculo
# (phi), a mão vira pela palma e pelos dedos; na barriga e na canela a palma anda na normal da pele até encostar e cada dedo (e o
# polegar) curva até encostar, sem entrar. A cabeça: o pescoço acerta até o cabelo da nuca encostar, todo quadro.
import math
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
import tecnica3d as tc
import deitado3d as dt
from cena import Cena

LADOS = dt.LADOS                  # (("Left", 1), ("Right", -1)): s = +1 no esquerdo (+X)
TOPO = 0.012                      # colchonete de 12 mm (o dos prontos de costas: Abdominal Supra, Ponte de Glúteo, Extensão da Coluna)
LARGURA = 0.80                    # largura do colchonete (m): no começo os cotovelos ficam a |x| ~0,36 m (o da Ponte de Glúteo)
AFUNDA = 0.004                    # a pele mais funda do tronco (costas, glúteo) dentro do colchonete (o da Ponte e do Supra)
AFUNDA_CABELO = 0.002             # o cabelo da nuca encosta no colchonete (a pele fica embaixo do cabelo)
AFUNDA_PE = 0.0023                # planta dos pés no colchonete no começo (com 1 mm a planta ficava +1,0 mm acima do topo; assim
                                  # fica ~−0,3 mm, a dos prontos de costas: Ponte de Glúteo e Abdominal Supra)
AFUNDA_GLUTEO = 0.002             # no começo o glúteo encosta no colchonete (a pelve inclina um pouco pra frente até ele encostar)
AFUNDA_BRACO = 0.002              # no começo, a pele mais baixa do braço/antebraço (o cotovelo) encosta no colchonete
AFUNDA_MAO = 0.0008               # palma e dedos encostando na pele (barriga no começo, canela no abraço) sem entrar
COXAS_MM = 1.0                    # pernas juntas sem uma coxa (ou perna) entrar na outra mais que isso
JOELHO0 = 100.0                   # flexão do joelho no começo, pés chapados (Mayo A: "knees bent and your feet flat on the floor")
COLUNA = (10.0, 15.0, -30.0)      # abraço: ângulos de MUNDO do Spine1, do Spine e da pelve (rot_x, graus; + = a ponta de baixo desce):
                                  # a lombar desce até encostar e a pelve enrola 30° pra trás (o sacro sobe ~4 cm)
K_PEGA = 0.72                     # na pegada a coluna já enrolou essa fração (a pelve começa a enrolar com os joelhos subindo)
DH_PEGA = 44.0                    # flexão do quadril a mais até a pegada (os joelhos sobem até a coxa passar ~28° da vertical)
DH_PUXA = 2.0                     # flexão a mais puxando (o resto vem da pelve enrolando)
DK = 5.0                          # flexão do joelho a mais no abraço (~105°)
DP = -25.0                        # pé solto no ar: no começo (chapado, com a canela inclinada) o tornozelo está em ~41° de flexão plantar;
                                  # no ar ele relaxa e volta ~25° (fica em ~16°, perto do neutro — as fotos do ExRx e do free-exercise-db)
DOBRA_COXA = 0.18                 # coxa × barriga: até DOBRA_COXA m da junta do quadril AO LONGO da coxa é a dobra da virilha
# ── mãos ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
BARRIGA = (0.125, 0.20)           # começo: o meio da palma na barriga, a |x| e y (m) — dos lados do umbigo (longe das coxas que sobem);
                                  # com |x| 0,105 as pontas dos dedos de uma mão entravam ~8 mm na outra no meio da barriga (14/10)
DEDOS_BARRIGA = (-0.95, -0.3)     # direção dos dedos na barriga (x pra dentro, y pros pés), no plano da pele
D_CANELA = 0.07                   # abraço: o meio da palma na canela, a D_CANELA m do centro do joelho (logo abaixo do joelho)
BETA = 70.0                       # a palma na face de FORA da canela (graus a partir da frente, pro lado de fora)
PALMA_MEIO = 0.045                # do punho ao meio da palma (m)
DOBRA = (1.0, 1.0, 0.8)           # proporção da dobra das 3 falanges quando o dedo curva até encostar
TRONCO_M = ("Spine", "Spine1", "Spine2")                      # a pele da barriga e do peito (pras mãos na barriga)
PERNAS_T = ("LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg")
# ── tempos (o ciclo) ───────────────────────────────────────────────────────────────────────────────────────────────────────────
SEGURA_S, SOLTA_S, EMBAIXO_S, ENTRA_S = 5.0, 4.0, 1.0, 4.0   # s: segura (Mayo/AAOS/Arthritis Research UK: 5), solta, começo, entra
# (solta e entra devagar — free-exercise-db/NHS inform: "slowly"; com 2,5 s a mão virando no meio do caminho andava até 105 mm num
# quadro de 1/16 s, acima do limite de 80 da checagem: com 4 s o maior salto da checagem completa cai pra 57, sem mudar nenhuma pose)
CICLO_S = SEGURA_S + SOLTA_S + EMBAIXO_S + ENTRA_S
T_SOLTA = (0.5 - (EMBAIXO_S / 2 + SOLTA_S) / CICLO_S, 0.5 - EMBAIXO_S / 2 / CICLO_S)
T_ENTRA = (0.5 + EMBAIXO_S / 2 / CICLO_S, 0.5 + (EMBAIXO_S / 2 + ENTRA_S) / CICLO_S)
U_CHEGA = 0.60                    # dentro da entrada (u de 0 a 1): os joelhos sobem até U_CHEGA e as mãos chegam do lado das canelas
U_PEGA = 0.70                     # de U_CHEGA a U_PEGA as mãos encostam e fecham; depois puxam (os joelhos vêm pro peito)
JANELA_MAOS = (0.30, U_CHEGA)     # as mãos saem da barriga (os joelhos ainda longe) e sobem por fora até o lado das canelas
LADO_C = 0.26                     # caminho das mãos da barriga até a canela: curva (Bézier) que sobe da barriga com o ponto de controle
                                  # LADO_C m pro lado de fora do meio do caminho: as mãos sobem por fora das coxas
GIRA_MAO = 0.6                    # a mão termina de virar (dedos da barriga → dedos pra cima, abertos) em GIRA_MAO do caminho: assim
                                  # os dedos não ficam apontando pra coxa que sobe
APROX = 0.05                      # ... até APROX m por fora da face da canela (onde ela vai estar na pegada), a mão aberta já virada;
                                  # aí encosta e fecha os dedos


def _rampa(u, a, b):
    if u <= a:
        return 0.0
    if u >= b:
        return 1.0
    x = (u - a) / (b - a)
    return x * x * (3 - 2 * x)


def abraco(t):
    """u no quadro t: 1 = segurando o abraço, 0 = a posição de começo (deitado, pés chapados); anda em linha reta no tempo da saída e
    da entrada (cada parte tem a sua rampa suave)."""
    if t <= T_SOLTA[0] or t >= T_ENTRA[1]:
        return 1.0
    if t < T_SOLTA[1]:
        return 1.0 - (t - T_SOLTA[0]) / (T_SOLTA[1] - T_SOLTA[0])
    if t <= T_ENTRA[0]:
        return 0.0
    return (t - T_ENTRA[0]) / (T_ENTRA[1] - T_ENTRA[0])


def _malha(bon):
    return ck._avaliar(bon.corpo, 1)


def _grupo(nomes, dono, partes):
    return np.array([n in partes for n in nomes] + [False])[dono]


def _arvore(co, tri, m):
    t = tri[m[tri].all(axis=1)]
    return BVHTree.FromPolygons([tuple(p) for p in co], [tuple(x) for x in t], all_triangles=True)


def _distancia(bvh, P, alcance=0.15):
    """Menor distância (m, − = dentro) dos pontos P até a superfície da árvore (o jeito do checagem3d.contatos)."""
    pior = 1e9
    for p in P:
        v = Vector(p)
        loc, nor, idx, d = bvh.find_nearest(v, alcance)
        if loc is None:
            continue
        pior = min(pior, -d if (d < 0.03 and (v - loc).dot(nor) < 0) else d)
    return pior


def _mao(lado):
    return (lado + "Hand",) + tuple("%sHand%s%d" % (lado, d, i) for d in p3.DEDOS + ("Thumb",) for i in (1, 2, 3))


def montar(bon):
    pg.usar_polegar("volta")         # padrão dos exercícios novos (aqui não há pegador: a mão segura a canela, cada dedo encosta na pele)
    rig = bon.rig
    PB = rig.pose.bones
    c = lambda n: p3.cabeca(rig, n)
    tornozelo_z = p3.ponta(rig, "LeftLeg").z                    # altura do tornozelo em pé (pé chapado)
    L_coxa = (c("LeftLeg") - c("LeftUpLeg")).length
    L_canela = (c("LeftFoot") - c("LeftLeg")).length
    Lb = (c("LeftForeArm") - c("LeftArm")).length
    La = (c("LeftHand") - c("LeftForeArm")).length

    def pele(partes):
        return dt.malha(bon, partes)

    def cabelo_z():
        return float(ck._avaliar_simples(bon.cabelo)[0][:, 2].min())

    # ── deitado de costas (o jeito do Abdominal Infra) ─────────────────────────────────────────────────────────────────────────
    pivo = (c("LeftUpLeg") + c("RightUpLeg")) / 2
    p3.girar_osso(rig, "Hips", p3.rot_x(-90), pivo=pivo)
    p3.girar_osso(rig, "Hips", Matrix.Identity(3), mover=Vector((0, 0, TOPO - AFUNDA - pele(dt.TRONCO)[:, 2].min())))
    OSSOS_T = ("Hips", "Spine", "Spine1", "Spine2")
    base_t = {n: PB[p3.P + n].matrix_basis.copy() for n in OSSOS_T}
    pino = c("Spine2").copy()                                    # o Spine2 (~T8–C7: escápulas, ombros) fica parado
    estado = {"wc": 0.0, "dz": 0.0, "wp": 0.0, "wm": 0.0, "u": 0.0, "k": 0.0}

    pelve0 = [0.0]                                               # no começo: a pelve inclinada pra frente até o glúteo encostar

    def coluna(k, dz=0.0):
        """Coluna e pelve: os ângulos de MUNDO de COLUNA × k (o Spine2 parado no pino, subindo dz); a pelve tem mais pelve0 × (1 − k)
        (no começo ela fica inclinada até o glúteo encostar; some quando a coluna enrola)."""
        th1, ths, thh = (k * a for a in COLUNA)
        thh += pelve0[0] * (1.0 - k)
        b3, b2, b1 = -th1, th1 - ths, ths - thh
        for n, M in base_t.items():
            PB[p3.P + n].matrix_basis = M.copy()
        p3.atualizar()
        if b1 + b2 + b3:
            p3.girar_osso(rig, "Hips", p3.rot_x(-(b1 + b2 + b3)))
        for n, b in (("Spine", b1), ("Spine1", b2), ("Spine2", b3)):
            if b:
                p3.girar_osso(rig, n, p3.rot_x(b))
        p3.girar_osso(rig, "Hips", Matrix.Identity(3), mover=pino + Vector((0, 0, dz)) - c("Spine2"))

    # ── pernas no começo: IK até os tornozelos no colchonete, pés chapados (a orientação de em pé), o mais juntos que der ──────────
    coluna(0.0)
    tz = TOPO + tornozelo_z - AFUNDA_PE
    d_pe = math.sqrt(L_coxa ** 2 + L_canela ** 2 + 2 * L_coxa * L_canela * math.cos(math.radians(JOELHO0)))
    alvos, polos, iks = {}, {}, {}
    for lado, s in LADOS:
        alvos[lado] = p3.vazio("tornozelo_" + lado, p3.ponta(rig, lado + "Leg"))
        polos[lado] = p3.vazio("polo_joelho_" + lado, c(lado + "Leg") + Vector((0, 0, 0.6)))
        iks[lado] = p3.ik(rig, lado + "Leg", alvos[lado], polos[lado])
        p3.travar_rotacao(rig, lado + "Foot")
    acertado = {}

    def pernas_ik(px):
        for lado, s in LADOS:
            q = c(lado + "UpLeg")
            dx, dz = s * px - q.x, tz - q.z
            dy = math.sqrt(max(d_pe ** 2 - dx * dx - dz * dz, 1e-6))
            a = Vector((s * px, q.y - dy, tz))
            alvos[lado].location = a
            polos[lado].location = Vector((s * px, (q.y + a.y) / 2, 0.9))
        p3.atualizar()
        for lado, _ in LADOS:
            if lado not in acertado:
                acertado[lado] = p3.acertar_polo(rig, iks[lado], lado + "Leg", lado + "UpLeg", lado + "Foot")
        co, tri, (nomes, dono) = _malha(bon)
        ck.posicoes_das_juntas(rig)
        cc = ck.corpo_x_corpo(co, tri, nomes, dono)[0]
        return max(cc["coxaE×coxaD"], cc["pernaE×pernaD"])

    lo, hi = 0.05, 0.16
    if pernas_ik(lo) > COXAS_MM:
        for _ in range(9):
            meio = (lo + hi) / 2
            if pernas_ik(meio) > COXAS_MM:
                lo = meio
            else:
                hi = meio
        PE_X = hi
    else:
        PE_X = lo
    print("COMEÇO | tornozelos a ±%.3f m do meio (o mais junto sem uma coxa entrar na outra) | coxas/pernas %.1f mm" % (
        PE_X, pernas_ik(PE_X)))

    def altura_tronco():
        """Quanto subir o corpo (o pino junto) pra pele mais funda do tronco ficar AFUNDA dentro do colchonete."""
        co, _, (nomes, dono) = _malha(bon)
        return (TOPO - AFUNDA) - float(co[_grupo(nomes, dono, dt.TRONCO)][:, 2].min())

    def gluteo_z():
        co, _, (nomes, dono) = _malha(bon)
        return float(co[_grupo(nomes, dono, ("Hips",))][:, 2].min())

    def comeco(p0):
        """Começo com a pelve inclinada p0 graus (as pernas pelo IK, pés chapados no lugar) e o corpo na altura das costas."""
        pelve0[0] = p0
        dz = estado["dz"]
        for _ in range(2):
            coluna(0.0, dz)
            pernas_ik(PE_X)
            dz += altura_tronco()
        coluna(0.0, dz)
        pernas_ik(PE_X)
        estado["dz"] = dz

    lo, hi = -6.0, 8.0                            # + = a ponta de baixo da pelve desce (inclina pra frente): o glúteo desce
    for _ in range(12):
        comeco((lo + hi) / 2)
        if gluteo_z() > TOPO - AFUNDA_GLUTEO:
            lo = pelve0[0]
        else:
            hi = pelve0[0]
    comeco(hi)
    print("COMEÇO | pelve inclinada %+.2f° pro glúteo encostar | glúteo %+.1f mm do topo | dz %+.1f mm" % (
        pelve0[0], (gluteo_z() - TOPO) * 1000, estado["dz"] * 1000))
    OSSOS_P = tuple(L + n for L, _ in LADOS for n in ("UpLeg", "Leg", "Foot"))
    mats = {n: PB[p3.P + n].matrix.copy() for n in OSSOS_P}       # IK e trava do pé viram FK (filhas da pelve)
    for lado, _ in LADOS:
        iks[lado].mute = True
        for cn in PB[p3.P + lado + "Foot"].constraints:
            cn.mute = True
    for lado, _ in LADOS:
        for n in ("UpLeg", "Leg", "Foot"):
            PB[p3.P + lado + n].matrix = mats[lado + n]
            p3.atualizar()
    inicio = {n: PB[p3.P + n].matrix_basis.copy() for n in OSSOS_P}

    def pernas(wp, wc):
        """Pernas (FK, filhas da pelve): do começo, a coxa dobra no quadril (os joelhos sobem e vêm pro peito), o joelho dobra DK e o
        pé estica DP — tudo no plano sagital (os joelhos e os pés continuam juntos). wp = subida até a pegada, wc = o puxar."""
        for n, M in inicio.items():
            PB[p3.P + n].matrix_basis = M.copy()
        p3.atualizar()
        dH = DH_PEGA * wp + DH_PUXA * wc
        for lado, _ in LADOS:
            if dH:
                p3.girar_osso(rig, lado + "UpLeg", p3.rot_x(-dH))
            if DK * wp:
                H, K, A = c(lado + "UpLeg"), c(lado + "Leg"), c(lado + "Foot")
                p3.girar_osso(rig, lado + "Leg", p3.rot_eixo(DK * wp, (K - H).cross(A - K)))
            if DP * wp:
                K, A, T = c(lado + "Leg"), c(lado + "Foot"), c(lado + "ToeBase")
                p3.girar_osso(rig, lado + "Foot", p3.rot_eixo(-DP * wp, (A - K).cross(T - A)))

    def corpo(u):
        """Coluna, pernas e altura no u (sem os braços e a cabeça)."""
        wp = _rampa(u, 0.0, U_CHEGA)
        wc = _rampa(u, U_PEGA, 1.0)
        k = K_PEGA * _rampa(u, JANELA_MAOS[0] - 0.03, U_CHEGA) + (1.0 - K_PEGA) * wc
        dz = estado["dz"]
        for _ in range(2):
            coluna(k, dz)
            pernas(wp, wc)
            dz += altura_tronco()
        coluna(k, dz)
        pernas(wp, wc)
        estado.update(wc=wc, dz=dz, wp=wp, u=u, k=k)

    def coxa_barriga():
        """Coxa × tronco (barriga e peito: Spine, Spine1, Spine2), mm, onde os triângulos se cruzam: [E, D] de (o mais fundo na dobra
        da virilha — até DOBRA_COXA m da junta ao longo da coxa —, o mais fundo fora dela, até onde a dobra vai ao longo da coxa em m)."""
        co, tri, (nomes, dono) = _malha(bon)
        out = []
        tb = tri[_grupo(nomes, dono, TRONCO_M)[tri].all(axis=1)]
        bb = BVHTree.FromPolygons([tuple(p) for p in co], [tuple(x) for x in tb], all_triangles=True)
        for L, _ in LADOS:
            ta = tri[_grupo(nomes, dono, (L + "UpLeg",))[tri].all(axis=1)]
            ba = BVHTree.FromPolygons([tuple(p) for p in co], [tuple(x) for x in ta], all_triangles=True)
            H = c(L + "UpLeg")
            eixo = (c(L + "Leg") - H).normalized()
            dentro, fora, ate = 0.0, 0.0, 0.0
            pares = ba.overlap(bb)
            for i in (np.unique(ta[[p_[0] for p_ in pares]].ravel()) if pares else ()):
                v = Vector(co[i])
                loc, nor, idx, dist = bb.find_nearest(v, 0.03)
                if loc is None or (v - loc).dot(nor) >= 0:
                    continue
                al = (v - H).dot(eixo)
                if al <= DOBRA_COXA:
                    dentro = max(dentro, dist * 1000)
                    ate = max(ate, al)
                else:
                    fora = max(fora, dist * 1000)
            out.append((dentro, fora, ate))
        return out

    # ── braços: IK do ombro ao punho com o cotovelo num ângulo do círculo; a mão vira pela palma e pelos dedos ──────────────────────
    punhos, polos_b, iks_b = {}, {}, {}
    for lado, s in LADOS:                         # alvo nasce no punho de repouso e o polo afastado (alvo = polo dá NaN)
        punhos[lado] = p3.vazio("punho_" + lado, p3.ponta(rig, lado + "ForeArm"))
        polos_b[lado] = p3.vazio("polo_cotovelo_" + lado, c(lado + "ForeArm") + Vector((s * 0.4, 0.0, 0.3)))
        iks_b[lado] = p3.ik(rig, lado + "ForeArm", punhos[lado], polos_b[lado])
        iks_b[lado].mute = True
    p3.atualizar()
    BRACO = {L: [pb.name[len(p3.P):] for pb in PB if pb.name[len(p3.P):].startswith((L + "Arm", L + "ForeArm", L + "Hand"))]
             for L, _ in LADOS}
    braco_solto = {L: {n: PB[p3.P + n].matrix_basis.copy() for n in BRACO[L]} for L in BRACO}
    DEDOS = {L: [n for n in BRACO[L] if n.startswith(L + "Hand") and n != L + "Hand"] for L in BRACO}
    polo_ok = {}

    def cotovelo_em(lado, s, W, phi):
        """Cotovelo no círculo (ombro S, punho W) no ângulo phi (graus): 0 = pra fora, 90 = pra cima, −90 = pra baixo."""
        S = c(lado + "Arm")
        u_ = (W - S).normalized()
        dist = min((W - S).length, (Lb + La) * 0.999)
        a = (Lb ** 2 - La ** 2 + dist ** 2) / (2 * dist)
        rho = math.sqrt(max(Lb ** 2 - a ** 2, 1e-8))
        ctr = S + u_ * a
        e1 = Vector((s, 0, 0)) - u_ * (u_.x * s)
        e1.normalize()
        e2 = u_.cross(e1) * s
        f = math.radians(phi)
        return ctr + (e1 * math.cos(f) + e2 * math.sin(f)) * rho, ctr, rho

    def orientar(lado, dedos_q, palma_q):
        """Antebraço gira (pronação/supinação) pra palma ir pra `palma_q` e o resto vai no punho até os dedos apontarem pra `dedos_q`
        (o jeito do Abdominal Bicicleta)."""
        dedos_q = Vector(dedos_q).normalized()
        palma_q = Vector(palma_q)
        palma_q = (palma_q - dedos_q * palma_q.dot(dedos_q)).normalized()
        f0, f1 = c(lado + "ForeArm"), c(lado + "Hand")
        ax = (f1 - f0).normalized()
        quer = palma_q - ax * palma_q.dot(ax)
        tem = pg._base(rig, lado)[0]
        tem = tem - ax * tem.dot(ax)
        if quer.length > 1e-6 and tem.length > 1e-6:
            quer.normalize()
            tem.normalize()
            p3.girar_osso(rig, lado + "ForeArm", Matrix.Rotation(math.atan2(tem.cross(quer).dot(ax), tem.dot(quer)), 3, ax))
        h0 = c(lado + "Hand")
        y_m = (p3.ponta(rig, lado + "Hand") - h0).normalized()
        n_m = pg._base(rig, lado)[0]
        n_m = (n_m - y_m * n_m.dot(y_m)).normalized()
        F_tem = Matrix((y_m, n_m, y_m.cross(n_m))).transposed()
        F_quer = Matrix((dedos_q, palma_q, dedos_q.cross(palma_q))).transposed()
        p3.girar_osso(rig, lado + "Hand", F_quer @ F_tem.transposed())

    def por_braco(lado, s, W, phi, dedos_q, palma_q, dedos=None):
        """Punho em W, cotovelo no ângulo phi, mão virada (dedos_q, palma_q) e os dedos na pose local `dedos`. O braço volta pro
        repouso antes (sem giro acumulado de um quadro pro outro). Devolve a distância do punho ao alvo (m)."""
        for n, M in braco_solto[lado].items():
            PB[p3.P + n].matrix_basis = M.copy()
        p3.atualizar()
        E, ctr, rho = cotovelo_em(lado, s, W, phi)
        iks_b[lado].mute = False
        punhos[lado].location = W
        polos_b[lado].location = ctr + (E - ctr).normalized() * (rho + 0.4)
        p3.atualizar()
        if lado not in polo_ok:
            polo_ok[lado] = p3.acertar_polo(rig, iks_b[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
        nomes_b = (lado + "Arm", lado + "ForeArm")
        mats_b = [PB[p3.P + n].matrix.copy() for n in nomes_b]
        iks_b[lado].mute = True
        for n, M in zip(nomes_b, mats_b):
            PB[p3.P + n].matrix = M
            p3.atualizar()
        orientar(lado, dedos_q, palma_q)
        if dedos:
            for n, M in dedos.items():
                PB[p3.P + n].matrix_basis = M.copy()
            p3.atualizar()
        return (c(lado + "Hand") - W).length

    def pele_dist(partes_mao, alvo_partes):
        co, tri, (nomes, dono) = _malha(bon)
        bvh = _arvore(co, tri, _grupo(nomes, dono, alvo_partes))
        return _distancia(bvh, co[_grupo(nomes, dono, partes_mao)], 0.08)

    def dedos_encostam(lado, alvo_partes):
        """Cada dedo (fora o polegar) curva inteiro (as 3 falanges na proporção DOBRA, em volta da linha dos nós) do mais esticado até a
        pele dele encostar na pele do alvo (−AFUNDA_MAO), e fica 1° antes disso."""
        co, tri, (nomes, dono) = _malha(bon)
        bvh = _arvore(co, tri, _grupo(nomes, dono, alvo_partes))
        pos = {n: i for i, n in enumerate(nomes)}
        palma, eixo_nos = pg._base(rig, lado)[:2]
        out = {}
        for d in p3.DEDOS:
            ossos = ["%sHand%s%d" % (lado, d, i) for i in (1, 2, 3)]
            pts = {o: co[dono == pos[o]] for o in ossos}
            cab = {o: np.array(c(o)) for o in ossos}
            f = (p3.ponta(rig, ossos[0]) - c(ossos[0])).normalized()
            sinal = 1 if eixo_nos.cross(f).dot(palma) > 0 else -1
            escolha = 90.0
            for lam in np.arange(-25.0, 90.01, 1.0):
                angs = [lam * DOBRA[k] * sinal for k in range(3)]
                pp = pg._cadeia_pts(pts, cab, None, ossos, [eixo_nos] * 3, angs)
                if _distancia(bvh, np.concatenate([pp[o][::2] for o in ossos]), 0.05) <= -AFUNDA_MAO:
                    escolha = max(lam - 1.0, -25.0)
                    break
            for k, o in enumerate(ossos):
                if escolha * DOBRA[k]:
                    p3.girar_osso(rig, o, p3.rot_eixo(escolha * DOBRA[k] * sinal, eixo_nos))
            out[d] = escolha
        return out

    def polegar_encosta(lado, alvo_partes, folga_min=-AFUNDA_MAO):
        """Polegar: gira na base (em volta da normal da palma) e dobra as 3 falanges até a PONTA (as 2 falanges de cima) encostar de
        leve na pele do alvo (0 a 3 mm), sem nenhuma parte dele entrar (a pele dele a pelo menos folga_min dela) — o jeito do Abdominal
        Bicicleta, medindo a ponta: medindo o polegar inteiro, a base (que já encosta com a palma) bastava e a ponta ficava espetada
        13–14 mm fora da canela (prints de 14/10)."""
        co, tri, (nomes, dono) = _malha(bon)
        bvh = _arvore(co, tri, _grupo(nomes, dono, alvo_partes))
        pos = {n: i for i, n in enumerate(nomes)}
        palma = pg._base(rig, lado)[0]
        ossos = ["%sHandThumb%d" % (lado, i) for i in (1, 2, 3)]
        pts0 = {o: co[dono == pos[o]] for o in ossos}
        cab0 = {o: np.array(c(o)) for o in ossos}
        h1 = cab0[ossos[0]]
        eixos, sinais = [], []
        for o in ossos:
            f = (p3.ponta(rig, o) - c(o)).normalized()
            ex = f.cross(palma).normalized()
            alvo = (c(lado + "HandMiddle1") - c(o)).normalized()
            eixos.append(ex)
            sinais.append(1 if ex.cross(f).dot(alvo) > 0 else -1)
        melhor = None
        for b in range(-60, 61, 5):
            pa = {o: pg._rot(pts0[o], h1, palma, b) for o in ossos}
            ca = {o: (pg._rot(cab0[o][None], h1, palma, b)[0] if k else cab0[o]) for k, o in enumerate(ossos)}
            eix = [Vector(pg._rot(np.array(e)[None], np.zeros(3), palma, b)[0]) for e in eixos]
            for lam in np.arange(-1.5, 3.01, 0.1):
                angs = [lam * (10, 20, 20)[k] * sinais[k] for k in range(3)]
                pp = pg._cadeia_pts(pa, ca, None, ossos, eix, angs)
                dt_ = _distancia(bvh, np.concatenate([pp[o][::2] for o in ossos]), 0.06)
                if dt_ < folga_min:
                    continue
                dm = _distancia(bvh, np.concatenate([pp[o][::2] for o in ossos[1:]]), 0.06)
                nota = (0 if dm <= 0.003 else 1, abs(b) / 60 + abs(lam - 0.5), dm)
                if melhor is None or nota < melhor[0]:
                    melhor = (nota, b, lam, dm, dt_)
        if melhor is None:
            return "sem solução"
        _, b, lam, dm, dt_ = melhor
        if b:
            p3.girar_osso(rig, ossos[0], p3.rot_eixo(b, palma))
        for k, o in enumerate(ossos):
            f = (p3.ponta(rig, o) - c(o)).normalized()
            ex = f.cross(palma).normalized()
            alvo = (c(lado + "HandMiddle1") - c(o)).normalized()
            sg = 1 if ex.cross(f).dot(alvo) > 0 else -1
            if lam * (10, 20, 20)[k]:
                p3.girar_osso(rig, o, p3.rot_eixo(lam * (10, 20, 20)[k] * sg, ex))
        return (b, round(float(lam), 1), round(dm * 1000, 1), round(dt_ * 1000, 1))   # giro, dobra, ponta e polegar inteiro (mm)

    def dedos_planos(lado):
        """Dedos esticados e juntos no plano da palma, o polegar deitado do lado do indicador (a mão de apoio da Ponte de Glúteo)."""
        p3.soltar_dedos(rig, lado)
        pg.juntar_dedos(rig, lado, 1.0)
        for d in p3.DEDOS + ("Thumb",):
            for i in (1, 2, 3):
                palma = pg._base(rig, lado)[0]
                o = "%sHand%s%d" % (lado, d, i)
                f = p3.ponta(rig, o) - c(o)
                plano = f - palma * f.dot(palma)
                if d == "Thumb":
                    plano = plano - palma * 0.10 * f.length
                if plano.length > 1e-6:
                    p3.girar_osso(rig, o, f.rotation_difference(plano).to_matrix())

    def encostar(lado, s, W, phi, dq, pq, n, alvo_partes, dedos=None):
        """O punho anda na normal da pele (n) até a PALMA (com a base do polegar) encostar (−AFUNDA_MAO) no alvo; devolve o punho."""
        lo, hi = -0.03, 0.05
        for _ in range(14):
            m = (lo + hi) / 2
            por_braco(lado, s, W + n * m, phi, dq, pq, dedos)
            if pele_dist((lado + "Hand", lado + "HandThumb1"), alvo_partes) < -AFUNDA_MAO:
                lo = m
            else:
                hi = m
        por_braco(lado, s, W + n * hi, phi, dq, pq, dedos)
        return W + n * hi

    def ponto_na_pele(partes, origem, direcao):
        """Primeiro ponto da pele das partes no raio que sai de `origem` na `direcao` (e a normal ali)."""
        co, tri, (nomes, dono) = _malha(bon)
        loc, nor, idx, d = _arvore(co, tri, _grupo(nomes, dono, partes)).ray_cast(origem, direcao.normalized())
        return loc, nor

    def braco_x(lado, alvo_partes):
        """Menor distância (m, − = dentro) da pele do braço e do antebraço até as partes."""
        co, tri, (nomes, dono) = _malha(bon)
        bvh = _arvore(co, tri, _grupo(nomes, dono, alvo_partes))
        return _distancia(bvh, co[_grupo(nomes, dono, (lado + "Arm", lado + "ForeArm"))][::3], 0.3)

    pose_mao = {}

    # ── começo: as mãos na barriga, em cima do umbigo (foto 0 do free-exercise-db, desenho A da Mayo), os cotovelos no colchonete ──────
    corpo(0.0)
    for lado, s in LADOS:
        P, nrm = ponto_na_pele(("Hips", "Spine", "Spine1"), Vector((s * BARRIGA[0], BARRIGA[1], 1.0)), Vector((0, 0, -1)))
        nrm = nrm.normalized()
        dq = Vector((s * DEDOS_BARRIGA[0], DEDOS_BARRIGA[1], 0.0))
        dq = (dq - nrm * dq.dot(nrm)).normalized()
        pq = -nrm
        W0 = P - dq * PALMA_MEIO + nrm * 0.02
        dedos_planos(lado)
        d0 = {n: PB[p3.P + n].matrix_basis.copy() for n in DEDOS[lado]}
        melhor = None                             # cotovelo: do lado de fora, descendo até a pele do braço encostar no colchonete
        for phi in range(0, -91, -5):
            por_braco(lado, s, W0, phi, dq, pq, d0)
            co, _, (nomes, dono) = _malha(bon)
            zb = float(co[_grupo(nomes, dono, (lado + "Arm", lado + "ForeArm"))][:, 2].min())
            if melhor is None or abs(zb - (TOPO - AFUNDA_BRACO)) < abs(melhor[1] - (TOPO - AFUNDA_BRACO)):
                melhor = (phi, zb)
        phi0 = melhor[0]
        W = encostar(lado, s, W0, phi0, dq, pq, nrm, TRONCO_M, d0)
        dd = dedos_encostam(lado, TRONCO_M)
        pol = polegar_encosta(lado, TRONCO_M, folga_min=0.0005)
        Ms = p3.mundo_osso(rig, "Spine")
        pose_mao[(lado, 0)] = dict(W=Ms.inverted() @ W, dq=Ms.to_3x3().inverted() @ dq, pq=Ms.to_3x3().inverted() @ pq, phi=phi0,
                                   dedos={n: PB[p3.P + n].matrix_basis.copy() for n in DEDOS[lado]})
        print("BARRIGA %s | ponto (%.3f %.3f %.3f) normal (%.2f %.2f %.2f) | cotovelo phi %d (pele do braço %+.1f mm) | dedos %s | polegar "
              "%s | mão × barriga %.1f mm" % (lado, *P, *nrm, phi0, (melhor[1] - TOPO) * 1000, dd, pol,
                                              pele_dist(_mao(lado), TRONCO_M) * 1000))

    # ── abraço: cada mão na SUA canela, logo abaixo do joelho: a palma na face de fora da canela e os dedos por cima dela (pela
    # frente); o mesmo phi do cotovelo nos 2 lados (o que deixa o braço fora das pernas e mais pra baixo) ─────────────────────────
    corpo(1.0)
    alvo_mao = {}
    for lado, s in LADOS:
        H, K, A = c(lado + "UpLeg"), c(lado + "Leg"), c(lado + "Foot")
        es = (A - K).normalized()
        et = (K - H).normalized()
        ea = (et - es * et.dot(es)).normalized()                  # frente da canela
        el = Vector((s, 0, 0))
        el = (el - es * el.dot(es) - ea * el.dot(ea)).normalized()  # lado de fora
        b = math.radians(BETA)
        n0 = (ea * math.cos(b) + el * math.sin(b)).normalized()
        P, nrm = ponto_na_pele((lado + "Leg",), K + es * D_CANELA + n0 * 0.25, -n0)
        nrm = nrm.normalized()
        dq = (ea - nrm * ea.dot(nrm)).normalized()
        alvo_mao[lado] = (P, nrm, dq, -nrm, P - dq * PALMA_MEIO + nrm * 0.02)
    cands = []
    for phi in range(30, -121, -10):
        for lado, s in LADOS:
            P, nrm, dq, pq, W0 = alvo_mao[lado]
            dedos_planos(lado)
            por_braco(lado, s, W0, phi, dq, pq, {n: PB[p3.P + n].matrix_basis.copy() for n in DEDOS[lado]})
        co, tri, (nomes, dono) = _malha(bon)
        ck.posicoes_das_juntas(rig)
        cc = ck.corpo_x_corpo(co, tri, nomes, dono)[0]
        pior = min(min(braco_x(L, PERNAS_T) for L, _ in LADOS), -max(cc["bracoE×tronco"], cc["bracoD×tronco"]) / 1000)
        cands.append((phi, pior))
    ok = [x for x in cands if x[1] > 0.008]
    phi1 = (min(ok, key=lambda x: abs(x[0] + 45)) if ok else max(cands, key=lambda x: x[1]))[0]
    print("ABRAÇO | cotovelo: %s → phi %d" % (" ".join("%d:%.0f" % (p_, d_ * 1000) for p_, d_ in cands), phi1))
    for lado, s in LADOS:
        P, nrm, dq, pq, W0 = alvo_mao[lado]
        dedos_planos(lado)
        d0 = {n: PB[p3.P + n].matrix_basis.copy() for n in DEDOS[lado]}
        W = encostar(lado, s, W0, phi1, dq, pq, nrm, (lado + "Leg",), d0)
        abertos = {n: PB[p3.P + n].matrix_basis.copy() for n in DEDOS[lado]}
        dd = dedos_encostam(lado, PERNAS_T)
        pol = polegar_encosta(lado, (lado + "Leg", lado + "UpLeg"))
        Ml = p3.mundo_osso(rig, lado + "Leg")
        pose_mao[(lado, 1)] = dict(W=Ml.inverted() @ W, dq=Ml.to_3x3().inverted() @ dq, pq=Ml.to_3x3().inverted() @ pq, phi=phi1,
                                   dedos={n: PB[p3.P + n].matrix_basis.copy() for n in DEDOS[lado]}, abertos=abertos,
                                   n=Ml.to_3x3().inverted() @ nrm)
        print("CANELA %s | ponto (%.3f %.3f %.3f) normal (%.2f %.2f %.2f) | ombro → palma %.3f m (braço + mão %.3f) | punho a %.1f mm do "
              "alvo | dedos %s | polegar %s | mão × canela %.1f mm | mão × outra perna %.1f mm" % (
                  lado, *P, *nrm, (P - c(lado + "Arm")).length, Lb + La + PALMA_MEIO, (c(lado + "Hand") - W).length * 1000, dd, pol,
                  pele_dist(_mao(lado), (lado + "Leg", lado + "UpLeg")) * 1000,
                  pele_dist(_mao(lado), tuple(L + n for L, _ in LADOS if L != lado for n in ("Leg", "UpLeg"))) * 1000))

    def _slerp_dedos(A, B, w):
        return {n: Matrix.LocRotScale(A[n].to_translation(), A[n].to_quaternion().slerp(B[n].to_quaternion(), w), None) for n in A}

    espera = {}                                 # o lado da canela na pegada (mão aberta, APROX m por fora), no quadro do Spine2

    def maos(wm, w2=0.0, phi_u=None):
        """Mãos no quadro: wm = 0 na barriga (presas ao Spine); de 0 a 1 sobem por fora das coxas (Bézier com o ponto de controle LADO_C
        pro lado de fora do meio do caminho) até o ponto de espera — APROX m por fora da face da canela onde ela vai estar na pegada —, já
        viradas e abertas; w2 de 0 a 1: encostam (andam na normal da pele) e os dedos fecham por cima da canela (presas ao Leg)."""
        for lado, s in LADOS:
            Ms = p3.mundo_osso(rig, "Spine")
            Ml = p3.mundo_osso(rig, lado + "Leg")
            M2 = p3.mundo_osso(rig, "Spine2")
            b, a = pose_mao[(lado, 0)], pose_mao[(lado, 1)]
            Wb, Wa = Ms @ b["W"], Ml @ a["W"]
            na = (Ml.to_3x3() @ a["n"]).normalized()
            Rb = Matrix((Ms.to_3x3() @ b["dq"], Ms.to_3x3() @ b["pq"], (Ms.to_3x3() @ b["dq"]).cross(Ms.to_3x3() @ b["pq"]))).transposed()
            Ra = Matrix((Ml.to_3x3() @ a["dq"], Ml.to_3x3() @ a["pq"], (Ml.to_3x3() @ a["dq"]).cross(Ml.to_3x3() @ a["pq"]))).transposed()
            if w2 > 0.0:
                w = p3.suave(min(w2, 1.0))
                W, R, phi = Wa + na * APROX * (1 - w), Ra, a["phi"]
                dedos = _slerp_dedos(a["abertos"], a["dedos"], w)
            elif wm <= 0.0:
                W, R, phi, dedos = Wb, Rb, b["phi"], b["dedos"]
            else:
                e = espera[lado]
                Wp, Rp = M2 @ e["W"], M2.to_3x3() @ e["R"]
                C = (Wb + Wp) / 2 + Vector((s * LADO_C, 0, 0))
                W = Wb * (1 - wm) ** 2 + C * (2 * wm * (1 - wm)) + Wp * wm ** 2
                wr = _rampa(wm, 0.0, GIRA_MAO)
                R = Rb.to_quaternion().slerp(Rp.to_quaternion(), wr).to_matrix()
                phi = b["phi"] + (a["phi"] - b["phi"]) * wm
                dedos = _slerp_dedos(b["dedos"], a["abertos"], wr)
            if phi_u is not None:
                phi = phi_u
            estado["erro_" + lado] = por_braco(lado, s, W, phi, R.col[0], R.col[1], dedos)

    # ── na pegada (u = U_CHEGA; as pernas ficam paradas até U_PEGA): o ponto de espera de cada mão e o cotovelo (o phi que deixa braço
    # e antebraço mais longe das pernas) ──────────────────────────────────────────────────────────────────────────────────────────
    PHI = {"b": pose_mao[("Left", 0)]["phi"], "a": pose_mao[("Left", 1)]["phi"]}
    corpo(U_CHEGA)
    for lado, s in LADOS:
        Ml = p3.mundo_osso(rig, lado + "Leg")
        M2 = p3.mundo_osso(rig, "Spine2")
        a = pose_mao[(lado, 1)]
        Wp = Ml @ a["W"] + (Ml.to_3x3() @ a["n"]).normalized() * APROX
        Rp = Matrix((Ml.to_3x3() @ a["dq"], Ml.to_3x3() @ a["pq"], (Ml.to_3x3() @ a["dq"]).cross(Ml.to_3x3() @ a["pq"]))).transposed()
        espera[lado] = dict(W=M2.inverted() @ Wp, R=M2.to_3x3().inverted() @ Rp)
    melhor = None
    for phi in range(-30, -91, -5):
        maos(0.0, 1.0, phi)
        pior = min(braco_x(L, PERNAS_T) for L, _ in LADOS)
        if melhor is None or pior > melhor[1] + 0.0005:
            melhor = (phi, pior)
    PHI["pega"] = melhor[0]
    print("PEGA | cotovelo phi %d (braço × pernas %.1f mm) | barriga phi %d | abraço phi %d" % (
        melhor[0], melhor[1] * 1000, PHI["b"], PHI["a"]))

    def phi_de(u):
        if u <= U_CHEGA:
            return PHI["b"] + (PHI["pega"] - PHI["b"]) * _rampa(u, *JANELA_MAOS)
        return PHI["pega"] + (PHI["a"] - PHI["pega"]) * _rampa(u, U_PEGA, 1.0)

    # ── cabeça no colchonete: o pescoço dobra ou estende até o cabelo da nuca encostar (todo quadro, o jeito da Ponte) ───────────
    neck0 = PB[p3.P + "Neck"].matrix_basis.copy()
    pescoco = {"g": 0.0}

    def cabeca():
        alvo = TOPO - AFUNDA_CABELO

        def altura(g):
            PB[p3.P + "Neck"].matrix_basis = neck0.copy()
            p3.atualizar()
            if g:
                p3.girar_osso(rig, "Neck", p3.rot_x(g))
            return cabelo_z()

        lo, hi = -40.0, 40.0                     # + = flexão (o queixo vem pro peito, a nuca sobe)
        for _ in range(14):
            g = (lo + hi) / 2
            if altura(g) > alvo:
                hi = g
            else:
                lo = g
        altura(hi)
        pescoco["g"] = hi

    def colocar(u):
        corpo(u)
        wm = _rampa(u, *JANELA_MAOS)
        w2 = (u - U_CHEGA) / (U_PEGA - U_CHEGA) if u > U_CHEGA else 0.0
        estado["wm"] = wm
        maos(wm, w2, phi_de(u))
        cabeca()

    def invasao():
        """Pior entrada (mm) da mão e do antebraço de cada lado no tronco (Spine, Spine1, Spine2) e em cada perna (coxa + perna), o jeito
        do checagem3d.contatos (a pele até 3 cm do alvo, do lado de dentro da normal)."""
        co, tri, (nomes, dono) = _malha(bon)
        alvos_ = {"tronco": TRONCO_M, "pernaE": ("LeftUpLeg", "LeftLeg"), "pernaD": ("RightUpLeg", "RightLeg")}
        bvhs = {k: _arvore(co, tri, _grupo(nomes, dono, v)) for k, v in alvos_.items()}
        out = []
        for L, _ in LADOS:
            partes = _grupo(nomes, dono, _mao(L) + (L + "ForeArm",))
            pior = (0.0, "")
            for k, bvh in bvhs.items():
                for i in np.where(partes)[0]:
                    v = Vector(co[i])
                    loc, nor, idx, d = bvh.find_nearest(v, 0.03)
                    if loc is not None and (v - loc).dot(nor) < 0 and d > pior[0]:
                        pior = (d, "%s em %s" % (nomes[dono[i]], k))
            out.append("%s %.1f mm%s" % (L[0], pior[0] * 1000, " (%s)" % pior[1] if pior[1] else ""))
        return " | ".join(out)

    def info():
        co, tri, (nomes, dono) = _malha(bon)
        j = ck.posicoes(rig)
        med = ck.medir_juntas(rig)
        meio = np.abs(co[:, 0]) < 0.04
        tr = _grupo(nomes, dono, ("Hips", "Spine", "Spine1", "Spine2"))
        pf = []
        for y in np.arange(-0.06, 0.40, 0.03):
            f = meio & tr & (np.abs(co[:, 1] - y) < 0.015)
            pf.append("%.0f" % ((co[f][:, 2].min() - TOPO) * 1000) if f.any() else "-")
        pe = co[_grupo(nomes, dono, ("LeftFoot", "LeftToeBase", "RightFoot", "RightToeBase"))]
        return ("u %.2f k %.2f | joelho %.0f/%.0f quadril %.0f/%.0f cotovelo %.0f/%.0f punho %.0f/%.0f | coxa_vertical %s | coluna_sinal "
                "%.1f | cabeça×tronco %.0f pescoço %+.1f | perfil das costas no meio, y −0,06…0,39 (mm do topo): %s | coxa × barriga "
                "(dobra da virilha / fora dela) E %.1f/%.1f D %.1f/%.1f mm | pés %.0f…%.0f mm do topo | punho a %.0f/%.0f mm do alvo | "
                "mão e antebraço no corpo: %s" % (
                    estado["u"], estado["k"], med["joelhoE"], med["joelhoD"], med["quadrilE"], med["quadrilD"], med["cotoveloE"],
                    med["cotoveloD"], med["punhoE"], med["punhoD"], "/".join("%.0f" % v for v in tc.coxa_vertical(j)),
                    tc.coluna_sinal(j)[0], tc.cabeca_tronco(j)[0], pescoco["g"], " ".join(pf),
                    *[x for a, b, _ in coxa_barriga() for x in (a, b)], (pe[:, 2].min() - TOPO) * 1000, (pe[:, 2].max() - TOPO) * 1000,
                    estado.get("erro_Left", 0) * 1000, estado.get("erro_Right", 0) * 1000, invasao()))

    for u in (0.0, U_CHEGA, 1.0):
        colocar(u)
        print("U %.2f | %s" % (u, info()))

    # ── colchonete: do alto da cabeça até a ponta dos pés no começo, com folga ─────────────────────────────────────────────────────
    colocar(0.0)
    co, _, (nomes, dono) = _malha(bon)
    y_pe = float(co[_grupo(nomes, dono, ("LeftToeBase", "RightToeBase"))][:, 1].min())
    y_cab = float(co[_grupo(nomes, dono, ("Head",))][:, 1].max())
    y_min, y_max = y_pe - 0.08, y_cab + 0.06
    braco_x_max = float(np.abs(co[_grupo(nomes, dono, ("LeftArm", "LeftForeArm", "RightArm", "RightForeArm"))][:, 0]).max())
    colchonete = e3.caixa("colchonete", (0, (y_min + y_max) / 2, TOPO / 2), (LARGURA, y_max - y_min, TOPO), e3.mat_estofado(),
                          chanfro=0.004)
    print("COLCHONETE %.2f × %.2f m (y %.3f a %.3f) | braços até |x| %.3f" % (LARGURA, y_max - y_min, y_min, y_max, braco_x_max))

    def pose(t):
        """t = 0 (e 1): segurando o abraço; solta, fica no começo (t = 0,5) e abraça de novo."""
        colocar(abraco(t))

    pose(0.0)
    return Cena(pose, [], pegadas=[], apoio_mm=0.0, foco_luz=(0, 0.1, 0.3),
                camera_video=((3.6, -0.5, 1.1), (0, 0.1, 0.3), 50), info=info, apoios=[colchonete], afunda_apoio_mm=20)
