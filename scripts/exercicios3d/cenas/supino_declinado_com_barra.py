# Supino Declinado com Barra — cena da fábrica 3D (lote 14, 12/10/2026). Peças: a barra olímpica do e3.barra (eixo de 29 mm, 1,32 m
# entre as travas) com as anilhas de 45 cm (as do Supino Fechado com Barra) e o BANCO DECLINADO novo (e3.banco_declinado: estofado das
# costas e da cabeça a −15°, apoio das pernas com as almofadas da dobra do joelho e os rolos dos tornozelos, viga, perna, os 2 postes
# com os ganchos). As frases das fontes estão na ficha (referencias); aqui, o essencial:
#   free-exercise-db, Decline Barbell Bench Press (o fonte_en do catálogo): "Secure your legs at the end of the decline bench and
#   slowly lay down on the bench." / "Using a medium width grip (a grip that creates a 90-degree angle in the middle of the movement
#   between the forearms and the upper arms), lift the bar from the rack and hold it straight over you with your arms locked. The arms
#   should be perpendicular to the floor." / "As you breathe in, come down slowly until you feel the bar on your lower chest."; ExRx,
#   Barbell Decline Bench Press: "Lie supine on decline bench with feet under leg brace." / "Lower weight to chest. Press bar until
#   arms are extended."; Life Fitness (loja), Signature Series Olympic Decline Bench: "a negative 15-degree back pad angle".
# t = 0 em cima: braços quase esticados (cotovelo ~10°, sem travar) e a barra na VERTICAL das articulações dos ombros — o braço
#   perpendicular ao CHÃO, não ao tronco (no declínio ele fica ~15° inclinado pros pés em relação à normal do tronco) · t = 1 embaixo:
#   a barra a FOLGA_PEITO da pele (encosta de leve) na parte de BAIXO do peito, com os cotovelos a ~ABRE° do tronco e o antebraço em pé
#   (vertical do mundo, de lado e de frente) embaixo da barra. A barra desce em linha reta de cima dos ombros até a parte de baixo do
#   peito ("down and slightly forward", NSCA) — pros pés — e volta.
# Como o rig faz: as escápulas vão pra trás e pra baixo em pé, antes de deitar (as do Supino Fechado), e o corpo deita de costas no banco
#   declinado (dt.declinar: o tronco gira 105° em volta do quadril, escápulas e glúteo no plano do estofado, a cabeça no estofado da
#   cabeça; as coxas sobem QUADRIL° acima da linha do estofado, os joelhos dobram JOELHO° e as canelas descem pra fora do banco, com os
#   pés na postura de repouso). O apoio das pernas sai do corpo: a almofada da dobra do joelho atrás da panturrilha, logo abaixo do
#   joelho, paralela à canela, e o rolo na frente do tornozelo, em cima do peito do pé (_almofadas_e_rolos). A pegada (vão de cada mão
#   a MEIA do meio) é a média; o cotovelo fica, em todo quadro, no PONTO MAIS BAIXO do círculo dos cotovelos possíveis (ombro → punho:
#   o antebraço o mais em pé possível — COTOVELO = "baixo", o jeito do Supino Reto com Barra; a abertura fica em 53–67° do tronco) e o
#   braço vai até ele pelo IK analítico (o do Supino Fechado com Barra, copiado: braço, antebraço e mão voltam pro repouso a cada volta
#   — o mesmo conserto do zerar=True do Maos.segurar, commit 120b243: o giro do antebraço não passa de um quadro pro outro). Embaixo, a
#   linha da barra é a que deixa o antebraço em pé de lado, com o cotovelo a ABRE° do tronco, e a barra a FOLGA_PEITO da pele. A mão,
#   com a palma pros pés (pegada pronada), segue o antebraço com o punho firme (e SEGUE_FRENTE de leve no plano da palma) e rola em
#   volta da barra; os 4 dedos fecham até a pele encostar e o polegar novo dá a volta na barra numa postura fixa tirada da própria
#   busca. Tronco, escápulas, cabeça, quadril, pernas e pés não mexem (as pernas presas no apoio seguram o corpo no declínio).
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
R_ANILHA = 0.225          # anilha de 45 cm (IPF: "The diameter of the largest discs shall not be more than 45 cm"; a do Supino Fechado)
# ── banco declinado (Life Fitness Signature Series Olympic Decline Bench, SODB / LBR-OD) ──────────────────────────────────────────
ANGULO = 15.0             # estofado 15° abaixo da horizontal, fixo (loja da Life Fitness: "a negative 15-degree back pad angle"; Legend
                          # 3109: "Pad angle is -15 degrees from horizontal"; Glass & Armstrong 1997 e Lauver 2016: −15°)
ALTO = 0.432              # topo do estofado das costas na ponta alta (SODB: "Vertical height from floor to Seat Pad 17" (43.2 cm)")
ALEM_GLUTEO = 0.10        # o estofado das costas passa 10 cm do glúteo pros pés (o resto da coxa sai dele até a almofada do joelho)
COSTAS = (0.813, 0.279, 0.06)   # estofado das costas: SODB "Back Pad Size ... 11" x 32" (27.9 x 81.3 cm)" (o manual de peças diz
                                # "Pad, 36 X 11 Flat": ficou a medida do site e da loja); 6 cm de espessura (a dos bancos da fábrica)
CABECA = (0.228, 0.254, 0.06, 0.01)   # estofado da cabeça: SODB "Head Pad Size ... 10" x 9" (25.4 x 22.8 cm)", 1 cm depois do das costas
QUADRIL = 5.0             # coxa acima da linha do estofado (flexão do quadril, graus): quase na linha do banco, subindo até a almofada
JOELHO = 90.0             # joelho dobrado ~90° por cima da almofada (fotos do free-exercise-db: a dobra do joelho na almofada da ponta)
TORNOZELO = None          # pé na postura de repouso em relação à canela (tecnica3d.tornozelo ~76°)
ABRIR = 0.0               # coxa aberta pro lado (graus) além da de repouso
ALMOFADA_JOELHO = (0.20, 0.18, 0.06)  # almofada da dobra do joelho: comprimento (ao longo da canela), largura, espessura — o SODB tem 2
                                      # ("Pad, Angle Short", Qty 2) sem medida no manual: escolha da fábrica
