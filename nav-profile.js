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

	window.updateNavAvatar = updateNavAvatar;
	updateNavAvatar();
	window.addEventListener("storage", event => {
		if (event.key === "dieuNwUser") updateNavAvatar();
	});
})();