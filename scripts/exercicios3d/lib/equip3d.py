# Equipamentos simples em 3D (barra, anilha, halter, máquina) com materiais neutros.
import bpy, math
from mathutils import Vector, Matrix
import boneco3d as b3

ACO = (0.62, 0.63, 0.65, 1)
BORRACHA = (0.035, 0.035, 0.04, 1)
ESTOFADO = (0.06, 0.065, 0.075, 1)
ESTRUTURA = (0.16, 0.17, 0.19, 1)


def mat_aco():
    return b3.material_liso("Aco", ACO, rug=0.3, metal=1.0)


def mat_borracha():
    return b3.material_liso("Borracha", BORRACHA, rug=0.65)


def mat_estofado():
    return b3.material_liso("Estofado", ESTOFADO, rug=0.55)


def mat_estrutura():
    return b3.material_liso("Estrutura", ESTRUTURA, rug=0.4, metal=0.6)


def _cilindro(nome, raio, compr, loc, rot, mat, vertices=32, pai=None):
    bpy.ops.mesh.primitive_cylinder_add(radius=raio, depth=compr, location=loc, rotation=rot, vertices=vertices)
    o = bpy.context.active_object
    o.name = nome
    bpy.ops.object.shade_smooth()
    o.data.materials.append(mat)
    if pai is not None:
        o.parent = pai
    return o


def caixa(nome, centro, tamanho, mat, rot=(0, 0, 0), pai=None, chanfro=0.01):
    bpy.ops.mesh.primitive_cube_add(size=1, location=centro, rotation=rot)
    o = bpy.context.active_object
    o.name = nome
    o.scale = tamanho
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if chanfro:
        m = o.modifiers.new("chanfro", "BEVEL")
        m.width = chanfro
        m.segments = 3
    bpy.ops.object.shade_smooth()
    o.data.materials.append(mat)
    if pai is not None:
        o.parent = pai
    return o


def tubo(nome, a, b, raio, mat, pai=None, vertices=24):
    """Cilindro de a até b."""
    a, b = Vector(a), Vector(b)
    d = b - a
    rot = d.to_track_quat("Z", "Y").to_euler()
    return _cilindro(nome, raio, d.length, (a + b) / 2, rot, mat, vertices, pai)


def barra(nome="barra", comprimento=2.0, raio_anilha=0.2, larg_anilha=0.05, pegada=1.32):
    """Barra olímpica ao longo do X, centrada na origem do vazio devolvido (mover o vazio move tudo)."""
    raiz = bpy.data.objects.new(nome, None)
    bpy.context.scene.collection.objects.link(raiz)
    rot = (0, math.radians(90), 0)
    _cilindro(nome + "_eixo", 0.0145, comprimento, (0, 0, 0), rot, mat_aco(), pai=raiz)
    for s in (-1, 1):
        x = s * (pegada / 2 + 0.03 + larg_anilha / 2)
        _cilindro(nome + "_anilha%+d" % s, raio_anilha, larg_anilha, (x, 0, 0), rot, mat_borracha(), vertices=48, pai=raiz)
        _cilindro(nome + "_miolo%+d" % s, 0.03, larg_anilha + 0.012, (x, 0, 0), rot, mat_aco(), pai=raiz)
        _cilindro(nome + "_trava%+d" % s, 0.026, 0.03, (s * (pegada / 2 + 0.012), 0, 0), rot, mat_aco(), pai=raiz)
    return raiz


def halter(nome="halter", pegada=0.13, raio=0.016, raio_anilha=0.07, larg_anilha=0.05):
    """Halter ao longo do X, pegada no meio, centrado na origem do vazio devolvido (lotes de 04/10/2026)."""
    raiz = bpy.data.objects.new(nome, None)
    bpy.context.scene.collection.objects.link(raiz)
    rot = (0, math.radians(90), 0)
    _cilindro(nome + "_eixo", raio, pegada + 2 * larg_anilha + 0.02, (0, 0, 0), rot, mat_aco(), pai=raiz)
    for s in (-1, 1):
        x = s * (pegada / 2 + larg_anilha / 2)
        _cilindro(nome + "_anilha%+d" % s, raio_anilha, larg_anilha, (x, 0, 0), rot, mat_borracha(), vertices=40,
                  pai=raiz)
    return raiz


def banco(nome="banco", y0=-0.34, y1=0.86, topo=0.44, largura=0.30, espessura=0.06):
    """Banco reto ao longo do Y (de y0 a y1, cabeça pra +Y), estofado com o topo em `topo` m e estrutura embaixo:
    viga central, 2 colunas e 2 pés no chão (supinos, elevação pélvica — lotes de 04/10/2026)."""
    raiz = bpy.data.objects.new(nome, None)
    bpy.context.scene.collection.objects.link(raiz)
    meio, compr = (y0 + y1) / 2, y1 - y0
    caixa(nome + "_estofado", (0, meio, topo - espessura / 2), (largura, compr, espessura), mat_estofado(),
          pai=raiz, chanfro=0.015)
    base = topo - espessura                                   # embaixo do estofado
    caixa(nome + "_viga", (0, meio, base - 0.025), (0.08, compr - 0.16, 0.05), mat_estrutura(), pai=raiz)
    for y in (y0 + 0.10, y1 - 0.10):
        caixa(nome + "_coluna", (0, y, (base - 0.05) / 2 + 0.02), (0.06, 0.06, base - 0.09), mat_estrutura(),
              pai=raiz)
        caixa(nome + "_pe", (0, y, 0.02), (largura + 0.10, 0.07, 0.04), mat_estrutura(), pai=raiz)
    return raiz


def banco_inclinado(nome="banco", angulo=30, assento=0.44, junta_y=0.0, encosto=0.95, largura=0.28, espessura=0.06):
    """Banco inclinado (supino inclinado, 04/10/2026): assento reto com o topo em `assento` m, à frente (−Y) da junta,
    e encosto subindo pra +Y a `angulo` graus da horizontal a partir da junta (topo do estofado passa pela junta)."""
    raiz = bpy.data.objects.new(nome, None)
    bpy.context.scene.collection.objects.link(raiz)
    a = math.radians(angulo)
    u = Vector((0, math.cos(a), math.sin(a)))                 # ao longo do encosto, pra cima
    n = Vector((0, -math.sin(a), math.cos(a)))                # normal do encosto (pro lado do corpo)
    junta = Vector((0, junta_y, assento))
    caixa(nome + "_assento", (0, junta_y - 0.17, assento - espessura / 2), (largura + 0.02, 0.34, espessura),
          mat_estofado(), pai=raiz, chanfro=0.015)
    caixa(nome + "_encosto", junta + u * (encosto / 2) - n * (espessura / 2), (largura, encosto, espessura),
          mat_estofado(), rot=(a, 0, 0), pai=raiz, chanfro=0.015)
    meio_enc = junta + u * (encosto * 0.55) - n * espessura   # embaixo do meio do encosto
    caixa(nome + "_coluna_encosto", (0, meio_enc.y, (meio_enc.z + 0.04) / 2), (0.06, 0.06, meio_enc.z - 0.04),
          mat_estrutura(), pai=raiz)
    caixa(nome + "_coluna_assento", (0, junta_y - 0.17, (assento - espessura + 0.04) / 2),
          (0.06, 0.06, assento - espessura - 0.04), mat_estrutura(), pai=raiz)
    y0, y1 = junta_y - 0.30, meio_enc.y + 0.10
    caixa(nome + "_base", (0, (y0 + y1) / 2, 0.03), (0.08, y1 - y0, 0.04), mat_estrutura(), pai=raiz)
    for y in (y0 + 0.035, y1 - 0.035):
        caixa(nome + "_pe", (0, y, 0.02), (largura + 0.12, 0.07, 0.04), mat_estrutura(), pai=raiz)
    return raiz


