const PROJECT_ICON_MAP = {
	godot: "nf-dev-godot",
	matlab: "nf-md-math_integral",
	javascript: "nf-md-language_javascript",
	python: "nf-md-language_python",
	csharp: "nf-md-language_csharp",
	html: "nf-md-language_html5",
	css: "nf-md-language_css3",
	unity: "nf-custom-unity",
	cpp: "nf-md-language_cpp",
}
document.addEventListener("DOMContentLoaded", () => {

	const el = document.getElementById("dateLabel");
	const now = new Date();
	const months = [
		"January", "February", "March", "April", "May", "June", "July",
		"August", "September", "October", "November", "December"
	];
	el.textContent = `${months[now.getMonth()].toUpperCase()} ${now.getDate()}`;

	document.getElementById("homebtn").onclick = () => {
		window.location.href = "/";
	};
	document.querySelectorAll(".project-title").forEach(el => {
		const techList = el.dataset.tech?.split(",").map(t => t.trim()) || [];
		let iconsHTML = "";

		techList.forEach(tech => {
			const cls = PROJECT_ICON_MAP[tech.toLowerCase()];
			if (cls) {
				iconsHTML += `<i class="project-icon ${cls}"></i>`;
			}
		});

		if (iconsHTML.length > 0) {
			el.innerHTML = `${el.innerHTML} ${iconsHTML}`;
		}
	});

	const themeBtn = document.getElementById("themeToggle");
	const savedTheme = localStorage.getItem("theme");

	if (savedTheme === "dark") {
		document.body.classList.add("dark");
	}

	updateThemeIcon();

	themeBtn?.addEventListener("click", () => {
		document.body.classList.toggle("dark");

		const isDark = document.body.classList.contains("dark");
		localStorage.setItem("theme", isDark ? "dark" : "light");

		updateThemeIcon();
	});
});

const savedTheme = localStorage.getItem("theme");

if (!savedTheme) {
	const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
	if (prefersDark) {
		document.body.classList.add("dark");
		localStorage.setItem("theme", "dark");
	}
}

function updateThemeIcon() {
	const themeBtn = document.getElementById("themeToggle");
	if (!themeBtn) return;

	themeBtn.textContent =
		document.body.classList.contains("dark") ? "[ ☉ ]" : "[ ☾ ]";
};

const monitor = document.getElementById("monitor");
const monitorMedia = document.getElementById("monitorMedia");
const monitorCaption = document.getElementById("monitorCaption");
const projectData = {
	autogrotto: {
		media: [
			"assets/games/autogrotto/autogrotto_mine.webp",
			"assets/games/autogrotto/autogrotto_scan.webp",
			"assets/games/autogrotto/bot_builder.webp",
		],
		caption: "AutoGrotto — Procedural cave mining and automation."
	},

	samplechop: {
		media: [
			"assets/games/samplechop/sampler_demo.webp",
		],
		caption: "SampleChop — Minimal sampler-based rhythm game."
	},

	neurobeat: {
		media: [
			"assets/games/neurobeat/neurobeat_main_menu.webp",
			"assets/games/neurobeat/neurobeat_gameplay.webp",
			"assets/games/neurobeat/bio_signals.webp",
		],
		caption: "NeuroBeat — Multimodal BCI rhythm game prototype."
	}
};
let currentProject = null;
let currentIndex = 0;

function openProject(key) {
	const data = projectData[key];
	if (!data || data.media.length === 0) return;

	currentProject = data;
	currentIndex = 0;

	showMedia(currentIndex);
	monitorCaption.textContent = data.caption;

	monitor.classList.add("open");
}

function showMedia(i) {
	monitorMedia.src = currentProject.media[i];
}

document.getElementById("monitorPrev").onclick = () => {
	if (!currentProject) return;
	currentIndex = (currentIndex - 1 + currentProject.media.length) % currentProject.media.length;
	showMedia(currentIndex);
};

document.getElementById("monitorNext").onclick = () => {
	if (!currentProject) return;
	currentIndex = (currentIndex + 1) % currentProject.media.length;
	showMedia(currentIndex);
};

document.getElementById("monitorClose").onclick = () => {
	monitor.classList.remove("open");
};
