const variant=(id,name,description,query={})=>({id,name,description,query});
const one=[variant('current','النسخة الحالية','الحالة المعتمدة حاليًا')];

export const sceneDefinitions=[
  {id:'loading-star',kind:'scene',type:'single',defaultName:'مشهد التحميل',description:'تحميل البداية والنجمة وحركة الهبوط.',label:'مشهد',mark:'✦',sourceKey:'scene.loading-star',journey:'الدخول',variants:one},
  {id:'empty-table',kind:'scene',type:'single',defaultName:'الغرفة والطاولة',description:'الغرفة الأساسية قبل ظهور إعدادات اللعب.',label:'مشهد',mark:'□',sourceKey:'scene.empty-table',journey:'الدخول',variants:one},
  {id:'logo-wall',kind:'scene',type:'single',defaultName:'جدار الشعارات',description:'جدار ياكلك ومتكيّف ونهاية حركة الدخول.',label:'مشهد',mark:'Y',sourceKey:'scene.logo-wall',journey:'الدخول',variants:one},
  {id:'clean-entry',kind:'scene',type:'sequence',defaultName:'رحلة الدخول النظيفة',description:'المسار الكامل من التحميل إلى جدار الشعارات.',label:'رحلة',mark:'→',sourceKey:'scene.clean-entry',journey:'الدخول',variants:one},
  {id:'unboxing-intro',kind:'scene',type:'sequence',defaultName:'إنترو فك العلبة',description:'إظهار ميدان اللعب والقواعد دون بقايا واجهة.',label:'رحلة',mark:'↥',sourceKey:'scene.unboxing-intro',journey:'الدخول',variants:one},
  {id:'color-selection',kind:'scene',type:'state',defaultName:'اختيار اللون',description:'اختيار لون اللاعب من إعداد اللعبة الحقيقي.',label:'حالة',mark:'●',sourceKey:'gameState.setupStep="color"',journey:'الإعداد',variants:one},
  {id:'player-count-selection',kind:'scene',type:'state',defaultName:'اختيار عدد اللاعبين',description:'اختيار عدد اللاعبين والخصوم.',label:'حالة',mark:'4',sourceKey:'gameState.setupStep="bots"',journey:'الإعداد',variants:one},
  {id:'board-bases',kind:'scene',type:'single',defaultName:'الميدان والقواعد',description:'ميدان اللعب ومناطق الراحة الأربع.',label:'مشهد',mark:'＋',sourceKey:'scene.board-bases',journey:'الإعداد',variants:one},
  {id:'tutorial-first-move',kind:'scene',type:'state',defaultName:'تعليم أول حركة',description:'رسالة التعليم ثم التوجيه داخل أول دور حقيقي.',label:'حالة',mark:'?',sourceKey:'gameState.firstMoveGuide',journey:'التعليم',variants:[variant('prompt','رسالة البداية','القرار بين بدء التعليم أو تخطيه'),variant('guided','التوجيه داخل اللعب','أول دور مع تعليم عملي على اللوحة')]},
  {id:'gameplay-ready',kind:'scene',type:'state',defaultName:'بداية اللعب',description:'اللوحة بعد اكتمال الإعداد وقبل أول حركة.',label:'حالة',mark:'▶',sourceKey:'gameState.started',journey:'اللعب',variants:[variant('two-players','لاعبان','اللاعب مع خصم واحد'),variant('four-players','أربعة لاعبين','كل الألوان والقواعد نشطة')]},
  {id:'legal-moves',kind:'scene',type:'state',defaultName:'اختيار القطعة والخانات',description:'إظهار الخانات القانونية بعد اختيار حجم القطعة.',label:'حالة',mark:'◎',sourceKey:'syncPlayableZoneMarkers',journey:'اللعب',variants:[variant('large','قطعة كبيرة','الخانات المتاحة للحجم الكبير',{size:'l'}),variant('medium','قطعة متوسطة','الخانات المتاحة للحجم المتوسط',{size:'m'}),variant('small','قطعة صغيرة','الخانات المتاحة للحجم الصغير',{size:'s'})]},
  {id:'turn-state',kind:'scene',type:'state',defaultName:'انتقال الدور',description:'وضوح اللاعب النشط والمؤقت وحالة اللوحة.',label:'حالة',mark:'↻',sourceKey:'gameState.currentIndex',journey:'اللعب',variants:[variant('front','دور الأخضر','الدور الحالي للأخضر',{color:'front'}),variant('back','دور الأزرق','الدور الحالي للأزرق',{color:'back'}),variant('left','دور الذهبي','الدور الحالي للذهبي',{color:'left'}),variant('right','دور الأبيض','الدور الحالي للأبيض',{color:'right'})]},
  {id:'winner-highlight',kind:'scene',type:'state',defaultName:'تمييز الفوز',description:'إبراز حجارة الفوز دون إضعاف ألوان القطع الأخرى.',label:'حالة',mark:'★',sourceKey:'showWinHighlight',journey:'النهاية',variants:[variant('clean','نظيف','رمشة على حجارة الفوز فقط',{preset:'clean'}),variant('focus','واضح','رمشة أقوى مع هالة خفيفة',{preset:'focus'}),variant('pulse','نبضة','إحساس احتفالي ناعم',{preset:'pulse'}),variant('minimal','مختصر','تمييز بسيط دون هالة',{preset:'minimal'})]},
  {id:'round-result',kind:'scene',type:'state',defaultName:'نتيجة الجولة',description:'إعلان النتيجة والنقطة قبل بدء الجولة التالية.',label:'حالة',mark:'1',sourceKey:'handleWin',journey:'النهاية',variants:[variant('same-size','خط بحجم واحد','فوز بثلاث قطع من الحجم نفسه',{win:'same-size'}),variant('graded','خط متدرج','فوز صغير ثم متوسط ثم كبير',{win:'graded'}),variant('cell','خانة كاملة','فوز بالأحجام الثلاثة داخل خانة',{win:'cell'})]},
  {id:'online-entry',kind:'scene',type:'state',defaultName:'الدخول للأونلاين',description:'بدء غرفة أو الانضمام إليها ثم حالة الانتظار.',label:'حالة',mark:'∞',sourceKey:'yakolakOnlineEntry',journey:'أونلاين',variants:[variant('landing','بداية الأونلاين','خيارات إنشاء غرفة أو الانضمام'),variant('room-code','إدخال الرمز','إدخال رمز الغرفة والتحقق منه'),variant('waiting','غرفة الانتظار','المشاركون وحالة الاستعداد')]}
];

