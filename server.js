import { createServer as createHttpServer } from "node:http";
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "libsql";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SESSION_COOKIE = "dieu_session";
const SESSION_DURATION = 30 * 24 * 60 * 60 * 1000;
const OTP_DURATION = 10 * 60 * 1000;
const MAX_BODY_BYTES = 1024 * 1024;
const MAX_UPLOAD_BYTES = 10485760;
const UPLOAD_DIR = path.join(ROOT, "uploads");
const STATIC_EXTENSIONS = new Set([".html", ".js", ".css", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico", ".svg", ".pdf", ".doc", ".docx", ".txt"]);
const MIME_TYPES = {
	".css": "text/css; charset=utf-8",
	".gif": "image/gif",
	".html": "text/html; charset=utf-8",
	".ico": "image/x-icon",
	".jpeg": "image/jpeg",
	".jpg": "image/jpeg",
	".js": "text/javascript; charset=utf-8",
	".png": "image/png",
	".pdf": "application/pdf",
	".doc": "application/msword",
	".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	".svg": "image/svg+xml",
	".txt": "text/plain; charset=utf-8",
	".webp": "image/webp"
};

function serializeCookie(name, value, { maxAge, secure }) {
	const parts = [`${name}=${encodeURIComponent(value)}`, "HttpOnly", "Path=/"];
	if (maxAge !== undefined) parts.push(`Max-Age=${maxAge}`);
	if (secure) parts.push("SameSite=None", "Secure");
	else parts.push("SameSite=Lax");
	return parts.join("; ");
}

async function parseMultipart(request) {
	const contentType = request.headers["content-type"] || "";
	const boundary = parseBoundary(contentType);
	if (!boundary) throw makeError(400, "Thiếu boundary multipart.");
	const chunks = [];
	let size = 0;
	for await (const chunk of request) {
		size += chunk.length;
		if (size > MAX_UPLOAD_BYTES) throw makeError(413, "Tệp tải lên quá lớn.");
		chunks.push(chunk);
	}

	const raw = Buffer.concat(chunks);
	const boundaryBuf = Buffer.from(`--${boundary}`);
	const parts = [];
	let pos = raw.indexOf(boundaryBuf);
	while (pos !== -1) {
		const start = pos + boundaryBuf.length;
		if (raw.subarray(start, start + 2).equals(Buffer.from("--"))) break;
		const headerStart = raw.subarray(start, start + 2).equals(Buffer.from("\r\n")) ? start + 2 : start;
		const headerEnd = raw.indexOf(Buffer.from("\r\n\r\n"), headerStart);
		if (headerEnd === -1) break;
		const nextBoundary = raw.indexOf(boundaryBuf, headerEnd + 4);
		if (nextBoundary === -1) break;

		const headersText = raw.subarray(headerStart, headerEnd).toString("utf8");
		let body = raw.subarray(headerEnd + 4, nextBoundary);
		if (body.subarray(-2).equals(Buffer.from("\r\n"))) body = body.subarray(0, -2);

		const nameMatch = /name="([^"]+)"/i.exec(headersText);
		const fileMatch = /filename="([^"]*)"/i.exec(headersText);
		const typeMatch = /Content-Type:\s*([^\r\n;]+)/i.exec(headersText);
		if (nameMatch) {
			parts.push({
				name: nameMatch[1],
				fileName: fileMatch ? path.basename(fileMatch[1]) : "",
				contentType: typeMatch ? typeMatch[1].trim() : "",
				body
			});
		}
		pos = nextBoundary;
	}
	return parts;
}

function saveUploadedFile(filePart) {
	if (!filePart || !filePart.fileName || !filePart.body.length) return null;
	const ext = path.extname(filePart.fileName).toLowerCase();
	const allowedExts = new Set([".pdf", ".doc", ".docx", ".txt", ".png", ".jpg", ".jpeg", ".webp"]);
	if (!allowedExts.has(ext)) {
		throw makeError(400, "Chỉ hỗ trợ tệp PDF, DOC, DOCX, TXT hoặc ảnh.");
	}
	mkdirSync(UPLOAD_DIR, { recursive: true });
	const storedName = `${randomBytes(16).toString("hex")}${ext}`;
	writeFileSync(path.join(UPLOAD_DIR, storedName), filePart.body);
	return {
		fileUrl: `/uploads/${storedName}`,
		fileName: filePart.fileName,
		fileType: filePart.contentType || ext.slice(1).toUpperCase(),
		fileSize: filePart.body.length
	};
}

function makeError(statusCode, message) {
	const error = new Error(message);
	error.statusCode = statusCode;
	return error;
}

function hashValue(value) {
	return createHash("sha256").update(value).digest("hex");
}

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
	return { salt, hash: scryptSync(password, salt, 64).toString("hex") };
}

