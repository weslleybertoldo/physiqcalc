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
