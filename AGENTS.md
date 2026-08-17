# تعليمات تطوير YAKOLAK

هذه التعليمات إلزامية لأي نموذج ذكاء اصطناعي أو مطور يعمل على المشروع.

## عقد النشر الحالي أثناء ترحيل Three.js — PAGES-004

على `threejs-rebuild`، المرجع الأعلى لقرارات الاستضافة/النشر/حدود الـbackend هو `PAGES_MIGRATION_CONTRACT.md`.

- هدف الواجهة الثابتة الحالي هو **GitHub Pages**.
- موقع المشروع: `https://a7sncom.github.io/yakolak/`.
- أثناء الترحيل يبقى الجذر `/yakolak/` هو آخر Godot-ready معروف من `main/web`، ويظهر مرشح Three.js فقط تحت `/yakolak/threejs/` داخل **نفس** Pages artifact.
- GitHub Actions/Pages هو مالك نشر الواجهة. PAGES-002 يملك مسار الـcomposite Pages deployment، وPAGES-003 يملك قابلية نقل العميل بين `/yakolak/threejs/` والجذر النهائي.
- GitHub Pages واجهة static فقط؛ لا يستضيف room server ولا أسرار ولا منطق backend تفاعلي.
- كل اتصال Online من عميل Three.js يمر عبر `API_ORIGIN`. PAGES-005 هو المالك الوحيد لاختيار/قفل runtime غير Vercel وقيمة `API_ORIGIN` العامة.
- **PAGES-006 مكتمل ومقفل:** `PAGES_ORIGIN_STORAGE_SECURITY.md` هو مرجع origin/CORS والتخزين والتعافي. الأصل الأمني هو `https://a7sncom.github.io` كاملًا؛ المسارات ليست origins منفصلة؛ كل تخزين YAKOLAK يجب أن يكون namespaced تحت `YAKOLAK`؛ يمنع أي `clear()` عام؛ bearer الخاص بالمقعد memory-only؛ والأسرار الإدارية/قاعدة البيانات backend-only.
- أي افتراضات أو روابط أو إعدادات أو Preview deployments تخص Vercel في المهام/الوثائق القديمة هي **historical evidence فقط** بعد PAGES-004، ولا يجوز أن تحكم قرار نشر أو backend جديد.
- Final cutover لاحق وصريح: ينقل Three.js المقبول إلى `/yakolak/` في نفس GitHub Pages site، يتقاعد `/yakolak/threejs/` عمدًا، ويتوقف Godot root فقط بعد تحقق الصحة/التوافق. لا يوجد Vercel promote/alias switch ضمن عقد cutover الجديد.

## استثناء مؤقت لترحيل Three.js

هذا الاستثناء ينطبق **فقط** على الفرع الموجود `threejs-rebuild` وحتى cutover صريح لاحقًا:

- `threejs-rebuild` هو مساحة العمل الوحيدة لكل مهام `THREEJS-*` و`PAGES-*` الخاصة بإعادة البناء/الترحيل.
- يبقى `main` مصدر Godot المعتمد أثناء مرحلة الترحيل، ولا تُنقل تغييرات Three.js إليه إلا بمهمة cutover صريحة.
- لا يُنشأ فرع ترحيل إضافي، ولا سلسلة Pull Requests، ولا موقع Pages ثانٍ، ولا مسار frontend منافس.
- كل مهمة Three.js تمس backend أو online lifecycle يجب أن تقرأ `THREEJS_SOURCE_OF_TRUTH.md` و`THREEJS_BACKEND_GAP_REGISTER.md` و`PAGES_MIGRATION_CONTRACT.md` و`PAGES_ORIGIN_STORAGE_SECURITY.md` قبل التنفيذ.
- أي Gap حالته `OPEN` لا يجوز للواجهة حسمه أو اختراع authority محلي له؛ القرار والتنفيذ يملكه رقم المهمة المسجل في الـregister.
- لا تستخدم وجود `api/` أو `vercel.json` أو نجاح Vercel سابقًا كدليل على أن Vercel هو runtime المستقبلي؛ هذه مواد legacy/history إلى أن يختار PAGES-005 الـbackend target.

## مصدر الحقيقة حسب المسار

