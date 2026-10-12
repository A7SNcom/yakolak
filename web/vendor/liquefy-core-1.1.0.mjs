//#region src/math.ts
const clamp = (value, minimum = 0, maximum = 1) => {
	return Math.min(Math.max(value, minimum), maximum);
};
const lerp = (from, to, progress) => {
	return from + (to - from) * progress;
};
const mapRange = (value, inputMinimum, inputMaximum, outputMinimum, outputMaximum) => {
	if (inputMaximum === inputMinimum) return outputMinimum;
	const progress = (value - inputMinimum) / (inputMaximum - inputMinimum);
	return lerp(outputMinimum, outputMaximum, progress);
};
const hexToRgb = (hex) => {
	const normalized = hex.trim().replace("#", "");
	const expanded = normalized.length === 3 ? normalized.split("").map((character) => character + character).join("") : normalized;
	if (!/^[0-9a-f]{6}$/i.test(expanded)) return [
		.58,
		.78,
		1
	];
	return [
		Number.parseInt(expanded.slice(0, 2), 16) / 255,
		Number.parseInt(expanded.slice(2, 4), 16) / 255,
		Number.parseInt(expanded.slice(4, 6), 16) / 255
	];
};

//#endregion
//#region src/lens.ts
const maximumMapDimension = 640;
/**
* Exponent of the bezel cross-section. Tuned by measuring a rendered pill
* against a hard-edged backdrop: below this the rim reads as a soft vignette
* rather than glass, and above it the bend piles up against the rim and the
* rounded ends stop looking like one continuous surface.
*/
const defaultBezelCurve = 2;
/**
* Ceiling on how much the rim may squeeze the backdrop. Held below 1 so the
* sample mapping stays one-to-one, with the margin covering the extra scale the
* red channel carries when dispersion is on.
*/
const maximumCompression = .88;
const vertexShaderSource$1 = `#version 300 es
in vec2 a_position;
out vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;
const fragmentShaderSource$1 = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform vec2 u_size;
uniform float u_radius;
uniform float u_bezel;
uniform float u_curve;

float sdRoundedRect(vec2 point, vec2 halfSize, float radius) {
  vec2 q = abs(point) - halfSize + radius;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}

void main() {
  vec2 pixel = vec2(v_uv.x, 1.0 - v_uv.y) * u_size;
  vec2 p = pixel - u_size * 0.5;
  vec2 halfSize = u_size * 0.5 - 0.5;
  float radius = min(u_radius, min(halfSize.x, halfSize.y));
  float d = sdRoundedRect(p, halfSize, radius);

  if (d > 0.0) {
    outColor = vec4(0.5, 0.5, 0.5, 1.0);
    return;
  }

  float t = clamp(1.0 + d / u_bezel, 0.0, 1.0);
  float profile = pow(t, u_curve);

  float epsilon = 1.0;
  vec2 gradient = vec2(
    sdRoundedRect(p + vec2(epsilon, 0.0), halfSize, radius) - sdRoundedRect(p - vec2(epsilon, 0.0), halfSize, radius),
    sdRoundedRect(p + vec2(0.0, epsilon), halfSize, radius) - sdRoundedRect(p - vec2(0.0, epsilon), halfSize, radius)
  );
  vec2 outwardNormal = gradient / max(length(gradient), 0.0001);

  vec2 displacement = -outwardNormal * profile;
  outColor = vec4(displacement * 0.5 + 0.5, 0.5, 1.0);
}
`;
let sharedContext;
const getLensContext = () => {
	if (sharedContext !== void 0) return sharedContext;
	if (typeof document === "undefined") {
		sharedContext = null;
		return sharedContext;
	}
	const canvas = document.createElement("canvas");
	const gl = canvas.getContext("webgl2", {
		alpha: false,
		antialias: false,
		depth: false,
		preserveDrawingBuffer: true,
		stencil: false
	});
	if (!gl) {
		sharedContext = null;
		return sharedContext;
	}
	const compile = (type, source) => {
		const shader = gl.createShader(type);
		if (!shader) return null;
		gl.shaderSource(shader, source);
		gl.compileShader(shader);
		if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
		gl.deleteShader(shader);
		return null;
	};
	const vertexShader = compile(gl.VERTEX_SHADER, vertexShaderSource$1);
	const fragmentShader = compile(gl.FRAGMENT_SHADER, fragmentShaderSource$1);
	const program = vertexShader && fragmentShader ? gl.createProgram() : null;
	if (!vertexShader || !fragmentShader || !program) {
		sharedContext = null;
		return sharedContext;
	}
	gl.attachShader(program, vertexShader);
	gl.attachShader(program, fragmentShader);
	gl.linkProgram(program);
	gl.deleteShader(vertexShader);
	gl.deleteShader(fragmentShader);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		gl.deleteProgram(program);
		sharedContext = null;
		return sharedContext;
	}
	gl.useProgram(program);
	const buffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
		-1,
		-1,
		1,
		-1,
		-1,
		1,
		-1,
		1,
		1,
		-1,
		1,
		1
	]), gl.STATIC_DRAW);
	const position = gl.getAttribLocation(program, "a_position");
	gl.enableVertexAttribArray(position);
	gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
	sharedContext = {
		canvas,
		gl,
		uniforms: {
			bezel: gl.getUniformLocation(program, "u_bezel"),
			curve: gl.getUniformLocation(program, "u_curve"),
			radius: gl.getUniformLocation(program, "u_radius"),
			size: gl.getUniformLocation(program, "u_size")
		}
	};
	return sharedContext;
};
const isLensRenderingSupported = () => getLensContext() !== null;
const createLensMap = (options) => {
	const context = getLensContext();
	const width = Math.max(2, Math.round(options.width));
	const height = Math.max(2, Math.round(options.height));
	if (!context || width < 4 || height < 4) return null;
	const minimumSide = Math.min(width, height);
	const radius = clamp(options.radius, 0, minimumSide / 2);
	const bezel = clamp(options.bezel ?? Math.max(10, minimumSide * .22), 4, minimumSide / 2);
	const curve = clamp(options.curve ?? defaultBezelCurve, .5, 4);
	const maximumDisplacement = bezel * (clamp(options.strength ?? 1, 0, 1) * maximumCompression) / curve;
	const downscale = Math.min(1, maximumMapDimension / Math.max(width, height));
	const mapWidth = Math.max(4, Math.round(width * downscale));
	const mapHeight = Math.max(4, Math.round(height * downscale));
	const { canvas, gl, uniforms } = context;
	if (canvas.width !== mapWidth || canvas.height !== mapHeight) {
		canvas.width = mapWidth;
		canvas.height = mapHeight;
	}
	gl.viewport(0, 0, mapWidth, mapHeight);
	gl.uniform2f(uniforms.size, mapWidth, mapHeight);
	gl.uniform1f(uniforms.radius, radius * downscale);
	gl.uniform1f(uniforms.bezel, bezel * downscale);
	gl.uniform1f(uniforms.curve, curve);
	gl.drawArrays(gl.TRIANGLES, 0, 6);
	return {
		height,
		scale: maximumDisplacement * 2,
		url: canvas.toDataURL("image/png"),
		width
	};
};