JOELHO_ABAIXO = 0.08      # a borda de cima da almofada fica 8 cm abaixo do centro do joelho, ao longo da canela: encaixada na dobra,
                          # com a parte de trás da coxa em cima dela e a panturrilha na face (sonda de 12/10: a 3,5 cm a coxa entrava
                          # 29 mm na almofada e a chapa dela 7 mm na coxa; a 6,5 cm, 8 mm; a 8 cm, 0 mm e a chapa a 22 mm da pele)
AFUNDA_JOELHO = 0.004     # pele da panturrilha dentro da almofada
RAIO_ROLO, COMPR_ROLO = 0.0508, 0.18  # rolos dos tornozelos de 4" (REP Fitness, rolos do apoio de declinado AB-5000/5100: "The pads are
                                      # 4” in diameter"; o SODB tem 2 "ROLLER PAD SHORT" sem medida) × 18 cm (escolha da fábrica)
ROLO_ANG = 50.0           # o rolo encosta no peito do pé, na frente do tornozelo: centro na direção a 50° da frente da canela, pro peito
                          # do pé (entre a frente da canela e o dorso do pé)
AFUNDA_ROLO = 0.003       # pele do peito do pé dentro do rolo
POSTES = (0.53, 1.30, (0.94, 0.775))  # x dos 2 postes, altura (SODB: footprint "68" x 51" x 51"" → 130 cm), ganchos (SODB: "Top Bar
                                      # Support 37" (94 cm)", "Bottom Bar Support 30.5" (77.5 cm)")
# ── pegada e braços ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
MEIA = None               # meia pegada (m, do meio da barra ao vão de cada mão); None = sai do montar() (MEIA_FATOR × ombro)
MEIA_FATOR = 1.75         # vão da mão a 1,75× a meia distância entre as articulações dos ombros (pegada média): a que deixa o
                          # antebraço em pé DE FRENTE embaixo com o cotovelo a ABRE° (sonda de 12/10: 55° → 1,680; 60° → 1,695;
                          # 65° → 1,762)
ABRE = 64.0               # cotovelo × tronco embaixo (braco_abertura, graus: 0 = colado na lateral apontando pros pés, 90 = em T)
FI_BAIXO = 0.0            # antebraço embaixo, de lado (graus da vertical do mundo; − = punho pros pés do cotovelo)
COTOVELO = "baixo"        # cotovelo no caminho: "baixo" = no ponto mais baixo do círculo (antebraço o mais em pé possível, o do Supino
                          # Reto com Barra) ou "abre" = sempre a ABRE° do tronco (o do Supino Fechado). "baixo": com "abre" os ABRE° não
                          # cabem com o braço quase esticado em cima (o círculo dos cotovelos é pequeno e o braço em pé no declínio já
                          # fica inclinado pros pés em relação ao tronco) e o cotovelo pulava pro ponto de abertura mais perto (pra
                          # cabeça) — o antebraço girava ~34° no próprio eixo nos 4 primeiros quadros (medir_giro.py: antebraço × braço
                          # −24,8 → +24,6°, mão × antebraço −34,1 → +13,7°); "baixo" vai contínuo de cima a embaixo (antebraço × braço
                          # +4,1 → +24,9°, mão × antebraço −5,4 → +14,0°, acompanhando o t) e a abertura fica em 53–67° (ExRx: 45–70°).
                          # ABRE continua valendo embaixo: é com ele que a linha da barra deixa o antebraço em pé (linha/embaixo)
SONDA2 = False            # True = acha a meia pegada que deixa o antebraço em pé de frente embaixo, pra cada abertura de SONDA2_ABRES, e
SONDA2_ABRES = (60.0,)    # mede o antebraço e a abertura no caminho nos 2 modos do cotovelo (e para depois)
FOLGA_PEITO = 0.007       # barra → pele do peito embaixo: encosta de leve (Saeterbakken 2017: "touch the chest gently")
FOLGA_MAO = 0.002         # mão → pele do tronco embaixo: no mínimo isso
COTOVELO_CIMA = 10        # flexão do cotovelo em cima: quase esticado, sem travar
PUNHO = 14                # extensão do punho (graus) firme o movimento todo (o do Supino Reto e do Supino Fechado com Barra)
VOLTAS_PUNHO = 4
TORCAO_MAO = 0.5          # fração da pronação do antebraço que vai no osso da mão (_segurar; a do Supino Fechado)
PUNHO_FORA = 6.0          # mão girada no plano da palma (graus, + = dedos pro lado do dedo mínimo), mais SEGUE_FRENTE × a inclinação
SEGUE_FRENTE = 0.15       # do antebraço vista de frente: em cima o antebraço sobe inclinado pra fora (a pegada mais aberta que os
                          # ombros) e no meio do caminho pra dentro; com a mão sempre reta o punho desviava 21° pro lado do polegar em
                          # cima e 20° pro lado do dedo mínimo no meio (a barra cruza a palma um pouco na diagonal, como no ExRx: "turning
                          # the wrists out slightly so bar is placed on lower outer portion of palm"). Pouco: a mão de verdade não roda
                          # na barra durante a repetição, e o polegar fica numa postura fixa — com 0,5 (a mão rodando ~15° na barra) o
                          # polegar saía até 7,7 mm da barra no meio do caminho (checar 24 de 12/10 ~20:15); 0,15 = ~4°
