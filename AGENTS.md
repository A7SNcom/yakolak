# تعليمات تطوير YAKOLAK

## مصدر الحقيقة ومسار النشر

- التطوير مباشرة من أحدث `main` على GitHub، والمحرك Godot.
- بناء الويب في GitHub Actions ونشره عبر GitHub Pages فقط.
- رابط المعاينة: https://a7sncom.github.io/yakolak/
- ألغى المستخدم Vercel؛ لا تعِد ربطه أو اعتماده في التعليمات أو إعدادات النشر.
- Workflow النشر: `.github/workflows/online-build-publish.yml`.
- سكربت التصدير: `scripts/godot-flash-build.sh`.
- ملفات `web/` هي تصدير Godot الجاهز. `[flash-ready]` يتجاوز إعادة التصدير وينشر الملفات الجاهزة.
- Pages يستخدم Trystero/WebRTC دون خادم خاص أو قاعدة بيانات؛ `/api/` محول تاريخي لا يستخدمه هذا المسار. راجع `docs/ONLINE_TRYSTERO.md`.
- النشر مشروط باختبار فعلي موثّق على جهازين في `docs/online-acceptance.json`؛ لا تسجل نجاحًا دون تنفيذه.
- لا تشغّل اختبارات ثقيلة تلقائيًا، ولا تنشئ فروعًا أو PR دون طلب.
- PCLOCAL وThree.js والفروع القديمة وطرق النشر القديمة مراجع تاريخية فقط.

## إكمال العمل

تحقق من وجود التعديل في `main` ونجاح نشر GitHub Pages. لا تعتبر الرابط منشورًا قبل نجاح النشر.
