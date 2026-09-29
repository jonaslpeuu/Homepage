import * as THREE from "three";

/**
 * Bright procedural atmosphere hero.
 *
 * A camera-inside-the-fog scene built from stacked translucent FBM fog
 * planes, a luminous gradient backdrop and a sparse GPU-drifted particle
 * field. All motion is shader-driven (time + wind uniforms); JS only
 * lerps scroll / pointer state into uniforms — zero per-frame object churn.
 *
 * Techniques adapted from the MIT-licensed procedural-weather-threejs
 * reference (noise wisps, wind drift, height-faded ground fog), reworked
 * here into an original bright, calm composition for this homepage.
 */

const FOG_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FOG_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;

  uniform float uTime;
  uniform float uSeed;
  uniform vec2 uWind;        // direction * speed
  uniform float uScale;      // noise zoom
  uniform vec2 uStretch;     // anisotropy — stratus banding on some layers
  uniform float uCoverage;   // 0..1 — higher = denser banks
  uniform float uDensity;    // peak alpha
  uniform vec3 uLight;       // lit fog tint
  uniform vec3 uShadow;      // shaded fog tint
  uniform vec2 uGlowPos;     // uv-space light breakthrough
  uniform float uGlow;       // glow strength
  uniform float uScroll;     // 0..1 scroll progress

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float fbm(vec2 p) {
    float sum = 0.0;
    float amp = 0.55;
    float norm = 0.0;
    for (int i = 0; i < 4; i++) {
      sum += vnoise(p) * amp;
      norm += amp;
      p = p * 2.03 + vec2(17.3, 9.1);
      amp *= 0.5;
    }
    return sum / norm;
  }

  // Cheaper 3-octave variant for auxiliary samples (warp, sunward lighting).
  float fbm3(vec2 p) {
    float sum = 0.0;
    float amp = 0.55;
    float norm = 0.0;
    for (int i = 0; i < 3; i++) {
      sum += vnoise(p) * amp;
      norm += amp;
      p = p * 2.03 + vec2(17.3, 9.1);
      amp *= 0.5;
    }
    return sum / norm;
  }

  void main() {
    // Domain-warped drift: two slow wind vectors so banks evolve, not just slide.
    vec2 drift = uWind * uTime + vec2(0.0, -uScroll * 0.55);
    vec2 p = (vUv * uStretch) * uScale + uSeed + drift;
    float warp = fbm3(p * 0.9 + vec2(uSeed * 0.37, -uTime * 0.008));
    float n = fbm(p + warp * 2.2 + vec2(-uTime * 0.012, uTime * 0.006));
    // Fine wisp detail carved into the bank edges (3 octaves suffice at these scales).
    float detail = fbm3(p * 2.7 + warp * 1.3 + vec2(uTime * 0.015, 0.0));
    n = n * 0.7 + detail * 0.3;
    // Mild ridging: sharpens billow crests so masses read as clouds, not smoke.
    float ridge = 1.0 - abs(n * 2.0 - 1.0);
    n = mix(n, ridge, 0.45);

    // Sunward sample: density falling off toward the sun means a lit slope,
    // density rising toward it means shadow — cheap volumetric self-shadowing.
    vec2 sunDir = normalize(vec2(0.62, 0.42));
    float ns = fbm3(p + warp * 2.2 + sunDir * 0.7 + vec2(-uTime * 0.012, uTime * 0.006));
    float ridgeS = 1.0 - abs(ns * 2.0 - 1.0);
    ns = mix(ns, ridgeS, 0.45);
    float slope = (n - ns) * 2.6;

    // Full, billowing banks with soft edges.
    float field = smoothstep(1.0 - uCoverage - 0.3, 1.0 - uCoverage + 0.34, n);

    // Hide plane corners so layers melt into each other (kept open top/bottom
    // so high cirrus and low fog stay visible across the full frame).
    vec2 c = vUv - 0.5;
    float edge = smoothstep(0.66, 0.3, length(c * vec2(0.85, 0.68)));

    // Cloud lighting: sun-facing slopes and puff tops glow, bases go cool grey.
    // (Glow lifts gently so lit faces keep their modeled texture.)
    float glowDist = length((vUv - uGlowPos) * vec2(1.15, 0.9));
    float glow = exp(-glowDist * glowDist * 3.0) * uGlow;
    float lit = clamp(0.42 + slope * 1.5 + (n - 0.5) * 1.4 + (vUv.y - 0.4) * 0.2 + glow * 0.35, 0.0, 1.0);
    vec3 col = mix(uShadow, uLight, lit);

    // Silver lining: bank edges facing the sun catch warm light.
    float rim = smoothstep(0.02, 0.3, field) * (1.0 - smoothstep(0.3, 0.72, field));
    col += vec3(1.0, 0.93, 0.8) * rim * (0.1 + glow * 0.5);
    col += vec3(1.0, 0.96, 0.88) * glow * 0.5;

    // Scroll gently thins near veils so the next section opens up.
    float scrollThin = 1.0 - uScroll * 0.28;
    float alpha = field * edge * uDensity * scrollThin;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(col, alpha);
  }
