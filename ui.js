const urlInput = document.getElementById("url");
const toastEl = document.getElementById("toast");

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  setTimeout(() => toastEl.classList.remove("show"), 1600);
}

document.getElementById("go").onclick = () => window.api.go(urlInput.value);
document.getElementById("back").onclick = () => window.api.back();
document.getElementById("forward").onclick = () => window.api.forward();
document.getElementById("reload").onclick = () => window.api.reload();
document.getElementById("reader").onclick = () => window.api.extractReader();

urlInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") window.api.go(urlInput.value);
});

window.api.onUrl((u) => {
  if (typeof u === "string" && u.length > 0) urlInput.value = u;
});

window.api.onToast((msg) => showToast(msg));