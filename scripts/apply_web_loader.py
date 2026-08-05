#!/usr/bin/env python3
"""Inject the established rolling-star loading experience into Godot Web."""
from __future__ import annotations

import re
from pathlib import Path

INDEX = Path(__file__).resolve().parents[1] / "web" / "index.html"

STYLE = r"""
<style id="yakolak-rolling-star-loader-style">
:root{--yakolak-wall:#f7f7f4;--yakolak-ink:#3f3f3f}
#yakolakLoader{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;background:var(--yakolak-wall);color:var(--yakolak-ink);transition:opacity .38s ease,visibility .38s ease}
#yakolakLoader.done{opacity:0;visibility:hidden;pointer-events:none}
#yakolakLoader .rollingStage{position:relative;width:min(300px,72vw);height:112px;overflow:hidden;display:flex;align-items:center;justify-content:center}
#yakolakLoader .rollingStage:after{content:"";position:absolute;left:12%;right:12%;bottom:22px;height:2px;border-radius:999px;background:rgba(63,63,63,.14)}
#yakolakLoader .loaderStar{position:absolute;left:50%;bottom:24px;width:62px;height:62px;margin-left:-31px;transform-origin:50% 50%;filter:drop-shadow(0 8px 7px rgba(35,35,35,.16));animation:yakolak-star-roll 1.45s cubic-bezier(.45,.02,.55,.98) infinite}
#yakolakLoader .loaderStar path{fill:var(--yakolak-ink)}
#status,#status-progress,#status-notice{display:none!important}
@keyframes yakolak-star-roll{
  0%{transform:translateX(-94px) rotate(-420deg)}
  50%{transform:translateX(94px) rotate(420deg)}
  100%{transform:translateX(-94px) rotate(-420deg)}
}
@media (max-width:480px){#yakolakLoader .rollingStage{width:250px}.loaderStar{width:56px!important;height:56px!important;margin-left:-28px!important}@keyframes yakolak-star-roll{0%{transform:translateX(-76px) rotate(-420deg)}50%{transform:translateX(76px) rotate(420deg)}100%{transform:translateX(-76px) rotate(-420deg)}}}
@media (prefers-reduced-motion:reduce){#yakolakLoader .loaderStar{animation:yakolak-star-breathe 1s ease-in-out infinite}@keyframes yakolak-star-breathe{0%,100%{transform:scale(.88)}50%{transform:scale(1.05)}}}
</style>
"""

MARKUP = r"""
<div id="yakolakLoader" data-loader-kind="rolling-star" aria-busy="true" aria-label="تحميل ياكلك">
  <div class="rollingStage" aria-hidden="true">
    <svg class="loaderStar" viewBox="0 0 802 798" role="img">
      <g transform="matrix(4.166667,0,0,4.166667,484.7475,797.470417)">
        <path d="M0,-191.393L-20.116,-183.832L-40.232,-191.393L-55.534,-176.304L-76.986,-175.028L-84.828,-155.02L-103.907,-145.13L-102.932,-123.662L-116.339,-106.867L-106.717,-87.651L-112.134,-66.855L-95.528,-53.214L-92.018,-32.013L-71.299,-26.306L-59.469,-8.364L-38.22,-11.578L-20.116,0L-2.012,-11.578L19.237,-8.364L31.067,-26.306L51.786,-32.013L55.296,-53.214L71.902,-66.855L66.486,-87.651L76.108,-106.867L62.7,-123.662L63.675,-145.13L44.596,-155.02L36.754,-175.028L15.302,-176.304L0,-191.393Z"/>
      </g>
    </svg>
  </div>
</div>
"""

SCRIPT = r"""
<script id="yakolak-rolling-star-loader-script">
(()=>{
  const loader=document.getElementById('yakolakLoader');
  let released=false;
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
  new MutationObserver(inspect).observe(document.body,{attributes:true,attributeFilter:['data-yakolak-intro']});
  inspect();
})();
</script>
"""


def main() -> None:
    html = INDEX.read_text(encoding="utf-8")
    if "yakolak-rolling-star-loader-style" in html:
        raise RuntimeError("Rolling-star loader was already injected")
    html = html.replace("</head>", STYLE + "\n</head>", 1)
    html, count = re.subn(r"(<body[^>]*>)", r"\1\n" + MARKUP, html, count=1, flags=re.IGNORECASE)
    if count != 1:
        raise RuntimeError("Could not locate the exported body element")
    html = html.replace("</body>", SCRIPT + "\n</body>", 1)
    INDEX.write_text(html, encoding="utf-8", newline="\n")
    print("YAKOLAK_ROLLING_STAR_LOADER_INJECTED")


if __name__ == "__main__":
    main()