function verifyPassword(password, salt, expectedHash) {
	const candidate = scryptSync(password, salt, 64);
	const expected = Buffer.from(expectedHash, "hex");
	return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

function cleanUser(row) {
	if (!row) return null;
	return {
		id: row.id,
		name: row.name,
		email: row.email,
		studentClass: row.student_class,
		avatar: row.avatar,
		cover: row.cover,
		bio: row.bio,
		isAdmin: Boolean(row.is_admin),
		createdAt: row.created_at
	};
}

function profileUser(db, row) {
	if (!row) return null;
	const allApprovedClubs = db.prepare(`
		SELECT id, name, tag_color AS color, manager_id, manager_email, manager_emails
		FROM clubs WHERE status = 'approved'
		ORDER BY created_at
	`).all();
	const userEmail = String(row.email || "").toLowerCase();
	const profileTitles = allApprovedClubs
		.filter(club => {
			if (club.manager_id === row.id) return true;
			if (String(club.manager_email || "").toLowerCase() === userEmail) return true;
			try {
				const list = JSON.parse(club.manager_emails || "[]");
				return Array.isArray(list) && list.some(e => String(e || "").toLowerCase() === userEmail);
			} catch {
				return false;
			}
		})
		.map(({ id, name, color }) => ({ id, name, color }));
	return {
		...cleanUser(row),
		profileTitles
	};
}

function syncDb(db) { if (process.env.TURSO_DATABASE_URL) db.sync(); }

function initializeDatabase(dbPath) {
	if (dbPath !== ":memory:") mkdirSync(path.dirname(dbPath), { recursive: true });

	const db = new Database(dbPath, {
		syncUrl: process.env.TURSO_DATABASE_URL,
		authToken: process.env.TURSO_AUTH_TOKEN,
	});

	if (process.env.TURSO_DATABASE_URL) {
		syncDb(db);
	}

	db.exec("PRAGMA foreign_keys = ON;");
	db.exec(`
		CREATE TABLE IF NOT EXISTS users (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			email TEXT NOT NULL COLLATE NOCASE UNIQUE,
			password_hash TEXT NOT NULL,
			password_salt TEXT NOT NULL,
			student_class TEXT NOT NULL DEFAULT 'Học sinh NQD',
			avatar TEXT NOT NULL DEFAULT './DIEU.png',
			cover TEXT NOT NULL DEFAULT '',
			bio TEXT NOT NULL DEFAULT '',
			is_admin INTEGER NOT NULL DEFAULT 0,
			created_at TEXT NOT NULL
		);
		CREATE TABLE IF NOT EXISTS admin_emails (
			email TEXT PRIMARY KEY COLLATE NOCASE,
			created_at TEXT NOT NULL
		);
		CREATE TABLE IF NOT EXISTS clubs (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			manager_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			manager_email TEXT NOT NULL,
			manager_emails TEXT NOT NULL DEFAULT '[]',
			logo TEXT NOT NULL DEFAULT '',
			cover TEXT NOT NULL DEFAULT '',
			bio TEXT NOT NULL DEFAULT '',
			tag_color TEXT NOT NULL,
			status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
			requested_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			decided_by TEXT REFERENCES users(id) ON DELETE SET NULL,
			created_at TEXT NOT NULL,
			decided_at TEXT
		);
		CREATE TABLE IF NOT EXISTS club_posts (
			id TEXT PRIMARY KEY,
			club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
			author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			content TEXT NOT NULL,
			created_at TEXT NOT NULL
		);
		CREATE TABLE IF NOT EXISTS profile_achievements (
			id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			title TEXT NOT NULL,
			certificate_image TEXT NOT NULL DEFAULT '',
			created_at TEXT NOT NULL
		);
		CREATE TABLE IF NOT EXISTS profile_interests (
			id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			name TEXT NOT NULL COLLATE NOCASE,
			created_at TEXT NOT NULL,
			UNIQUE(user_id, name)
		);
		CREATE TABLE IF NOT EXISTS profile_photos (
			id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			image TEXT NOT NULL,
			caption TEXT NOT NULL DEFAULT '',
			created_at TEXT NOT NULL
		);
		CREATE TABLE IF NOT EXISTS sessions (
			token_hash TEXT PRIMARY KEY,
			user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			expires_at INTEGER NOT NULL,
			created_at TEXT NOT NULL
		);
		CREATE TABLE IF NOT EXISTS email_challenges (
			email TEXT NOT NULL COLLATE NOCASE,
			purpose TEXT NOT NULL,
			code_hash TEXT NOT NULL,
			payload TEXT NOT NULL,
			attempts INTEGER NOT NULL DEFAULT 0,
			expires_at INTEGER NOT NULL,
			PRIMARY KEY(email, purpose)
		);
		CREATE TABLE IF NOT EXISTS friendships (
			user_low TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			user_high TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			created_at TEXT NOT NULL,
			PRIMARY KEY(user_low, user_high),
			CHECK(user_low < user_high)
		);
		CREATE TABLE IF NOT EXISTS friend_requests (
			id TEXT PRIMARY KEY,
			sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			receiver_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'rejected')),
			created_at TEXT NOT NULL,
			UNIQUE(sender_id, receiver_id)
		);
		CREATE TABLE IF NOT EXISTS posts (
			id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			club_id TEXT REFERENCES clubs(id) ON DELETE CASCADE,
			content TEXT NOT NULL,
			image TEXT NOT NULL DEFAULT '',
			visibility TEXT NOT NULL CHECK(visibility IN ('public', 'private')),
			created_at TEXT NOT NULL
		);
		CREATE TABLE IF NOT EXISTS post_likes (
			post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
			user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			created_at TEXT NOT NULL,
			PRIMARY KEY(post_id, user_id)
		);
		CREATE TABLE IF NOT EXISTS post_comments (
			id TEXT PRIMARY KEY,
			post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
			user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			content TEXT NOT NULL,
			created_at TEXT NOT NULL
		);
		CREATE TABLE IF NOT EXISTS conversations (
			id TEXT PRIMARY KEY,
			type TEXT NOT NULL CHECK(type IN ('direct', 'group')),
			name TEXT NOT NULL DEFAULT '',
			created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			created_at TEXT NOT NULL
		);
		CREATE TABLE IF NOT EXISTS conversation_members (
			conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
			user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			joined_at TEXT NOT NULL,
			PRIMARY KEY(conversation_id, user_id)
		);
		CREATE TABLE IF NOT EXISTS messages (
			id TEXT PRIMARY KEY,
			conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
			sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			content TEXT NOT NULL,
			created_at TEXT NOT NULL
		);
		CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
		CREATE INDEX IF NOT EXISTS friend_requests_receiver_idx ON friend_requests(receiver_id, status);
		CREATE INDEX IF NOT EXISTS posts_visibility_idx ON posts(visibility, created_at);
		CREATE INDEX IF NOT EXISTS conversation_members_user_idx ON conversation_members(user_id);
		CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages(conversation_id, created_at);
	`);

	const userColumns = db.prepare("PRAGMA table_info(users)").all().map(column => column.name);
	if (!userColumns.includes("is_admin")) db.exec("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0");

	const clubColumns = db.prepare("PRAGMA table_info(clubs)").all().map(column => column.name);
	const clubAlters = [];
	if (!clubColumns.includes("manager_emails")) clubAlters.push("ADD COLUMN manager_emails TEXT NOT NULL DEFAULT '[]'");
	if (!clubColumns.includes("cover")) clubAlters.push("ADD COLUMN cover TEXT NOT NULL DEFAULT ''");
	if (!clubColumns.includes("bio")) clubAlters.push("ADD COLUMN bio TEXT NOT NULL DEFAULT ''");
	for (const alter of clubAlters) {
		db.exec(`ALTER TABLE clubs ${alter}`);
	}

	const postColumns = db.prepare("PRAGMA table_info(posts)").all().map(column => column.name);
	const postAlters = [];
	if (!postColumns.includes("club_id")) postAlters.push("ADD COLUMN club_id TEXT REFERENCES clubs(id) ON DELETE CASCADE");
	if (!postColumns.includes("type")) postAlters.push("ADD COLUMN type TEXT NOT NULL DEFAULT \"post\"");
	if (!postColumns.includes("resource_title")) postAlters.push("ADD COLUMN resource_title TEXT NOT NULL DEFAULT \"\"");
	if (!postColumns.includes("resource_description")) postAlters.push("ADD COLUMN resource_description TEXT NOT NULL DEFAULT \"\"");
	if (!postColumns.includes("resource_link")) postAlters.push("ADD COLUMN resource_link TEXT NOT NULL DEFAULT \"\"");
	if (!postColumns.includes("resource_grade")) postAlters.push("ADD COLUMN resource_grade TEXT NOT NULL DEFAULT \"\"");
	if (!postColumns.includes("resource_track")) postAlters.push("ADD COLUMN resource_track TEXT NOT NULL DEFAULT \"\"");
	if (!postColumns.includes("resource_subject")) postAlters.push("ADD COLUMN resource_subject TEXT NOT NULL DEFAULT \"\"");
	if (!postColumns.includes("resource_file_url")) postAlters.push("ADD COLUMN resource_file_url TEXT NOT NULL DEFAULT \"\"");
	if (!postColumns.includes("resource_file_name")) postAlters.push("ADD COLUMN resource_file_name TEXT NOT NULL DEFAULT \"\"");
	if (!postColumns.includes("resource_file_type")) postAlters.push("ADD COLUMN resource_file_type TEXT NOT NULL DEFAULT \"\"");
	if (!postColumns.includes("resource_file_size")) postAlters.push("ADD COLUMN resource_file_size INTEGER NOT NULL DEFAULT 0");
	if (!postColumns.includes("resource_cover_color")) postAlters.push("ADD COLUMN resource_cover_color TEXT NOT NULL DEFAULT \"\"");
	for (const alter of postAlters) {
		db.exec(`ALTER TABLE posts ${alter}`);
	}

	if (process.env.TURSO_DATABASE_URL) {
		syncDb(db);
	}

	const now = new Date().toISOString();
	db.prepare("INSERT OR IGNORE INTO admin_emails(email, created_at) VALUES (?, ?)").run("k18th.hao2802@nqd.edu.vn", now); syncDb(db);
	db.prepare("UPDATE users SET is_admin = 1 WHERE email IN (SELECT email FROM admin_emails)").run(); syncDb(db);
	return db;
}

async function readJson(request) {
	const chunks = [];
	let size = 0;
	for await (const chunk of request) {
		size += chunk.length;
		if (size > MAX_BODY_BYTES) throw makeError(413, "Yêu cầu quá lớn.");
		chunks.push(chunk);
	}
	if (!chunks.length) return {};
	try {
		return JSON.parse(Buffer.concat(chunks).toString("utf8"));
	} catch {
		throw makeError(400, "Dữ liệu JSON không hợp lệ.");
	}
}

function sendJson(response, statusCode, payload, headers = {}) {
	response.writeHead(statusCode, { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8", ...headers });
	response.end(JSON.stringify(payload));
}

function parseBoundary(contentType) {
	const match = /boundary=([^;]+)/i.exec(contentType || "");
	return match ? match[1].trim() : null;
}

function parseCookies(request) {
	const cookieHeader = request.headers.cookie || "";
	return Object.fromEntries(cookieHeader.split(";").map(part => {
		const separator = part.indexOf("=");
		return separator < 0 ? ["", ""] : [part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1).trim())];
	}));
}

function getUserForRequest(db, request) {
	const authHeader = request.headers.authorization || "";
	let sessionToken = null;

	if (authHeader.startsWith("Bearer ")) {
		sessionToken = authHeader.slice(7).trim();
	} else {
		sessionToken = parseCookies(request)[SESSION_COOKIE];
	}

	if (!sessionToken) return null;

	const row = db.prepare(`
		SELECT users.* FROM sessions
		JOIN users ON users.id = sessions.user_id
		WHERE sessions.token_hash = ? AND sessions.expires_at > ?
	`).get(hashValue(sessionToken), Date.now());

	return profileUser(db, row);
}

function requireAdmin(user) {
	if (!user.isAdmin) throw makeError(403, "Chỉ quản trị viên mới có thể thực hiện thao tác này.");
}

function clubForViewer(db, row) {
	const manager = db.prepare("SELECT id, name, email, avatar FROM users WHERE id = ?").get(row.manager_id);
	const requester = db.prepare("SELECT name, email FROM users WHERE id = ?").get(row.requested_by);
	let managerEmails = [row.manager_email];
	if (row.manager_emails) {
		try {
			const parsed = JSON.parse(row.manager_emails);
			if (Array.isArray(parsed) && parsed.length) managerEmails = parsed;
		} catch {}
	}
	return {
		id: row.id,
		name: row.name,
		manager: manager ? { id: manager.id, name: manager.name, email: manager.email, avatar: manager.avatar } : null,
		managerEmail: row.manager_email,
		managerEmails,
		logo: row.logo,
		cover: row.cover || "",
		bio: row.bio || "",
		tagColor: row.tag_color,
		status: row.status,
		requestedBy: requester?.name || "Thành viên",
		requestedById: row.requested_by,
		createdAt: row.created_at
	};
}

function requireUser(db, request) {
	const user = getUserForRequest(db, request);
	if (!user) throw makeError(401, "Đăng nhập để tiếp tục.");
	return user;
}

function setSession(db, userId, response, secure) {
	const token = randomBytes(32).toString("hex");
	const expiresAt = Date.now() + SESSION_DURATION;

	db.prepare("INSERT INTO sessions(token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
		.run(hashValue(token), userId, expiresAt, new Date().toISOString()); syncDb(db);

	return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=None; Path=/; Max-Age=${SESSION_DURATION / 1000}; Secure`;
}

function clearSession(db, request, secure) {
	const authHeader = request.headers.authorization || "";
	const sessionToken = authHeader.startsWith("Bearer ")
		? authHeader.slice(7).trim()
		: parseCookies(request)[SESSION_COOKIE];

	if (sessionToken) {
		db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashValue(sessionToken)); syncDb(db);
	}
	return serializeCookie(SESSION_COOKIE, "", { maxAge: 0, secure });
}

function relationship(db, viewerId, otherId) {
	if (viewerId === otherId) return "self";
	const low = viewerId < otherId ? viewerId : otherId;
	const high = viewerId < otherId ? otherId : viewerId;
	if (db.prepare("SELECT 1 FROM friendships WHERE user_low = ? AND user_high = ?").get(low, high)) return "friend";
	if (db.prepare("SELECT 1 FROM friend_requests WHERE sender_id = ? AND receiver_id = ? AND status = 'pending'").get(otherId, viewerId)) return "incoming";
	if (db.prepare("SELECT 1 FROM friend_requests WHERE sender_id = ? AND receiver_id = ? AND status = 'pending'").get(viewerId, otherId)) return "outgoing";
	return "none";
}

function publicUser(db, row, viewerId) {
	return { ...cleanUser(row), relationship: relationship(db, viewerId, row.id) };
}

function ensureConversation(db, userA, userB) {
	const pair = [userA, userB].sort();
	const id = `direct-${pair[0]}-${pair[1]}`;
	const now = new Date().toISOString();
	db.prepare("INSERT OR IGNORE INTO conversations(id, type, name, created_by, created_at) VALUES (?, 'direct', '', ?, ?)")
		.run(id, pair[0], now); syncDb(db);
	const addMember = db.prepare("INSERT OR IGNORE INTO conversation_members(conversation_id, user_id, joined_at) VALUES (?, ?, ?)");
	addMember.run(id, pair[0], now); syncDb(db);
	addMember.run(id, pair[1], now); syncDb(db);
	return id;
}

function isConversationMember(db, conversationId, userId) {
	return Boolean(db.prepare("SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?").get(conversationId, userId));
}

function canViewPost(db, post, userId) {
	return post.visibility === "public" || post.user_id === userId;
}

function postForViewer(db, row, viewerId) {
	const author = db.prepare("SELECT name, email, avatar FROM users WHERE id = ?").get(row.user_id);
	const club = row.club_id ? db.prepare("SELECT id, name, logo FROM clubs WHERE id = ?").get(row.club_id) : null;

	const comments = db.prepare(`
		SELECT comments.id, comments.content AS text, comments.created_at AS createdAt,
			users.name, users.avatar, users.email
		FROM post_comments AS comments JOIN users ON users.id = comments.user_id
		WHERE comments.post_id = ? ORDER BY comments.created_at
	`).all(row.id);
	const likes = db.prepare("SELECT COUNT(*) AS count FROM post_likes WHERE post_id = ?").get(row.id).count;
	const likedByMe = Boolean(db.prepare("SELECT 1 FROM post_likes WHERE post_id = ? AND user_id = ?").get(row.id, viewerId));

	return {
		id: row.id,
		userId: row.user_id,
		clubId: club ? club.id : null,
		type: row.type || "post",
		name: club ? club.name : (author?.name || author?.email || "Thành viên"),
		authorEmail: author?.email || "",
		avatar: club ? (club.logo || "./DIEU.png") : (author?.avatar || "./DIEU.png"),
		content: row.content,
		image: row.image,
		visibility: row.visibility,
		createdAt: row.created_at,
		likes,
		likedByMe,
		comments,
		resource_title: row.resource_title,
		resource_description: row.resource_description,
		resource_link: row.resource_link,
		resource_grade: row.resource_grade,
		resource_track: row.resource_track,
		resource_subject: row.resource_subject,
		resource_file_url: row.resource_file_url,
		resource_file_name: row.resource_file_name,
		resource_file_type: row.resource_file_type,
		resource_cover_color: row.resource_cover_color
	};
}

async function sendOtp(email, code, purpose, env) {
	if (env.EMAILJS_ENABLED === "0") return { sent: false, devCode: env.NODE_ENV === "production" ? undefined : code };
	const serviceId = env.EMAILJS_SERVICE_ID || "service_j0qzork";
	const templateId = env.EMAILJS_TEMPLATE_ID || "template_qookhtj";
	const publicKey = env.EMAILJS_PUBLIC_KEY || "dViu70h7kpGKrNHN0";
	try {
		const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				service_id: serviceId,
				template_id: templateId,
				user_id: publicKey,
				template_params: { email, to_email: email, otp_code: code, purpose }
			})
		});
		if (!response.ok) throw new Error("EmailJS từ chối gửi mã.");
		return { sent: true };
	} catch (error) {
		if (env.NODE_ENV === "production") throw makeError(502, "Không gửi được mã xác nhận qua email.");
		return { sent: false, devCode: code };
	}
}

function validateEmail(email) {
	const normalized = String(email || "").trim().toLowerCase();
	if (!/^[^\s@]+@nqd\.edu\.vn$/.test(normalized)) throw makeError(400, "Vui lòng dùng email trường @nqd.edu.vn.");
	return normalized;
}

function validatePassword(password) {
	if (typeof password !== "string" || password.length < 8 || password.length > 200) {
		throw makeError(400, "Mật khẩu phải có ít nhất 8 ký tự.");
	}
}

function validateProfileImage(value, required = false) {
	const image = String(value || "").trim();
	if (!image && !required) return "";
	if (image.length > 700000 || !/^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/]+={0,2}$/i.test(image)) {
		throw makeError(400, "Ảnh phải là PNG, JPG, WEBP hoặc GIF và không vượt quá 500 KB.");
	}
	return image;
}

function serializeConversation(db, row, userId) {
	const members = db.prepare(`
		SELECT users.id, users.name, users.email, users.avatar
		FROM conversation_members JOIN users ON users.id = conversation_members.user_id
		WHERE conversation_members.conversation_id = ?
	`).all(row.id);
	const lastMessage = db.prepare("SELECT content, sender_id, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1").get(row.id);
	const counterpart = row.type === "direct" ? members.find(member => member.id !== userId) : null;
	return {
		id: row.id,
		type: row.type,
		name: row.type === "group" ? row.name : counterpart?.name || counterpart?.email || "Bạn bè",
		createdBy: row.created_by,
		subtitle: row.type === "group" ? `${members.length} thành viên` : counterpart?.email || "Cuộc trò chuyện riêng",
		avatar: counterpart?.avatar || "",
		memberIds: members.map(member => member.id),
		lastMessage: lastMessage ? { text: lastMessage.content, fromId: lastMessage.sender_id, createdAt: lastMessage.created_at } : null
	};
}

function createServer(options = {}) {
	const env = options.env || process.env;
	const dbPath = options.dbPath || env.DATABASE_PATH || path.join(ROOT, "data", "dieunw-turso.sqlite");
	const db = options.db || initializeDatabase(dbPath);
	const server = createHttpServer(async (request, response) => {
		const host = request.headers.host || "localhost";
		const url = new URL(request.url || "/", `http://${host}`);
		const secure = Boolean(request.socket.encrypted || env.COOKIE_SECURE === "1");
		try {
			if (url.pathname.startsWith("/api/")) {
				await handleApi({ request, response, url, db, env, secure });
				return;
			}
			if (request.method === "GET" && url.pathname.startsWith("/uploads/")) {
				const fileName = path.basename(decodeURIComponent(url.pathname.slice("/uploads/".length)));
				const filePath = path.join(UPLOAD_DIR, fileName);
				if (!existsSync(filePath) || !statSync(filePath).isFile()) throw makeError(404, "Không tìm thấy tệp.");
				response.writeHead(200, { "Content-Type": MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream" });
				createReadStream(filePath).pipe(response);
				return;
			}
			serveStatic(request, response, url);
		} catch (error) {
			if (!response.headersSent) {
				console.error("Chi tiết lỗi máy chủ:", error);
				sendJson(response, error.statusCode || 500, { error: error.statusCode ? error.message : "Lỗi máy chủ." });
			} else {
				response.destroy();
			}
		}
	});
	server.database = db;
	return server;
}

async function handleApi({ request, response, url, db, env, secure }) {
	const { pathname } = url;
	const method = request.method || "GET";

	const allowedOrigin = "https://hao-cpp.github.io";
	const origin = request.headers.origin;

	if (origin && origin !== allowedOrigin) {
		throw makeError(403, "Nguồn yêu cầu không được phép.");
	}

	if (origin === allowedOrigin) {
		response.setHeader("Access-Control-Allow-Origin", allowedOrigin);
		response.setHeader("Access-Control-Allow-Credentials", "true");
		response.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
		response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
		response.setHeader("Vary", "Origin");
	}

	if (method === "OPTIONS") {
		response.writeHead(204);
		response.end();
		return;
	}
	if (method === "GET" && pathname === "/api/auth/me") {
		sendJson(response, 200, { user: getUserForRequest(db, request) });
		return;
	}
	if (method === "POST" && pathname === "/api/auth/logout") {
		sendJson(response, 200, { ok: true }, { "Set-Cookie": clearSession(db, request, secure) });
		return;
	}
	if (method === "POST" && pathname === "/api/auth/login") {
		const body = await readJson(request);
		const email = validateEmail(body.email);
		const user = db.prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE").get(email);
		if (!user || !verifyPassword(String(body.password || ""), user.password_salt, user.password_hash)) {
			throw makeError(401, "Email hoặc mật khẩu không chính xác.");
		}
		const cookie = setSession(db, user.id, response, secure);
		const token = cookie.split(";")[0].split("=")[1];

		sendJson(response, 200, { user: profileUser(db, user), token }, { "Set-Cookie": cookie });
		return;
	}

	if (method === "POST" && pathname === "/api/auth/register/start") {
		const body = await readJson(request);
		const name = String(body.name || "").trim();
		const email = validateEmail(body.email);
		validatePassword(body.password);
		if (!name || name.length > 80) throw makeError(400, "Tên hiển thị không hợp lệ.");
		if (db.prepare("SELECT 1 FROM users WHERE email = ? COLLATE NOCASE").get(email)) throw makeError(409, "Email này đã đăng ký.");
		const password = hashPassword(body.password);
		const code = randomBytes(3).readUIntBE(0, 3).toString().padStart(6, "0").slice(-6);
		const payload = JSON.stringify({ name, password_hash: password.hash, password_salt: password.salt });
		db.prepare(`
			INSERT INTO email_challenges(email, purpose, code_hash, payload, attempts, expires_at)
			VALUES (?, 'register', ?, ?, 0, ?)
			ON CONFLICT(email, purpose) DO UPDATE SET code_hash = excluded.code_hash, payload = excluded.payload, attempts = 0, expires_at = excluded.expires_at
		`).run(email, hashValue(`${email}:${code}`), payload, Date.now() + OTP_DURATION); syncDb(db);
		const delivery = await sendOtp(email, code, "Đăng ký", env);
		sendJson(response, 200, { ok: true, email, expiresIn: OTP_DURATION / 1000, ...(delivery.devCode ? { devCode: delivery.devCode } : {}) });
		return;
	}
	if (method === "POST" && pathname === "/api/auth/register/verify") {
		const body = await readJson(request);
		const email = validateEmail(body.email);
		const challenge = db.prepare("SELECT * FROM email_challenges WHERE email = ? COLLATE NOCASE AND purpose = 'register'").get(email);
		if (!challenge || challenge.expires_at < Date.now() || challenge.attempts >= 5 || challenge.code_hash !== hashValue(`${email}:${String(body.code || "")}`)) {
			if (challenge) { db.prepare("UPDATE email_challenges SET attempts = attempts + 1 WHERE email = ? AND purpose = 'register'").run(email); syncDb(db); }
			throw makeError(400, "Mã xác nhận không hợp lệ hoặc đã hết hạn.");
		}
		const pending = JSON.parse(challenge.payload);
		const userId = randomBytes(16).toString("hex");
		const now = new Date().toISOString();
		db.prepare(`
			INSERT INTO users(id, name, email, password_hash, password_salt, student_class, avatar, cover, bio, is_admin, created_at)
			VALUES (?, ?, ?, ?, ?, 'Học sinh NQD', './DIEU.png', '', 'Chào mừng đến với góc học tập của mình trên DIEUNW!',
				EXISTS(SELECT 1 FROM admin_emails WHERE email = ? COLLATE NOCASE), ?)
		`).run(userId, pending.name, email, pending.password_hash, pending.password_salt, email, now); syncDb(db);
		db.prepare("DELETE FROM email_challenges WHERE email = ? AND purpose = 'register'").run(email); syncDb(db);
		const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
		const cookie = setSession(db, userId, response, secure);
		const token = cookie.split(";")[0].split("=")[1];
		sendJson(response, 201, { user: profileUser(db, user), token }, { "Set-Cookie": cookie });
		return;
	}
	if (method === "POST" && pathname === "/api/auth/password/start") {
		const body = await readJson(request);
		const email = validateEmail(body.email);
		const user = db.prepare("SELECT id FROM users WHERE email = ? COLLATE NOCASE").get(email);
		if (!user) {
			sendJson(response, 200, { ok: true });
			return;
		}
		const code = randomBytes(3).readUIntBE(0, 3).toString().padStart(6, "0").slice(-6);
		db.prepare(`
			INSERT INTO email_challenges(email, purpose, code_hash, payload, attempts, expires_at)
			VALUES (?, 'password', ?, ?, 0, ?)
			ON CONFLICT(email, purpose) DO UPDATE SET code_hash = excluded.code_hash, payload = excluded.payload, attempts = 0, expires_at = excluded.expires_at
		`).run(email, hashValue(`${email}:${code}`), JSON.stringify({ userId: user.id }), Date.now() + OTP_DURATION); syncDb(db);
		const delivery = await sendOtp(email, code, "Khôi phục mật khẩu", env);
		sendJson(response, 200, { ok: true, ...(delivery.devCode ? { devCode: delivery.devCode } : {}) });
		return;
	}
	if (method === "POST" && pathname === "/api/auth/password/verify") {
		const body = await readJson(request);
		const email = validateEmail(body.email);
		validatePassword(body.password);
		const challenge = db.prepare("SELECT * FROM email_challenges WHERE email = ? COLLATE NOCASE AND purpose = 'password'").get(email);
		if (!challenge || challenge.expires_at < Date.now() || challenge.attempts >= 5 || challenge.code_hash !== hashValue(`${email}:${String(body.code || "")}`)) {
			if (challenge) { db.prepare("UPDATE email_challenges SET attempts = attempts + 1 WHERE email = ? AND purpose = 'password'").run(email); syncDb(db); }
			throw makeError(400, "Mã xác nhận không hợp lệ hoặc đã hết hạn.");
		}
		const pending = JSON.parse(challenge.payload);
		const password = hashPassword(body.password);
		db.prepare("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?").run(password.hash, password.salt, pending.userId); syncDb(db);
		db.prepare("DELETE FROM email_challenges WHERE email = ? AND purpose = 'password'").run(email); syncDb(db);
		db.prepare("DELETE FROM sessions WHERE user_id = ?").run(pending.userId); syncDb(db);
		const cookie = setSession(db, pending.userId, response, secure);
		const token = cookie.split(";")[0].split("=")[1];
		sendJson(response, 200, { user: profileUser(db, db.prepare("SELECT * FROM users WHERE id = ?").get(pending.userId)), token }, { "Set-Cookie": cookie });
		return;
	}

	const optionalUser = getUserForRequest(db, request);
	if (method === "GET" && pathname === "/api/clubs") {
		const rows = optionalUser?.isAdmin
			? db.prepare("SELECT * FROM clubs ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC LIMIT 200").all()
			: db.prepare("SELECT * FROM clubs WHERE status = 'approved' OR requested_by = ? ORDER BY created_at DESC LIMIT 200").all(optionalUser?.id || "");
		sendJson(response, 200, { clubs: rows.map(row => clubForViewer(db, row)) });
		return;
	}

	// LẤY CHI TIẾT 1 CLB CHO TRANG FANPAGE (Khách chưa đăng nhập cũng xem được CLB đã duyệt)
	const clubDetailMatch = pathname.match(/^\/api\/clubs\/([^/]+)$/);
	if (method === "GET" && clubDetailMatch) {
		const clubId = decodeURIComponent(clubDetailMatch[1]);
		const row = db.prepare("SELECT * FROM clubs WHERE id = ?").get(clubId);
		if (!row) throw makeError(404, "Không tìm thấy CLB.");
		const club = clubForViewer(db, row);
		const canViewUnapproved = Boolean(
			optionalUser && (
				optionalUser.isAdmin
				|| row.requested_by === optionalUser.id
				|| club.managerEmails.some(e => String(e || "").toLowerCase() === optionalUser.email.toLowerCase())
			)
		);
		if (row.status !== "approved" && !canViewUnapproved) {
			throw makeError(404, "Không tìm thấy CLB.");
		}
		const clubPosts = db.prepare("SELECT * FROM posts WHERE club_id = ? AND visibility = 'public' ORDER BY created_at DESC LIMIT 100")
			.all(clubId)
			.map(post => postForViewer(db, post, optionalUser?.id || ""));
		sendJson(response, 200, { club, posts: clubPosts });
		return;
	}

	if (method === "GET" && pathname === "/api/announcements") {
		const posts = db.prepare(`
			SELECT club_posts.*, clubs.name AS club_name, clubs.logo AS club_logo, clubs.tag_color,
				users.name AS author_name
			FROM club_posts JOIN clubs ON clubs.id = club_posts.club_id
			JOIN users ON users.id = club_posts.author_id
			WHERE clubs.status = 'approved' ORDER BY club_posts.created_at DESC LIMIT 100
		`).all().map(row => ({
			id: row.id,
			clubId: row.club_id,
			clubName: row.club_name,
			clubLogo: row.club_logo,
			tagColor: row.tag_color,
			content: row.content,
			author: { name: row.author_name },
			createdAt: row.created_at
		}));
		sendJson(response, 200, { posts });
		return;
	}
	if (method === "GET" && pathname === "/api/users") {
		const term = String(url.searchParams.get("q") || "").trim();
		const rows = term
			? db.prepare("SELECT * FROM users WHERE name LIKE ? OR email LIKE ? ORDER BY name LIMIT 100").all(`%${term}%`, `%${term}%`)
			: db.prepare("SELECT * FROM users ORDER BY name LIMIT 100").all();
		sendJson(response, 200, {
			users: rows.map(row => publicUser(db, row, optionalUser?.id || "")),
			currentUser: optionalUser
		});
		return;
	}

	const user = optionalUser || requireUser(db, request);
	if (!user) throw makeError(401, "Đăng nhập để tiếp tục.");

	if (method === "GET" && pathname === "/api/profile/sections") {
		const achievements = db.prepare("SELECT id, title, certificate_image AS certificateImage, created_at AS createdAt FROM profile_achievements WHERE user_id = ? ORDER BY created_at DESC").all(user.id);
		const interests = db.prepare("SELECT id, name, created_at AS createdAt FROM profile_interests WHERE user_id = ? ORDER BY created_at DESC").all(user.id);
		const photos = db.prepare("SELECT id, image, caption, created_at AS createdAt FROM profile_photos WHERE user_id = ? ORDER BY created_at DESC").all(user.id);
		sendJson(response, 200, { achievements, interests, photos });
		return;
	}
	if (method === "POST" && pathname === "/api/profile/achievements") {
		const body = await readJson(request);
		const title = String(body.title || "").trim();
		if (!title || title.length > 100) throw makeError(400, "Tên thành tích phải có từ 1 đến 100 ký tự.");
		if (db.prepare("SELECT COUNT(*) AS count FROM profile_achievements WHERE user_id = ?").get(user.id).count >= 30) throw makeError(409, "Mỗi hồ sơ có thể lưu tối đa 30 thành tích.");
		const id = randomBytes(16).toString("hex");
		const createdAt = new Date().toISOString();
		const certificateImage = validateProfileImage(body.certificateImage);
		db.prepare("INSERT INTO profile_achievements(id, user_id, title, certificate_image, created_at) VALUES (?, ?, ?, ?, ?)").run(id, user.id, title, certificateImage, createdAt); syncDb(db);
		sendJson(response, 201, { achievement: { id, title, certificateImage, createdAt } });
		return;
	}
	if (method === "POST" && pathname === "/api/profile/interests") {
		const body = await readJson(request);
		const name = String(body.name || "").trim();
		if (!name || name.length > 40) throw makeError(400, "Sở thích phải có từ 1 đến 40 ký tự.");
		if (db.prepare("SELECT COUNT(*) AS count FROM profile_interests WHERE user_id = ?").get(user.id).count >= 30) throw makeError(409, "Mỗi hồ sơ có thể lưu tối đa 30 sở thích.");
		const id = randomBytes(16).toString("hex");
		const createdAt = new Date().toISOString();
		try {
			db.prepare("INSERT INTO profile_interests(id, user_id, name, created_at) VALUES (?, ?, ?, ?)").run(id, user.id, name, createdAt); syncDb(db);
		} catch {
			throw makeError(409, "Sở thích này đã có trong hồ sơ.");
		}
		sendJson(response, 201, { interest: { id, name, createdAt } });
		return;
	}
	if (method === "POST" && pathname === "/api/profile/photos") {
		const body = await readJson(request);
		const image = validateProfileImage(body.image, true);
		const caption = String(body.caption || "").trim();
		if (caption.length > 160) throw makeError(400, "Chú thích ảnh không được vượt quá 160 ký tự.");
		if (db.prepare("SELECT COUNT(*) AS count FROM profile_photos WHERE user_id = ?").get(user.id).count >= 50) throw makeError(409, "Album có thể lưu tối đa 50 ảnh.");
		const id = randomBytes(16).toString("hex");
		const createdAt = new Date().toISOString();
		db.prepare("INSERT INTO profile_photos(id, user_id, image, caption, created_at) VALUES (?, ?, ?, ?, ?)").run(id, user.id, image, caption, createdAt); syncDb(db);
		sendJson(response, 201, { photo: { id, image, caption, createdAt } });
		return;
	}
	const profileItem = pathname.match(/^\/api\/profile\/(achievements|interests|photos)\/([^/]+)$/);
	if (method === "DELETE" && profileItem) {
		const table = { achievements: "profile_achievements", interests: "profile_interests", photos: "profile_photos" }[profileItem[1]];
		const itemId = decodeURIComponent(profileItem[2]);
		const result = db.prepare(`DELETE FROM ${table} WHERE id = ? AND user_id = ?`).run(itemId, user.id); syncDb(db);
		if (!result.changes) throw makeError(404, "Không tìm thấy mục trong hồ sơ của bạn.");
		sendJson(response, 200, { ok: true });
		return;
	}

	if (method === "POST" && pathname === "/api/clubs") {
		const body = await readJson(request);
		const name = String(body.name || "").trim();
		const tagColor = String(body.tagColor || "").trim();
		const logo = String(body.logo || "").trim();

		const rawList = Array.isArray(body.managerEmails) ? body.managerEmails : [body.managerEmail];
		const managerEmails = [...new Set(rawList.map(e => validateEmail(e)))];

		if (!name || name.length > 80) throw makeError(400, "Tên CLB phải có từ 1 đến 80 ký tự.");
		if (!managerEmails.length) throw makeError(400, "Cần ít nhất 1 email quản lý.");
		if (!/^#[0-9a-f]{6}$/i.test(tagColor)) throw makeError(400, "Màu tag không hợp lệ.");
		if (logo.length > 700000 || (logo && !(/^(https?:\/\/|data:image\/(png|jpeg|webp|gif);base64,)/i.test(logo)))) {
			throw makeError(400, "Logo phải là ảnh PNG, JPG, WEBP hoặc GIF hợp lệ.");
		}

		const managers = managerEmails.map(email => {
			const m = db.prepare("SELECT id FROM users WHERE email = ? COLLATE NOCASE").get(email);
			if (!m) throw makeError(404, `Email ${email} chưa có tài khoản DIEUNW.`);
			return m;
		});

		const id = randomBytes(16).toString("hex");
		const createdAt = new Date().toISOString();
		const bio = `Fanpage chính thức của ${name}`;

		db.prepare("INSERT INTO clubs(id, name, manager_id, manager_email, manager_emails, logo, cover, bio, tag_color, requested_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
			.run(id, name, managers[0].id, managerEmails[0], JSON.stringify(managerEmails), logo, "", bio, tagColor, user.id, createdAt);
		syncDb(db);

		sendJson(response, 201, { club: clubForViewer(db, db.prepare("SELECT * FROM clubs WHERE id = ?").get(id)) });
		return;
	}

	// CẬP NHẬT FANPAGE CLB (Chỉ quản lý CLB hoặc Admin mới được sửa)
	if (method === "PATCH" && clubDetailMatch) {
		const clubId = decodeURIComponent(clubDetailMatch[1]);
		const row = db.prepare("SELECT * FROM clubs WHERE id = ?").get(clubId);
		if (!row) throw makeError(404, "Không tìm thấy CLB.");

		const currentClub = clubForViewer(db, row);
		const isAllowed = currentClub.managerEmails.some(e => String(e || "").toLowerCase() === user.email.toLowerCase()) || user.isAdmin;
		if (!isAllowed) {
			throw makeError(403, "Bạn không có quyền chỉnh sửa Fanpage CLB này.");
		}

		const body = await readJson(request);
		const newName = body.name !== undefined ? String(body.name).trim() : row.name;
		const newLogo = body.logo !== undefined ? String(body.logo).trim().slice(0, 700000) : row.logo;
		const newCover = body.cover !== undefined ? String(body.cover).trim().slice(0, 700000) : (row.cover || "");
		const newBio = body.bio !== undefined ? String(body.bio).trim().slice(0, 500) : (row.bio || "");

		if (!newName || newName.length > 80) throw makeError(400, "Tên CLB không hợp lệ.");

		db.prepare("UPDATE clubs SET name = ?, logo = ?, cover = ?, bio = ? WHERE id = ?")
			.run(newName, newLogo, newCover, newBio, clubId);
		syncDb(db);

		sendJson(response, 200, { club: clubForViewer(db, db.prepare("SELECT * FROM clubs WHERE id = ?").get(clubId)) });
		return;
	}

	if (method === "GET" && pathname === "/api/admins") {
		requireAdmin(user);
		const admins = db.prepare("SELECT email FROM admin_emails ORDER BY email").all();
		sendJson(response, 200, { admins: admins.map(admin => admin.email) });
		return;
	}

	if (method === "POST" && pathname === "/api/admins") {
		requireAdmin(user);
		const body = await readJson(request);
		const email = validateEmail(body.email);
		db.prepare("INSERT OR IGNORE INTO admin_emails(email, created_at) VALUES (?, ?)").run(email, new Date().toISOString()); syncDb(db);
		db.prepare("UPDATE users SET is_admin = 1 WHERE email = ? COLLATE NOCASE").run(email); syncDb(db);
		sendJson(response, 200, { ok: true, email, accountExists: Boolean(db.prepare("SELECT 1 FROM users WHERE email = ? COLLATE NOCASE").get(email)) });
		return;
	}

	const clubDecision = pathname.match(/^\/api\/clubs\/([^/]+)\/decision$/);
	if (method === "POST" && clubDecision) {
		requireAdmin(user);
		const body = await readJson(request);
		if (!["approved", "rejected"].includes(body.status)) throw makeError(400, "Trạng thái duyệt không hợp lệ.");
		const clubId = decodeURIComponent(clubDecision[1]);
		const result = db.prepare("UPDATE clubs SET status = ?, decided_by = ?, decided_at = ? WHERE id = ? AND status = 'pending'")
			.run(body.status, user.id, new Date().toISOString(), clubId); syncDb(db);
		if (!result.changes) throw makeError(404, "Không tìm thấy yêu cầu CLB đang chờ duyệt.");
		sendJson(response, 200, { club: clubForViewer(db, db.prepare("SELECT * FROM clubs WHERE id = ?").get(clubId)) });
		return;
	}

	const clubPost = pathname.match(/^\/api\/clubs\/([^/]+)\/posts$/);
	if (method === "POST" && clubPost) {
		const clubId = decodeURIComponent(clubPost[1]);
		const club = db.prepare("SELECT * FROM clubs WHERE id = ? AND status = 'approved'").get(clubId);
		if (!club) throw makeError(404, "Không tìm thấy CLB đã được duyệt.");
		const clubData = clubForViewer(db, club);
		const isClubManager = club.manager_id === user.id || clubData.managerEmails.some(e => String(e || "").toLowerCase() === user.email.toLowerCase());
		if (!user.isAdmin && !isClubManager) throw makeError(403, "Chỉ quản lý CLB hoặc admin mới được đăng thông báo.");
		const body = await readJson(request);
		const content = String(body.content || "").trim();
		if (!content || content.length > 10000) throw makeError(400, "Nội dung thông báo không hợp lệ.");
		const id = randomBytes(16).toString("hex");
		const createdAt = new Date().toISOString();
		db.prepare("INSERT INTO club_posts(id, club_id, author_id, content, created_at) VALUES (?, ?, ?, ?, ?)").run(id, clubId, user.id, content, createdAt); syncDb(db);
		sendJson(response, 201, { ok: true, id, createdAt });
		return;
	}

	if (method === "PATCH" && pathname === "/api/users/me") {
		const body = await readJson(request);
		const fields = {
			name: String(body.name || "").trim(),
			email: validateEmail(body.email || user.email),
			student_class: String(body.studentClass || "Học sinh NQD").trim().slice(0, 80),
			avatar: String(body.avatar || "./DIEU.png").trim().slice(0, 1000),
			cover: String(body.cover || "").trim().slice(0, 2000),
			bio: String(body.bio || "").trim().slice(0, 500)
		};
		if (!fields.name) throw makeError(400, "Tên hiển thị không được để trống.");
		try {
			db.prepare("UPDATE users SET name = ?, email = ?, student_class = ?, avatar = ?, cover = ?, bio = ? WHERE id = ?")
				.run(fields.name, fields.email, fields.student_class, fields.avatar, fields.cover, fields.bio, user.id); syncDb(db);
		} catch {
			throw makeError(409, "Email này đã được tài khoản khác sử dụng.");
		}
		sendJson(response, 200, { user: profileUser(db, db.prepare("SELECT * FROM users WHERE id = ?").get(user.id)) });
		return;
	}

	if (method === "GET" && pathname === "/api/posts") {
		const posts = db.prepare("SELECT * FROM posts WHERE visibility = 'public' OR user_id = ? ORDER BY created_at DESC LIMIT 100").all(user.id);
		sendJson(response, 200, { posts: posts.map(post => postForViewer(db, post, user.id)) });
		return;
	}

	if (method === "POST" && pathname === "/api/posts") {
		const contentType = request.headers["content-type"] || "";
		let fields = {};
		let filePart = null;

		if (contentType.startsWith("multipart/form-data")) {
			const parts = await parseMultipart(request);
			for (const part of parts) {
				if (part.fileName) filePart = part;
				else fields[part.name] = part.body.toString("utf8");
			}
		} else {
			fields = await readJson(request);
		}

		const isResource = contentType.startsWith("multipart/form-data")
			|| fields.type === "study-resource"
			|| Boolean(fields.resource_title);

		const visibility = fields.visibility === "private" ? "private" : "public";
		const id = randomBytes(16).toString("hex");
		const createdAt = new Date().toISOString();

		if (isResource) {
			const title = String(fields.resource_title || fields.title || "").trim().slice(0, 200);
			const description = String(fields.resource_description || fields.description || "").trim().slice(0, 1500);
			const link = String(fields.resource_link || fields.link || "").trim().slice(0, 1000);
			const grade = String(fields.resource_grade || fields.grade || "").trim();
			const track = String(fields.resource_track || fields.track || "").trim();
			const subject = String(fields.resource_subject || fields.subject || "").trim();
			const rawColor = String(fields.resource_cover_color || fields.coverColor || "").trim();
			const coverColor = /^#[0-9a-f]{6}$/i.test(rawColor) ? rawColor : "#6aa68d";

			if (!title) throw makeError(400, "Tiêu đề tài liệu không được để trống.");

			let fUrl = "", fName = "", fType = "", fSize = 0;
			if (filePart) {
				const saved = saveUploadedFile(filePart);
				if (saved) {
					fUrl = saved.fileUrl;
					fName = saved.fileName;
					fType = saved.fileType;
					fSize = saved.fileSize;
				}
			}

			const content = title + (description ? " - " + description : "");
			db.prepare(`
				INSERT INTO posts(
					id, user_id, type, content, image, visibility, created_at,
					resource_title, resource_description, resource_link,
					resource_grade, resource_track, resource_subject,
					resource_file_url, resource_file_name, resource_file_type, resource_file_size, resource_cover_color
				) VALUES (?, ?, 'study-resource', ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			`).run(
				id, user.id, content, visibility, createdAt,
				title, description, link, grade, track, subject,
				fUrl, fName, fType, fSize, coverColor
			);
			syncDb(db);
		} else {
			const content = String(fields.content || "").trim();
			const image = String(fields.image || "").trim().slice(0, 2000);
			const clubId = fields.clubId ? String(fields.clubId).trim() : null;

			if (!content || content.length > 5000) {
				throw makeError(400, "Nội dung bài viết không hợp lệ.");
			}

			if (clubId) {
				const clubRow = db.prepare("SELECT * FROM clubs WHERE id = ?").get(clubId);
				if (!clubRow) throw makeError(404, "CLB không tồn tại.");
				const clubData = clubForViewer(db, clubRow);
				const isAllowed = clubData.managerEmails.some(e => String(e || "").toLowerCase() === user.email.toLowerCase()) || user.isAdmin;
				if (!isAllowed) throw makeError(403, "Bạn không có quyền đăng bài cho CLB này.");
			}

			db.prepare(`
				INSERT INTO posts(id, user_id, club_id, type, content, image, visibility, created_at)
				VALUES (?, ?, ?, 'post', ?, ?, ?, ?)
			`).run(id, user.id, clubId, content, image, visibility, createdAt);
			syncDb(db);
		}

		sendJson(response, 201, { post: postForViewer(db, db.prepare("SELECT * FROM posts WHERE id = ?").get(id), user.id) });
		return;
	}

	const deletePost = pathname.match(/^\/api\/posts\/([^/]+)$/);
	if (method === "DELETE" && deletePost) {
		const post = db.prepare("SELECT user_id, club_id FROM posts WHERE id = ?").get(decodeURIComponent(deletePost[1]));
		if (!post) throw makeError(404, "Không tìm thấy bài viết.");
		let canDelete = post.user_id === user.id || user.isAdmin;
		if (!canDelete && post.club_id) {
			const clubRow = db.prepare("SELECT * FROM clubs WHERE id = ?").get(post.club_id);
			if (clubRow) {
				const clubData = clubForViewer(db, clubRow);
				canDelete = clubData.managerEmails.some(e => String(e || "").toLowerCase() === user.email.toLowerCase());
			}
		}
		if (!canDelete) throw makeError(403, "Chỉ người đăng mới có thể xóa bài viết này.");
		db.prepare("DELETE FROM posts WHERE id = ?").run(decodeURIComponent(deletePost[1])); syncDb(db);
		sendJson(response, 200, { ok: true });
		return;
	}

	const likeMatch = pathname.match(/^\/api\/posts\/([^/]+)\/like$/);
	if (method === "POST" && likeMatch) {
		const post = db.prepare("SELECT * FROM posts WHERE id = ?").get(decodeURIComponent(likeMatch[1]));
		if (!post || !canViewPost(db, post, user.id)) throw makeError(404, "Không tìm thấy bài viết.");
		const body = await readJson(request);
		if (body.liked) {
			db.prepare("INSERT OR IGNORE INTO post_likes(post_id, user_id, created_at) VALUES (?, ?, ?)").run(post.id, user.id, new Date().toISOString());
			syncDb(db);
		} else {
			db.prepare("DELETE FROM post_likes WHERE post_id = ? AND user_id = ?").run(post.id, user.id);
			syncDb(db);
		}
		const likes = db.prepare("SELECT COUNT(*) AS count FROM post_likes WHERE post_id = ?").get(post.id).count;
		sendJson(response, 200, { likes });
		return;
	}

	const commentsMatch = pathname.match(/^\/api\/posts\/([^/]+)\/comments$/);
	if (method === "POST" && commentsMatch) {
		const post = db.prepare("SELECT * FROM posts WHERE id = ?").get(decodeURIComponent(commentsMatch[1]));
		if (!post || !canViewPost(db, post, user.id)) throw makeError(404, "Không tìm thấy bài viết.");
		const body = await readJson(request);
		const content = String(body.content || "").trim();
		if (!content || content.length > 2000) throw makeError(400, "Bình luận không hợp lệ.");
		const id = randomBytes(16).toString("hex");
		const createdAt = new Date().toISOString();
		db.prepare("INSERT INTO post_comments(id, post_id, user_id, content, created_at) VALUES (?, ?, ?, ?, ?)").run(id, post.id, user.id, content, createdAt); syncDb(db);
		sendJson(response, 201, { comment: { id, text: content, name: user.name, avatar: user.avatar, createdAt } });
		return;
	}

	if (method === "GET" && pathname === "/api/friends") {
		const friends = db.prepare(`
			SELECT users.* FROM friendships
			JOIN users ON users.id = CASE WHEN friendships.user_low = ? THEN friendships.user_high ELSE friendships.user_low END
			WHERE friendships.user_low = ? OR friendships.user_high = ? ORDER BY users.name
		`).all(user.id, user.id, user.id).map(row => publicUser(db, row, user.id));
		const incoming = db.prepare("SELECT users.* FROM friend_requests JOIN users ON users.id = friend_requests.sender_id WHERE receiver_id = ? AND status = 'pending' ORDER BY friend_requests.created_at").all(user.id).map(row => publicUser(db, row, user.id));
		sendJson(response, 200, { friends, incoming });
		return;
	}

	const removeFriend = pathname.match(/^\/api\/friends\/([^/]+)$/);
	if (method === "DELETE" && removeFriend) {
		const friendId = decodeURIComponent(removeFriend[1]);
		if (friendId === user.id) throw makeError(404, "Không tìm thấy bạn bè.");
		const pair = [user.id, friendId].sort();
		db.exec("BEGIN");
		try {
			const result = db.prepare("DELETE FROM friendships WHERE user_low = ? AND user_high = ?").run(pair[0], pair[1]); syncDb(db);
			if (!result.changes) throw makeError(404, "Hai tài khoản hiện không phải bạn bè.");
			db.prepare("DELETE FROM friend_requests WHERE status = 'accepted' AND ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))")
				.run(user.id, friendId, friendId, user.id); syncDb(db);
			db.exec("COMMIT");
		} catch (error) {
			db.exec("ROLLBACK");
			throw error;
		}
		sendJson(response, 200, { ok: true });
		return;
	}

	if (method === "POST" && pathname === "/api/friend-requests") {
		const body = await readJson(request);
		const targetId = String(body.userId || "");
		if (targetId === user.id || !db.prepare("SELECT 1 FROM users WHERE id = ?").get(targetId)) throw makeError(404, "Không tìm thấy người dùng.");
		const status = relationship(db, user.id, targetId);
		if (status === "friend") throw makeError(409, "Hai bạn đã là bạn bè.");
		if (status === "incoming") throw makeError(409, "Người này đã gửi lời mời cho bạn.");
		if (status === "outgoing") throw makeError(409, "Bạn đã gửi lời mời rồi.");
		db.prepare("INSERT INTO friend_requests(id, sender_id, receiver_id, status, created_at) VALUES (?, ?, ?, 'pending', ?)")
			.run(randomBytes(16).toString("hex"), user.id, targetId, new Date().toISOString()); syncDb(db);
		sendJson(response, 201, { ok: true });
		return;
	}

	const friendAction = pathname.match(/^\/api\/friend-requests\/([^/]+)\/(accept|reject)$/);
	if (method === "POST" && friendAction) {
		const senderId = decodeURIComponent(friendAction[1]);
		const requestRow = db.prepare("SELECT * FROM friend_requests WHERE sender_id = ? AND receiver_id = ? AND status = 'pending'").get(senderId, user.id);
		if (!requestRow) throw makeError(404, "Không tìm thấy lời mời.");
		if (friendAction[2] === "reject") {
			db.prepare("UPDATE friend_requests SET status = 'rejected' WHERE id = ?").run(requestRow.id); syncDb(db);
			sendJson(response, 200, { ok: true });
			return;
		}
		const pair = [user.id, senderId].sort();
		db.exec("BEGIN");
		try {
			db.prepare("UPDATE friend_requests SET status = 'accepted' WHERE id = ?").run(requestRow.id); syncDb(db);
			db.prepare("INSERT OR IGNORE INTO friendships(user_low, user_high, created_at) VALUES (?, ?, ?)").run(pair[0], pair[1], new Date().toISOString()); syncDb(db);
			ensureConversation(db, pair[0], pair[1]);
			db.exec("COMMIT");
		} catch (error) {
			db.exec("ROLLBACK");
			throw error;
		}
		sendJson(response, 200, { ok: true });
		return;
	}

	if (method === "GET" && pathname === "/api/conversations") {
		const rows = db.prepare(`
			SELECT conversations.* FROM conversations
			JOIN conversation_members ON conversation_members.conversation_id = conversations.id
			WHERE conversation_members.user_id = ? ORDER BY conversations.created_at DESC
		`).all(user.id);
		sendJson(response, 200, { conversations: rows.map(row => serializeConversation(db, row, user.id)) });
		return;
	}

	if (method === "POST" && pathname === "/api/conversations") {
		const body = await readJson(request);
		const name = String(body.name || "").trim();
		const memberIds = [...new Set((Array.isArray(body.memberIds) ? body.memberIds : []).map(String).filter(id => id !== user.id))];
		if (!name || name.length > 60) throw makeError(400, "Tên nhóm không hợp lệ.");
		if (!memberIds.length || memberIds.length > 49) throw makeError(400, "Chọn từ 1 đến 49 người bạn.");
		for (const memberId of memberIds) {
			if (relationship(db, user.id, memberId) !== "friend") throw makeError(403, "Nhóm chỉ được tạo với bạn bè đã kết nối.");
		}
		const id = randomBytes(16).toString("hex");
		const createdAt = new Date().toISOString();
		db.exec("BEGIN");
		try {
			db.prepare("INSERT INTO conversations(id, type, name, created_by, created_at) VALUES (?, 'group', ?, ?, ?)").run(id, name, user.id, createdAt); syncDb(db);
			const addMember = db.prepare("INSERT INTO conversation_members(conversation_id, user_id, joined_at) VALUES (?, ?, ?)");
			[user.id, ...memberIds].forEach(memberId => addMember.run(id, memberId, createdAt)); syncDb(db);
			db.exec("COMMIT");
		} catch (error) {
			db.exec("ROLLBACK");
			throw error;
		}
		sendJson(response, 201, { conversation: serializeConversation(db, db.prepare("SELECT * FROM conversations WHERE id = ?").get(id), user.id) });
		return;
	}

	const deleteConversation = pathname.match(/^\/api\/conversations\/([^/]+)$/);
	if (method === "DELETE" && deleteConversation) {
		const conversationId = decodeURIComponent(deleteConversation[1]);
		const conversation = db.prepare("SELECT type, created_by FROM conversations WHERE id = ?").get(conversationId);
		if (!conversation || conversation.type !== "group") throw makeError(404, "Không tìm thấy nhóm chat.");
		if (conversation.created_by !== user.id) throw makeError(403, "Chỉ người tạo nhóm mới có thể xóa nhóm này.");
		db.prepare("DELETE FROM conversations WHERE id = ?").run(conversationId); syncDb(db);
		sendJson(response, 200, { ok: true });
		return;
	}

	const messagesRoute = pathname.match(/^\/api\/conversations\/([^/]+)\/messages$/);
	if (messagesRoute && ["GET", "POST"].includes(method)) {
		const conversationId = decodeURIComponent(messagesRoute[1]);
		if (!isConversationMember(db, conversationId, user.id)) throw makeError(404, "Không tìm thấy cuộc trò chuyện.");
		if (method === "GET") {
			const rows = db.prepare(`
				SELECT messages.id, messages.content, messages.created_at, users.id AS sender_id, users.name, users.avatar
				FROM messages JOIN users ON users.id = messages.sender_id
				WHERE messages.conversation_id = ? ORDER BY messages.created_at LIMIT 500
			`).all(conversationId);
			sendJson(response, 200, { messages: rows.map(row => ({ id: row.id, text: row.content, fromId: row.sender_id, name: row.name, avatar: row.avatar, createdAt: row.created_at })) });
			return;
		}
		const body = await readJson(request);
		const content = String(body.content || "").trim();
		if (!content || content.length > 1000) throw makeError(400, "Tin nhắn không hợp lệ.");
		const id = randomBytes(16).toString("hex");
		const createdAt = new Date().toISOString();
		db.prepare("INSERT INTO messages(id, conversation_id, sender_id, content, created_at) VALUES (?, ?, ?, ?, ?)").run(id, conversationId, user.id, content, createdAt); syncDb(db);
		sendJson(response, 201, { message: { id, text: content, fromId: user.id, name: user.name, avatar: user.avatar, createdAt } });
		return;
	}

	if (method === "GET" && pathname.startsWith("/uploads/")) {
		const fileName = path.basename(decodeURIComponent(pathname.slice("/uploads/".length)));
		const filePath = path.join(UPLOAD_DIR, fileName);
		if (!existsSync(filePath) || !statSync(filePath).isFile()) throw makeError(404, "Không tìm thấy tệp.");
		response.writeHead(200, { "Content-Type": MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream" });
		createReadStream(filePath).pipe(response);
		return;
	}
	throw makeError(404, "Không tìm thấy API.");
}

function serveStatic(request, response, url) {
	if (!new Set(["GET", "HEAD"]).has(request.method || "GET")) throw makeError(405, "Phương thức không được hỗ trợ.");
	let relativePath;
	try {
		relativePath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
	} catch {
		throw makeError(400, "Đường dẫn không hợp lệ.");
	}
	const filePath = path.resolve(ROOT, `.${relativePath}`);
	const relativeFilePath = path.relative(ROOT, filePath);
	if (!filePath.startsWith(`${ROOT}${path.sep}`)
		|| relativeFilePath === "server.js"
		|| relativeFilePath.startsWith(`tests${path.sep}`)
		|| !STATIC_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
		throw makeError(404, "Không tìm thấy trang.");
	}
	if (!existsSync(filePath) || !statSync(filePath).isFile()) throw makeError(404, "Không tìm thấy trang.");
	response.writeHead(200, { "Cache-Control": "no-cache", "Content-Type": MIME_TYPES[path.extname(filePath).toLowerCase()] });
	if (request.method === "HEAD") {
		response.end();
		return;
	}
	createReadStream(filePath).on("error", () => {
		if (!response.headersSent) sendJson(response, 404, { error: "Không tìm thấy trang." });
	}).pipe(response);
}

const serverFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === serverFile) {
	const server = createServer();
	const port = Number(process.env.PORT || 4173);
	const host = process.env.HOST || "0.0.0.0";
	server.listen(port, host, () => {
		console.log(`DIEUNW backend listening at http://${host}:${port}`);
		console.log(`SQLite database: ${process.env.DATABASE_PATH || path.join(ROOT, "data", "dieunw.sqlite")}`);
	});
	for (const signal of ["SIGINT", "SIGTERM"]) {
		process.on(signal, () => server.close(() => {
			server.database.close();
			process.exit(0);
		}));
	}
}

export { createServer, hashPassword, verifyPassword };