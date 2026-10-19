# بنية سياسة خصوصية ياكلك — مسودة غير قابلة للنشر كما هي

تملأ بعد اعتماد النطاق وجرد الشبكة. ليست إقرارًا بأن البيانات لا تجمع، ولا تحل محل مراجعة انطباق المتطلبات على الكيان الفعلي.

| البند | المحتوى العربي المطلوب | English field |
| --- | --- | --- |
| المسؤول والتاريخ | الاسم القانوني، البريد الحقيقي، آخر تحديث | Controller, contact, effective date |
| نطاق اللعبة | محلي/بوتات/online والبلدان الفعلية | Modes and territories |
| البيانات المحلية | الاسم والإعدادات وأي هاتف بقي، موقع الحفظ | On-device profile and settings |
| بيانات اللعب المشترك | أسماء/مقاعد/لوحة/معرفات جلسة وأطراف الوصول | Multiplayer data and recipients |
| خدمات الاتصال | relay/STUN/TURN المحددة، أغراضها واحتفاظها | Network providers and retention |
| التشخيص | هل يوجد، opt-in، الحقول والمدة والمسؤول | Diagnostics, choice, fields and duration |
| الغرض والأساس | الوظيفة/الأمان/غيرها مع أساس المعالجة المنطبق | Purposes and applicable basis |
| المدة | مدة رقمية أو معيار واضح لكل صنف | Retention for each data class |
| التحكم | مسح محلي، إلغاء مشاركة/خروج، طلب حذف عند انطباقه | Choices and deletion requests |
| الحساب | إن وجد، الحذف من التطبيق وخارجه بحسب المنصة | Account deletion if offered |
| الأطفال | الجمهور الحقيقي والتعامل مع القاصرين | Intended audience and children |
| النقل الخارجي | الأطراف والضمانات الفعلية عند الحاجة | International transfers if applicable |
| الأمان | وصف واقعي دون ضمان حماية مطلقة | Security practices without absolute claims |
| التغييرات والدعم | إخطار التحديث وقناة الشكوى | Changes, support and complaints |

نص افتتاحي يملأ:

> توضح هذه السياسة كيف تتعامل {{الجهة_المسؤولة}} مع البيانات عند استخدام ياكلك. تشمل النسخة {{أنماط_اللعب_المعتمدة}}. للتواصل: {{بريد_حقيقي}}. آخر تحديث: {{تاريخ}}.

English opening draft:

> This policy explains how {{CONTROLLER}} handles data when you use Yakolak. This release includes {{VERIFIED_MODES}}. Contact: {{REAL_EMAIL}}. Last updated: {{DATE}}.

لا ترفع placeholders. لا تقل «لا نستخدم أطرافًا ثالثة» مع Trystero relays، ولا «كل البيانات محلية» مع أسماء وsnapshots تتبادل بين الأجهزة، ولا «بياناتكم في السعودية» دون دليل على مواقع المعالجة. سياسة SDK عامة لا تصف تلقائيًا إعدادك المحدد. إن أزيل الهاتف أو التشخيص، يثبت ذلك بفحص release ثم تحذف الفقرات غير المنطبقة من النسختين.
