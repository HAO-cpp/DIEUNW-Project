document.addEventListener("DOMContentLoaded", () => {
	const API_BASE = "https://dieunw.onrender.com";
	const list = document.getElementById("friends-list");
	const searchInput = document.getElementById("friends-search-input");
	const status = document.getElementById("friends-status");
	const filterButtons = [...document.querySelectorAll("[data-friends-filter]")];
	const authModal = document.getElementById("friends-auth-modal");
	const authMessage = document.getElementById("friends-auth-message");
	const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

	let users = [];
	let currentUser = null;
	let lastAuthTrigger = null;
	let activeFilter = location.hash === "#messages" ? "friends" : "discover";

	function getAuthHeaders(extra = {}) {
		let token = "";
		try {
			token = localStorage.getItem("session_token")
				|| localStorage.getItem("dieuNwToken")
				|| JSON.parse(localStorage.getItem("dieuNwUser") || "{}").token
				|| "";
		} catch {
			token = localStorage.getItem("session_token") || localStorage.getItem("dieuNwToken") || "";
		}
		return token ? { ...extra, Authorization: `Bearer ${token}` } : { ...extra };
	}

	function setStatus(message, isError = false) {
		status.textContent = message;
		status.classList.toggle("error", isError);
	}

	function openAuthPrompt(action) {
		lastAuthTrigger = document.activeElement;
		authMessage.textContent = action === "message"
			? "Đăng nhập hoặc đăng ký để nhắn tin với bạn học."
			: "Đăng nhập hoặc đăng ký để gửi lời mời kết bạn.";
		authModal.hidden = false;
		document.getElementById("friends-auth-close").focus();
	}

	function closeAuthPrompt() {
		authModal.hidden = true;
		lastAuthTrigger?.focus();
		lastAuthTrigger = null;
	}

	async function fetchUsers() {
		const response = await fetch(`${API_BASE}/api/users`, {
			credentials: "include",
			headers: getAuthHeaders()
		});
		if (!response.ok) throw new Error("Không thể tải danh sách người dùng.");
		const data = await response.json();
		users = Array.isArray(data.users) ? data.users : [];
		currentUser = data.currentUser || null;
		if (currentUser) {
			const existing = (() => {
				try { return JSON.parse(localStorage.getItem("dieuNwUser") || "{}"); } catch { return {}; }
			})();
			localStorage.setItem("dieuNwUser", JSON.stringify({ ...existing, ...currentUser }));
		} else {
			localStorage.removeItem("dieuNwUser");
		}
		render();
	}

	function makeButton(label, className, action, disabled = false) {
		const button = document.createElement("button");
		button.type = "button";
		button.className = className;
		button.textContent = label;
		button.disabled = disabled;
		button.addEventListener("click", action);
		return button;
	}

	function initials(user) {
		const name = (user.name || user.email || "Bạn").trim();
		return name.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase();
	}

	function openFriendProfile(user) {
		if (!user || !user.id) return;
		window.location.href = `./profile.html?userId=${encodeURIComponent(user.id)}`;
	}

	function makePersonCard(user, index) {
		const card = document.createElement("article");
		card.className = "friends-person";
		if (!reducedMotion) card.style.animationDelay = `${Math.min(index * 45, 315)}ms`;

		const avatar = document.createElement("div");
		avatar.className = "friends-avatar";
		avatar.setAttribute("aria-hidden", "true");
		if (user.avatar && user.avatar !== "./DIEU.png") {
			const img = document.createElement("img");
			img.src = user.avatar;
			img.alt = "";
			img.style.width = "100%";
			img.style.height = "100%";
			img.style.borderRadius = "50%";
			img.style.objectFit = "cover";
			avatar.appendChild(img);
		} else {
			avatar.textContent = initials(user);
		}

		const details = document.createElement("div");
		details.className = "friends-person-details";
		const name = document.createElement("h3");
		name.textContent = user.name || user.email || "Thành viên DIEUNW";
		const email = document.createElement("p");
		email.textContent = user.email || "";
		details.append(name, email);

		const actions = document.createElement("div");
		actions.className = "friends-person-actions";
		const relation = user.relationship || "none";

		if (activeFilter === "requests") {
			actions.append(
				makeButton("Từ chối", "friends-secondary-button", () => rejectRequest(user)),
				makeButton("Chấp nhận", "friends-primary-button", () => acceptRequest(user))
			);
		} else if (relation === "incoming") {
			actions.append(makeButton("Xem lời mời", "friends-secondary-button", () => selectFilter("requests")));
		} else if (relation === "outgoing") {
			actions.append(makeButton("Đã gửi lời mời", "friends-secondary-button", () => {}, true));
		} else if (!currentUser) {
			actions.append(
				makeButton("Kết bạn", "friends-primary-button", () => openAuthPrompt("friend")),
				makeButton("Nhắn tin", "friends-secondary-button", () => openAuthPrompt("message"))
			);
		} else if (relation === "friend") {
			actions.append(
				makeButton("Nhắn tin", "friends-primary-button", () => {
					window.location.href = `./messages.html?with=${encodeURIComponent(user.id)}`;
				}),
				makeButton("Hủy kết bạn", "friends-remove-button", () => removeFriend(user))
			);
		} else {
			actions.append(makeButton("Kết bạn", "friends-primary-button", () => sendRequest(user)));
		}

		actions.append(makeButton("Hồ sơ", "friends-secondary-button", () => openFriendProfile(user)));

		card.append(avatar, details, actions);
		return card;
	}

	function getFilteredUsers() {
		const currentId = String(currentUser?.id || "");
		let result = users;

		if (activeFilter === "friends") result = users.filter(user => user.relationship === "friend");
		if (activeFilter === "requests") result = users.filter(user => user.relationship === "incoming");
		if (activeFilter === "discover") {
			result = users.filter(user => String(user.id) !== currentId && user.relationship !== "friend");
		}

		const term = searchInput.value.trim().toLocaleLowerCase("vi");
		if (term) {
			result = result.filter(user => `${user.name || ""} ${user.email || ""}`.toLocaleLowerCase("vi").includes(term));
		}
		return result;
	}

	function render() {
		const friends = users.filter(user => user.relationship === "friend");
		const requests = users.filter(user => user.relationship === "incoming");
		document.getElementById("friends-count").textContent = String(friends.length);
		document.getElementById("request-count").textContent = String(requests.length);
		document.getElementById("friends-list-count").textContent = String(getFilteredUsers().length);

		const titles = { discover: "Gợi ý kết bạn", friends: "Danh sách bạn bè", requests: "Lời mời kết bạn" };
		document.getElementById("friends-list-title").textContent = titles[activeFilter];
		filterButtons.forEach(button => {
			const active = button.dataset.friendsFilter === activeFilter;
			button.classList.toggle("active", active);
			button.setAttribute("aria-selected", String(active));
		});

		list.replaceChildren();
		const filteredUsers = getFilteredUsers();
		if (!currentUser) setStatus("Đăng nhập tài khoản DIEUNW để kết bạn, nhắn tin và xem hồ sơ.");
		else setStatus("");

		if (!filteredUsers.length) {
			const message = document.createElement("p");
			message.className = "friends-list-state";
			message.textContent = searchInput.value.trim()
				? "Không tìm thấy người phù hợp với tên hoặc email này."
				: activeFilter === "friends"
					? "Bạn chưa có bạn bè. Tìm người quen trong mục Khám phá."
					: activeFilter === "requests"
						? "Bạn chưa có lời mời kết bạn mới."
						: "Chưa có tài khoản nào để gợi ý kết bạn.";
			list.append(message);
		} else {
			filteredUsers.forEach((user, index) => list.append(makePersonCard(user, index)));
		}
	}

	function selectFilter(filter) {
		activeFilter = filter;
		render();
	}

	async function sendRequest(target) {
		if (!currentUser) return;
		setStatus("Đang gửi lời mời...");
		try {
			const response = await fetch(`${API_BASE}/api/friend-requests`, {
				method: "POST",
				credentials: "include",
				headers: getAuthHeaders({ "Content-Type": "application/json" }),
				body: JSON.stringify({ userId: String(target.id) })
			});
			const data = await response.json();
			if (!response.ok) throw new Error(data.error || "Không thể gửi lời mời.");
			await fetchUsers();
			setStatus(`Đã gửi lời mời kết bạn đến ${target.name || target.email}.`);
		} catch (error) {
			setStatus(error.message || "Không thể gửi lời mời kết bạn.", true);
		}
	}

	async function acceptRequest(sender) {
		try {
			const response = await fetch(`${API_BASE}/api/friend-requests/${encodeURIComponent(sender.id)}/accept`, {
				method: "POST",
				credentials: "include",
				headers: getAuthHeaders({ "Content-Type": "application/json" }),
				body: "{}"
			});
			const data = await response.json();
			if (!response.ok) throw new Error(data.error || "Không thể chấp nhận lời mời.");
			await fetchUsers();
			setStatus(`Hai bạn và ${sender.name || sender.email} đã kết bạn.`);
		} catch (error) {
			setStatus(error.message || "Không thể chấp nhận lời mời.", true);
		}
	}

	async function rejectRequest(sender) {
		try {
			const response = await fetch(`${API_BASE}/api/friend-requests/${encodeURIComponent(sender.id)}/reject`, {
				method: "POST",
				credentials: "include",
				headers: getAuthHeaders({ "Content-Type": "application/json" }),
				body: "{}"
			});
			const data = await response.json();
			if (!response.ok) throw new Error(data.error || "Không thể từ chối lời mời.");
			await fetchUsers();
			setStatus("Đã từ chối lời mời kết bạn.");
		} catch (error) {
			setStatus(error.message || "Không thể cập nhật lời mời.", true);
		}
	}

	async function removeFriend(friend) {
		if (!window.confirm(`Hủy kết bạn với ${friend.name || friend.email}? Lịch sử tin nhắn riêng sẽ được giữ lại.`)) return;
		setStatus("Đang cập nhật danh sách bạn bè...");
		try {
			const response = await fetch(`${API_BASE}/api/friends/${encodeURIComponent(friend.id)}`, {
				method: "DELETE",
				credentials: "include",
				headers: getAuthHeaders()
			});
			const data = await response.json();
			if (!response.ok) throw new Error(data.error || "Không thể hủy kết bạn.");
			await fetchUsers();
			setStatus(`Đã hủy kết bạn với ${friend.name || friend.email}.`);
		} catch (error) {
			setStatus(error.message || "Không thể hủy kết bạn.", true);
		}
	}

	filterButtons.forEach(button => button.addEventListener("click", () => selectFilter(button.dataset.friendsFilter)));
	searchInput.addEventListener("input", render);
	document.getElementById("friends-search-form").addEventListener("submit", event => {
		event.preventDefault();
		render();
	});
	document.getElementById("friends-auth-close").addEventListener("click", closeAuthPrompt);
	authModal.addEventListener("click", event => {
		if (event.target === authModal) closeAuthPrompt();
	});
	document.addEventListener("keydown", event => {
		if (event.key === "Escape" && !authModal.hidden) closeAuthPrompt();
	});
	window.addEventListener("storage", event => {
		if (event.key === "dieuNwUser") fetchUsers().catch(() => {});
	});
	window.addEventListener("focus", () => fetchUsers().catch(() => {}));
	window.addEventListener("hashchange", () => {
		if (location.hash === "#messages") selectFilter("friends");
	});

	fetchUsers().catch(error => {
		setStatus(error.message || "Không thể kết nối máy chủ.", true);
		list.replaceChildren();
		const message = document.createElement("p");
		message.className = "friends-list-state";
		message.textContent = "Danh sách chưa tải được. Hãy tải lại trang sau ít phút.";
		list.append(message);
	});
});