`;

const BACKDROP_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const BACKDROP_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uScroll;

  void main() {
    // Warm off-white zenith melting into a cooler depth below.
    vec3 top = vec3(0.984, 0.976, 0.953);
    vec3 mid = vec3(0.929, 0.910, 0.871);
    vec3 low = vec3(0.820, 0.839, 0.835);
    vec3 col = mix(mid, top, smoothstep(0.15, 0.95, vUv.y));
    col = mix(low, col, smoothstep(-0.05, 0.55, vUv.y));

    // Vast distant cloud bands: slow sine strata so the depth never reads flat.
    float band1 = sin(vUv.y * 14.0 + sin(vUv.x * 5.0 + uTime * 0.03) * 1.2 + uTime * 0.02);
    float band2 = sin(vUv.y * 29.0 - vUv.x * 8.0 - uTime * 0.025);
    float bands = band1 * 0.05 + band2 * 0.03;
    col *= 1.0 + bands;
    col = mix(col, col * vec3(0.94, 0.95, 0.96), clamp(-bands * 6.0, 0.0, 0.6));

    // Slow breathing sunlight from the upper right.
    float breathe = 0.5 + 0.5 * sin(uTime * 0.11);
    vec2 sun = vec2(0.68 + 0.02 * sin(uTime * 0.07), 0.72);
    float d = length((vUv - sun) * vec2(1.25, 1.0));
    col += vec3(1.0, 0.93, 0.78) * exp(-d * d * 4.2) * (0.34 + 0.1 * breathe);
    col += vec3(0.9, 0.94, 0.95) * exp(-d * d * 1.1) * 0.12;

    // Faint cool depth at the very bottom so the dark page transition feels natural.
    col = mix(col, vec3(0.62, 0.66, 0.66), smoothstep(0.22, -0.08, vUv.y) * 0.35);

    // Scroll deepens the lower half slightly as the page dives in.
    col *= 1.0 - uScroll * 0.06 * (1.0 - vUv.y);
    gl_FragColor = vec4(col, 1.0);
  }
`;

const MOTES_VERT = /* glsl */ `
  attribute vec3 aSeed; // x: phase, y: speed factor, z: size factor
  uniform float uTime;
  uniform vec2 uWind;
  uniform float uPixelRatio;
  uniform float uScroll;
  varying float vAlpha;
  void main() {
    vec3 pos = position;
    float t = uTime * (0.35 + aSeed.y * 0.65) + aSeed.x * 40.0;
    // Gentle rise + lateral sway, wrapped inside the volume (zero CPU cost).
    pos.y = mod(pos.y + t * 0.35 + 14.0, 28.0) - 14.0;
    pos.x += sin(t * 0.6 + aSeed.x * 6.28) * 0.9 + uWind.x * uTime * 0.05;
    pos.z += cos(t * 0.45 + aSeed.x * 6.28) * 0.7;
    pos.x = mod(pos.x + 34.0, 68.0) - 34.0;
    // Near-camera motes hurry past on scroll for a dive-through feel.
    pos.z += uScroll * (2.0 + aSeed.y * 6.0);
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    float dist = clamp(-mv.z, 4.0, 80.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (1.1 + aSeed.z * 2.4) * uPixelRatio * (26.0 / dist);
    // Twinkle: each mote slowly breathes so the field shimmers instead of sitting still.
    float twinkle = 0.55 + 0.45 * sin(uTime * (0.6 + aSeed.y * 1.4) + aSeed.x * 40.0);
    vAlpha = (0.1 + aSeed.z * 0.22) * twinkle * smoothstep(80.0, 46.0, dist + 20.0);
  }
`;

