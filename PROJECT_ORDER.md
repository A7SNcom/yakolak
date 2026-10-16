# مسار تطوير YAKOLAK

`main` → Godot Web Export → ملفات `web/` → GitHub Pages.

رابط المعاينة: https://a7sncom.github.io/yakolak/

Vercel ملغى بطلب المستخدم. إعداد Pages يستخدم GitHub Actions.

1. ابدأ من أحدث `main` ونفذ التعديل مباشرة.
2. التصدير عبر `scripts/godot-flash-build.sh` بلا اختبارات ثقيلة.
3. انشر ملفات `web/` عبر Workflow `online-build-publish.yml`.
4. تحقق من نجاح النشر قبل إرسال الرابط كرابط جاهز.

المعاينة ثابتة؛ الأونلاين الجديد يستخدم Trystero/WebRTC وخدمات اكتشاف عامة دون خادم خاص. النشر محجوب حتى نجاح قبول اللعب على جهازين فعليين وتوثيقه في `docs/online-acceptance.json`. راجع `docs/ONLINE_TRYSTERO.md`.
