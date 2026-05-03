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
// tweak
const SCRAMBLE_MS = 600;
const SCRAMBLE_GLYPHS = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏⠿⡿▪▫■□◇◆◼◻▣▤▥▦▧▨▩";

const MONTHS_EN = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTHS_JA = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"];

function renderDate(lang) {
	const el = document.getElementById("dateLabel");
	if (!el) return;
	const now = new Date();
	if (lang === "ja") el.textContent = `${MONTHS_JA[now.getMonth()]} ${now.getDate()}日`;
	else el.textContent = `${MONTHS_EN[now.getMonth()].toUpperCase()} ${now.getDate()}`;
}

const REVEAL_SELECTOR = ".name span, h1, h2, h3, h4, p, a, .corner-btn, .corner-label, .mini-meta";

function getRevealEls() {
	return [...document.querySelectorAll(REVEAL_SELECTOR)]
		.filter(el => el.children.length === 0 && el.textContent.trim().length > 0);
}

function revealAll(updates = new Map(), stagger = 25) {
	const list = getRevealEls();
	updates.forEach((_, el) => { if (!list.includes(el)) list.push(el); });
	list.forEach((el, i) => {
		let text;
		if (updates.has(el)) {
			text = updates.get(el);
			el._revealText = text;
		} else {
			if (el._revealText === undefined) el._revealText = el.textContent;
			text = el._revealText;
		}
		scrambleText(el, text, SCRAMBLE_MS, i * stagger);
	});
	document.body.classList.add("revealed");
}

function applyLang(lang, animate = false) {
	document.body.classList.toggle("lang-ja", lang === "ja");
	const updates = new Map();
	document.querySelectorAll("[data-ja]").forEach(el => {
		if (!el.dataset.en) el.dataset.en = el.textContent.trim();
		const newText = lang === "ja" ? el.dataset.ja : el.dataset.en;
		if (animate) updates.set(el, newText);
		else el.textContent = newText;
	});
	const dateEl = document.getElementById("dateLabel");
	const now = new Date();
	const dateText = lang === "ja"
		? `${MONTHS_JA[now.getMonth()]} ${now.getDate()}日`
		: `${MONTHS_EN[now.getMonth()].toUpperCase()} ${now.getDate()}`;
	if (dateEl) {
		if (animate) updates.set(dateEl, dateText);
		else dateEl.textContent = dateText;
	}
	const btn = document.getElementById("langbtn");
	const btnText = lang === "ja" ? "[ EN ]" : "[ JP ]";
	if (btn) {
		if (animate) updates.set(btn, btnText);
		else btn.textContent = btnText;
	}
	localStorage.setItem("lang", lang);
	if (animate) revealAll(updates);
}

function makeGlyphs(text) {
	let out = "";
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		out += (ch === " " || ch === "\n") ? ch : SCRAMBLE_GLYPHS[(Math.random() * SCRAMBLE_GLYPHS.length) | 0];
	}
	return out;
}

function scrambleText(el, finalText, duration, startDelay = 0) {
	if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
		el.textContent = finalText;
		return;
	}
	const gen = (el._scrambleGen || 0) + 1;
	el._scrambleGen = gen;
	el.textContent = makeGlyphs(finalText);
	const start = performance.now() + startDelay;
	const len = finalText.length;
	const lockTimes = Array.from({ length: len }, (_, i) =>
		(i / len) * duration * 0.7 + Math.random() * duration * 0.3
	);
	const tick = (now) => {
		if (el._scrambleGen !== gen) return;
		const t = now - start;
		let out = "";
		for (let i = 0; i < len; i++) {
			const ch = finalText[i];
			if (ch === " " || ch === "\n") out += ch;
			else if (t >= 0 && t >= lockTimes[i]) out += ch;
			else out += SCRAMBLE_GLYPHS[(Math.random() * SCRAMBLE_GLYPHS.length) | 0];
		}
		el.textContent = out;
		if (t < duration) requestAnimationFrame(tick);
		else el.textContent = finalText;
	};
	requestAnimationFrame(tick);
}

document.addEventListener("DOMContentLoaded", () => {

	const initialLang = localStorage.getItem("lang") === "ja" ? "ja" : "en";
	applyLang(initialLang);

	document.getElementById("langbtn")?.addEventListener("click", () => {
		const next = document.body.classList.contains("lang-ja") ? "en" : "ja";
		applyLang(next, true);
	});


	// tweak
	const SPRITE_URL    = "assets/photos/brain.png";
	const SPRITE_FRAMES = 43;
	const FRAME_W       = 571;
	const FRAME_H       = 320;
	const SCRUB_EASE    = 0.12;
	const IDLE_SPIN     = 0.18;
	const FRAME_OFFSET  = 21;

	const heroImg = document.querySelector(".hero-photo img");
	if (heroImg && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
		const sprite = new Image();
		sprite.onload = () => {
			const canvas = document.createElement("canvas");
			canvas.width = FRAME_W;
			canvas.height = FRAME_H;
			canvas.className = heroImg.className;
			heroImg.replaceWith(canvas);

			const ctx = canvas.getContext("2d");
			let target = FRAME_OFFSET, current = FRAME_OFFSET, mouseSeen = false, last = performance.now();

			addEventListener("mousemove", (e) => {
				mouseSeen = true;
				const nx = Math.max(0, Math.min(1, e.clientX / innerWidth));
				target = (nx * (SPRITE_FRAMES - 1) + FRAME_OFFSET) % SPRITE_FRAMES;
			}, { passive: true });

			const draw = (now) => {
				const dt = Math.min((now - last) / 16.67, 3); last = now;
				if (!mouseSeen) target = (target + IDLE_SPIN * dt) % SPRITE_FRAMES;
				let diff = target - current;
				if (diff > SPRITE_FRAMES / 2) diff -= SPRITE_FRAMES;
				else if (diff < -SPRITE_FRAMES / 2) diff += SPRITE_FRAMES;
				current = (current + diff * SCRUB_EASE + SPRITE_FRAMES) % SPRITE_FRAMES;
				const idx = Math.floor(current) % SPRITE_FRAMES;
				ctx.clearRect(0, 0, FRAME_W, FRAME_H);
				ctx.drawImage(sprite, idx * FRAME_W, 0, FRAME_W, FRAME_H, 0, 0, FRAME_W, FRAME_H);
				requestAnimationFrame(draw);
			};
			requestAnimationFrame(draw);
		};
		sprite.src = SPRITE_URL;
	}

	const coords = document.getElementById("coordsLabel");
	if (coords) {
		const pad = (n) => String(n | 0).padStart(4, "0");
		addEventListener("mousemove", (e) => {
			coords.textContent = `[ x:${pad(e.clientX)} y:${pad(e.clientY)} ]`;
		}, { passive: true });
	}

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

	revealAll();
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
