// tweak
const SCRAMBLE_MS = 300;
const SCRAMBLE_GLYPHS = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏⠿⡿▪▫■□◇◆◼◻▣▤▥▦▧▨▩";

const MONTHS_EN = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTHS_JA = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"];

const REVEAL_SELECTOR = ".name span, h1, h2, h3, h4, p, a, .corner-btn, .corner-label, .mini-meta, .icon-label, .icon-meta";

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

function getRevealEls() {
	return [...document.querySelectorAll(REVEAL_SELECTOR)]
		.filter(el => el.children.length === 0 && el.textContent.trim().length > 0);
}

// Scrambles every visible text in, the whole page within ~0.7s however many there are. Hidden ones
// (closed windows) just get their text, so a language switch still updates them.
function revealAll(updates = new Map(), stagger = 25) {
	const list = getRevealEls();
	updates.forEach((_, el) => { if (!list.includes(el)) list.push(el); });
	const shown = list.filter(el => el.getClientRects().length > 0);
	const step = Math.min(stagger, 400 / Math.max(1, shown.length));
	let k = 0;
	list.forEach(el => {
		let text;
		if (updates.has(el)) {
			text = updates.get(el);
			el._revealText = text;
		} else {
			if (el._revealText === undefined) el._revealText = el.textContent;
			text = el._revealText;
		}
		if (shown.includes(el)) scrambleText(el, text, SCRAMBLE_MS, k++ * step);
		else { el._scrambleGen = (el._scrambleGen || 0) + 1; el.textContent = text; }
	});
	document.body.classList.add("revealed");
}

// scramble everything inside one element (an opened window) back to its text
function scrambleIn(root) {
	const els = getRevealEls().filter(el => root.contains(el));
	const step = Math.min(15, 250 / Math.max(1, els.length));
	els.forEach((el, i) => scrambleText(el, el._revealText ?? el.textContent, SCRAMBLE_MS, i * step));
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

	// hovering (or tabbing to) a folder scrambles its grey meta line into a one-line peek, and back on leave
	document.querySelectorAll(".icon-meta[data-peek]").forEach(meta => {
		const icon = meta.closest(".icon");
		const peek = () => scrambleText(meta, document.body.classList.contains("lang-ja") ? meta.dataset.peekJa : meta.dataset.peek, SCRAMBLE_MS);
		const unpeek = () => scrambleText(meta, meta._revealText ?? meta.textContent, SCRAMBLE_MS);
		icon.addEventListener("pointerenter", peek);
		icon.addEventListener("focus", peek);
		icon.addEventListener("pointerleave", unpeek);
		icon.addEventListener("blur", unpeek);
	});

	// clicking a folder opens its window beside the folder list, vertically centred on it (kept on screen).
	// It's a modal <dialog>: Esc, the focus trap and returning focus come free; styles.css dims the rest.
	const folders = document.querySelector(".folders");
	document.querySelectorAll(".icon[data-open]").forEach(btn => {
		const dlg = document.getElementById(btn.dataset.open);
		btn.addEventListener("click", () => {
			const r = folders.getBoundingClientRect();
			dlg.style.setProperty("--left", r.right + 32 + "px");
			dlg.showModal();
			const half = dlg.offsetHeight / 2;
			dlg.style.setProperty("--top", Math.min(Math.max(r.top + r.height / 2, half + 16), innerHeight - half - 16) + "px");
			btn.setAttribute("aria-expanded", "true");
			scrambleIn(dlg);
		});
		dlg.addEventListener("close", () => btn.setAttribute("aria-expanded", "false"));
		// a click on the backdrop lands on the dialog itself, outside its box (keyboard clicks target the button inside)
		dlg.addEventListener("click", (e) => {
			if (e.target !== dlg) return;
			const b = dlg.getBoundingClientRect();
			if (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom) dlg.close();
		});
	});

	// projects window: a screenshot opens that project's gallery in place of the cards
	const gallery = document.querySelector(".gallery");
	if (gallery) {
		const dlg = gallery.closest("dialog"), cards = dlg.querySelector(".cards");
		const img = gallery.querySelector("img"), caption = gallery.querySelector(".gallery-caption"), count = gallery.querySelector(".gallery-count");
		const steps = gallery.querySelectorAll("[data-step]");
		let shots = [], at = 0, opener = null;
		const show = () => { img.src = shots[at]; count.textContent = `${at + 1} / ${shots.length}`; };
		const step = (d) => { at = (at + d + shots.length) % shots.length; show(); };
		dlg.querySelectorAll("[data-gallery]").forEach(b => b.addEventListener("click", () => {
			const p = projectData[b.dataset.gallery];
			shots = p.media; at = 0; opener = b;
			caption.textContent = p.caption;
			steps.forEach(s => s.hidden = shots.length < 2);
			show();
			cards.hidden = true;
			gallery.hidden = false;
			gallery.querySelector(".gallery-back").focus();
		}));
		steps.forEach(b => b.addEventListener("click", () => step(+b.dataset.step)));
		const back = () => {
			if (gallery.hidden) return;
			gallery.hidden = true;
			cards.hidden = false;
			opener?.focus();
		};
		gallery.querySelector(".gallery-back").addEventListener("click", back);
		dlg.addEventListener("close", back);
		dlg.addEventListener("keydown", (e) => {
			if (gallery.hidden || shots.length < 2) return;
			if (e.key === "ArrowLeft") step(-1);
			if (e.key === "ArrowRight") step(1);
		});
	}

	document.getElementById("homebtn").onclick = () => {
		window.location.href = "/";
	};

	revealAll();
});
