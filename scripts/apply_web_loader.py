#!/usr/bin/env python3
"""Inject the approved bounce loader and a pixel-matched DOM-to-Godot handoff."""
from __future__ import annotations

import re
from pathlib import Path

INDEX = Path(__file__).resolve().parents[1] / "web" / "index.html"

STYLE = r"""
<style id="yakolak-v129-loading-star-style">
#yakolakLoader{
  --loading-background:#000000;
  --loading-star:#ffffff;
  --loading-shadow:#7182ff;
  --cycle:820ms;
  position:fixed;
  inset:0;
  z-index:2147483647;
  overflow:hidden;
  opacity:1;
  visibility:visible;
  pointer-events:auto;
  color:#fff;
}
#yakolakLoader .loaderBackdrop{
  position:absolute;
  inset:0;
  background:var(--loading-background);
  opacity:1;
  transition:opacity 420ms cubic-bezier(.65,0,.35,1);
}
#yakolakLoader.matched .loaderBackdrop{opacity:0}
#yakolakLoader .loaderLogo{
  position:fixed;
  left:50%;
  top:39%;
  width:clamp(166px,44vw,258px);
  height:auto;
  z-index:5;
  opacity:0;
  transform:translate(-50%,-50%) translateY(10px) scale(.985);
  transform-origin:center;
  filter:drop-shadow(0 10px 24px rgba(113,130,255,.14));
  animation:logoEnter 920ms cubic-bezier(.22,.61,.36,1) 160ms forwards;
  will-change:left,top,width,height,transform,opacity;
}
#yakolakLoader .boxLoading{
  position:fixed;
  left:50%;
  top:58%;
  width:96px;
  height:132px;
  transform:translate(-50%,-50%);
  z-index:4;
}
#yakolakLoader .starBounce{
  position:absolute;
  top:0;
  left:4px;
  width:88px;
  height:88px;
  transform-origin:50% 100%;
  animation:bounce var(--cycle) infinite;
  will-change:transform;
}
#yakolakLoader .loadingStar{
  display:block;
  width:100%;
  height:100%;
  overflow:visible;
  transform-box:fill-box;
  transform-origin:center;
  animation:turn var(--cycle) linear infinite;
  will-change:transform;
}
#yakolakLoader .loadingStar path{fill:var(--loading-star)}
#yakolakLoader .loadingShadow{
  position:absolute;
  top:123px;
  left:13px;
  width:70px;
  height:8px;
  border-radius:50%;
  background:var(--loading-shadow);
  opacity:.12;
  filter:blur(8px);
  transform-origin:center;
  animation:shadow var(--cycle) infinite;
  will-change:transform,opacity;
}
#yakolakLoader .handoffStar{
  position:fixed;
  z-index:6;
  margin:0;
  padding:0;
  pointer-events:none;
  transform-origin:center;
  will-change:left,top,width,height,opacity;
}
#yakolakLoader .handoffStar svg{display:block;width:100%;height:100%;overflow:visible}
#yakolakLoader .handoffStar path{fill:var(--loading-star)}
#yakolakLoader .handoffShadow{
  position:fixed;
  z-index:5;
  border-radius:50%;
  pointer-events:none;
  background:var(--loading-shadow);
  filter:blur(12px);
  opacity:.22;
  will-change:left,top,width,height,opacity;
}
#status,#status-progress,#status-notice{display:none!important}
@keyframes logoEnter{
  from{opacity:0;transform:translate(-50%,-50%) translateY(10px) scale(.985)}
  to{opacity:1;transform:translate(-50%,-50%) translateY(0) scale(1)}
}
@keyframes bounce{
  0%{
    transform:translateY(0) scale(1,1);
    animation-timing-function:cubic-bezier(.55,.08,.68,.19);
  }
  43%{
    transform:translateY(33px) scale(1.01,.99);
    animation-timing-function:cubic-bezier(.2,.8,.3,1);
  }
  50%{
    transform:translateY(36px) scale(1.17,.72);
    animation-timing-function:cubic-bezier(.15,.75,.2,1);
  }
  58%{
    transform:translateY(30px) scale(.94,1.09);
    animation-timing-function:cubic-bezier(.22,.61,.36,1);
  }
  78%{
    transform:translateY(5px) scale(1.01,.99);
    animation-timing-function:cubic-bezier(.25,.1,.25,1);
  }
  100%{transform:translateY(0) scale(1,1)}
}
@keyframes turn{
  0%{transform:rotate(0deg)}
  43%{transform:rotate(10deg)}
  50%{transform:rotate(12deg)}
  58%{transform:rotate(14deg)}
  78%{transform:rotate(20deg)}
  100%{transform:rotate(24deg)}
}
@keyframes shadow{
  0%,100%{
    transform:scale(.66,.72);
    opacity:.08;
    animation-timing-function:cubic-bezier(.55,.08,.68,.19);
  }
  43%{transform:scale(1.02,.95);opacity:.16}
  50%{
    transform:scale(1.28,1);
    opacity:.24;
    animation-timing-function:cubic-bezier(.15,.75,.2,1);
  }
  58%{transform:scale(1.04,.94);opacity:.16}
  78%{transform:scale(.72,.76);opacity:.10}
}
@media (prefers-reduced-motion:reduce){#yakolakLoader{--cycle:1200ms}}
</style>
"""

