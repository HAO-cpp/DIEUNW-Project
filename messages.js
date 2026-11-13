document.addEventListener("DOMContentLoaded", () => {
	const loadingState = document.getElementById("messages-loading");
	const authGate = document.getElementById("messages-auth-gate");
	const app = document.getElementById("messages-app");
	const searchInput = document.getElementById("messages-search-input");
	const conversationList = document.getElementById("messages-conversation-list");
	const conversationCount = document.getElementById("messages-conversation-count");
	const emptyState = document.getElementById("messages-empty");
	const activeChat = document.getElementById("messages-active-chat");
	const messageStatus = document.getElementById("messages-status");
	const messageLog = document.getElementById("messages-log");
	const composer = document.getElementById("messages-composer");
	const messageInput = document.getElementById("messages-input");
	const groupModal = document.getElementById("messages-group-modal");
	const groupFriendList = document.getElementById("messages-group-friend-list");
	const groupForm = document.getElementById("messages-group-form");
	const groupNameInput = document.getElementById("messages-group-name");
	const groupError = document.getElementById("messages-group-error");
	const meeting = document.getElementById("messages-meeting");
	const meetingFrame = document.getElementById("messages-meeting-frame");
	const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	let users = [];
	let friends = [];
	let currentUser = null;
	let conversations = [];
	let activeConversationId = "";
	let lastGroupTrigger = null;

	function formatTime(value) {
		const date = new Date(value);
		return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
	}

	function hasCachedUser() {
		try {
			return Boolean(JSON.parse(localStorage.getItem("dieuNwUser") || "null"));
		} catch {
			return false;
		}
	}

	function setMessageStatus(message, isError = false) {
		messageStatus.textContent = message;
		messageStatus.classList.toggle("error", isError);
	}

	function initials(name) {
		return String(name || "B").trim().split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase();
	}

	function makeConversationButton(conversation) {
		const button = document.createElement("button");
		button.type = "button";
		button.className = "messages-conversation-item";
		button.classList.toggle("active", conversation.id === activeConversationId);
		button.addEventListener("click", () => selectConversation(conversation.id));

		const avatar = document.createElement("span");
		avatar.className = "messages-list-avatar";
		if (conversation.type === "direct" && conversation.avatar) {
			const image = document.createElement("img");
			image.src = conversation.avatar;
			image.alt = "";
			avatar.append(image);
		} else {
			avatar.textContent = initials(conversation.title);
		}

		const detail = document.createElement("span");
		detail.className = "messages-conversation-detail";
		const title = document.createElement("strong");
		title.textContent = conversation.title;
		const preview = document.createElement("span");
		preview.textContent = conversation.lastMessage?.text || conversation.subtitle;
		detail.append(title, preview);

		const time = document.createElement("time");
		time.textContent = conversation.lastMessage ? formatTime(conversation.lastMessage.createdAt) : "";
		button.append(avatar, detail, time);
		if (conversation.type !== "group" || String(conversation.createdBy) !== String(currentUser.id)) return button;

		const row = document.createElement("div");
		row.className = "messages-conversation-row";
		const deleteButton = document.createElement("button");
		deleteButton.type = "button";
		deleteButton.className = "messages-delete-group";
		deleteButton.textContent = "Xóa";
		deleteButton.setAttribute("aria-label", `Xóa nhóm ${conversation.title}`);
		deleteButton.addEventListener("click", async () => {
			if (!window.confirm(`Xóa nhóm “${conversation.title}” và toàn bộ tin nhắn trong nhóm này?`)) return;
			deleteButton.disabled = true;
			try {
				const response = await fetch(`/api/conversations/${encodeURIComponent(conversation.id)}`, {
					method: "DELETE",
					credentials: "same-origin"
				});
				const data = await response.json();
				if (!response.ok) throw new Error(data.error || "Không thể xóa nhóm.");
				if (activeConversationId === conversation.id) {
					activeConversationId = "";
					meetingFrame.src = "about:blank";
					meeting.hidden = true;
					meetingFrame.hidden = true;
				}
				await loadUsers();
				setMessageStatus(`Đã xóa nhóm “${conversation.title}” và tin nhắn trong nhóm.`);
			} catch (error) {
				setMessageStatus(error.message || "Không thể xóa nhóm.", true);
				deleteButton.disabled = false;
			}
		});
		row.append(button, deleteButton);
		return row;
	}

	function renderConversationList() {
		const term = searchInput.value.trim().toLocaleLowerCase("vi");
		const visible = conversations.filter(conversation =>
			`${conversation.title} ${conversation.subtitle}`.toLocaleLowerCase("vi").includes(term));
		conversationCount.textContent = String(visible.length);
		conversationList.replaceChildren();
		if (!visible.length) {
			const message = document.createElement("p");
			message.className = "messages-list-state";
			message.textContent = term ? "Không tìm thấy bạn bè hoặc nhóm chat." : "Bạn chưa có cuộc trò chuyện. Hãy kết bạn để bắt đầu.";
			conversationList.append(message);
			return;
		}
		visible.forEach(conversation => conversationList.append(makeConversationButton(conversation)));
	}

	function renderMessages(conversation) {
		messageLog.replaceChildren();
		if (!conversation.messages.length) {
			const message = document.createElement("p");
			message.className = "messages-list-state";
			message.textContent = "Chưa có tin nhắn. Hãy bắt đầu cuộc trò chuyện.";
			messageLog.append(message);
			return;
		}

		conversation.messages.forEach(message => {
			const bubble = document.createElement("article");
			bubble.className = `messages-bubble${String(message.fromId) === String(currentUser.id) ? " own" : ""}`;
			if (conversation.type === "group" && String(message.fromId) !== String(currentUser.id)) {
				const sender = document.createElement("strong");
				sender.className = "messages-sender-name";
				sender.textContent = message.name || getUser(message.fromId)?.name || "Thành viên";
				bubble.append(sender);
			}
			const text = document.createElement("p");
			text.textContent = message.text;
			const time = document.createElement("time");
			time.textContent = formatTime(message.createdAt);
			bubble.append(text, time);
			messageLog.append(bubble);
		});
		messageLog.scrollTop = messageLog.scrollHeight;
	}

	async function selectConversation(conversationId) {
		const conversation = conversations.find(item => item.id === conversationId);
		if (!conversation) return;
		activeConversationId = conversationId;
		emptyState.hidden = true;
		activeChat.hidden = false;
		meeting.hidden = true;
		meetingFrame.hidden = true;
		document.getElementById("messages-chat-avatar").textContent = initials(conversation.title);
		document.getElementById("messages-chat-name").textContent = conversation.title;
		document.getElementById("messages-chat-subtitle").textContent = conversation.subtitle;
		renderConversationList();
		messageLog.replaceChildren();
		const loading = document.createElement("p");
		loading.className = "messages-list-state";
		loading.textContent = "Đang tải tin nhắn...";
		messageLog.append(loading);
		try {
			const response = await fetch(`/api/conversations/${encodeURIComponent(conversation.id)}/messages`, { credentials: "same-origin" });
			const data = await response.json();
			if (!response.ok) throw new Error(data.error || "Không thể tải cuộc trò chuyện.");
			conversation.messages = data.messages;
			renderMessages(conversation);
			messageInput.focus();
		} catch (error) {
			setMessageStatus(error.message || "Không thể tải tin nhắn.", true);
		}
	}

	function renderGroupFriends() {
		groupFriendList.replaceChildren();
		if (!friends.length) {
			const message = document.createElement("p");
			message.className = "messages-list-state";
			message.textContent = "Bạn cần có bạn bè trước khi tạo nhóm riêng.";
			groupFriendList.append(message);
			return;
		}
		friends.forEach(friend => {
			const label = document.createElement("label");
			label.className = "messages-member-option";
			const input = document.createElement("input");
			input.type = "checkbox";
			input.name = "group-member";
			input.value = String(friend.id);
			const name = document.createElement("span");
			name.textContent = `${friend.name || friend.email} · ${friend.email || ""}`;
			label.append(input, name);
			groupFriendList.append(label);
		});
	}

	function openGroupDialog(trigger) {
		lastGroupTrigger = trigger;
		groupError.textContent = "";
		renderGroupFriends();
		groupModal.hidden = false;
		groupNameInput.focus();
	}

	function closeGroupDialog() {
		groupModal.hidden = true;
		lastGroupTrigger?.focus();
		lastGroupTrigger = null;
	}

	async function loadUsers() {
		loadingState.hidden = false;
		authGate.hidden = true;
		app.hidden = true;
		const sessionResponse = await fetch("/api/auth/me", { credentials: "same-origin" });
		const sessionData = await sessionResponse.json();
		currentUser = sessionData.user || null;

		if (!currentUser) {
			const hadCachedUser = hasCachedUser();
			localStorage.removeItem("dieuNwUser");
			loadingState.hidden = true;
			authGate.hidden = false;
			app.hidden = true;
			if (hadCachedUser) {
				authGate.querySelector("h2").textContent = "Phiên đăng nhập cần được xác nhận lại";
				authGate.querySelector("p").textContent = "Tài khoản đang lưu trên trình duyệt chưa có session ở máy chủ. Hãy đăng nhập lại; tài khoản tạo trước khi có backend cần đăng ký lại.";
			}
			return;
		}

		localStorage.setItem("dieuNwUser", JSON.stringify(currentUser));
		const [conversationResponse, friendsResponse] = await Promise.all([
			fetch("/api/conversations", { credentials: "same-origin" }),
			fetch("/api/friends", { credentials: "same-origin" })
		]);
		const [conversationData, friendsData] = await Promise.all([conversationResponse.json(), friendsResponse.json()]);
		if (!conversationResponse.ok || !friendsResponse.ok) throw new Error("Không thể tải danh sách tin nhắn.");
		users = [...friendsData.friends, ...friendsData.incoming];
		friends = friendsData.friends;
		conversations = conversationData.conversations.map(conversation => ({ ...conversation, title: conversation.name, messages: [] }));
		loadingState.hidden = true;
		authGate.hidden = true;
		app.hidden = false;
		renderConversationList();

		const requestedFriend = new URLSearchParams(location.search).get("with");
		const requestedConversation = requestedFriend && conversations.find(item => item.type === "direct" && item.memberIds.includes(requestedFriend));
		if (requestedConversation) selectConversation(requestedConversation.id);
		else if (activeConversationId && conversations.some(item => item.id === activeConversationId)) selectConversation(activeConversationId);
		else {
			activeChat.hidden = true;
			emptyState.hidden = false;
		}
	}

	searchInput.addEventListener("input", renderConversationList);
	document.getElementById("create-private-group").addEventListener("click", event => openGroupDialog(event.currentTarget));
	document.getElementById("messages-group-close").addEventListener("click", closeGroupDialog);
	groupModal.addEventListener("click", event => {
		if (event.target === groupModal) closeGroupDialog();
	});
	document.addEventListener("keydown", event => {
		if (event.key === "Escape" && !groupModal.hidden) closeGroupDialog();
	});

	groupForm.addEventListener("submit", async event => {
		event.preventDefault();
		const name = groupNameInput.value.trim();
		const memberIds = [...groupFriendList.querySelectorAll("input[name='group-member']:checked")].map(input => input.value);
		if (!name) {
			groupError.textContent = "Nhập tên nhóm trước khi tạo.";
			return;
		}
		if (!memberIds.length) {
			groupError.textContent = "Chọn ít nhất một người bạn.";
			return;
		}

		const submit = document.getElementById("messages-group-submit");
		submit.disabled = true;
		groupError.textContent = "Đang tạo nhóm...";
		try {
			const response = await fetch("/api/conversations", {
				method: "POST",
				credentials: "same-origin",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name, memberIds })
			});
			const data = await response.json();
			if (!response.ok) throw new Error(data.error || "Không thể tạo nhóm.");
			await loadUsers();
			activeConversationId = data.conversation.id;
			groupNameInput.value = "";
			closeGroupDialog();
			selectConversation(activeConversationId);
		} catch (error) {
			groupError.textContent = error.message || "Không thể tạo nhóm.";
		} finally {
			submit.disabled = false;
		}
	});

	composer.addEventListener("submit", async event => {
		event.preventDefault();
		const text = messageInput.value.trim();
		const conversation = conversations.find(item => item.id === activeConversationId);
		if (!text || !conversation) return;

		const submit = composer.querySelector("button[type='submit']");
		submit.disabled = true;
		try {
			const response = await fetch(`/api/conversations/${encodeURIComponent(conversation.id)}/messages`, {
				method: "POST",
				credentials: "same-origin",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ content: text })
			});
			const data = await response.json();
			if (!response.ok) throw new Error(data.error || "Không thể gửi tin nhắn.");
			messageInput.value = "";
			setMessageStatus("");
			await loadUsers();
			await selectConversation(conversation.id);
		} catch (error) {
			setMessageStatus(error.message || "Không thể gửi tin nhắn.", true);
		} finally {
			submit.disabled = false;
		}
	});

	document.getElementById("messages-call-button").addEventListener("click", () => {
		const conversation = conversations.find(item => item.id === activeConversationId);
		if (!conversation) return;
		const room = `dieunw-${conversation.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 70)}`;
		meeting.hidden = false;
		meetingFrame.hidden = false;
		meetingFrame.src = `https://meet.jit.si/${encodeURIComponent(room)}`;
		document.getElementById("messages-meeting-room").textContent = `Phòng ${room}`;
	});
	document.getElementById("messages-meeting-close").addEventListener("click", () => {
		meetingFrame.src = "about:blank";
		meetingFrame.hidden = true;
		meeting.hidden = true;
	});
	window.addEventListener("storage", event => {
		if (event.key === "dieuNwUser") loadUsers().catch(() => {});
	});
	window.addEventListener("focus", () => loadUsers().catch(() => {}));

	loadUsers().catch(() => {
		loadingState.hidden = true;
		authGate.hidden = false;
		app.hidden = true;
		authGate.querySelector("h2").textContent = "Không thể tải tin nhắn";
		authGate.querySelector("p").textContent = "Hãy kiểm tra kết nối rồi tải lại trang.";
	});
});