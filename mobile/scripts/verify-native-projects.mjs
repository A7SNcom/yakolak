import assert from 'node:assert/strict';
import { access, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { mobileRoot, verifyCapacitorConfig } from './bundle-contract.mjs';

const appId = (await verifyCapacitorConfig()).appId;

async function text(relativePath) {
	return readFile(path.join(mobileRoot, relativePath), 'utf8');
}

async function requireFile(relativePath) {
	await access(path.join(mobileRoot, relativePath));
}

for (const file of [
	'android/gradlew',
	'android/app/build.gradle',
	'android/app/src/main/AndroidManifest.xml',
	'android/variables.gradle',
	'ios/App/App.xcodeproj/project.pbxproj',
	'ios/App/App/Info.plist',
	'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png',
]) await requireFile(file);

const gradle = await text('android/variables.gradle');
const appGradle = await text('android/app/build.gradle');
const manifest = await text('android/app/src/main/AndroidManifest.xml');
assert.match(gradle, /targetSdkVersion\s*=\s*36\b/, 'Android target API must be 36.');
assert.match(gradle, /compileSdkVersion\s*=\s*36\b/, 'Android compile SDK must be 36.');
assert.match(appGradle, new RegExp(`applicationId\\s+["']${appId.replaceAll('.', '\\.')}["']`));
assert.match(manifest, /<uses-permission android:name="android\.permission\.INTERNET"\s*\/>/);
assert.doesNotMatch(manifest, /android\.permission\.(?:CAMERA|RECORD_AUDIO|ACCESS_FINE_LOCATION|READ_CONTACTS|POST_NOTIFICATIONS)/);

const xcode = await text('ios/App/App.xcodeproj/project.pbxproj');
const info = await text('ios/App/App/Info.plist');
assert.match(xcode, new RegExp(`PRODUCT_BUNDLE_IDENTIFIER = ${appId.replaceAll('.', '\\.')};`));
assert.match(xcode, /IPHONEOS_DEPLOYMENT_TARGET\s*=\s*15\.0;/);
assert.match(info, /<key>CFBundleDisplayName<\/key>\s*<string>ياكلك<\/string>/);

const iconPath = path.join(mobileRoot, 'ios', 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset', 'AppIcon-512@2x.png');
const icon = await stat(iconPath);
assert.ok(icon.size > 20_000, 'Branded App Store icon must be populated.');

console.log('مشروعا Android وiOS موجودان؛ Android يستهدف API 36، ومعرّف التطبيق والأيقونة وإعدادات الأذونات الأساسية متسقة.');