MARKUP = r"""
<div id="yakolakLoader" data-loader-source="v129-loading-star-motion" aria-busy="true" aria-label="تحميل ياكلك">
  <div class="loaderBackdrop" aria-hidden="true"></div>
  <img class="loaderLogo" src="yakolak-logo.svg" alt="" aria-hidden="true">
  <div class="boxLoading" aria-hidden="true">
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
"""

SCRIPT = r"""
<script id="yakolak-v129-loading-star-script">
(()=>{
  const loader=document.getElementById('yakolakLoader');
  const box=loader?.querySelector('.boxLoading');
  const star=loader?.querySelector('.loadingStar');
  const logo=loader?.querySelector('.loaderLogo');
  const originalShadow=loader?.querySelector('.loadingShadow');
  const cycle=820;
  const animationEpoch=performance.now();
  let scheduled=false;
  let released=false;

  document.body.dataset.yakolakLoader='v129-loading-star-motion';
  document.body.dataset.yakolakLoaderHandoff='waiting';
  document.body.dataset.yakolakLoaderPalette='black-white-indigo-shadow';
  document.body.dataset.yakolakHandoffSequencing='logo-first-star-second';
  window.__yakolakLoading={set(){}};

  const px=value=>`${Math.max(0,Number(value)||0)}px`;
  const rectError=(actual,target)=>Math.max(
    Math.abs(actual.left-target.x),
    Math.abs(actual.top-target.y),
    Math.abs(actual.width-target.w),
    Math.abs(actual.height-target.h)
  );

  const lockToScene=()=>{
    const match=window.__yakolakMatch;
    if(released||!match?.star||!match?.logo||!star||!logo||!loader)return;
    released=true;
    document.body.dataset.yakolakLoaderHandoff='locking';

    const first=star.getBoundingClientRect();
    const logoFirst=logo.getBoundingClientRect();
    const starClone=document.createElement('div');
    starClone.className='handoffStar';
    starClone.innerHTML=star.outerHTML;
    Object.assign(starClone.style,{
      left:px(first.left),top:px(first.top),width:px(first.width),height:px(first.height)
    });
    starClone.querySelector('.loadingStar')?.style.setProperty('animation','none');
    starClone.querySelector('.loadingStar')?.style.setProperty('transform','none');

    const handoffShadow=document.createElement('div');
    handoffShadow.className='handoffShadow';
    const shadowFirst=originalShadow?.getBoundingClientRect()||{
      left:first.left+first.width*.15,top:first.bottom+8,width:first.width*.7,height:8
    };
    Object.assign(handoffShadow.style,{
      left:px(shadowFirst.left),top:px(shadowFirst.top),
      width:px(shadowFirst.width),height:px(shadowFirst.height)
    });

    loader.append(handoffShadow,starClone);
    if(box)box.style.visibility='hidden';
    logo.style.animation='none';
    Object.assign(logo.style,{
      left:px(logoFirst.left),top:px(logoFirst.top),
      width:px(logoFirst.width),height:px(logoFirst.height),
      transform:'none',opacity:'1'
    });

    const easing='cubic-bezier(.65,0,.35,1)';
    const logoAnimation=logo.animate([
      {left:px(logoFirst.left),top:px(logoFirst.top),width:px(logoFirst.width),height:px(logoFirst.height),opacity:1},
      {left:px(match.logo.x),top:px(match.logo.y),width:px(match.logo.w),height:px(match.logo.h),opacity:1}
    ],{duration:900,easing,fill:'forwards'});

    const starAnimation=starClone.animate([
      {left:px(first.left),top:px(first.top),width:px(first.width),height:px(first.height)},
      {left:px(match.star.x),top:px(match.star.y),width:px(match.star.w),height:px(match.star.h)}
    ],{duration:1040,delay:220,easing,fill:'forwards'});

    handoffShadow.animate([
      {left:px(shadowFirst.left),top:px(shadowFirst.top),width:px(shadowFirst.width),height:px(shadowFirst.height),opacity:.22},
      {
        left:px(match.star.x+match.star.w*.22),
        top:px(match.star.y+match.star.h*.91),
        width:px(match.star.w*.56),height:px(Math.max(10,match.star.h*.055)),opacity:.12
      }
    ],{duration:1040,delay:220,easing,fill:'forwards'});

    Promise.all([logoAnimation.finished,starAnimation.finished]).then(()=>{
      Object.assign(starClone.style,{
        left:px(match.star.x),top:px(match.star.y),width:px(match.star.w),height:px(match.star.h)
      });
      const actual=starClone.getBoundingClientRect();
      const error=rectError(actual,match.star);
      document.body.dataset.yakolakMatchErrorPx=error.toFixed(2);
      document.body.dataset.yakolakLoaderHandoff='matched';
      loader.classList.add('matched');
      starClone.animate([{opacity:1},{opacity:1},{opacity:0}],{
        duration:560,delay:120,easing:'cubic-bezier(.22,.61,.36,1)',fill:'forwards'
      });
      handoffShadow.animate([{opacity:.12},{opacity:0}],{
        duration:440,delay:120,easing:'ease-out',fill:'forwards'
      });
      logo.animate([{opacity:1},{opacity:1},{opacity:0}],{
        duration:460,delay:120,easing:'ease-out',fill:'forwards'
      });
      loader.setAttribute('aria-busy','false');
      setTimeout(()=>loader.remove(),840);
    });
  };

  const scheduleNaturalStop=()=>{
    if(scheduled||released)return;
    scheduled=true;
    const phase=(performance.now()-animationEpoch)%cycle;
    const wait=Math.max(90,cycle-phase);
    setTimeout(lockToScene,wait);
  };

  const inspect=()=>{
    const preIntro=document.body.dataset.yakolakPreIntro;
    if(preIntro==='match-ready')scheduleNaturalStop();
    if(preIntro==='error'||document.body.dataset.yakolakIntro==='error'){
      loader?.setAttribute('data-error','true');
    }
  };

  new MutationObserver(inspect).observe(document.body,{
    attributes:true,
    attributeFilter:['data-yakolak-pre-intro','data-yakolak-intro']
  });
  inspect();
})();
</script>
"""


def main() -> None:
    html = INDEX.read_text(encoding="utf-8")
    if "yakolak-v129-loading-star-style" in html:
        raise RuntimeError("The v129 loading star was already injected")
    html = html.replace("</head>", STYLE + "\n</head>", 1)
    html, count = re.subn(
        r"(<body[^>]*>)",
        r"\1\n" + MARKUP,
        html,
        count=1,
        flags=re.IGNORECASE,
    )
    if count != 1:
        raise RuntimeError("Could not locate the exported body element")
    html = html.replace("</body>", SCRIPT + "\n</body>", 1)
    INDEX.write_text(html, encoding="utf-8", newline="\n")
    print("YAKOLAK_BLACK_WHITE_LOADER_WITH_PIXEL_MATCHED_HANDOFF_INJECTED")


if __name__ == "__main__":
    main()
