import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export type Odontogram3dFindingCode = 'CARIES' | 'RESTORATION' | 'EXTRACTION' | 'CROWN';

export type Odontogram3dTooth = {
	tooth_fdi: number;
	finding_code: Odontogram3dFindingCode | string;
};

export type Odontogram3dSelectPoint = {
	clientX: number;
	clientY: number;
};

export type Odontogram3dHandle = {
	setTeeth: (teeth: Iterable<Odontogram3dTooth>) => void;
	setSelectedTooth: (toothFdi: number | null) => void;
	resize: () => void;
	setAutoRotate: (enabled: boolean) => void;
	dispose: () => void;
};

export type MountOdontogram3dOptions = {
	canvas: HTMLCanvasElement;
	glbUrl?: string;
	onToothSelect?: (toothFdi: number, point: Odontogram3dSelectPoint) => void;
	onStatus?: (message: string | null) => void;
};

const DEFAULT_GLB_URL =
	'https://objectstorage.sa-saopaulo-1.oraclecloud.com/n/gr7djv0kcgrr/b/bucket-hasel-aoxdev/o/odontograma%2Fdientes.glb';
const PROXY_GLB_URL = '/api/public/odontogram-model';
const LEGACY_PROXY_GLB_URL = '/models/odontogram/dientes.glb';

const FINDING_COLORS: Record<Odontogram3dFindingCode, number> = {
	CARIES: 0xef4444,
	RESTORATION: 0x3b82f6,
	EXTRACTION: 0x404040,
	CROWN: 0xeab308,
};

const DEFAULT_TOOTH_COLOR = 0xf4efe6;
const HOVER_EMISSIVE = 0x2563eb;
const DRAG_THRESHOLD_PX = 5;

/**
 * Nombres exactos del GLB `dientes.glb` (32 meshes, sin subpiezas por cara).
 * Convención: right/left = lado del paciente; -1 = más mesial del tipo.
 */
const NODE_NAME_TO_FDI: Record<string, number> = {
	canine_lower_left: 33,
	canine_lower_right: 43,
	canine_upper_left: 23,
	canine_upper_right: 13,
	'incisor_lower_left-1': 31,
	'incisor_lower_left-2': 32,
	incisor_lower_right1: 41,
	'incisor_lower_right-2': 42,
	incisor_upper_left2: 22,
	'incisor_upper_left-1': 21,
	incisor_upper_right1: 11,
	'incisor_upper_right-2': 12,
	'molar_lower_left-1': 36,
	'molar_lower_left-2': 37,
	'molar_lower_left-3': 38,
	'molar_lower_right-1': 46,
	'molar_lower_right-2': 47,
	'molar_lower_right-3': 48,
	'molar_upper_left-1': 26,
	'molar_upper_left-2': 27,
	'molar_upper_left-3': 28,
	'molar_upper_right-1': 16,
	'molar_upper_right-2': 17,
	'molar_upper_right-3': 18,
	'premolar_lower_left-1': 34,
	'premolar_lower_left-2': 35,
	'premolar_lower_right-1': 44,
	'premolar_lower_right-2': 45,
	'premolar_upper_left-1': 24,
	'premolar_upper_left-2': 25,
	'premolar_upper_right-1': 14,
	'premolar_upper_right-2': 15,
};

type ToothEntry = {
	fdi: number;
	mesh: THREE.Mesh;
	material: THREE.MeshStandardMaterial;
	baseColor: THREE.Color;
	outline: THREE.LineSegments;
};

const isMesh = (object: THREE.Object3D): object is THREE.Mesh =>
	(object as THREE.Mesh).isMesh === true;

const normalizeNodeName = (name: string) => String(name || '').trim().toLowerCase();

