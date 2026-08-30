# YAKOLAK — ياكلك

هذا هو مستودع التطوير الحي للعبة ياكلك.

## مصدر الحقيقة التشغيلي

**المصدر الحالي الوحيد هو أحدث `main` على GitHub، والمحرك الحالي هو Godot.**

خط النشر الوحيد:

`main` → `YAKOLAK Flash Publish` → Godot Web Export → `[flash-ready]` → Vercel → https://yakolak.vercel.app/

- الرابط الأساسي الوحيد للمستخدم: https://yakolak.vercel.app/
- Vercel يعرض ملفات `web/` الجاهزة من `[flash-ready]` ولا يعيد بناء Godot.
- أي تعديل جديد يبدأ من أحدث `main` ويدخل إلى `main` مباشرة.
- لا توجد معاينة أو فرع أو منصة نشر بديلة تُعامل كمصدر حقيقة.

## المسارات التاريخية

PCLOCAL وThree.js وGitHub Pages والفروع القديمة والـdeployment generations القديمة محفوظة للمرجعية التاريخية فقط. هي READ-ONLY وليست مسار تنفيذ أو بناء أو نشر أو استرجاع أو fallback.

## الاختبارات

الاختبارات الثقيلة ليست جزءًا من Flash Publish. تبقى متاحة للتشغيل اليدوي عند طلب فحص شامل أو Release مستقر أو تشخيص محدد.

## تعليمات الوكلاء والمطورين

اقرأ [`AGENTS.md`](AGENTS.md) ثم [`PROJECT_ORDER.md`](PROJECT_ORDER.md) قبل أي تعديل؛ وهما المرجع التشغيلي الأعلى لطريقة تطوير ونشر المشروع.