def barra_fixa(nome="barra_fixa", altura=2.3, meia=0.75, raio=0.016, recuo=0.45, lado=0.06):
    """Barra fixa (lote 2, 05/10/2026): barra de aço ao longo do X com o eixo na origem do vazio devolvido, a `altura` m
    do chão (mover o vazio move tudo). As pontas da barra entram em 2 braços horizontais que vêm de 2 colunas plantadas
    `recuo` m à frente dela (−Y: quem pendura fica de frente pras colunas, como na barra de parede), por fora das pontas
    (x = ±(meia + lado/2)); tubo quadrado de `lado` m, pé comprido no chão ao longo do Y e uma travessa baixa ligando as
    colunas. Nada passa no meio, onde o corpo sobe e desce, nem atrás dele. Barra de 32 mm (raio 0,016): a medida comum
    de barra fixa, 1,25" (TITAN Series 1.25" Single Pull-Up Bar: "Overall Diameter 1.25-in.")."""
    raiz = bpy.data.objects.new(nome, None)
    bpy.context.scene.collection.objects.link(raiz)
    xc = meia + lado / 2
    # tudo em anéis (_em_aneis, como nas paralelas): a forma é a mesma, mas a checagem não espalha milhares de pontos
    # em triângulos de 1,5–2 m — o chanfro das caixas só pega as quinas (limite por ângulo), não os cortes
    _em_aneis(_cilindro(nome + "_barra", raio, 2 * xc, (0, 0, 0), (0, math.radians(90), 0), mat_aco(), pai=raiz))
    for s in (-1, 1):
        _em_aneis(caixa(nome + "_braco%+d" % s, (s * xc, -recuo / 2, 0), (lado, recuo + lado, lado), mat_estrutura(),
                        pai=raiz))
        _em_aneis(caixa(nome + "_coluna%+d" % s, (s * xc, -recuo, (lado / 2 - altura) / 2), (lado, lado, altura + lado / 2),
                        mat_estrutura(), pai=raiz))
        _em_aneis(caixa(nome + "_pe%+d" % s, (s * xc, -recuo, 0.02 - altura), (lado + 0.02, 0.80, 0.04), mat_estrutura(),
                        pai=raiz))
    _em_aneis(caixa(nome + "_travessa", (0, -recuo, 0.10 - altura), (2 * xc, lado, lado), mat_estrutura(), pai=raiz))
    return raiz


def _em_aneis(o, passo=0.04):
    """Corta o tubo em anéis a cada `passo` m ao longo dele (só a malha; a forma não muda). A checagem espalha pontos na
    superfície do equipamento triângulo por triângulo (grade de 8 mm nos 2 lados que saem do 1º vértice): um triângulo
    comprido e fino de um tubo de 1,5 m vira ~17 mil pontos, e as paralelas levavam 73 s por quadro só nisso. Em anéis
    os triângulos ficam curtos e a mesma superfície sai com poucos milhares de pontos."""
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(o.data)
    longas = [e for e in bm.edges if e.calc_length() > 1.5 * passo]
    if longas:
        cortes = int(math.ceil(max(e.calc_length() for e in longas) / passo)) - 1
        bmesh.ops.subdivide_edges(bm, edges=longas, cuts=cortes, use_grid_fill=True)
    bm.to_mesh(o.data)
    bm.free()
    o.data.update()
    return o


def paralelas(nome="paralelas", largura=0.50, altura=1.10, comprimento=1.40, raio=0.019, y0=0.0, raio_coluna=0.025,
              sobra=0.04):
    """Paralelas de mergulho (Mergulho nas Paralelas, lote 2, 05/10/2026): 2 barras de aço redondas ao longo do Y, com os
    eixos em x = ±largura/2 e na altura `altura` (eixo da barra), cada uma em cima de 2 colunas (uma em cada ponta, em
    y0 ± comprimento/2, a barra passando `sobra` m de cada uma) chumbadas no chão por uma sapata. Entre as barras e
    entre as colunas fica livre: o corpo desce no meio e as pernas passam por dentro. Medidas de academia: barra de
    38 mm (Lacertosus Training Dip Station: "Overlarge handle diameter of 38 mm") e 50 cm entre os eixos (FIG Apparatus
    Norms 2023, MAG 5 Parallel Bars: "Distance between bars from 42 cm to 52 cm"; Lacertosus: "The distance between
    the handles' axes at the narrowest and widest points measures 52 and 62 cm"). Devolve a raiz (mover a raiz move
    tudo) e as 2 barras [+X, −X]: o eixo local Z de cada barra é o eixo dela (pegada: checagem3d.Barra(barra, raio,
    meio_compr, eixo=(0, 0, 1)))."""
    raiz = bpy.data.objects.new(nome, None)
    bpy.context.scene.collection.objects.link(raiz)
    ya, yb = y0 - comprimento / 2, y0 + comprimento / 2
    barras = []
    for s in (1, -1):
        x = s * largura / 2
        barras.append(_em_aneis(tubo(nome + "_barra%+d" % s, (x, ya - sobra, altura), (x, yb + sobra, altura), raio,
                                     mat_aco(), pai=raiz, vertices=32)))
        for k, y in enumerate((ya, yb)):
            _em_aneis(tubo(nome + "_coluna%+d%s" % (s, "ft"[k]), (x, y, 0.012), (x, y, altura), raio_coluna,
                           mat_estrutura(), pai=raiz))
            caixa(nome + "_sapata%+d%s" % (s, "ft"[k]), (x, y, 0.006), (0.12, 0.12, 0.012), mat_estrutura(), pai=raiz,
                  chanfro=0.003)
    return raiz, barras


