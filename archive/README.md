# Yakolak Archive

هذا المجلد للأشياء الذهبية التي لا نريد فقدانها.

## الحالة الذهبية الحالية

### `golden-v036-p-gap-11.json`
الأرشيف الرسمي للحالة الذهبية الجديدة.

### `golden-v036-p-gap-11.js`
نفس الحالة الذهبية بصيغة JavaScript سهلة النسخ.

## القاعدة الذهبية الحالية

```txt
version = v036-p-gap-11
pPieceGap = 11
GOLDEN_DISTANCE = 48
THREE_RADIUS = 135
P_RADIUS = 85
```

المعايرة الوحيدة المسموحة الآن:

```txt
pPieceGap
```

ومعناها: تباعد قطع `p.stl` عن بعضها فقط.

## ممنوع نرجع له بدون سبب قوي

```txt
معايرة كل جهة من p.stl
معايرة كل جهة من 3.stl
تحريك مراكز p.stl
تحريك مراكز 3.stl
تغيير تباعد الحجار 48 بدون اختبار بصري
```

## أرشيف سابق

### `golden-calibration-v030.json`
المعايرة الممتازة السابقة قبل إضافة منطق `p.stl` الجديد.

### `golden-calibration-v030.js`
نفس المعايرة السابقة بصيغة JavaScript.

## قاعدة مهمة

أي مطور أو وكيل ذكي يجب أن يقرأ:

```txt
docs/CURRENT_GOLDEN_STATE.md
docs/AI_AGENT_HANDOFF.md
archive/golden-v036-p-gap-11.json
```

قبل تعديل أي شيء في منطق المعايرة.
