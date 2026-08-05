#!/usr/bin/env python3
"""Inject the approved Build 125 loading experience into the Godot Web export."""
from __future__ import annotations

import re
from pathlib import Path

INDEX = Path(__file__).resolve().parents[1] / "web" / "index.html"

STYLE = r"""
<style id="yakolak-approved-loader-style">
:root{--yakolak-wall:#f7f7f4;--yakolak-ink:#242421;--yakolak-muted:#77736c}
#yakolakLoader{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;background:var(--yakolak-wall);color:var(--yakolak-ink);font-family:system-ui,-apple-system,"Segoe UI",sans-serif;transition:opacity .42s ease,visibility .42s ease}
#yakolakLoader.done{opacity:0;visibility:hidden;pointer-events:none}
#yakolakLoader .loaderPanel{width:min(520px,calc(100vw - 48px));direction:rtl;text-align:center}
#yakolakLoader .loaderKicker{font-size:12px;font-weight:800;letter-spacing:.22em;color:var(--yakolak-muted);direction:ltr;margin-bottom:14px}
#yakolakLoader .loaderBrand{font-size:54px;font-weight:950;line-height:1;margin-bottom:34px;color:var(--yakolak-ink)}
#yakolakLoader progress{display:block;width:100%;height:4px;appearance:none;-webkit-appearance:none;border:0;border-radius:999px;background:#dedbd4;overflow:hidden}
#yakolakLoader progress::-webkit-progress-bar{background:#dedbd4;border-radius:999px}
#yakolakLoader progress::-webkit-progress-value{background:var(--yakolak-ink);border-radius:999px;transition:width .24s ease}
#yakolakLoader progress::-moz-progress-bar{background:var(--yakolak-ink);border-radius:999px;transition:width .24s ease}
#yakolakLoader .loaderMeta{display:flex;justify-content:space-between;align-items:center;margin-top:13px;font-size:12px;font-weight:700;color:var(--yakolak-muted);direction:rtl}
#yakolakLoaderPercent{font-size:13px;color:var(--yakolak-ink);direction:ltr}
#status,#status-progress,#status-notice{display:none!important}
</style>
"""

MARKUP = r"""
<div id="yakolakLoader" aria-busy="true" aria-describedby="yakolakLoaderStatus">
  <div class="loaderPanel">
    <div class="loaderKicker">YAKOLAK</div>
    <div class="loaderBrand">ياكلك</div>
    <progress id="yakolakLoaderProgress" value="3" max="100" aria-label="تحميل اللعبة">3%</progress>
    <div class="loaderMeta"><span id="yakolakLoaderStatus">تهيئة اللعبة</span><strong id="yakolakLoaderPercent">3%</strong></div>
  </div>
</div>
"""

SCRIPT = r"""
<script id="yakolak-approved-loader-script">
(()=>{
  const loader=document.getElementById('yakolakLoader');
  const progress=document.getElementById('yakolakLoaderProgress');
  const percent=document.getElementById('yakolakLoaderPercent');
  const status=document.getElementById('yakolakLoaderStatus');
  let value=3;
  let released=false;
  const set=(next,label)=>{
    value=Math.max(value,Math.min(100,Math.round(Number(next)||0)));
    if(progress){progress.value=value;progress.textContent=value+'%'}
    if(percent)percent.textContent=value+'%';
    if(label&&status)status.textContent=label;
  };
  window.__yakolakLoading={set};
  const timer=setInterval(()=>{
    if(released)return;
    if(value<35)set(value+4,'تحميل المجسمات');
    else if(value<72)set(value+2,'تجهيز المشهد');
    else if(value<91)set(value+1,'تشغيل اللعبة');
  },180);
  const release=()=>{
    if(released)return;
    released=true;
    clearInterval(timer);
    set(100,'جاهز');
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      loader?.classList.add('done');
      loader?.setAttribute('aria-busy','false');
      setTimeout(()=>loader?.remove(),480);
    }));
  };
  const inspect=()=>{
    if(document.body.dataset.yakolakIntro==='playing'||document.body.dataset.yakolakIntro==='complete')release();
    if(document.body.dataset.yakolakIntro==='error'&&status)status.textContent='تعذر تشغيل اللعبة';
  };
  new MutationObserver(inspect).observe(document.body,{attributes:true,attributeFilter:['data-yakolak-intro']});
  inspect();
})();
</script>
"""


def main() -> None:
    html = INDEX.read_text(encoding="utf-8")
    if "yakolak-approved-loader-style" in html:
        raise RuntimeError("Approved loader was already injected")
    html = html.replace("</head>", STYLE + "\n</head>", 1)
    html, count = re.subn(r"(<body[^>]*>)", r"\1\n" + MARKUP, html, count=1, flags=re.IGNORECASE)
    if count != 1:
        raise RuntimeError("Could not locate the exported body element")
    html = html.replace("</body>", SCRIPT + "\n</body>", 1)
    INDEX.write_text(html, encoding="utf-8", newline="\n")
    print("YAKOLAK_BUILD125_LOADER_INJECTED")


if __name__ == "__main__":
    main()
