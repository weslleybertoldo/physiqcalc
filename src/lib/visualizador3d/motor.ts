import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { arquivoDoBoneco } from "./boneco";
import { carregarExercicio, modoDeRepeticao } from "./exercicio";
import { pintarMusculos, prepararMapa, tabelaDeCores } from "./cores";
import { criarMedidorDeQualidade } from "./qualidade";
import type { Boneco3D, CameraInicial, Entrada3D, Fundo } from "./tipos";

// Motor do visualizador 3D (sem React): mesmo estúdio de luz das renders do Blender, câmera que gira e dá zoom
// com o dedo (sem arrastar de lado, sem passar pra baixo do chão), movimento em ida e volta contínua.
const FUNDOS: Record<Fundo, number> = { escuro: 0x0f0f12, claro: 0xffffff };
const SOMBRA_NO_CHAO: Record<Fundo, number> = { escuro: 0.45, claro: 0.2 };
const BASIS = "/exercicios3d/basis/";
const b2t = (x: number, y: number, z: number) => new THREE.Vector3(x, z, -y); // Blender (z pra cima) → three
const FOCO = b2t(0, 0.05, 0.75);
const ALVO = b2t(0, 0.1, 0.8);
const DIST_PADRAO = b2t(4.0, -2.83, 1.16).distanceTo(ALVO) * 0.78; // um pouco mais perto que o vídeo
const FOV = 27;
const RELEVO = 1.25; // força do normal map (o relevo assado)
const EL_VISTAS = 7; // graus: Frente/Lado/Costas levemente de cima

export interface OpcoesMotor {
  fundo: Fundo;
  /** Prints: guarda o quadro desenhado (preserveDrawingBuffer) e não mede qualidade. */
  fixo?: boolean;
  /** Contexto WebGL perdido depois de pronto (aparelho sem memória, aba em segundo plano…). */
  aoPerderContexto?: () => void;
}

export interface Motor {
  carregar(boneco: Boneco3D, entrada: Entrada3D, sinal?: AbortSignal): Promise<void>;
  vista(azGraus: number): void;
  camera(c: CameraInicial): void;
  tocar(sim: boolean): void;
  fundo(f: Fundo): void;
  /** Para o movimento no ponto t (0 = começo, 1 = fim da ida). */
  quadroFixo(t: number): void;
  encaixar(): void;
  destruir(): void;
}

const rad = THREE.MathUtils.degToRad;

