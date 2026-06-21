# AI Agent Handoff — Yakolak

اقرأ هذا الملف قبل أي تعديل على المشروع.

## الحالة الحالية

```txt
Current mode: v037-color-controls-only
```

التشغيل الحالي مخصص للألوان فقط.

## ملفات التشغيل

```txt
index.html
app.js
app-colors-v037.js
```

## لا تفعل هذا الآن

لا تضف معايرات مواقع.

لا تضف سلايدر مسافات.

لا ترجع معايرة كل جهة من `p.stl` أو `3.stl`.

لا تعرض حجار البورد بصريًا.

## المطلوب الحفاظ عليه

```txt
9.stl + كل 3.stl = لون واحد
كل p.stl = لون واحد
حجار قواعد الاستعداد = 4 ألوان حسب الاتجاه
حجار البورد مخفية بصريًا لكن مواقعها محفوظة في board_stones.positions
```

## القيم الذهبية الثابتة

```txt
GOLDEN_DISTANCE = 48
THREE_RADIUS = 135
P_RADIUS = 85
P_GAP = 11
```

## ملفات مرجعية

```txt
docs/COLOR_MODE_V037.md
archive/golden-v036-p-gap-11.json
archive/golden-v036-p-gap-11.js
```
