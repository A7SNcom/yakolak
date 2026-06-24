# Yakolak

لعبة Yakolak ثلاثية الأبعاد على GitHub Pages.

## مهم جدًا قبل أي تعديل

اقرأ ملف القواعد أولًا:

```txt
docs/YAKOLAK_PROJECT_RULES.md
```

هذا الملف يوضح الثوابت، أماكن العناصر الأساسية، وممنوعات التخمين حتى لا نعيد اختراع العجلة.

## مسار التشغيل الحالي

```txt
index.html -> app.js -> src/app-prod-stage1.js
```

## شكل المشروع

```txt
/
├─ index.html
├─ app.js
├─ version.json
├─ README.md
├─ src/
│  ├─ app-prod-stage1.js      ملف اللعبة الحالي الفعلي
│  └─ app-live.js             ملف قديم/مرجعي إن وجد
├─ assets/
│  └─ models/
│     ├─ 9.stl
│     ├─ 3.stl
│     ├─ l.stl
│     ├─ m.stl
│     ├─ s.stl
│     ├─ uploads_files_3139458_Mars+Angled+Stump+Side+Table+30x30x45.obj
│     ├─ Mars Angled Stump Side Table 30x30x45_Albedo.png
│     ├─ Mars Angled Stump Side Table 30x30x45_Normal.png
│     └─ Mars Angled Stump Side Table 30x30x45_Roughness.png
├─ docs/
│  └─ YAKOLAK_PROJECT_RULES.md
├─ archive/
└─ legacy/
```

## معنى المجلدات

```txt
src/      كود اللعبة الحالي
assets/   المجسمات والخامات التي يطلبها الموقع
docs/     التوثيق والقواعد والإرشادات
archive/  النسخ الذهبية إن وجدت
legacy/   الملفات القديمة إن وجدت
```

## القيم الذهبية

```txt
D  = 48    المسافة بين القطع
R3 = 135   نصف قطر قواعد 3
```

## عناصر لا يتم استبدالها عشوائيًا

```txt
الطاولة الأصلية: OBJ Mars Table
خامة الطاولة: Albedo / Normal / Roughness
الغرفة: أرض + سقف + 4 جدران
الانترو: يبقى كما هو إلا بطلب مباشر
ترتيب القطع: لا يتغير إلا بطلب مباشر
```

## طريقة التحديث الصحيحة

```txt
1. عدل أصغر جزء ممكن.
2. لا تخترع خامة أو مكان أو حجم إذا له أصل سابق.
3. ارفع BUILD في index.html و app.js و version.json.
4. اكتب وصف التغيير في version.json.
5. اختبر الرابط مع ?v=BUILD.
```
