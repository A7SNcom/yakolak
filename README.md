# YAKOLAK — ياكلك

هذا هو مستودع التطوير الحي للعبة ياكلك.

## حالة الترحيل

اقرأ `AGENTS.md` و`PAGES_MIGRATION_CONTRACT.md` قبل أي تعديل يمس النشر أو الـbackend.

حتى cutover صريح:

- `main` هو مصدر Godot الحالي.
- `threejs-rebuild` هو مساحة Three.js الوحيدة.
- GitHub Pages هو هدف الواجهة الثابتة في موقع واحد:

```text
https://a7sncom.github.io/yakolak/          Godot root أثناء الترحيل
https://a7sncom.github.io/yakolak/threejs/ Three.js candidate
```

GitHub Actions/Pages يملك نشر الواجهة. Three.js تطبيق static browser-native؛ تعديلات HTML/CSS/JS العادية لا تحتاج bundler أو Godot export أو npm application build.

## Online backend

GitHub Pages لا يستضيف API تفاعليًا. كل اتصال Online من Three.js يمر عبر transport واحد يستخدم `API_ORIGIN`. لا تفترض same-origin `/api` ولا hard-code لـVercel.

`rules/` + `api/` يبقيان مرجعًا حاكمًا لسلوك/بروتوكول الـbackend الحالي حيث تنص عقود الهجرة، لكن هذا لا يختار مزود الاستضافة المستقبلي. PAGES-005 يملك اختيار/قفل runtime و`API_ORIGIN`.

## Vercel

نتائج Vercel السابقة—Preview/Production URLs، aliases، project/runtime/environment settings وdeployment evidence—تاريخية فقط بعد PAGES-004، ولا تحكم frontend/backend/cutover جديدًا.

## cutover

وجود المرشح تحت `/yakolak/threejs/` ليس cutover. المهمة الصريحة فقط تنقل artifact مقبولًا إلى `/yakolak/`، تتقاعد lane الهجرة وGodot root بعد health checks، وتثبت backend/active-room/rollback compatibility.

الفروع والمسارات القديمة موجودة للتاريخ فقط ولا تستخدم كأساس لتطوير جديد.