# Yakolak

لعبة Yakolak ثلاثية الأبعاد للويب، منشورة عبر Vercel ومتصلة بمستودع GitHub.

## قبل أي تعديل

اقرأ أولًا:

```txt
docs/YAKOLAK_PROJECT_RULES.md
```

## النسخة المعتمدة

```txt
version: v092-calibration-tutorial-fixes
build:   92
```

تم استرجاع ملفات النسخة المنشورة من Vercel إلى GitHub، وتوجد بصمات الملفات في:

```txt
docs/recovery/VERCEL_V092_RECOVERY.md
```

## مسار التشغيل الحالي

```txt
index.html -> app.js -> src/app-game-v085.js
```

## بنية المشروع الحالية

```txt
/
├─ index.html                         غلاف الصفحة وشاشة التحميل والكاش
├─ app.js                             نقطة دخول النسخة 92
├─ version.json                       رقم النسخة ووصفها
├─ package.json                       اعتماد خادم المعايرة
├─ api/
│  └─ calibration.js                 قراءة وحفظ إعدادات المعايرة
├─ config/
│  └─ calibration-v092.js            الإعداد الافتراضي المطابق للإنتاج
├─ src/
│  └─ app-game-v085.js               ملف اللعبة الفعلي في النسخة 92
├─ assets/
│  ├─ fonts/
│  │  └─ expo-arabic-medium.ttf
│  └─ models/
│     ├─ 9.stl                       البورد والغطاء
│     ├─ 3.stl                       قواعد اللاعبين
│     ├─ l.stl                       الحجر الكبير
│     ├─ m.stl                       الحجر الوسط
│     ├─ s.stl                       الحجر الصغير
│     ├─ p.stl                       علامة النقاط
│     ├─ table.svg                   شكل الطاولة الحالي
│     └─ Mars Angled...png           خرائط لون ونورمل وخشونة الطاولة
└─ docs/
   ├─ YAKOLAK_PROJECT_RULES.md
   └─ recovery/VERCEL_V092_RECOVERY.md
```

## الثوابت الذهبية

```txt
D  = 48
R3 = 135
```

لا تغيّر مواضع البورد أو ترتيب القطع أو توقيت الانترو دون طلب صريح واختبار مرئي.

## متغيرات الخادم

```env
TURSO_DATABASE_URL=
TURSO_AUTH_TOKEN=
CALIBRATION_ADMIN_TOKEN=
```

المتغير الثالث اختياري. عند ضبطه، يتطلب حفظ المعايرة إرسال الرمز في ترويسة الطلب.

## طريقة التحديث

```txt
1. ابدأ من فرع جديد.
2. عدّل أصغر نطاق ممكن.
3. ارفع BUILD في index.html و app.js و version.json وملف اللعبة.
4. حدّث وصف version.json.
5. اختبر معاينة Vercel على الجوال والكمبيوتر.
6. لا تدمج إلى main قبل نجاح المعاينة وواجهة /api/calibration.
```