const parseFdiFromName = (name: string): number | null => {
	const normalized = normalizeNodeName(name);
	if (!normalized) return null;

	const alias = NODE_NAME_TO_FDI[normalized];
	if (alias) return alias;

	const fdiMatch = normalized.match(/(?:^|[^0-9])([1-4][1-8])(?:[^0-9]|$)/);
	if (fdiMatch) return Number(fdiMatch[1]);

	const arch = /upper/.test(normalized) ? 'upper' : /lower/.test(normalized) ? 'lower' : null;
	const side = /left/.test(normalized) ? 'left' : /right/.test(normalized) ? 'right' : null;
	if (!arch || !side) return null;

	let type: 'incisor' | 'canine' | 'premolar' | 'molar' | null = null;
	if (/canine/.test(normalized)) type = 'canine';
	else if (/incisor/.test(normalized)) type = 'incisor';
	else if (/premolar/.test(normalized)) type = 'premolar';
	else if (/molar/.test(normalized)) type = 'molar';
	if (!type) return null;

	const indexMatch = normalized.match(/[-_]?(\d+)\s*$/);
	const index = indexMatch ? Number(indexMatch[1]) : 1;
	if (!Number.isInteger(index) || index < 1) return null;

	let position = 0;
	if (type === 'incisor') position = index;
	else if (type === 'canine') position = 3;
	else if (type === 'premolar') position = 3 + index;
	else position = 5 + index;
	if (position < 1 || position > 8) return null;

	const quadrant =
		arch === 'upper' && side === 'right'
			? 1
			: arch === 'upper' && side === 'left'
				? 2
				: arch === 'lower' && side === 'left'
					? 3
					: 4;

	return quadrant * 10 + position;
};

const resolveFdi = (object: THREE.Object3D): number | null => {
	let current: THREE.Object3D | null = object;
	while (current) {
		const fromName = parseFdiFromName(current.name);
		if (fromName) return fromName;
		current = current.parent;
	}
	return null;
};

const glbUrlCandidates = (explicit?: string) => {
	const fromEnv = String(import.meta.env.PUBLIC_ODONTOGRAM_GLB_URL || '').trim();
	const remote = String(explicit || '').trim() || fromEnv || DEFAULT_GLB_URL;
	const urls = [PROXY_GLB_URL];
	if (remote && remote !== PROXY_GLB_URL && remote !== LEGACY_PROXY_GLB_URL) {
		urls.push(remote);
	}
	urls.push(LEGACY_PROXY_GLB_URL);
	return [...new Set(urls)];
};

const isGlbBuffer = (buffer: ArrayBuffer) => {
	if (buffer.byteLength < 12) return false;
	return new TextDecoder().decode(new Uint8Array(buffer, 0, 4)) === 'glTF';
};

const fetchGlbBuffer = async (url: string) => {
	const sameOrigin = url.startsWith('/');
	const response = await fetch(url, {
		method: 'GET',
		mode: sameOrigin ? 'same-origin' : 'cors',
		credentials: 'omit',
	});
	if (!response.ok) {
		throw new Error(`GLB HTTP ${response.status} (${url})`);
	}

	const buffer = await response.arrayBuffer();
	if (!isGlbBuffer(buffer)) {
		throw new Error(`La respuesta no es un GLB válido (${url})`);
	}
	return buffer;
};

const loadGltf = async (loader: GLTFLoader, urls: string[]) => {
	let lastError: unknown = null;
	for (const url of urls) {
		try {
			const buffer = await fetchGlbBuffer(url);
			return await loader.parseAsync(buffer, '');
		} catch (error) {
			lastError = error;
			if (import.meta.env.DEV) {
				console.warn('[odontogram-3d] no se pudo cargar', url, error);
			}
		}
	}
	throw lastError instanceof Error ? lastError : new Error('No se pudo cargar el modelo 3D.');
};

const sourceColor = (material: THREE.Material | THREE.Material[]): THREE.Color => {
	const first = Array.isArray(material) ? material[0] : material;
	if (first && 'color' in first && first.color instanceof THREE.Color) {
		return first.color.clone();
	}
	return new THREE.Color(DEFAULT_TOOTH_COLOR);
};

