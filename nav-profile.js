const originalFetch = window.fetch;
window.fetch = function(url, options = {}) {
	if (typeof url === "string" && url.includes("dieunw.onrender.com")) {
		const token = localStorage.getItem("session_token");
		if (token) {
			const nextOptions = { ...options };
			if (nextOptions.headers instanceof Headers) {
				const headers = new Headers(nextOptions.headers);
				if (!headers.has("Authorization")) {
					headers.set("Authorization", `Bearer ${token}`);
				}
				nextOptions.headers = headers;
			} else {
				nextOptions.headers = {
					...(nextOptions.headers || {}),
					...(nextOptions.headers?.Authorization ? {} : { "Authorization": `Bearer ${token}` })
				};
			}
			return originalFetch(url, nextOptions);
		}
	}
	return originalFetch(url, options);
};

(() => {
	const fallbackAvatar = "./DIEU.png";

	function getSavedUser() {
		try {
			return JSON.parse(localStorage.getItem("dieuNwUser") || "null");
		} catch {
			return null;
		}
	}

	function updateNavAvatar(user = getSavedUser()) {
		const avatarUrl = typeof user?.avatar === "string" && user.avatar.trim()
			? user.avatar.trim()
			: fallbackAvatar;
		const label = user?.name ? `Trang cá nhân của ${user.name}` : "Trang cá nhân";

		document.querySelectorAll(".nav-avatar-link").forEach(link => {
			const image = link.querySelector(".nav-user-avatar");
			if (!image) return;

			link.setAttribute("aria-label", label);
			link.title = label;
			image.src = avatarUrl;
			image.onerror = () => {
				image.onerror = null;
				image.src = fallbackAvatar;
			};
		});
	}

	function initCompactNavbar() {
		document.querySelectorAll("header.navbar").forEach((navbar, idx) => {
			if (navbar.dataset.compactNavReady === "1") return;
			navbar.dataset.compactNavReady = "1";

			const navMenu = navbar.querySelector(".nav-menu");
			const navRight = navbar.querySelector(".nav-right");
			const avatarLink = navbar.querySelector(".nav-avatar-link");
			const navLeft = navbar.querySelector(".nav-left");
			if (!navMenu || !navLeft) return;

			const menuId = navMenu.id || `dieunw-nav-dropdown-${idx}`;
			navMenu.id = menuId;
			navMenu.classList.add("nav-dropdown-panel");
			navMenu.hidden = true;

			const dock = document.createElement("div");
			dock.className = "nav-corner-dock";

			const toggleBtn = document.createElement("button");
			toggleBtn.type = "button";
			toggleBtn.className = "nav-brand-toggle";
			toggleBtn.setAttribute("aria-expanded", "false");
			toggleBtn.setAttribute("aria-controls", menuId);
			toggleBtn.setAttribute("aria-label", "Mở menu điều hướng DIEUNW");
			toggleBtn.title = "Mở / đóng menu DIEUNW";

			const iconImg = document.createElement("img");
			iconImg.src = "./DIEU.png";
			iconImg.alt = "DIEUNW";
			iconImg.className = "nav-brand-icon";

			const caret = document.createElement("span");
			caret.className = "nav-brand-caret";
			caret.setAttribute("aria-hidden", "true");
			caret.textContent = "☰";

			toggleBtn.append(iconImg, caret);
			dock.append(toggleBtn);

			if (avatarLink) {
				dock.append(avatarLink);
			}

			navbar.replaceChildren(dock, navMenu);
			if (navRight) navRight.remove();

			function setOpen(open) {
				toggleBtn.setAttribute("aria-expanded", String(open));
				navbar.classList.toggle("nav-open", open);
				navMenu.hidden = !open;
			}

			toggleBtn.addEventListener("click", event => {
				event.stopPropagation();
				setOpen(navMenu.hidden);
			});

			navMenu.querySelectorAll("a.nav-item").forEach(item => {
				item.addEventListener("click", () => setOpen(false));
			});

			document.addEventListener("click", event => {
				if (!navMenu.hidden && !navbar.contains(event.target)) {
					setOpen(false);
				}
			});

			document.addEventListener("keydown", event => {
				if (event.key === "Escape" && !navMenu.hidden) {
					setOpen(false);
					toggleBtn.focus();
				}
			});
		});

		updateNavAvatar();
	}

	window.updateNavAvatar = updateNavAvatar;

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", initCompactNavbar);
	} else {
		initCompactNavbar();
	}

	window.addEventListener("storage", event => {
		if (event.key === "dieuNwUser") updateNavAvatar();
	});
})();