//#endregion
//#region src/media.ts
/**
* Not every DOM implementation ships `matchMedia` — jsdom is the one you hit
* first, but any partial DOM counts. Reading a preference should never be the
* thing that throws, so an unavailable query reads as "no preference stated".
*/
const mediaQuery = (query) => typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(query) : { matches: false };

//#endregion
//#region src/lens-filter.ts
const SVG_NS = "http://www.w3.org/2000/svg";
let filterCount = 0;
let defsRoot = null;
let lensSupport;
const isLensSupported = () => {
	if (lensSupport !== void 0) return lensSupport;
	if (typeof window === "undefined" || typeof CSS === "undefined" || typeof document === "undefined") return false;
	const parses = CSS.supports("backdrop-filter", "url(#lq-probe)") || CSS.supports("-webkit-backdrop-filter", "url(#lq-probe)");
	const chromium = "userAgentData" in navigator || "chrome" in window;
	lensSupport = parses && chromium;
	return lensSupport;
};
const getDefsRoot = () => {
	if (defsRoot?.isConnected) return defsRoot;
	defsRoot = document.createElementNS(SVG_NS, "svg");
	defsRoot.setAttribute("aria-hidden", "true");
	defsRoot.setAttribute("width", "0");
	defsRoot.setAttribute("height", "0");
	defsRoot.style.position = "absolute";
	defsRoot.style.overflow = "hidden";
	document.body.appendChild(defsRoot);
	return defsRoot;
};
const createElement = (tag, attributes) => {
	const element = document.createElementNS(SVG_NS, tag);
	for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
	return element;
};
const keepChannelMatrix = (channel) => {
	const passthrough = channel === 0 ? "1 0 0 0 0" : channel === 1 ? "0 1 0 0 0" : "0 0 1 0 0";
	const zero = "0 0 0 0 0";
	return [
		channel === 0 ? passthrough : zero,
		channel === 1 ? passthrough : zero,
		channel === 2 ? passthrough : zero,
		"0 0 0 1 0"
	].join(" ");
};
const attachLiquidLens = (element, options = {}) => {
	if (!isLensSupported()) return null;
	if (options.respectReducedTransparency === true && mediaQuery("(prefers-reduced-transparency: reduce)").matches) return null;
	const dispersion = clamp(options.dispersion ?? 0, 0, 1);
	const blur = clamp(options.blur ?? .6, 0, 24);
	const saturation = clamp(options.saturation ?? 1.24, 0, 3);
	const strength = clamp(options.strength ?? 1, 0, 1);
	const id = `lq-lens-${filterCount += 1}`;
	const filter = createElement("filter", {
		"color-interpolation-filters": "sRGB",
		filterUnits: "userSpaceOnUse",
		id,
		x: "0",
		y: "0"
	});
	const map = createElement("feImage", {
		preserveAspectRatio: "none",
		result: "lq-map",
		x: "0",
		y: "0"
	});
	filter.appendChild(map);
	const displacements = [];
	if (dispersion > 0) {
		const makeBranch = (channel) => {
			const displacement = createElement("feDisplacementMap", {
				in: "SourceGraphic",
				in2: "lq-map",
				result: `lq-d${channel}`,
				xChannelSelector: "R",
				yChannelSelector: "G"
			});
			const isolate = createElement("feColorMatrix", {
				in: `lq-d${channel}`,
				result: `lq-c${channel}`,
				type: "matrix",
				values: keepChannelMatrix(channel)
			});
			filter.appendChild(displacement);
			filter.appendChild(isolate);
			displacements.push(displacement);
			return `lq-c${channel}`;
		};
		const red = makeBranch(0);
		const green = makeBranch(1);
		const blue = makeBranch(2);
		filter.appendChild(createElement("feComposite", {
			in: red,
			in2: green,
			k1: "0",
			k2: "1",
			k3: "1",
			k4: "0",
			operator: "arithmetic",
			result: "lq-rg"
		}));
		filter.appendChild(createElement("feComposite", {
			in: "lq-rg",
			in2: blue,
			k1: "0",
			k2: "1",
			k3: "1",
			k4: "0",
			operator: "arithmetic",
			result: "lq-rgb"
		}));
	} else {
		const displacement = createElement("feDisplacementMap", {
			in: "SourceGraphic",
			in2: "lq-map",
			result: "lq-rgb",
			xChannelSelector: "R",
			yChannelSelector: "G"
		});
		filter.appendChild(displacement);
		displacements.push(displacement);
	}
	filter.appendChild(createElement("feGaussianBlur", {
		in: "lq-rgb",
		result: "lq-soft",
		stdDeviation: String(blur)
	}));
	filter.appendChild(createElement("feColorMatrix", {
		in: "lq-soft",
		type: "saturate",
		values: String(saturation)
	}));
	getDefsRoot().appendChild(filter);
	let destroyed = false;
	let refreshFrame = 0;
	const refresh = () => {
		if (destroyed || !element.isConnected) return;
		const width = element.offsetWidth;
		const height = element.offsetHeight;
		if (width < 8 || height < 8) return;
		const computed = getComputedStyle(element);
		const parsedRadius = Number.parseFloat(computed.borderTopLeftRadius);
		const radius = options.radius ?? (Number.isFinite(parsedRadius) ? parsedRadius : 16);
		const lensMap = createLensMap({
			bezel: options.bezel,
			curve: options.curve,
			height,
			radius,
			strength,
			width
		});
		if (!lensMap) return;
		filter.setAttribute("width", String(width));
		filter.setAttribute("height", String(height));
		map.setAttribute("width", String(width));
		map.setAttribute("height", String(height));
		map.setAttribute("href", lensMap.url);
		const spread = dispersion * .08;
		displacements.forEach((displacement, index) => {
			const factor = displacements.length === 3 ? 1 + spread * (1 - index) : 1;
			displacement.setAttribute("scale", String(lensMap.scale * factor));
		});
		element.style.setProperty("--lq-lens", `url(#${id})`);
		element.dataset.liquidLens = "true";
	};
	const scheduleRefresh = () => {
		cancelAnimationFrame(refreshFrame);
		refreshFrame = requestAnimationFrame(refresh);
	};
	const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleRefresh);
	resizeObserver?.observe(element);
	scheduleRefresh();
	return {
		destroy: () => {
			destroyed = true;
			cancelAnimationFrame(refreshFrame);
			resizeObserver?.disconnect();
			filter.remove();
			element.style.removeProperty("--lq-lens");
			delete element.dataset.liquidLens;
		},
		refresh: scheduleRefresh
	};
};