### ترحيل Three.js

1. `PAGES_MIGRATION_CONTRACT.md` + `PAGES_ORIGIN_STORAGE_SECURITY.md` + عقود `PAGES-*` المكتملة: الاستضافة، Pages paths، Actions ownership، `API_ORIGIN`، origin/security/storage وcutover boundary.
2. `THREEJS_SOURCE_OF_TRUTH.md`: المصدر المعتمد حسب مجال القرار.
3. `THREEJS_BACKEND_GAP_REGISTER.md`: الفجوات المفتوحة ومالك القرار.
4. `THREEJS_MIGRATION.md`: حدود بنية العميل/runtime.
5. Vercel-era reports/deployments: دليل تاريخي فقط.

### Godot على `main` أثناء الترحيل

- `main` يبقى مصدر Godot root المعروف أثناء مرحلة الانتقال.
- آلية `[flash-ready]` يمكن أن تستمر لإنتاج الـGodot artifact الذي يغذي Pages root أثناء الترحيل.
- هذا لا يجعل Vercel مرجع النشر الحالي للترحيل، ولا يغيّر عقد Pages.

## وضع التطوير السريع

### Three.js

الهدف:

**تعديل HTML/CSS/JS على `threejs-rebuild` → commit static files → composite GitHub Pages deploy → نفس `/yakolak/threejs/`.**

- لا bundler ولا Godot export ولا npm application build للتعديل الطبيعي.
- لا تجعل الاختبارات الثقيلة بوابة يومية إلا إذا كانت المهمة نفسها تطلب gate محددًا.
- لا تنشئ Workflow تلقائيًا جديدًا لكل مهمة بلا حاجة؛ PAGES-008 يملك توحيد/تقليل الـworkflows لاحقًا.
- لا تستخدم root-relative URLs ثابتة تكسر `/yakolak/threejs/` أو cutover إلى `/yakolak/`.

### Godot root أثناء الترحيل

- استمر في إنتاج آخر `[flash-ready]` صالح من `main` عند الحاجة لتحديث root Godot artifact.
- لا تجعل تعديل Three.js يشغّل Godot build.
- لا تسمح لفرع Three.js أن يستبدل root قبل cutover.

## ممنوع التشتت

- لا تنشئ فرعًا جديدًا للتجربة أو لكل مهمة.
- لا تنشئ سلسلة فروع أو روابط معاينة متعددة.
- لا تبدأ من فرع قديم حتى لو كان اسمه perfect أو approved أو release أو archive.
- لا تستخدم Pull Request كمسار التطوير الطبيعي إلا بطلب صريح من المستخدم.
- لا تعيد Vercel إلى المسار الحاكم لمجرد أن مهام قديمة استخدمته.
- لا تضع database/admin secrets أو bearer credentials داخل Pages artifact أو frontend config.
- لا تستخدم CORS أو pathname كـauthorization boundary، ولا تخزن seat bearer في LocalStorage/IndexedDB/CacheStorage/BroadcastChannel، ولا تنفذ broad `clear()` على storage مشترك مع نفس origin.

## عند إنهاء تعديل Three.js

تحقق فقط مما يلزم للمهمة الحالية، ثم تأكد من:

- التعديل موجود على أحدث `threejs-rebuild` دون الكتابة فوق عمل وكيل آخر.
- عقد base-path بقي صالحًا لـ`/yakolak/threejs/` والجذر النهائي.
- لا توجد محاولة لنقل authority إلى Pages أو إلى browser state.
- أي Online transport جديد يعتمد `API_ORIGIN` ولا يتصل صامتًا بعنوان Vercel قديم.
- أي browser persistence جديد يستخدم namespace `YAKOLAK` ويحذف مفاتيحه هو فقط؛ لا broad clears ولا bearer persistence.
- أي takeover/recovery لمقعد يتم عبر backend rotation/revocation والتحقق من generation الحالية، لا عبر الثقة في client state.
- root Godot لم يُستبدل إلا إذا كانت المهمة Cutover صريحة.

الفكرة: **مسار ترحيل واحد، موقع Pages واحد، frontend static واضح، وbackend authority خلف `API_ORIGIN` منفصل.**
