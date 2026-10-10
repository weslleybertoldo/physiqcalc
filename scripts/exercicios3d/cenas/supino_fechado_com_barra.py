# Supino Fechado com Barra — cena da fábrica 3D (lote 9, 10/10/2026). Peças: a barra olímpica do e3.barra (eixo de 29 mm, 1,32 m
# entre as travas) com as anilhas de 45 cm do Levantamento Terra e o banco reto do Supino Reto com Barra (e3.banco), sem mudar nada
# em lib/. As frases das fontes estão na ficha (referencias); aqui, o essencial:
#   ExRx, Barbell Close Grip Bench Press (no diretório do TRÍCEPS: "ExRx.net > Directory > Triceps > Exercise"): "Lie on bench and
#   grasp barbell from rack with shoulder width grip." / "Lower weight to chest with elbows close to body. Push barbell back up until
#   arms are straight." / "Grip can be slightly narrower than shoulder width but not too close. Too close of grip can decrease range
#   of motion, may tend to hyper-adduct wrist joint, and unnecessarily decrease stability of bar."; ExRx, Bench Press Analyses: "Close
#   Grip Bench Press, targeting the triceps, can be performed at a grip around 1 biacromial width or slightly narrower." e "hand
#   spacing <1.5 biacromial width maintains shoulder abduction below 45° (Fees 1998)"; ACE, Close-grip Bench Press: "grip the bar with
#   the hands directly in line with the shoulders and the elbows pointed towards the feet" / "bring it towards the chest by bending
#   the elbows and keeping them close to the ribs"; NSCA (Basics, supino com barra): "Keep wrists rigid and directly above elbows".
# t = 0 em cima: braços quase esticados (cotovelo ~10°, sem travar) e a barra em cima das articulações dos ombros (NSCA: "position it
#   directly above shoulders with elbows fully extended") · t = 1 embaixo: a barra a FOLGA_PEITO da pele (encosta de leve) na parte
#   de BAIXO do peito, com os cotovelos fechados perto das costelas (ABRE° do tronco, vista de cima do peito) e o antebraço em pé
#   embaixo da barra (de lado). A barra desce em linha reta "down and slightly forward" (NSCA) — pros pés — e volta.
# Como o rig faz: as escápulas vão pra trás e pra baixo em pé, antes de deitar (as do Supino Reto no Smith), e o corpo deita de
# costas no banco (dt.deitar: cabeça, costas e glúteo no estofado, pés chapados no chão). A pegada (vão de cada mão a MEIA do meio)
# fica na largura dos ombros; o cotovelo fica, em todo quadro, no círculo dos cotovelos possíveis (ombro → punho) no ponto em que o
# braço abre ABRE° do tronco (tecnica3d.braco_abertura), do lado de baixo, e o braço vai até ele pelo IK analítico (o da Remada
# Invertida e do Supino Reto no Smith, copiado). Embaixo, a linha da barra é a que deixa o antebraço em pé de lado (o punho em cima do
# cotovelo) com a barra a FOLGA_PEITO da pele. A mão, com a palma pros pés (pegada pronada), segue o antebraço com o punho firme e
# rola em volta da barra (a pegada é a mesma em todo quadro); os 4 dedos fecham até a pele encostar e o polegar novo dá a volta
# na barra numa postura fixa tirada da própria busca. Tronco, escápulas, cabeça, quadril, pernas e pés não mexem.
import math
import time
import bmesh
import numpy as np
from mathutils import Matrix, Vector
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import polegar3d as P3
import checagem3d as ck
import tecnica3d as tc
import deitado3d as dt
from maos3d import Maos
from cena import Cena

LADOS = dt.LADOS          # (("Left", 1), ("Right", -1)): s = +1 no esquerdo (+X)
RAIO = 0.0145             # barra olímpica de 29 mm (e3.barra; IPF: "Diameter of the bar is not to exceed 29 mm or be less than 28 mm")
PEGADA_TRAVAS = 1.32      # entre as travas (IPF: "Distance between the collar faces is not to exceed 1.32 m or be less than 1.31 m")
R_ANILHA = 0.225          # anilha de 45 cm (IPF: "The diameter of the largest discs shall not be more than 45 cm"; a do Levantamento
                          # Terra, lote 7)
TOPO = 0.44               # topo do estofado do banco (o do Supino Reto com Barra; IPF: banco de 42 a 45 cm)
BANCO_Y = (-0.28, 0.92)   # pé e cabeceira do banco (o do Supino Reto com Barra)
MEIA = None               # meia pegada (m, do meio da barra ao vão de cada mão); None = sai do montar() (MEIA_FATOR × ombro)
MEIA_FATOR = 1.1          # vão da mão 10% por fora da articulação do ombro (ACE: "hands directly in line with the shoulders")
ABRE = 17.0               # cotovelo × tronco (braco_abertura, graus: 0 = colado na lateral apontando pros pés, 90 = em T) — ACE:
                          # "elbows pointed towards the feet", "close to the ribs"; ExRx (Fees 1998): abaixo de 45° com pegada < 1,5×
FI_BAIXO = -8.0           # antebraço embaixo, de lado (graus; − = punho pros pés do cotovelo: a barra um pouco à frente dos
                          # cotovelos, mais embaixo no peito). Com o antebraço exatamente em pé (0°) a barra encostava a ~150 mm
                          # pros pés do ombro com o cotovelo dobrado 141–143° e o antebraço entrava 8,5–14 mm no braço a 13 cm do
                          # cotovelo (fora o vinco da checagem) em toda abertura de 15° a 35° (sonda de 10/10/2026); a −8° o cotovelo
                          # fica em ~135° (o do Supino Reto com Barra) e a barra encosta na parte de baixo do esterno
FOLGA_PEITO = 0.007       # barra → pele do peito embaixo: encosta de leve (Saeterbakken 2021: "lightly touch the chest")
FOLGA_MAO = 0.002         # mão (dedos por baixo da barra) → pele do tronco embaixo: no mínimo isso (a mão não entra no peito)
COTOVELO_CIMA = 10        # flexão do cotovelo em cima: quase esticado, sem travar (ExRx: "until arms are straight")
PUNHO = 14                # extensão do punho (graus) firme o movimento todo: a mão inclinada pra cabeça em relação ao antebraço (o do
                          # Supino Reto com Barra e do Supino Reto no Smith; NSCA: "Keep wrists rigid")
VOLTAS_PUNHO = 4          # voltas mão ↔ antebraço até o ângulo do antebraço parar de mudar
TORCAO_MAO = 0.5          # fração da pronação do antebraço que vai no osso da mão (_segurar; 0 = toda no antebraço, como no
                          # Smith). Com os cotovelos fechados a palma pros pés pede ~78° de pronação (dentro dos 0–80° da AAOS);
                          # inteira no osso do antebraço, a pele dele girava junto até o cotovelo e entrava 11 mm no braço a 13 cm do
                          # cotovelo (sonda de 10/10/2026: 0,25 → 3,9 mm; 0,40 → 0,0 mm; 0,55 → 0,0 mm, com o antebraço a −8°)
