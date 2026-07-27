console.info('[Yakolak] APP GAME v130 SECOND-WALL BRANDING LOADED');

const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function loadTexture(THREE,url){
  const texture=new THREE.TextureLoader().load(
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

  const group=new THREE.Group();
  group.name='yakolak-v130-brand-wall';
  group.position.set(2354,260,0);
  group.rotation.y=-Math.PI/2;

  const gameLogoMaterial=new THREE.MeshBasicMaterial({
    map:loadTexture(THREE,'./assets/YAKOLAK.svg?v=130-brand-wall'),
    transparent:true,
    depthTest:true,
    depthWrite:false,
    toneMapped:false,
    side:THREE.DoubleSide
  });
  const gameLogo=new THREE.Mesh(new THREE.PlaneGeometry(820,467),gameLogoMaterial);
  gameLogo.name='yakolak-v130-game-logo';
  gameLogo.position.set(0,105,2);
  gameLogo.renderOrder=12020;

  const companyLogoMaterial=new THREE.MeshBasicMaterial({
    map:loadTexture(THREE,'./assets/MTKYF.svg?v=130-brand-wall'),
    transparent:true,
    depthTest:true,
    depthWrite:false,
    toneMapped:false,
    side:THREE.DoubleSide
  });
  const companyLogo=new THREE.Mesh(new THREE.PlaneGeometry(430,204),companyLogoMaterial);
  companyLogo.name='yakolak-v130-company-logo';
  companyLogo.position.set(0,-245,2);
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
    gameLogoAsset:'assets/YAKOLAK.svg',
    companyLogoAsset:'assets/MTKYF.svg',
    presentBeforeSecondWall:true
  };
}

void installSecondWallBranding().catch(error=>console.error('[Yakolak] v130 branding failed',error));
