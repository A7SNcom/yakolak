import { verifyWebBundle } from './bundle-contract.mjs';

try {
	const status = await verifyWebBundle();
	console.log(`حزمة الهاتف سليمة: ${status.fileCount} ملفًا، ${(status.bytes / 1024 / 1024).toFixed(1)} MiB.`);
} catch (error) {
	console.error(error.message);
	process.exitCode = 1;
}
