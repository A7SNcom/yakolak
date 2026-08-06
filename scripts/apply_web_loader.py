#!/usr/bin/env python3
"""Inject the balanced YAKOLAK loader and exact SVG-to-Godot handoff."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "web" / "index.html"
MTKYF = ROOT / "YAKOLAK_PORTABLE_KIT" / "assets" / "logos" / "MTKYF.svg"

STYLE = r'''
<style id="yakolak-v130-loading-star-style">
#yakolakLoader{
  --loading-background:#000000;
  --loading-star:#ffffff;
  --loading-shadow:#d7d9de;
  --cycle:820ms;
  position:fixed;inset:0;z-index:2147483647;overflow:hidden;
  opacity:1;visibility:visible;pointer-events:auto;color:#fff
}
#yakolakLoader .loaderBackdrop{
  position:absolute;inset:0;background:var(--loading-background);opacity:1;
  transition:opacity 760ms cubic-bezier(.4,0,.2,1)
}
#yakolakLoader.matched .loaderBackdrop{opacity:0}
#yakolakLoader .loaderBrand{
  position:fixed;left:50%;z-index:5;opacity:0;pointer-events:none;
  transform:translate(-50%,-50%) translateY(7px) scale(.99);
  transform-origin:center;will-change:transform,opacity
}
#yakolakLoader .loaderLogoYakolak{
  top:18.5%;width:clamp(126px,31vw,190px);height:auto;
  filter:drop-shadow(0 8px 24px rgba(255,255,255,.06))
}
#yakolakLoader .loaderLogoMtkyf{
  top:81.5%;width:clamp(98px,24vw,150px);aspect-ratio:134.76/63.85;
  filter:drop-shadow(0 8px 20px rgba(255,255,255,.05))
}
#yakolakLoader .loaderLogoMtkyf svg{display:block;width:100%;height:100%}
#yakolakLoader .loaderLogoMtkyf path:not(.cls-1){fill:#000!important}
#yakolakLoader .loaderLogoMtkyf .cls-1{fill:#fff!important}
#yakolakLoader .boxLoading{
  position:fixed;left:50%;top:50%;width:96px;height:132px;
  transform:translate(-50%,-50%);z-index:4
}
#yakolakLoader .starBounce{
  position:absolute;top:0;left:4px;width:88px;height:88px;
  transform-origin:50% 100%;animation:bounce var(--cycle) infinite;
  animation-play-state:paused;will-change:transform
}
#yakolakLoader .loadingStar{
  display:block;width:100%;height:100%;overflow:visible;
  transform-box:fill-box;transform-origin:center;
  animation:turn var(--cycle) linear infinite;animation-play-state:paused;will-change:transform
}
#yakolakLoader .loadingStar path{fill:var(--loading-star)}
#yakolakLoader .loadingShadow{
  position:absolute;top:123px;left:12px;width:72px;height:9px;border-radius:50%;
  background:var(--loading-shadow);opacity:.28;filter:blur(6px);
  transform-origin:center;animation:shadow var(--cycle) infinite;
  animation-play-state:paused;will-change:transform,opacity
}
#yakolakLoader .handoffStar{
  position:fixed;z-index:6;margin:0;padding:0;pointer-events:none;
  transform-origin:center;will-change:left,top,width,height,opacity
}
#yakolakLoader .handoffStar svg{display:block;width:100%;height:100%;overflow:visible;transform:none!important}
#yakolakLoader .handoffStar path{fill:var(--loading-star)}
#yakolakLoader .handoffShadow{
  position:fixed;z-index:5;border-radius:50%;pointer-events:none;
  background:var(--loading-shadow);filter:blur(10px);opacity:.40;
  will-change:left,top,width,height,opacity
}
#status,#status-progress,#status-notice{display:none!important}
@keyframes bounce{
  0%{transform:translateY(0) scale(1,1);animation-timing-function:cubic-bezier(.55,.08,.68,.19)}
  43%{transform:translateY(33px) scale(1.01,.99);animation-timing-function:cubic-bezier(.2,.8,.3,1)}
  50%{transform:translateY(36px) scale(1.17,.72);animation-timing-function:cubic-bezier(.15,.75,.2,1)}
  58%{transform:translateY(30px) scale(.94,1.09);animation-timing-function:cubic-bezier(.22,.61,.36,1)}
  78%{transform:translateY(5px) scale(1.01,.99);animation-timing-function:cubic-bezier(.25,.1,.25,1)}
  100%{transform:translateY(0) scale(1,1)}
}
@keyframes turn{
  0%{transform:rotate(0deg)}43%{transform:rotate(10deg)}
  50%{transform:rotate(12deg)}58%{transform:rotate(14deg)}
  78%{transform:rotate(20deg)}100%{transform:rotate(24deg)}
}
@keyframes shadow{
  0%,100%{transform:scale(.66,.72);opacity:.26;animation-timing-function:cubic-bezier(.55,.08,.68,.19)}
  43%{transform:scale(1.02,.95);opacity:.38}
  50%{transform:scale(1.30,1);opacity:.54;animation-timing-function:cubic-bezier(.15,.75,.2,1)}
  58%{transform:scale(1.04,.94);opacity:.40}
  78%{transform:scale(.72,.76);opacity:.30}
}
@media (prefers-reduced-motion:reduce){#yakolakLoader{--cycle:1200ms}}
</style>
'''

MARKUP = r'''
<div id="yakolakLoader" data-loader-source="v130-loading-star-motion" aria-busy="true">
  <div class="loaderBackdrop"></div>
  <img class="loaderBrand loaderLogoYakolak" src="yakolak-logo.svg" alt="">
  <div class="loaderBrand loaderLogoMtkyf">__MTKYF__</div>
  <div class="boxLoading">
    <div class="starBounce">
      <svg class="loadingStar" viewBox="0 0 802 798" xmlns="http://www.w3.org/2000/svg">
        <g transform="matrix(4.166667,0,0,4.166667,484.7475,797.470417)">
          <path d="M0,-191.393L-20.116,-183.832L-40.232,-191.393L-55.534,-176.304L-76.986,-175.028L-84.828,-155.02L-103.907,-145.13L-102.932,-123.662L-116.339,-106.867L-106.717,-87.651L-112.134,-66.855L-95.528,-53.214L-92.018,-32.013L-71.299,-26.306L-59.469,-8.364L-38.22,-11.578L-20.116,0L-2.012,-11.578L19.237,-8.364L31.067,-26.306L51.786,-32.013L55.296,-53.214L71.902,-66.855L66.486,-87.651L76.108,-106.867L62.7,-123.662L63.675,-145.13L44.596,-155.02L36.754,-175.028L15.302,-176.304L0,-191.393Z"/>
        </g>
      </svg>
    </div>
    <div class="loadingShadow"></div>
  </div>
</div>
'''

SCRIPT = r'''
<script id="yakolak-v130-loading-star-script">
(()=>{
  const L=document.getElementById('yakolakLoader');
  const B=L?.querySelector('.boxLoading');
  const bounce=L?.querySelector('.starBounce');
  const S=L?.querySelector('.loadingStar');
  const brands=[...(L?.querySelectorAll('.loaderBrand')||[])];
  const shadow=L?.querySelector('.loadingShadow');
  const cycle=820;
  const epoch=performance.now();
  const initialRestMs=220;
  const motionWarmupMs=260;
  const motionSettleMs=220;
  const minimumLoaderMs=2600;
  const minimumVisibleHold=900;
  const materialBridgeDuration=1200;
  const materialBridgeHoldRatio=260/materialBridgeDuration;
  let scheduled=false;
  let released=false;
  let matchReady=false;
  let brandReady=false;
  let motionReady=false;
  let motionStartedAt=0;
  let brandVisibleAt=0;

  document.body.dataset.yakolakLoader='v130-loading-star-motion';
  document.body.dataset.yakolakLoaderHandoff='waiting';
  document.body.dataset.yakolakLoaderPalette='black-white-lighter-gray-shadow';
  document.body.dataset.yakolakHandoffSequencing='logos-fade-then-canonical-star';
  document.body.dataset.yakolakBrandLayout='yakolak-upper-center-star-center-mtkyf-lower-center';
  document.body.dataset.yakolakBrandPhase='hidden';
  document.body.dataset.yakolakContourSource='table-svg-exact-path';
  document.body.dataset.yakolakMtkyfPalette='original-black-white';
  document.body.dataset.yakolakVisualBridge='white-to-material-crossfade';
  document.body.dataset.yakolakTimingPolicy='minimum-gated-v1';
  document.body.dataset.yakolakLoaderMinimumMs=String(minimumLoaderMs);
  document.body.dataset.yakolakBounceWarmupMs=String(motionWarmupMs);
  document.body.dataset.yakolakBounceSettleMs=String(motionSettleMs);
  document.body.dataset.yakolakStarMotion='resting';
  window.__yakolakHandoffHistory=['waiting'];
  window.__yakolakBrandHistory=['hidden'];
  window.__yakolakStarMotionHistory=['resting'];
  window.__yakolakLoading={set(){}};

  const H=state=>{
    document.body.dataset.yakolakLoaderHandoff=state;
    window.__yakolakHandoffHistory.push(state);
  };
  const P=state=>{
    document.body.dataset.yakolakBrandPhase=state;
    window.__yakolakBrandHistory.push(state);
  };
  const px=value=>`${Math.max(0,Number(value)||0)}px`;
  const err=(actual,target)=>Math.max(
    Math.abs(actual.left-target.x),Math.abs(actual.top-target.y),
    Math.abs(actual.width-target.w),Math.abs(actual.height-target.h)
  );

  const M=state=>{
    document.body.dataset.yakolakStarMotion=state;
    window.__yakolakStarMotionHistory.push(state);
  };

  const startMotion=()=>{
    if(released||motionReady||!bounce||!S||!shadow)return;
    M('warming');
    const warmups=[
      bounce.animate([
        {transform:'translateY(0) scale(1,1)',offset:0},
        {transform:'translateY(1.6px) scale(1.014,.986)',offset:.58},
        {transform:'translateY(0) scale(1,1)',offset:1}
      ],{duration:motionWarmupMs,easing:'cubic-bezier(.4,0,.2,1)',fill:'forwards'}),
      S.animate([
        {transform:'rotate(0deg)',offset:0},
        {transform:'rotate(1.2deg)',offset:.58},
        {transform:'rotate(0deg)',offset:1}
      ],{duration:motionWarmupMs,easing:'cubic-bezier(.4,0,.2,1)',fill:'forwards'}),
      shadow.animate([
        {transform:'scale(.66,.72)',opacity:.26,offset:0},
        {transform:'scale(.72,.74)',opacity:.30,offset:.58},
        {transform:'scale(.66,.72)',opacity:.26,offset:1}
      ],{duration:motionWarmupMs,easing:'cubic-bezier(.4,0,.2,1)',fill:'forwards'})
    ];
    Promise.all(warmups.map(animation=>animation.finished)).then(()=>{
      if(released)return;
      warmups.forEach(animation=>animation.cancel());
      bounce.style.animationPlayState='running';
      S.style.animationPlayState='running';
      shadow.style.animationPlayState='running';
      motionReady=true;
      motionStartedAt=performance.now();
      M('running');
      schedule();
    });
  };

  const settleMotion=()=>{
    if(!bounce||!S||!shadow)return Promise.resolve();
    M('settling');
    const bounceFrom=getComputedStyle(bounce).transform;
    const starFrom=getComputedStyle(S).transform;
    const shadowFrom=getComputedStyle(shadow).transform;
    const shadowOpacity=Number(getComputedStyle(shadow).opacity)||.26;
    bounce.style.animationPlayState='paused';
    S.style.animationPlayState='paused';
    shadow.style.animationPlayState='paused';
    const settles=[
      bounce.animate([
        {transform:bounceFrom},
        {transform:'translateY(0) scale(1,1)'}
      ],{duration:motionSettleMs,easing:'cubic-bezier(.22,.61,.36,1)',fill:'forwards'}),
      S.animate([
        {transform:starFrom},
        {transform:'rotate(0deg)'}
      ],{duration:motionSettleMs,easing:'cubic-bezier(.22,.61,.36,1)',fill:'forwards'}),
      shadow.animate([
        {transform:shadowFrom,opacity:shadowOpacity},
        {transform:'scale(.66,.72)',opacity:.26}
      ],{duration:motionSettleMs,easing:'cubic-bezier(.22,.61,.36,1)',fill:'forwards'})
    ];
    return Promise.all(settles.map(animation=>animation.finished)).then(()=>{
      bounce.style.transform='translateY(0) scale(1,1)';
      S.style.transform='rotate(0deg)';
      shadow.style.transform='scale(.66,.72)';
      shadow.style.opacity='.26';
      M('rested');
    });
  };

  const match=(clone,handoffShadow,first,shadowFirst)=>{
    const target=window.__yakolakMatch;
    if(!target?.star)return;
    H('matching');
    const easing='cubic-bezier(.65,0,.35,1)';
    const starMotion=clone.animate([
      {left:px(first.left),top:px(first.top),width:px(first.width),height:px(first.height),transform:'rotate(0deg)'},
      {left:px(target.star.x),top:px(target.star.y),width:px(target.star.w),height:px(target.star.h),transform:'rotate(0deg)'}
    ],{duration:1040,easing,fill:'forwards'});
    const shadowMotion=handoffShadow.animate([
      {left:px(shadowFirst.left),top:px(shadowFirst.top),width:px(shadowFirst.width),height:px(shadowFirst.height),opacity:.40},
      {
        left:px(target.star.x+target.star.w*.22),
        top:px(target.star.y+target.star.h*.91),
        width:px(target.star.w*.56),height:px(Math.max(10,target.star.h*.055)),opacity:.22
      }
    ],{duration:1040,easing,fill:'forwards'});

    Promise.all([starMotion.finished,shadowMotion.finished]).then(()=>{
      Object.assign(clone.style,{
        left:px(target.star.x),top:px(target.star.y),
        width:px(target.star.w),height:px(target.star.h),transform:'rotate(0deg)'
      });
      document.body.dataset.yakolakMatchErrorPx=err(clone.getBoundingClientRect(),target.star).toFixed(2);
      document.body.dataset.yakolakTeethAlignment='canonical-zero-degree-shared-contour';
      H('matched');
      L.classList.add('matched');

      const targetColor=target.starColor||'#8391aa';
      const clonePath=clone.querySelector('.loadingStar path');
      clonePath?.animate([
        {fill:'#ffffff',offset:0},
        {fill:'#ffffff',offset:materialBridgeHoldRatio},
        {fill:targetColor,offset:1}
      ],{duration:materialBridgeDuration,easing:'linear',fill:'forwards'});
      clone.animate([
        {opacity:1,offset:0},
        {opacity:1,offset:materialBridgeHoldRatio},
        {opacity:.70,offset:.56},
        {opacity:0,offset:1}
      ],{
        duration:materialBridgeDuration,easing:'cubic-bezier(.4,0,.2,1)',fill:'forwards'
      });
      handoffShadow.animate([
        {opacity:.22,offset:0},
        {opacity:.15,offset:.44},
        {opacity:0,offset:1}
      ],{
        duration:760,easing:'cubic-bezier(.4,0,.2,1)',fill:'forwards'
      });
      L.setAttribute('aria-busy','false');
      setTimeout(()=>L.remove(),materialBridgeDuration+140);
    });
  };

  const createCanonicalHandoff=()=>{
    const target=window.__yakolakMatch;
    if(!target?.star||!S||!L)return;
    if(bounce){
      bounce.style.animation='none';
      bounce.style.transform='translateY(0) scale(1,1)';
    }
    S.style.animation='none';
    S.style.transform='rotate(0deg)';

    requestAnimationFrame(()=>{
      const first=S.getBoundingClientRect();
      const clone=document.createElement('div');
      clone.className='handoffStar';
      clone.innerHTML=S.outerHTML;
      Object.assign(clone.style,{
        left:px(first.left),top:px(first.top),width:px(first.width),height:px(first.height),transform:'rotate(0deg)'
      });
      const svg=clone.querySelector('.loadingStar');
      svg?.style.setProperty('animation','none');
      svg?.style.setProperty('transform','none','important');

      const handoffShadow=document.createElement('div');
      handoffShadow.className='handoffShadow';
      const shadowFirst=shadow?.getBoundingClientRect()||{
        left:first.left+first.width*.15,top:first.bottom+8,width:first.width*.7,height:9
      };
      Object.assign(handoffShadow.style,{
        left:px(shadowFirst.left),top:px(shadowFirst.top),
        width:px(shadowFirst.width),height:px(shadowFirst.height)
      });
      L.append(handoffShadow,clone);
      if(B)B.style.visibility='hidden';

      P('leaving');
      const exits=brands.map((element,index)=>element.animate([
        {opacity:Number(getComputedStyle(element).opacity)||1,transform:'translate(-50%,-50%) translateY(0) scale(1)'},
        {opacity:0,transform:'translate(-50%,-50%) translateY(-5px) scale(.992)'}
      ],{
        duration:520,delay:index*35,easing:'cubic-bezier(.4,0,.2,1)',fill:'forwards'
      }));
      Promise.all(exits.map(animation=>animation.finished)).then(()=>{
        P('hidden-after-fade');
        match(clone,handoffShadow,first,shadowFirst);
      });
    });
  };

  const lock=()=>{
    if(released||!window.__yakolakMatch?.star||!S||!L)return;
    released=true;
    H('locking');
    settleMotion().then(createCanonicalHandoff);
  };

  const schedule=()=>{
    if(scheduled||released||!matchReady||!brandReady||!motionReady)return;
    scheduled=true;
    const now=performance.now();
    const loopElapsed=Math.max(0,now-motionStartedAt);
    const brandHoldLeft=Math.max(0,minimumVisibleHold-(now-brandVisibleAt));
    const sceneHoldLeft=Math.max(0,minimumLoaderMs-(now-epoch));
    const holdLeft=Math.max(brandHoldLeft,sceneHoldLeft);
    const futureLoopElapsed=loopElapsed+holdLeft;
    const nextCanonicalRest=Math.max(90,cycle-(futureLoopElapsed%cycle)+18);
    setTimeout(lock,holdLeft+nextCanonicalRest);
  };

  setTimeout(startMotion,initialRestMs);

  setTimeout(()=>{
    if(released)return;
    P('entering');
    const entries=brands.map((element,index)=>element.animate([
      {opacity:0,transform:'translate(-50%,-50%) translateY(7px) scale(.99)'},
      {opacity:1,transform:'translate(-50%,-50%) translateY(0) scale(1)'}
    ],{
      duration:640,delay:index*90,easing:'cubic-bezier(.22,.61,.36,1)',fill:'forwards'
    }));
    Promise.all(entries.map(animation=>animation.finished)).then(()=>{
      if(released)return;
      P('visible');
      brandReady=true;
      brandVisibleAt=performance.now();
      schedule();
    });
  },900);

  const inspect=()=>{
    const phase=document.body.dataset.yakolakPreIntro;
    if(phase==='match-ready'){
      matchReady=true;
      schedule();
    }
    if(phase==='error'||document.body.dataset.yakolakIntro==='error'){
      L?.setAttribute('data-error','true');
    }
  };
  new MutationObserver(inspect).observe(document.body,{
    attributes:true,
    attributeFilter:['data-yakolak-pre-intro','data-yakolak-intro']
  });
  inspect();
})();
</script>
'''


def main() -> None:
    html = INDEX.read_text(encoding="utf-8")
    if "yakolak-v130-loading-star-style" in html:
        raise RuntimeError("loader already injected")
    mtkyf_svg = MTKYF.read_text(encoding="utf-8").strip()
    mtkyf_svg = re.sub(r"<\?xml[^>]*>\s*|<!DOCTYPE[^>]*>\s*", "", mtkyf_svg)
    markup = MARKUP.replace("__MTKYF__", mtkyf_svg)
    html = html.replace("</head>", STYLE + "\n</head>", 1)
    html, count = re.subn(r"(<body[^>]*>)", r"\1\n" + markup, html, count=1, flags=re.I)
    if count != 1:
        raise RuntimeError("body missing")
    html = html.replace("</body>", SCRIPT + "\n</body>", 1)
    INDEX.write_text(html, encoding="utf-8", newline="\n")
    print("YAKOLAK_BALANCED_BRAND_LOADER_WITH_CANONICAL_SVG_HANDOFF_INJECTED")


if __name__ == "__main__":
    main()