//#endregion
//#region src/elastic.ts
const atRest = {
	offsetX: 0,
	offsetY: 0,
	stretchX: 0,
	stretchY: 0
};
/**
* How a surface leans toward a pointer that has not reached it yet.
*
* The falloff is measured from the element's *edge* rather than its centre, so
* a wide card starts to lean when the pointer nears its side instead of waiting
* for it to near the middle — which is what makes a dock of different-sized
* things respond as one row. Squaring it keeps the pull from switching on at
* the boundary of the reach.
*
* The stretch splits the lean between the two axes by the square of the
* direction, and takes half of it back on the other axis, so a surface pulled
* sideways goes wide and slightly flat instead of simply getting bigger.
*/
const elasticPull = (bounds, pointerX, pointerY, options = {}) => {
	const elasticity = clamp(options.elasticity ?? 0, 0, 1);
	const reach = Math.max(1, options.reach ?? 180);
	if (elasticity === 0 || bounds.width < 1 || bounds.height < 1) return atRest;
	const deltaX = pointerX - (bounds.left + bounds.width / 2);
	const deltaY = pointerY - (bounds.top + bounds.height / 2);
	const gapX = Math.max(0, Math.abs(deltaX) - bounds.width / 2);
	const gapY = Math.max(0, Math.abs(deltaY) - bounds.height / 2);
	const gap = Math.hypot(gapX, gapY);
	if (gap >= reach) return atRest;
	const falloff = (1 - gap / reach) ** 2;
	const distance = Math.hypot(deltaX, deltaY);
	if (distance < .001) return atRest;
	const directionX = deltaX / distance;
	const directionY = deltaY / distance;
	const lean = elasticity * falloff;
	const travel = Math.min(distance, reach) * lean;
	const axisX = directionX * directionX;
	const axisY = directionY * directionY;
	const stretch = lean * .4;
	return {
		offsetX: directionX * travel * .22,
		offsetY: directionY * travel * .22,
		stretchX: stretch * (axisX - axisY * .5),
		stretchY: stretch * (axisY - axisX * .5)
	};
};
const registrations = /* @__PURE__ */ new Set();
let listening = false;
let frame = 0;
let pointerX = 0;
let pointerY = 0;
let pointerSeen = false;
const invalidate = () => {
	for (const registration of registrations) registration.rect = null;
};
const dispatch = () => {
	frame = 0;
	for (const registration of registrations) {
		if (!registration.element.isConnected) continue;
		registration.rect ??= registration.element.getBoundingClientRect();
		registration.notify(registration.rect, pointerX, pointerY);
	}
};
const schedule = () => {
	if (frame) return;
	frame = requestAnimationFrame(dispatch);
};
const handlePointer = (event) => {
	pointerX = event.clientX;
	pointerY = event.clientY;
	pointerSeen = true;
	schedule();
};
const stopListening = () => {
	if (!listening) return;
	listening = false;
	cancelAnimationFrame(frame);
	frame = 0;
	window.removeEventListener("pointermove", handlePointer);
	window.removeEventListener("scroll", invalidate, true);
	window.removeEventListener("resize", invalidate);
};
/**
* Subscribes an element to the pointer, wherever the pointer is on the page.
*
* One window listener serves every surface, because the alternative — a
* listener per component — measures the same pointer dozens of times per move
* and lays out the whole page doing it. Rects are cached until something that
* can move them happens, and the fan-out runs on an animation frame, so a fast
* sweep across the page costs one measurement pass per frame no matter how many
* surfaces are mounted.
*/
const observeElasticPointer = (element, notify) => {
	if (typeof window === "undefined") return () => {};
	const registration = {
		element,
		notify,
		rect: null
	};
	registrations.add(registration);
	if (!listening) {
		listening = true;
		window.addEventListener("pointermove", handlePointer, { passive: true });
		window.addEventListener("scroll", invalidate, {
			capture: true,
			passive: true
		});
		window.addEventListener("resize", invalidate, { passive: true });
	}
	if (pointerSeen) schedule();
	return () => {
		registrations.delete(registration);
		if (registrations.size === 0) stopListening();
	};
};