const MOTES_FRAG = /* glsl */ `
  precision highp float;
  varying float vAlpha;
  uniform vec3 uColor;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float a = smoothstep(0.5, 0.05, d) * vAlpha;
    if (a < 0.004) discard;
    // Additive light shimmer — never dark specks on the bright fog.
    gl_FragColor = vec4(uColor * a, a);
  }
`;

// Layer recipe: depth, size multiplier, look. Ordered back → front.
const LAYERS = [
  { z: -80, scale: 2.2, stretch: [2.6, 0.45], wind: [0.03, 0.004], coverage: 0.66, density: 0.62, light: 0xf6f2e9, shadow: 0x98938a, glow: 0.4 },
  { z: -68, scale: 1.7, stretch: [1.0, 1.0], wind: [0.024, 0.006], coverage: 0.84, density: 0.85, light: 0xfdfaf1, shadow: 0x9d968a, glow: 0.55 },
  { z: -52, scale: 2.1, stretch: [1.7, 0.75], wind: [-0.03, 0.009], coverage: 0.8, density: 0.88, light: 0xffffff, shadow: 0x8f8d84, glow: 0.7 },
  { z: -38, scale: 2.6, stretch: [1.0, 1.0], wind: [0.038, -0.008], coverage: 0.78, density: 0.9, light: 0xfefdf8, shadow: 0x82888f, glow: 0.75 },
  { z: -26, scale: 3.2, stretch: [1.6, 0.8], wind: [-0.046, 0.012], coverage: 0.74, density: 0.88, light: 0xffffff, shadow: 0x878d92, glow: 0.65 },
  { z: -16, scale: 4.0, stretch: [1.0, 1.0], wind: [0.058, -0.014], coverage: 0.64, density: 0.82, light: 0xfaf7ee, shadow: 0x80868c, glow: 0.55 },
  { z: -9, scale: 5.2, stretch: [1.5, 0.85], wind: [-0.074, 0.017], coverage: 0.58, density: 0.66, light: 0xffffff, shadow: 0xa9aeab, glow: 0.45 },
  { z: -4.5, scale: 6.6, stretch: [1.0, 1.0], wind: [0.094, -0.02], coverage: 0.52, density: 0.5, light: 0xffffff, shadow: 0xc2c6c3, glow: 0.35 },
];

