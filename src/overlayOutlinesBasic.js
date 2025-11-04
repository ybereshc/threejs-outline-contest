import * as THREE from 'three';

export function createVisibleOutlineOverlayBasic(renderer, scene, camera, {
	featherPx = 1.0,   // мягкая кромка (px)
	rings = 2         // 1..3: сколько колец проб (3 = максимум ~24 семпла/пиксель)
} = {}) {

	// ---------- состояние ----------
	const size = new THREE.Vector2();
	const dpr = renderer.getPixelRatio();
	const ss = Math.max(1, 3 - dpr);              // как у вас
	const texel = new THREE.Vector2(1, 1);

	let maskTarget = null;     // RGB = ID
	let outlineTarget = null;  // итоговый контур

	// экранный вывод
	const fsScene = new THREE.Scene();
	const fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
	const fsQuad = new THREE.Mesh(
		new THREE.PlaneGeometry(2, 2),
		new THREE.MeshBasicMaterial({transparent: true, map: null})
	);
	fsScene.add(fsQuad);

	// RT
	function ensureRT() {
		renderer.getSize(size);
		const w = Math.max(1, Math.floor(size.x * dpr * ss));
		const h = Math.max(1, Math.floor(size.y * dpr * ss));
		if (!maskTarget) {
			maskTarget = new THREE.WebGLRenderTarget(w, h, {
				minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
				type: THREE.UnsignedByteType, format: THREE.RGBAFormat
			});
		} else if (maskTarget.width !== w || maskTarget.height !== h) {
			maskTarget.setSize(w, h);
		}
		if (!outlineTarget) {
			outlineTarget = new THREE.WebGLRenderTarget(w, h, {
				minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, // линейный даунсемпл = «бонусный» SSAA
				type: THREE.UnsignedByteType, format: THREE.RGBAFormat
			});
		} else if (outlineTarget.width !== w || outlineTarget.height !== h) {
			outlineTarget.setSize(w, h);
		}
		texel.set(1 / w, 1 / h);
	}

	// сбор целей → как у вас
	const targets = [];
	const blockers = [];
	const encodeIndexToColor = (idx) => {
		return new THREE.Color(
			((idx >> 16) & 0xff) / 255,
			((idx >> 8) & 0xff) / 255,
			((idx) & 0xff) / 255
		);
	};

	let materials = [
		new THREE.MeshBasicMaterial({colorWrite: false}),
	];

	let ts = Date.now();

	setInterval( () => {
		if ( materials.length > 1 && (Date.now() - ts) > 1000 ) {
			materials.length = 1;
		}
	}, 1000 );

	function collectTargets() {
		ts = Date.now();

		targets.length = 0;
		blockers.length = 0;
		scene.traverse(o => {
			if (!o.material) return;
			if (o.stroke) {
				targets.push([o, o.material]);
				o.material = materials[ targets.length ] ??= new THREE.MeshBasicMaterial({color: encodeIndexToColor(targets.length)});
			} else {
				blockers.push([o, o.material]);
				o.material = materials[ 0 ];
			}
		});
	}

	function restoreTargets() {
		for (const [o, m] of targets) o.material = m;
		for (const [o, m] of blockers) o.material = m;
	}

	function renderIdMask() {
		ensureRT();
		const prevTarget = renderer.getRenderTarget();
		const prevClear = renderer.getClearColor(new THREE.Color());
		const prevAlpha = renderer.getClearAlpha();

		renderer.setRenderTarget(maskTarget);
		renderer.setClearColor(0x000000, 0);
		renderer.clear(true, true, true);
		collectTargets();
		try {
			renderer.render(scene, camera);
		} finally {
			restoreTargets();
			renderer.setClearColor(prevClear, prevAlpha);
			renderer.setRenderTarget(prevTarget);
		}
	}

	// LUT (цвет/прозрачность/ширина)
	let paramsTex = null; // RGBA8: rgb=color, a=opacity
	let widthTex = null; // R8: width (норм 0..1)*MAX_W
	let lutSize = 0;

	function buildLUT() {
		const N = targets.length;
		if (N === 0) {
			lutSize = 0;
			paramsTex?.dispose();
			widthTex?.dispose();
			paramsTex = null;
			widthTex = null;
			return;
		}
		const MAX_W = 32; // верхняя «целевая» толщина; фактически мы пробы не делаем на всю толщину (см. ниже)
		const params = new Uint8Array(N * 4);
		const widths = new Uint8Array(N * 4);
		for (let i = 0; i < N; i++) {
			const [obj] = targets[i];
			const col = new THREE.Color(obj.stroke.color ?? 0xffffff);
			const op = Math.max(0, Math.min(1, obj.stroke.opacity ?? 1));
			const wpx = Math.max(1, Math.min(MAX_W, Math.round(obj.stroke.width ?? 1) * ss));
			const base = i * 4;

			params[base    ] = Math.round(col.r * 255);
			params[base + 1] = Math.round(col.g * 255);
			params[base + 2] = Math.round(col.b * 255);
			params[base + 3] = Math.round(op * 255);

			widths[base    ] = Math.round((wpx * 2 / MAX_W) * 255);
			widths[base + 1] = 0;
			widths[base + 2] = 0;
			widths[base + 3] = 0;
		}
		const mk = (arr) => {
			const t = new THREE.DataTexture(arr, N, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
			t.minFilter = t.magFilter = THREE.NearestFilter;
			t.needsUpdate = true;
			return t;
		};
		if (!paramsTex || lutSize !== N) {
			paramsTex?.dispose();
			widthTex?.dispose();
			paramsTex = mk(params);
			widthTex = mk(widths);
			lutSize = N;
		} else {
			paramsTex.image.data.set(params);
			paramsTex.needsUpdate = true;
			widthTex.image.data.set(widths);
			widthTex.needsUpdate = true;
		}
	}

	// быстрый полноэкранный шейдер
	const outlineMat = new THREE.ShaderMaterial({
		transparent: true, depthTest: false, depthWrite: false, blending: THREE.NormalBlending,
		uniforms: {
			tId: {value: null},
			tParams: {value: null},
			tWidth: {value: null},
			texel: {value: new THREE.Vector2(1, 1)},
			lutSize: {value: 0},
			featherPx: {value: featherPx},
			ringsU: {value: Math.max(1, Math.min(3, rings))} // 1..3
		},
		vertexShader: `
      varying vec2 vUv;
      void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }
    `,
		fragmentShader: `
      precision mediump float; // mediump быстрее на macOS
      uniform sampler2D tId, tParams, tWidth;
      uniform vec2 texel;
      uniform int lutSize;
      uniform float featherPx;
      uniform int ringsU;
      varying vec2 vUv;

      // декод ID без ints/битов
      float idf(vec3 c){ vec3 k = round(c*255.0); return dot(k, vec3(65536.0, 256.0, 1.0)); }
      float fetchW(float idx){
        if (idx < 1.0 || idx > float(lutSize)) return 0.0;
        float u = ((idx-1.0)+0.5)/float(lutSize);
        float wn = texture2D(tWidth, vec2(u,0.5)).r;
        return max(1.0, floor(wn * 32.0 + 0.5)); // синхронизировано с MAX_W
      }
      vec4 fetchP(float idx){
        if (idx < 1.0 || idx > float(lutSize)) return vec4(0.0);
        float u = ((idx-1.0)+0.5)/float(lutSize);
        return texture2D(tParams, vec2(u,0.5));
      }

      // 8 направлений, нормированные
      const vec2 DIR[8] = vec2[8](
        vec2( 1.0,  0.0), vec2(-1.0,  0.0),
        vec2( 0.0,  1.0), vec2( 0.0, -1.0),
        vec2( 0.70710678,  0.70710678), vec2(-0.70710678,  0.70710678),
        vec2( 0.70710678, -0.70710678), vec2(-0.70710678, -0.70710678)
      );

      // фиксированный, короткий поиск: 1..3 кольца (≈8,16,24 проб)
      // возвращаем:
      //  useId — ID объекта для окраски (на фоне берём найденный соседний ID)
      //  dSteps — сколько «шагов» до границы (1..3)
      void findEdgeFast(out float useId, out float dSteps){
        vec3 c0 = texture2D(tId, vUv).rgb;
        float id0 = idf(c0);
        useId = id0; dSteps = 99.0;

        // если фон, будем красить в цвет ближайшего объекта; если не фон — в цвет самого объекта
        for (int r=1; r<=3; r++){
          if (r > ringsU) break;
          float rr = float(r);
          for (int d=0; d<8; d++){
            vec2 uv = vUv + DIR[d] * (rr * texel);
            float idk = idf(texture2D(tId, uv).rgb);
            bool hit = (id0 > 0.5) ? (abs(idk - id0) > 0.5) : (idk > 0.5);
            if (hit){
              dSteps = rr;
              if (id0 < 0.5) useId = idk; // фон → красим найденным объектом
              return;
            }
          }
        }
      }

      void main(){
        float useId, distS;
        findEdgeFast(useId, distS);
        if (distS > 3.5) discard; // ничего близко

        float w = fetchW(useId);
        if (w <= 0.0) discard;

        float halfW = 0.5 * w;
        float d     = distS; // оценка расстояния (в px) до границы
        float feather = max(featherPx, 0.0);

        if (d > halfW + feather) discard;

        vec4 p = fetchP(useId);
        if (p.a <= 0.0) discard;

        // плавная кромка
        float alpha = 1.0;
        if (feather > 0.0){
          alpha = 1.0 - smoothstep(halfW - feather, halfW + feather, d);
        }
        gl_FragColor = vec4(p.rgb, p.a * alpha);
      }
    `
	});

	const screen = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), outlineMat);
	const outlineScene = new THREE.Scene();
	outlineScene.add(screen);

	// основной цикл
	function update() {
		// 1) ID-маска
		renderIdMask();
		// 2) LUT
		buildLUT();

		// 3) Контур
		const prevTarget = renderer.getRenderTarget();
		const prevClear = renderer.getClearColor(new THREE.Color());
		const prevAlpha = renderer.getClearAlpha();

		ensureRT();
		renderer.setRenderTarget(outlineTarget);
		renderer.setClearColor(0x000000, 0);
		renderer.clear(true, true, true);

		outlineMat.uniforms.tId.value = maskTarget.texture;
		outlineMat.uniforms.tParams.value = paramsTex;
		outlineMat.uniforms.tWidth.value = widthTex;
		outlineMat.uniforms.texel.value.copy(texel);
		outlineMat.uniforms.lutSize.value = targets.length | 0;
		outlineMat.uniforms.featherPx.value = featherPx;
		outlineMat.uniforms.ringsU.value = Math.max(1, Math.min(3, rings));

		renderer.render(outlineScene, fsCam);

		renderer.setClearColor(prevClear, prevAlpha);
		renderer.setRenderTarget(prevTarget);
	}

	function render() {
		update();

		if ( outlineTarget ) {
			const prevAuto = renderer.autoClear;
			renderer.autoClear = false;
			fsQuad.material.map = outlineTarget.texture;
			renderer.render(fsScene, fsCam);
			renderer.autoClear = prevAuto;
		}
	}

	function dispose() {
		maskTarget?.dispose();
		outlineTarget?.dispose();
		paramsTex?.dispose();
		widthTex?.dispose();
		fsQuad.geometry?.dispose();
		fsQuad.material?.dispose();
		screen.geometry?.dispose();
		screen.material?.dispose();
	}

	return {render, update, dispose};
}
