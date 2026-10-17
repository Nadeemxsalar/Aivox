import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/* ─────────────────────────────────────────────────────────────
   CodingLab  =  CodingLap Pro Editor (HTML + CSS + JS)
   - Original editor ka poora logic same hai (highlight, live preview,
     console, templates, import/zip, format, download, auto-save, zoom,
     device preview, fullscreen, layout switch ...)
   - Sab CSS `.cdlab` ke andar scoped hai, isliye Features / baaki app
     ke styles ko touch nahi karta. Alag CSS import ki zaroorat nahi.
   - Props:  theme ('dark' | 'light'), onTheme(), onBack()
   ───────────────────────────────────────────────────────────── */

const CSS = `
.cdlab{--bg:#0a1220;--bg2:#101a2e;--card:#14213a;--ed:#0a111f;--tx:#e6edf7;--mu:#8da0bf;--ac:#22d3ee;--ac2:#818cf8;--bd:#24344f;--ok:#4ade80;--er:#f87171;--wn:#fbbf24;--c:#6b7a99;--s:#a5e075;--n:#f9a76b;--k:#c792ea;--f:#82aaff;--t:#ff7a90;--a:#ffcb6b}
.cdlab[data-theme=light]{--bg:#edf2fa;--bg2:#fff;--card:#fff;--ed:#f6f8fc;--tx:#0f172a;--mu:#64748b;--ac:#0891b2;--ac2:#6366f1;--bd:#d3deed;--c:#7b8aa5;--s:#2e7d32;--n:#c2570c;--k:#7c3aed;--f:#2563eb;--t:#d6245f;--a:#a35a00}
.cdlab,.cdlab *{box-sizing:border-box;margin:0;padding:0}
.cdlab{position:fixed;inset:0;z-index:9999;overflow:auto;overscroll-behavior:contain;display:flex;flex-direction:column;background:radial-gradient(900px 500px at 8% -10%,color-mix(in srgb,var(--ac2) 28%,transparent),transparent),radial-gradient(700px 400px at 100% 0,color-mix(in srgb,var(--ac) 20%,transparent),transparent),var(--bg);color:var(--tx);font:14px/1.5 'Segoe UI',system-ui,sans-serif}
.cdlab.lock{overflow:hidden}
.cdlab .shell{flex:1 0 auto;min-height:100%;display:flex;flex-direction:column}
.cdlab .i{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex:none}
.cdlab header{position:sticky;top:0;z-index:20;display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;padding:10px 14px;background:color-mix(in srgb,var(--bg2) 86%,transparent);backdrop-filter:blur(10px);border-bottom:1px solid var(--bd)}
.cdlab .hdl{display:flex;align-items:center;gap:10px}
.cdlab .logo{display:flex;align-items:center;gap:8px;font-size:20px}
.cdlab .logo .i{width:26px;height:26px;color:var(--ac);filter:drop-shadow(0 0 6px var(--ac))}
.cdlab .logo b{background:linear-gradient(90deg,var(--ac),var(--ac2));-webkit-background-clip:text;background-clip:text;color:transparent}
.cdlab .logo small{font-size:11px;padding:2px 8px;border-radius:99px;border:1px solid var(--ac);color:var(--ac)}
.cdlab .bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.cdlab .b,.cdlab select{display:inline-flex;align-items:center;gap:6px;padding:8px 12px;border-radius:10px;border:1px solid var(--bd);background:var(--bg2);color:var(--tx);cursor:pointer;font:600 13px inherit;font-family:inherit}
.cdlab .b:hover,.cdlab select:hover{border-color:var(--ac)}
.cdlab .pri{border:0;background:linear-gradient(135deg,var(--ac),var(--ac2));color:#05121c;box-shadow:0 4px 18px color-mix(in srgb,var(--ac) 45%,transparent)}
.cdlab em{font-style:normal}
.cdlab .sw{display:inline-flex;align-items:center;gap:6px;cursor:pointer;color:var(--mu);font-weight:600;padding:0 4px}
.cdlab .sw input{display:none}
.cdlab .sw span{width:34px;height:18px;border-radius:99px;background:var(--bd);position:relative;transition:.2s}
.cdlab .sw span:after{content:'';position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#fff;transition:.2s}
.cdlab .sw input:checked+span{background:var(--ac)}
.cdlab .sw input:checked+span:after{left:18px}
.cdlab main{flex:1;display:grid;grid-template-columns:1fr;gap:12px;padding:12px;min-height:0}
.cdlab .pn{position:relative;background:var(--card);border:1px solid var(--bd);border-radius:14px;display:flex;flex-direction:column;overflow:hidden;min-width:0}
.cdlab #ep{height:52vh}.cdlab #pv{height:80vh}
.cdlab .tabs{display:flex;align-items:center;gap:4px;padding:6px 8px;background:var(--bg2);border-bottom:1px solid var(--bd);overflow-x:auto;scrollbar-width:none}
.cdlab .sp{flex:1}
.cdlab .tab{padding:6px 14px;border:0;border-radius:8px;background:transparent;color:var(--mu);font-weight:700;cursor:pointer}
.cdlab .tab.on{background:color-mix(in srgb,var(--ac) 18%,transparent);color:var(--ac)}
.cdlab .ttl{display:flex;align-items:center;gap:8px;font-weight:700;padding:0 6px;color:var(--mu)}
.cdlab .ttl s{width:10px;height:10px;border-radius:50%;background:var(--er);box-shadow:16px 0 var(--wn),32px 0 var(--ok);margin-right:34px}
.cdlab .ib{min-width:32px;height:32px;padding:0 6px;display:grid;place-items:center;border-radius:8px;border:0;background:transparent;color:var(--mu);cursor:pointer;font-weight:700;font-size:12px;font-family:inherit}
.cdlab .ib:hover{background:var(--bg);color:var(--ac)}
.cdlab .ib.on{background:var(--card);color:var(--ac)}
.cdlab .hot{background:linear-gradient(135deg,var(--ac),var(--ac2));color:#05121c}
.cdlab .hot:hover{background:linear-gradient(135deg,var(--ac),var(--ac2));color:#05121c;filter:brightness(1.1)}
.cdlab .seg{display:flex;background:var(--bg);border-radius:9px;padding:2px}
.cdlab .zl{min-width:50px}
.cdlab .eds{flex:1;position:relative;min-height:0}
.cdlab .ed{position:absolute;inset:0;display:none}
.cdlab .ed.on{display:flex}
.cdlab .gut,.cdlab .hl,.cdlab .ed textarea{font:var(--fz,14px)/1.65 'Fira Code','Cascadia Code',Consolas,'Courier New',monospace;font-variant-ligatures:none;tab-size:2}
.cdlab .gut{width:48px;flex:none;overflow:hidden;white-space:pre;text-align:right;padding:14px 10px 40px 0;color:var(--mu);opacity:.8;background:var(--bg2);border-right:1px solid var(--bd);user-select:none}
.cdlab .cw{position:relative;flex:1;min-width:0;background:var(--ed)}
.cdlab .hl,.cdlab .ed textarea{position:absolute;inset:0;margin:0;padding:14px;border:0;white-space:pre;overflow:auto}
.cdlab .hl{overflow:hidden;pointer-events:none;color:var(--tx);padding-bottom:40px}
.cdlab .ed textarea{background:transparent;color:transparent;caret-color:var(--ac);resize:none;outline:0}
.cdlab .ed textarea::selection{background:color-mix(in srgb,var(--ac) 35%,transparent)}
.cdlab .hl .c{color:var(--c);font-style:italic}.cdlab .hl .s{color:var(--s)}.cdlab .hl .n{color:var(--n)}.cdlab .hl .k{color:var(--k)}.cdlab .hl .f{color:var(--f)}.cdlab .hl .t{color:var(--t)}.cdlab .hl .a{color:var(--a)}
.cdlab .rp{display:flex;align-items:center;gap:6px;padding:0 10px 8px;color:var(--ac);font:12px Consolas,monospace}
.cdlab .rp input{flex:1;min-width:0;background:transparent;border:0;border-bottom:1px solid var(--bd);color:var(--tx);font:inherit;padding:4px 0;outline:0}
.cdlab .rp input:focus{border-color:var(--ac)}
.cdlab .con.cl .rp{display:none}
.cdlab #gal{position:fixed;inset:0;z-index:99;display:none;flex-direction:column;background:var(--bg)}
.cdlab #gal.on{display:flex}
.cdlab .gh{display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:12px 14px;background:var(--bg2);border-bottom:1px solid var(--bd)}
.cdlab .gh h2{font-size:18px;margin-right:auto;background:linear-gradient(90deg,var(--ac),var(--ac2));-webkit-background-clip:text;background-clip:text;color:transparent}
.cdlab .gh input{flex:1 1 200px;max-width:340px;padding:9px 12px;border-radius:10px;border:1px solid var(--bd);background:var(--ed);color:var(--tx);font:inherit;outline:0}
.cdlab .gh input:focus{border-color:var(--ac)}
.cdlab .chips{display:flex;gap:8px;padding:10px 14px;overflow-x:auto;scrollbar-width:none}
.cdlab .chip{padding:6px 16px;border-radius:99px;border:1px solid var(--bd);background:var(--card);color:var(--mu);font-weight:600;font-size:13px;font-family:inherit;cursor:pointer;white-space:nowrap}
.cdlab .chip.on{background:linear-gradient(135deg,var(--ac),var(--ac2));color:#05121c;border-color:transparent}
.cdlab #ggrid{flex:1;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px;padding:6px 14px 20px;align-content:start}
.cdlab .tc{border:1px solid var(--bd);border-radius:14px;overflow:hidden;background:var(--card);cursor:pointer;transition:.2s;outline:0}
.cdlab .tc:hover,.cdlab .tc:focus-visible{transform:translateY(-3px);border-color:var(--ac);box-shadow:0 10px 28px #0005}
.cdlab .th{position:relative;aspect-ratio:16/10;overflow:hidden;background:#fff}
.cdlab .th iframe{position:absolute;top:0;left:0;width:400%;height:400%;transform:scale(.25);transform-origin:0 0;border:0;pointer-events:none}
.cdlab .ti{padding:12px 14px}
.cdlab .ti b{display:block;font-size:15px}
.cdlab .cat{font-size:11px;font-weight:700;color:var(--ac)}
.cdlab .ti p{color:var(--mu);font-size:13px;margin-top:4px}
.cdlab .none{grid-column:1/-1;color:var(--mu);text-align:center;padding:40px}
.cdlab .menu{position:fixed;right:12px;top:60px;z-index:60;display:none;width:min(310px,calc(100vw - 24px));padding:6px;background:var(--card);border:1px solid var(--bd);border-radius:14px;box-shadow:0 14px 40px rgba(0,0,0,.4)}
.cdlab .menu.on{display:block}
.cdlab .menu button{display:block;width:100%;text-align:left;padding:10px 12px;border:0;border-radius:9px;background:transparent;color:var(--tx);font:600 14px inherit;font-family:inherit;cursor:pointer}
.cdlab .menu button:hover{background:var(--bg)}
.cdlab .menu small{display:block;color:var(--mu);font-weight:400;font-size:12px}
.cdlab .st{flex-wrap:wrap;align-items:center;row-gap:2px}
.cdlab .st .sw{padding:0;font-size:12px}
.cdlab .st .sw em{display:inline}
.cdlab #sv{font-weight:600}
.cdlab .pn{container-type:inline-size}
@container (max-width:680px){
.cdlab .tabs{flex-wrap:wrap;overflow:visible;row-gap:2px;padding:8px}
.cdlab .tabs>*{order:4}
.cdlab .tabs .tab,.cdlab .tabs .ttl{order:1}
.cdlab .tabs .fsb{order:2;margin-left:auto;min-width:46px}
.cdlab .tabs .sp{order:3;flex:1 0 100%;height:0}
.cdlab .ib{min-width:38px;height:38px}
.cdlab .tab{padding:9px 16px}
}
@media(min-width:960px){.cdlab main.stack{grid-template-columns:1fr;grid-template-rows:minmax(0,1fr) minmax(0,1fr)}}
@media(max-width:959px){.cdlab #lyt{display:none}}
.cdlab .st{display:flex;justify-content:space-between;gap:10px;padding:6px 12px;font-size:12px;color:var(--mu);background:var(--bg2);border-top:1px solid var(--bd)}
.cdlab .stage{flex:1;min-height:0;overflow:auto;background:var(--ed)}
.cdlab .frame{height:100%;margin:0 auto;background:#fff;overflow:hidden}
.cdlab iframe{display:block;border:0;background:#fff;transform-origin:0 0}
.cdlab .con{background:var(--ed);border-top:1px solid var(--bd)}
.cdlab .ch{display:flex;align-items:center;gap:8px;padding:4px 10px;cursor:pointer;color:var(--mu);font-weight:700;font-size:12px}
.cdlab .bdg{background:var(--ac);color:#05121c;border-radius:99px;padding:0 7px;font-size:11px}
.cdlab #log{height:110px;overflow:auto;font:12px Consolas,monospace;padding:0 10px 8px}
.cdlab .con.cl #log{display:none}
.cdlab .ln{padding:2px 0;border-bottom:1px dashed var(--bd);white-space:pre-wrap;word-break:break-word}
.cdlab .ln.error{color:var(--er)}.cdlab .ln.warn{color:var(--wn)}.cdlab .ln.log,.cdlab .ln.info{color:var(--ok)}
.cdlab .xfs{display:none;position:absolute;right:16px;bottom:16px;z-index:5;align-items:center;gap:6px;padding:10px 16px;border:0;border-radius:99px;background:#0b1220e6;color:#fff;font:700 13px inherit;font-family:inherit;cursor:pointer;box-shadow:0 6px 24px #0008;border:1px solid var(--ac)}
.cdlab .pn.fs{position:fixed;inset:0;z-index:99;height:100dvh!important;border-radius:0;border:0}
.cdlab .fs .xfs{display:flex}
.cdlab .fs .con{display:none}
.cdlab #ep .xfs{bottom:46px}
.cdlab .onlyfs{display:none}
.cdlab .fs .onlyfs{display:grid}
.cdlab #ep.fs textarea{padding:18px max(18px,env(safe-area-inset-left))}
.cdlab #toast{position:fixed;left:50%;bottom:24px;transform:translate(-50%,20px);opacity:0;background:var(--card);border:1px solid var(--ac);padding:8px 18px;border-radius:99px;transition:.3s;z-index:200;pointer-events:none;font-weight:600}
.cdlab #toast.on{opacity:1;transform:translate(-50%,0)}
@media(min-width:960px){.cdlab{overflow:hidden}.cdlab .shell{flex:1 1 0;min-height:0}.cdlab main{grid-template-columns:1fr 1fr;grid-template-rows:minmax(0,1fr)}.cdlab #ep,.cdlab #pv{height:auto}}
@media(max-width:640px){.cdlab .b em,.cdlab .sw em,.cdlab .logo small,.cdlab .hint{display:none}.cdlab .b{padding:8px 10px}.cdlab header{padding:8px 10px}}
`;

