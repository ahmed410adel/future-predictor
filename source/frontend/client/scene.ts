import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  EdgesGeometry,
  Group,
  IcosahedronGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  SphereGeometry,
  TorusGeometry,
  WebGLRenderer,
} from 'three';

export interface SceneControls {
  /** While true the crystal spins faster and the tunnel speeds up ("the AI is thinking"). */
  setBusy(busy: boolean): void;
  /** One burst of energy when the prediction arrives. */
  pulse(): void;
}

const VIOLET = new Color('#8B7CFF');
const CYAN = new Color('#22D3EE');
const PINK = new Color('#F472B6');

function softDot(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}

/** Starts the background scene. Returns null when WebGL is not available (the CSS gradient stays). */
export function startScene(canvas: HTMLCanvasElement): SceneControls | null {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch {
    return null;
  }
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const camera = new PerspectiveCamera(55, 1, 0.1, 80);
  camera.position.set(0, 0, 9);

  // --- The "time crystal": a glowing icosahedron with a smaller one spinning inside --------------
  const rig = new Group();
  scene.add(rig);
  const outerGeo = new IcosahedronGeometry(1.7, 1);
  const outer = new LineSegments(new EdgesGeometry(outerGeo), new LineBasicMaterial({ color: CYAN, transparent: true, opacity: 0.85 }));
  const coreGeo = new IcosahedronGeometry(1.1, 0);
  const core = new Mesh(coreGeo, new MeshBasicMaterial({ color: VIOLET, transparent: true, opacity: 0.25 }));
  const coreEdges = new LineSegments(new EdgesGeometry(coreGeo), new LineBasicMaterial({ color: PINK, transparent: true, opacity: 0.9 }));
  rig.add(outer, core, coreEdges);

  // --- Three orbit rings, each with a small bead: past, present, future --------------------------
  const rings = [
    { r: 2.6, color: VIOLET, tilt: [1.2, 0.2], speed: 0.6 },
    { r: 3.2, color: CYAN, tilt: [0.4, 1.0], speed: -0.45 },
    { r: 3.9, color: PINK, tilt: [1.9, 0.6], speed: 0.3 },
  ].map((cfg) => {
    const pivot = new Group();
    pivot.rotation.set(cfg.tilt[0], cfg.tilt[1], 0);
    const ring = new Mesh(new TorusGeometry(cfg.r, 0.011, 8, 180), new MeshBasicMaterial({ color: cfg.color, transparent: true, opacity: 0.65 }));
    const bead = new Mesh(new SphereGeometry(0.075, 14, 14), new MeshBasicMaterial({ color: cfg.color }));
    pivot.add(ring, bead);
    rig.add(pivot);
    return { ...cfg, bead, angle: Math.random() * Math.PI * 2 };
  });

  // --- Particle tunnel flowing towards the viewer (the timeline) ---------------------------------
  const COUNT = innerWidth < 768 ? 900 : 2000;
  const FAR = -42;
  const NEAR = 9;
  const positions = new Float32Array(COUNT * 3);
  const colors = new Float32Array(COUNT * 3);
  const tmp = new Color();
  for (let i = 0; i < COUNT; i++) {
    const a = Math.random() * Math.PI * 2;
    const radius = 4.5 + Math.random() * 16;
    positions[i * 3] = Math.cos(a) * radius;
    positions[i * 3 + 1] = Math.sin(a) * radius * 0.65;
    positions[i * 3 + 2] = FAR + Math.random() * (NEAR - FAR);
    const pick = Math.random();
    tmp.copy(pick < 0.45 ? VIOLET : pick < 0.85 ? CYAN : PINK).multiplyScalar(0.5 + Math.random() * 0.5);
    colors.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(positions, 3));
  geo.setAttribute('color', new BufferAttribute(colors, 3));
  const points = new Points(
    geo,
    new PointsMaterial({ size: 0.11, map: softDot(), vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending }),
  );
  scene.add(points);

  // --- Layout, input, loop -----------------------------------------------------------------------
  let baseScale = 1;
  const resize = (): void => {
    const w = innerWidth;
    const h = innerHeight;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, w < 768 ? 1.5 : 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const wide = w >= 1000;
    baseScale = wide ? 1 : 0.62;
    rig.position.set(wide ? 3.9 : 0, wide ? 0.2 : 2.7, 0); // right side on desktop, top on phones
    if (reduced) renderer.render(scene, camera);
  };
  resize();
  addEventListener('resize', resize);

  const pointer = { x: 0, y: 0 };
  if (!reduced) {
    addEventListener(
      'pointermove',
      (e) => {
        pointer.x = (e.clientX / innerWidth) * 2 - 1;
        pointer.y = (e.clientY / innerHeight) * 2 - 1;
      },
      { passive: true },
    );
  }

  let busyTarget = 0;
  let busy = 0;
  let pulse = 0;
  let last = performance.now();
  let raf = 0;

  const frame = (now: number): void => {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    busy += (busyTarget - busy) * Math.min(1, dt * 3);
    pulse = Math.max(0, pulse - dt * 1.8);
    const energy = 1 + busy * 4 + pulse * 5;

    rig.rotation.y += dt * 0.25 * energy;
    rig.rotation.x = Math.sin(now / 4000) * 0.18;
    coreEdges.rotation.y -= dt * 0.7 * energy;
    coreEdges.rotation.x += dt * 0.4 * energy;
    core.rotation.copy(coreEdges.rotation);
    rig.scale.setScalar(baseScale * (1 + pulse * 0.12 + busy * 0.04));

    for (const r of rings) {
      r.angle += dt * r.speed * energy;
      r.bead.position.set(Math.cos(r.angle) * r.r, Math.sin(r.angle) * r.r, 0);
    }

    const speed = 1.4 + busy * 12 + pulse * 14;
    for (let i = 0; i < COUNT; i++) {
      let z = positions[i * 3 + 2] + dt * speed;
      if (z > NEAR) z -= NEAR - FAR;
      positions[i * 3 + 2] = z;
    }
    geo.attributes.position.needsUpdate = true;

    camera.position.x += (pointer.x * 0.8 - camera.position.x) * Math.min(1, dt * 2);
    camera.position.y += (-pointer.y * 0.5 - camera.position.y) * Math.min(1, dt * 2);
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  };

  if (reduced) {
    renderer.render(scene, camera); // one still frame, no motion
  } else {
    raf = requestAnimationFrame(frame);
    document.addEventListener('visibilitychange', () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    });
  }

  return {
    setBusy(b) {
      busyTarget = b ? 1 : 0;
    },
    pulse() {
      pulse = 1;
    },
  };
}
