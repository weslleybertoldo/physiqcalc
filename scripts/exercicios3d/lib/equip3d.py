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
                        viga=0.27, frente=-0.30, tubo=0.06):
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
      viga = d do eixo da viga; frente = s onde a coluna da frente encontra a viga.
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
    s_baixo, s_alto = s_p - 0.07, s1 - 0.05
    _em_aneis(caixa(nome + "_viga", P((s_baixo + s_alto) / 2, viga), (tubo, s_alto - s_baixo, tubo * 4 / 3), mat_estrutura(),
                    rot=rot_u, pai=estr, chanfro=0.006))
    # travessa embaixo dos estofados + poste até a viga
    d_trav = d_topo + esp + 0.025
    _em_aneis(caixa(nome + "_travessa", P((s0 + s1) / 2, d_trav), (larg - 0.06, 0.05, 0.05), mat_estrutura(), rot=rot_u,
                    pai=estr, chanfro=0.005))
    caixa(nome + "_poste_estofado", P((s0 + s1) / 2, (d_trav + viga) / 2), (0.05, 0.05, viga - d_trav), mat_estrutura(),
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