def banco_hiperextensao(nome="banco_hiper", origem=(0, 0, 1.0), angulo=45, estofado=(-0.44, -0.14, 0.12, 0.075, 0.40),
                        rolos=(-0.80, -0.09, 0.05, 0.14, 0.12), plataforma=(-0.93, -0.07, 0.25, 0.015, 0.46),
                        viga=0.27, frente=-0.30, tubo=0.06, alto=None, travessa=None):
    """Banco de hiperextensão a 45° (Hiperextensão Lombar, lote 3, 05/10/2026), o modelo de academia em que o corpo fica
    inclinado `angulo` graus do chão (Technogym "Pure Strength 45 Degree Hyperextension Bench" PG05, o banco do estudo de
    Andersen et al., J Sports Sci Med 2021; Body-Solid GHYP345, "exact 45° angle"): 2 estofados das coxas lado a lado, 2
    rolos acolchoados que prendem a parte de trás dos tornozelos, plataforma dos pés (2 chapas, uma de cada lado da haste
    dos rolos) e a estrutura em tubo quadrado (viga inclinada embaixo dos estofados, coluna da frente, pé de trás, base no
    chão, travessa dos estofados e haste dos rolos, que sobe entre os pés).
    Medidas no referencial do corpo, em m: `origem` = um ponto da linha do corpo (a articulação do quadril), s = ao longo
    do corpo pra cabeça (sobe `angulo` graus pra −Y), d = pra frente do corpo (o lado do peito: desce pra −Y), x = de lado.
      estofado = (s_baixo, s_cima, d_topo, espessura, largura): topo dos estofados no plano d = d_topo (onde a pele das
                 coxas encosta), de s_baixo até a borda de cima s_cima;
      rolos = (s, d_eixo, raio, comprimento, x): eixo dos 2 rolos (ao longo de X) em (s, d_eixo), centrados em ±x;
      plataforma = (s_topo, d0, d1, espessura, largura): topo das chapas no plano s = s_topo (onde a sola encosta), de d0
                   a d1;
      viga = d do eixo da viga; frente = s onde a coluna da frente encontra a viga; alto = s da ponta de cima da viga
      (padrão: 5 cm antes da borda de cima do estofado); travessa = s da travessa embaixo dos estofados (padrão: o meio
      deles) — embaixo, com o tronco dobrado, os braços cruzados passam perto da estrutura atrás do estofado.
    Devolve 4 raízes, cada uma um equipamento da cena: "estofado", "rolos" e "plataforma" são APOIO do corpo (encostar é o
    certo) e a "estrutura" não pode encostar nele. Tubos compridos em anéis (_em_aneis): a checagem fica rápida."""
    th = math.radians(90 - angulo)                            # inclinação do corpo a partir da vertical
    u = Vector((0, -math.sin(th), math.cos(th)))              # ao longo do corpo, pra cabeça
    d = Vector((0, -math.cos(th), -math.sin(th)))             # pra frente do corpo (pro chão, na frente)
    O = Vector(origem)
    rot_u = (math.pi / 2 + th, 0, 0)                          # caixa com o Y local ao longo de u e o Z local em d
    rot_s = (th, 0, 0)                                        # caixa com o Z local ao longo de u (Y local em −d)

    def P(s, dd, x=0.0):
        return O + u * s + d * dd + Vector((x, 0, 0))

    def raiz_nova(sufixo):
        r = bpy.data.objects.new(nome + "_" + sufixo, None)
        bpy.context.scene.collection.objects.link(r)
        return r

    est, rol, pla, estr = (raiz_nova(n) for n in ("estofado", "rolos", "plataforma", "estrutura"))
    # estofados das coxas: 2 almofadas lado a lado (uma embaixo de cada coxa), vão de 4 cm no meio
    s0, s1, d_topo, esp, larg = estofado
    meia = (larg - 0.04) / 2
    for k in (-1, 1):
        caixa(nome + "_estofado%+d" % k, P((s0 + s1) / 2, d_topo + esp / 2, k * (0.02 + meia / 2)), (meia, s1 - s0, esp),
              mat_estofado(), rot=rot_u, pai=est, chanfro=0.018)
    # rolos dos tornozelos (espuma) num eixo de aço que passa pela haste do meio
    s_r, d_r, raio, compr, x_r = rolos
    for k in (-1, 1):
        _cilindro(nome + "_rolo%+d" % k, raio, compr, P(s_r, d_r, k * x_r), (0, math.radians(90), 0), mat_estofado(),
                  vertices=32, pai=rol)
    # plataforma dos pés: 2 chapas, uma de cada lado da haste dos rolos
    s_p, d0, d1, esp_p, larg_p = plataforma
    meia_p = (larg_p - tubo - 0.02) / 2
    for k in (-1, 1):
        caixa(nome + "_chapa%+d" % k, P(s_p - esp_p / 2, (d0 + d1) / 2, k * (tubo / 2 + 0.01 + meia_p / 2)),
              (meia_p, d1 - d0, esp_p), mat_aco(), rot=rot_s, pai=pla, chanfro=0.003)
    # estrutura: viga inclinada embaixo dos estofados, da plataforma até perto da borda de cima
    s_baixo, s_alto = s_p - 0.07, (s1 - 0.05 if alto is None else alto)
    _em_aneis(caixa(nome + "_viga", P((s_baixo + s_alto) / 2, viga), (tubo, s_alto - s_baixo, tubo * 4 / 3), mat_estrutura(),
                    rot=rot_u, pai=estr, chanfro=0.006))
    # travessa embaixo dos estofados + poste até a viga
    d_trav = d_topo + esp + 0.025
    s_trav = (s0 + s1) / 2 if travessa is None else travessa
    _em_aneis(caixa(nome + "_travessa", P(s_trav, d_trav), (larg - 0.06, 0.05, 0.05), mat_estrutura(), rot=rot_u,
                    pai=estr, chanfro=0.005))
    caixa(nome + "_poste_estofado", P(s_trav, (d_trav + viga) / 2), (0.05, 0.05, viga - d_trav), mat_estrutura(),
          rot=rot_u, pai=estr, chanfro=0.005)
    # haste dos rolos: sai da viga e sobe entre os pés até o eixo dos rolos; eixo de aço de um rolo ao outro
    _em_aneis(caixa(nome + "_haste_rolos", P(s_r, (viga + d_r) / 2), (0.05, 0.05, viga - d_r + 0.03), mat_estrutura(),
                    rot=rot_u, pai=estr, chanfro=0.005))
    _em_aneis(_cilindro(nome + "_eixo_rolos", 0.012, 2 * x_r + compr - 0.02, P(s_r, d_r), (0, math.radians(90), 0), mat_aco(),
                        pai=estr))
    # coluna da frente (vertical, do chão até a viga) e pé de trás (da ponta de baixo da viga ao chão), base no chão
    topo_f, ponta = P(frente, viga), P(s_baixo + 0.04, viga)
    _em_aneis(caixa(nome + "_coluna", (0, topo_f.y, (topo_f.z + 0.04) / 2), (tubo, tubo, topo_f.z - 0.04), mat_estrutura(),
                    pai=estr, chanfro=0.006))
    caixa(nome + "_pe_tras", (0, ponta.y, (ponta.z + 0.04) / 2), (tubo, tubo, max(ponta.z - 0.04, 0.02)), mat_estrutura(),
          pai=estr, chanfro=0.006)
    y0, y1 = topo_f.y - 0.06, ponta.y + 0.06
    _em_aneis(caixa(nome + "_base", (0, (y0 + y1) / 2, 0.025), (tubo, y1 - y0, 0.05), mat_estrutura(), pai=estr,
                    chanfro=0.005))
    for y in (topo_f.y, ponta.y):
        _em_aneis(caixa(nome + "_pe", (0, y, 0.02), (0.56, 0.07, 0.04), mat_estrutura(), pai=estr, chanfro=0.005))
    return {"estofado": est, "rolos": rol, "plataforma": pla, "estrutura": estr}