RETRAI, DESCE = 6.0, 4.0  # escápulas pra trás e pra baixo (graus de giro da clavícula), em pé antes de deitar (as do Supino Fechado)
# postura fixa do polegar novo por mão (CMC flex, abd, rot, MCP flex, abd, IP flex), tirada da própria busca (12/10 ~20:53, com o
# cotovelo "baixo": 4 posturas viáveis; esta, achada em t = 0, sem triângulo do avesso e com a pele da base a 2,14–2,15×, fica de −1,3
# a +1,9 mm da barra em cima, no meio e embaixo; as 2 achadas em t = 1 viram 1 triângulo em cima); None = busca
POLEGAR_FIXO = {"Left": (-15.0, 27.0, 18.0, 33.0, -7.3, 42.0), "Right": (-15.0, 27.0, 18.0, 33.0, -7.3, 42.0)}
BUSCAR_POLEGAR = False    # True = refaz a busca (≈2 min a mais na montagem) e imprime a medida de cada postura
SONDA = False             # True = imprime a tabela pegada × abertura do cotovelo no montar(); "so" = só a tabela (para depois)
SONDA_CASOS = ()
SONDA_TORCAO_CASOS = ()
SONDA_TORCOES = (0.0, 0.25, 0.5)
SONDA_Z0 = 0.94
EIXO = Vector((1, 0, 0))  # a barra fica ao longo do X
PERTO_DA_BARRA = ("Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "LeftShoulder", "RightShoulder", "LeftArm", "RightArm")
TRONCO_PELE = ("Hips", "Spine", "Spine1", "Spine2")
VINCO = 0.18


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


def _orientacao(graus, s, fora=None):
    """Dedos e palma da mão do lado s (+1 esquerdo, −1 direito) com os dedos `graus` pra cabeça da vertical (a mão rola em volta da
    barra, ao longo do X) e `fora`° (padrão PUNHO_FORA) pro lado do dedo mínimo: palma pros pés (pegada pronada de quem está deitado)."""
    a, b = math.radians(graus), math.radians(PUNHO_FORA if fora is None else fora)
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




def _cotovelo_baixo(S, W, Lb, La):
    """Cotovelo no PONTO MAIS BAIXO do círculo dos cotovelos possíveis (ombro S, punho W): o antebraço o mais em pé possível (o
    deitado3d.polo_cotovelo_baixo, com o cotovelo em vez do polo). Com a pegada mais aberta que os ombros a reta ombro → punho fica
    inclinada pra fora mesmo em cima e o ponto mais baixo é o cotovelo pra fora (não fica indefinido). Devolve (cotovelo, centro)."""
    d = W - S
    dl = min(d.length, Lb + La - 1e-6)
    u = d.normalized()
    a = (Lb * Lb - La * La + dl * dl) / (2 * dl)
    rho = math.sqrt(max(Lb * Lb - a * a, 1e-10))
    C = S + u * a
    e1 = Vector((0.0, 0.0, -1.0)) + u * u.z
    if e1.length < 1e-6:
        e1 = Vector((1.0, 0.0, 0.0))
    return C + e1.normalized() * rho, C


def _sagital(v):
    """Ângulo (graus) do vetor no plano YZ, acima da horizontal, apontando pra −Y (o lado dos pés no banco)."""
    return math.degrees(math.atan2(v.z, -v.y))


def _almofadas_e_rolos(bon):
    """O apoio das pernas montado em volta delas (o corpo já deitado): por lado, a FACE da almofada da dobra do joelho — paralela à canela
    (no plano YZ), atrás da panturrilha, da borda de cima JOELHO_ABAIXO abaixo do centro do joelho até ALMOFADA_JOELHO[0] mais embaixo,
    com a pele mais de trás da panturrilha AFUNDA_JOELHO dentro dela — e o centro do ROLO do tornozelo: na direção a ROLO_ANG° da frente
    da canela pro dorso do pé (a partir do centro do tornozelo), o mais perto em que nenhum ponto da pele do pé e da canela entra mais que
    AFUNDA_ROLO nele. Devolve ({s: (x, y, z, ang)}, (y, z, raio, comprimento, x), medidas)."""
    rig = bon.rig
    co, _, (nomes, dono) = ck._avaliar(bon.corpo, 1)
    comp_j, larg_j, _esp = ALMOFADA_JOELHO
    joelhos, centros, med = {}, {}, {}
    for L, s in LADOS:
        K, A = p3.cabeca(rig, L + "Leg"), p3.cabeca(rig, L + "Foot")
        d = Vector((0.0, (A - K).y, (A - K).z)).normalized()          # descendo pela canela, no plano YZ
        ang = _sagital(d)
        nj = Vector((0.0, -math.cos(math.radians(ang + 90)), math.sin(math.radians(ang + 90))))   # frente da canela (pra fora do banco)
        P = co[_grupo(nomes, dono, (L + "Leg",))]
        sp = (P - np.array(K)) @ np.array(d)
        f = (sp > JOELHO_ABAIXO) & (sp < JOELHO_ABAIXO + comp_j)
        Q = P[f]
        xm = float(Q[:, 0].mean())
        Q = Q[np.abs(Q[:, 0] - xm) < larg_j / 2]
        face = float((Q @ np.array(nj)).min()) + AFUNDA_JOELHO          # nj·p = face (a almofada fica atrás: nj·p < face)
        T = K + d * JOELHO_ABAIXO
        T = T + nj * (face - T.dot(nj))
        joelhos[s] = (xm, T.y, T.z, ang)
        med["almofada " + L] = "x %.3f, borda de cima (%.3f %.3f), canela a %.1f°, face %.1f mm atrás do centro do joelho" % (
            xm, T.y, T.z, ang, (K.dot(nj) - face) * 1000)
        # rolo: centro em A + w·t, w a ROLO_ANG° da frente da canela (nj) pro dorso do pé (girando pra cima, no YZ)
        aw = math.radians(ang + 90 + ROLO_ANG)
        w = Vector((0.0, -math.cos(aw), math.sin(aw)))
        Pp = co[_grupo(nomes, dono, (L + "Leg", L + "Foot", L + "ToeBase"))]
        Pp = Pp[np.abs(Pp[:, 0] - A.x) < COMPR_ROLO / 2]

        def entra(t):
            c = A + w * t
            return float((RAIO_ROLO - np.hypot(Pp[:, 1] - c.y, Pp[:, 2] - c.z)).max())

        lo, hi = 0.0, 0.40
        for _ in range(40):
            m = (lo + hi) / 2
            if entra(m) > AFUNDA_ROLO:
                lo = m
            else:
                hi = m
        centros[s] = A + w * hi
        med["rolo " + L] = "centro (%.3f %.3f %.3f), %.0f mm do tornozelo na direção %.0f° (no YZ)" % (
            *centros[s], hi * 1000, math.degrees(aw))
    # um eixo só pros 2 rolos: o centro mais longe dos 2 tornozelos (nenhum entra mais que AFUNDA_ROLO; o outro pode ficar encostando
    # um pouco menos)
    c = Vector((0.0, (centros[1].y + centros[-1].y) / 2, (centros[1].z + centros[-1].z) / 2))
    xr = (abs(centros[1].x) + abs(centros[-1].x)) / 2
    return joelhos, (c.y, c.z, RAIO_ROLO, COMPR_ROLO, xr), med


def montar(bon):
    pg.usar_polegar("volta")          # polegar dando a volta na barra (padrão dos exercícios novos); barra de 29 mm = mão padrão
    rig = bon.rig

    def cab(n):
        return p3.cabeca(rig, n)

    # ── 1) escápulas pra trás e pra baixo, paradas o movimento todo (as do Supino Fechado com Barra) ─────────────────────────────
    cima0 = (cab("Neck") - cab("Hips")).normalized()
    lado0 = cab("RightShoulder") - cab("LeftShoulder")
    lado0 = (lado0 - cima0 * lado0.dot(cima0)).normalized()
    frente0 = cima0.cross(lado0)
    for L, s in LADOS:
        if RETRAI:
            p3.girar_osso(rig, L + "Shoulder", Matrix.Rotation(math.radians(s * RETRAI), 3, cima0))
        if DESCE:
            p3.girar_osso(rig, L + "Shoulder", Matrix.Rotation(math.radians(-s * DESCE), 3, frente0))

    # ── 2) deitado de costas no banco declinado: escápulas, glúteo e cabeça no estofado, pernas presas no apoio ─────────────────────
    g = dt.declinar(bon, ANGULO, ALTO, ALEM_GLUTEO, quadril=QUADRIL, joelho=JOELHO, tornozelo=TORNOZELO, abrir=ABRIR)
    E, u_b, n_b = g["E"], g["u"], g["n"]
    joelhos, rolos, med_apoio = _almofadas_e_rolos(bon)
    for k, v in med_apoio.items():
        print("APOIO DAS PERNAS | %s: %s" % (k, v), flush=True)
    olhos = [o.matrix_world.to_translation() for o in getattr(bon, "olhos", [])]
    y_olhos = sum(o.y for o in olhos) / len(olhos) if olhos else cab("Head").y + 0.10
    # os postes: a barra apoiada no gancho fica em cima dos olhos (NSCA: "with eyes directly under the bar"; ExRx: "Lie on bench so eye
    # level is just in front of the racked bar") — o gancho sai 4 cm + 4 cm da frente do poste (de.banco_declinado)
    y_postes = y_olhos + 0.01 + 0.08
    x_p, alt_p, ganchos = POSTES
    banco = e3.banco_declinado("declinado", ANGULO, (E.y, E.z), COSTAS, CABECA,
                                joelhos=dict(joelhos, medidas=ALMOFADA_JOELHO), rolos=rolos,
                                suportes=(y_postes, x_p, alt_p, ganchos))
    print("BANCO | ponta alta (%.3f %.3f) | olhos y %.3f → postes y %.3f | pivô %s | fim da viga %s | rolos %s" % (
        E.y, E.z, y_olhos, y_postes, "(%.3f %.3f %.3f)" % banco.medidas["pivo"], "(%.3f %.3f %.3f)" % banco.medidas["fim_viga"],
        "(y %.3f z %.3f r %.4f c %.3f x %.3f)" % rolos), flush=True)

    maos = Maos(bon, RAIO, polegar_modo="volta")
    maos.torcao = {}
    S = {L: cab(L + "Arm") for L, _ in LADOS}
    Lb = (cab("LeftForeArm") - cab("LeftArm")).length       # braço
    La = (cab("LeftHand") - cab("LeftForeArm")).length      # antebraço
    cima, lado = dt.eixos_tronco(rig)
    fora = {L: -s * lado for L, s in LADOS}
    meia = MEIA if MEIA is not None else MEIA_FATOR * (S["Left"].x - S["Right"].x) / 2
    print("DEITADO | ombro E (%.4f %.4f %.4f) D (%.4f %.4f %.4f) | braço %.4f antebraço %.4f | meia pegada %.4f | tronco %.1f° da "
          "vertical" % (*S["Left"], *S["Right"], Lb, La, meia, ck.angulo_chave(rig, {"medida": "tronco"})[0]), flush=True)

    OFF = {}                     # vão da mão − punho no referencial da mão (dedos, palma, dedos × palma): igual em toda orientação
    for L, s in LADOS:
        dq0, pq0 = _orientacao(PUNHO, s)
        g0 = S[L] + Vector((s * 0.05, 0, 0.55))
        _segurar(maos, L, g0, dq0, pq0, polo=S[L] + Vector((s * 0.3, -0.5, -0.3)))
        o = g0 - cab(L + "Hand")
        OFF[L] = (o.dot(dq0), o.dot(pq0), o.dot(dq0.cross(pq0)))

    def vao_menos_punho(L, dq, pq):
        o = OFF[L]
        return dq * o[0] + pq * o[1] + dq.cross(pq) * o[2]

    estado = {"meia": meia, "abre": ABRE, "torcao": TORCAO_MAO, "modo": "abre"}

    def maos_em(centro):
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
            g_ = centro + Vector((s * estado["meia"], 0, 0))
            fi = 0.0
            fora_ = PUNHO_FORA
            for _ in range(VOLTAS_PUNHO):
                dq, pq = _orientacao(fi + PUNHO, s, fora_)
                W = g_ - vao_menos_punho(L, dq, pq)
                if estado["modo"] == "baixo":
                    Ec, C = _cotovelo_baixo(S[L], W, Lb, La)
                else:
                    Ec, C, _a = _cotovelo(S[L], W, Lb, La, estado["abre"], cima, fora[L])
                _segurar(maos, L, g_, dq, pq, polo=Ec + (Ec - C).normalized() * 0.3, torcao_mao=estado["torcao"])
                ax = cab(L + "Hand") - cab(L + "ForeArm")
                fi = math.degrees(math.atan2(ax.y, ax.z))
                fora_ = PUNHO_FORA - SEGUE_FRENTE * math.degrees(math.atan2(-s * ax.x, ax.z))   # a mão segue parte do antebraço de frente
            maos_em.fi[L] = fi
            maos_em.fora[L] = fora_
        return centro

    maos_em.fi = {}
    maos_em.fora = {}
    maos_em.tempo = 0.0

    def folga_barra(y, z, malha=None):
        co_, _, (nomes_, dono_) = malha or _malha(bon)
        m = _grupo(nomes_, dono_, PERTO_DA_BARRA)
        P_ = co_[m]
        d = np.hypot(P_[:, 1] - y, P_[:, 2] - z) - RAIO
        d[np.abs(P_[:, 0]) > PEGADA_TRAVAS / 2] = 1e9
        k = int(np.argmin(d))
        return float(d[k]), nomes_[dono_[np.where(m)[0][k]]], Vector(P_[k])

    def folgas_corpo(malha=None):
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
        out["mão×mão"] = float(HE[:, 0].min() - HD[:, 0].max())
        return out

    def lean_frontal(L):
        """Antebraço inclinado pro meio do corpo (+, punho pra dentro do cotovelo) no plano frontal do MUNDO (XZ), graus."""
        s = 1 if L == "Left" else -1
        f = cab(L + "Hand") - cab(L + "ForeArm")
        return math.degrees(math.atan2(-s * f.x, f.z))

    def penetra_braco(malha=None):
        co_, tri_, (nomes_, dono_) = malha or _malha(bon)
        ck.posicoes_das_juntas(rig)
        med, _ = ck.corpo_x_corpo(co_, tri_, nomes_, dono_)
        return med.get("antebracoE×bracoE", 0.0), med.get("antebracoD×bracoD", 0.0)

    # ── 3) embaixo: a linha da barra (y) que deixa o antebraço em pé DE LADO com o cotovelo a ABRE° do tronco e a altura (z) que deixa a
    # barra a FOLGA_PEITO da pele já com os braços embaixo (e a mão a FOLGA_MAO do tronco), medida na malha posada ─────────────────
    def linha(abre, meia_, z, fi_alvo):
        off0 = {L: vao_menos_punho(L, *_orientacao(PUNHO + fi_alvo, s)) for L, s in LADOS}
        k = math.tan(math.radians(fi_alvo))

        def g_(y):
            tot = 0.0
            for L, s in LADOS:
                W = Vector((s * meia_, y, z)) - off0[L]
                Ec, _C, _a = _cotovelo(S[L], W, Lb, La, abre, cima, fora[L])
                tot += (W.y - Ec.y) - (W.z - Ec.z) * k
            return tot / 2
        lo, hi = S["Left"].y - 0.36, S["Left"].y - 0.02
        glo, ghi = g_(lo), g_(hi)
        if glo * ghi > 0:
            return (lo if abs(glo) < abs(ghi) else hi), False
        for _ in range(32):
            m = (lo + hi) / 2
            gm = g_(m)
            if gm * glo > 0:
                lo, glo = m, gm
            else:
                hi = m
        return (lo + hi) / 2, True

    def embaixo(abre, meia_, fi_alvo=None, voltas=6, imprime=False):
        fi_alvo = FI_BAIXO if fi_alvo is None else fi_alvo
        estado["abre"], estado["meia"] = abre, meia_
        z = dt.peito(bon, S["Left"].y - 0.15) + FOLGA_PEITO + RAIO
        y, achou = linha(abre, meia_, z, fi_alvo)
        for volta in range(voltas):
            maos_em(Vector((0.0, y, z)))
            malha = _malha(bon)
            folga, parte, _p = folga_barra(y, z, malha)
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

    def onde_encosta(y, z, malha):
        """Onde a barra chega mais perto da pele embaixo, ao longo do tronco: mm pros pés da articulação do ombro (no eixo do tronco) e
        mm pros pés da parte mais saliente do peitoral (perto da linha dos mamilos)."""
        co_, _, (nomes_, dono_) = malha
        folga, parte, P_ = folga_barra(y, z, malha)
        meio_ombros = (S["Left"] + S["Right"]) / 2
        T = co_[_grupo(nomes_, dono_, ("Spine", "Spine1", "Spine2"))]
        rel = T - np.array(meio_ombros)
        al = rel @ np.array(-cima)                                   # pros pés, ao longo do tronco
        fr = rel @ np.array(cima.cross(lado))                        # pra frente do tronco (pro teto/peito)
        f = (np.abs(np.abs(T[:, 0]) - 0.11) < 0.02) & (al > 0.0) & (al < 0.20)
        mam = T[f][np.argmax(fr[f])]                                 # o mais saliente do peitoral
        a_toque = (P_ - meio_ombros).dot(-cima)
        a_mam = (Vector(mam) - meio_ombros).dot(-cima)
        onde_encosta.barra = (Vector((0.0, y, z)) - meio_ombros).dot(-cima) * 1000   # o eixo da barra, ao longo do tronco
        return a_toque * 1000, (a_toque - a_mam) * 1000, parte, folga

    if SONDA:
        print("SONDA pegada × abertura do cotovelo (embaixo e no meio do caminho, com a barra em cima a z %.3f)" % SONDA_Z0, flush=True)
        for fator, abre, fi_alvo in SONDA_CASOS:
            meia_ = fator * (S["Left"].x - S["Right"].x) / 2
            y, z, fi, folga, parte, fc, malha = embaixo(abre, meia_, fi_alvo)
            jj = ck.posicoes(rig)
            pen = penetra_braco(malha)
            tq, tm, pt, fg = onde_encosta(y, z, malha)
            print("SONDA fator %.2f abre %2.0f fi %+.0f EMBAIXO | toque %.0f mm pros pés do ombro, %+.0f mm do mamilo (%s) | z %.4f | "
                  "antebraço %+.1f / %+.1f/%+.1f° | braço %.1f/%.1f antebraço %.1f/%.1f mão %.1f/%.1f | antebraço×braço %.1f/%.1f | "
                  "desvio %s | palma frente %s | abertura %s | cotovelo %s | pegada %.2f | barra→pele %.1f" % (
                      fator, abre, fi_alvo, tq, tm, pt, z, fi, lean_frontal("Left"), lean_frontal("Right"),
                      fc["braçoL"] * 1000, fc["braçoR"] * 1000, fc["antebraçoL"] * 1000, fc["antebraçoR"] * 1000,
                      fc["mãoL"] * 1000, fc["mãoR"] * 1000, pen[0], pen[1],
                      "/".join("%.0f" % v for v in tc.punho_desvio(jj)), "/".join("%.0f" % v for v in tc.palma_frente(jj)),
                      "/".join("%.0f" % v for v in tc.braco_abertura(jj)),
                      "/".join("%.0f" % v for v in (ck.medir_juntas(rig)["cotoveloE"], ck.medir_juntas(rig)["cotoveloD"])),
                      tc.pegada_largura(jj)[0], fg * 1000), flush=True)
            for tt in (0.5,):
                maos_em(Vector((0.0, p3.lerp((S["Left"].y + S["Right"].y) / 2, y, tt), p3.lerp(SONDA_Z0, z, tt))))
                malha = _malha(bon)
                jj = ck.posicoes(rig)
                pen = penetra_braco(malha)
                print("SONDA fator %.2f abre %2.0f fi %+.0f t=%.2f | antebraço × vertical %s (de frente %+.1f/%+.1f) | antebraço×braço "
                      "%.1f/%.1f | cotovelo %s | abertura %s" % (
                          fator, abre, fi_alvo, tt, "/".join("%.0f" % v for v in tc.antebraco_vertical(jj)),
                          lean_frontal("Left"), lean_frontal("Right"), pen[0], pen[1],
                          "/".join("%.0f" % v for v in (ck.medir_juntas(rig)["cotoveloE"], ck.medir_juntas(rig)["cotoveloD"])),
                          "/".join("%.0f" % v for v in tc.braco_abertura(jj))), flush=True)
        for abre, fi_alvo in SONDA_TORCAO_CASOS:
            meia_ = MEIA_FATOR * (S["Left"].x - S["Right"].x) / 2
            for f in SONDA_TORCOES:
                estado["torcao"] = f
                y, z, fi, folga, parte, fc, malha = embaixo(abre, meia_, fi_alvo)
                pen = penetra_braco(malha)
                jj = ck.posicoes(rig)
                print("SONDA torção abre %2.0f fi %+.0f fração na mão %.2f | pronação %.0f/%.0f° | antebraço×braço %.1f/%.1f mm | "
                      "desvio %s | flexão do punho %s" % (
                          abre, fi_alvo, f, maos.torcao.get("Left", 0), maos.torcao.get("Right", 0), pen[0], pen[1],
                          "/".join("%.0f" % v for v in tc.punho_desvio(jj)), "/".join("%.0f" % v for v in tc.punho_flexao(jj))),
                      flush=True)
            estado["torcao"] = TORCAO_MAO
        if SONDA == "so":
            raise RuntimeError("SONDA: fim (só a tabela)")

    Y0 = (S["Left"].y + S["Right"].y) / 2

    def cotovelo_medio():
        jj = ck.medir_juntas(rig)
        return (jj["cotoveloE"] + jj["cotoveloD"]) / 2

    def achar_topo(z_baixo):
        """Altura da barra em cima (na vertical dos ombros) com o cotovelo dobrado COTOVELO_CIMA° (bissecção)."""
        lo, hi = z_baixo + 0.15, z_baixo + 0.70
        for _ in range(16):
            meio = (lo + hi) / 2
            maos_em(Vector((0.0, Y0, meio)))
            if cotovelo_medio() > COTOVELO_CIMA and max(maos.erro.values()) < 0.002:
                lo = meio
            else:
                hi = meio
        return lo

    def meia_de_pe(abre, m0):
        """Meia pegada que deixa o antebraço em pé DE FRENTE embaixo (lean_frontal = 0) com o cotovelo a `abre`° do tronco."""
        estado["modo"] = "abre"

        def lean(m):
            embaixo(abre, m)
            return (lean_frontal("Left") + lean_frontal("Right")) / 2
        lo, hi = m0 * 0.90, m0 * 1.20
        flo = lean(lo)
        m, fm = lo, flo
        for _ in range(12):
            m = (lo + hi) / 2
            fm = lean(m)
            if abs(fm) < 0.25:
                break
            if fm * flo > 0:
                lo, flo = m, fm
            else:
                hi = m
        return m, fm

    if SONDA2:
        ombros = S["Left"].x - S["Right"].x
        for abre in SONDA2_ABRES:
            m, fm = meia_de_pe(abre, MEIA_FATOR * ombros / 2)
            print("SONDA2 abre %.0f | meia de pé %.4f (fator %.3f) | antebraço de frente %.2f°" % (abre, m, m / (ombros / 2), fm),
                  flush=True)
            for modo in ("abre", "baixo"):
                estado["modo"] = "abre"
                y1, z1, fi, folga, parte, fc, malha = embaixo(abre, m)
                tq, tm, pt, fg = onde_encosta(y1, z1, malha)
                estado["modo"] = modo
                z0 = achar_topo(z1)
                for tt in (0.0, 0.25, 0.5, 0.75, 1.0):
                    maos_em(Vector((0.0, p3.lerp(Y0, y1, tt), p3.lerp(z0, z1, tt))))
                    malha = _malha(bon)
                    jj = ck.posicoes(rig)
                    pen = penetra_braco(malha)
                    fc = folgas_corpo(malha)
                    print("SONDA2 abre %.0f %-5s t=%.2f | antebraço × vertical %s (de lado %+.1f/%+.1f, de frente %+.1f/%+.1f) | abertura %s | "
                          "elevação %s | cotovelo %s | antebraço×braço %.1f/%.1f | braço→tronco %.0f/%.0f mm | toque %.0f mm (%+.0f) | "
                          "barra z0 %.3f z1 %.3f" % (
                              abre, modo, tt, "/".join("%.0f" % v for v in tc.antebraco_vertical(jj)), maos_em.fi["Left"],
                              maos_em.fi["Right"], lean_frontal("Left"), lean_frontal("Right"),
                              "/".join("%.0f" % v for v in tc.braco_abertura(jj)), "/".join("%.0f" % v for v in tc.braco_elevacao(jj)),
                              "/".join("%.0f" % v for v in (ck.medir_juntas(rig)["cotoveloE"], ck.medir_juntas(rig)["cotoveloD"])),
                              pen[0], pen[1], fc["braçoL"] * 1000, fc["braçoR"] * 1000, tq, tm, z0, z1), flush=True)
        raise RuntimeError("SONDA2: fim")

    Y1, Z1, fi1, folga1, parte1, fc1, _m = embaixo(ABRE, meia, imprime=True)
    tq1, tm1, pt1, _fg = onde_encosta(Y1, Z1, _m)
    print("EMBAIXO | barra y %.4f z %.4f | eixo da barra a %.0f mm pros pés das articulações dos ombros, ao longo do tronco | "
          "ponto de pele mais perto a %.0f mm, %+.0f mm da parte mais saliente do peitoral (%s) | antebraço %.1f° de lado, %.1f/%.1f° de frente | barra → pele %.1f mm | braço %.1f/%.1f "
          "antebraço %.1f/%.1f mão %.1f/%.1f mm do tronco | antebraço×braço %.1f/%.1f mm | pronação %.0f/%.0f°, %.0f%% no osso da "
          "mão" % (Y1, Z1, onde_encosta.barra, tq1, tm1, pt1, fi1, lean_frontal("Left"), lean_frontal("Right"), folga1 * 1000,
                    fc1["braçoL"] * 1000, fc1["braçoR"] * 1000, fc1["antebraçoL"] * 1000, fc1["antebraçoR"] * 1000,
                    fc1["mãoL"] * 1000, fc1["mãoR"] * 1000, *penetra_braco(_m), maos.torcao.get("Left", 0),
                    maos.torcao.get("Right", 0), TORCAO_MAO * 100), flush=True)
    estado["abre"], estado["meia"] = ABRE, meia
    co_p, _, (nomes_p, dono_p) = _m
    M_ = co_p[_grupo(nomes_p, dono_p, ("Spine", "Spine1", "Spine2", "Neck", "LeftShoulder", "RightShoulder"))]
    meio_o = np.array((S["Left"] + S["Right"]) / 2)
    al_ = (M_ - meio_o) @ np.array(-cima)                          # pros pés, ao longo do tronco
    h_ = M_ @ np.array(n_b) - g["d"]                                # altura acima do topo do estofado
    for x0, nome in ((0.0, "meio (esterno)"), (0.10, "peitoral (x 0,10)")):
        f_ = np.abs(np.abs(M_[:, 0]) - x0) < 0.012
        perf = []
        for cm_ in range(-6, 32, 2):
            ff = f_ & (np.abs(al_ - cm_ / 100) < 0.006)
            perf.append("%d:%s" % (cm_, "%.0f" % (float(h_[ff].max()) * 1000) if ff.any() else "-"))
        print("PERFIL %s (cm pros pés do ombro, ao longo do tronco: altura da pele acima do estofado, mm): %s" % (nome, " ".join(perf)),
              flush=True)

    # ── 4) em cima: a barra na VERTICAL das articulações dos ombros (o braço perpendicular ao chão), subindo até o cotovelo ficar
    # dobrado COTOVELO_CIMA° ──────────────────────────────────────────────────────────────────────────────────────────────────────
    estado["modo"] = COTOVELO
    Z0 = achar_topo(Z1)
    maos_em(Vector((0.0, Y0, Z0)))
    jj = ck.posicoes(rig)
    braco_vert = [math.degrees((cab(L + "ForeArm") - cab(L + "Arm")).angle(Vector((0, 0, 1)))) for L, _ in LADOS]
    print("EM CIMA | barra y %.4f z %.4f (%.0f mm acima do ombro) | cotovelo %.1f° | braço × vertical do mundo %.1f/%.1f° | braço × "
          "tronco (elevação) %s | antebraço %.1f/%.1f° da vertical de lado, %.1f/%.1f° de frente | vão da mão %.1f/%.1f mm" % (
              Y0, Z0, (Z0 - S["Left"].z) * 1000, cotovelo_medio(), *braco_vert,
              "/".join("%.0f" % v for v in tc.braco_elevacao(jj)), maos_em.fi["Left"], maos_em.fi["Right"],
              lean_frontal("Left"), lean_frontal("Right"), maos.erro["Left"] * 1000, maos.erro["Right"] * 1000), flush=True)
    print("LINHA | em cima z %.3f, embaixo z %.3f: desce %.0f mm e anda %.0f mm pros pés (o caminho tem %.0f mm, %.1f° da vertical)" % (
        Z0, Z1, (Z0 - Z1) * 1000, (Y0 - Y1) * 1000, math.hypot(Z0 - Z1, Y0 - Y1) * 1000,
        math.degrees(math.atan2(Y0 - Y1, Z0 - Z1))), flush=True)

    # ── 5) a barra ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
    barra = e3.barra("barra", comprimento=2.0, raio_anilha=R_ANILHA, pegada=PEGADA_TRAVAS)
    _tampas_em_leque(barra)
    e3._em_aneis([o for o in barra.children if o.name == "barra_eixo"][0])   # só a malha do eixo de 2 m em anéis (a forma não muda):
                                                                             # cada triângulo de 2 m virava ~30 mil pontos na checagem

    def bracos(t):
        """Barra no quadro t (linha reta de cima, na vertical dos ombros, até embaixo, na parte de baixo do peito) e as 2 mãos nela."""
        centro = Vector((0.0, p3.lerp(Y0, Y1, t), p3.lerp(Z0, Z1, t)))
        barra.location = centro
        p3.atualizar()
        return maos_em(centro)

    def polegar_na_barra(lado, c_, malha=None):
        co_, _, (nomes_, dono_) = malha or _malha(bon)
        P_ = co_[_grupo(nomes_, dono_, tuple(lado + "HandThumb%d" % i for i in (1, 2, 3)))]
        return float((np.hypot(P_[:, 1] - c_.y, P_[:, 2] - c_.z) - RAIO).min())

    # ── 6) polegar NOVO dando a volta na barra, FIXO em todos os quadros (a postura sai da própria busca, em cima e embaixo, medida em
    # cima, no meio e embaixo — o jeito do Supino Fechado com Barra) ─────────────────────────────────────────────────────────────
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
        """t=0 braços quase esticados em cima (barra na vertical dos ombros), t=1 barra embaixo, encostando de leve na parte de baixo
        do peito."""
        t0 = time.time()
        bracos(t)
        for L, _ in LADOS:
            for n, M in DEDOS[L].items():
                PB[n].matrix_basis = M.copy()
        p3.atualizar()
        pose.t = t
        print("TEMPO pose t=%.3f: mãos %.1f s, total %.1f s" % (t, maos_em.tempo, time.time() - t0), flush=True)

    pose.dedos = dedos_info
    pose.t = 0.0

    def maos_na_barra(malha=None):
        co_, _, (nomes_, dono_) = malha or _malha(bon)
        b = barra.matrix_world.to_translation()
        out = []
        for L, s in LADOS:
            H = co_[np.array([n.startswith(L + "Hand") for n in nomes_] + [False])[dono_]]
            out.append((PEGADA_TRAVAS / 2 - float((s * H[:, 0]).max()),
                        float((np.hypot(H[:, 1] - b.y, H[:, 2] - b.z) - RAIO).min())))
        return out

    tronco0 = {n: cab(n).copy() for n in ("Hips", "Spine2", "Head", "LeftFoot", "RightFoot")}

    def info():
        t0 = time.time()
        txt = _info()
        print("TEMPO info %.1f s" % (time.time() - t0), flush=True)
        return txt

    def _info():
        jj = ck.posicoes(rig)
        juntas = ck.medir_juntas(rig)
        b = barra.matrix_world.to_translation()
        malha = _malha(bon, 0)
        folga, parte, _p = folga_barra(b.y, b.z, malha)
        fc = folgas_corpo(malha)
        mnb = maos_na_barra(malha)
        anilha = min(float(ck._avaliar_simples(o)[0][:, 2].min()) for o in ck._malhas(barra) if "anilha" in o.name)
        tq, tm, _pt, _fg = onde_encosta(b.y, b.z, malha)
        braco_vert = [math.degrees((cab(L + "ForeArm") - cab(L + "Arm")).angle(Vector((0, 0, 1)))) for L, _ in LADOS]
        cot_banco = [float((cab(L + "ForeArm") - E).dot(n_b)) * 1000 for L, _ in LADOS]      # cotovelo × plano do estofado
        anda = max((cab(n) - p).length for n, p in tronco0.items()) * 1000

        def pol(lado):
            v = pose.dedos.get(lado, {}).get("Thumb", ())
            pp = pg.pele_do_polegar(bon, lado)
            return "%s, pele da base %.2f× e %d triângulo(s) do avesso, polegar → barra %+.1f mm" % (
                v[0] if isinstance(v, tuple) and v else v, pp["alonga_max"], pp["viradas"], polegar_na_barra(lado, b, malha) * 1000)
        return ("barra y %.4f (%.0f mm pros pés do ombro, no chão; %.0f mm ao longo do tronco) z %.3f | barra → pele %.1f mm (%s; o ponto "
                "mais perto a %.0f mm pros pés do ombro no tronco, %+.0f mm do mamilo) | braço depois da axila → tronco %.1f/%.1f mm | antebraço → tronco %.1f/%.1f mm | "
                "mão → tronco %.1f/%.1f mm | mão × mão %.0f mm | cotovelo %.0f/%.0f°, %.0f/%.0f mm do plano do estofado | braço × vertical "
                "%.0f/%.0f° | abertura %s° | elevação %s° | antebraço × vertical %s° (de frente %.0f/%.0f°) | punho %.0f/%.0f° (flexão %s, "
                "desvio %s) | palma: frente %s°, dentro %s° | pegada %.2f | escápula %s mm | tronco %.1f° | coluna %.1f° | cabeça %.1f° | "
                "quadril %.0f/%.0f° joelho %.0f/%.0f° tornozelo %s | tronco/pés andaram %.2f mm | mão → trava %s mm, mão mais funda na "
                "barra %s mm | anilha mais baixa z %.3f | polegar E %s | D %s | %s" % (
                    b.y, (S["Left"].y - b.y) * 1000, onde_encosta.barra, b.z, folga * 1000, parte, tq, tm, fc["braçoL"] * 1000, fc["braçoR"] * 1000,
                    fc["antebraçoL"] * 1000, fc["antebraçoR"] * 1000, fc["mãoL"] * 1000, fc["mãoR"] * 1000, fc["mão×mão"] * 1000,
                    juntas["cotoveloE"], juntas["cotoveloD"], *cot_banco, *braco_vert,
                    "/".join("%.0f" % v for v in tc.braco_abertura(jj)), "/".join("%.0f" % v for v in tc.braco_elevacao(jj)),
                    "/".join("%.0f" % v for v in tc.antebraco_vertical(jj)), lean_frontal("Left"), lean_frontal("Right"),
                    juntas["punhoE"], juntas["punhoD"], "/".join("%.0f" % v for v in tc.punho_flexao(jj)),
                    "/".join("%.0f" % v for v in tc.punho_desvio(jj)), "/".join("%.0f" % v for v in tc.palma_frente(jj)),
                    "/".join("%.0f" % v for v in tc.palma_dentro(jj)), tc.pegada_largura(jj)[0],
                    "/".join("%.0f" % v for v in tc.escapula_frente(jj)), ck.angulo_chave(rig, {"medida": "tronco"})[0],
                    tc.coluna(jj)[0], tc.cabeca_tronco(jj)[0], juntas["quadrilE"], juntas["quadrilD"], juntas["joelhoE"],
                    juntas["joelhoD"], "/".join("%.0f" % v for v in tc.tornozelo(jj)), anda,
                    "/".join("%.0f" % (v[0] * 1000) for v in mnb), "/".join("%+.1f" % (v[1] * 1000) for v in mnb), anilha,
                    pol("Left"), pol("Right"), maos.info()))

    for t in (0.0, 0.25, 0.5, 0.75, 1.0):
        pose(t)
        print("t=%.2f | %s" % (t, info()), flush=True)
    pose(0.0)

    bk = ck.Barra(barra, raio=RAIO, meio_compr=PEGADA_TRAVAS / 2)
    # a barra e a estrutura do banco (com os postes) são EQUIPAMENTO: a checagem cobra 3 mm de folga delas até o corpo em todo quadro
    # (encostar "de leve" embaixo = FOLGA_PEITO); os estofados, as almofadas dos joelhos e os rolos são APOIO
    return Cena(pose, [barra] + banco.equipamentos, pegadas=[("Left", bk), ("Right", bk)], apoio_mm=0.0,
                foco_luz=(0, (Y0 + Y1) / 2, 0.55), camera_video=((3.2, -1.9, 1.5), (0, (Y0 + Y1) / 2 - 0.1, 0.55), 45), info=info,
                apoios=banco.apoios, afunda_apoio_mm=20)