const normalizeFinding = (code: string): Odontogram3dFindingCode | null => {
	const normalized = String(code || '').trim().toUpperCase();
	if (normalized === 'CARIES') return 'CARIES';
	if (normalized === 'RESTORATION') return 'RESTORATION';
	if (normalized === 'EXTRACTION') return 'EXTRACTION';
	if (normalized === 'CROWN') return 'CROWN';
	return null;
};

const applyFinding = (entry: ToothEntry, finding: Odontogram3dFindingCode | null) => {
	const { material, baseColor } = entry;
	const isExtraction = finding === 'EXTRACTION';
	material.emissive.setHex(0x000000);
	material.emissiveIntensity = 0;
	material.transparent = isExtraction;
	material.opacity = isExtraction ? 0.14 : 1;
	material.depthWrite = !isExtraction;
	material.color.copy(
		isExtraction || !finding ? baseColor : new THREE.Color(FINDING_COLORS[finding])
	);
	material.metalness = finding === 'CROWN' ? 0.45 : 0.06;
	material.roughness = finding === 'CROWN' ? 0.28 : 0.48;
	material.needsUpdate = true;
	entry.mesh.visible = true;
};

const fitCameraToObject = (
	camera: THREE.PerspectiveCamera,
	controls: OrbitControls,
	object: THREE.Object3D
) => {
	const box = new THREE.Box3().setFromObject(object);
	const size = box.getSize(new THREE.Vector3());
	const center = box.getCenter(new THREE.Vector3());
	const maxDim = Math.max(size.x, size.y, size.z, 1);
	const fov = (camera.fov * Math.PI) / 180;
	const fitFactor = window.matchMedia('(min-width: 1024px)').matches ? 1.18 : 1.55;
	const distance = (maxDim / 2 / Math.tan(fov / 2)) * fitFactor;

	controls.target.copy(center);
	camera.position.set(center.x, center.y + maxDim * 0.18, center.z + distance);
	camera.near = Math.max(distance / 100, 0.01);
	camera.far = distance * 20;
	camera.updateProjectionMatrix();
	controls.minDistance = distance * 0.35;
	controls.maxDistance = distance * 3.2;
	controls.update();
};