const MARKUP = `
<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
<symbol id="cdl-i-code" viewBox="0 0 24 24"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></symbol>
<symbol id="cdl-i-back" viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7"/></symbol>
<symbol id="cdl-i-play" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></symbol>
<symbol id="cdl-i-max" viewBox="0 0 24 24"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></symbol>
<symbol id="cdl-i-min" viewBox="0 0 24 24"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></symbol>
<symbol id="cdl-i-zin" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35M11 8v6M8 11h6"/></symbol>
<symbol id="cdl-i-zout" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35M8 11h6"/></symbol>
<symbol id="cdl-i-dl" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></symbol>
<symbol id="cdl-i-cp" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></symbol>
<symbol id="cdl-i-tr" viewBox="0 0 24 24"><path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 6V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2"/></symbol>
<symbol id="cdl-i-rs" viewBox="0 0 24 24"><path d="M23 4v6h-6M20.5 15a9 9 0 1 1-2.1-9.4L23 10"/></symbol>
<symbol id="cdl-i-sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></symbol>
<symbol id="cdl-i-moon" viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></symbol>
<symbol id="cdl-i-ext" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></symbol>
<symbol id="cdl-i-term" viewBox="0 0 24 24"><polyline points="4 17 10 11 4 5"/><path d="M12 19h8"/></symbol>
<symbol id="cdl-i-mon" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></symbol>
<symbol id="cdl-i-tab" viewBox="0 0 24 24"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M12 18h.01"/></symbol>
<symbol id="cdl-i-ph" viewBox="0 0 24 24"><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M12 18h.01"/></symbol>
<symbol id="cdl-i-zap" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></symbol>
<symbol id="cdl-i-up" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></symbol>
<symbol id="cdl-i-fmt" viewBox="0 0 24 24"><path d="M21 6H3M15 12H3M17 18H3"/></symbol>
<symbol id="cdl-i-cols" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 3v18"/></symbol>
<symbol id="cdl-i-rows" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 12h18"/></symbol>
<symbol id="cdl-i-x" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></symbol>
<symbol id="cdl-i-grid" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></symbol>
</defs></svg>

<div class="shell">
<header>
  <div class="hdl">
    <button class="b" id="bk" title="Back"><svg class="i"><use href="#cdl-i-back"/></svg><em>Back</em></button>
    <div class="logo"><svg class="i"><use href="#cdl-i-code"/></svg><b>CodingLap</b><small>Pro</small></div>
  </div>
  <div class="bar">
    <button class="b" id="tpl" title="Browse templates"><svg class="i"><use href="#cdl-i-grid"/></svg><em>Templates</em></button>
    <label class="sw" title="Live preview (updates as you type HTML/CSS)"><input type="checkbox" id="live" checked><span></span><svg class="i"><use href="#cdl-i-zap"/></svg><em>Live</em></label>
    <button class="b" id="lyt" title="Switch layout (side by side / stacked)"><svg class="i"><use href="#cdl-i-cols"/></svg></button>
    <input type="file" id="file" hidden multiple accept=".html,.htm,.css,.js,.txt,.zip">
    <button class="b" id="imp" title="Import files or a .zip"><svg class="i"><use href="#cdl-i-up"/></svg><em>Import</em></button>
    <button class="b" id="dl" title="Download code"><svg class="i"><use href="#cdl-i-dl"/></svg><em>Download</em></button>
    <button class="b" id="th" title="Theme"><svg class="i"><use href="#cdl-i-sun"/></svg></button>
    <button class="b pri" id="run" title="Run (Ctrl+Enter)"><svg class="i"><use href="#cdl-i-play"/></svg>Run</button>
  </div>
</header>

<main>
  <section class="pn" id="ep">
    <div class="tabs">
      <button class="tab on" data-t="html">HTML</button>
      <button class="tab" data-t="css">CSS</button>
      <button class="tab" data-t="js">JS</button>
      <span class="sp"></span>
      <button class="ib" id="fm" title="Decrease font size">A−</button>
      <button class="ib" id="fp" title="Increase font size">A+</button>
      <button class="ib" id="fmt" title="Format code"><svg class="i"><use href="#cdl-i-fmt"/></svg></button>
      <button class="ib" id="edl" title="Download this tab as a file"><svg class="i"><use href="#cdl-i-dl"/></svg></button>
      <button class="ib" id="cp" title="Copy code"><svg class="i"><use href="#cdl-i-cp"/></svg></button>
      <button class="ib" id="cl" title="Clear this tab"><svg class="i"><use href="#cdl-i-tr"/></svg></button>
      <button class="ib" id="rs" title="Reset all to default"><svg class="i"><use href="#cdl-i-rs"/></svg></button>
      <button class="ib onlyfs" id="erun" title="Run (Ctrl+Enter)"><svg class="i"><use href="#cdl-i-play"/></svg></button>
      <button class="ib hot fsb" id="efs" title="Full screen"><svg class="i"><use href="#cdl-i-max"/></svg></button>
    </div>
    <div class="eds" id="eds"></div>
    <div class="st"><span id="info"></span><span id="sv" title="Click for download options when not saved"></span><label class="sw" title="Save your code in this browser automatically"><input type="checkbox" id="auto" checked><span></span><em>Auto-save</em></label><span class="hint">Ctrl+Enter run · Ctrl+S save · Tab indent</span></div>
    <button class="xfs"><svg class="i"><use href="#cdl-i-min"/></svg>Exit full screen</button>
  </section>

  <section class="pn" id="pv">
    <div class="tabs">
      <span class="ttl"><s></s>Preview</span>
      <span class="sp"></span>
      <div class="seg" id="dev">
        <button class="ib on" data-w="0" title="Desktop"><svg class="i"><use href="#cdl-i-mon"/></svg></button>
        <button class="ib" data-w="768" title="Tablet"><svg class="i"><use href="#cdl-i-tab"/></svg></button>
        <button class="ib" data-w="375" title="Mobile"><svg class="i"><use href="#cdl-i-ph"/></svg></button>
      </div>
      <button class="ib" id="zo" title="Zoom out"><svg class="i"><use href="#cdl-i-zout"/></svg></button>
      <button class="ib zl" id="zr" title="Zoom reset">100%</button>
      <button class="ib" id="zi" title="Zoom in"><svg class="i"><use href="#cdl-i-zin"/></svg></button>
      <button class="ib" id="nt" title="Open in new tab"><svg class="i"><use href="#cdl-i-ext"/></svg></button>
      <button class="ib hot fsb" id="fs" title="Full screen"><svg class="i"><use href="#cdl-i-max"/></svg></button>
    </div>
    <div class="stage"><div class="frame" id="fr"><iframe id="out" title="Output" sandbox="allow-scripts allow-same-origin allow-modals allow-forms allow-popups"></iframe></div></div>
    <div class="con" id="conp">
      <div class="ch" id="ch"><svg class="i"><use href="#cdl-i-term"/></svg>Console <span class="bdg" id="cnt">0</span><span class="sp"></span><button class="ib" id="cc" title="Clear console"><svg class="i"><use href="#cdl-i-tr"/></svg></button></div>
      <div id="log"></div>
      <div class="rp"><span>›</span><input id="rin" placeholder="Type JavaScript and press Enter" autocomplete="off" autocapitalize="off" spellcheck="false"></div>
    </div>
    <button class="xfs" id="xfs"><svg class="i"><use href="#cdl-i-min"/></svg>Exit full screen</button>
  </section>
</main>
</div>

<div class="menu" id="dm">
  <button data-d="all">All-in-one file (.html)<small>HTML, CSS and JS together in one file</small></button>
  <button data-d="zip">Separate files (.zip)<small>index.html + style.css + script.js</small></button>
  <button data-d="html">index.html only<small>Linked to style.css and script.js</small></button>
  <button data-d="css">style.css only</button>
  <button data-d="js">script.js only</button>
</div>
<div id="gal">
  <div class="gh"><h2>Template Gallery</h2><input id="gq" placeholder="Search templates..." autocomplete="off"><button class="b" id="gx"><svg class="i"><use href="#cdl-i-x"/></svg>Close</button></div>
  <div class="chips" id="gchips"></div>
  <div id="ggrid"></div>
</div>
<div id="toast"></div>
`;