# ── POLIA: estação de cabo (Tríceps Testa na Polia, lote 3, 05/10/2026) ───────────────────────────────────────────────────
# Coluna única com a caixa da pilha de pesos (a pilha fica parada: o app não mostra a carga), um trilho na frente dela e
# um carrinho no trilho com a roldana na altura pedida (baixa ~0,1–0,4 m; alta ~2,0–2,2 m). O cabo desce pelo trilho
# (pedaço parado), dá a volta por baixo da roldana e sai em linha reta até o engate do acessório — esse pedaço é UM
# objeto, raiz própria "<nome>_cabo", com a origem no eixo da roldana, que GIRA e ESTICA (escala no Z local) a cada
# quadro; ele leva a marca "anima_escala", que o exportar_exercicio.py usa pra gravar a escala SÓ nele.
# Uso numa cena (acessório: barra_polia hoje; corda, puxador e barra W entram como funções novas do mesmo jeito — origem
# no eixo da pegada, engate no +Y local a `engate` m dela):
#   pol = e3.polia("polia", y=1.42, altura=0.25)            # roldana baixa, de frente pra −Y
#   barra = e3.barra_polia("barra_polia")
#   no pose(t): u = pol.direcao(c)                            # c = eixo da pegada no quadro; o gancho gira livre e se
#               e3.por_acessorio(barra, c, eixo, u)           # alinha com o cabo
#               pol.ligar(c + u * e3.ENGATE_BARRA_POLIA)     # cabo da saída da roldana até o engate
#   Cena(pose, [barra] + pol.raizes, ...)
# Medidas (escolha da fábrica, de estação comum): cabo passando a 45 mm do eixo da roldana (roldana de ~10,5 cm), cabo de
# aço de 6 mm, coluna de 2,15 m. Peças compridas em anéis (_em_aneis): a checagem fica rápida.
ENGATE_BARRA_POLIA = 0.13          # do eixo da barra até onde o cabo começa (dentro da bola de borracha do cabo)
CARENAGEM = (0.10, 0.105, 0.115, 1)


def mat_carenagem():
    return b3.material_liso("Carenagem", CARENAGEM, rug=0.5, metal=0.3)


class Polia:
    """Estação de cabo pronta na cena (polia()). raizes = [torre (parada), cabo (gira e estica)]: as duas entram em
    Cena.equipamentos junto com o acessório. O cabo desce pelo lado da torre e dá a volta por baixo da roldana."""

    def __init__(self, torre, cabo, centro, raio, frente):
        self.torre, self.cabo = torre, cabo
        self.raizes = [torre, cabo]
        self.centro = Vector(centro)          # eixo da roldana (mundo)
        self.raio = raio                      # eixo da roldana → eixo do cabo no canal
        self.frente = Vector(frente)
        self.saida = None                     # onde o cabo deixa a roldana no último ligar()
        self.comprimento = 0.0                # comprimento do cabo reto no último ligar() (m)

    def tangente(self, p):
        """Saída do cabo (ponto da roldana onde ele fica tangente), direção do cabo (da saída pra p) e a normal
        (eixo da roldana → saída), no plano vertical que passa pelo eixo da roldana e por p."""
        cima = Vector((0.0, 0.0, 1.0))
        v = Vector(p) - self.centro
        f = Vector((v.x, v.y, 0.0))
        f = f.normalized() if f.length > 1e-6 else self.frente.copy()
        vf, vc = v.dot(f), v.dot(cima)
        dist = math.hypot(vf, vc)
        if dist <= self.raio * 1.01:
            raise ValueError("polia: ponto %s dentro da roldana" % (tuple(p),))
        a = math.atan2(vc, vf) + math.asin(self.raio / dist)
        d = f * math.cos(a) + cima * math.sin(a)
        n = f * math.sin(a) - cima * math.cos(a)
        return self.centro + n * self.raio, d, n

    def direcao(self, p):
        """Direção (mundo, unitária) de p pra saída da roldana: por onde passa o cabo que chega em p. O gancho do
        acessório gira livre em volta da pegada e se alinha com ela (o eixo da pegada fica na linha do cabo)."""
        return -self.tangente(p)[1]

    def ligar(self, engate):
        """Cabo reto da saída da roldana até `engate` (mundo): gira e estica o objeto do cabo. Chamar a cada quadro,
        depois de pôr o acessório. Devolve o comprimento do cabo reto (m)."""
        T, d, n = self.tangente(engate)
        L = (Vector(engate) - T).length
        R = Matrix((n.cross(d), n, d)).transposed()          # colunas: X = eixo da roldana, Y = pra saída, Z = cabo
        self.cabo.matrix_world = Matrix.Translation(self.centro) @ R.to_4x4() @ Matrix.Diagonal((1.0, 1.0, L, 1.0))
        self.saida, self.comprimento = T, L
        return L


def polia(nome="polia", x=0.0, y=1.45, altura=0.25, frente=(0, -1, 0), raio=0.045, raio_cabo=0.003, alto=2.15,
          gira=False):
    """Estação de cabo de coluna única (ver o bloco acima): roldana com o eixo em (x, y, altura), virada pra `frente`
    (horizontal; padrão −Y), o cabo passando a `raio` m do eixo dela; trilho, carrinho, caixa da pilha de pesos e base
    ficam atrás da roldana. Devolve um Polia (raizes, direcao(), ligar()).
    gira=True (lote 3, 06/10/2026): o carrinho tem o garfo que gira (cabo saindo de lado ou na diagonal) — devolve uma
    PoliaGiratoria (ver o bloco dela, no fim do arquivo); sem isso, nada muda."""
    f = Vector(frente)
    f = Vector((f.x, f.y, 0.0)).normalized()
    cima = Vector((0.0, 0.0, 1.0))
    s = cima.cross(f)                                         # de lado (o eixo da roldana)
    giro = math.atan2(f.x, -f.y)                              # caixa com X local = s, Y local = −f
    O = Vector((x, y, 0.0))

    def P(df, ds, z):
        return O + f * df + s * ds + cima * z

    def bloco(nome_, df, ds, z, tam, mat, chanfro=0.006, aneis=False):
        o = caixa(nome + nome_, P(df, ds, z), tam, mat, rot=(0, 0, giro), pai=torre, chanfro=chanfro)
        return _em_aneis(o) if aneis else o

    def cilindro_lado(nome_, raio_, compr, df, ds, z, mat):
        return _cilindro(nome + nome_, raio_, compr, P(df, ds, z), (0, math.radians(90), giro), mat, pai=torre)

    torre = bpy.data.objects.new(nome + "_torre", None)
    bpy.context.scene.collection.objects.link(torre)
    trilho = -0.10                                            # eixo do trilho (atrás da roldana)
    bloco("_base", -0.22, 0, 0.0125, (0.56, 0.68, 0.025), mat_estrutura(), chanfro=0.004, aneis=True)
    bloco("_pilha", -0.34, 0, 0.9625, (0.44, 0.36, 1.875), mat_carenagem(), chanfro=0.012)
    bloco("_trilho", trilho, 0, (0.025 + alto) / 2, (0.05, 0.05, alto - 0.025), mat_estrutura(), aneis=True)
    for k, z in enumerate((0.10, alto - 0.20)):
        bloco("_suporte%d" % k, -0.1425, 0, z, (0.04, 0.035, 0.05), mat_estrutura(), chanfro=0.003)
    bloco("_viga", -0.31, 0, alto - 0.03, (0.08, 0.42, 0.06), mat_estrutura(), aneis=True)
    bloco("_roldana_alta", -0.06, 0, alto - 0.11, (0.06, 0.10, 0.10), mat_estrutura(), chanfro=0.004)
    # carrinho no trilho: luva, pino de regulagem, garfo e roldana (flanges + miolo + eixo)
    bloco("_carrinho", trilho, 0, altura, (0.085, 0.085, 0.16), mat_estrutura(), chanfro=0.005)
    cilindro_lado("_pino", 0.007, 0.035, trilho, 0.0425 + 0.0175, altura, mat_aco())
    cilindro_lado("_pino_bola", 0.012, 0.016, trilho, 0.0425 + 0.035 + 0.008, altura, mat_borracha())
    for k in (-1, 1):
        bloco("_garfo%+d" % k, -0.015, k * 0.017, altura, (0.004, 0.09, 0.11), mat_estrutura(), chanfro=0.0015)
        cilindro_lado("_flange%+d" % k, raio + 0.007, 0.004, 0, k * 0.0095, altura, mat_aco())
    cilindro_lado("_miolo", raio - 0.0025, 0.015, 0, 0, altura, mat_aco())
    cilindro_lado("_eixo", 0.007, 0.042, 0, 0, altura, mat_aco())
    # cabo parado: sobe da roldana pelo lado da torre até a roldana de cima (dentro da caixinha no alto do trilho)
    _em_aneis(tubo(nome + "_cabo_trilho", P(-raio, 0, altura), P(-raio, 0, alto - 0.16), raio_cabo, mat_aco(), pai=torre,
                   vertices=12))
    # cabo que mexe: cilindro de 1 m no Z local, a `raio` do eixo no Y local (a origem fica no eixo da roldana)
    bpy.ops.mesh.primitive_cylinder_add(radius=raio_cabo, depth=1.0, location=(0, raio, 0.5), vertices=12)
    cabo = bpy.context.active_object
    cabo.name = nome + "_cabo"
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
    bpy.ops.object.shade_smooth()
    cabo.data.materials.append(mat_aco())
    _em_aneis(cabo)
    cabo["anima_escala"] = True                               # exportar_exercicio.py: grava a escala só deste objeto
    if gira:                                                  # carrinho com o garfo que gira (PoliaGiratoria, abaixo)
        roldana = _garfo_giratorio(nome, torre, P, giro, raio, altura)
        pol = PoliaGiratoria(torre, roldana, cabo, P(-raio, 0, altura), raio, f)
        pol.ligar(P(0.6, 0, altura + 0.3))
        return pol
    pol = Polia(torre, cabo, P(0, 0, altura), raio, f)
    pol.ligar(P(0.6, 0, altura + 0.3))                        # pose de repouso (a cena põe o certo a cada quadro)
    return pol


