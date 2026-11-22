document.addEventListener("DOMContentLoaded", () => {
	const API_BASE = "https://dieunw.onrender.com";
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
	const typingIndicator = document.getElementById("messages-typing-indicator");
	const composer = document.getElementById("messages-composer");
	const messageInput = document.getElementById("messages-input");
	const stickerBtn = document.getElementById("messages-sticker-btn");
	const groupModal = document.getElementById("messages-group-modal");
	const groupFriendList = document.getElementById("messages-group-friend-list");
	const groupForm = document.getElementById("messages-group-form");
	const groupNameInput = document.getElementById("messages-group-name");
	const groupError = document.getElementById("messages-group-error");
	const meeting = document.getElementById("messages-meeting");
	const meetingFrame = document.getElementById("messages-meeting-frame");

	let users = [];
	let friends = [];
	let currentUser = null;
	let conversations = [];
	let activeConversationId = "";
	let lastGroupTrigger = null;
	let pollTimer = null;
	let lastTypingPing = 0;
	let lastMessageSignature = "";

	function getAuthHeaders(extra = {}) {
		const token = localStorage.getItem("session_token") || localStorage.getItem("dieuNwToken") || "";
		return token ? { ...extra, Authorization: `Bearer ${token}` } : { ...extra };
	}

	function buildSkeletonMarkup(count = 4) {
		if (window.DIEUNW && typeof window.DIEUNW.createSkeletonCardsHtml === "function") {
			return window.DIEUNW.createSkeletonCardsHtml(count);
		}
		return Array.from({ length: count }, () => `
			<div class="skeleton-card" aria-hidden="true">
				<div class="skeleton-line short"></div>
				<div class="skeleton-line"></div>
			</div>
		`).join("");
	}

	function resolveStatusDotClass(obj) {
		if (window.DIEUNW && typeof window.DIEUNW.getStatusDotClass === "function") {
			return window.DIEUNW.getStatusDotClass(obj);
		}
		const st = String(obj?.presenceStatus || obj?.status || "").toLowerCase();
		if (st === "studying") return "studying";
		if (st === "online" || obj?.isOnline) return "online";
		return "offline";
	}

	function getUser(userId) {
		return users.find(u => String(u.id) === String(userId)) || null;
	}

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

	function isGhostModeEnabled() {
		return Boolean(currentUser?.privacyGhostMode || currentUser?.ghostMode);
	}

	function makeConversationButton(conversation) {
		const button = document.createElement("button");
		button.type = "button";
		button.className = "messages-conversation-item";
		button.classList.toggle("active", conversation.id === activeConversationId);
		button.addEventListener("click", () => selectConversation(conversation.id));

		const avatar = document.createElement("span");
		avatar.className = "messages-list-avatar";
		avatar.style.position = "relative";
		avatar.style.overflow = "visible";

		if (conversation.type === "direct" && conversation.avatar) {
			const image = document.createElement("img");
			image.src = conversation.avatar;
			image.alt = "";
			image.style.borderRadius = "50%";
			avatar.append(image);
		} else {
			avatar.textContent = initials(conversation.title);
		}

		if (conversation.type === "direct") {
			const otherId = (conversation.memberIds || []).find(id => String(id) !== String(currentUser?.id || ""));
			const otherUser = otherId ? getUser(otherId) : null;
			const dot = document.createElement("span");
			dot.className = `nav-status-dot ${resolveStatusDotClass(otherUser || conversation)}`;
			dot.setAttribute("aria-hidden", "true");
			avatar.append(dot);
		}

		const detail = document.createElement("span");
		detail.className = "messages-conversation-detail";
		const title = document.createElement("strong");
		title.textContent = conversation.title;
		const preview = document.createElement("span");
		if (conversation.lastMessage?.stickerUrl && !conversation.lastMessage?.text) {
			preview.textContent = "[Nhãn dán]";
		} else {
			preview.textContent = conversation.lastMessage?.text || conversation.subtitle;
		}
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
				const response = await fetch(`${API_BASE}/api/conversations/${encodeURIComponent(conversation.id)}`, {
					method: "DELETE",
					credentials: "include",
					headers: getAuthHeaders()
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

	function renderMessages(conversation, forceScroll = false) {
		const prevBottomGap = messageLog.scrollHeight - messageLog.scrollTop - messageLog.clientHeight;
		const signature = (conversation.messages || []).map(m => `${m.id}:${m.readBy?.length || m.seenBy?.length || 0}`).join("|");
		if (!forceScroll && signature === lastMessageSignature && conversation.messages.length > 0) {
			return;
		}
		lastMessageSignature = signature;

		messageLog.replaceChildren();
		if (!conversation.messages.length) {
			const message = document.createElement("p");
			message.className = "messages-list-state";
			message.textContent = "Chưa có tin nhắn. Hãy bắt đầu cuộc trò chuyện.";
			messageLog.append(message);
			return;
		}

		const msgs = conversation.messages;
		msgs.forEach((message, idx) => {
			const isOwn = String(message.fromId) === String(currentUser.id);
			const bubble = document.createElement("article");
			bubble.className = `messages-bubble${isOwn ? " own" : ""}`;

			if (conversation.type === "group" && !isOwn) {
				const sender = document.createElement("strong");
				sender.className = "messages-sender-name";
				sender.textContent = message.name || getUser(message.fromId)?.name || "Thành viên";
				bubble.append(sender);
			}

			if (message.stickerUrl) {
				const stickerImg = document.createElement("img");
				stickerImg.src = message.stickerUrl;
				stickerImg.alt = "Nhãn dán";
				stickerImg.className = "chat-sticker-img";
				bubble.append(stickerImg);
			}

			if (message.text) {
				const text = document.createElement("p");
				text.textContent = message.text;
				bubble.append(text);
			}

			const metaRow = document.createElement("div");
			metaRow.className = "messages-meta-row";
			const time = document.createElement("time");
			time.textContent = formatTime(message.createdAt);
			metaRow.append(time);

			const isLastMsg = idx === msgs.length - 1;
			if (isOwn && isLastMsg && !isGhostModeEnabled()) {
				const readers = Array.isArray(message.readBy)
					? message.readBy.filter(id => String(id) !== String(currentUser.id))
					: Array.isArray(message.seenBy)
						? message.seenBy.filter(id => String(id) !== String(currentUser.id))
						: (message.isRead ? ["reader"] : []);
				if (readers.length > 0) {
					const seen = document.createElement("span");
					seen.className = "messages-seen-tag";
					seen.textContent = " · Đã xem";
					metaRow.append(seen);
				}
			}

			bubble.append(metaRow);
			messageLog.append(bubble);
		});

		if (forceScroll || prevBottomGap < 90) {
			messageLog.scrollTop = messageLog.scrollHeight;
		}
	}

	function renderTyping(typingUsers) {
		if (!typingIndicator) return;
		const others = Array.isArray(typingUsers)
			? typingUsers.filter(u => String(u.id || u.userId || u) !== String(currentUser?.id || ""))
			: [];
		if (!others.length) {
			typingIndicator.hidden = true;
			typingIndicator.textContent = "";
			return;
		}
		const names = others.map(u => u.name || getUser(u.id || u.userId || u)?.name || "Bạn ấy").slice(0, 2);
		typingIndicator.textContent = `${names.join(", ")} đang nhập...`;
		typingIndicator.hidden = false;
	}

	async function markConversationRead(conversationId) {
		if (!conversationId || isGhostModeEnabled()) return;
		try {
			await fetch(`${API_BASE}/api/conversations/${encodeURIComponent(conversationId)}/read`, {
				method: "POST",
				credentials: "include",
				headers: getAuthHeaders({ "Content-Type": "application/json" }),
				body: "{}"
			});
		} catch {
			// Bỏ qua lỗi mạng nhẹ khi đánh dấu đã xem
		}
	}

	async function pingTyping(conversationId) {
		if (!conversationId) return;
		const now = Date.now();
		if (now - lastTypingPing < 2200) return;
		lastTypingPing = now;
		try {
			await fetch(`${API_BASE}/api/conversations/${encodeURIComponent(conversationId)}/typing`, {
				method: "POST",
				credentials: "include",
				headers: getAuthHeaders({ "Content-Type": "application/json" }),
				body: JSON.stringify({ isTyping: true })
			});
		} catch {
			// Bỏ qua lỗi ping typing
		}
	}

	async function refreshActiveConversation(forceScroll = false) {
		const conversation = conversations.find(item => item.id === activeConversationId);
		if (!conversation) return;
		try {
			const response = await fetch(`${API_BASE}/api/conversations/${encodeURIComponent(conversation.id)}/messages`, {
				credentials: "include",
				headers: getAuthHeaders()
			});
			const data = await response.json();
			if (!response.ok) throw new Error(data.error || "Không thể tải cuộc trò chuyện.");
			conversation.messages = Array.isArray(data.messages) ? data.messages : [];
			renderMessages(conversation, forceScroll);
			renderTyping(data.typingUsers || []);
			markConversationRead(conversation.id);
		} catch (error) {
			if (forceScroll) setMessageStatus(error.message || "Không thể tải tin nhắn.", true);
		}
	}

	async function selectConversation(conversationId) {
		const conversation = conversations.find(item => item.id === conversationId);
		if (!conversation) return;
		activeConversationId = conversationId;
		lastMessageSignature = "";
		emptyState.hidden = true;
		activeChat.hidden = false;
		meeting.hidden = true;
		meetingFrame.hidden = true;

		const chatAvatar = document.getElementById("messages-chat-avatar");
		chatAvatar.replaceChildren();
		chatAvatar.style.position = "relative";
		if (conversation.type === "direct" && conversation.avatar) {
			const img = document.createElement("img");
			img.src = conversation.avatar;
			img.alt = "";
			img.style.width = "100%";
			img.style.height = "100%";
			img.style.borderRadius = "50%";
			img.style.objectFit = "cover";
			chatAvatar.append(img);
		} else {
			chatAvatar.textContent = initials(conversation.title);
		}
		if (conversation.type === "direct") {
			const otherId = (conversation.memberIds || []).find(id => String(id) !== String(currentUser?.id || ""));
			const otherUser = otherId ? getUser(otherId) : null;
			const dot = document.createElement("span");
			dot.className = `nav-status-dot ${resolveStatusDotClass(otherUser || conversation)}`;
			dot.setAttribute("aria-hidden", "true");
			chatAvatar.append(dot);
		}

		document.getElementById("messages-chat-name").textContent = conversation.title;
		document.getElementById("messages-chat-subtitle").textContent = conversation.subtitle;
		renderConversationList();
		renderTyping([]);
		messageLog.innerHTML = buildSkeletonMarkup(3);

		await refreshActiveConversation(true);
		messageInput.focus();
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

	async function sendMessagePayload({ content = "", stickerUrl = "" }) {
		const conversation = conversations.find(item => item.id === activeConversationId);
		if (!conversation || (!content && !stickerUrl)) return;
		const submit = composer.querySelector("button[type='submit']");
		submit.disabled = true;
		try {
			const response = await fetch(`${API_BASE}/api/conversations/${encodeURIComponent(conversation.id)}/messages`, {
				method: "POST",
				credentials: "include",
				headers: getAuthHeaders({ "Content-Type": "application/json" }),
				body: JSON.stringify({ content, stickerUrl })
			});
			const data = await response.json();
			if (!response.ok) throw new Error(data.error || "Không thể gửi tin nhắn.");
			if (content) messageInput.value = "";
			setMessageStatus("");
			await refreshActiveConversation(true);
			await loadConversationsOnly();
		} catch (error) {
			setMessageStatus(error.message || "Không thể gửi tin nhắn.", true);
		} finally {
			submit.disabled = false;
			messageInput.focus();
		}
	}

	async function loadConversationsOnly() {
		try {
			const res = await fetch(`${API_BASE}/api/conversations`, {
				credentials: "include",
				headers: getAuthHeaders()
			});
			if (!res.ok) return;
			const data = await res.json();
			conversations = (data.conversations || []).map(conversation => {
				const existing = conversations.find(c => c.id === conversation.id);
				return { ...conversation, title: conversation.name, messages: existing?.messages || [] };
			});
			renderConversationList();
		} catch {
			// Bỏ qua nếu polling nền lỗi tạm thời
		}
	}

	async function loadUsers() {
		loadingState.hidden = false;
		authGate.hidden = true;
		app.hidden = true;

		const sessionResponse = await fetch(`${API_BASE}/api/auth/me`, {
			credentials: "include",
			headers: getAuthHeaders()
		});
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
				authGate.querySelector("p").textContent = "Tài khoản đang lưu trên trình duyệt chưa có session ở máy chủ. Hãy đăng nhập lại.";
			}
			return;
		}

		localStorage.setItem("dieuNwUser", JSON.stringify(currentUser));
		conversationList.innerHTML = buildSkeletonMarkup(4);

		const [conversationResponse, friendsResponse] = await Promise.all([
			fetch(`${API_BASE}/api/conversations`, { credentials: "include", headers: getAuthHeaders() }),
			fetch(`${API_BASE}/api/friends`, { credentials: "include", headers: getAuthHeaders() })
		]);
		const [conversationData, friendsData] = await Promise.all([conversationResponse.json(), friendsResponse.json()]);
		if (!conversationResponse.ok || !friendsResponse.ok) throw new Error("Không thể tải danh sách tin nhắn.");

		users = [...(friendsData.friends || []), ...(friendsData.incoming || [])];
		friends = friendsData.friends || [];
		conversations = (conversationData.conversations || []).map(conversation => ({ ...conversation, title: conversation.name, messages: [] }));
		loadingState.hidden = true;
		authGate.hidden = true;
		app.hidden = false;
		renderConversationList();

		const params = new URLSearchParams(location.search);
		const requestedFriend = params.get("with") || params.get("userId");
		const requestedConversation = requestedFriend && conversations.find(item => item.type === "direct" && item.memberIds.map(String).includes(String(requestedFriend)));

		if (requestedConversation) {
			await selectConversation(requestedConversation.id);
		} else if (activeConversationId && conversations.some(item => item.id === activeConversationId)) {
			await selectConversation(activeConversationId);
		} else {
			activeChat.hidden = true;
			emptyState.hidden = false;
		}

		if (!pollTimer) {
			pollTimer = setInterval(() => {
				if (document.hidden) return;
				if (activeConversationId) refreshActiveConversation(false);
				loadConversationsOnly();
			}, 4000);
		}
	}

	if (stickerBtn) {
		if (window.DIEUNW && typeof window.DIEUNW.attachStickerPicker === "function") {
			window.DIEUNW.attachStickerPicker(stickerBtn, stickerUrl => {
				sendMessagePayload({ stickerUrl });
			});
		} else {
			stickerBtn.addEventListener("click", () => {
				sendMessagePayload({ content: "👋✨" });
			});
		}
	}

	searchInput.addEventListener("input", renderConversationList);
	messageInput.addEventListener("input", () => {
		if (activeConversationId && messageInput.value.trim()) pingTyping(activeConversationId);
	});
	messageInput.addEventListener("keydown", event => {
		if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault();
			composer.requestSubmit();
		}
	});

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
			const response = await fetch(`${API_BASE}/api/conversations`, {
				method: "POST",
				credentials: "include",
				headers: getAuthHeaders({ "Content-Type": "application/json" }),
				body: JSON.stringify({ name, memberIds })
			});
			const data = await response.json();
			if (!response.ok) throw new Error(data.error || "Không thể tạo nhóm.");
			await loadUsers();
			activeConversationId = data.conversation.id;
			groupNameInput.value = "";
			closeGroupDialog();
			await selectConversation(activeConversationId);
		} catch (error) {
			groupError.textContent = error.message || "Không thể tạo nhóm.";
		} finally {
			submit.disabled = false;
		}
	});

	composer.addEventListener("submit", async event => {
		event.preventDefault();
		const text = messageInput.value.trim();
		if (!text || !activeConversationId) return;
		await sendMessagePayload({ content: text });
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
		if (event.key === "dieuNwUser" || event.key === "session_token") loadUsers().catch(() => {});
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