export function initHeroAtmosphere({ canvas, hero }) {
  if (!canvas || !hero) return () => {};

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const smallScreen = window.matchMedia("(max-width: 700px)");
  const coarsePointer = window.matchMedia("(pointer: coarse)");

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance" });
    // Bright paper base: the hero must stay light even where fog banks are thin.
    renderer.setClearColor(new THREE.Color(0xf1ece1), 1);
  } catch {
    hero.classList.add("scene-ready");
    return () => {};
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 220);
  camera.position.set(0, 0.4, 0);

  const isMobile = () => smallScreen.matches || coarsePointer.matches;
  const activeLayers = () => (isMobile() ? LAYERS.filter((_, i) => i % 2 === 0 || i === LAYERS.length - 1) : LAYERS);

  // Luminous backdrop (sized to cover the frustum at its depth).
  const backdropUniforms = { uTime: { value: 0 }, uScroll: { value: 0 } };
  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(240, 140),
    new THREE.ShaderMaterial({ vertexShader: BACKDROP_VERT, fragmentShader: BACKDROP_FRAG, uniforms: backdropUniforms, depthWrite: false, depthTest: false })
  );
  backdrop.position.z = -100;
  backdrop.renderOrder = -10;
  backdrop.frustumCulled = false;
  scene.add(backdrop);

  // Fog bank layers.
  const fogGroup = new THREE.Group();
  scene.add(fogGroup);
  const fogMaterials = [];
  function buildFogLayers() {
    for (const child of [...fogGroup.children]) {
      fogGroup.remove(child);
      child.geometry.dispose();
      child.material.dispose();
    }
    fogMaterials.length = 0;
    const dist0 = Math.abs(-4.5);
    activeLayers().forEach((layer, i) => {
      const dist = Math.abs(layer.z);
      const grow = dist / dist0;
      const geo = new THREE.PlaneGeometry(30 * grow, 17 * grow, 1, 1);
      const mat = new THREE.ShaderMaterial({
        vertexShader: FOG_VERT,
        fragmentShader: FOG_FRAG,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        uniforms: {
          uTime: { value: Math.random() * 100 },
          uSeed: { value: i * 13.7 + 3.1 },
          uWind: { value: new THREE.Vector2(layer.wind[0], layer.wind[1]) },
          uScale: { value: layer.scale },
          uStretch: { value: new THREE.Vector2(layer.stretch[0], layer.stretch[1]) },
          uCoverage: { value: layer.coverage },
          uDensity: { value: layer.density },
          uLight: { value: new THREE.Color(layer.light) },
          uShadow: { value: new THREE.Color(layer.shadow) },
          uGlowPos: { value: new THREE.Vector2(0.66, 0.68) },
          uGlow: { value: layer.glow },
          uScroll: { value: 0 },
        },
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(0, -0.4 - i * 0.12, layer.z);
      mesh.renderOrder = i + 1;
      mesh.frustumCulled = false;
      fogGroup.add(mesh);
      fogMaterials.push(mat);
    });
  }
  buildFogLayers();

  // Sparse light motes for depth.
  const MOTES_FULL = 340;
  const MOTES_MOBILE = 130;
  let motes = null;
  let moteUniforms = null;
  function buildMotes() {
    if (motes) {
      scene.remove(motes);
      motes.geometry.dispose();
      motes.material.dispose();
    }
    const count = isMobile() ? MOTES_MOBILE : MOTES_FULL;
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 68;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 28;
      positions[i * 3 + 2] = -2 - Math.random() * 68;
      seeds[i * 3] = Math.random();
      seeds[i * 3 + 1] = Math.random();
      seeds[i * 3 + 2] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 3));
    moteUniforms = {
      uTime: { value: 0 },
      uWind: { value: new THREE.Vector2(0.5, 0.1) },
      uPixelRatio: { value: renderer.getPixelRatio() },
      uScroll: { value: 0 },
      uColor: { value: new THREE.Color(0xfff6e0) },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: MOTES_VERT,
      fragmentShader: MOTES_FRAG,
      uniforms: moteUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    motes = new THREE.Points(geo, mat);
    motes.frustumCulled = false;
    motes.renderOrder = 20;
    scene.add(motes);
  }
  buildMotes();

  // State: scroll / pointer, both critically damped each frame.
  let targetScroll = 0;
  let scroll = 0;
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  let visible = true;
  let heroHeight = window.innerHeight;
  let rafId = 0;
  let lastT = performance.now();
  let elapsed = 0;
  let renderedOnce = false;
  // Adaptive quality: step the render resolution down if frames run long,
  // so weak GPUs stay smooth instead of stuttering (one-way, no oscillation).
  // Fog is resolution-independent (soft gradients + large noise features), so the
  // render cap stays well below native DPR: identical look, ~40% less fill cost.
  // A frame-time governor below steps down further on weak GPUs if needed.
  let dprCap = isMobile() ? 1.25 : 1.3;
  let slowFrames = 0;

  function readScroll() {
    targetScroll = Math.min(Math.max(window.scrollY / heroHeight, 0), 1);
    hero.style.setProperty("--scene-opacity", `${Math.max(0, 1 - targetScroll * 1.25)}`);
  }

  function resize() {
    const rect = hero.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width || window.innerWidth));
    const height = Math.max(1, Math.round(rect.height || window.innerHeight));
    heroHeight = hero.offsetHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (moteUniforms) moteUniforms.uPixelRatio.value = dpr;
  }

  function onPointerMove(event) {
    if (reducedMotion.matches || coarsePointer.matches) return;
    pointer.tx = (event.clientX / window.innerWidth - 0.5) * 2;
    pointer.ty = (event.clientY / window.innerHeight - 0.5) * 2;
  }

  const motionScale = () => (reducedMotion.matches ? 0.12 : 1);
  const scrollScale = () => (reducedMotion.matches ? 0.15 : 1);

  function frame(now) {
    rafId = requestAnimationFrame(frame);
    if (!visible || document.hidden) {
      lastT = now;
      return;
    }
    const dt = Math.min((now - lastT) / 1000, 0.05);
    lastT = now;
    elapsed += dt * motionScale();

    // Frame-time governor: sustained slow frames step the resolution down.
    if (renderedOnce && !reducedMotion.matches) {
      if (dt > 0.026 && dprCap > 1.0) {
        slowFrames += 1;
        if (slowFrames >= 45) {
          slowFrames = 0;
          dprCap = Math.max(1.0, dprCap - 0.35);
          resize();
        }
      } else if (dt < 0.02) {
        slowFrames = 0;
      }
    }

    scroll += (targetScroll - scroll) * (reducedMotion.matches ? 0.12 : 0.075);
    if (Math.abs(targetScroll - scroll) < 0.0004) scroll = targetScroll;
    pointer.x += (pointer.tx - pointer.x) * 0.045;
    pointer.y += (pointer.ty - pointer.y) * 0.045;

    const s = scroll * scrollScale();
    camera.position.set(pointer.x * 1.15 * motionScale(), 0.4 + -pointer.y * 0.6 * motionScale() - s * 2.4, s * 15);
    camera.lookAt(pointer.x * 0.5 * motionScale(), -0.6 - s * 1.4, -30);

    backdropUniforms.uTime.value = elapsed;
    backdropUniforms.uScroll.value = s;
    for (const mat of fogMaterials) {
      mat.uniforms.uTime.value = elapsed + mat.uniforms.uSeed.value * 7.0;
      mat.uniforms.uScroll.value = s;
    }
    if (moteUniforms) {
      moteUniforms.uTime.value = elapsed;
      moteUniforms.uScroll.value = s;
    }

    renderer.render(scene, camera);
    if (!renderedOnce) {
      renderedOnce = true;
      hero.classList.add("scene-ready");
    }
  }

  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
  }, { threshold: 0.02 });
  observer.observe(hero);

  let rebuildTimer = 0;
  function onMediaChange() {
    window.clearTimeout(rebuildTimer);
    rebuildTimer = window.setTimeout(() => {
      dprCap = isMobile() ? 1.25 : 1.3;
      slowFrames = 0;
      buildFogLayers();
      buildMotes();
      resize();
    }, 180);
  }

  window.addEventListener("resize", resize, { passive: true });
  window.addEventListener("scroll", readScroll, { passive: true });
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  reducedMotion.addEventListener?.("change", onMediaChange);
  smallScreen.addEventListener?.("change", onMediaChange);
  coarsePointer.addEventListener?.("change", onMediaChange);

  resize();
  readScroll();
  // Reload mid-scroll (e.g. anchor) must land in the right fog depth.
  scroll = targetScroll;
  rafId = requestAnimationFrame(frame);

  return function dispose() {
    cancelAnimationFrame(rafId);
    observer.disconnect();
    window.clearTimeout(rebuildTimer);
    window.removeEventListener("resize", resize);
    window.removeEventListener("scroll", readScroll);
    window.removeEventListener("pointermove", onPointerMove);
    fogGroup.children.forEach((child) => {
      child.geometry.dispose();
      child.material.dispose();
    });
    if (motes) {
      motes.geometry.dispose();
      motes.material.dispose();
    }
    backdrop.geometry.dispose();
    backdrop.material.dispose();
    renderer.dispose();
  };
}