def barra_polia(nome="barra_polia", comprimento=0.508, raio=0.01524, engate=ENGATE_BARRA_POLIA):
    """Barra reta curta de polia com o engate no meio (lote 3, 05/10/2026): 20" (0,508 m) com pegada de borracha de 1,2"
    (30,5 mm) — Synergee Straight Bar Cable Attachment: lengths "20"", Rubber Grip Diameters "1.2"", "a 360-degree
    swivel", "a universal attachment point that will fit on most cable machine carabiner clips". Eixo da barra no X local
    e o engate no +Y local (luva giratória no meio → orelha → mosquetão → ponteira e bola de borracha do cabo), com o cabo
    começando a `engate` m do eixo. Devolve a raiz (vazio no eixo, no meio): use por_acessorio() pra pôr no quadro."""
    raiz = bpy.data.objects.new(nome, None)
    bpy.context.scene.collection.objects.link(raiz)
    rot = (0, math.radians(90), 0)
    meio = comprimento / 2
    _em_aneis(_cilindro(nome + "_nucleo", 0.0125, comprimento, (0, 0, 0), rot, mat_aco(), pai=raiz))
    for s in (-1, 1):
        _cilindro(nome + "_pegada%+d" % s, raio, meio - 0.064, (s * (0.045 + (meio - 0.064) / 2), 0, 0), rot,
                  mat_borracha(), pai=raiz)
        _cilindro(nome + "_ponta%+d" % s, raio + 0.0012, 0.018, (s * (meio - 0.009), 0, 0), rot, mat_aco(), pai=raiz)
    _cilindro(nome + "_luva", 0.020, 0.07, (0, 0, 0), rot, mat_aco(), pai=raiz)
    caixa(nome + "_orelha", (0, 0.034, 0), (0.008, 0.032, 0.022), mat_aco(), pai=raiz, chanfro=0.003)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.016, minor_radius=0.0035, major_segments=24, minor_segments=8,
                                     location=(0, 0.072, 0))
    mosq = bpy.context.active_object
    mosq.name = nome + "_mosquetao"
    mosq.scale = (1.0, 1.6, 1.0)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.ops.object.shade_smooth()
    mosq.data.materials.append(mat_aco())
    mosq.parent = raiz
    _cilindro(nome + "_ponteira", 0.0045, 0.03, (0, 0.11, 0), (math.radians(-90), 0, 0), mat_aco(), vertices=16, pai=raiz)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.012, segments=16, ring_count=8, location=(0, engate + 0.007, 0))
    bola = bpy.context.active_object
    bola.name = nome + "_bola"
    bpy.ops.object.shade_smooth()
    bola.data.materials.append(mat_borracha())
    bola.parent = raiz
    return raiz


def por_acessorio(raiz, centro, eixo, para_cabo):
    """Põe o acessório da polia no quadro: origem em `centro` (eixo da pegada), X local ao longo de `eixo` e o engate (+Y
    local) virado pra `para_cabo` (polia.direcao(centro)); o gancho gira livre em volta da pegada, como o de verdade."""
    x = Vector(eixo).normalized()
    y = Vector(para_cabo) - x * Vector(para_cabo).dot(x)
    y.normalize()
    raiz.matrix_world = Matrix.Translation(Vector(centro)) @ Matrix((x, y, x.cross(y))).transposed().to_4x4()


# ── CORDA de polia (Tríceps Testa na Polia Alta em Pé, lote 3, 05/10/2026; serve também pra Rosca Martelo na Polia) ──────
# Corda de tríceps comum: 27" de ponta a ponta com o engate no meio, corda trançada e batentes de borracha maciça nas
# pontas (CAP Barbell MB-ROPE: "Rope Length: 27 inches (end to end) with center attachment"; "Heavy duty braided
# Polypropylene rope and solid rubber stoppers at each end"); grossura de 28 mm (pedido do Weslley: ~25–30 mm). A corda
# dobra no meio dentro de uma luva de aço presa num olhal; o mosquetão do cabo prende no olhal (como na barra_polia).
# As peças mexem uma em relação à outra (a distância entre as mãos muda), então cada uma é uma raiz (a checagem de
# rigidez é por raiz) e todas entram em Cena.equipamentos junto com polia.raizes:
#   gancho  — luva + olhal + mosquetão + ponteira e bola do cabo; origem no ponto onde as 2 pernas se juntam (dentro da
#             luva), engate (+Y local) virado pro cabo;
#   perna±1 — a corda do gancho até a entrada na mão: comprimento FIXO (a corda não estica) — é a posição do gancho que
#             sai das 2 mãos (as 2 pernas esticadas, o gancho na linha do cabo). Sem escala no GLB;
#   ponta±1 — a corda dentro da mão + o batente logo depois dela; origem no vão da mão, X local ao longo da corda, do
#             lado do gancho (entrada) pro batente: checagem3d.Barra(ponta, raio, meia_pegada) mede a pegada.
# Uso numa cena (polia alta atrás, mãos em pegada neutra; a mão +1 é a de +X):
#   corda = e3.corda_polia("corda")
#   no pose(t): eng = corda.por({1: (vao_E, eixo_E), -1: (vao_D, eixo_D)}, pol.direcao)   # eixo: entrada → batente
#               pol.ligar(eng)
#   Cena(pose, corda.raizes + pol.raizes, pegadas=[("Left", ck.Barra(corda.pontas[1], corda.raio, corda.meia)), ...])
ENGATE_CORDA = 0.143               # do ponto onde as pernas se juntam até onde o cabo começa (dentro da bola do cabo)
CORDA = (0.045, 0.045, 0.05, 1)