//#endregion
//#region src/renderer.ts
const vertexShaderSource = `#version 300 es
in vec2 a_position;
out vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;
const fragmentShaderSource = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform vec2 u_resolution;
uniform float u_dpr;
uniform float u_radius;
uniform vec2 u_pointer;
uniform vec3 u_tint;
uniform float u_time;
uniform float u_active;
uniform float u_intensity;
uniform float u_wobble;
uniform vec2 u_stretch;
uniform vec4 u_ripple;
uniform float u_press;
// x glow, y ripple, z sparkle, w shimmer — each 0 or 1, so a surface can be
// stripped back to the plain refracting material one ornament at a time.
uniform vec4 u_ornaments;

const float TAU = 6.28318530718;

float sdRoundedRect(vec2 point, vec2 halfSize, float radius) {
  vec2 q = abs(point) - halfSize + radius;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}

vec3 iridescence(float phase) {
  return 0.5 + 0.5 * cos(TAU * (phase + vec3(0.0, 0.33, 0.67)));
}

void main() {
  vec2 sizePx = u_resolution / u_dpr;
  vec2 p = (v_uv - 0.5) * sizePx;
  float minSide = min(sizePx.x, sizePx.y);
  float radius = min(u_radius, minSide * 0.5);

  float angle = atan(p.y, p.x);
  float wobbleAmp = u_wobble * minSide * 0.05;
  float wobble = sin(angle * 3.0 + u_time * 15.0) * 0.62
    + sin(angle * 5.0 - u_time * 10.0 + 1.7) * 0.38;

  vec2 halfSize = sizePx * 0.5 - 1.0;
  halfSize *= vec2(1.0 + u_stretch.x * 0.4, 1.0 + u_stretch.y * 0.4);
  float d = sdRoundedRect(p, halfSize, radius) + wobble * wobbleAmp;
  float edgeDist = -d;

  float inside = smoothstep(0.9, -0.9, d);

  float rimWidth = 2.1 + u_active * 1.7 + u_press * 1.2;
  float rimR = exp(-pow(max(edgeDist - 0.4, 0.0) / (rimWidth * 1.3), 1.5));
  float rimG = exp(-pow(max(edgeDist - 1.0, 0.0) / rimWidth, 1.5));
  float rimB = exp(-pow(max(edgeDist - 1.7, 0.0) / (rimWidth * 0.85), 1.5));
  float topBias = smoothstep(-0.25, 0.95, v_uv.y);

  float bezelWidth = clamp(minSide * 0.16, 6.0, 26.0);
  float bezel = smoothstep(bezelWidth, 0.0, edgeDist) * (1.0 - max(max(rimR, rimG), rimB));

  vec2 pointerPx = (u_pointer - 0.5) * sizePx;
  float pointerDist = length(p - pointerPx);
  float glowSigma = minSide * 0.42 + 30.0 * u_active;
  float glow = exp(-pointerDist * pointerDist / (2.0 * glowSigma * glowSigma)) * u_active;
  float core = exp(-pointerDist * pointerDist / (2.0 * 240.0)) * u_active;

  float ripple = 0.0;
  if (u_ripple.w > 0.001) {
    vec2 ripplePx = (u_ripple.xy - 0.5) * sizePx;
    float rippleDist = length(p - ripplePx);
    float front = rippleDist - u_ripple.z * 320.0;
    float ringWidth = 11.0 + u_ripple.z * 46.0;
    float ring = exp(-front * front / (2.0 * ringWidth * ringWidth));
    ripple = ring * exp(-u_ripple.z * 3.4) * u_ripple.w;
  }

  float sheenAxis = p.x / sizePx.x * 0.55 - p.y / sizePx.y + 0.34 - (u_pointer.x - 0.5) * 0.22;
  float sheen = exp(-sheenAxis * sheenAxis * 30.0) * (0.05 + u_active * 0.1);

  float sparklePhase = sin((p.x + p.y * 1.3) * 0.11 + u_time * 1.1) * sin(p.x * 0.07 - u_time * 0.8);
  float sparkle = max(0.0, sparklePhase) * 0.05 * u_active;

  // Shimmer owns every bit of colour the material adds on its own: the cool
  // cast on the highlight and the red/green/blue split across the rim, as well
  // as the iridescent band. With it off the rim is one neutral line, so the
  // only hue on a surface is the tint it was given.
  vec3 white = mix(vec3(0.985), vec3(0.97, 0.985, 1.0), u_ornaments.w);
  vec3 rimTint = mix(u_tint * 0.8 + vec3(0.2), white, topBias);
  vec3 rim = mix(vec3(rimG), vec3(rimR, rimG, rimB), u_ornaments.w) * rimTint;
  vec3 shimmer = iridescence(angle / TAU + u_time * 0.04 + u_wobble * 0.3) * rimG * (0.08 + u_wobble * 0.16);

  float rimStrength = (0.38 + 0.62 * u_active + 0.45 * u_wobble) * u_intensity;

  vec3 color = vec3(0.0);
  color += rim * rimStrength;
  color += shimmer * u_intensity * u_ornaments.w;
  color += mix(white, u_tint, 0.35) * bezel * (0.015 + u_active * 0.02) * u_intensity;
  color += white * (glow * 0.13 + core * 0.22) * u_intensity * u_ornaments.x;
  color += (white * 0.75 + u_tint * 0.25) * ripple * 0.4 * u_intensity * u_ornaments.y;
  color += white * sheen * u_intensity;
  color += white * sparkle * u_intensity * u_ornaments.z;

  color *= inside;
  float alpha = clamp(max(color.r, max(color.g, color.b)), 0.0, 0.85);
  outColor = vec4(color, alpha);
}
`;
var SharedGlassContext = class SharedGlassContext {
	static instance;
	canvas;
	gl = null;
	program = null;
	uniforms = {};
	static get() {
		if (!SharedGlassContext.instance) SharedGlassContext.instance = new SharedGlassContext();
		return SharedGlassContext.instance;
	}
	constructor() {
		this.canvas = document.createElement("canvas");
		const gl = this.canvas.getContext("webgl2", {
			alpha: true,
			antialias: true,
			depth: false,
			premultipliedAlpha: true,
			preserveDrawingBuffer: true,
			stencil: false
		});
		if (!gl) return;
		const program = createProgram(gl, vertexShaderSource, fragmentShaderSource);
		if (!program) return;
		this.gl = gl;
		this.program = program;
		for (const name of [
			"active",
			"dpr",
			"intensity",
			"ornaments",
			"pointer",
			"press",
			"radius",
			"resolution",
			"ripple",
			"stretch",
			"time",
			"tint",
			"wobble"
		]) this.uniforms[name] = gl.getUniformLocation(program, `u_${name}`);
		const buffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
			-1,
			-1,
			1,
			-1,
			-1,
			1,
			-1,
			1,
			1,
			-1,
			1,
			1
		]), gl.STATIC_DRAW);
		const position = gl.getAttribLocation(program, "a_position");
		gl.enableVertexAttribArray(position);
		gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
		gl.enable(gl.SCISSOR_TEST);
	}
	draw(state, wobble) {
		const gl = this.gl;
		if (!gl || !this.program) return false;
		if (this.canvas.width < state.width || this.canvas.height < state.height) {
			this.canvas.width = Math.max(this.canvas.width, state.width);
			this.canvas.height = Math.max(this.canvas.height, state.height);
		}
		gl.viewport(0, 0, state.width, state.height);
		gl.scissor(0, 0, state.width, state.height);
		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.useProgram(this.program);
		gl.uniform2f(this.uniforms.resolution ?? null, state.width, state.height);
		gl.uniform1f(this.uniforms.dpr ?? null, state.dpr);
		gl.uniform1f(this.uniforms.radius ?? null, state.radius);
		gl.uniform2f(this.uniforms.pointer ?? null, state.pointer[0], state.pointer[1]);
		gl.uniform3f(this.uniforms.tint ?? null, state.tint[0], state.tint[1], state.tint[2]);
		gl.uniform1f(this.uniforms.time ?? null, state.time);
		gl.uniform1f(this.uniforms.active ?? null, state.active);
		gl.uniform1f(this.uniforms.intensity ?? null, state.intensity);
		gl.uniform1f(this.uniforms.wobble ?? null, wobble);
		gl.uniform2f(this.uniforms.stretch ?? null, state.stretch[0], state.stretch[1]);
		gl.uniform1f(this.uniforms.press ?? null, state.press);
		gl.uniform4f(this.uniforms.ripple ?? null, state.ripple[0], state.ripple[1], state.ripple[2], state.ripple[3]);
		gl.uniform4f(this.uniforms.ornaments ?? null, state.ornaments[0], state.ornaments[1], state.ornaments[2], state.ornaments[3]);
		gl.drawArrays(gl.TRIANGLES, 0, 6);
		return true;
	}
};
var LiquidRenderer = class {
	canvas;
	active = 0;
	animationFrame = 0;
	blitContext = null;
	destroyed = false;
	hovering = false;
	intensity;
	lastTime = 0;
	ornaments;
	pointer = [.5, .5];
	press = 0;
	pressTarget = 0;
	radius;
	resizeObserver;
	rippleAge = -1;
	rippleOrigin = [.5, .5];
	rippleStrength = 0;
	stretch = [0, 0];
	supported = false;
	tint;
	wobble = 0;
	constructor(canvas, options = {}) {
		this.canvas = canvas;
		this.intensity = clamp(options.intensity ?? 1.2, 0, 1.4);
		this.ornaments = [
			options.glow === false ? 0 : 1,
			options.ripple === false ? 0 : 1,
			options.sparkle === false ? 0 : 1,
			options.shimmer === true ? 1 : 0
		];
		this.radius = options.radius ?? 16;
		this.tint = hexToRgb(options.tint ?? "#8f8f8f");
		this.resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => this.resize());
		this.supported = SharedGlassContext.get().gl !== null;
		this.blitContext = this.supported ? canvas.getContext("2d") : null;
		if (!this.supported || !this.blitContext) {
			this.supported = false;
			this.canvas.dataset.fallback = "true";
			return;
		}
		this.resizeObserver?.observe(this.canvas);
		this.resize();
		this.render(performance.now());
	}
	destroy() {
		this.destroyed = true;
		cancelAnimationFrame(this.animationFrame);
		this.resizeObserver?.disconnect();
	}
	isSupported() {
		return this.supported;
	}
	pulse(strength = 1) {
		this.ripple(this.pointer[0], 1 - this.pointer[1], strength);
	}
	ripple(x, y, strength = 1) {
		this.rippleOrigin = [clamp(x), clamp(1 - y)];
		this.rippleAge = 0;
		this.rippleStrength = clamp(strength, 0, 1.5);
		this.start();
	}
	setActive(active) {
		this.hovering = active;
		this.start();
	}
	setIntensity(intensity) {
		this.intensity = clamp(intensity, 0, 1.4);
		this.start();
	}
	setPointer(x, y) {
		this.pointer = [clamp(x), clamp(1 - y)];
		this.start();
	}
	setPress(pressed) {
		this.pressTarget = pressed ? 1 : 0;
		this.start();
	}
	setRadius(radius) {
		this.radius = Math.max(0, radius);
		this.start();
	}
	setStretch(x, y) {
		this.stretch = [clamp(x, -1, 1), clamp(y, -1, 1)];
	}
	setTint(tint) {
		this.tint = hexToRgb(tint);
		this.start();
	}
	setWobble(energy) {
		this.wobble = clamp(energy, 0, 1);
		if (this.wobble > .003) this.start();
	}
	get pixelRatio() {
		return Math.min(window.devicePixelRatio || 1, 2);
	}
	resize() {
		const width = Math.max(1, Math.round(this.canvas.clientWidth * this.pixelRatio));
		const height = Math.max(1, Math.round(this.canvas.clientHeight * this.pixelRatio));
		if (this.canvas.width === width && this.canvas.height === height) return;
		this.canvas.width = width;
		this.canvas.height = height;
		this.render(performance.now());
	}
	render(time) {
		if (!this.supported || this.destroyed || !this.blitContext) return;
		const shared = SharedGlassContext.get();
		const width = this.canvas.width;
		const height = this.canvas.height;
		if (!shared.draw({
			active: this.active,
			dpr: this.pixelRatio,
			height,
			intensity: this.intensity,
			ornaments: this.ornaments,
			pointer: this.pointer,
			press: this.press,
			radius: this.radius,
			ripple: [
				this.rippleOrigin[0],
				this.rippleOrigin[1],
				Math.max(this.rippleAge, 0),
				this.rippleAge >= 0 ? this.rippleStrength : 0
			],
			stretch: this.stretch,
			time: time / 1e3,
			tint: this.tint,
			width
		}, this.wobble)) return;
		this.blitContext.clearRect(0, 0, width, height);
		this.blitContext.drawImage(shared.canvas, 0, shared.canvas.height - height, width, height, 0, 0, width, height);
	}
	start() {
		if (this.animationFrame || this.destroyed || !this.supported) return;
		this.lastTime = performance.now();
		const tick = (time) => {
			const delta = Math.min((time - this.lastTime) / 1e3, .05);
			this.lastTime = time;
			const activeTarget = this.hovering ? 1 : 0;
			this.active += (activeTarget - this.active) * Math.min(1, delta * (this.hovering ? 9 : 4.5));
			this.press += (this.pressTarget - this.press) * Math.min(1, delta * 14);
			if (this.rippleAge >= 0) {
				this.rippleAge += delta;
				if (this.rippleAge > 1.4) this.rippleAge = -1;
			}
			this.render(time);
			if (!(Math.abs(this.active - activeTarget) < .004 && Math.abs(this.press - this.pressTarget) < .004 && this.rippleAge < 0 && this.wobble < .004 && !this.hovering)) {
				this.animationFrame = requestAnimationFrame(tick);
				return;
			}
			this.active = activeTarget;
			this.press = this.pressTarget;
			this.render(time);
			this.animationFrame = 0;
		};
		this.animationFrame = requestAnimationFrame(tick);
	}
};
const compileShader = (gl, type, source) => {
	const shader = gl.createShader(type);
	if (!shader) return null;
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
	gl.deleteShader(shader);
	return null;
};
const createProgram = (gl, vertexSource, fragmentSource) => {
	const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
	const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
	if (!vertexShader || !fragmentShader) return null;
	const program = gl.createProgram();
	if (!program) return null;
	gl.attachShader(program, vertexShader);
	gl.attachShader(program, fragmentShader);
	gl.linkProgram(program);
	gl.deleteShader(vertexShader);
	gl.deleteShader(fragmentShader);
	if (gl.getProgramParameter(program, gl.LINK_STATUS)) return program;
	gl.deleteProgram(program);
	return null;
};

