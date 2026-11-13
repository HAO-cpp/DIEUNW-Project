document.addEventListener("DOMContentLoaded", () => {
	const feed = document.getElementById("announcement-feed");
	const composer = document.getElementById("announcement-composer");
	const form = document.getElementById("announcement-form");
	let currentUser = null;
	let publishableClubs = [];

	async function api(url, options = {}) {
		const response = await fetch(url, { credentials: "same-origin", ...options });
		const data = await response.json();
		if (!response.ok) throw new Error(data.error || "Không thể hoàn tất yêu cầu.");
		return data;
	}

	function element(tag, className, text) {
		const node = document.createElement(tag);
		if (className) node.className = className;
		if (text !== undefined) node.textContent = text;
		return node;
	}

	function renderPost(post, index) {
		const article = element("article", "announcement-post");
		article.style.setProperty("--club-color", post.tagColor);
		article.style.setProperty("--post-index", String(index));
		const header = element("header", "announcement-post-header");
		if (post.clubLogo) {
			const logo = element("img", "announcement-club-logo");
			logo.src = post.clubLogo;
			logo.alt = "";
			header.append(logo);
		} else {
			header.append(element("span", "announcement-club-monogram", post.clubName.slice(0, 1).toUpperCase()));
		}
		const identity = element("div", "announcement-post-identity");
		identity.append(element("h2", "", post.clubName), element("p", "", `${post.author.name} · ${new Date(post.createdAt).toLocaleString("vi-VN")}`));
		header.append(identity);
		header.append(element("span", "announcement-label", "THÔNG BÁO"));
		article.append(header, element("p", "announcement-post-content", post.content));
		return article;
	}

	async function loadFeed() {
		const { posts } = await api("/api/announcements");
		feed.replaceChildren(...posts.map(renderPost));
		if (!posts.length) feed.append(element("p", "clubs-empty", "Chưa có thông báo nào. Các cập nhật của CLB sẽ xuất hiện tại đây."));
	}

	form.addEventListener("submit", async event => {
		event.preventDefault();
		const button = form.querySelector("button[type='submit']");
		const status = document.getElementById("announcement-status");
		button.disabled = true;
		status.textContent = "Đang đăng...";
		try {
			const clubId = document.getElementById("announcement-club").value;
			await api(`/api/clubs/${encodeURIComponent(clubId)}/posts`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ content: document.getElementById("announcement-content").value.trim() })
			});
			form.reset();
			status.textContent = "Thông báo đã được đăng.";
			await loadFeed();
		} catch (error) {
			status.textContent = error.message;
		} finally {
			button.disabled = false;
		}
	});

	Promise.all([api("/api/auth/me"), api("/api/clubs")])
		.then(([auth, clubData]) => {
			currentUser = auth.user;
			publishableClubs = clubData.clubs.filter(club => club.status === "approved"
				&& (currentUser?.isAdmin || club.manager?.id === currentUser?.id));
			if (publishableClubs.length) {
				const select = document.getElementById("announcement-club");
				for (const club of publishableClubs) {
					const option = document.createElement("option");
					option.value = club.id;
					option.textContent = club.name;
					select.append(option);
				}
				composer.hidden = false;
			}
			return loadFeed();
		})
		.catch(error => {
			document.getElementById("announcement-feed-status").textContent = error.message;
		});
});