def mat_corda():
    return b3.material_liso("Corda", CORDA, rug=0.85)


class Corda:
    """Corda da polia pronta na cena (corda_polia()): raizes = [gancho, perna+1, perna−1, ponta+1, ponta−1]."""

    def __init__(self, gancho, pernas, pontas, perna, meia, raio, engate):
        self.gancho, self.pernas, self.pontas = gancho, pernas, pontas
        self.raizes = [gancho, pernas[1], pernas[-1], pontas[1], pontas[-1]]
        self.perna = perna                # comprimento de cada perna (junção → entrada na mão), m
        self.meia = meia                  # vão da mão → entrada (e → saída) da corda na mão, m
        self.raio = raio                  # raio da corda, m
        self.engate = engate
        self.juncao = None                # onde as pernas se juntam no último por()
        self.entradas = {}                # onde cada perna entra na mão no último por()

    def por(self, pegadas, direcao):
        """Põe a corda no quadro e devolve o engate (onde o cabo começa: polia.ligar(engate)). pegadas = {+1: (vão,
        eixo), −1: (vão, eixo)}: vão = ponto do eixo da corda no meio da mão (o da pegada3d) e eixo = direção da corda
        dentro da mão, do lado por onde ela entra (o do gancho) pro lado do batente. direcao = polia.direcao (ponto →
        direção unitária do cabo, pra roldana). As 2 pernas ficam esticadas no comprimento delas: o gancho fica a igual
        distância das 2 entradas, na reta que sai do meio delas na direção do cabo (o equilíbrio das 3 forças)."""
        E = {s: Vector(c) - Vector(e).normalized() * self.meia for s, (c, e) in pegadas.items()}
        M = (E[1] + E[-1]) / 2
        w = E[1] - E[-1]
        if w.length / 2 >= self.perna * 0.98:
            raise ValueError("corda: mãos longe demais pras pernas (%.3f m entre as entradas)" % w.length)
        h = math.sqrt(self.perna ** 2 - (w.length / 2) ** 2)
        wn = w.normalized()
        u = Vector(direcao(M))
        for _ in range(5):
            up = (u - wn * u.dot(wn)).normalized()
            J = M + up * h
            u = Vector(direcao(J + u * self.engate))
        por_acessorio(self.gancho, J, wn, u)
        for s in (1, -1):
            c, e = Vector(pegadas[s][0]), Vector(pegadas[s][1]).normalized()
            z = (E[s] - J).normalized()               # perna: Z local da junção até a entrada na mão
            x = wn - z * wn.dot(z)
            x = x.normalized() if x.length > 1e-6 else z.orthogonal().normalized()
            self.pernas[s].matrix_world = Matrix.Translation(J) @ Matrix((x, z.cross(x), z)).transposed().to_4x4()
            y = (J - E[s]) - e * (J - E[s]).dot(e)    # ponta: X local ao longo da corda, Y pro lado do gancho
            y = y.normalized() if y.length > 1e-6 else e.orthogonal().normalized()
            self.pontas[s].matrix_world = Matrix.Translation(c) @ Matrix((e, y, e.cross(y))).transposed().to_4x4()
        self.juncao, self.entradas = J, E
        return J + u * self.engate


def corda_polia(nome="corda", raio=0.014, perna=0.18, meia=0.05, raio_batente=0.021, compr_batente=0.045,
                folga_batente=0.003, engate=ENGATE_CORDA):
    """Corda de tríceps da polia (ver o bloco acima): corda de `raio` m, cada perna com `perna` m da junção até a entrada
    na mão, `meia` m do vão da mão até a entrada/saída dela na mão, batente de borracha (`raio_batente`, `compr_batente`)
    `folga_batente` m depois da saída. Medidas: 27" (0,686 m) de ponta a ponta ≈ 2 × (perna + 2 × meia + folga + batente
    + ~1,5 cm dobrados dentro da luva) = 2 × 0,343 m. Devolve um Corda (raizes, pontas, por())."""
    def raiz_nova(n):
        r = bpy.data.objects.new(n, None)
        bpy.context.scene.collection.objects.link(r)
        return r

    # gancho: luva (ao longo do +Y local, cobrindo a dobra), olhal, mosquetão, ponteira e bola do cabo
    gancho = raiz_nova(nome + "_gancho")
    rot_y = (math.radians(-90), 0, 0)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=raio, segments=16, ring_count=8, location=(0, 0, 0))
    no = bpy.context.active_object
    no.name = nome + "_dobra"
    bpy.ops.object.shade_smooth()
    no.data.materials.append(mat_corda())
    no.parent = gancho
    _cilindro(nome + "_luva", 0.020, 0.06, (0, 0.005, 0), rot_y, mat_aco(), pai=gancho)
    caixa(nome + "_olhal", (0, 0.047, 0), (0.008, 0.026, 0.022), mat_aco(), pai=gancho, chanfro=0.003)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.016, minor_radius=0.0035, major_segments=24, minor_segments=8,
                                     location=(0, 0.085, 0))
    mosq = bpy.context.active_object
    mosq.name = nome + "_mosquetao"
    mosq.scale = (1.0, 1.6, 1.0)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.ops.object.shade_smooth()
    mosq.data.materials.append(mat_aco())
    mosq.parent = gancho
    _cilindro(nome + "_ponteira", 0.0045, 0.03, (0, 0.123, 0), rot_y, mat_aco(), vertices=16, pai=gancho)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.012, segments=16, ring_count=8, location=(0, engate + 0.007, 0))
    bola = bpy.context.active_object
    bola.name = nome + "_bola"
    bpy.ops.object.shade_smooth()
    bola.data.materials.append(mat_borracha())
    bola.parent = gancho
    pernas, pontas = {}, {}
    for s in (1, -1):
        # perna: cilindro de 0 a `perna` no Z local (origem na junção)
        bpy.ops.mesh.primitive_cylinder_add(radius=raio, depth=perna, location=(0, 0, perna / 2), vertices=16)
        p = bpy.context.active_object
        p.name = nome + "_perna%+d" % s
        bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
        bpy.ops.object.shade_smooth()
        p.data.materials.append(mat_corda())
        pernas[s] = p
        # ponta: corda dentro da mão (de −meia até o meio do batente), dobra na entrada e o batente com as bordas
        # arredondadas
        r = pontas[s] = raiz_nova(nome + "_ponta%+d" % s)
        x1 = meia + folga_batente
        x2 = x1 + compr_batente
        rot_x = (0, math.radians(90), 0)
        _cilindro(nome + "_pegada%+d" % s, raio, x1 + compr_batente / 2 + meia, ((x1 + compr_batente / 2 - meia) / 2, 0, 0),
                  rot_x, mat_corda(), vertices=16, pai=r)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=raio, segments=16, ring_count=8, location=(-meia, 0, 0))
        d = bpy.context.active_object
        d.name = nome + "_entrada%+d" % s
        bpy.ops.object.shade_smooth()
        d.data.materials.append(mat_corda())
        d.parent = r
        b = _cilindro(nome + "_batente%+d" % s, raio_batente, compr_batente, ((x1 + x2) / 2, 0, 0), rot_x, mat_borracha(),
                      vertices=32, pai=r)
        m = b.modifiers.new("chanfro", "BEVEL")
        m.width = 0.006
        m.segments = 3
    return Corda(gancho, pernas, pontas, perna, meia, raio, engate)


