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

const REVEAL_SELECTOR = ".name span, h1, h2, h3, h4, p, a, .corner-btn, .corner-label, .mini-meta, .icon-label, .icon-meta";

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


	// custom cursor: a corner bracket whose tip sits on the mouse (styles.css changes it over clickable
	// things); a touch turns it off so it never hangs around on phones
	const cursor = document.getElementById("cursor");
	if (cursor) {
		let touched = false;  // taps fire fake mousemoves too, so once touched it stays off
		addEventListener("mousemove", (e) => {
			if (touched) return;
			cursor.style.left = e.clientX + "px";
			cursor.style.top = e.clientY + "px";
			cursor.classList.add("on");
		}, { passive: true });
		addEventListener("touchstart", () => { touched = true; cursor.classList.remove("on"); }, { passive: true });
	}

	// desktop icon thumbnails: a random crop of data-src drawn into a 24px canvas, CSS blows it up pixelated
	document.querySelectorAll(".icon canvas[data-src]").forEach(c => {
		const img = new Image();
		img.onload = () => {
			const s = Math.min(img.width, img.height) / 3;
			const x = (img.width - s) * (0.3 + Math.random() * 0.4), y = (img.height - s) * (0.3 + Math.random() * 0.4);
			c.getContext("2d").drawImage(img, x, y, s, s, 0, 0, 24, 24);
		};
		img.src = c.dataset.src;
	});

	// opening a folder scrambles its contents in
	document.querySelectorAll(".icon").forEach(icon => {
		const panel = icon.querySelector(".panel");
		const scramble = () => getRevealEls()
			.filter(el => panel.contains(el))
			.forEach((el, i) => scrambleText(el, el._revealText ?? el.textContent, SCRAMBLE_MS, i * 15));
		icon.addEventListener("mouseenter", scramble);
		icon.addEventListener("focusin", (e) => {
			if (!icon.matches(":hover") && !icon.contains(e.relatedTarget)) scramble();
		});
	});

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

	// UI blips: tiny square-wave beeps when pointing at / clicking something, off until [ ♪ ] turns them on.
	// The browser only lets audio start after a click, so the first hovers after a reload stay silent until then.
	const soundBtn = document.getElementById("soundbtn");
	if (soundBtn) {
		let audio = null, soundOn = false;
		try { soundOn = localStorage.getItem("sound") === "1"; } catch {}
		const blip = (freq, len = 0.04) => {
			if (!soundOn) return;
			audio ??= new AudioContext();
			if (audio.state === "suspended") audio.resume();
			const osc = audio.createOscillator(), gain = audio.createGain(), t = audio.currentTime;
			osc.type = "square";
			osc.frequency.value = freq;
			gain.gain.setValueAtTime(0.03, t);
			gain.gain.exponentialRampToValueAtTime(0.0001, t + len);
			osc.connect(gain).connect(audio.destination);
			osc.start(t);
			osc.stop(t + len);
		};
		const showSound = () => soundBtn.setAttribute("aria-pressed", soundOn);
		showSound();
		soundBtn.addEventListener("click", () => {
			soundOn = !soundOn;
			try { localStorage.setItem("sound", soundOn ? "1" : "0"); } catch {}
			showSound();
		});
		const CLICKABLE = "a, button, .icon, .project-title";
		document.addEventListener("pointerover", (e) => {
			const el = e.target.closest(CLICKABLE);
			if (el && !el.contains(e.relatedTarget)) blip(1320);
		});
		document.addEventListener("click", (e) => { if (e.target.closest(CLICKABLE)) blip(660, 0.08); });
	}

	revealAll();
});

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

// the monitor only exists on the index page
if (monitor) {
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
}
