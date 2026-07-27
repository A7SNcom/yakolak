console.info('[Yakolak] APP GAME v130 SECOND-WALL BRANDING LOADED');

const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const GAME_LOGO_URL='https://raw.githubusercontent.com/A7SNcom/yakolak/main/assets/YAKOLAK.svg';
const COMPANY_LOGO_URL='https://raw.githubusercontent.com/A7SNcom/yakolak/main/assets/MTKYF.svg';

function loadTexture(THREE,url){
  const loader=new THREE.TextureLoader();
  loader.setCrossOrigin('anonymous');
  const texture=loader.load(
    url,
    loaded=>{
      loaded.colorSpace=THREE.SRGBColorSpace;
      loaded.minFilter=THREE.LinearFilter;
      loaded.magFilter=THREE.LinearFilter;
      loaded.needsUpdate=true;
      globalThis.__yakolakGame?.render?.();
    },
    undefined,
    error=>console.error('[Yakolak] brand texture failed',url,error)
  );
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.minFilter=THREE.LinearFilter;
  texture.magFilter=THREE.LinearFilter;
  return texture;
}

async function installSecondWallBranding(){
  let game;
  for(let i=0;i<520;i++){
    game=globalThis.__yakolakGame;
    if(game?.THREE&&game?.gameGroup?.parent&&game?.render)break;
    await wait(25);
  }
  if(!game?.THREE)throw new Error('v130 branding could not find the approved room');

  const {THREE}=game;
  const scene=game.gameGroup.parent;
  if(scene.getObjectByName('yakolak-v130-brand-wall'))return;
  const portrait=innerHeight>innerWidth*1.18;
  const gameLogoSize=portrait?[600,342]:[820,467];
  const companyLogoSize=portrait?[340,161]:[430,204];

  const group=new THREE.Group();
  group.name='yakolak-v130-brand-wall';
  group.position.set(2354,portrait?275:260,0);
  group.rotation.y=-Math.PI/2;

  const gameLogoMaterial=new THREE.MeshBasicMaterial({
    map:loadTexture(THREE,GAME_LOGO_URL),
    transparent:true,
    depthTest:true,
    depthWrite:false,
    toneMapped:false,
    side:THREE.DoubleSide
  });
  const gameLogo=new THREE.Mesh(new THREE.PlaneGeometry(...gameLogoSize),gameLogoMaterial);
  gameLogo.name='yakolak-v130-game-logo';
  gameLogo.position.set(0,portrait?105:105,2);
  gameLogo.renderOrder=12020;

  const companyLogoMaterial=new THREE.MeshBasicMaterial({
    map:loadTexture(THREE,COMPANY_LOGO_URL),
    transparent:true,
    depthTest:true,
    depthWrite:false,
    toneMapped:false,
    side:THREE.DoubleSide
  });
  const companyLogo=new THREE.Mesh(new THREE.PlaneGeometry(...companyLogoSize),companyLogoMaterial);
  companyLogo.name='yakolak-v130-company-logo';
  companyLogo.position.set(0,portrait?-190:-245,2);
  companyLogo.renderOrder=12021;

  group.add(gameLogo,companyLogo);
  scene.add(group);

  for(let i=0;i<520;i++){
    const sample=scene.getObjectByName('yakolak-v130-sample-text-existing-on-second-wall');
    if(sample){sample.visible=false;break}
    await wait(25);
  }

  game.render();
  globalThis.__yakolakV130Branding={
    group,
    gameLogo,
    companyLogo,
    gameLogoAsset:GAME_LOGO_URL,
    companyLogoAsset:COMPANY_LOGO_URL,
    responsiveLayout:portrait?'portrait':'landscape',
    presentBeforeSecondWall:true
  };
}

void installSecondWallBranding().catch(error=>console.error('[Yakolak] v130 branding failed',error));
