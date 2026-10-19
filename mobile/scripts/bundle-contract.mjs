import { access, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const mobileRoot = path.resolve(here, '..');
export const repositoryRoot = path.resolve(mobileRoot, '..');
export const sourceWebDir = path.join(repositoryRoot, 'web');
export const stagedWebDir = path.join(mobileRoot, 'www');

export async function verifyCapacitorConfig() {
	const configPath = path.join(mobileRoot, 'capacitor.config.json');
	const config = JSON.parse(await readFile(configPath, 'utf8'));
	const problems = [];
	if (config.webDir !== 'www') problems.push('webDir يجب أن يشير إلى www المحلي.');
	if (!config.appId || /^(?:com\.example|com\.company)\./i.test(config.appId)) problems.push('appId ما زال قيمة قالب افتراضية.');
	if (config.server?.url) problems.push('server.url ممنوع في نسخة الإنتاج؛ يجب تضمين ملفات اللعبة محليًا.');
	if (config.server?.cleartext === true) problems.push('cleartext يجب أن يبقى مغلقًا.');
	if (config.server?.hostname !== 'localhost') problems.push('hostname يجب أن يبقى localhost للحفاظ على سياق ويب آمن.');
	if (config.server?.androidScheme !== 'https') problems.push('androidScheme يجب أن يبقى https.');
	if (problems.length) throw new Error(`إعداد Capacitor غير آمن أو غير مكتمل:\n- ${problems.join('\n- ')}`);
	return config;
}

async function exists(filePath) {
	try {
		await access(filePath);
		return true;
	} catch {
		return false;
	}
}

function readGodotConfig(html) {
	const match = html.match(/const GODOT_CONFIG\s*=\s*(\{[^;]+\});/s);
	if (!match) throw new Error('تعذر قراءة GODOT_CONFIG من index.html. أعد تصدير نسخة Web من Godot.');
	try {
		return JSON.parse(match[1]);
	} catch (error) {
		throw new Error(`GODOT_CONFIG غير صالح: ${error.message}`);
	}
}

function localAssetPaths(html) {
	const paths = new Set();
	for (const match of html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
		const raw = match[1].trim();
		if (!raw || raw.startsWith('#') || /^(?:[a-z]+:|\/\/)/i.test(raw)) continue;
		const clean = decodeURIComponent(raw.split(/[?#]/, 1)[0]);
		if (clean) paths.add(clean.replace(/^\.\//, ''));
	}
	return [...paths];
}

export async function verifyWebBundle(directory = stagedWebDir) {
	const indexFile = path.join(directory, 'index.html');
	if (!(await exists(indexFile))) {
		throw new Error(`لا يوجد ${path.relative(repositoryRoot, indexFile)}. شغّل تصدير Godot Web أولًا.`);
	}
	const html = await readFile(indexFile, 'utf8');
	const config = readGodotConfig(html);
	const required = new Set([
		`${config.executable}.js`,
		`${config.executable}.wasm`,
		config.mainPack,
		...localAssetPaths(html),
	]);
	const missing = [];
	for (const relative of required) {
		const target = path.resolve(directory, relative);
		if (!target.startsWith(path.resolve(directory) + path.sep)) {
			missing.push(`${relative} (مسار خارج حزمة الويب)`);
			continue;
		}
		if (!(await exists(target))) {
			missing.push(relative);
			continue;
		}
	}
	for (const [relative, expected] of Object.entries(config.fileSizes ?? {})) {
		const target = path.join(directory, relative);
		if (!(await exists(target))) {
			missing.push(relative);
			continue;
		}
		const actual = (await stat(target)).size;
		if (actual !== expected) missing.push(`${relative} (الحجم ${actual}، المتوقع ${expected})`);
	}
	const capacitorConfig = await verifyCapacitorConfig();
	if (capacitorConfig.webDir !== path.basename(directory) && path.resolve(directory) === path.resolve(stagedWebDir)) {
		missing.push('Capacitor webDir لا يطابق مجلد الحزمة المحلية.');
	}
	const entries = await readdir(directory, { withFileTypes: true });
	const bundleFiles = [];
	let bytes = 0;
	async function countFiles(base, prefix = '') {
		for (const entry of await readdir(base, { withFileTypes: true })) {
			if (entry.name.startsWith('.')) continue;
			const fullPath = path.join(base, entry.name);
			if (entry.isDirectory()) await countFiles(fullPath, path.join(prefix, entry.name));
			else {
				bundleFiles.push(path.join(prefix, entry.name));
				bytes += (await stat(fullPath)).size;
			}
		}
	}
	await countFiles(directory);
	if (!entries.some((entry) => entry.isFile())) throw new Error('حزمة Web فارغة.');
	if (missing.length) throw new Error(`فشل فحص حزمة Godot Web:\n- ${missing.join('\n- ')}`);
	return { fileCount: bundleFiles.length, bytes, config, files: bundleFiles };
}