//#endregion
//#region src/spring.ts
var SpringValue = class {
	current;
	target;
	velocity = 0;
	damping;
	mass;
	stiffness;
	constructor(initialValue = 0, options = {}) {
		this.current = initialValue;
		this.target = initialValue;
		this.damping = options.damping ?? 21;
		this.mass = options.mass ?? 1;
		this.stiffness = options.stiffness ?? 210;
	}
	set(value) {
		this.current = value;
		this.target = value;
		this.velocity = 0;
	}
	setTarget(value) {
		this.target = value;
	}
	step(deltaSeconds) {
		const frameDelta = clampDelta(deltaSeconds);
		const stepCount = Math.max(1, Math.ceil(frameDelta / (1 / 120)));
		const delta = frameDelta / stepCount;
		for (let index = 0; index < stepCount; index += 1) {
			const displacement = this.current - this.target;
			const acceleration = (-this.stiffness * displacement + -this.damping * this.velocity) / this.mass;
			this.velocity += acceleration * delta;
			this.current += this.velocity * delta;
		}
		const remainingDistance = this.current - this.target;
		if (Math.abs(this.velocity) > .001 || Math.abs(remainingDistance) > .001) return true;
		this.current = this.target;
		this.velocity = 0;
		return false;
	}
};
const clampDelta = (deltaSeconds) => {
	if (!Number.isFinite(deltaSeconds)) return 1 / 60;
	return Math.min(Math.max(deltaSeconds, 1 / 240), 1 / 15);
};