PUNHO_FORA = 0.0          # mão girada no plano da palma (graus, + = dedos pro lado do dedo mínimo); 0 = dedos ⟂ à barra
RETRAI, DESCE = 6.0, 4.0  # escápulas pra trás e pra baixo (graus de giro da clavícula), em pé antes de deitar (ExRx: "Keep the
                          # scapula back and down"; os do Supino Reto no Smith)
POLEGAR_FIXO = {"Left": (20.0, 37.0, -13.0, 24.0, -5.3, 46.0), "Right": (20.0, 37.0, -13.0, 28.0, 2.7, 54.0)}
                          # polegar NOVO dando a volta na barra, FIXO em todos os quadros: a postura que a busca do
                          # pg.polegar_em_volta achou do zero (checagem de 25 quadros de 10/10/2026 com BUSCAR_POLEGAR = True e a
                          # pronação dividida, TORCAO_MAO: 4 posturas viáveis em cima e embaixo nas 2 mãos, cada uma medida em
                          # cima, no meio e embaixo na pele do Blender) — por mão, a que não entra na barra e estica menos a pele:
                          # polegar → barra +2,3 mm (E) e +0,2 mm (D), pele da base 2,37× (E) e 2,16× (D), 0 triângulo do avesso
                          # nos 3 quadros