export function criarMotor(canvas: HTMLCanvasElement, opcoes: OpcoesMotor): Motor {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: !!opcoes.fixo });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 3));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping; // "Standard" do Blender
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const cena = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const ambiente = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  cena.environment = ambiente;
  cena.environmentIntensity = 0.35;

  const principal = luz(cena, 2.7, b2t(-1.6, -2.4, 3.3), true); // faz sombra
  luz(cena, 0.55, b2t(2.6, -2.2, 1.4)); // preenche
  luz(cena, 1.3, b2t(1.9, 2.6, 2.5)); // recorte direito
  luz(cena, 0.8, b2t(-2.2, 2.2, 2.2)); // recorte esquerdo
  cena.add(new THREE.HemisphereLight(0xffffff, 0xd8d8d8, 0.35));

  const chao = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: 0.2 }));
  chao.rotation.x = -Math.PI / 2;
  chao.receiveShadow = true;
  cena.add(chao);

  const camera = new THREE.PerspectiveCamera(FOV, 1.5, 0.05, 60);
  const controles = new OrbitControls(camera, canvas);
  controles.target.copy(ALVO);
  controles.enableDamping = true;
  controles.enablePan = false;
  controles.minDistance = 1.0;
  controles.maxDistance = 9;
  controles.maxPolarAngle = Math.PI * 0.53; // não deixa a câmera ir pra baixo do chão
  controles.rotateSpeed = 0.8;
  posicionar({ az: 54, el: 8 });

  const ktx2 = new KTX2Loader().setTranscoderPath(BASIS).detectSupport(renderer);
  const loader = new GLTFLoader().setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);

  const raiz = new THREE.Group();
  cena.add(raiz);
  let mixer: THREE.AnimationMixer | null = null;
  let acao: THREE.AnimationAction | null = null;
  let tocando = true;
  let destruido = false;
  const extras: { dispose(): void }[] = [];
  const relogio = new THREE.Clock();

  const medir = opcoes.fixo
    ? () => {}
    : criarMedidorDeQualidade((degrau) => {
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, degrau === 1 ? 1.5 : 1));
        if (degrau === 2) {
          principal.shadow.mapSize.set(1024, 1024);
          principal.shadow.map?.dispose();
          principal.shadow.map = null;
        }
        encaixar();
      });

  function posicionar(c: CameraInicial) {
    const az = rad(c.az);
    const el = rad(c.el);
    const d = c.dist ?? DIST_PADRAO;
    const alvo = c.alvo ? b2t(...c.alvo) : ALVO;
    camera.position.set(
      alvo.x + d * Math.cos(el) * Math.sin(az),
      alvo.y + d * Math.sin(el),
      alvo.z + d * Math.cos(el) * Math.cos(az),
    );
    controles.target.copy(alvo);
    controles.update();
  }

  function encaixar() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // em pé (celular na vertical) abre a lente em vez de afastar a câmera: o boneco continua grande
    camera.fov = Math.min(50, FOV * Math.max(1, 1.5 / camera.aspect) ** 0.55);
    camera.updateProjectionMatrix();
  }

  function aplicarFundo(f: Fundo) {
    cena.background = new THREE.Color(FUNDOS[f]);
    (chao.material as THREE.ShadowMaterial).opacity = SOMBRA_NO_CHAO[f];
  }
  aplicarFundo(opcoes.fundo);

  let rafId = 0;
  const quadro = (agora: number) => {
    rafId = requestAnimationFrame(quadro);
    const dt = relogio.getDelta();
    if (mixer && tocando) mixer.update(dt);
    controles.update();
    renderer.render(cena, camera);
    if (mixer) medir(agora);
  };
  encaixar();
  rafId = requestAnimationFrame(quadro);

  const aoPerder = (ev: Event) => {
    ev.preventDefault();
    cancelAnimationFrame(rafId);
    opcoes.aoPerderContexto?.();
  };
  canvas.addEventListener("webglcontextlost", aoPerder);

  function cancelado(sinal?: AbortSignal) {
    if (destruido || sinal?.aborted) throw new DOMException("visualizador 3D fechado", "AbortError");
  }

  return {
    async carregar(boneco, entrada, sinal) {
      const [arquivo, mapa] = await Promise.all([
        arquivoDoBoneco(boneco.glb),
        new THREE.TextureLoader().loadAsync(boneco.mapa),
      ]);
      cancelado(sinal);
      const gltf = await loader.parseAsync(arquivo.slice(0), "");
      cancelado(sinal);
      const exercicio = await carregarExercicio(loader, entrada.movimento);
      cancelado(sinal);

      const tabela = tabelaDeCores(entrada.alvos, entrada.auxiliares);
      extras.push(prepararMapa(mapa), tabela);
      gltf.scene.traverse((o) => {
        const malha = o as THREE.Mesh;
        if (!malha.isMesh) return;
        malha.castShadow = true;
        malha.receiveShadow = true;
        malha.frustumCulled = false; // malha com esqueleto: a caixa de repouso engana
        const m = malha.material as THREE.MeshStandardMaterial;
        if (m.normalMap) m.normalScale.multiplyScalar(RELEVO);
        if (m.name === "boneco_pele") pintarMusculos(m, mapa, tabela);
        if (/cabelo|sobrancelha/i.test(m.name)) {
          // fios: recorte pelo alfa com borda suave; sem mipmap, senão de longe o cabelo some
          m.transparent = false;
          m.alphaTest = 0.3;
          m.alphaToCoverage = true;
          m.side = THREE.DoubleSide;
          if (m.map) {
            m.map.generateMipmaps = false;
            m.map.minFilter = THREE.LinearFilter;
            m.map.needsUpdate = true;
          }
        }
      });
      exercicio.equipamento.forEach((o) =>
        o.traverse((x) => {
          if ((x as THREE.Mesh).isMesh) x.castShadow = x.receiveShadow = true;
        }),
      );
      raiz.add(gltf.scene, ...exercicio.equipamento);
      mixer = new THREE.AnimationMixer(raiz);
      acao = mixer.clipAction(exercicio.clipe);
      acao.setLoop(modoDeRepeticao(entrada), Infinity);
      acao.play();
      posicionar(entrada.camera);
      renderer.compile(cena, camera); // shaders prontos antes do primeiro quadro (sem engasgo)
    },
    vista(azGraus) {
      const { x, y, z } = controles.target;
      posicionar({ az: azGraus, el: EL_VISTAS, dist: camera.position.distanceTo(controles.target), alvo: [x, -z, y] });
    },
    camera: posicionar,
    tocar(sim) {
      tocando = sim;
      if (sim) relogio.getDelta(); // não pula o tempo que ficou parado
    },
    fundo: aplicarFundo,
    quadroFixo(t) {
      if (!mixer || !acao) return;
      tocando = false;
      acao.paused = false;
      mixer.setTime(Math.min(1, Math.max(0, t)) * acao.getClip().duration * 0.999);
      acao.paused = true;
      renderer.render(cena, camera);
    },
    encaixar,
    destruir() {
      if (destruido) return;
      destruido = true;
      cancelAnimationFrame(rafId);
      canvas.removeEventListener("webglcontextlost", aoPerder);
      controles.dispose();
      mixer?.stopAllAction();
      cena.traverse((o) => {
        const malha = o as THREE.Mesh;
        if (!malha.isMesh) return;
        malha.geometry.dispose();
        const mats = Array.isArray(malha.material) ? malha.material : [malha.material];
        mats.forEach((m) => {
          Object.values(m).forEach((v) => {
            if (v instanceof THREE.Texture) v.dispose();
          });
          m.dispose();
        });
      });
      extras.forEach((x) => x.dispose());
      principal.shadow.map?.dispose();
      ambiente.dispose();
      pmrem.dispose();
      ktx2.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

function luz(cena: THREE.Scene, forca: number, pos: THREE.Vector3, sombra = false) {
  const l = new THREE.DirectionalLight(0xffffff, forca);
  l.position.copy(pos);
  l.target.position.copy(FOCO);
  cena.add(l, l.target);
  if (sombra) {
    l.castShadow = true;
    l.shadow.mapSize.set(2048, 2048);
    const c = l.shadow.camera;
    c.left = -2.6;
    c.right = 2.6;
    c.top = 2.6;
    c.bottom = -2.6;
    c.near = 0.5;
    c.far = 12;
    l.shadow.bias = -0.0004;
    l.shadow.normalBias = 0.02;
    l.shadow.radius = 6;
    l.shadow.blurSamples = 16;
  }
  return l;
}
