const langBtn = document.getElementById("langBtn");
const bio = document.getElementById("bio");

let lang = "EN";

langBtn.onclick = () => {
	lang = lang === "EN" ? "JP" : "EN";
	langBtn.textContent = `[ ${lang} ]`;

	if (lang === "JP") {
		bio.textContent =
			"test";
	} else {
		bio.textContent =
			"test";
	}
};


const ctx = canvas.getContext("2d");

function resize() {
	canvas.width = window.innerWidth;
	canvas.height = window.innerHeight;
}
resize();
window.onresize = resize;

