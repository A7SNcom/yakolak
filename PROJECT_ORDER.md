# مسار تطوير YAKOLAK

## عقد الترحيل الحالي — PAGES-004

حتى cutover صريح لاحقًا، ينطبق هذا المسار على `threejs-rebuild` وتعلو أحكام `PAGES_MIGRATION_CONTRACT.md` على أي افتراض نشر/استضافة أقدم.

- `main` يبقى مصدر Godot أثناء الترحيل.
- `threejs-rebuild` هو مساحة Three.js الوحيدة.
- هدف الواجهة الثابتة هو GitHub Pages في موقع واحد:

```text
/yakolak/           = آخر Godot-ready مؤهل من main أثناء الترحيل
/yakolak/threejs/   = مرشح Three.js من threejs-rebuild/web
```

- GitHub Actions/Pages هو مالك نشر الواجهة؛ PAGES-002 يملك الـcomposite deployment وcross-branch trigger contract.
- تعديل Three.js العادي يبقى no-build: لا bundler ولا Godot export ولا npm application build.
- آلية `[flash-ready]` تبقى فقط مصدر Godot المؤهل للجذر أثناء مرحلة الترحيل؛ Push عادي إلى `main` لا يصبح تلقائيًا root artifact جديدًا.
- GitHub Pages static فقط. Online backend منفصل خلف `API_ORIGIN`؛ لا تفترض same-origin `/api` ولا رابط Vercel ثابتًا.
- PAGES-005 يملك اختيار/قفل backend runtime/provider و`API_ORIGIN` العام.

## Vercel بعد PAGES-004

أي Preview/Production deployment أو alias أو runtime أو environment أو `yakolak.vercel.app` أو `vercel.json` من مهام مكتملة سابقة هو **historical evidence فقط**. يمكن الرجوع إليه للمقارنة أو rollback research، لكنه لا يحكم أي قرار frontend/backend/cutover جديد.

## قواعد العمل

1. لا تنشئ فرع ترحيل إضافيًا أو موقع Pages ثانيًا أو frontend lane منافسًا.
2. لا تستخدم PR كمسار التطوير الطبيعي إلا بطلب صريح.
3. لا تشغّل gates ثقيلة تلقائيًا إلا عندما تطلبها المهمة أو release/cutover verification.
4. لا تسمح لتغيير Three.js باستبدال Godot root قبل cutover.
5. لا تضع أسرار backend داخل Pages artifact أو frontend config.
6. أي سلوك online يحترم `THREEJS_SOURCE_OF_TRUTH.md` و`THREEJS_BACKEND_GAP_REGISTER.md` و`API_ORIGIN`؛ frontend لا يغلق Gap مفتوحًا من تلقاء نفسه.

## cutover النهائي

نجاح `/yakolak/threejs/` لا يعني cutover. المهمة الصريحة فقط تملك:

- اعتماد Three.js artifact/SHA محدد؛
- إثبات backend/CORS/session/persistence/active-room/rollback compatibility؛
- نقل Three.js المقبول إلى `/yakolak/` داخل نفس Pages site؛
- تقاعد `/yakolak/threejs/` وGodot root عمدًا بعد health checks؛
- الحفاظ على backend authority خلف `API_ORIGIN`؛
- rollback إلى bytes وحالة protocol معروفة، لا إعادة بناء تقريبية من branch heads متحركة.

المرجع الأعلى لهذه الحدود: `PAGES_MIGRATION_CONTRACT.md`.