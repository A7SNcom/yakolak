import './developer-d1-before-after.js?v=D1-before-after';
import './developer-d1-board-v2.js?v=D1-board-v2';

export const sceneDefinitions=[
  {id:'loading-star',kind:'scene',type:'single',defaultName:'مشهد التحميل',description:'النجمة المعتمدة بحركة الارتداد والانضغاط والظل.',label:'مشهد واحد',mark:'✦',sourceKey:'scene.loading-star'},
  {id:'empty-table',kind:'scene',type:'single',defaultName:'الغرفة والطاولة',description:'الغرفة المتوازنة مع الطاولة المتوسطة وحدود موحدة على جميع الجدران.',label:'مشهد واحد',mark:'□',sourceKey:'scene.empty-table'},
  {id:'logo-wall',kind:'scene',type:'single',defaultName:'جدار الشعارات',description:'الجدار النهائي بالشعارين الأصليين وبكاميرا ثابتة عند التقريب والابتعاد.',label:'مشهد واحد',mark:'Y',sourceKey:'scene.logo-wall'},
  {id:'color-selection',kind:'scene',type:'single',defaultName:'اختيار اللون',description:'مشهد إعداد اللعبة الحقيقي لاختيار لون اللاعب.',label:'مشهد واحد',mark:'●',sourceKey:'gameState.setupStep="color"'},
  {id:'player-count-selection',kind:'scene',type:'single',defaultName:'اختيار عدد اللاعبين',description:'مشهد إعداد اللعبة الحقيقي لاختيار لاعبين أو 3 أو 4 لاعبين.',label:'مشهد واحد',mark:'4',sourceKey:'gameState.setupStep="bots"'},
  {id:'board-bases',kind:'scene',type:'single',defaultName:'القاعدة والأربع قواعد',description:'ميدان اللعب ومناطق الراحة الأربع فقط بتكوين ثابت.',label:'مشهد واحد',mark:'＋',sourceKey:'scene.board-bases'},
  {id:'clean-entry',kind:'scene',type:'sequence',defaultName:'رحلة الدخول النظيفة',description:'زوم أوت واسع يتمركز فوق الطاولة ويظهر الغرفة قبل الانتقال السلس لجدار الشعارات.',label:'مجموعة مشاهد',mark:'→',sourceKey:'scene.clean-entry'},
  {id:'unboxing-intro',kind:'scene',type:'sequence',defaultName:'إنترو فك العلبة',description:'فك العلبة وإظهار ميدان اللعب ومناطق الراحة والشوك فقط، دون بقايا تفاعل أو إعداد لاعبين.',label:'مجموعة مشاهد',mark:'↥',sourceKey:'scene.unboxing-intro'}
];

export const elementDefinitions=[
  {id:'base-large',kind:'element',type:'element',defaultName:'ميدان اللعب',description:'القطعة الرئيسية ذات التسع خانات.',label:'عنصر',mark:'9',sourceKey:'meshes["9"]'},
  {id:'base-small',kind:'element',type:'element',defaultName:'منطقة الراحة',description:'إحدى مناطق الراحة الأربع المحيطة بميدان اللعب.',label:'عنصر',mark:'3',sourceKey:'meshes["3-right"]'},
  {id:'stone-large',kind:'element',type:'element',defaultName:'شوكة كبيرة',description:'شوكة اللعب بالحجم الكبير.',label:'عنصر',mark:'L',sourceKey:'pieces[type="l"]'},
  {id:'stone-medium',kind:'element',type:'element',defaultName:'شوكة وسط',description:'شوكة اللعب بالحجم المتوسط.',label:'عنصر',mark:'M',sourceKey:'pieces[type="m"]'},
  {id:'stone-small',kind:'element',type:'element',defaultName:'شوكة صغيرة',description:'شوكة اللعب بالحجم الصغير.',label:'عنصر',mark:'S',sourceKey:'pieces[type="s"]'},
  {id:'loading-star-element',kind:'element',type:'element',defaultName:'نجمة التحميل',description:'النجمة المتحركة المعتمدة في شاشة التحميل.',label:'عنصر',mark:'✦',sourceKey:'.loaderProjection'},
  {id:'table',kind:'element',type:'element',defaultName:'الطاولة',description:'الطاولة المتوسطة المستخدمة داخل الغرفة.',label:'عنصر',mark:'▱',sourceKey:'scene.getObjectByName("yakolak-svg-table")'},
  {id:'logo-yakolak',kind:'element',type:'element',defaultName:'شعار ياكلك',description:'ملف الشعار الرسمي للعبة.',label:'عنصر',mark:'Y',sourceKey:'assets/YAKOLAK.svg'},
  {id:'logo-mtkyf',kind:'element',type:'element',defaultName:'شعار متكيّف',description:'ملف الشعار الرسمي للشركة.',label:'عنصر',mark:'M',sourceKey:'assets/MTKYF.svg'}
];

export const developerDefinitions=[...sceneDefinitions,...elementDefinitions];
export const definitionKey=definition=>`${definition.kind}:${definition.id}`;
export const definitionMap=new Map(developerDefinitions.map(definition=>[definitionKey(definition),definition]));
