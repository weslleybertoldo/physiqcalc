import * as THREE from "three";

// Músculo alvo e auxiliares pintados NA HORA sobre o boneco único: a cor assada é pele × sombra (pele = cinza
// constante), então cor = base × (corDoMúsculo / pele) mantém sombra, oclusão e relevo; só no alvo as fibras
// escurecem um pouco (igual ao Blender). Cores lineares, as mesmas da fábrica (lib/anatomia3d.py).
export const VERMELHO: readonly [number, number, number] = [0.72, 0.025, 0.02];
export const VERMELHO_CLARO: readonly [number, number, number] = [0.93, 0.42, 0.38];
export const PELE: readonly [number, number, number] = [0.4, 0.4, 0.41];
const FIBRAS = 0.25;
const ALVO = 255;
const AUXILIAR = 128;

/** Tabela 256×1 (id do músculo → cor linear + tipo no alfa): o alvo ganha do auxiliar quando os dois aparecem. */
export function dadosDaTabela(alvos: number[], auxiliares: number[]): Uint8Array {
  const dados = new Uint8Array(256 * 4);
  const pintar = (id: number, cor: readonly [number, number, number], tipo: number) => {
    if (!Number.isInteger(id) || id < 1 || id > 255) return;
    dados.set([...cor.map((c) => Math.round(c * 255)), tipo], id * 4);
  };
  auxiliares.forEach((id) => pintar(id, VERMELHO_CLARO, AUXILIAR));
  alvos.forEach((id) => pintar(id, VERMELHO, ALVO));
  return dados;
}

export function tabelaDeCores(alvos: number[], auxiliares: number[]): THREE.DataTexture {
  const t = new THREE.DataTexture(dadosDaTabela(alvos, auxiliares), 256, 1, THREE.RGBAFormat);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Mapa dos músculos: id por texel, sem filtro nem mipmap (id não se mistura). */
export function prepararMapa(mapa: THREE.Texture): THREE.Texture {
  mapa.flipY = false; // mesmo sentido das texturas do glTF
  mapa.colorSpace = THREE.NoColorSpace;
  mapa.magFilter = mapa.minFilter = THREE.NearestFilter;
  mapa.generateMipmaps = false;
  mapa.needsUpdate = true;
  return mapa;
}

export function pintarMusculos(material: THREE.MeshStandardMaterial, mapa: THREE.Texture, tabela: THREE.Texture) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uMapa = { value: mapa };
    shader.uniforms.uTabela = { value: tabela };
    shader.uniforms.uPele = { value: new THREE.Vector3(...PELE) };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform sampler2D uMapa;\nuniform sampler2D uTabela;\nuniform vec3 uPele;",
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        vec4 musculo = texture2D(uMapa, vMapUv);
        vec4 tipo = texture2D(uTabela, vec2((floor(musculo.r * 255.0 + 0.5) + 0.5) / 256.0, 0.5));
        if (tipo.a > 0.0) {
          diffuseColor.rgb *= tipo.rgb / uPele;
          if (tipo.a > 0.75) diffuseColor.rgb *= 1.0 - ${FIBRAS.toFixed(2)} * musculo.g;
        }`,
      );
  };
  material.customProgramCacheKey = () => "physiq-musculos";
  material.needsUpdate = true;
}
