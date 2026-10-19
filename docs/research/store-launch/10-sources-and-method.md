# المصادر ومنهج البحث

**آخر تحقق: 19 أكتوبر 2026.** المرجع الآلي [sources.json](sources.json) يحفظ عنوان المصدر ونوعه وغرضه وطريقة الوصول إليه. سجل الكود [code-evidence.json](code-evidence.json) مربوط بالالتزام الذي فحص فعليا، ولا يحول الفحص الساكن إلى تجربة أجهزة.

## المنهج وحدود الاستنتاج

- بدأ البحث بالمصدر الحالي وإرشادات AGENTS، ثم سياسات المتجر الرسمية، ثم وثائق Godot 4.7 وCapacitor وTrystero، ثم تجارب أصحاب المشاكل مباشرة. لم نعتمد وعود شركات تغليف تجارية عن ضمان القبول.
- بحثنا بالعربية والإنجليزية، وبحثنا عبارات برتغالية لوثائق التصدير، وراجعنا متطلبات Apple باليابانية وGoogle بالإندونيسية والاختبار بالعربية. الترجمات من الجهة نفسها ليست مصادر مستقلة ولا أصواتا تؤكد النتيجة إحصائيا. نتائج Godot البرتغالية التي ظهرت من latest/4.x لم تُستخدم لتحديد أدوات 4.7.
- نافذة الحالات الأساسية 2025 حتى تاريخ البحث في 2026؛ أدرجت حالة spam من2024 مع متابعة2025 لارتباطها بمحرك Godot، ووسمت بأنها أقدم. حالة private APIs تخص macOS فقط؛ لا تنسب إلى iPhone.
- النص الرسمي يثبت القاعدة، وصاحب الشكوى يثبت أنه روى المشكلة. تفسيره لسببها وتقديرات الوقت والتكلفة وأولويات ياكلك استنتاجات موضحة، وليست قرارات من المتجر. لا يستنتج معدل رفض من هذه العينة.
- بعض صفحات Apple documentation أعادت shell يتطلب JavaScript، فاستُخدم نص البحث الرسمي وسجل هذا القيد. خدمة Gmedia ظهرت بمقتطف رسمي وتعذر فتحها. بعض Google community threads أعادت shell عند الفتح رغم توفر نص مباشر مفهرس؛ لم ندع قراءة تعليقات كاملة غير متاحة.
- لم نعثر في البحث العربي على عدد كاف من تجارب رفض حديثة مباشرة محددة ومؤرخة تبرر استبدال الشواهد الإنجليزية؛ لم نصطنع تجارب عربية. المصادر العربية الرسمية والحقوقية استخدمت حيث تتعلق بالمشروع.
- يجب إعادة قراءة التواريخ والنماذج والـconsole في يوم التقديم. الصفحات قد تتغير؛ لا يتحول تاريخ checked_on إلى ضمان استمرار القاعدة. لم نطلب حسابات أو نتواصل مع جهة مراجعة أو نرفع اللعبة.

## استعلامات ممثلة مما أُجري

```text
site:developer.apple.com upcoming requirements April 2026 Xcode 26 iOS 26 SDK
site:support.google.com/googleplay/android-developer target API 36 August 2026
site:docs.godotengine.org/en/4.7 exporting ios android
site:forum.godotengine.org 16 KB 2025
site:developer.apple.com/forums Godot game rejected 2026
site:support.google.com/googleplay/android-developer/thread/ 2026 production access rejected
Capacitor game App Store rejected 4.2 2025 2026 webview reddit
رفض لعبة متجر ابل جوجل بلاي 2025 2026 تجربة مطور
site:gmedia.gov.sa الألعاب التصنيف
site:docs.godotengine.org/pt-br/4.7 Android exportação
site:developer.apple.com/jp/news 2026年4月28日
site:support.google.com/googleplay/android-developer API 36 2026 Persyaratan
```

## المصادر الأساسية

نوع official مرجع صادر عن الجهة؛ primary technical وثائق صاحب التقنية؛ first-hand رواية صاحب المشكلة وقد تكون غير محسومة. كل رابط أدناه فُحص أو ظهر نصه الرسمي بحسب access المسجل.