export async function mountOdontogram3d(
	options: MountOdontogram3dOptions
): Promise<Odontogram3dHandle> {
	const { canvas, onToothSelect, onStatus } = options;
	onStatus?.('Cargando modelo 3D…');

	const renderer = new THREE.WebGLRenderer({
		canvas,
		antialias: true,
		alpha: true,
		powerPreference: 'high-performance',
	});
	renderer.setClearColor(0x000000, 0);
	renderer.outputColorSpace = THREE.SRGBColorSpace;
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.05;

	const scene = new THREE.Scene();
	const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
	const controls = new OrbitControls(camera, canvas);
	controls.enableDamping = true;
	controls.dampingFactor = 0.08;
	controls.enablePan = true;
	controls.rotateSpeed = 0.85;
	controls.zoomSpeed = 0.9;
	controls.autoRotate = true;
	controls.autoRotateSpeed = 0.55;

	scene.add(new THREE.HemisphereLight(0xffffff, 0x8b8680, 1.05));
	const keyLight = new THREE.DirectionalLight(0xffffff, 1.15);
	keyLight.position.set(2.2, 3.4, 2.8);
	scene.add(keyLight);
	const fillLight = new THREE.DirectionalLight(0xe8f0ff, 0.42);
	fillLight.position.set(-2.6, 1.1, 1.4);
	scene.add(fillLight);

	const pointer = new THREE.Vector2();
	const raycaster = new THREE.Raycaster();
	const teeth = new Map<number, ToothEntry>();
	const findings = new Map<number, Odontogram3dFindingCode>();
	let hovered: ToothEntry | null = null;
	let selected: ToothEntry | null = null;
	let disposed = false;
	let rafId = 0;
	let pointerDownX = 0;
	let pointerDownY = 0;
	let dragging = false;
	let autoRotateLocked = false;

	const setAutoRotate = (enabled: boolean) => {
		if (disposed) return;
		autoRotateLocked = !enabled;
		controls.autoRotate = enabled;
	};

	const applyHighlight = (entry: ToothEntry) => {
		entry.outline.visible = true;
		entry.material.emissive.setHex(HOVER_EMISSIVE);
		entry.material.emissiveIntensity = 0.22;
	};

	const clearHighlight = (entry: ToothEntry) => {
		if (selected === entry || hovered === entry) {
			applyHighlight(entry);
			return;
		}
		entry.outline.visible = false;
		applyFinding(entry, findings.get(entry.fdi) ?? null);
	};

	const setHover = (next: ToothEntry | null) => {
		if (hovered === next) return;
		const previous = hovered;
		hovered = next;
		if (previous) clearHighlight(previous);
		if (hovered) applyHighlight(hovered);
		canvas.style.cursor = hovered ? 'pointer' : 'grab';
	};

	const setSelectedTooth = (toothFdi: number | null) => {
		if (disposed) return;
		const next = toothFdi && toothFdi > 0 ? (teeth.get(toothFdi) ?? null) : null;
		if (selected === next) {
			if (selected) applyHighlight(selected);
			return;
		}
		const previous = selected;
		selected = next;
		if (previous) clearHighlight(previous);
		if (selected) applyHighlight(selected);
	};

	const updatePointer = (event: PointerEvent) => {
		const rect = canvas.getBoundingClientRect();
		const width = rect.width || 1;
		const height = rect.height || 1;
		pointer.x = ((event.clientX - rect.left) / width) * 2 - 1;
		pointer.y = -((event.clientY - rect.top) / height) * 2 + 1;
	};

	const pickTooth = (): ToothEntry | null => {
		raycaster.setFromCamera(pointer, camera);
		const meshes = [...teeth.values()].map((entry) => entry.mesh);
		const hits = raycaster.intersectObjects(meshes, false);
		const fdi = hits[0] ? Number(hits[0].object.userData.fdi || 0) : 0;
		return fdi > 0 ? (teeth.get(fdi) ?? null) : null;
	};

	const resize = () => {
		if (disposed) return;
		const host = canvas.parentElement ?? canvas;
		const width = host.clientWidth;
		const height = host.clientHeight;
		if (width < 2 || height < 2) return;
		renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
		renderer.setSize(width, height, false);
		camera.aspect = width / height;
		camera.updateProjectionMatrix();
	};

	const tick = () => {
		if (disposed) return;
		rafId = window.requestAnimationFrame(tick);
		controls.update();
		renderer.render(scene, camera);
	};

	const onPointerDown = (event: PointerEvent) => {
		pointerDownX = event.clientX;
		pointerDownY = event.clientY;
		dragging = false;
		controls.autoRotate = false;
	};

	const onPointerMove = (event: PointerEvent) => {
		updatePointer(event);
		if (
			Math.hypot(event.clientX - pointerDownX, event.clientY - pointerDownY) > DRAG_THRESHOLD_PX
		) {
			dragging = true;
		}
		if (event.buttons === 0 || !dragging) setHover(pickTooth());
	};

	const onPointerUp = (event: PointerEvent) => {
		updatePointer(event);
		if (!autoRotateLocked) controls.autoRotate = true;
		const moved = Math.hypot(event.clientX - pointerDownX, event.clientY - pointerDownY);
		if (dragging || moved > DRAG_THRESHOLD_PX) return;
		const entry = pickTooth();
		if (entry) {
			setSelectedTooth(entry.fdi);
			onToothSelect?.(entry.fdi, { clientX: event.clientX, clientY: event.clientY });
		}
	};

	const onPointerLeave = () => {
		setHover(null);
		canvas.style.cursor = 'grab';
	};

	const onContextMenu = (event: Event) => event.preventDefault();
	canvas.addEventListener('pointerdown', onPointerDown);
	canvas.addEventListener('pointermove', onPointerMove);
	canvas.addEventListener('pointerup', onPointerUp);
	canvas.addEventListener('pointerleave', onPointerLeave);
	canvas.addEventListener('contextmenu', onContextMenu);

	const resizeObserver = new ResizeObserver(() => resize());
	resizeObserver.observe(canvas.parentElement ?? canvas);
	resize();

	const loader = new GLTFLoader();
	loader.setCrossOrigin('anonymous');

	let root: THREE.Group | null = null;

	const dispose = () => {
		if (disposed) return;
		disposed = true;
		window.cancelAnimationFrame(rafId);
		resizeObserver.disconnect();
		canvas.removeEventListener('pointerdown', onPointerDown);
		canvas.removeEventListener('pointermove', onPointerMove);
		canvas.removeEventListener('pointerup', onPointerUp);
		canvas.removeEventListener('pointerleave', onPointerLeave);
		canvas.removeEventListener('contextmenu', onContextMenu);
		setHover(null);
		controls.dispose();
		for (const entry of teeth.values()) {
			entry.outline.geometry.dispose();
			if (entry.outline.material instanceof THREE.Material) {
				entry.outline.material.dispose();
			}
			entry.material.dispose();
		}
		teeth.clear();
		findings.clear();
		root?.traverse((object) => {
			if (!isMesh(object)) return;
			object.geometry.dispose();
		});
		scene.clear();
		renderer.dispose();
		renderer.forceContextLoss();
		onStatus?.(null);
	};

	let gltf;
	try {
		gltf = await loadGltf(loader, glbUrlCandidates(options.glbUrl));
	} catch (error) {
		dispose();
		onStatus?.('No se pudo cargar el modelo 3D.');
		throw error;
	}

	if (disposed) {
		return { setTeeth() {}, setSelectedTooth() {}, resize() {}, setAutoRotate() {}, dispose() {} };
	}

	root = gltf.scene;
	root.traverse((object) => {
		if (!isMesh(object)) return;
		const fdi = resolveFdi(object);
		if (!fdi || teeth.has(fdi)) return;

		const baseColor = sourceColor(object.material);
		const material = new THREE.MeshStandardMaterial({
			color: baseColor,
			roughness: 0.48,
			metalness: 0.06,
		});
		object.material = material;
		object.userData.fdi = fdi;

		const outline = new THREE.LineSegments(
			new THREE.EdgesGeometry(object.geometry, 28),
			new THREE.LineBasicMaterial({
				color: HOVER_EMISSIVE,
				transparent: true,
				opacity: 0.92,
				depthTest: true,
			})
		);
		outline.visible = false;
		object.add(outline);

		teeth.set(fdi, { fdi, mesh: object, material, baseColor, outline });
	});

	if (import.meta.env.DEV) {
		const mapped = [...teeth.keys()].sort((a, b) => a - b);
		console.info('[odontogram-3d] FDI map', mapped, {
			count: mapped.length,
			nodes: root.children.map((node) => `${node.name}→${resolveFdi(node) ?? '?'}`),
		});
	}

	scene.add(root);
	fitCameraToObject(camera, controls, root);
	resize();
	tick();
	onStatus?.(null);

	const setTeeth = (nextTeeth: Iterable<Odontogram3dTooth>) => {
		if (disposed) return;
		findings.clear();
		for (const tooth of nextTeeth) {
			const fdi = Number(tooth.tooth_fdi || 0);
			const finding = normalizeFinding(String(tooth.finding_code || ''));
			if (fdi > 0 && finding) findings.set(fdi, finding);
		}
		for (const entry of teeth.values()) {
			applyFinding(entry, findings.get(entry.fdi) ?? null);
		}
		if (selected) applyHighlight(selected);
		if (hovered) applyHighlight(hovered);
	};

	return { setTeeth, setSelectedTooth, resize, setAutoRotate, dispose };
}