# ── POLIA COM O GARFO QUE GIRA (Tríceps Francês Unilateral na Polia Baixa, lote 3, 06/10/2026; serve também pra Elevação
# Lateral na Polia, em que o cabo sai na diagonal) ────────────────────────────────────────────────────────────────────────
# polia(..., gira=True): o carrinho continua parado no trilho, mas a roldana fica num garfo que gira em volta de um eixo
# VERTICAL — o do cabo que desce pelo trilho (ele não sai do lugar), como no carrinho giratório das estações de cabo — e
# a roldana fica sempre virada pro cabo que sai dela: o cabo nunca sai de lado da roldana. O suporte do giro (fixo, em
# cima do carrinho, com o rolamento) prende o garfo pelo pino; o garfo = 2 chapas em volta da roldana + a ponte em cima.
# Com isso o carrinho fica mais raso na frente (2,5 cm atrás do cabo que desce) e o garfo gira até ±90° da `frente` sem
# encostar nele (folga medida ≥ 3,3 mm, na ponte, a ~58°; 4 mm a 90°); a 95° o eixo da roldana já chega a 0,6 mm do
# carrinho e a 100° entra nele — a cena vira a `frente` da polia pro lado em que o cabo sai. Uso igual ao da polia de
# hoje (direcao, ligar); raizes = [torre, roldana, cabo]: a "<nome>_roldana" gira (só rotação no GLB, a origem fica no
# eixo do giro) e o cabo gira e estica. Com gira=False (o padrão) a polia sai igual à de antes (conferido: mesmos
# objetos, vértices, direção e comprimento do cabo).
class PoliaGiratoria(Polia):
    """Polia com o garfo que gira (polia(..., gira=True)): a cada direcao()/ligar() a roldana se vira pro ponto pedido
    (o centro dela anda num círculo de raio `raio` em volta do eixo do giro) e o cabo sai no plano dela."""

    def __init__(self, torre, roldana, cabo, eixo_giro, raio, frente):
        f = Vector(frente)
        Polia.__init__(self, torre, cabo, Vector(eixo_giro) + f * raio, raio, f)
        self.roldana = roldana
        self.raizes = [torre, roldana, cabo]
        self.eixo_giro = Vector(eixo_giro)    # ponto do eixo vertical do giro, na altura do eixo da roldana
        self.giro = 0.0                       # giro do garfo em relação à `frente` no último ligar() (graus, + = anti-horário)
        self._M0 = roldana.matrix_world.copy()

    def _virar(self, p):
        """Vira a roldana pra p (o centro dela vai pra frente nova): devolve a frente nova (horizontal, unitária)."""
        v = Vector(p) - self.eixo_giro
        f = Vector((v.x, v.y, 0.0))
        f = f.normalized() if f.length > 1e-6 else self.frente.copy()
        self.centro = self.eixo_giro + f * self.raio
        return f

    def tangente(self, p):
        self._virar(p)
        return Polia.tangente(self, p)

    def ligar(self, engate):
        f = self._virar(engate)
        L = Polia.ligar(self, engate)
        ang = math.atan2(self.frente.cross(f).z, self.frente.dot(f))
        A = self.eixo_giro
        self.roldana.matrix_world = (Matrix.Translation(A) @ Matrix.Rotation(ang, 4, "Z") @ Matrix.Translation(-A)
                                     @ self._M0)
        self.giro = math.degrees(ang)
        return L


def _garfo_giratorio(nome, torre, P, giro, raio, altura):
    """Troca o garfo fixo da polia() pelo giratório (gira=True): carrinho mais raso na frente, suporte e rolamento fixos em
    cima dele e, numa raiz nova "<nome>_roldana" com a origem no eixo do giro, o pino, a ponte, as 2 chapas e a roldana de
    hoje (flanges, miolo e eixo). P(df, ds, z) = ponto no referencial da polia (frente, lado, altura). Devolve a raiz."""
    for sufixo in ("_carrinho", "_garfo+1", "_garfo-1"):
        o = bpy.data.objects.get(nome + sufixo)
        if o is not None:
            bpy.data.objects.remove(o, do_unlink=True)
    rot = (0, 0, giro)
    # carrinho no trilho (eixo do trilho em df = −0,10), com a frente a 2,5 cm atrás do cabo que desce (df = −raio)
    frente_carrinho = -raio - 0.025
    caixa(nome + "_carrinho", P((frente_carrinho - 0.1425) / 2, 0, altura), (0.085, 0.1425 + frente_carrinho, 0.16),
          mat_estrutura(), rot=rot, pai=torre, chanfro=0.005)
    # suporte do giro (fixo): em cima do carrinho, avançando até passar do eixo do giro, com o rolamento embaixo
    caixa(nome + "_suporte_giro", P(-raio - 0.015, 0, altura + 0.09), (0.04, 0.06, 0.02), mat_estrutura(), rot=rot,
          pai=torre, chanfro=0.003)
    _cilindro(nome + "_rolamento", 0.013, 0.012, P(-raio, 0, altura + 0.074), (0, 0, 0), mat_aco(), pai=torre)
    # raiz que gira: origem no eixo do giro (na altura do eixo da roldana), sem rotação no repouso
    A = P(-raio, 0, altura)
    raiz = bpy.data.objects.new(nome + "_roldana", None)
    bpy.context.scene.collection.objects.link(raiz)
    raiz.location = A
    bpy.context.view_layer.update()
    inv = raiz.matrix_world.inverted()
    pecas = [_cilindro(nome + "_pino_giro", 0.007, 0.008, P(-raio, 0, altura + 0.068), (0, 0, 0), mat_aco()),
             caixa(nome + "_ponte", P(-raio + 0.033, 0, altura + 0.062), (0.038, 0.09, 0.008), mat_estrutura(), rot=rot,
                   chanfro=0.002)]
    for k in (-1, 1):                     # chapas do garfo em volta da roldana (do eixo da roldana ±3,3 cm), até a ponte
        pecas.append(caixa(nome + "_chapa%+d" % k, P(0, k * 0.017, altura + 0.0125), (0.004, 0.066, 0.095),
                           mat_estrutura(), rot=rot, chanfro=0.0015))
    pecas += [bpy.data.objects[nome + n] for n in ("_flange+1", "_flange-1", "_miolo", "_eixo")]
    for o in pecas:
        M = o.matrix_world.copy()
        o.parent = raiz
        o.matrix_parent_inverse = inv
        o.matrix_world = M
    bpy.context.view_layer.update()
    return raiz


