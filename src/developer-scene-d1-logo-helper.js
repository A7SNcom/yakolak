import {SVGLoader} from 'three/addons/loaders/SVGLoader.js';
const load=url=>new Promise((resolve,reject)=>new SVGLoader().load(url,resolve,undefined,reject));
function officialLogo(THREE,svgData,width,name){
  const raw=new THREE.Group();
  svgData.paths.forEach((path,pathIndex)=>{
    const material=new THREE.MeshBasicMaterial({color:path.color||'#242421',transparent:false,depthTest:true,depthWrite:false,toneMapped:false,side:THREE.DoubleSide});
    SVGLoader.createShapes(path).forEach(shape=>{const geometry=new THREE.ShapeGeometry(shape,18);geometry.scale(1,-1,1);const mesh=new THREE.Mesh(geometry,material);mesh.position.z=pathIndex*.02;mesh.renderOrder=90+pathIndex;raw.add(mesh)});
  });
  if(!raw.children.length)throw new Error(`${name} has no drawable SVG shapes`);
  raw.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(raw),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());raw.position.set(-center.x,-center.y,0);const wrapper=new THREE.Group();wrapper.name=name;wrapper.scale.setScalar(width/Math.max(1,size.x));wrapper.add(raw);return wrapper;
}
export async function buildLogoWall(game){
  const scene=game.gameGroup.parent,old=scene.getObjectByName('yakolak-developer-d1-logo-wall');if(old)scene.remove(old);
  const [yakolakSvg,mtkyfSvg]=await Promise.all([load('./assets/YAKOLAK.svg?v=D1-review-center'),load('./assets/MTKYF.svg?v=D1-review-center')]);
  const portrait=innerHeight>innerWidth*1.18,group=new game.THREE.Group();group.name='yakolak-developer-d1-logo-wall';group.position.set(2372,265,0);group.rotation.y=-Math.PI/2;
  const yakolak=officialLogo(game.THREE,yakolakSvg,portrait?340:650,'d1-yakolak-logo');yakolak.position.set(0,portrait?145:220,0);
  const mtkyf=officialLogo(game.THREE,mtkyfSvg,portrait?280:520,'d1-mtkyf-logo');mtkyf.position.set(0,portrait?-145:-220,0);group.add(yakolak,mtkyf);scene.add(group);return group;
}