const colorVariants=[variant('front','أخضر','نسخة اللون الأخضر',{color:'front'}),variant('back','أزرق','نسخة اللون الأزرق',{color:'back'}),variant('left','ذهبي','نسخة اللون الذهبي',{color:'left'}),variant('right','أبيض','نسخة اللون الأبيض',{color:'right'})];
export const elementDefinitions=[
  {id:'base-large',kind:'element',type:'element',defaultName:'ميدان اللعب',description:'القطعة الرئيسية ذات التسع خانات.',label:'عنصر',mark:'9',sourceKey:'meshes["9"]',journey:'المكونات',variants:one},
  {id:'base-small',kind:'element',type:'element',defaultName:'منطقة الراحة',description:'قاعدة اللاعب المحيطة بالميدان.',label:'عنصر',mark:'3',sourceKey:'meshes["3-{color}"]',journey:'المكونات',variants:colorVariants},
  {id:'stone-large',kind:'element',type:'element',defaultName:'قطعة كبيرة',description:'قطعة اللعب بالحجم الكبير.',label:'عنصر',mark:'L',sourceKey:'pieces[type="l"]',journey:'المكونات',variants:colorVariants},
  {id:'stone-medium',kind:'element',type:'element',defaultName:'قطعة متوسطة',description:'قطعة اللعب بالحجم المتوسط.',label:'عنصر',mark:'M',sourceKey:'pieces[type="m"]',journey:'المكونات',variants:colorVariants},
  {id:'stone-small',kind:'element',type:'element',defaultName:'قطعة صغيرة',description:'قطعة اللعب بالحجم الصغير.',label:'عنصر',mark:'S',sourceKey:'pieces[type="s"]',journey:'المكونات',variants:colorVariants},
  {id:'loading-star-element',kind:'element',type:'element',defaultName:'نجمة التحميل',description:'الرمز المتحرك المعتمد في التحميل.',label:'عنصر',mark:'✦',sourceKey:'.loaderProjection',journey:'المكونات',variants:one},
  {id:'table',kind:'element',type:'element',defaultName:'الطاولة',description:'طاولة الغرفة وخامتها المحايدة.',label:'عنصر',mark:'▱',sourceKey:'scene.getObjectByName("yakolak-svg-table")',journey:'المكونات',variants:one},
  {id:'logo-yakolak',kind:'element',type:'element',defaultName:'شعار ياكلك',description:'الشعار الرسمي للعبة.',label:'عنصر',mark:'Y',sourceKey:'assets/YAKOLAK.svg',journey:'المكونات',variants:one},
  {id:'logo-mtkyf',kind:'element',type:'element',defaultName:'شعار متكيّف',description:'الشعار الرسمي للشركة.',label:'عنصر',mark:'M',sourceKey:'assets/MTKYF.svg',journey:'المكونات',variants:one},
  {id:'zone-marker',kind:'element',type:'ui',defaultName:'مؤشر الخانة القانونية',description:'حلقة الخانة المتاحة بعد اختيار القطعة.',label:'عنصر واجهة',mark:'○',sourceKey:'zoneMarkers',journey:'واجهة اللعب',variants:[variant('free','متاحة','خانة متاحة للحركة'),variant('occupied','مشغولة','خانة غير متاحة')]},
  {id:'score-marker',kind:'element',type:'ui',defaultName:'نقطة النتيجة',description:'علامة النقاط المجسمة لكل لاعب.',label:'عنصر واجهة',mark:'•',sourceKey:'scoreMarkers',journey:'واجهة اللعب',variants:[variant('one','نقطة واحدة','أول نقطة'),variant('three','ثلاث نقاط','منتصف المباراة'),variant('five','خمس نقاط','حالة متقدمة')]},
  {id:'game-hud',kind:'element',type:'ui',defaultName:'شريط اللعب والمؤقت',description:'التعليمات والنتيجة والدور الحالي.',label:'عنصر واجهة',mark:'⌁',sourceKey:'#yakolakGameHud',journey:'واجهة اللعب',variants:[variant('two-players','لاعبان','عرض مضغوط للاعبين'),variant('four-players','أربعة لاعبين','عرض جميع اللاعبين')]},
  {id:'tutorial-dialog',kind:'element',type:'ui',defaultName:'نافذة التعليم',description:'قرار بدء التعليم أو تخطيه.',label:'عنصر واجهة',mark:'?',sourceKey:'#yakolakTutorialDialog',journey:'واجهة اللعب',variants:one},
  {id:'online-panel',kind:'element',type:'ui',defaultName:'لوحة الأونلاين',description:'إنشاء الغرفة والانضمام وحالة الاتصال.',label:'عنصر واجهة',mark:'∞',sourceKey:'#yakolakOnlineEntry',journey:'واجهة اللعب',variants:[variant('landing','البداية','إنشاء أو انضمام'),variant('waiting','الانتظار','غرفة بانتظار المشاركين')]},
  {id:'winner-glow',kind:'element',type:'ui',defaultName:'وهج الفوز',description:'الوهج والرمشة المطبقان على القطع الفائزة.',label:'عنصر واجهة',mark:'★',sourceKey:'gameHighlightGroup',journey:'واجهة اللعب',variants:[variant('clean','نظيف','رمشة فقط'),variant('focus','واضح','رمشة وهالة'),variant('pulse','نبضة','وهج احتفالي'),variant('minimal','مختصر','أقل تأثير')]}
];

export const developerDefinitions=[...sceneDefinitions,...elementDefinitions];
export const definitionKey=definition=>`${definition.kind}:${definition.id}`;
export const definitionMap=new Map(developerDefinitions.map(definition=>[definitionKey(definition),definition]));
export const variantsFor=definition=>definition.variants?.length?definition.variants:one;
export const defaultVariant=definition=>variantsFor(definition)[0];
export const variantFor=(definition,id)=>variantsFor(definition).find(item=>item.id===id)||defaultVariant(definition);
export const reviewEntityId=(definition,selectedVariant)=>selectedVariant.id===defaultVariant(definition).id?definition.id:`${definition.id}-${selectedVariant.id}`;
export function resolveReviewEntity(kind,entityId){
  const definition=developerDefinitions.find(item=>item.kind===kind&&(item.id===entityId||variantsFor(item).some(v=>`${item.id}-${v.id}`===entityId)));
  if(!definition)return null;
  const selectedVariant=variantsFor(definition).find(v=>`${definition.id}-${v.id}`===entityId)||defaultVariant(definition);
  return{definition,variant:selectedVariant};
}
