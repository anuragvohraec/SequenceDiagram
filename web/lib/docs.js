import{S as e}from"./SequenceDiagram-0c375c55.js";const t=[];(()=>{const r=new e;r.set("A -> B\nB -> A",{render:!1}),r.dom().setAttribute("class","sequence-diagram"),document.getElementById("hold1").appendChild(r.dom()),r.setHighlight(1),t.push(r)})();const r=document.getElementsByClassName("example");for(let o=0;o<r.length;++o){const n=r[o],s=new e(n.textContent,{render:!1});s.dom().setAttribute("class","example-diagram"),n.parentNode.insertBefore(s.dom(),n),t.push(s)}e.renderAll(t),e.convertAll(),import("./codemirror-docs-c118d583.js").then((({CodeMirror:t})=>{e.registerCodeMirrorMode(t),t.colorize()}));
