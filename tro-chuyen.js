document.addEventListener("DOMContentLoaded", () => {
	const POSTS_API = "https://6af30641d2377d6c370469d7.mockapi.io/posts";
	const POLL_INTERVAL = 5000;
	const PRESENCE_WINDOW = 25000;
	const roomList = document.getElementById("public-room-list");
	const roomSearch = document.getElementById("room-search");
	const roomCount = document.getElementById("room-count");
	const filterButtons = document.querySelectorAll(".room-filter");
	const createRoomToggle = document.getElementById("create-room-toggle");
	const createRoomForm = document.getElementById("create-room-form");
	const createRoomMessage = document.getElementById("create-room-message");
	const chatEmptyState = document.getElementById("chat-empty-state");
	const activeConversation = document.getElementById("active-conversation");
	const messageList = document.getElementById("message-list");
	const messageForm = document.getElementById("message-form");
	const messageInput = document.getElementById("message-input");
	const sendMessageButton = document.getElementById("send-message-button");
	let rooms = [];
	let activeRoom = null;
	let activeTopic = "Tất cả";
	let lastRenderedMessages = null;
	let polling = false;

	function readCurrentUser() {
		try {
			return JSON.parse(localStorage.getItem("dieuNwUser") || "null");
		} catch (error) {
			return null;
		}
	}

	function getVisitorId() {
		let visitorId = localStorage.getItem("dieunw_chat_visitor_id");
		if (!visitorId) {
			visitorId = window.crypto && crypto.randomUUID
				? crypto.randomUUID()
				: `guest-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
			localStorage.setItem("dieunw_chat_visitor_id", visitorId);
		}
		return visitorId;
	}

	const currentUser = readCurrentUser();
	const visitorId = currentUser && currentUser.id ? String(currentUser.id) : getVisitorId();
	const currentName = currentUser && currentUser.name ? currentUser.name : "Khách NQD";

	async function getPosts() {
		const response = await fetch(POSTS_API);
		if (!response.ok) throw new Error("Không thể tải dữ liệu trò chuyện.");
		return response.json();
	}

	async function updatePost(postId, fields) {
		const response = await fetch(`${POSTS_API}/${encodeURIComponent(postId)}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(fields)
		});
		if (!response.ok) throw new Error("Không thể cập nhật phòng.");
		return response.json();
	}

	function formatTime(value) {
		const date = new Date(value);
		return Number.isNaN(date.getTime())
			? ""
			: date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
	}

	function getActiveMembers(room) {
		const cutoff = Date.now() - PRESENCE_WINDOW;
		return Array.isArray(room.members)
			? room.members.filter(member => new Date(member.lastSeen).getTime() >= cutoff)
			: [];
	}

	function renderRooms() {
		const searchTerm = roomSearch.value.trim().toLocaleLowerCase("vi");
		const visibleRooms = rooms.filter(room => {
			const matchesTopic = activeTopic === "Tất cả" || room.topic === activeTopic;
			const matchesSearch = !searchTerm || `${room.roomTitle} ${room.topic} ${room.description || ""}`
				.toLocaleLowerCase("vi").includes(searchTerm);
			return matchesTopic && matchesSearch;
		});

		roomList.replaceChildren();
		roomCount.textContent = searchTerm || activeTopic !== "Tất cả"
			? `${visibleRooms.length} phòng phù hợp`
			: `${rooms.length} phòng đang mở`;

		if (!visibleRooms.length) {
			const empty = document.createElement("div");
			empty.className = "room-list-state room-empty-state";
			const title = document.createElement("strong");
			title.textContent = rooms.length ? "Chưa tìm thấy phòng phù hợp" : "Chưa có phòng nào";
			const detail = document.createElement("span");
			detail.textContent = rooms.length ? "Thử từ khóa hoặc chủ đề khác." : "Tạo phòng mới để bắt đầu trò chuyện.";
			empty.append(title, detail);
			roomList.appendChild(empty);
			return;
		}

		visibleRooms.forEach((room, index) => {
			const button = document.createElement("button");
			button.type = "button";
			button.className = `public-room-card${activeRoom && activeRoom.id === room.id ? " selected" : ""}`;
			button.style.setProperty("--room-index", index);
			button.addEventListener("click", () => joinRoom(room));

			const icon = document.createElement("span");
			icon.className = "room-card-icon";
			icon.textContent = (room.roomTitle || "P").trim().charAt(0).toLocaleUpperCase("vi");
			const content = document.createElement("span");
			content.className = "room-card-content";
			const title = document.createElement("strong");
			title.className = "room-card-title";
			title.textContent = room.roomTitle || "Phòng công khai";
			const meta = document.createElement("span");
			meta.className = "room-card-meta";
			meta.textContent = `${room.topic || "Khác"} · ${getActiveMembers(room).length} đang trò chuyện`;
			content.append(title, meta);
			const joinMark = document.createElement("span");
			joinMark.className = "room-card-arrow";
			joinMark.setAttribute("aria-hidden", "true");
			joinMark.textContent = "↗";
			button.append(icon, content, joinMark);
			roomList.appendChild(button);
		});
	}

	async function loadRooms() {
		try {
			const posts = await getPosts();
			rooms = posts
				.filter(post => post.type === "public-chat-room")
				.sort((first, second) => new Date(second.lastActivity || second.createdAt) - new Date(first.lastActivity || first.createdAt));
			if (activeRoom) {
				const updatedRoom = rooms.find(room => room.id === activeRoom.id);
				if (updatedRoom) {
					activeRoom = updatedRoom;
					updateConversationPresence();
				}
			}
			renderRooms();
			if (!rooms.length) roomCount.textContent = "0 phòng đang mở";
		} catch (error) {
			if (!rooms.length) {
				roomList.innerHTML = "<p class=\"room-list-state room-error-state\">Không kết nối được danh sách phòng. Thử tải lại trang.</p>";
				roomCount.textContent = "Ngoại tuyến";
			}
		}
	}

	async function updateConversationPresence() {
		if (!activeRoom) return;
		const now = Date.now();
		const members = getActiveMembers(activeRoom).filter(member => member.userId !== visitorId);
		members.push({ userId: visitorId, name: currentName, lastSeen: new Date(now).toISOString() });
		activeRoom.members = members;
		activeRoom.onlineCount = members.length;
		try {
			const updatedRoom = await updatePost(activeRoom.id, {
				members,
				onlineCount: members.length,
				lastActivity: new Date(now).toISOString()
			});
			activeRoom = updatedRoom;
			updateConversationHeader();
		} catch (error) {
			updateConversationHeader();
		}
	}

	function updateConversationHeader() {
		if (!activeRoom) return;
		document.getElementById("conversation-title").textContent = activeRoom.roomTitle || "Phòng công khai";
		document.getElementById("conversation-topic").textContent = (activeRoom.topic || "Khác").toLocaleUpperCase("vi");
		document.getElementById("conversation-room-icon").textContent = (activeRoom.roomTitle || "P").trim().charAt(0).toLocaleUpperCase("vi");
		document.getElementById("conversation-members").textContent = `${getActiveMembers(activeRoom).length} đang trò chuyện`;
	}

	async function joinRoom(room) {
		activeRoom = room;
		lastRenderedMessages = null;
		chatEmptyState.hidden = true;
		activeConversation.hidden = false;
		document.body.classList.add("room-open");
		messageList.innerHTML = "<p class=\"message-list-state\">Đang tải tin nhắn...</p>";
		updateConversationHeader();
		renderRooms();
		await updateConversationPresence();
		await loadMessages();
		messageInput.focus();
	}

	async function loadMessages() {
		if (!activeRoom || polling) return;
		polling = true;
		try {
			const posts = await getPosts();
			const messages = posts
				.filter(post => post.type === "public-chat-message" && String(post.roomId) === String(activeRoom.id))
				.sort((first, second) => new Date(first.createdAt) - new Date(second.createdAt))
				.slice(-100);
			const signature = messages.map(message => message.id).join("|");
			if (signature === lastRenderedMessages) return;
			const nearBottom = messageList.scrollHeight - messageList.scrollTop - messageList.clientHeight < 100;
			messageList.replaceChildren();
			if (!messages.length) {
				const empty = document.createElement("p");
				empty.className = "message-list-state";
				empty.textContent = "Phòng đã mở. Hãy gửi lời chào đầu tiên!";
				messageList.appendChild(empty);
			} else {
				messages.forEach((message, index) => messageList.appendChild(createMessage(message, index)));
			}
			lastRenderedMessages = signature;
			if (nearBottom || signature.split("|").length <= 1) messageList.scrollTop = messageList.scrollHeight;
		} catch (error) {
			if (!lastRenderedMessages) {
				messageList.innerHTML = "<p class=\"message-list-state room-error-state\">Không tải được tin nhắn. Hãy thử lại.</p>";
			}
		} finally {
			polling = false;
		}
	}

	function createMessage(message, index) {
		const wrapper = document.createElement("article");
		const mine = String(message.senderId) === visitorId;
		wrapper.className = `chat-message${mine ? " own-message" : ""}`;
		wrapper.style.setProperty("--message-index", index % 12);
		const avatar = document.createElement("span");
		avatar.className = "message-avatar";
		avatar.textContent = (message.senderName || "K").trim().charAt(0).toLocaleUpperCase("vi");
		const bubbleWrap = document.createElement("div");
		bubbleWrap.className = "message-bubble-wrap";
		const meta = document.createElement("div");
		meta.className = "message-meta";
		const author = document.createElement("strong");
		author.textContent = mine ? "Bạn" : message.senderName || "Khách NQD";
		const time = document.createElement("time");
		time.textContent = formatTime(message.createdAt);
		bubbleWrap.appendChild(meta);
		meta.append(author, time);
		const text = document.createElement("p");
		text.className = "message-bubble";
		text.textContent = message.messageText || "";
		bubbleWrap.appendChild(text);
		if (mine) wrapper.append(bubbleWrap, avatar);
		else wrapper.append(avatar, bubbleWrap);
		return wrapper;
	}

	createRoomToggle.addEventListener("click", () => {
		createRoomForm.hidden = !createRoomForm.hidden;
		if (!createRoomForm.hidden) document.getElementById("new-room-name").focus();
	});

	createRoomForm.addEventListener("submit", async event => {
		event.preventDefault();
		const roomTitle = document.getElementById("new-room-name").value.trim();
		const topic = document.getElementById("new-room-topic").value;
		const submit = document.getElementById("create-room-submit");
		if (!roomTitle) return;
		submit.disabled = true;
		submit.textContent = "Đang mở...";
		createRoomMessage.textContent = "";
		try {
			const response = await fetch(POSTS_API, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					type: "public-chat-room",
					roomTitle,
					topic,
					description: "",
					createdAt: new Date().toISOString(),
					lastActivity: new Date().toISOString(),
					members: [],
					onlineCount: 0
				})
			});
			if (!response.ok) throw new Error("Không thể tạo phòng.");
			const room = await response.json();
			createRoomForm.reset();
			createRoomForm.hidden = true;
			await loadRooms();
			await joinRoom(room);
		} catch (error) {
			createRoomMessage.textContent = "Chưa tạo được phòng. Hãy kiểm tra kết nối rồi thử lại.";
		} finally {
			submit.disabled = false;
			submit.textContent = "Mở phòng";
		}
	});

	roomSearch.addEventListener("input", renderRooms);
	filterButtons.forEach(button => {
		button.addEventListener("click", () => {
			activeTopic = button.dataset.topic;
			filterButtons.forEach(filter => {
				const active = filter === button;
				filter.classList.toggle("active", active);
				filter.setAttribute("aria-pressed", String(active));
			});
			renderRooms();
		});
	});

	messageForm.addEventListener("submit", async event => {
		event.preventDefault();
		const messageText = messageInput.value.trim();
		if (!activeRoom || !messageText) return;
		sendMessageButton.disabled = true;
		try {
			const response = await fetch(POSTS_API, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					type: "public-chat-message",
					roomId: String(activeRoom.id),
					senderId: visitorId,
					senderName: currentName,
					messageText,
					createdAt: new Date().toISOString()
				})
			});
			if (!response.ok) throw new Error("Không thể gửi tin nhắn.");
			messageInput.value = "";
			await loadMessages();
			messageList.scrollTop = messageList.scrollHeight;
			updateConversationPresence();
		} catch (error) {
			const notice = document.createElement("p");
			notice.className = "message-send-error";
			notice.textContent = "Gửi chưa thành công. Hãy thử lại.";
			messageForm.appendChild(notice);
			window.setTimeout(() => notice.remove(), 3500);
		} finally {
			sendMessageButton.disabled = false;
			messageInput.focus();
		}
	});

	messageInput.addEventListener("keydown", event => {
		if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault();
			messageForm.requestSubmit();
		}
	});

	document.getElementById("back-to-rooms").addEventListener("click", () => {
		document.body.classList.remove("room-open");
	});

	loadRooms();
	window.setInterval(() => {
		loadRooms();
		if (activeRoom) loadMessages();
	}, POLL_INTERVAL);
});