BUSCAR_POLEGAR = False    # True = refaz a busca do polegar (≈5 min a mais na montagem) e imprime a medida de cada postura
SONDA = False             # True = imprime a tabela pegada × abertura do cotovelo no montar(); "so" = só a tabela (para depois)
SONDA_CASOS = ()
SONDA_TORCAO_CASOS = ((20.0, -8.0), (20.0, -4.0))
SONDA_TORCOES = (0.0, 0.25, 0.4, 0.55)
SONDA_Z0 = 1.138          # barra em cima na sonda (a da 1ª checagem, pegada na articulação do ombro)
EIXO = Vector((1, 0, 0))  # a barra fica ao longo do X
PERTO_DA_BARRA = ("Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "LeftShoulder", "RightShoulder", "LeftArm", "RightArm")
                          # pele que a barra não pode tocar além de "de leve" (peito, pescoço, rosto, ombros, braços)
TRONCO_PELE = ("Hips", "Spine", "Spine1", "Spine2")
VINCO = 0.18              # o vinco da axila: braço × tronco até 18 cm da articulação do ombro (checagem3d.PARES)


def _malha(bon, niveis=1):
    return ck._avaliar(bon.corpo, niveis)


def _grupo(nomes, dono, partes):
    return np.array([n in partes for n in nomes] + [False])[dono]


def _polegar_nos_angulos(bon, lado, q):
    """Polegar da mão `lado` na postura anatômica q = (cmc_flex, cmc_abd, cmc_rot, mcp_flex, mcp_abd, ip_flex), em graus — a mesma
    conta do pg.polegar_em_volta (polegar3d.eixos_do_polegar + rotacoes, osso por osso); a do Supino Reto no Smith, copiada."""
    rig = bon.rig
    ossos = [lado + "HandThumb%d" % i for i in (1, 2, 3)]
    for o in ossos:
        rig.pose.bones[p3.P + o].matrix_basis = Matrix.Identity(4)
    p3.atualizar()
    cab = [np.array(p3.cabeca(rig, o)) for o in ossos]
    eixos = P3.eixos_do_polegar(np.array(pg._base(rig, lado)[0]), cab, np.array(p3.ponta(rig, ossos[2])))
    for o, R in zip(ossos, P3.rotacoes(eixos, q)):
        if not np.allclose(R, np.eye(3)):
            p3.girar_osso(rig, o, Matrix(R.tolist()))


def _ik_braco(rig, lado, W, polo):
    """IK analítico do braço (2 ossos) — o da Remada Invertida e do Supino Reto no Smith (lote 9), copiado: o punho (cabeça do osso
    Hand) em W e o cotovelo no plano (ombro, W, polo), do lado do polo. Parte do braço de repouso (base zerada)."""
    S = p3.cabeca(rig, lado + "Arm")
    E0, W0 = p3.cabeca(rig, lado + "ForeArm"), p3.cabeca(rig, lado + "Hand")
    Lb, La = (E0 - S).length, (W0 - E0).length
    d = W - S
    dl = min(d.length, Lb + La - 1e-6)
    u = d.normalized()
    a = (Lb * Lb - La * La + dl * dl) / (2 * dl)
    h = math.sqrt(max(Lb * Lb - a * a, 0.0))
    v = polo - S
    v = (v - u * v.dot(u)).normalized()
    E = S + u * a + v * h
    b0, n0 = (E0 - S).normalized(), (E0 - S).cross(W0 - E0)
    n0 = (n0 - b0 * n0.dot(b0)).normalized()
    b1, n1 = (E - S).normalized(), v.cross(u)
    n1 = (n1 - b1 * n1.dot(b1)).normalized()
    F0 = Matrix((b0, n0, b0.cross(n0))).transposed()
    F1 = Matrix((b1, n1, b1.cross(n1))).transposed()
    p3.girar_osso(rig, lado + "Arm", F1 @ F0.transposed())
    f0 = p3.cabeca(rig, lado + "Hand") - p3.cabeca(rig, lado + "ForeArm")
    p3.girar_osso(rig, lado + "ForeArm", f0.rotation_difference(W - p3.cabeca(rig, lado + "ForeArm")).to_matrix())


def _segurar(maos, lado, g, dedos_q, palma_q, polo, alinhar=0.0, voltas=40, passo=0.6, eixo=None, torcao_mao=0.0):
    """O maos3d.Maos.segurar com o IK analítico (_ik_braco, a partir do repouso a cada volta) e a correção do punho amortecida — o do
    Supino Reto no Smith (lote 9), copiado (ver lá o porquê de cada mudança). Uma mudança a mais (torcao_mao, 0 = o do Smith): a
    pronação que o antebraço precisa pra palma ficar pros pés vai `torcao_mao` no osso da mão em vez de inteira no do antebraço — o
    rig não tem osso de torção e o osso do antebraço girado inteiro gira a pele toda dele, até a do cotovelo (no corpo de verdade
    o rádio roda em volta da ulna e quem gira é a parte de baixo do antebraço, perto do punho). A mão fica no mesmo lugar e na mesma
    orientação; só a pele do antebraço gira menos perto do cotovelo e mais perto do punho. Guarda o giro (graus) em maos.torcao."""
    rig, PB = maos.rig, maos.rig.pose.bones
    dedos_q = Vector(dedos_q).normalized()
    palma_q = Vector(palma_q)
    palma_q = (palma_q - dedos_q * palma_q.dot(dedos_q)).normalized()
    maos.iks[lado].mute = True                       # o IK do Blender fica desligado (o _ik_braco faz o braço)
    pg.mao_de_referencia(rig, lado)
    alvo = g - dedos_q * (maos.palma * 0.92)
    erro = Vector()
    for _ in range(voltas):
        for n in ("Arm", "ForeArm", "Hand"):
            PB[p3.P + lado + n].matrix_basis = Matrix()
        p3.atualizar()
        _ik_braco(rig, lado, alvo, polo)
        f0, f1 = p3.cabeca(rig, lado + "ForeArm"), p3.cabeca(rig, lado + "Hand")
        ax = (f1 - f0).normalized()
        quer = palma_q - ax * palma_q.dot(ax)
        tem = pg._base(rig, lado)[0]
        tem = tem - ax * tem.dot(ax)
        if quer.length > 1e-6 and tem.length > 1e-6:
            quer.normalize()
            tem.normalize()
            ang = math.atan2(tem.cross(quer).dot(ax), tem.dot(quer))
            maos.torcao[lado] = math.degrees(ang)
            p3.girar_osso(rig, lado + "ForeArm", Matrix.Rotation(ang * (1.0 - torcao_mao), 3, ax))
        h0 = p3.cabeca(rig, lado + "Hand")
        y_m = (p3.ponta(rig, lado + "Hand") - h0).normalized()
        n_m = pg._base(rig, lado)[0]
        n_m = (n_m - y_m * n_m.dot(y_m)).normalized()
        F_tem = Matrix((y_m, n_m, y_m.cross(n_m))).transposed()
        dq = (dedos_q * (1 - alinhar) + ax * alinhar).normalized()
        if eixo is not None:
            dq = (dq - eixo * dq.dot(eixo)).normalized()
        pq = (palma_q - dq * palma_q.dot(dq)).normalized()
        F_quer = Matrix((dq, pq, dq.cross(pq))).transposed()
        p3.girar_osso(rig, lado + "Hand", F_quer @ F_tem.transposed())
        erro = g - p3.mundo_osso(rig, lado + "Hand") @ maos.furo[lado]
        if erro.length < 0.0003:
            break
        alvo = alvo + erro * passo
    maos.erro[lado] = erro.length
    fa = p3.ponta(rig, lado + "ForeArm") - p3.cabeca(rig, lado + "ForeArm")
    mo = p3.ponta(rig, lado + "Hand") - p3.cabeca(rig, lado + "Hand")
    maos.punho[lado] = math.degrees(fa.angle(mo))


def _orientacao(graus, s):
    """Dedos e palma da mão do lado s (+1 esquerdo, −1 direito) com os dedos `graus` pra cabeça da vertical (a mão rola em volta da
    barra, ao longo do X) e PUNHO_FORA° pro lado do dedo mínimo: palma pros pés (pegada pronada de quem está deitado)."""
    a, b = math.radians(graus), math.radians(PUNHO_FORA)
    dq = Vector((0, math.sin(a), math.cos(a))) * math.cos(b) + Vector((s * math.sin(b), 0, 0))
    return dq, Vector((0, -math.cos(a), math.sin(a)))


def _pele_parada(bon):
    """Desliga (show_viewport) os modificadores das malhas que seguem o esqueleto — corpo, cabelo e sobrancelhas — enquanto o IK dos
    braços roda: ele só lê os ossos, e cada atualização da cena (centenas por quadro) deformava a pele toda à toa. Devolve o estado
    de antes, pro _religar_pele."""
    objs = [o for o in (bon.corpo, getattr(bon, "cabelo", None), getattr(bon, "sobrancelhas", None)) if o is not None]
    estados = [(m, m.show_viewport) for o in objs for m in o.modifiers]
    for m, _ in estados:
        m.show_viewport = False
    return estados


def _religar_pele(estados):
    for m, v in estados:
        m.show_viewport = v
    p3.atualizar()


def _tampas_em_leque(raiz):
    """As tampas dos cilindros da barra (anilhas, miolos, travas e pontas do eixo) viram um leque a partir do centro (bmesh.poke) —
    a mesma forma, em triângulos curtos. Com a tampa de 48 lados em polígono único, o Blender corta a anilha de 45 cm em triângulos
    longos e a checagem (checagem3d._amostras, um ponto a cada 8 mm em cada lado de cada triângulo) espalhava ~300 mil pontos só nas
    4 tampas: ~1 min por quadro. Só nesta barra (a e3.barra não muda)."""
    for o in [raiz] + list(raiz.children_recursive):
        if o.type != "MESH":
            continue
        bm = bmesh.new()
        bm.from_mesh(o.data)
        faces = [f for f in bm.faces if len(f.verts) > 4]
        if faces:
            bmesh.ops.poke(bm, faces=faces)
            bm.to_mesh(o.data)
            o.data.update()
        bm.free()


def _cotovelo(S, W, Lb, La, abre, cima, fora):
    """Cotovelo no círculo dos cotovelos possíveis (ombro S, punho W, braço Lb, antebraço La) com o braço aberto `abre` graus do
    tronco — a medida do tecnica3d.braco_abertura: atan2(braço · fora, braço · pés), vista de cima do peito —, a solução mais perto
    do ponto mais baixo do círculo (o antebraço o mais em pé possível). Sem solução exata, o ponto de abertura mais perto.
    Devolve (cotovelo, centro do círculo, abertura)."""
    d = W - S
    dl = min(d.length, Lb + La - 1e-6)
    u = d.normalized()
    a = (Lb * Lb - La * La + dl * dl) / (2 * dl)
    rho = math.sqrt(max(Lb * Lb - a * a, 1e-10))
    C = S + u * a
    e1 = Vector((0.0, 0.0, -1.0)) + u * u.z            # pra baixo, ⟂ ao braço inteiro
    if e1.length < 1e-6:
        e1 = -cima - u * (-cima).dot(u)
    e1.normalize()
    e2 = u.cross(e1).normalized()

    def ab(ps):
        E = C + (e1 * math.cos(ps) + e2 * math.sin(ps)) * rho
        b = E - S
        return math.degrees(math.atan2(b.dot(fora), b.dot(-cima))), E

    passos = [math.radians(k * 1.0) for k in range(-180, 181)]
    vals = [ab(p)[0] for p in passos]
    raizes = []
    for k in range(len(passos) - 1):
        f0, f1 = vals[k] - abre, vals[k + 1] - abre
        if f0 == 0.0:
            raizes.append(passos[k])
        elif f0 * f1 < 0 and abs(vals[k] - vals[k + 1]) < 90:
            lo, hi = passos[k], passos[k + 1]
            for _ in range(40):
                m = (lo + hi) / 2
                if (ab(lo)[0] - abre) * (ab(m)[0] - abre) <= 0:
                    hi = m
                else:
                    lo = m
            raizes.append((lo + hi) / 2)
    if raizes:
        ps = min(raizes, key=abs)
    else:
        ps = passos[int(np.argmin([abs(v - abre) for v in vals]))]
    a_, E = ab(ps)
    return E, C, a_


def montar(bon):
    pg.usar_polegar("volta")          # polegar dando a volta na barra (padrão dos exercícios novos); barra de 29 mm = mão padrão
    rig = bon.rig

    def cab(n):
        return p3.cabeca(rig, n)

    # ── 0) larguras do boneco em pé (sonda): articulações dos ombros, acrômio (borda de cima e de fora do ombro) e deltoides ───────
    co0, _, (nomes0, dono0) = _malha(bon)
    Sa = {L: cab(L + "Arm") for L, _ in LADOS}
    P = co0[_grupo(nomes0, dono0, ("LeftShoulder", "LeftArm", "Neck", "Spine2"))]
    topo_ombro = P[(np.abs(P[:, 1] - Sa["Left"].y) < 0.04) & (P[:, 0] > 0.05)]
    acromio = []
    for dz in (0.02, 0.03, 0.04, 0.05):
        f = topo_ombro[topo_ombro[:, 2] > Sa["Left"].z + dz]
        acromio.append("%+.0f mm: %.0f" % (dz * 1000, 2 * float(f[:, 0].max()) * 1000 if len(f) else -1))
    D = co0[_grupo(nomes0, dono0, ("LeftArm",))]
    delt = D[np.abs(D[:, 2] - Sa["Left"].z) < 0.03]
    print("LARGURAS em pé | entre as articulações dos ombros %.0f mm | ombro (2 × x mais de fora da pele acima da articulação) %s mm"
          " | deltoides (2 × x da pele do braço na altura da articulação) %.0f mm" % (
              (Sa["Left"] - Sa["Right"]).length * 1000, " · ".join(acromio), 2 * float(delt[:, 0].max()) * 1000), flush=True)

    # ── 1) escápulas pra trás e pra baixo, paradas o movimento todo (as do Supino Reto no Smith) ───────────────────────────────
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

    # ── 2) deitado de costas no banco reto: cabeça, costas e glúteo no estofado, pés chapados no chão ───────────────────────────
    dt.deitar(bon, TOPO)
    banco = e3.banco("banco", *BANCO_Y, topo=TOPO)
    maos = Maos(bon, RAIO, polegar_modo="volta")
    maos.torcao = {}
    S = {L: cab(L + "Arm") for L, _ in LADOS}
    Lb = (cab("LeftForeArm") - cab("LeftArm")).length       # braço
    La = (cab("LeftHand") - cab("LeftForeArm")).length      # antebraço
    cima, lado = dt.eixos_tronco(rig)
    fora = {L: -s * lado for L, s in LADOS}
    meia = MEIA if MEIA is not None else MEIA_FATOR * (S["Left"].x - S["Right"].x) / 2
    print("DEITADO | ombro E (%.4f %.4f %.4f) D (%.4f %.4f %.4f) | braço %.4f antebraço %.4f | meia pegada %.4f" % (
        *S["Left"], *S["Right"], Lb, La, meia), flush=True)

    OFF = {}                     # vão da mão − punho no referencial da mão (dedos, palma, dedos × palma): igual em toda orientação
    for L, s in LADOS:
        dq0, pq0 = _orientacao(PUNHO, s)
        g = S[L] + Vector((s * 0.05, 0, 0.55))
        _segurar(maos, L, g, dq0, pq0, polo=S[L] + Vector((s * 0.3, -0.5, -0.3)))
        o = g - cab(L + "Hand")
        OFF[L] = (o.dot(dq0), o.dot(pq0), o.dot(dq0.cross(pq0)))
    print("vão da mão − punho E %.1f/%.1f/%.1f mm D %.1f/%.1f/%.1f mm (ao longo dos dedos, pra palma, de lado)" % (
        *(x * 1000 for x in OFF["Left"]), *(x * 1000 for x in OFF["Right"])), flush=True)

    def vao_menos_punho(L, dq, pq):
        o = OFF[L]
        return dq * o[0] + pq * o[1] + dq.cross(pq) * o[2]

    estado = {"meia": meia, "abre": ABRE, "torcao": TORCAO_MAO}

    def maos_em(centro):
        """As 2 mãos na barra com o eixo em `centro`, sem fechar os dedos: o punho firme em PUNHO° (a mão acompanha o antebraço no
        plano do corpo, girando em volta da barra) e o cotovelo no círculo dos cotovelos possíveis com o braço aberto ABRE° do tronco
        (_cotovelo), pelo IK analítico (não depende do quadro anterior). A pele fica parada enquanto o IK roda (_pele_parada)."""
        t0 = time.time()
        estados = _pele_parada(bon)
        try:
            _maos_em(centro)
        finally:
            _religar_pele(estados)
        maos_em.tempo = time.time() - t0
        return centro

    def _maos_em(centro):
        for L, s in LADOS:
            g = centro + Vector((s * estado["meia"], 0, 0))
            fi = 0.0                                         # antebraço: graus pra cabeça da vertical (no plano YZ)
            for _ in range(VOLTAS_PUNHO):
                dq, pq = _orientacao(fi + PUNHO, s)
                W = g - vao_menos_punho(L, dq, pq)
                E, C, _a = _cotovelo(S[L], W, Lb, La, estado["abre"], cima, fora[L])
                _segurar(maos, L, g, dq, pq, polo=E + (E - C).normalized() * 0.3, torcao_mao=estado["torcao"])
                ax = cab(L + "Hand") - cab(L + "ForeArm")
                fi = math.degrees(math.atan2(ax.y, ax.z))
            maos_em.fi[L] = fi
        return centro

    maos_em.fi = {}
    maos_em.tempo = 0.0

    def folga_barra(y, z, malha=None):
        """Pele (fora as mãos e os antebraços) → superfície da barra com o eixo em (y, z) (m, − = entrou): o mais perto e de que
        parte (a checagem mede a barra junto com as anilhas; aqui é só o eixo entre as travas × peito, pescoço, rosto e braços)."""
        co_, _, (nomes_, dono_) = malha or _malha(bon)
        m = _grupo(nomes_, dono_, PERTO_DA_BARRA)
        P_ = co_[m]
        d = np.hypot(P_[:, 1] - y, P_[:, 2] - z) - RAIO
        d[np.abs(P_[:, 0]) > PEGADA_TRAVAS / 2] = 1e9
        k = int(np.argmin(d))
        return float(d[k]), nomes_[dono_[np.where(m)[0][k]]]

    def folgas_corpo(malha=None):
        """Menor distância com sinal (m, − = entrou) da pele de cada parte até a pele do tronco (Hips, Spine, Spine1, Spine2), por
        lado: braço (só depois do vinco da axila, a VINCO da articulação do ombro), antebraço e mão; e mão esquerda × direita."""
        from mathutils.bvhtree import BVHTree
        co_, tri_, (nomes_, dono_) = malha or _malha(bon)
        T = tri_[_grupo(nomes_, dono_, TRONCO_PELE)[tri_].all(axis=1)]
        bvh = BVHTree.FromPolygons([tuple(p) for p in co_], [tuple(t) for t in T], all_triangles=True)
        out = {}
        for L, _ in LADOS:
            for chave, partes in (("braço", (L + "Arm",)), ("antebraço", (L + "ForeArm",)),
                                  ("mão", tuple(n for n in nomes_ if n.startswith(L + "Hand")))):
                P_ = co_[_grupo(nomes_, dono_, partes)]
                if chave == "braço":
                    P_ = P_[np.linalg.norm(P_ - np.array(S[L]), axis=1) > VINCO]
                menor = 1e9
                for v in P_:
                    loc, nor, idx, dist = bvh.find_nearest(Vector(v))
                    if loc is None:
                        continue
                    d = -dist if (dist < 0.03 and (Vector(v) - loc).dot(nor) < 0) else dist
                    menor = min(menor, d)
                out[chave + L[0]] = menor
        HE = co_[np.array([n.startswith("LeftHand") for n in nomes_] + [False])[dono_]]
        HD = co_[np.array([n.startswith("RightHand") for n in nomes_] + [False])[dono_]]
        out["mão×mão"] = float(HE[:, 0].min() - HD[:, 0].max())     # vão entre as mãos pelo X (+ = separadas)
        return out

    def lean_frontal(L):
        """Antebraço inclinado pro meio do corpo (+, punho pra dentro do cotovelo) no plano frontal do mundo (XZ), graus."""
        s = 1 if L == "Left" else -1
        f = cab(L + "Hand") - cab(L + "ForeArm")
        return math.degrees(math.atan2(-s * f.x, f.z))

    def penetra_braco(malha=None):
        """Antebraço entrando no braço (mm, fora o vinco do cotovelo: checagem3d.corpo_x_corpo, a mesma conta da checagem)."""
        co_, tri_, (nomes_, dono_) = malha or _malha(bon)
        ck.posicoes_das_juntas(rig)
        med, _ = ck.corpo_x_corpo(co_, tri_, nomes_, dono_)
        return med.get("antebracoE×bracoE", 0.0), med.get("antebracoD×bracoD", 0.0)

    # ── 3) embaixo: a linha da barra (y) que deixa o antebraço em pé DE LADO (punho em cima do cotovelo) com o cotovelo a ABRE° do
    # tronco — conta direta (a mão com o antebraço em pé, o cotovelo no círculo, bissecção no y) — e a altura (z) que deixa a barra a
    # FOLGA_PEITO da pele já com os braços embaixo (e a mão a FOLGA_MAO do tronco), medida na malha posada ──────────────────────
    def linha(abre, meia_, z, fi_alvo):
        """y do eixo da barra, na altura z, em que o antebraço fica `fi_alvo`° da vertical de lado (− = punho pros pés do cotovelo)
        com o braço aberto `abre`° do tronco."""
        off0 = {L: vao_menos_punho(L, *_orientacao(PUNHO + fi_alvo, s)) for L, s in LADOS}
        k = math.tan(math.radians(fi_alvo))

        def g(y):
            tot = 0.0
            for L, s in LADOS:
                W = Vector((s * meia_, y, z)) - off0[L]
                E, _C, _a = _cotovelo(S[L], W, Lb, La, abre, cima, fora[L])
                tot += (W.y - E.y) - (W.z - E.z) * k              # + = punho pra cabeça do que se quer
            return tot / 2
        lo, hi = S["Left"].y - 0.34, S["Left"].y - 0.02
        glo, ghi = g(lo), g(hi)
        if glo * ghi > 0:
            return (lo if abs(glo) < abs(ghi) else hi), False
        for _ in range(32):
            m = (lo + hi) / 2
            gm = g(m)
            if gm * glo > 0:
                lo, glo = m, gm
            else:
                hi = m
        return (lo + hi) / 2, True

    def embaixo(abre, meia_, fi_alvo=None, voltas=5, imprime=False):
        fi_alvo = FI_BAIXO if fi_alvo is None else fi_alvo
        estado["abre"], estado["meia"] = abre, meia_
        z = dt.peito(bon, S["Left"].y - 0.17) + FOLGA_PEITO + RAIO
        y, achou = linha(abre, meia_, z, fi_alvo)
        for volta in range(voltas):
            maos_em(Vector((0.0, y, z)))
            malha = _malha(bon)
            folga, parte = folga_barra(y, z, malha)
            fc = folgas_corpo(malha)
            mao = min(fc["mãoL"], fc["mãoR"])
            fi = (maos_em.fi["Left"] + maos_em.fi["Right"]) / 2
            if imprime:
                print("   embaixo (abre %.0f°, meia %.3f), volta %d: barra y %.4f z %.4f%s | antebraço %.1f° de lado | barra → pele %.1f "
                      "mm (%s) | mão → tronco %.1f mm" % (abre, meia_, volta, y, z, "" if achou else " (SEM linha exata)", fi,
                                                          folga * 1000, parte, mao * 1000), flush=True)
            dz = max(FOLGA_PEITO - folga, FOLGA_MAO - mao)
            if abs(dz) < 0.0003:
                break
            z += max(-0.02, min(0.02, dz))
            y, achou = linha(abre, meia_, z, fi_alvo)
        return y, z, fi, folga, parte, fc, malha

    if SONDA:
        print("SONDA pegada × abertura do cotovelo (embaixo e no meio do caminho, com a barra em cima a z %.3f): barra y (mm pros pés do "
              "ombro) | z | antebraço de lado / de frente | folgas ao tronco (mm): braço depois da axila, antebraço, mão | antebraço "
              "entrando no braço (mm) | punho desvio | palma frente | cotovelo" % SONDA_Z0, flush=True)
        for fator, abre, fi_alvo in SONDA_CASOS:
            meia_ = fator * (S["Left"].x - S["Right"].x) / 2
            y, z, fi, folga, parte, fc, malha = embaixo(abre, meia_, fi_alvo)
            jj = ck.posicoes(rig)
            pen = penetra_braco(malha)
            linha_baixo = ("SONDA fator %.2f abre %2.0f fi %+.0f EMBAIXO | y %.0f mm | z %.4f | antebraço %+.1f / %+.1f/%+.1f° | braço %.1f/%.1f "
                           "antebraço %.1f/%.1f mão %.1f/%.1f | antebraço×braço %.1f/%.1f | desvio %s | palma frente %s | abertura %s | "
                           "cotovelo %s, %.0f mm abaixo do banco | barra→pele %.1f (%s) | pegada %.2f" % (
                               fator, abre, fi_alvo, (S["Left"].y - y) * 1000, z, fi, lean_frontal("Left"), lean_frontal("Right"),
                               fc["braçoL"] * 1000, fc["braçoR"] * 1000, fc["antebraçoL"] * 1000, fc["antebraçoR"] * 1000,
                               fc["mãoL"] * 1000, fc["mãoR"] * 1000, pen[0], pen[1],
                               "/".join("%.0f" % v for v in tc.punho_desvio(jj)), "/".join("%.0f" % v for v in tc.palma_frente(jj)),
                               "/".join("%.0f" % v for v in tc.braco_abertura(jj)),
                               "/".join("%.0f" % v for v in (ck.medir_juntas(rig)["cotoveloE"], ck.medir_juntas(rig)["cotoveloD"])),
                               (TOPO - float(jj["LeftForeArm"][2])) * 1000, folga * 1000, parte, tc.pegada_largura(jj)[0]))
            print(linha_baixo, flush=True)
            for tt in (0.5, 0.75):                            # no meio do caminho (linha reta de cima, em cima dos ombros, até embaixo)
                maos_em(Vector((0.0, p3.lerp((S["Left"].y + S["Right"].y) / 2, y, tt), p3.lerp(SONDA_Z0, z, tt))))
                malha = _malha(bon)
                fc = folgas_corpo(malha)
                jj = ck.posicoes(rig)
                pen = penetra_braco(malha)
                print("SONDA fator %.2f abre %2.0f fi %+.0f t=%.2f | antebraço × vertical %s (de lado %+.1f, de frente %+.1f/%+.1f) | braço %.1f/%.1f "
                      "antebraço %.1f/%.1f | antebraço×braço %.1f/%.1f | desvio %s | palma frente %s | elevação %s | cotovelo %s" % (
                          fator, abre, fi_alvo, tt, "/".join("%.0f" % v for v in tc.antebraco_vertical(jj)),
                          (maos_em.fi["Left"] + maos_em.fi["Right"]) / 2, lean_frontal("Left"), lean_frontal("Right"),
                          fc["braçoL"] * 1000, fc["braçoR"] * 1000, fc["antebraçoL"] * 1000, fc["antebraçoR"] * 1000, pen[0], pen[1],
                          "/".join("%.0f" % v for v in tc.punho_desvio(jj)), "/".join("%.0f" % v for v in tc.palma_frente(jj)),
                          "/".join("%.0f" % v for v in tc.braco_elevacao(jj)),
                          "/".join("%.0f" % v for v in (ck.medir_juntas(rig)["cotoveloE"], ck.medir_juntas(rig)["cotoveloD"]))),
                      flush=True)
        for abre, fi_alvo in SONDA_TORCAO_CASOS:            # a pronação dividida entre o antebraço e a mão, embaixo
            meia_ = MEIA_FATOR * (S["Left"].x - S["Right"].x) / 2
            for f in SONDA_TORCOES:
                estado["torcao"] = f
                y, z, fi, folga, parte, fc, malha = embaixo(abre, meia_, fi_alvo)
                pen = penetra_braco(malha)
                jj = ck.posicoes(rig)
                print("SONDA torção abre %2.0f fi %+.0f fração na mão %.2f | giro do antebraço pra palma %.0f/%.0f° | antebraço×braço "
                      "%.1f/%.1f mm | y %.0f mm | cotovelo %.0f/%.0f° | desvio %s | flexão do punho %s" % (
                          abre, fi_alvo, f, maos.torcao.get("Left", 0), maos.torcao.get("Right", 0), pen[0], pen[1],
                          (S["Left"].y - y) * 1000, ck.medir_juntas(rig)["cotoveloE"], ck.medir_juntas(rig)["cotoveloD"],
                          "/".join("%.0f" % v for v in tc.punho_desvio(jj)), "/".join("%.0f" % v for v in tc.punho_flexao(jj))),
                      flush=True)
            estado["torcao"] = TORCAO_MAO
        if SONDA == "so":
            raise RuntimeError("SONDA: fim (só a tabela)")

    Y1, Z1, fi1, folga1, parte1, fc1, _m = embaixo(ABRE, meia, imprime=True)
    print("EMBAIXO | barra y %.4f (%.0f mm pros pés do ombro) z %.4f | antebraço %.1f° de lado, %.1f/%.1f° de frente | barra → pele "
          "%.1f mm (%s) | braço %.1f/%.1f antebraço %.1f/%.1f mão %.1f/%.1f mm do tronco | antebraço×braço %.1f/%.1f mm | giro do "
          "antebraço pra palma (pronação) %.0f/%.0f°, %.0f%% no osso da mão" % (
              Y1, (S["Left"].y - Y1) * 1000, Z1, fi1, lean_frontal("Left"), lean_frontal("Right"), folga1 * 1000, parte1,
              fc1["braçoL"] * 1000, fc1["braçoR"] * 1000, fc1["antebraçoL"] * 1000, fc1["antebraçoR"] * 1000,
              fc1["mãoL"] * 1000, fc1["mãoR"] * 1000, *penetra_braco(_m), maos.torcao.get("Left", 0), maos.torcao.get("Right", 0),
              TORCAO_MAO * 100), flush=True)
    estado["abre"], estado["meia"] = ABRE, meia

    # ── 4) em cima: a barra em cima das articulações dos ombros, subindo até o cotovelo ficar dobrado COTOVELO_CIMA° ─────────────
    Y0 = (S["Left"].y + S["Right"].y) / 2

    def cotovelo_medio():
        jj = ck.medir_juntas(rig)
        return (jj["cotoveloE"] + jj["cotoveloD"]) / 2

    lo, hi = Z1 + 0.15, Z1 + 0.65
    for _ in range(16):
        meio = (lo + hi) / 2
        maos_em(Vector((0.0, Y0, meio)))
        if cotovelo_medio() > COTOVELO_CIMA and max(maos.erro.values()) < 0.002:
            lo = meio                       # ainda dobrado: sobe mais
        else:
            hi = meio
    Z0 = lo
    maos_em(Vector((0.0, Y0, Z0)))
    print("EM CIMA | barra y %.4f z %.4f | cotovelo %.1f° | antebraço %.1f/%.1f° da vertical de lado (− = pros pés), %.1f/%.1f° de "
          "frente | vão da mão %.1f/%.1f mm" % (Y0, Z0, cotovelo_medio(), maos_em.fi["Left"], maos_em.fi["Right"],
                                                lean_frontal("Left"), lean_frontal("Right"), maos.erro["Left"] * 1000,
                                                maos.erro["Right"] * 1000), flush=True)

    # ── 5) a barra, o perfil do peito e onde a barra encosta ───────────────────────────────────────────────────────────────────
    barra = e3.barra("barra", comprimento=2.0, raio_anilha=R_ANILHA, pegada=PEGADA_TRAVAS)
    _tampas_em_leque(barra)
    co, _, (nomes, dono) = _malha(bon)
    T = co[_grupo(nomes, dono, ("Spine", "Spine1", "Spine2"))]
    rel = T - np.array(S["Left"])
    f = T[(np.abs(np.abs(T[:, 0]) - 0.11) < 0.02) & (rel[:, 1] < 0.0) & (rel[:, 1] > -0.20)]
    mam = Vector(f[f[:, 2].argmax()])       # a parte mais alta (saliente) do peitoral, perto da linha dos mamilos
    for x0, nome in ((0.0, "meio (esterno)"), (0.10, "peitoral (x 0,10)")):
        M = co[_grupo(nomes, dono, ("Spine", "Spine1", "Spine2", "Neck", "LeftShoulder", "RightShoulder"))]
        M = M[np.abs(np.abs(M[:, 0]) - x0) < 0.012]
        perfil = []
        for dy in range(6, -34, -2):
            y_ = S["Left"].y + dy / 100
            fx = M[np.abs(M[:, 1] - y_) < 0.006]
            perfil.append("%+d:%s" % (dy, "%.0f" % (float(fx[:, 2].max()) * 1000) if len(fx) else "-"))
        print("PERFIL %s (cm do ombro: altura da pele em mm): %s" % (nome, " ".join(perfil)), flush=True)
    print("LINHA | barra embaixo a %.0f mm pros pés da articulação do ombro, %.0f mm pros pés da parte mais saliente do peitoral "
          "(%.3f %.3f %.3f) | em cima z %.3f, embaixo z %.3f (desce %.0f mm e anda %.0f mm pros pés)" % (
              (S["Left"].y - Y1) * 1000, (mam.y - Y1) * 1000, *mam, Z0, Z1, (Z0 - Z1) * 1000, (Y0 - Y1) * 1000), flush=True)

    def bracos(t):
        """Barra no quadro t (linha reta de cima, em cima dos ombros, até embaixo, no peito) e as 2 mãos nela (sem fechar os dedos)."""
        centro = Vector((0.0, p3.lerp(Y0, Y1, t), p3.lerp(Z0, Z1, t)))
        barra.location = centro
        p3.atualizar()
        return maos_em(centro)

    def polegar_na_barra(lado, c_, malha=None):
        """Pele do polegar → superfície da barra (m), a mais funda (− = entrou na barra)."""
        co_, _, (nomes_, dono_) = malha or _malha(bon)
        P_ = co_[_grupo(nomes_, dono_, tuple(lado + "HandThumb%d" % i for i in (1, 2, 3)))]
        return float((np.hypot(P_[:, 1] - c_.y, P_[:, 2] - c_.z) - RAIO).min())

    # ── 6) polegar NOVO dando a volta na barra, FIXO em todos os quadros (a mão só rola em volta da barra junto com o antebraço: a
    # pegada é a mesma em todo quadro) — a postura sai da própria busca, em cima e embaixo, medida em cima, no meio e embaixo
    # (o jeito do Supino Reto no Smith) ──────────────────────────────────────────────────────────────────────────────────────
    POLEGAR = dict(POLEGAR_FIXO) if POLEGAR_FIXO else {}
    if BUSCAR_POLEGAR or not POLEGAR:
        AMOSTRAS = (0.0, 0.5, 1.0)
        cands = {L: [] for L, _ in LADOS}
        for tt in (0.0, 1.0):
            c_ = bracos(tt)
            for L, _ in LADOS:
                r = pg.fechar_em_volta(bon, L, c_, EIXO, RAIO, polegar_modo="volta")["Thumb"]
                if isinstance(r, tuple) and r and r[0] == "volta" and r[-1]:
                    cands[L].append((tuple(float(x) for x in r[1:7]), tt, r[7], r[8], r[9]))
                print("   busca do polegar %s em t = %.1f: %s" % (L, tt, r), flush=True)
        todas = []
        for L, _ in LADOS:
            for cand in cands[L]:
                if all(max(abs(a - b) for a, b in zip(cand[0], c2[0])) > 0.5 for c2 in todas):
                    todas.append(cand)
        if not todas:
            raise RuntimeError("polegar novo sem postura viável nas 2 mãos (t = 0 e 1)")
        medidas = {L: [[None] * len(AMOSTRAS) for _ in todas] for L, _ in LADOS}
        for k, tt in enumerate(AMOSTRAS):
            c_ = bracos(tt)
            for L, _ in LADOS:
                pg.fechar_em_volta(bon, L, c_, EIXO, RAIO, polegar_modo="busca")
                for i, cand in enumerate(todas):
                    _polegar_nos_angulos(bon, L, cand[0])
                    pp = pg.pele_do_polegar(bon, L)
                    medidas[L][i][k] = (polegar_na_barra(L, c_), pp["alonga_max"], pp["viradas"])
        for L, _ in LADOS:
            def nota(i):
                m = medidas[L][i]
                return (any(x[0] < -pg.APERTO for x in m), max(x[2] for x in m), round(max(x[1] for x in m), 2),
                        -min(x[0] for x in m))
            i = min(range(len(todas)), key=nota)
            q, tt, alvo_mm, vao_mm, alonga = todas[i]
            POLEGAR[L] = q
            for j, cand in enumerate(todas):
                print("   polegar %s, postura %d %s (achada em t = %.1f): em cima/meio/embaixo → barra %s mm | pele da base %s× | "
                      "triângulos do avesso %s" % (L, j, cand[0], cand[1], "/".join("%+.1f" % (x[0] * 1000) for x in medidas[L][j]),
                                                   "/".join("%.2f" % x[1] for x in medidas[L][j]),
                                                   "/".join("%d" % x[2] for x in medidas[L][j])), flush=True)
            print("POLEGAR %s | %d postura(s) viável(is) nas 2 mãos | fica a %d, achada em t = %.1f: (CMC flex, abd, rot, MCP "
                  "flex, abd, IP flex) %s | alvo %.1f mm, vão %.1f mm na busca" % (L, len(todas), i, tt, q, alvo_mm, vao_mm),
                  flush=True)
    print("POLEGAR | novo, fixo: (CMC flex, abd, rot, MCP flex, abd, IP flex) E %s D %s" % (POLEGAR["Left"], POLEGAR["Right"]),
          flush=True)

    # os 4 dedos fecham até a pele encostar na barra e o polegar fica na postura escolhida — UMA vez, em cima (a mão só rola em volta
    # da barra, com o vão no eixo dela: a pegada é a mesma em todo quadro); a checagem confere a mão fechada em todo quadro
    PB = rig.pose.bones
    DEDOS = {}
    c_ = bracos(0.0)
    dedos_info = {}
    for L, _ in LADOS:
        dedos_info[L] = pg.fechar_em_volta(bon, L, c_, EIXO, RAIO, polegar_modo="busca")
        _polegar_nos_angulos(bon, L, POLEGAR[L])
        dedos_info[L]["Thumb"] = ("volta fixo",) + tuple(POLEGAR[L])
        DEDOS[L] = {pb.name: pb.matrix_basis.copy() for pb in PB
                    if pb.name[len(p3.P):].startswith(L + "Hand") and pb.name[len(p3.P):] != L + "Hand"}
        print("DEDOS %s | %s" % (L, dedos_info[L]), flush=True)

    def pose(t):
        """t=0 braços quase esticados em cima (barra em cima dos ombros), t=1 barra embaixo, encostando de leve na parte de baixo do
        peito."""
        t0 = time.time()
        bracos(t)
        for L, _ in LADOS:                  # a mão fechada de sempre (o _segurar põe a mão de referência a cada volta)
            for n, M in DEDOS[L].items():
                PB[n].matrix_basis = M.copy()
        p3.atualizar()
        pose.t = t
        print("TEMPO pose t=%.3f: mãos %.1f s, total %.1f s" % (t, maos_em.tempo, time.time() - t0), flush=True)

    pose.dedos = dedos_info
    pose.t = 0.0

    def maos_na_barra(malha=None):
        """Por mão: (trava − pele da mão, pelo X; pele da mão mais funda dentro da barra, − = entrou), em m."""
        co_, _, (nomes_, dono_) = malha or _malha(bon)
        b = barra.matrix_world.to_translation()
        out = []
        for L, s in LADOS:
            H = co_[np.array([n.startswith(L + "Hand") for n in nomes_] + [False])[dono_]]
            out.append((PEGADA_TRAVAS / 2 - float((s * H[:, 0]).max()),
                        float((np.hypot(H[:, 1] - b.y, H[:, 2] - b.z) - RAIO).min())))
        return out

    def info():
        t0 = time.time()
        txt = _info()
        print("TEMPO info %.1f s" % (time.time() - t0), flush=True)
        return txt

    def _info():
        jj = ck.posicoes(rig)
        juntas = ck.medir_juntas(rig)
        b = barra.matrix_world.to_translation()
        malha = _malha(bon, 0)              # a malha do quadro sem a subdivisão, avaliada uma vez só (o exportador chama o info() todo
                                            # quadro; trocar o nível da subdivisão refaz a pele inteira) — as medidas que valem são
                                            # as da checagem, na malha subdividida
        folga, parte = folga_barra(b.y, b.z, malha)
        fc = folgas_corpo(malha)
        mnb = maos_na_barra(malha)
        anilha = min(float(ck._avaliar_simples(o)[0][:, 2].min()) for o in ck._malhas(barra) if "anilha" in o.name)

        def pol(lado):
            v = pose.dedos.get(lado, {}).get("Thumb", ())
            pp = pg.pele_do_polegar(bon, lado)
            return "%s, pele da base %.2f× e %d triângulo(s) do avesso, polegar → barra %+.1f mm" % (
                v[0] if isinstance(v, tuple) and v else v, pp["alonga_max"], pp["viradas"], polegar_na_barra(lado, b, malha) * 1000)
        return ("barra y %.4f (%.0f mm pros pés do ombro) z %.3f | barra → pele %.1f mm (%s) | braço depois da axila → tronco %.1f/%.1f mm"
                " | antebraço → tronco %.1f/%.1f mm | mão → tronco %.1f/%.1f mm | mão × mão %.0f mm | cotovelo %.0f/%.0f°, E %.0f mm "
                "abaixo do topo do banco | abertura %s° | cotovelo_tronco %s° | elevação %s° | antebraço × vertical %s° (de frente "
                "%.0f/%.0f°) | punho %.0f/%.0f° (flexão %s, desvio %s) | palma: frente %s°, dentro %s° | pegada %.2f | escápula %s mm |"
                " tronco %.1f° | coluna %.1f° | cabeça %.1f° | mão → trava %s mm, mão mais funda na barra %s mm | anilha mais baixa z "
                "%.3f | polegar E %s | D %s | %s" % (
                    b.y, (S["Left"].y - b.y) * 1000, b.z, folga * 1000, parte, fc["braçoL"] * 1000, fc["braçoR"] * 1000,
                    fc["antebraçoL"] * 1000, fc["antebraçoR"] * 1000, fc["mãoL"] * 1000, fc["mãoR"] * 1000, fc["mão×mão"] * 1000,
                    juntas["cotoveloE"], juntas["cotoveloD"], (TOPO - float(jj["LeftForeArm"][2])) * 1000,
                    "/".join("%.0f" % v for v in tc.braco_abertura(jj)), "/".join("%.0f" % v for v in tc.cotovelo_tronco(jj)),
                    "/".join("%.0f" % v for v in tc.braco_elevacao(jj)), "/".join("%.0f" % v for v in tc.antebraco_vertical(jj)),
                    lean_frontal("Left"), lean_frontal("Right"), juntas["punhoE"], juntas["punhoD"],
                    "/".join("%.0f" % v for v in tc.punho_flexao(jj)), "/".join("%.0f" % v for v in tc.punho_desvio(jj)),
                    "/".join("%.0f" % v for v in tc.palma_frente(jj)), "/".join("%.0f" % v for v in tc.palma_dentro(jj)),
                    tc.pegada_largura(jj)[0], "/".join("%.0f" % v for v in tc.escapula_frente(jj)),
                    ck.angulo_chave(rig, {"medida": "tronco"})[0], tc.coluna(jj)[0], tc.cabeca_tronco(jj)[0],
                    "/".join("%.0f" % (v[0] * 1000) for v in mnb), "/".join("%+.1f" % (v[1] * 1000) for v in mnb), anilha,
                    pol("Left"), pol("Right"), maos.info()))

    for t in (0.0, 0.25, 0.5, 0.75, 1.0):
        pose(t)
        print("t=%.2f | %s" % (t, info()), flush=True)
    pose(0.0)

    bk = ck.Barra(barra, raio=RAIO, meio_compr=PEGADA_TRAVAS / 2)
    # a barra é EQUIPAMENTO: a checagem cobra 3 mm de folga dela (e das anilhas) até o resto do corpo em todo quadro (encostar "de
    # leve" embaixo = FOLGA_PEITO); o banco é o apoio
    return Cena(pose, [barra], pegadas=[("Left", bk), ("Right", bk)], apoio_mm=0.0,
                foco_luz=(0, (Y0 + Y1) / 2, 0.65), camera_video=((3.0, -2.2, 1.7), (0, (Y0 + Y1) / 2, 0.75), 45), info=info,
                apoios=[banco], afunda_apoio_mm=20)