// Preview iframe ke andar inject hone wala console hook (string rakha hai taaki bundler isse transform na kare)
const HOOK = `(function(){const f=a=>a.map(x=>{if(x&&typeof x==='object')try{return JSON.stringify(x)}catch(e){}return String(x)}).join(' ');const s=(t,m)=>parent.postMessage({cl:1,t,m},'*');['log','info','warn','error'].forEach(k=>{const o=console[k];console[k]=(...a)=>{s(k,f(a));o.apply(console,a)}});addEventListener('error',e=>s('error',e.message+(e.lineno?' (line '+e.lineno+')':'')));addEventListener('unhandledrejection',e=>s('error',String(e.reason)))})()`;

function mountLab(R, host) {
R.innerHTML = MARKUP;
const $ = (s) => R.querySelector(s), $$ = (s) => [...R.querySelectorAll(s)];
const offs = [];
const onWin = (t, f) => { window.addEventListener(t, f); offs.push(() => window.removeEventListener(t, f)); };
const onDoc = (t, f) => { document.addEventListener(t, f); offs.push(() => document.removeEventListener(t, f)); };

const st={g(k){try{return localStorage.getItem(k)}catch(e){return null}},s(k,v){try{localStorage.setItem(k,v);return true}catch(e){st.q=/quota/i.test(e.name)||e.code===22;return false}}};
const ids=['html','css','js'],E={},out=$('#out');
const D={
html:`<h1>Hello World</h1>
<p>Welcome to CodingLap!</p>
`,
css:`body {
  background: #ffffff;
  font-family: sans-serif;
  text-align: center;
}
`,
js:`console.log('Welcome to CodingLap');
`};
const T=[
{n:'Hello World',c:'Basics',d:'Your first page: HTML, CSS and a console message.',...D},
{n:'Counter App',c:'JavaScript',d:'Update the page on button clicks using events.',
html:`<div class="box">
  <h2 id="n">0</h2>
  <button id="b">+1</button>
</div>
`,
css:`body {
  display: grid;
  place-items: center;
  height: 100vh;
  margin: 0;
  background: #0f172a;
  color: #ffffff;
  font-family: sans-serif;
}

button {
  padding: 10px 28px;
  border: 0;
  border-radius: 8px;
  background: #22d3ee;
  font-size: 1rem;
  cursor: pointer;
}
`,
js:`let count = 0;
const num = document.getElementById('n');

document.getElementById('b').onclick = () => {
  count++;
  num.textContent = count;
  console.log('Count:', count);
};
`},
{n:'Todo List',c:'JavaScript',d:'Create elements and toggle tasks as done.',
html:`<h2>Todo</h2>
<input id="i" placeholder="Write a task">
<button id="a">Add</button>
<ul id="l"></ul>
`,
css:`body {
  font-family: sans-serif;
  max-width: 360px;
  margin: 30px auto;
}

input,
button {
  padding: 8px 12px;
}

li {
  margin: 8px 0;
  cursor: pointer;
}

li.d {
  text-decoration: line-through;
  opacity: 0.5;
}
`,
js:`const input = document.getElementById('i');
const list = document.getElementById('l');

document.getElementById('a').onclick = () => {
  if (!input.value) return;

  const li = document.createElement('li');
  li.textContent = input.value;
  li.onclick = () => li.classList.toggle('d');
  list.append(li);

  console.log('Added:', input.value);
  input.value = '';
};
`},
{n:'Digital Clock',c:'JavaScript',d:'A live clock with setInterval and the Date object.',
html:`<div class="clock" id="clock">00:00:00</div>
`,
css:`body {
  display: grid;
  place-items: center;
  height: 100vh;
  margin: 0;
  background: #0b1220;
}

.clock {
  font: 700 4rem monospace;
  color: #22d3ee;
  text-shadow: 0 0 20px #22d3ee;
}
`,
js:`const clock = document.getElementById('clock');

function tick() {
  clock.textContent = new Date().toLocaleTimeString();
}

tick();
setInterval(tick, 1000);
`},
{n:'Calculator',c:'JavaScript',d:'Basic maths using an object of functions.',
html:`<div class="calc">
  <input id="a" type="number" placeholder="First number">
  <input id="b" type="number" placeholder="Second number">
  <div class="ops">
    <button data-op="+">+</button>
    <button data-op="-">-</button>
    <button data-op="*">x</button>
    <button data-op="/">/</button>
  </div>
  <h2 id="res">Result: -</h2>
</div>
`,
css:`body {
  display: grid;
  place-items: center;
  height: 100vh;
  margin: 0;
  background: #eef2f9;
  font-family: sans-serif;
}

.calc {
  display: grid;
  gap: 10px;
  width: 260px;
}

input,
button {
  padding: 10px;
  font-size: 1rem;
}

.ops {
  display: flex;
  gap: 8px;
}

.ops button {
  flex: 1;
  cursor: pointer;
}
`,
js:`const $ = id => document.getElementById(id);

const math = {
  '+': (x, y) => x + y,
  '-': (x, y) => x - y,
  '*': (x, y) => x * y,
  '/': (x, y) => x / y
};

document.querySelectorAll('.ops button').forEach(btn => {
  btn.onclick = () => {
    const x = Number($('a').value);
    const y = Number($('b').value);
    const result = math[btn.dataset.op](x, y);
    $('res').textContent = 'Result: ' + result;
    console.log(x, btn.dataset.op, y, '=', result);
  };
});
`},
{n:'Dark Mode Toggle',c:'JavaScript',d:'Switch themes with classList and CSS variables.',
html:`<div class="page">
  <h1>Dark Mode</h1>
  <p>Click the button to switch the theme.</p>
  <button id="toggle">Toggle theme</button>
</div>
`,
css:`:root {
  --bg: #ffffff;
  --text: #111827;
}

body.dark {
  --bg: #0f172a;
  --text: #f1f5f9;
}

body {
  display: grid;
  place-items: center;
  height: 100vh;
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: sans-serif;
  text-align: center;
  transition: 0.3s;
}

button {
  padding: 10px 22px;
  border: 0;
  border-radius: 8px;
  cursor: pointer;
}
`,
js:`document.getElementById('toggle').onclick = () => {
  const dark = document.body.classList.toggle('dark');
  console.log('Dark mode:', dark);
};
`},
{n:'Gradient Card',c:'CSS',d:'Gradients, transitions and hover transforms.',
html:`<div class="card">
  <h2>CodingLap</h2>
  <p>Hover over me</p>
</div>
`,
css:`body {
  display: grid;
  place-items: center;
  height: 100vh;
  margin: 0;
  background: #111111;
  font-family: sans-serif;
}

.card {
  padding: 40px 50px;
  border-radius: 20px;
  color: #ffffff;
  background: linear-gradient(135deg, #22d3ee, #818cf8);
  transition: 0.3s;
}

.card:hover {
  transform: scale(1.08) rotate(-2deg);
}
`,
js:`console.log('Card ready');
`},
{n:'Loading Spinner',c:'CSS',d:'A pure CSS animation using @keyframes.',
html:`<div class="spinner"></div>
`,
css:`body {
  display: grid;
  place-items: center;
  height: 100vh;
  margin: 0;
  background: #0f172a;
}

.spinner {
  width: 64px;
  height: 64px;
  border: 6px solid #1e293b;
  border-top-color: #22d3ee;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
`,
js:`console.log('Spinner running');
`},
{n:'Flexbox Layout',c:'Layout',d:'Header, sidebar, content and footer with Flexbox.',
html:`<header>Header</header>
<div class="body">
  <aside>Sidebar</aside>
  <main>Main content</main>
</div>
<footer>Footer</footer>
`,
css:`body {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  margin: 0;
  font-family: sans-serif;
}

header,
footer {
  padding: 16px;
  background: #1e293b;
  color: #ffffff;
}

.body {
  display: flex;
  flex: 1;
}

aside {
  width: 180px;
  padding: 16px;
  background: #e2e8f0;
}

main {
  flex: 1;
  padding: 16px;
}
`,
js:`console.log('Flexbox layout loaded');
`},
{n:'CSS Grid Gallery',c:'Layout',d:'A responsive grid with auto-fit and minmax.',
html:`<div class="grid">
  <div>1</div>
  <div>2</div>
  <div>3</div>
  <div>4</div>
  <div>5</div>
  <div>6</div>
</div>
`,
css:`body {
  margin: 0;
  padding: 20px;
  font-family: sans-serif;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 12px;
}

.grid div {
  display: grid;
  place-items: center;
  height: 100px;
  border-radius: 12px;
  background: linear-gradient(135deg, #22d3ee, #818cf8);
  color: #ffffff;
  font-size: 1.5rem;
}
`,
js:`console.log('Resize the preview to see the grid adapt');
`},
{n:'Login Form',c:'Forms',d:'Form validation with the submit event.',
html:`<form id="form">
  <h2>Login</h2>
  <input id="email" type="email" placeholder="Email">
  <input id="pass" type="password" placeholder="Password (min 6 chars)">
  <button type="submit">Sign in</button>
  <p id="msg"></p>
</form>
`,
css:`body {
  display: grid;
  place-items: center;
  height: 100vh;
  margin: 0;
  background: #eef2f9;
  font-family: sans-serif;
}

form {
  display: grid;
  gap: 12px;
  width: 280px;
  padding: 28px;
  border-radius: 16px;
  background: #ffffff;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
}

input,
button {
  padding: 10px;
  font-size: 1rem;
}

button {
  border: 0;
  border-radius: 8px;
  background: #6366f1;
  color: #ffffff;
  cursor: pointer;
}
`,
js:`document.getElementById('form').onsubmit = e => {
  e.preventDefault();
  const pass = document.getElementById('pass').value;
  const msg = document.getElementById('msg');

  if (pass.length < 6) {
    msg.textContent = 'Password is too short';
    msg.style.color = 'crimson';
  } else {
    msg.textContent = 'Login successful!';
    msg.style.color = 'green';
  }
};
`},
{n:'Accordion',c:'UI',d:'Expand and collapse sections with classList.toggle.',
html:`<div class="item">
  <button class="head">What is HTML?</button>
  <div class="content">HTML structures the content of a web page.</div>
</div>
<div class="item">
  <button class="head">What is CSS?</button>
  <div class="content">CSS controls how the page looks.</div>
</div>
<div class="item">
  <button class="head">What is JavaScript?</button>
  <div class="content">JavaScript makes the page interactive.</div>
</div>
`,
css:`body {
  max-width: 420px;
  margin: 30px auto;
  font-family: sans-serif;
}

.head {
  width: 100%;
  padding: 14px;
  border: 0;
  background: #1e293b;
  color: #ffffff;
  text-align: left;
  font-size: 1rem;
  cursor: pointer;
}

.content {
  display: none;
  padding: 14px;
  background: #e2e8f0;
}

.item.open .content {
  display: block;
}
`,
js:`document.querySelectorAll('.head').forEach(head => {
  head.onclick = () => head.parentElement.classList.toggle('open');
});
`},
{n:'Modal Popup',c:'UI',d:'Open and close a dialog overlay.',
html:`<button id="open">Open modal</button>

<div class="overlay" id="overlay">
  <div class="modal">
    <h2>Hello!</h2>
    <p>This is a modal dialog.</p>
    <button id="close">Close</button>
  </div>
</div>
`,
css:`body {
  display: grid;
  place-items: center;
  height: 100vh;
  margin: 0;
  font-family: sans-serif;
}

button {
  padding: 10px 22px;
  border: 0;
  border-radius: 8px;
  background: #6366f1;
  color: #ffffff;
  cursor: pointer;
}

.overlay {
  display: none;
  position: fixed;
  inset: 0;
  place-items: center;
  background: rgba(0, 0, 0, 0.6);
}

.overlay.show {
  display: grid;
}

.modal {
  padding: 28px;
  border-radius: 16px;
  background: #ffffff;
  text-align: center;
}
`,
js:`const overlay = document.getElementById('overlay');

document.getElementById('open').onclick = () => overlay.classList.add('show');
document.getElementById('close').onclick = () => overlay.classList.remove('show');
`}
];
let cur='html',z=100,w=0,fz=+st.g('clFz')||14,tm,n=0;
$('#eds').style.setProperty('--fz',fz+'px');
$('#auto').checked=st.g('clAuto')!=='0';
ids.forEach(k=>{const d=document.createElement('div');d.className='ed'+(k==='html'?' on':'');d.innerHTML='<div class="gut"></div><div class="cw"><pre class="hl" aria-hidden="true"></pre><textarea id="cdl-'+k+'" spellcheck="false" wrap="off" autocapitalize="off" autocomplete="off"></textarea></div>';$('#eds').append(d);const v=$('#auto').checked?st.g(k+'Code'):null;E[k]=d.querySelector('textarea');E[k].value=v===null?D[k]:v});

const esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;');
const sp=(c,s)=>'<span class="'+c+'">'+esc(s)+'</span>';
const RX={
 js:[/(\/\/.*|\/\*[\s\S]*?(?:\*\/|$))|("(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?|`(?:\\.|[^`\\])*`?)|\b(\d[\d.]*)\b|\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|class|extends|import|export|from|async|await|try|catch|finally|throw|typeof|instanceof|in|of|this|null|undefined|true|false)\b|([A-Za-z_$][\w$]*)(?=\()/g,['c','s','n','k','f']],
 css:[/(\/\*[\s\S]*?(?:\*\/|$))|("[^"\n]*"?|'[^'\n]*'?)|(#[0-9a-fA-F]{3,8}\b|-?\d*\.?\d+(?:px|em|rem|%|vh|vw|s|ms|deg)?)|([.#]?[\w-]+)(?=[^{};]*\{)|([\w-]+)(?=\s*:)|(@[\w-]+)/g,['c','s','n','t','a','k']]};
function tok(t,rx,cl){let o='',l=0;for(const m of t.matchAll(rx)){o+=esc(t.slice(l,m.index));o+=sp(cl[m.findIndex((x,j)=>j&&x!==undefined)-1],m[0]);l=m.index+m[0].length}return o+esc(t.slice(l))}
function hhtml(t){let o='',l=0;for(const m of t.matchAll(/<!--[\s\S]*?(?:-->|$)|(<\/?)([\w-]+)([^>]*)(>?)/g)){o+=esc(t.slice(l,m.index));l=m.index+m[0].length;if(!m[2]){o+=sp('c',m[0]);continue}o+=sp('t',m[1]+m[2])+esc(m[3]).replace(/([\w:@-]+)(=)("[^"]*"|'[^']*')?/g,(a,n,e,v)=>'<span class="a">'+n+'</span>'+e+(v?'<span class="s">'+v+'</span>':''))+sp('t',m[4])}return o+esc(t.slice(l))}
function hl(k){const t=E[k].value,ed=E[k].closest('.ed');ed.querySelector('.hl').innerHTML=(k==='html'?hhtml(t):tok(t,...RX[k]))+'\n';ed.querySelector('.gut').textContent=Array.from({length:t.split('\n').length},(_,i)=>i+1).join('\n')}
function sync(k){const t=E[k],ed=t.closest('.ed'),h=ed.querySelector('.hl');h.scrollTop=t.scrollTop;h.scrollLeft=t.scrollLeft;ed.querySelector('.gut').scrollTop=t.scrollTop}
function set(k,v){E[k].value=v;E[k].dispatchEvent(new Event('input'))}

function indent(a,gap){let d=0,o=[];a.forEach(l=>{l=l.trim();if(!l)return;if(/^[}\])]/.test(l))d=Math.max(0,d-1);o.push('  '.repeat(d)+l);if(/[{[(]$/.test(l))d++;if(gap&&d===0&&l==='}')o.push('')});return o.join('\n').trim()+'\n'}
function fcss(t){return indent(t.replace(/\s+/g,' ').replace(/\s*\{\s*/g,' {\n').replace(/;\s*/g,';\n').replace(/\s*\}\s*/g,'\n}\n').split('\n').map(l=>l.trim().replace(/^([\w-]+)\s*:\s*(?=.*;$)/,'$1: ')),1)}
function fjs(t){let o='',q=null,p=0;for(let i=0;i<t.length;i++){const c=t[i];if(q){o+=c;if(c==='\\')o+=t[++i]||'';else if(c===q)q=null;continue}
 if(c==='"'||c==="'"||c==='`'){q=c;o+=c;continue}
 if(c==='/'&&(t[i+1]==='/'||t[i+1]==='*')){const b=t[i+1]==='/',e=t.indexOf(b?'\n':'*/',i+2),j=e<0?t.length:e+(b?0:2);o+=t.slice(i,j)+(b?'\n':'');i=j-1;continue}
 if(c==='(')p++;if(c===')')p--;
 if(c==='{')o+='{\n';else if(c==='}')o+='\n}'+(/^\s*(else|catch|finally|while|[,;)])/.test(t.slice(i+1))?'':'\n');else if(c===';'&&p<=0)o+=';\n';else o+=c}
 return indent(o.split('\n'))}
function fhtml(t){let d=0;return t.replace(/>\s*</g,'>\n<').split('\n').map(l=>{l=l.trim();if(!l)return '';if(/^<\//.test(l))d=Math.max(0,d-1);const r='  '.repeat(d)+l,m=l.match(/^<([\w-]+)/);if(m&&!/\/>$/.test(l)&&!/^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/i.test(m[1])&&!new RegExp('</'+m[1]+'>\\s*$','i').test(l))d++;return r}).filter(Boolean).join('\n')+'\n'}

const PR={'(':')','[':']','{':'}','"':'"',"'":"'",'`':'`'};
function key(e){const t=e.target,a=t.selectionStart,b=t.selectionEnd,v=t.value,c=e.key;
 const put=(s,p)=>{e.preventDefault();t.setRangeText(s,a,b,'end');t.selectionStart=t.selectionEnd=p;t.dispatchEvent(new Event('input'))};
 if(c==='Tab')return put('  ',a+2);
 if(e.ctrlKey||e.metaKey||e.altKey)return;
 if(c==='Enter'){const ind=v.slice(v.lastIndexOf('\n',a-1)+1,a).match(/^\s*/)[0],p=v[a-1]||'x',o='{(['.includes(p)||(p==='>'&&v.slice(a,a+2)==='</'),cl=o&&(PR[p]===v[a]||v.slice(a,a+2)==='</');return put('\n'+ind+(o?'  ':'')+(cl?'\n'+ind:''),a+1+ind.length+(o?2:0))}
 if(a===b&&c===v[a]&&')]}"\'`'.includes(c))return put('',a+1);
 if(PR[c]){const s=v.slice(a,b);if(s)return put(c+s+PR[c],b+2);if('"\'`'.includes(c)&&/\w/.test(v[a-1]||''))return;return put(c+PR[c],a+1)}}

function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('on');clearTimeout(t._);t._=setTimeout(()=>t.classList.remove('on'),1800)}
function mk(h,c,j,x){return '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CodingLap Project</title><style>'+c+'</style></head><body>'+h+(x?'':'<script>'+HOOK+'<\/script>')+'<script>'+j+'<\/script></body></html>'}
function build(x){return mk(E.html.value,E.css.value,E.js.value,x)}
let warned=0;
function save(){const v=$('#sv');
 if(!$('#auto').checked){v.textContent='Auto-save is off · use Download to keep your code';v.style.color='';return false}
 const ok=ids.map(k=>st.s(k+'Code',E[k].value)).every(Boolean);
 v.textContent=ok?'✓ Saved locally':st.q?'⚠ Local storage is full · code not saved':'⚠ Browser storage is blocked · code not saved';v.style.color=ok?'':'var(--wn)';
 if(!ok&&!warned){warned=1;toast(st.q?'Local storage is full! Download your code or turn off Auto-save.':'Browser storage is blocked. Download your code to keep it.')}
 if(ok)warned=0;return ok}
function clearLog(){$('#log').innerHTML='';n=0;$('#cnt').textContent=0}
function run(){save();clearLog();out.srcdoc=build()}
function info(){const t=E[cur],v=t.value,l=v.slice(0,t.selectionStart).split('\n');$('#info').textContent='Ln '+l.length+', Col '+(l[l.length-1].length+1)+' · '+v.split('\n').length+' lines · '+v.length+' chars'}
function lay(){const s=z/100;$('#fr').style.width=w?w*s+'px':'100%';out.style.width=w?w+'px':100/s+'%';out.style.height=100/s+'%';out.style.transform='scale('+s+')';$('#zr').textContent=z+'%'}
function fs(p,on){on=on===undefined?!p.classList.contains('fs'):on;p.classList.toggle('fs',on);R.classList.toggle('lock',on);const b=p.querySelector('.fsb');b.querySelector('use').setAttribute('href',on?'#cdl-i-min':'#cdl-i-max');b.title=on?'Exit full screen':'Full screen';try{if(on){const r=p.requestFullscreen&&p.requestFullscreen();r&&r.catch&&r.catch(()=>{})}else if(document.fullscreenElement)document.exitFullscreen()}catch(e){}}
function setFz(d){fz=Math.min(24,Math.max(10,fz+d));$('#eds').style.setProperty('--fz',fz+'px');st.s('clFz',fz)}

$$('.tab').forEach(b=>b.onclick=()=>{cur=b.dataset.t;$$('.tab').forEach(x=>x.classList.toggle('on',x===b));ids.forEach(k=>E[k].closest('.ed').classList.toggle('on',k===cur));info();sync(cur)});
ids.forEach(k=>{E[k].addEventListener('input',()=>{hl(k);info();save();if($('#live').checked&&k!=='js'){clearTimeout(tm);tm=setTimeout(run,600)}});
 E[k].addEventListener('keydown',key);['keyup','click'].forEach(v=>E[k].addEventListener(v,info));E[k].addEventListener('scroll',()=>sync(k))});
onWin('keydown',e=>{const c=e.ctrlKey||e.metaKey;const f=$('.pn.fs');if(e.key==='Escape'){$('#dm').classList.remove('on');if($('#gal.on'))gal(false);else if(f)fs(f,false)}if(c&&e.key==='Enter'){e.preventDefault();run()}if(c&&e.key==='s'){e.preventDefault();if(save())toast('Saved ✔');else{dlFile('codinglap-project.html',full());toast('Downloaded ✔')}}});
onDoc('fullscreenchange',()=>{const f=$('.pn.fs');if(!document.fullscreenElement&&f)fs(f,false);if(!document.fullscreenElement&&$('#gal.on'))gal(false)});
function add(t,m){const r=document.createElement('div');r.className='ln '+t;r.textContent=m;$('#log').append(r);$('#cnt').textContent=++n;$('#log').scrollTop=1e9}
onWin('message',e=>{const d=e.data;if(!d||!d.cl||e.source!==out.contentWindow)return;add(d.t,d.m)});

$('#run').onclick=run;
$$('.fsb').forEach(b=>b.onclick=()=>fs(b.closest('.pn')));$$('.xfs').forEach(b=>b.onclick=()=>fs(b.closest('.pn'),false));$('#erun').onclick=()=>{run();toast('Code executed ✔')};
$('#zi').onclick=()=>{z=Math.min(200,z+10);lay()};$('#zo').onclick=()=>{z=Math.max(30,z-10);lay()};$('#zr').onclick=()=>{z=100;lay()};
$$('#dev button').forEach(b=>b.onclick=()=>{$$('#dev button').forEach(x=>x.classList.toggle('on',x===b));w=+b.dataset.w;lay()});
$('#nt').onclick=()=>window.open(URL.createObjectURL(new Blob([build(1)],{type:'text/html'})),'_blank');
const nl=v=>v&&!v.endsWith('\n')?v+'\n':v;
const HEAD='<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>CodingLap Project</title>\n';
const files=()=>({'index.html':HEAD+'  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n'+nl(E.html.value)+'  <script src="script.js"><\/script>\n</body>\n</html>\n','style.css':nl(E.css.value),'script.js':nl(E.js.value)});
const full=()=>HEAD+'  <style>\n'+nl(E.css.value)+'  </style>\n</head>\n<body>\n'+nl(E.html.value)+'  <script>\n'+nl(E.js.value)+'  <\/script>\n</body>\n</html>\n';
const CT=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;return c>>>0});
const crc=u=>{let r=-1;for(const b of u)r=CT[(r^b)&255]^(r>>>8);return(r^-1)>>>0};
function zip(f){const e=new TextEncoder(),parts=[],cen=[];let off=0;
 for(const[n,d]of Object.entries(f)){const nb=e.encode(n),db=e.encode(d),c=crc(db);
  const h=new DataView(new ArrayBuffer(30));h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x0800,true);h.setUint16(12,33,true);h.setUint32(14,c,true);h.setUint32(18,db.length,true);h.setUint32(22,db.length,true);h.setUint16(26,nb.length,true);
  const g=new DataView(new ArrayBuffer(46));g.setUint32(0,0x02014b50,true);g.setUint16(4,20,true);g.setUint16(6,20,true);g.setUint16(8,0x0800,true);g.setUint16(14,33,true);g.setUint32(16,c,true);g.setUint32(20,db.length,true);g.setUint32(24,db.length,true);g.setUint16(28,nb.length,true);g.setUint32(42,off,true);
  parts.push(h.buffer,nb,db);cen.push(g.buffer,nb);off+=30+nb.length+db.length}
 const n=Object.keys(f).length,cs=cen.reduce((a,x)=>a+x.byteLength,0),z=new DataView(new ArrayBuffer(22));
 z.setUint32(0,0x06054b50,true);z.setUint16(8,n,true);z.setUint16(10,n,true);z.setUint32(12,cs,true);z.setUint32(16,off,true);
 return new Blob([...parts,...cen,z.buffer],{type:'application/zip'})}
function dlFile(name,data){const u=URL.createObjectURL(data instanceof Blob?data:new Blob([data],{type:'text/plain'})),a=document.createElement('a');a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),4000)}
const dm=$('#dm');
$('#dl').onclick=e=>{e.stopPropagation();dm.style.top=$('#dl').getBoundingClientRect().bottom+8+'px';dm.classList.toggle('on')};
onWin('click',()=>dm.classList.remove('on'));
dm.onclick=e=>{const b=e.target.closest('button');if(!b)return;const d=b.dataset.d,f=files();
 if(d==='all')dlFile('codinglap-project.html',full());else if(d==='zip')dlFile('codinglap-project.zip',zip(f));else{const n={html:'index.html',css:'style.css',js:'script.js'}[d];dlFile(n,f[n])}
 toast('Downloaded ✔')};
$('#cp').onclick=async()=>{try{await navigator.clipboard.writeText(E[cur].value)}catch(e){E[cur].select();document.execCommand('copy')}toast(cur.toUpperCase()+' code copied ✔')};
$('#cl').onclick=()=>{E[cur].value='';E[cur].dispatchEvent(new Event('input'));toast(cur.toUpperCase()+' cleared')};
$('#rs').onclick=()=>{ids.forEach(k=>set(k,D[k]));run();toast('Reset to default ✔')};
$('#fm').onclick=()=>setFz(-1);$('#fp').onclick=()=>setFz(1);
$('#live').checked=st.g('clLive')!=='0';$('#live').onchange=e=>st.s('clLive',e.target.checked?1:0);
$('#ch').onclick=()=>$('#conp').classList.toggle('cl');
$('#cc').onclick=e=>{e.stopPropagation();clearLog()};
let gc='All';
const cats=['All',...new Set(T.map(t=>t.c))];
$('#gchips').innerHTML=cats.map((c,i)=>'<button class="chip'+(i?'':' on')+'">'+c+'</button>').join('');
$$('.chip').forEach(b=>b.onclick=()=>{gc=b.textContent;$$('.chip').forEach(x=>x.classList.toggle('on',x===b));drawGal()});
function drawGal(){const q=$('#gq').value.toLowerCase(),g=$('#ggrid');g.innerHTML='';
 T.filter(t=>(gc==='All'||t.c===gc)&&(t.n+' '+t.d+' '+t.c).toLowerCase().includes(q)).forEach(t=>{const c=document.createElement('div');c.className='tc';c.tabIndex=0;
  c.innerHTML='<div class="th"><iframe sandbox="allow-scripts" tabindex="-1" title="Template preview"></iframe></div><div class="ti"><b>'+t.n+'</b><span class="cat">'+t.c+'</span><p>'+t.d+'</p></div>';
  c.querySelector('iframe').srcdoc=mk(t.html,t.css,t.js,1);
  const use=()=>{ids.forEach(k=>set(k,t[k]));gal(false);run();toast('Template loaded: '+t.n)};
  c.onclick=use;c.onkeydown=e=>{if(e.key==='Enter')use()};g.append(c)});
 if(!g.children.length)g.innerHTML='<p class="none">No templates found.</p>'}
function gal(on){const g=$('#gal');g.classList.toggle('on',on);R.classList.toggle('lock',on);
 if(on){gc='All';$('#gq').value='';$$('.chip').forEach((x,i)=>x.classList.toggle('on',!i));drawGal();try{const r=g.requestFullscreen&&g.requestFullscreen();r&&r.catch&&r.catch(()=>{})}catch(e){}}
 else{$('#ggrid').innerHTML='';try{if(document.fullscreenElement)document.exitFullscreen()}catch(e){}}}
$('#tpl').onclick=()=>gal(true);$('#gx').onclick=()=>gal(false);$('#gq').oninput=drawGal;

async function unzip(buf){const dv=new DataView(buf),u=new Uint8Array(buf),td=new TextDecoder(),o={};let e=u.length-22;
 while(e>=0&&dv.getUint32(e,true)!==0x06054b50)e--;if(e<0)throw new Error('zip');
 const n=dv.getUint16(e+10,true);let p=dv.getUint32(e+16,true);
 for(let i=0;i<n;i++){const m=dv.getUint16(p+10,true),cs=dv.getUint32(p+20,true),nl=dv.getUint16(p+28,true),xl=dv.getUint16(p+30,true),cl=dv.getUint16(p+32,true),lo=dv.getUint32(p+42,true),nm=td.decode(u.subarray(p+46,p+46+nl));p+=46+nl+xl+cl;
  if(!/\.(html?|css|js|txt)$/i.test(nm)||/__MACOSX/.test(nm))continue;
  const ds=lo+30+dv.getUint16(lo+26,true)+dv.getUint16(lo+28,true);let d=u.subarray(ds,ds+cs);
  if(m===8)d=new Uint8Array(await new Response(new Blob([d]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());else if(m!==0)continue;
  o[nm]=td.decode(d)}
 return o}
function applyFiles(F){const base=n=>(n||'').split('?')[0].split('/').pop().toLowerCase(),by={};
 Object.keys(F).forEach(k=>by[base(k)]=F[k]);
 const ks=Object.keys(by),hn=ks.includes('index.html')?'index.html':ks.find(k=>/\.html?$/.test(k)),all=x=>ks.filter(k=>k.endsWith(x)).map(k=>by[k]).join('\n');
 let html='',css='',js='';
 if(hn){const d=new DOMParser().parseFromString(by[hn],'text/html');
  d.querySelectorAll('link[rel=stylesheet]').forEach(l=>{const f=by[base(l.getAttribute('href'))];if(f!==undefined){css+=f+'\n';l.remove()}});
  d.querySelectorAll('style').forEach(x=>{css+=x.textContent+'\n';x.remove()});
  d.querySelectorAll('script').forEach(x=>{const r=x.getAttribute('src'),f=r?by[base(r)]:x.textContent;if(f!==undefined){js+=f+'\n';x.remove()}});
  const hd=[...d.head.querySelectorAll('link[rel=stylesheet],script[src]')].map(x=>x.outerHTML).join('\n');
  html=(hd?hd+'\n':'')+d.body.innerHTML.trim()+'\n'}
 if(!css.trim())css=all('.css');if(!js.trim())js=all('.js');
 if(hn)set('html',html);
 if(hn||css.trim())set('css',css.trim()?css.trim()+'\n':'');
 if(hn||js.trim())set('js',js.trim()?js.trim()+'\n':'');
 return !!(hn||css.trim()||js.trim())}
$('#edl').onclick=()=>{const n={html:'index.html',css:'style.css',js:'script.js'}[cur];dlFile(n,files()[n]);toast(n+' downloaded ✔')};
$('#auto').onchange=e=>{if(!e.target.checked){try{ids.forEach(k=>localStorage.removeItem(k+'Code'))}catch(x){}}st.s('clAuto',e.target.checked?1:0);toast(e.target.checked?'Auto-save on':'Auto-save off. Saved copy removed from this browser. Use Download to keep your code.');save()};
$('#sv').onclick=()=>{if($('#sv').textContent.startsWith('⚠'))$('#dl').click()};
$('#fmt').onclick=()=>{try{set(cur,{html:fhtml,css:fcss,js:fjs}[cur](E[cur].value));toast(cur.toUpperCase()+' formatted ✔')}catch(e){toast('Could not format this code')}};
$('#imp').onclick=()=>$('#file').click();
$('#file').onchange=async e=>{const fl=[...e.target.files];e.target.value='';if(!fl.length)return;const F={};let ok=0;
 try{for(const f of fl){const x=f.name.split('.').pop().toLowerCase();
  if(x==='zip')Object.assign(F,await unzip(await f.arrayBuffer()));
  else if(/^(html?|css|js)$/.test(x))F[f.name]=await f.text();
  else{set(cur,await f.text());ok=1}}
  if(Object.keys(F).length&&applyFiles(F))ok=1}catch(err){ok=0}
 if(ok){run();toast('Imported ✔')}else toast('Could not import: unsupported or damaged file')};
$('#rin').onkeydown=e=>{if(e.key!=='Enter')return;const c=e.target.value.trim();if(!c)return;e.target.value='';add('log','› '+c);try{const r=out.contentWindow.eval(c);add('info','← '+(r&&typeof r==='object'?JSON.stringify(r):String(r)))}catch(x){add('error',String(x))}};
const setStack=on=>{$('main').classList.toggle('stack',on);$('#lyt use').setAttribute('href',on?'#cdl-i-rows':'#cdl-i-cols')};
$('#lyt').onclick=()=>{const on=!$('main').classList.contains('stack');setStack(on);st.s('clLay',on?1:0)};
setStack(st.g('clLay')==='1');

/* ── Features integration: Back + Theme (host app ke saath sync) ── */
$('#bk').onclick=()=>host.back();
$('#th').onclick=()=>host.toggleTheme();
$('#th use').setAttribute('href',host.getTheme()==='dark'?'#cdl-i-sun':'#cdl-i-moon');

lay();ids.forEach(hl);info();run();

return()=>{
 offs.forEach(f=>f());
 clearTimeout(tm);
 try{if(document.fullscreenElement)document.exitFullscreen()}catch(e){}
 R.classList.remove('lock');
 R.innerHTML='';
};
}

export default function CodingLab({ theme = 'dark', onTheme, onBack }) {
  const rootRef = useRef(null);
  const cb = useRef({});
  cb.current = { theme, onTheme, onBack };

  useEffect(() => mountLab(rootRef.current, {
    back: () => cb.current.onBack && cb.current.onBack(),
    toggleTheme: () => cb.current.onTheme && cb.current.onTheme(),
    getTheme: () => cb.current.theme,
  }), []);

  useEffect(() => {
    const u = rootRef.current && rootRef.current.querySelector('#th use');
    if (u) u.setAttribute('href', theme === 'dark' ? '#cdl-i-sun' : '#cdl-i-moon');
  }, [theme]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <>
      <style>{CSS}</style>
      <div className="cdlab" ref={rootRef} data-theme={theme} />
    </>,
    document.body
  );
}