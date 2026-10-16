# 08 — المصادر ومنهج البحث وحدوده

تاريخ المراجعة: 16 أكتوبر 2026 بتوقيت UTC. المشروع: [`A7SNcom/yakolak@6863fa2`](https://github.com/A7SNcom/yakolak/tree/6863fa2baefb246637948dd60d837183221c3217). هذا بحث تطبيقي موجه لتصميم شرح لعبة محددة، وليس مراجعة منهجية مسجلة أو حصرًا لكل أدبيات التعلم.

## كيف جرى البحث؟

بدأ من أسئلة: ما القواعد الفعلية؟ ماذا شُرح سابقًا؟ هل نعلّم التحكم أم الاستراتيجية؟ كيف نفرق الفهم عن اتباع التعليمات؟ ثم بحث في الويب عبر محركي البحث المتاحين، واتبع DOI وصفحات الناشرين ونسخ المؤلفين الجامعية والمراجع ذات الصلة.

محاور البحث شملت in-game tutorials، complexity، implicit/explicit tutorials، discovery learning، worked examples، fading، cognitive load، retrieval practice، formative feedback، animation، وتعليم قواعد Otrio وQuarto وGobblers وشيفرة Lichess ومواد BGA. هذه خريطة موضوعات وليست ادعاء تسجيل بروتوكول بحث حرفي سابق للنتائج.

فُضلت الدراسات الأصلية والتحليلات التلوية والمراجعات الأكاديمية المنشورة، ومصادر الألعاب الرسمية. المدونات والمواد التجارية أو نتائج البحث التي لم تُتحقق لا تُعامل دليلًا علميًا. لم يُستعمل ملخص مولد أو رأي تسويقي لإثبات أثر تعليمي. تنوع عمر المصادر مقصود: مبادئ تأسيسية، تجارب مباشرة على شروح الألعاب، ومثال أحدث بنتيجة غير إيجابية للتكيف.

## درجات الاطلاع

- **نص متاح:** قُرئت أجزاء المنهج والنتائج ذات الصلة من النص الأصلي المتاح؛ لا يعني تدقيق كل مرجع ملحق.
- **ملخص أصلي:** المعلومات من الناشر أو صفحة الجامعة؛ لا ننسب تفاصيل لم تكن ظاهرة.
- **اطلاع محدود:** المصدر معروف، لكن تعذر فتح نصه مباشرة؛ يوضع خلفية ولا يحمل وحده قرارًا حاسمًا.
- **مادة منتج/شيفرة:** يمكن إثبات أسلوب تعليم أو قاعدة، ولا يثبت ذلك فاعليته البشرية.

## المراجع العلمية

| الرمز | المرجع وبيانات النشر | رابط القراءة والتحقق | درجة الاطلاع ومكان الاستخدام |
|---|---|---|---|
| R01 | Andersen et al. (2012). *The Impact of Tutorials on Games of Varying Complexity*. CHI '12. DOI: `10.1145/2207676.2207687` | [ورقة المؤلفين](https://grail.cs.washington.edu/projects/game-abtesting/chi2012/chi2012.pdf)، [صفحة المشروع](https://grail.cs.washington.edu/projects/game-abtesting/chi2012/) | نص متاح؛ الأدلة 02 والمقارنة 03 |
| R02 | Cao, S., & Liu, F. (2022). *Learning to play: understanding in-game tutorials with a pilot study on implicit tutorials*. Heliyon, 8(11), e11482. DOI: `10.1016/j.heliyon.2022.e11482` | [صفحة الجامعة](https://scholar.xjtlu.edu.cn/en/publications/learning-to-play-understanding-in-game-tutorials-with-a-pilot-stu/)، [نص المقال المتاح](https://www.researchgate.net/publication/365338825_Learning_to_play_understanding_in-game_tutorials_with_a_pilot_study_on_implicit_tutorials)، [PubMed](https://pubmed.ncbi.nlm.nih.gov/36419670/) | نص متاح، خاصة جدولَي تقييم الشرح والأداء؛ 02 |
| R03 | Sweller, J., van Merriënboer, J. J. G., & Paas, F. (2019). *Cognitive Architecture and Instructional Design: 20 Years Later*. Educational Psychology Review, 31, 261–292. DOI: `10.1007/s10648-019-09465-5` | [الناشر والنص](https://link.springer.com/article/10.1007/s10648-019-09465-5) | نص متاح؛ 02 ثم استنتاجات التصميم 04 |
| R04 | Mayer, R. E., & Moreno, R. (2003). *Nine Ways to Reduce Cognitive Load in Multimedia Learning*. Educational Psychologist, 38(1), 43–52. DOI: `10.1207/S15326985EP3801_6` | [DOI](https://doi.org/10.1207/S15326985EP3801_6)، [نص أتاحه Mayer](https://www.researchgate.net/publication/253772914_Nine_Ways_to_Reduce_Cognitive_Load_in_Multimedia_Learning) | نص متاح؛ خاصة التجزئة والتدريب المسبق وحذف الزوائد وحدود عدد التجارب؛ 02 |
| R05 | Alfieri, L., Brooks, P. J., Aldrich, N. J., & Tenenbaum, H. R. (2011). *Does Discovery-Based Instruction Enhance Learning?* Journal of Educational Psychology, 103(1), 1–18. DOI: `10.1037/a0021017` | [جامعة Surrey](https://openresearch.surrey.ac.uk/esploro/outputs/journalArticle/Does-Discovery-Based-Instruction-Enhance-Learning/99515521902346)، [DOI](https://doi.org/10.1037/a0021017) | ملخص أصلي جامعي؛ 02 |
| R06 | Renkl, A., Atkinson, R. K., Maier, U. H., & Staley, R. (2002). *From Example Study to Problem Solving: Smooth Transitions Help Learning*. Journal of Experimental Education, 70(4), 293–315. DOI: `10.1080/00220970209599510` | [صفحة الجامعة](https://asu.elsevierpure.com/en/publications/from-example-study-to-problem-solving-smooth-transitions-help-lea/)، [DOI](https://doi.org/10.1080/00220970209599510) | ملخص أصلي جامعي؛ 02 |
| R07 | Karpicke, J. D., & Blunt, J. R. (2011). *Retrieval Practice Produces More Learning than Elaborative Studying with Concept Mapping*. Science, 331, 772–775. DOI: `10.1126/science.1199327` | [نسخة المؤلف في Purdue](https://learninglab.psych.purdue.edu/downloads/2011/2011_Karpicke_Blunt_Science.pdf)، [PubMed](https://pubmed.ncbi.nlm.nih.gov/21252317/) | نص متاح؛ 02 وتبرير اختبار النقل في 06 |
| R08 | Shute, V. J. (2008). *Focus on Formative Feedback*. Review of Educational Research, 78(1), 153–189. DOI: `10.3102/0034654307313795` | [ملخص الناشر](https://journals.sagepub.com/doi/abs/10.3102/0034654307313795) | ملخص أصلي؛ 02، دون نسبة تفاصيل تجريبية غير مقروءة |
| R09 | Tversky, B., Morrison, J. B., & Bétrancourt, M. (2002). *Animation: can it facilitate?* International Journal of Human-Computer Studies, 57(4), 247–262. DOI: `10.1006/ijhc.2002.1017` | [DOI والملخص](https://doi.org/10.1006/ijhc.2002.1017)، [نسخة أتاحتها Tversky](https://www.researchgate.net/publication/222528842_Animation_Can_it_facilitate) | نص المؤلفة المتاح، خاصة المقدمة ومبدأَي التمثيل والإدراك؛ 02 |
| R10 | Dunlosky, J., Rawson, K. A., Marsh, E. J., Nathan, M. J., & Willingham, D. T. (2013). *Improving Students' Learning With Effective Learning Techniques: Promising Directions From Cognitive and Educational Psychology*. Psychological Science in the Public Interest, 14(1), 4–58. DOI: `10.1177/1529100612453266` | [النص لدى الناشر](https://journals.sagepub.com/doi/10.1177/1529100612453266)، [عرض APS الرسمي](https://www.psychologicalscience.org/publications/journals/pspi/learning-techniques.html) | نص متاح؛ أقسام اختبار الممارسة والممارسة الموزعة، 02 |
| R11 | Sinha, T., & Kapur, M. (2021). *When Problem Solving Followed by Instruction Works: Evidence for Productive Failure*. Review of Educational Research, 91(5), 761–798. DOI: `10.3102/00346543211019105` | [النص لدى الناشر](https://journals.sagepub.com/doi/10.3102/00346543211019105) | نص متاح؛ 02، بوصفه دليلًا مضادًا لتعميم التعليم أولًا |
| R12 | Faber et al. (2024). *Effects of adaptive scaffolding on performance, cognitive load and engagement in game-based learning: a randomized controlled trial*. BMC Medical Education, 24, 943. DOI: `10.1186/s12909-024-05698-3` | [النص لدى الناشر](https://link.springer.com/article/10.1186/s12909-024-05698-3) | نص متاح؛ 02، مع فصل المقارنة الأساسية عن التحليلات الاستكشافية |

تُستعمل ResearchGate في R02 وR04 وR09 للوصول إلى **نص المقال الأصلي** الظاهر، لا بوصفها محررًا علميًا أو اعتمادًا على تعليقات مستخدمي الموقع. بيانات النشر تُطابق DOI/الناشر أو سجل الجامعة. روابط `master` للمنتجات الخارجية قد تتغير؛ الوصف يعكس ما قُرئ في تاريخ البحث.

## مصادر الألعاب والإتاحة

| الرمز | المصدر الأصلي | ما استُخدم منه |
|---|---|---|
| G01 | [Otrio — How to Play](https://otrio.com/pages/how-to-play)، [Spin Master — Otrio](https://www.spinmaster.com/en-us/brands/spin-master-family-games/otrio-board-game/) | القواعد والإعداد والأنماط؛ الصفحة الثانية تعريفية، ولم تكن واجهتها النصية كاملة |
| G02 | [Gigamic — Quarto](https://www.gigamic.com/jeux-a-deux/74-quarto-3421273322816.html)، [الكتيب التعليمي](https://www.gigamic.com/index.php?controller=attachment&id_attachment=657)، [القواعد](https://www.gigamic.com/index.php?controller=attachment&id_attachment=72) | تدرج أنشطة الخصائص والتصنيف والإكمال والمنع؛ قُرئ نص PDF ذي 6 صفحات |
| G03 | [Blue Orange — Gobblers Rules 2025](https://www.blueorangegames.com/webroot/img/games/rules/Gobblers_Rules_US.pdf)، [Gobblet Gobblers](https://blueorangegames.eu/en/games/gobblet-gobblers/) | اختلاف التغطية والنقل؛ PDF أصلي ذو صفحتين |
| G04 | [Lichess Learn](https://lichess.org/learn)، [Practice](https://lichess.org/practice)، [rook.ts](https://github.com/lichess-org/lila/blob/master/ui/learn/src/stage/rook.ts)، [checkmate1.ts](https://github.com/lichess-org/lila/blob/master/ui/learn/src/stage/checkmate1.ts) | أهداف المراحل والأسهم ثم غيابها، واختبار خاصية المات في المصدر؛ لا اختبار استخدام شخصي شامل |
| G05 | [BGA — Interactive tutorials، إعلان 2022](https://en.boardgamearena.com/news?id=572) | التأليف والمراجعة والترجمة؛ لا استخدام عدد الشروح التاريخي كإحصاء حالي |
| A01 | [W3C — Understanding Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html) | عدم اعتماد دلالة التعليم على اللون وحده؛ ليس شهادة امتثال للعبة |
| A02 | [W3C — Understanding Target Size Minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) | التفريق بين الحد المعياري وشروطه واستثناءاته وبين هدف لمس أكبر نقترحه |

## مصادر المشروع

توجد روابط الملفات والالتزامات في [التدقيق 01](01-rules-and-repository-audit.md). قُرئت القواعد المشتركة ومسار جلسة Godot وسلطة الغرفة وإعداد البداية وسكربت الشرح، وفروق التغييرات التاريخية الرئيسية. الجلب التاريخي كان حسب مسارات محددة عبر GitHub؛ لا ندّعي أرشفة كل فرع أو نسخة قديمة أو مشاهدة كل فيديو للمحاولات.

اختُبرت مواقف التأليف باستخدام القواعد الحالية فقط؛ تقرير النتائج وحدوده في [07](07-scenario-rule-audit.md). لم تُعدّل ملفات `scripts/` أو `ui/` أو `api/` أو `rules/` أو `web/` ضمن البحث.

## حدود الوصول والاستبعاد

- بعض صفحات الناشرين والمستودعات منعت القراءة أو عرضت تحققًا؛ استُعملت نسخ أصلية متاحة عند وجودها. بقي R05 وR06 وR08 ضمن حدود ملخصاتها الأصلية، دون ادعاء قراءة التفاصيل التجريبية كاملة.
- نسخة PDF مقبولة لبحث عن أمثلة محلولة داخل ألعاب البرمجة تعذرت قراءتها بسبب حظر الوصول؛ لم نستخدم نتائجها لإسناد قرار.
- رابط قواعد Otrio من مقهى ألعاب أعاد خطأ؛ استُعيض عنه بالمصدر الرسمي، ولم يُعدّ ناشرًا أصليًا.
- مادة BGA وشيفرة Lichess وكتيب Quarto أمثلة تصميم قابلة للفحص، لا تجارب تثبت السببية أو نتائج عربية.
- لا توجد مقابلات أو قياسات دماغ أو تجربة أندرويد/آيفون لهذا الشرح المقترح؛ خطة إجرائها فقط في 06.
- لا تعميم من طلاب طب أو متعلمي نصوص أو ألعاب أعقد مباشرة إلى مستخدم ياكلك. كل تحويل إلى تصميم مُعنون كاقتراح، ويحتاج اختبارًا.

## من الدليل إلى القرار

| قرار مقترح | أساسه | ما يبقى فرضية؟ |
|---|---|---|
| مسار قصير قابل للتجاوز | اختلاف أثر الشروح بحسب التعقيد R01 والخبرة R03 | فائدته ومدته الفعلية لفئات ياكلك |
| تجربة بمساعدة متدرجة | R05 وR06، مع حدود R11 | مقدار المساعدة الأنسب وترتيب الأنماط |
| موقف مستقل جديد | R07 وR10 | نوع الأسئلة الذي يتنبأ بلعب صحيح في ياكلك |
| تفسير محدد للخطأ | R08 مع R03 | الصياغة والتوقيت الأفضل بالعربية |
| حركة توضح السبب ثم وقفة قابلة للقراءة | R09 ومطلب الاستمرارية البصرية للمشروع | المدة والمنحنى الملائمان على الأجهزة |
| تفرعات بسيطة بدل نظام تكيف ضخم | حدود R12 وكلفة المشروع | هل يؤدي التفرع نفسه إلى تحسن قابل للقياس؟ |
| مثال الخانة المختلطة والمنع بالحجم | قواعد المشروع وG01 ومقارنة G03 | مدى شيوع الالتباس الفعلي لدى المبتدئين |
| عدم إعادة بناء اختيار الألوان | تدقيق النسخة الحالية وطلب التطوير التراكمي | أفضل موضع لمدخل التعلم ضمن الواجهة القائمة |

معيار اكتمال البحث هنا هو وضوح المصادر والحدود والتصور القابل للاختبار؛ لا يُستبدل بذلك إثبات نجاح شرح لم يُبنَ بعد.
