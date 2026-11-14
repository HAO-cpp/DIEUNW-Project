document.addEventListener("DOMContentLoaded", () => {
	const list = document.getElementById("friends-list");
	const searchInput = document.getElementById("friends-search-input");
	const status = document.getElementById("friends-status");
	const filterButtons = [...document.querySelectorAll("[data-friends-filter]")];
	const emptyState = document.getElementById("friends-empty");
	const profilePanel = document.getElementById("friends-profile");
	const profileMessageButton = document.getElementById("friend-profile-message");
	const profileMeetingButton = document.getElementById("friend-profile-meeting");
	const meeting = document.getElementById("friends-meeting");
	const meetingFrame = document.getElementById("friends-meeting-frame");
	const authModal = document.getElementById("friends-auth-modal");
	const authMessage = document.getElementById("friends-auth-message");
	const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	let users = [];
	let currentUser = null;
	let selectedFriend = null;
	let lastAuthTrigger = null;
	let activeFilter = location.hash === "#messages" ? "friends" : "discover";

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

	function escapeRoomPart(value) {
		return String(value || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 24);
	}

	async function fetchUsers() {
		const response = await fetch("https://dieunw.onrender.com/api/users", { credentials: "include" });
		if (!response.ok) throw new Error("Không thể tải danh sách người dùng.");
		const data = await response.json();
		users = Array.isArray(data.users) ? data.users : [];
		currentUser = data.currentUser || null;
		if (currentUser) localStorage.setItem("dieuNwUser", JSON.stringify(currentUser));
		else localStorage.removeItem("dieuNwUser");
		if (selectedFriend) selectedFriend = users.find(user => String(user.id) === String(selectedFriend.id)) || null;
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

	function makePersonCard(user, index) {
		const card = document.createElement("article");
		card.className = "friends-person";
		if (!reducedMotion) card.style.animationDelay = `${Math.min(index * 45, 315)}ms`;

		const avatar = document.createElement("div");
		avatar.className = "friends-avatar";
		avatar.setAttribute("aria-hidden", "true");
		avatar.textContent = initials(user);

		const details = document.createElement("div");
		details.className = "friends-person-details";
		const name = document.createElement("h3");
		name.textContent = user.name || user.email || "Thành viên DIEUNW";
		const email = document.createElement("p");
		email.textContent = user.email || "";
		details.append(name, email);

		const actions = document.createElement("div");
		actions.className = "friends-person-actions";
		const userId = String(user.id);
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
			actions.append(makeButton("Hủy kết bạn", "friends-remove-button", () => removeFriend(user)));
		} else if (relation !== "friend") {
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
		if (term) result = result.filter(user => `${user.name || ""} ${user.email || ""}`.toLocaleLowerCase("vi").includes(term));
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
		if (!currentUser) setStatus("Đăng nhập tài khoản DIEUNW để kết bạn, nhắn tin và gọi video.");
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

		if (selectedFriend) openFriendProfile(selectedFriend);
	}

	function selectFilter(filter) {
		activeFilter = filter;
		render();
	}

	async function sendRequest(target) {
		if (!currentUser) return;
		setStatus("Đang gửi lời mời...");
		try {
			const response = await fetch("https://dieunw.onrender.com/api/friend-requests", {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
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
			const response = await fetch(`https://dieunw.onrender.com/api/friend-requests/${encodeURIComponent(sender.id)}/accept`, {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
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
			const response = await fetch(`https://dieunw.onrender.com/api/friend-requests/${encodeURIComponent(sender.id)}/reject`, {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
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
			const response = await fetch(`https://dieunw.onrender.com/api/friends/${encodeURIComponent(friend.id)}`, {
				method: "DELETE",
				credentials: "include"
			});
			const data = await response.json();
			if (!response.ok) throw new Error(data.error || "Không thể hủy kết bạn.");
			if (String(selectedFriend?.id) === String(friend.id)) {
				selectedFriend = null;
				profilePanel.hidden = true;
				emptyState.hidden = false;
			}
			await fetchUsers();
			setStatus(`Đã hủy kết bạn với ${friend.name || friend.email}.`);
		} catch (error) {
			setStatus(error.message || "Không thể hủy kết bạn.", true);
		}
	}

	function openFriendProfile(friend) {
		selectedFriend = friend;
		emptyState.hidden = true;
		profilePanel.hidden = false;
		meetingFrame.src = "about:blank";
		meeting.hidden = true;
		const coverImage = document.getElementById("friend-cover-image");
		const cover = typeof friend.cover === "string" ? friend.cover.trim() : "";
		coverImage.hidden = !cover;
		if (cover) coverImage.src = cover;
		else coverImage.removeAttribute("src");
		document.getElementById("friend-avatar-image").src = friend.avatar || "./DIEU.png";
		document.getElementById("friend-profile-name").textContent = friend.name || "Thành viên DIEUNW";
		document.getElementById("friend-profile-email").textContent = friend.email || "";
		document.getElementById("friend-profile-class").textContent = friend.studentClass ? `Lớp ${friend.studentClass}` : "Học sinh trường NQD";
		document.getElementById("friend-profile-bio").textContent = friend.bio || "Chưa có lời giới thiệu.";
		const isFriend = friend.relationship === "friend";
		profileMessageButton.disabled = Boolean(currentUser && !isFriend);
		profileMessageButton.textContent = currentUser && !isFriend ? "Kết bạn để nhắn tin" : "Nhắn tin";
		profileMeetingButton.hidden = !isFriend;
	}

	function openSelectedFriendMessages() {
		if (!selectedFriend) return;
		if (!currentUser) {
			openAuthPrompt("message");
			return;
		}
		if (selectedFriend.relationship !== "friend") return;
		location.href = `./messages.html?with=${encodeURIComponent(selectedFriend.id)}`;
	}

	function startMeeting(friend) {
		if (!currentUser || friend.relationship !== "friend") return;
		const roomMembers = [String(currentUser.id), String(friend.id)].sort().map(escapeRoomPart).join("-");
		const roomName = `dieunw-${roomMembers}`;
		document.getElementById("friends-meeting-title").textContent = `Jitsi với ${friend.name || friend.email}`;
		meetingFrame.src = `https://meet.jit.si/${encodeURIComponent(roomName)}`;
		meetingFrame.hidden = false;
		meeting.hidden = false;
		document.getElementById("friends-meeting-note").textContent = `Phòng ${roomName}. Người bạn cần tham gia cùng phòng này.`;
		meeting.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
	}

	filterButtons.forEach(button => button.addEventListener("click", () => selectFilter(button.dataset.friendsFilter)));
	searchInput.addEventListener("input", render);
	document.getElementById("friends-search-form").addEventListener("submit", event => {
		event.preventDefault();
		render();
	});
	profileMessageButton.addEventListener("click", openSelectedFriendMessages);
	profileMeetingButton.addEventListener("click", () => {
		if (selectedFriend) startMeeting(selectedFriend);
	});
	document.getElementById("friends-meeting-close").addEventListener("click", () => {
		meetingFrame.src = "about:blank";
		meetingFrame.hidden = true;
		meeting.hidden = true;
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