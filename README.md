# YAKOLAK — ياكلك

مستودع التطوير الحي للعبة ياكلك. المصدر الحالي أحدث `main`، والمحرك Godot.

## المعاينة

https://a7sncom.github.io/yakolak/

`main` → GitHub Actions → Godot Web Export → GitHub Pages.

Vercel ملغى بطلب المستخدم، وملف إعداداته محذوف. يجب ضبط Settings → Pages → Source على GitHub Actions إذا لم يكن Pages مفعّلًا.

GitHub Pages يعرض اللعبة الثابتة؛ غرف الأونلاين وواجهات `api/` تحتاج استضافة خادم منفصلة ولا تعمل على Pages وحده.

اقرأ `AGENTS.md` و`PROJECT_ORDER.md` قبل التعديل. الاختبارات الثقيلة تُشغّل يدويًا عند الطلب. PCLOCAL وThree.js والفروع القديمة مراجع تاريخية فقط.

## الإعداد البصري

واجهة `ui/visual-setup.mjs` و`ui/visual-setup.css` فوق طاولة Godot الفعلية، والجسر في `scripts/session_setup_visual.gd`. يبدأ الزائر بالاسم والجوال ثم اللون وعدد اللاعبين. الملف الشخصي محفوظ في متصفح الجهاز فقط؛ لا تحقق SMS ولا إرسال للجوال إلى اللعبة أو الخادم.

اللعب المحلي والبوتات جاهزان. اختيار الأونلاين يوضح عدم توفر الخادم ويمنع بدء غرفة وهمية. خيارات الأجهزة المتصلة مجهزة لاستقبال أسماء حقيقية، لكن تشغيل الغرف والمقاعد على أجهزة متعددة يحتاج خادمًا ودعمًا في بروتوكول الغرفة قبل تفعيله.

فحوص مركزة: `node --test tests/visual_setup.mjs`، وGodot headless عبر `tests/visual_setup_headless.gd` و`tests/visual_setup_scene_headless.gd`. فحص DOM الاختياري يستخدم متغير `YAKOLAK_JSDOM_MODULE` لمسار وحدة jsdom؛ لا تدخل مكتبة الاختبار في تصدير اللعبة.