| ID | المصدر | استخدامه وحدوده |
| --- | --- | --- |
| S01 | [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) | الاكتمال والقيمة وUGC والحقوق والدفع والخصوصية؛ access: `full_text` |
| S02 | [App Review — Distribute](https://developer.apple.com/distribute/app-review/) | الوصول للمراجع والتواصل والاستئناف؛ access: `full_text` |
| S03 | [SDK minimum requirements — April 28, 2026](https://developer.apple.com/news/upcoming-requirements/?id=04282026a) | Xcode26 وSDK26 كحد أدنى حالي؛ access: `full_text` |
| S04 | [App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/) | تعريف الجمع والبيانات المحلية وWebViews؛ access: `full_text` |
| S05 | [Third-party SDK requirements](https://developer.apple.com/support/third-party-SDK-requirements/) | SDK manifests/signatures حسب القائمة والاستخدام؛ access: `full_text` |
| S06 | [Describing use of required reason API](https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api) | أسباب استخدام APIs وmanifest؛ access: `search_excerpt_js_shell` |
| S07 | [Offering account deletion in your app](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion) | الحذف عند تقديم إنشاء حساب؛ access: `full_text` |
| S08 | [Set an app age rating](https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating/) | الاستبيان والتصنيف بحسب المنطقة والنظام؛ access: `full_text` |
| S09 | [TestFlight overview](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/) | التجربة الموقعة قبل الإطلاق؛ access: `full_text` |
| S10 | [Overview of export compliance](https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance/) | إقرار التشفير ووثائقه حسب الحزمة؛ access: `full_text` |
| S11 | [Screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/) | مقاسات اللقطات المطلوبة بحسب دعم الجهاز؛ access: `full_text` |
| S12 | [Manage Accessibility Nutrition Labels](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/manage-accessibility-nutrition-labels/) | إفصاح إمكانية الوصول بحسب الدليل الفعلي؛ access: `full_text` |
| S13 | [App testing requirements for new personal developer accounts](https://support.google.com/googleplay/android-developer/answer/14151465) | 12 مختبرا و14 يوما للحسابات المشمولة ومراجعة الوصول للإنتاج؛ access: `full_text` |
| S14 | [Target API level requirements for Google Play apps](https://support.google.com/googleplay/android-developer/answer/11926878) | API36 منذ31 أغسطس2026 للتقديم الجديد؛ access: `full_text` |
| S15 | [Support 16 KB page sizes](https://developer.android.com/guide/practices/page-sizes) | توافق المكتبات والاختبار وموعد منع التحديث الحالي1 فبراير2027؛ access: `full_text` |
| S16 | [Provide information for Google Play Data safety](https://support.google.com/googleplay/android-developer/answer/10787469) | الجمع والمشاركة والمعالجة المؤقتة وتصنيفات البيانات؛ access: `full_text` |
| S17 | [Functionality, Content, and User Experience](https://support.google.com/googleplay/android-developer/answer/9898783?hl=en) | وظيفة حقيقية وتجربة مستقرة؛ access: `search_text` |
| S18 | [User Data](https://support.google.com/googleplay/android-developer/answer/10144311) | سياسة الخصوصية والبيانات والحذف والإفصاح؛ access: `full_text` |
| S19 | [User Generated Content](https://support.google.com/googleplay/android-developer/answer/9876937?hl=en) | محتوى مرئي لبعض المستخدمين والحظر والإبلاغ بحسب الحالة؛ access: `full_text` |
| S20 | [Understanding app account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en) | الحذف في التطبيق وخارجه واستثناء الحسابات المحلية؛ access: `full_text` |
| S21 | [Manage target audience and app content settings](https://support.google.com/googleplay/android-developer/answer/9867159) | الجمهور والأطفال وإجابات المحتوى؛ access: `full_text` |
| S22 | [Payments](https://support.google.com/googleplay/android-developer/answer/9858738?hl=en) | الدفع الرقمي مع الاستثناءات والبرامج الإقليمية؛ access: `search_text` |
| S23 | [Prepare your app for review](https://support.google.com/googleplay/android-developer/answer/9859455) | App access والإقرارات قبل المراجعة؛ access: `full_text` |
| S24 | [Create and set up your app](https://support.google.com/googleplay/android-developer/answer/9859152) | بيانات الاسم والوصف30/80/4000؛ access: `full_text` |
| S25 | [Add preview assets to showcase your app](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en-AU-u-fw-mon-mu-celsius) | أيقونة512 والصورة1024×500 ولقطات فعلية؛ access: `full_text` |
| S26 | [Behavior changes: Apps targeting Android 16 or higher](https://developer.android.com/about/versions/16/behavior-changes-16) | edge-to-edge والرجوع والتكيف؛ استثناء الألعاب حيث يرد؛ access: `full_text` |
| S27 | [Become a member — Apple Developer Program](https://developer.apple.com/programs/enroll/) | 99 دولارا سنويا وأنواع الناشر والتحقق؛ access: `full_text` |
| S28 | [Get started with Play Console](https://support.google.com/googleplay/android-developer/answer/6112435) | 25 دولارا مرة واحدة والتحقق ونوع الحساب والجهاز؛ access: `full_text` |
| S29 | [Exporting for iOS — Godot 4.7](https://docs.godotengine.org/en/4.7/tutorials/export/exporting_for_ios.html) | macOS وXcode وTeam ID وexport الأصلي؛ access: `full_text` |
| S30 | [Exporting for Android — Godot 4.7](https://docs.godotengine.org/en/4.7/tutorials/export/exporting_for_android.html) | JDK17 وأدوات Android وAAB والتوقيع؛ مثالSDK35 لا يحسم سياسة36؛ access: `full_text` |
| S31 | [Exporting for the Web — Godot 4.7](https://docs.godotengine.org/en/4.7/tutorials/export/exporting_for_web.html) | قيود الويب والأداء مقابل native؛ access: `full_text` |
| S32 | [Capacitor Configuration](https://capacitorjs.com/docs/config) | server.url وcleartext وallowNavigation ليست إعداد إنتاج افتراضي؛ access: `full_text` |
| S33 | [Game Development with Capacitor](https://capacitorjs.com/docs/guides/games) | إمكان استخدام WebGL/canvas للألعاب، وليس اعتماد ياكلك؛ access: `full_text` |
| S34 | [WebRTC — Godot 4.7](https://docs.godotengine.org/en/4.7/tutorials/networking/webrtc.html) | الاحتياج إلى native extension خارج Web والإذن على Android؛ access: `full_text` |
| S35 | [Trystero repository and documentation](https://github.com/dmotz/trystero) | TURN للشبكات المقيدة؛ واجهات النسخة الحالية قد تختلف عن0.26.0؛ access: `full_text` |
| S36 | [Complying with licenses — Godot 4.7](https://docs.godotengine.org/en/4.7/about/complying_with_licenses.html) | إتاحة رخصة المحرك وإشعارات أطرافه والأصول؛ access: `full_text` |
| S37 | [ترخيص خط ثمانية](https://font.thmanyah.com/licenses) | تجاري/تضمين معبأ مسموح، وتوزيع خام/تنزيل مستقل مقيد؛ access: `full_text` |
| S38 | [فسح الألعاب الإلكترونية](https://gmedia.gov.sa/services/electronic-games-break) | وجود خدمة؛ لا يحسم وحده انطباقها على هذا التطبيق؛ access: `search_excerpt_open_failed` |
| S39 | [Milestones — IARC](https://globalratings.com/milestones/) | انضمامGmedia2024 وبدء تصنيفاتها فيIARC2026؛ access: `full_text` |
| S40 | [نظام حماية البيانات الشخصية](https://dgp.sdaia.gov.sa/wps/portal/pdp/knowledgecenter/details/PDPL) | نطاق المعالجة وحقوق الأشخاص؛ تقييم انطباق لاحق؛ access: `full_text` |
| S41 | [App Store fraud prevention and review results in 2025](https://www.apple.com/newsroom/2026/05/the-app-store-stopped-over-2-point-2-billion-usd-in-fraudulent-transactions-in-2025/) | إحصاءاتsubmissions منشورة20 مايو2026؛ ليست احتمال رفض لعبة؛ access: `full_text` |
| S42 | [Maintenance release: Godot 4.7.2](https://godotengine.org/article/maintenance-release-godot-4-7-2/) | يوجد patch أحدث للتقييم، ليس ترقية إلزامية؛ access: `full_text` |
| S43 | [System requirements — Godot 4.7](https://docs.godotengine.org/en/4.7/about/system_requirements.html) | حدود المحرك لا تغني عن قياسات مشروع3D الفعلي؛ access: `full_text` |
| S44 | [Manage a submission with unresolved issues](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/manage-a-submission-with-unresolved-issues/) | إصلاح عناصر الرفض وإعادة التقديم؛ access: `full_text` |
| S45 | [Required documents by country and region — Saudi Arabia](https://support.google.com/googleplay/android-developer/answer/15633622?co=GENIE.CountryCode%3DSA&hl=en) | وثائق تحقق هوية بحسب البرنامج والحساب السعودي؛ access: `search_text` |
| S46 | [Add an app icon](https://developer.apple.com/help/app-store-connect/manage-app-information/add-an-app-icon/) | أيقونة ضمنXcode asset catalog ومواضع ظهورها؛ access: `full_text` |
| S47 | [Release app updates with staged rollouts](https://support.google.com/googleplay/android-developer/answer/6346149) | staged rollout للتحديثات لا لأول نشر؛ access: `full_text` |
| S48 | [Release a version update in phases](https://developer.apple.com/help/app-store-connect/update-your-app/release-a-version-update-in-phases/) | phased release لتحديث الإصدار؛ access: `full_text` |
| S49 | [Sign your app](https://developer.android.com/studio/publish/app-signing) | App Signing وupload key وحمايته؛ access: `full_text` |
| S50 | [Support 64-bit architectures](https://developer.android.com/google/play/requirements/64-bit) | دعم 64-bit في Google Play وفحص المكتبات الأصلية؛ لا تنسخ target SDK القديم من أمثلة بناء هذه الصفحة.؛ access: `search_text` |
| S51 | [Upcoming Requirements — current list](https://developer.apple.com/news/upcoming-requirements/) | من 9 سبتمبر 2026 يجب استهداف iOS/iPadOS 13 أو أحدث؛ Game Center entitlement عند تقديم ميزاته، لا لكل لعبة.؛ access: `full_text` |
| S52 | [Google Play Games — Revamped Level Up guidelines](https://developer.android.com/games/guidelines) | البرنامج اختياري؛ شروط PGS وcloud save وتعدد الأجهزة تخص أهلية مزاياه ولا تعمم على أول إدراج لعبة.؛ access: `full_text` |
| C01 | [iOS app rejected – unresponsive on launch](https://forum.godotengine.org/t/ios-app-rejected-unresponsive-on-launch/130784) | 10 يناير2026؛ شكوىGodot4.5/startup؛ تفسيرshaders غير محسوم؛ access: `full_text` |
| C02 | [App rejection](https://developer.apple.com/forums/thread/790882) | يونيو2025؛2.1 unable to launch علىiPhone13mini؛ access: `full_text` |
| C03 | [iOS app failing App Store review (flagged as spam)](https://forum.godotengine.org/t/ios-app-failing-app-store-review-flagged-as-spam/82336) | 12 سبتمبر2024 مع متابعةيناير2025؛ فرضيةbinary ليست حقيقة مثبتة؛ access: `full_text` |
| C04 | [Godot And Google Play Policy Warning about 16 KB memory page size](https://forum.godotengine.org/t/godot-and-google-play-policy-warning-about-16-kb-memory-page-size/120934) | أغسطس/سبتمبر2025؛ تحذير بتاريخ تاريخي لا سياسة2026؛ access: `full_text` |
| C05 | [Production access rejected despite meeting all testing requirements](https://support.google.com/googleplay/android-developer/thread/437297172/production-access-rejected-despite-meeting-all-testing-requirements?hl=en) | 28 مايو 2026؛ خروج مختبرين قبل الطلب؛ لا سبب داخلي مؤكد للرفض.؛ access: `search_text_open_shell` |
| C06 | [Rejected 3 times for production access despite meeting testing requirements](https://support.google.com/googleplay/android-developer/thread/447974715/rejected-3-times-for-production-access-despite-meeting-testing-requirements?hl=en) | 5 يوليو 2026؛ رواية رفض متكرر رغم التحديثات؛ بلا تشخيص نهائي.؛ access: `search_text` |
| C07 | [Repeated App Store rejection under Guideline 5.6 — Capacitor/WebView app](https://www.reddit.com/r/iOSProgramming/comments/1wjuwlg/repeated_app_store_rejection_under_guideline_56/) | تاريخ نسبي: شهر قبل الرصد؛ ثلاثة رفضات 5.6؛ لا يثبت منع WebView.؛ access: `full_text` |
| C08 | [Stuck in Waiting for review 10+ days](https://developer.apple.com/forums/thread/851297) | إرسال 6 أكتوبر 2026؛ انتظار وأسئلة معلومات، وليس رفضا تقنيا محددا.؛ access: `full_text` |
| C09 | [App Store: App rejected (API non public)](https://forum.godotengine.org/t/app-store-app-rejected-api-non-public/130768) | يناير/فبراير 2026؛ Mac App Store فقط، وليس دليلا على iOS.؛ access: `full_text` |
| C10 | [App stuck in Waiting for Review — expedite approved](https://developer.apple.com/forums/thread/851304) | أكتوبر 2026؛ background audio وreviewer access؛ بلا قبول نهائي مرصود.؛ access: `full_text` |

## مراجعات اللغة من الناشر نفسه

- [اختبار الحسابات الشخصية بالعربية](https://support.google.com/googleplay/android-developer/answer/14151465?hl=ar).
- [متطلبات SDK لدى Apple باليابانية](https://developer.apple.com/jp/news/?id=ueeok6yw).
- [Target API لدى Google بالإندونيسية](https://support.google.com/googleplay/android-developer/answer/11926878?hl=id).

## ما لم يثبت

لم يثبت قبول أي route لياكلك في المتاجر، أو نجاح اتصال أجهزة فعلية في هذه الجولة، أو ملكية كل أصل، أو نوع حساب الناشر، أو الاحتفاظ الفعلي لكل relay. تركت هذه البنود مفتوحة في الخطة. لا تعتمد مواعيد منتديات2025 مقابل صفحة رسمية2026، ولا تنقل مثال SDK35 إلى شرط تقديم API36.
