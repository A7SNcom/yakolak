#!/usr/bin/env python3
"""Inject the exact loader from agent/v129-loading-star-motion into Godot Web."""
from __future__ import annotations

import re
from pathlib import Path

INDEX = Path(__file__).resolve().parents[1] / "web" / "index.html"

STYLE = r"""
<style id="yakolak-v129-loading-star-style">
#yakolakLoader{
  --loading-background:#ffffff;
  --loading-star:#3f3f3f;
  --loading-shadow:#000000;
  --cycle:820ms;
  position:fixed;
  inset:0;
  z-index:2147483647;
  overflow:hidden;
  background:var(--loading-background);
  transition:opacity .38s ease,visibility .38s ease;
}
#yakolakLoader.done{opacity:0;visibility:hidden;pointer-events:none}
#yakolakLoader .boxLoading{
  position:absolute;
  inset:0;
  width:96px;
  height:132px;
  margin:auto;
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
  opacity:.075;
  filter:blur(.6px);
  transform-origin:center;
  animation:shadow var(--cycle) infinite;
  will-change:transform,opacity;
}
#status,#status-progress,#status-notice{display:none!important}
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
    opacity:.055;
    animation-timing-function:cubic-bezier(.55,.08,.68,.19);
  }
  43%{transform:scale(1.02,.95);opacity:.105}
  50%{
    transform:scale(1.28,1);
    opacity:.14;
    animation-timing-function:cubic-bezier(.15,.75,.2,1);
  }
  58%{transform:scale(1.04,.94);opacity:.105}
  78%{transform:scale(.72,.76);opacity:.065}
}
@media (prefers-reduced-motion:reduce){#yakolakLoader{--cycle:1200ms}}
</style>
"""

MARKUP = r"""
<div id="yakolakLoader" data-loader-source="v129-loading-star-motion" aria-busy="true" aria-label="تحميل ياكلك">
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
  let released=false;
  document.body.dataset.yakolakLoader='v129-loading-star-motion';
  window.__yakolakLoading={set(){}};

  const release=()=>{
    if(released)return;
    released=true;
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      loader?.classList.add('done');
      loader?.setAttribute('aria-busy','false');
      setTimeout(()=>loader?.remove(),420);
    }));
  };

  const inspect=()=>{
    const state=document.body.dataset.yakolakIntro;
    if(state==='playing'||state==='complete')release();
    if(state==='error')loader?.setAttribute('data-error','true');
  };

  new MutationObserver(inspect).observe(document.body,{
    attributes:true,
    attributeFilter:['data-yakolak-intro']
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
    print("YAKOLAK_V129_LOADING_STAR_INJECTED")


if __name__ == "__main__":
    main()
