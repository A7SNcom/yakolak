import { copyFile, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(mobileRoot, '..');
const logoSource = path.join(repositoryRoot, 'web', 'yakolak-logo.svg');
const androidRes = path.join(mobileRoot, 'android', 'app', 'src', 'main', 'res');
const iosAssets = path.join(mobileRoot, 'ios', 'App', 'App', 'Assets.xcassets');
const iconDirectory = path.join(iosAssets, 'AppIcon.appiconset');
const splashDirectory = path.join(iosAssets, 'Splash.imageset');
const brandColor = '#000000';

const run = (command, args) => execFileSync(command, args, { stdio: 'inherit' });

function ensureImageTools() {
	try {
		execFileSync('inkscape', ['--version'], { stdio: 'ignore' });
		execFileSync('convert', ['-version'], { stdio: 'ignore' });
	} catch {
		throw new Error('إنشاء الأيقونات يتطلب Inkscape وImageMagick (convert).');
	}
}

function composeSquare(background, logoPng, output, size, logoWidth) {
	run('convert', [
		'-size', `${size}x${size}`,
		`xc:${background}`,
		logoPng,
		'-resize', `${logoWidth}x`,
		'-gravity', 'center',
		'-composite',
		'-strip',
		'-colors', '256',
		'+dither',
		`PNG8:${output}`,
	]);
}

function composeForeground(logoPng, output, size, logoWidth) {
	run('convert', [
		'-size', `${size}x${size}`,
		'xc:none',
		logoPng,
		'-resize', `${logoWidth}x`,
		'-gravity', 'center',
		'-composite',
		'-strip',
		'-colors', '256',
		'+dither',
		`PNG8:${output}`,
	]);
}

await mkdir(path.join(mobileRoot, 'assets'), { recursive: true });
await copyFile(logoSource, path.join(mobileRoot, 'assets', 'yakolak-logo.svg'));
ensureImageTools();

const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'yakolak-brand-'));
try {
	const logoPng = path.join(temporaryDirectory, 'logo.png');
	run('inkscape', [logoSource, `--export-filename=${logoPng}`, '--export-width=1200']);

	const appIcon = path.join(mobileRoot, 'assets', 'yakolak-app-icon.png');
	composeSquare(brandColor, logoPng, appIcon, 1024, 900);
	await copyFile(appIcon, path.join(iconDirectory, 'AppIcon-512@2x.png'));

	const splashPng = path.join(mobileRoot, 'assets', 'yakolak-launch-image.png');
	composeSquare(brandColor, logoPng, splashPng, 2732, 1230);
	for (const filename of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
		await copyFile(splashPng, path.join(splashDirectory, filename));
	}

	const densities = [
		['mdpi', 48],
		['hdpi', 72],
		['xhdpi', 96],
		['xxhdpi', 144],
		['xxxhdpi', 192],
	];
	for (const [density, size] of densities) {
		const directory = path.join(androidRes, `mipmap-${density}`);
		const iconPath = path.join(directory, 'ic_launcher.png');
		const roundIconPath = path.join(directory, 'ic_launcher_round.png');
		const foregroundPath = path.join(directory, 'ic_launcher_foreground.png');
		composeSquare(brandColor, logoPng, iconPath, size, Math.round(size * 0.84));
		await copyFile(iconPath, roundIconPath);
		composeForeground(logoPng, foregroundPath, size * 2.25, Math.round(size * 1.5));
	}

	const backgroundResource = `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${brandColor}</color>\n</resources>\n`;
	await writeFile(path.join(androidRes, 'values', 'ic_launcher_background.xml'), backgroundResource);
	const vectorBackground = `<?xml version="1.0" encoding="utf-8"?>\n<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">\n    <path android:fillColor="${brandColor}" android:pathData="M0,0h108v108h-108z" />\n</vector>\n`;
	await writeFile(path.join(androidRes, 'drawable', 'ic_launcher_background.xml'), vectorBackground);

	for (const layout of ['drawable-land', 'drawable-port']) {
		for (const [density, _size] of densities) {
			const directory = path.join(androidRes, `${layout}-${density}`);
			const files = await readdir(directory);
			for (const filename of files.filter((name) => name === 'splash.png')) {
				const dimensions = execFileSync('identify', ['-format', '%w %h', path.join(directory, filename)], { encoding: 'utf8' })
					.trim()
					.split(/\s+/)
					.map(Number);
				const [width, height] = dimensions;
				const logoWidth = Math.round(Math.min(width, height) * 0.42);
				composeSquare(brandColor, logoPng, path.join(directory, filename), `${width}x${height}`, logoWidth);
			}
		}
	}
	const fallbackSplash = path.join(androidRes, 'drawable', 'splash.png');
	const fallbackSize = execFileSync('identify', ['-format', '%w %h', fallbackSplash], { encoding: 'utf8' })
		.trim()
		.split(/\s+/)
		.map(Number);
	composeSquare(brandColor, logoPng, fallbackSplash, `${fallbackSize[0]}x${fallbackSize[1]}`, Math.round(Math.min(...fallbackSize) * 0.42));

	console.log('تم استبدال أيقونة التطبيق وشاشات البدء الافتراضية بشعار ياكلك.');
} finally {
	await rm(temporaryDirectory, { recursive: true, force: true });
}
