import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { stagedWebDir, sourceWebDir, verifyWebBundle } from './bundle-contract.mjs';

try {
	const sourceStatus = await verifyWebBundle(sourceWebDir);
	await rm(stagedWebDir, { recursive: true, force: true });
	await mkdir(stagedWebDir, { recursive: true });
	await cp(sourceWebDir, stagedWebDir, {
		recursive: true,
		filter: (source) => {
			const name = source.split(/[\\/]/).at(-1);
			return !name.startsWith('.') && name !== 'index.pck';
		},
	});
	const stagedIndexPath = `${stagedWebDir}/index.html`;
	const stagedHtml = await readFile(stagedIndexPath, 'utf8');
	const configMatch = stagedHtml.match(/(const GODOT_CONFIG\s*=\s*)(\{[^;]+\})(;)/s);
	if (!configMatch) throw new Error('تعذر تحديث GODOT_CONFIG للحزمة المحلية.');
	const config = JSON.parse(configMatch[2]);
	delete config.fileSizes?.['index.pck'];
	await writeFile(stagedIndexPath, stagedHtml.replace(configMatch[0], `${configMatch[1]}${JSON.stringify(config)}${configMatch[3]}`));
	const stagedStatus = await verifyWebBundle(stagedWebDir);
	console.log(
		`تم تجهيز ${stagedStatus.fileCount} ملفًا من تصدير Godot Web (${(stagedStatus.bytes / 1024 / 1024).toFixed(1)} MiB؛ ${sourceStatus.config.mainPack} هو ملف اللعبة الرئيسي، واستُبعد ملف PCK احتياطي لا يستدعيه ملف التشغيل).`,
	);
} catch (error) {
	console.error(error.message);
	process.exitCode = 1;
}