# ── PUXADOR D da polia (Tríceps Francês Unilateral na Polia Baixa, lote 3, 06/10/2026; serve também pra Elevação Lateral
# na Polia e outros exercícios de um braço no cabo) ──────────────────────────────────────────────────────────────────────
# Puxador em "D" (estribo) de academia: pegador reto de aço e o aro em D saindo das 2 pontas dele e fechando em
# semicírculo; o mosquetão do cabo prende no topo do aro (o olhal). Medidas do Synergee Single D Handle: "Handle
# Diameter: 25mm", "Handle Knurling: 4.9"" e "Diameter: 5.7" x 5.7"" (14,5 × 14,5 cm por fora); aro de aço redondo de
# 10 mm (escolha da fábrica: 14,5 cm por fora − 12,5 cm de pegador = 2 × 1 cm). Como no de verdade, o aro gira livre em
# volta do pegador (alinha com o cabo) e o mosquetão gira no olhal. 3 raízes (a checagem de rigidez é por raiz; as
# zonas e folgas da ficha olham a raiz que quiserem — o aro sem o pegador que fica dentro da mão):
#   pegador — o cano onde a mão fecha; origem no eixo, no meio dele; X local = eixo: ck.Barra(pegador, raio, meia);
#   alca    — o aro em D (+ as cabeças dos parafusos), mesma origem e mesmo X do pegador, o olhal no +Y local;
#   engate  — mosquetão + ponteira e bola do cabo, presos no olhal e virados pro cabo (Y local ao longo dele).
# Uso numa cena (a mão segura o pegador com a linha dos nós dos dedos ao longo dele):
#   pux = e3.puxador_polia("puxador")
#   no pose(t): eng = pux.por(vao, eixo, pol.direcao)     # vao = eixo do pegador no meio da mão; eixo = ao longo dele
#               pol.ligar(eng)
#   Cena(pose, pux.raizes + pol.raizes, pegadas=[("Left", ck.Barra(pux.pegador, pux.raio, pux.meia))], ...)
class Puxador:
    """Puxador D pronto na cena (puxador_polia()): raizes = [pegador, alca, engate]."""

    def __init__(self, pegador, alca, engate, raio, meia, olhal, comprimento):
        self.pegador, self.alca, self.engate = pegador, alca, engate
        self.raizes = [pegador, alca, engate]
        self.raio = raio                  # raio do pegador (m)
        self.meia = meia                  # meio comprimento do pegador (m)
        self.olhal = olhal                # do eixo do pegador até o eixo do aro no olhal (m)
        self.comprimento = comprimento    # do olhal até onde o cabo começa (dentro da bola), m
        self.ponto_olhal = None           # olhal e começo do cabo no último por()
        self.ponto_engate = None

    def por(self, centro, eixo, direcao, voltas=5):
        """Põe o puxador no quadro e devolve onde o cabo começa (polia.ligar(engate)). centro = ponto do eixo do pegador
        no meio da mão; eixo = direção do pegador; direcao = polia.direcao (ponto → direção unitária do cabo, pra
        roldana). O aro gira em volta do pegador até o olhal ficar no plano do cabo (a força do cabo passa pelo eixo do
        pegador, sem torção) e o engate sai do olhal na direção do cabo."""
        c = Vector(centro)
        x = Vector(eixo).normalized()
        u = Vector(direcao(c))
        for _ in range(voltas):
            y = u - x * u.dot(x)
            if y.length < 1e-6:
                raise ValueError("puxador: cabo ao longo do pegador (%s)" % (tuple(u),))
            O = c + y.normalized() * self.olhal
            u = Vector(direcao(O + u * self.comprimento))
        por_acessorio(self.pegador, c, x, u)
        por_acessorio(self.alca, c, x, u)
        xe = x - u * x.dot(u)
        xe = xe.normalized() if xe.length > 1e-6 else u.orthogonal().normalized()
        self.engate.matrix_world = Matrix.Translation(O) @ Matrix((xe, u, xe.cross(u))).transposed().to_4x4()
        self.ponto_olhal, self.ponto_engate = O, O + u * self.comprimento
        return self.ponto_engate


def _tubo_caminho(nome, pontos, raio, mat, pai=None, lados=12):
    """Tubo redondo de raio `raio` seguindo a linha `pontos` (curva de Blender com bevel, virada malha), pontas fechadas."""
    cu = bpy.data.curves.new(nome, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = raio
    cu.bevel_resolution = max(1, lados // 4 - 1)
    cu.use_fill_caps = True
    sp = cu.splines.new("POLY")
    sp.points.add(len(pontos) - 1)
    for p_, q in zip(sp.points, pontos):
        p_.co = (q[0], q[1], q[2], 1.0)
    ob_c = bpy.data.objects.new(nome + "_curva", cu)
    bpy.context.scene.collection.objects.link(ob_c)
    bpy.context.view_layer.update()
    me = bpy.data.meshes.new_from_object(ob_c.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(ob_c, do_unlink=True)
    bpy.data.curves.remove(cu)
    o = bpy.data.objects.new(nome, me)
    bpy.context.scene.collection.objects.link(o)
    for pl in me.polygons:
        pl.use_smooth = True
    me.materials.append(mat)
    if pai is not None:
        o.parent = pai
    return o


def puxador_polia(nome="puxador", raio=0.0125, largura=0.145, altura=0.145, raio_aro=0.005):
    """Puxador D da polia (ver o bloco acima): pegador de `raio` m entre os braços do aro, aro de `raio_aro` m com
    `largura` m por fora (de lado a lado) e `altura` m por fora (do lado de fora do pegador até o topo do aro). Medidas
    do Synergee Single D Handle (25 mm, 14,5 × 14,5 cm). Devolve um Puxador (raizes, pegador, por())."""
    def raiz_nova(n):
        r = bpy.data.objects.new(n, None)
        bpy.context.scene.collection.objects.link(r)
        return r

    xa = largura / 2 - raio_aro                                # eixo dos braços do aro
    meia = xa - raio_aro                                       # o pegador vai de um braço ao outro
    ya = altura - raio - raio_aro                              # eixo do aro no topo (o olhal)
    yc = ya - xa                                               # começo do semicírculo (braços retos até aqui)
    rot_x = (0, math.radians(90), 0)
    pegador = raiz_nova(nome + "_pegador")
    _cilindro(nome + "_cano", raio, 2 * meia, (0, 0, 0), rot_x, mat_aco(), vertices=32, pai=pegador)
    alca = raiz_nova(nome + "_alca")
    caminho = [(xa, -raio * 0.6, 0), (xa, yc, 0)]
    caminho += [(xa * math.cos(a), yc + xa * math.sin(a), 0) for a in [math.pi * k / 16 for k in range(1, 16)]]
    caminho += [(-xa, yc, 0), (-xa, -raio * 0.6, 0)]
    _tubo_caminho(nome + "_aro", caminho, raio_aro, mat_aco(), pai=alca)
    for s in (-1, 1):                                          # cabeças dos parafusos do pegador, por fora do aro
        _cilindro(nome + "_parafuso%+d" % s, 0.008, 0.004, (s * (xa + raio_aro + 0.002), 0, 0), rot_x, mat_aco(),
                  vertices=16, pai=alca)
    # engate: mosquetão em volta do topo do aro (no plano ⟂ ao aro ali), ponteira e bola do cabo; origem no olhal
    engate = raiz_nova(nome + "_engate")
    bpy.ops.mesh.primitive_torus_add(major_radius=0.016, minor_radius=0.0035, major_segments=24, minor_segments=8,
                                     location=(0, 0.012, 0), rotation=(0, math.radians(90), 0))
    mosq = bpy.context.active_object
    mosq.name = nome + "_mosquetao"
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    mosq.scale = (1.0, 1.6, 1.0)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.ops.object.shade_smooth()
    mosq.data.materials.append(mat_aco())
    mosq.parent = engate
    _cilindro(nome + "_ponteira", 0.0045, 0.03, (0, 0.055, 0), (math.radians(-90), 0, 0), mat_aco(), vertices=16,
              pai=engate)
    comprimento = 0.075                                        # do olhal até onde o cabo começa (dentro da bola)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.012, segments=16, ring_count=8, location=(0, comprimento + 0.007, 0))
    bola = bpy.context.active_object
    bola.name = nome + "_bola"
    bpy.ops.object.shade_smooth()
    bola.data.materials.append(mat_borracha())
    bola.parent = engate
    return Puxador(pegador, alca, engate, raio, meia, ya, comprimento)