//#endregion
//#region src/motion.ts
const readRadius = (element) => {
	const parsed = Number.parseFloat(getComputedStyle(element).borderTopLeftRadius);
	return Number.isFinite(parsed) ? parsed : 16;
};
const attachLiquidMotion = (element, canvas, options = {}) => {
	let disabled = options.disabled ?? false;
	let frame = 0;
	let lastTime = performance.now();
	let lastPointerTime = 0;
	let lastPointerX = 0;
	let lastPointerY = 0;
	let releaseTimeout = 0;
	const prefersReducedMotion = mediaQuery("(prefers-reduced-motion: reduce)");
	const reducedMotion = () => options.respectReducedMotion === true && prefersReducedMotion.matches;
	const wobbliness = clamp(options.wobbliness ?? .1, 0, 1.5);
	const bounce = clamp(options.bounce ?? .05, 0, .16);
	const tilt = clamp(options.tilt ?? 3.5, 0, 12);
	let boxWidth = 0;
	let boxHeight = 0;
	let pressed = false;
	const measure = () => {
		boxWidth = element.offsetWidth;
		boxHeight = element.offsetHeight;
	};
	const capScale = (value, extent) => {
		if (!(extent > 0)) return value;
		const limit = 12 / extent;
		return clamp(value, 1 - limit, 1 + limit);
	};
	const ownsPress = (event) => {
		const target = event.target;
		if (!(target instanceof Element)) return true;
		const owner = target.closest("[data-liquid-motion]");
		return owner === null || owner === element;
	};
	const jellyDamping = 26 - wobbliness * 16.5;
	const pointerX = new SpringValue(.5, {
		damping: 30,
		stiffness: 320
	});
	const pointerY = new SpringValue(.5, {
		damping: 30,
		stiffness: 320
	});
	const scaleX = new SpringValue(1, {
		damping: jellyDamping,
		mass: .9,
		stiffness: 330
	});
	const scaleY = new SpringValue(1, {
		damping: jellyDamping,
		mass: .9,
		stiffness: 330
	});
	const skew = new SpringValue(0, {
		damping: jellyDamping * 1.15,
		mass: .9,
		stiffness: 260
	});
	const tiltX = new SpringValue(0, {
		damping: 13,
		stiffness: 190
	});
	const tiltY = new SpringValue(0, {
		damping: 13,
		stiffness: 190
	});
	const lift = new SpringValue(0, {
		damping: 20,
		mass: .8,
		stiffness: 230
	});
	const presence = new SpringValue(0, {
		damping: 24,
		stiffness: 210
	});
	const elasticity = clamp(options.elasticity ?? 0, 0, 1);
	const elasticX = new SpringValue(0, {
		damping: jellyDamping * 1.1,
		mass: 1.1,
		stiffness: 190
	});
	const elasticY = new SpringValue(0, {
		damping: jellyDamping * 1.1,
		mass: 1.1,
		stiffness: 190
	});
	const elasticStretchX = new SpringValue(0, {
		damping: jellyDamping,
		mass: 1,
		stiffness: 210
	});
	const elasticStretchY = new SpringValue(0, {
		damping: jellyDamping,
		mass: 1,
		stiffness: 210
	});
	const renderer = canvas && options.webgl !== false && !reducedMotion() ? new LiquidRenderer(canvas, {
		glow: options.glow,
		intensity: options.intensity,
		radius: readRadius(element),
		ripple: options.ripple,
		shimmer: options.shimmer,
		sparkle: options.sparkle,
		tint: options.tint
	}) : null;
	const inject = (spring, amount, cap) => {
		spring.velocity = clamp(spring.velocity + amount, -cap, cap);
	};
	const render = (time) => {
		const delta = (time - lastTime) / 1e3;
		lastTime = time;
		let moving = false;
		for (const spring of [
			pointerX,
			pointerY,
			scaleX,
			scaleY,
			skew,
			tiltX,
			tiltY,
			lift,
			presence,
			elasticX,
			elasticY,
			elasticStretchX,
			elasticStretchY
		]) if (spring.step(delta)) moving = true;
		const normalizedX = pointerX.current * 2 - 1;
		const normalizedY = pointerY.current * 2 - 1;
		const magnetStrength = presence.current * 1.65;
		const wobbleEnergy = clamp((Math.abs(scaleX.velocity) + Math.abs(scaleY.velocity)) * 1.4 + Math.abs(skew.velocity) * .04, 0, 1) * clamp(wobbliness, 0, 1);
		const squish = clamp((Math.abs(scaleX.current - 1) + Math.abs(scaleY.current - 1)) * 6, 0, 1);
		element.style.setProperty("--lq-pointer-x", `${(pointerX.current * 100).toFixed(3)}%`);
		element.style.setProperty("--lq-pointer-y", `${(pointerY.current * 100).toFixed(3)}%`);
		element.style.setProperty("--lq-rotate-x", `${tiltX.current.toFixed(3)}deg`);
		element.style.setProperty("--lq-rotate-y", `${tiltY.current.toFixed(3)}deg`);
		const appliedScaleX = capScale(scaleX.current * (1 + elasticStretchX.current), boxWidth);
		const appliedScaleY = capScale(scaleY.current * (1 + elasticStretchY.current), boxHeight);
		element.style.setProperty("--lq-scale-x", appliedScaleX.toFixed(4));
		element.style.setProperty("--lq-scale-y", appliedScaleY.toFixed(4));
		element.style.setProperty("--lq-elastic-x", `${elasticX.current.toFixed(3)}px`);
		element.style.setProperty("--lq-elastic-y", `${elasticY.current.toFixed(3)}px`);
		element.style.setProperty("--lq-edge-angle", `${(145 + normalizedX * 38 + normalizedY * 16).toFixed(2)}deg`);
		element.style.setProperty("--lq-skew-x", `${skew.current.toFixed(3)}deg`);
		element.style.setProperty("--lq-lift", `${lift.current.toFixed(3)}px`);
		element.style.setProperty("--lq-magnet-x", `${(normalizedX * magnetStrength).toFixed(3)}px`);
		element.style.setProperty("--lq-magnet-y", `${(normalizedY * magnetStrength).toFixed(3)}px`);
		element.style.setProperty("--lq-shine-opacity", presence.current.toFixed(4));
		element.style.setProperty("--lq-squish", squish.toFixed(4));
		if (renderer) {
			renderer.setPointer(pointerX.current, pointerY.current);
			renderer.setStretch(appliedScaleX - 1, appliedScaleY - 1);
			renderer.setWobble(wobbleEnergy);
		}
		if (moving) {
			frame = requestAnimationFrame(render);
			return;
		}
		frame = 0;
	};
	const start = () => {
		if (frame || reducedMotion()) return;
		lastTime = performance.now();
		frame = requestAnimationFrame(render);
	};
	const updatePointer = (event) => {
		if (disabled) return;
		const bounds = element.getBoundingClientRect();
		const width = Math.max(bounds.width, 1);
		const height = Math.max(bounds.height, 1);
		const localX = clamp((event.clientX - bounds.left) / width);
		const localY = clamp((event.clientY - bounds.top) / height);
		pointerX.setTarget(localX);
		pointerY.setTarget(localY);
		tiltX.setTarget(-(localY * 2 - 1) * tilt);
		tiltY.setTarget((localX * 2 - 1) * tilt);
		const now = event.timeStamp;
		if (lastPointerTime > 0 && now > lastPointerTime) {
			const deltaSeconds = Math.min((now - lastPointerTime) / 1e3, .05);
			const velocityX = (event.clientX - lastPointerX) / width / Math.max(deltaSeconds, .004);
			const velocityY = (event.clientY - lastPointerY) / height / Math.max(deltaSeconds, .004);
			inject(skew, velocityX * 3.4 * wobbliness, 42);
			inject(scaleX, Math.abs(velocityX) * .09 * wobbliness, 1.6);
			inject(scaleY, Math.abs(velocityY) * .09 * wobbliness, 1.6);
		}
		lastPointerTime = now;
		lastPointerX = event.clientX;
		lastPointerY = event.clientY;
		if (reducedMotion()) {
			pointerX.set(localX);
			pointerY.set(localY);
			element.style.setProperty("--lq-pointer-x", `${(localX * 100).toFixed(2)}%`);
			element.style.setProperty("--lq-pointer-y", `${(localY * 100).toFixed(2)}%`);
		}
		start();
	};
	const enter = (event) => {
		if (disabled) return;
		measure();
		element.dataset.liquidActive = "true";
		presence.setTarget(1);
		scaleX.setTarget(1.01);
		scaleY.setTarget(1.01);
		lift.setTarget(-1.5);
		lastPointerTime = 0;
		renderer?.setActive(true);
		renderer?.setRadius(readRadius(element));
		updatePointer(event);
	};
	const leave = () => {
		pressed = false;
		element.dataset.liquidActive = "false";
		pointerX.setTarget(.5);
		pointerY.setTarget(.5);
		scaleX.setTarget(1);
		scaleY.setTarget(1);
		skew.setTarget(0);
		tiltX.setTarget(0);
		tiltY.setTarget(0);
		lift.setTarget(0);
		presence.setTarget(0);
		lastPointerTime = 0;
		renderer?.setActive(false);
		renderer?.setPress(false);
		start();
	};
	const down = (event) => {
		if (disabled || !ownsPress(event)) return;
		measure();
		pressed = true;
		window.clearTimeout(releaseTimeout);
		scaleX.setTarget(1 + bounce * .55);
		scaleY.setTarget(1 - bounce * 1.15);
		skew.setTarget((pointerX.current * 2 - 1) * -2.4);
		lift.setTarget(1);
		renderer?.setPress(true);
		renderer?.ripple(pointerX.current, pointerY.current, .7);
		start();
	};
	const up = () => {
		if (!pressed) return;
		pressed = false;
		scaleX.setTarget(1.01);
		scaleY.setTarget(1.01);
		skew.setTarget(0);
		lift.setTarget(-2);
		inject(scaleY, bounce * (9 + wobbliness * 13), 4);
		inject(scaleX, -bounce * (5 + wobbliness * 7), 4);
		renderer?.setPress(false);
		renderer?.ripple(pointerX.current, pointerY.current, 1);
		start();
		releaseTimeout = window.setTimeout(() => {
			lift.setTarget(element.dataset.liquidActive === "true" ? -1.5 : 0);
			start();
		}, 140);
	};
	const releaseElastic = elasticity > 0 ? observeElasticPointer(element, (bounds, clientX, clientY) => {
		if (disabled || reducedMotion()) return;
		const pull = elasticPull(bounds, clientX, clientY, {
			elasticity,
			reach: options.reach
		});
		elasticX.setTarget(pull.offsetX);
		elasticY.setTarget(pull.offsetY);
		elasticStretchX.setTarget(pull.stretchX);
		elasticStretchY.setTarget(pull.stretchY);
		start();
	}) : null;
	measure();
	element.dataset.liquidMotion = "";
	element.addEventListener("pointerenter", enter);
	element.addEventListener("pointermove", updatePointer);
	element.addEventListener("pointerleave", leave);
	element.addEventListener("pointerdown", down);
	element.addEventListener("pointerup", up);
	element.addEventListener("pointercancel", leave);
	return {
		destroy: () => {
			cancelAnimationFrame(frame);
			window.clearTimeout(releaseTimeout);
			releaseElastic?.();
			renderer?.destroy();
			delete element.dataset.liquidMotion;
			element.removeEventListener("pointerenter", enter);
			element.removeEventListener("pointermove", updatePointer);
			element.removeEventListener("pointerleave", leave);
			element.removeEventListener("pointerdown", down);
			element.removeEventListener("pointerup", up);
			element.removeEventListener("pointercancel", leave);
		},
		pulse: (strength = 1) => {
			const pulseStrength = clamp(strength, 0, 1.5);
			renderer?.ripple(pointerX.current, pointerY.current, pulseStrength);
			inject(scaleY, bounce * pulseStrength * (8 + wobbliness * 10), 4);
			inject(scaleX, -bounce * pulseStrength * 5, 4);
			start();
		},
		setDisabled: (nextDisabled) => {
			disabled = nextDisabled;
			element.dataset.liquidDisabled = String(nextDisabled);
			if (nextDisabled) leave();
		}
	};
};

//#endregion
//#region src/tokens.ts
const defaultTokens = {
	accent: "#86a8ff",
	border: "rgba(255, 255, 255, 0.38)",
	duration: "420ms",
	easing: "cubic-bezier(0.22, 1, 0.36, 1)",
	radius: "28px",
	shadow: "0 18px 48px rgba(8, 12, 28, 0.18)",
	text: "#f7f9ff"
};

//#endregion
export { LiquidRenderer, SpringValue, attachLiquidLens, attachLiquidMotion, clamp, createLensMap, defaultTokens, elasticPull, hexToRgb, isLensRenderingSupported, isLensSupported, lerp, mapRange, observeElasticPointer };
