import "./style.css";
import { Game } from "./game";

const root = document.getElementById("app")!;
try {
  new Game(root);
} catch (e) {
  root.innerHTML = `<div style="padding:24px;font-family:sans-serif;color:#dce1e6;line-height:1.7">這個瀏覽器無法啟動遊戲（需要 WebGL）。<br><small style="color:#8e9bab">${String(e)}</small></div>`;
}
