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
const MAX_BODY_BYTES = 4 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const UPLOAD_DIR = path.join(ROOT, "uploads");
const STATIC_EXTENSIONS = new Set([
	".html", ".js", ".css", ".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif",
	".ico", ".svg", ".pdf", ".doc", ".docx", ".txt", ".mp4", ".webm"
]);
const MIME_TYPES = {
	".avif": "image/avif",
	".css": "text/css; charset=utf-8",
	".csv": "text/csv; charset=utf-8",
	".doc": "application/msword",
	".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	".gif": "image/gif",
	".html": "text/html; charset=utf-8",
	".ico": "image/x-icon",
	".jpeg": "image/jpeg",
	".jpg": "image/jpeg",
	".js": "text/javascript; charset=utf-8",
	".md": "text/markdown; charset=utf-8",
	".mp4": "video/mp4",
	".pdf": "application/pdf",
	".png": "image/png",
	".ppt": "application/vnd.ms-powerpoint",
	".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
	".rar": "application/vnd.rar",
	".svg": "image/svg+xml",
	".txt": "text/plain; charset=utf-8",
	".webm": "video/webm",
	".webp": "image/webp",
	".xls": "application/vnd.ms-excel",
	".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	".zip": "application/zip"
};

const AVATAR_FRAME_COSTS = {
	"none": 0,
	"study-warrior": 50,
	"night-owl": 80,
	"exam-season": 100,
	"nqd-anniversary": 150
};

function serializeCookie(name, value, { maxAge, secure }) {
	const parts = [`${name}=${encodeURIComponent(value)}`, "HttpOnly", "Path=/"];
	if (maxAge !== undefined) parts.push(`Max-Age=${maxAge}`);
	if (secure) parts.push("SameSite=None", "Secure");
	else parts.push("SameSite=Lax");
	return parts.join("; ");
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

function syncDb(db) {
	if (process.env.TURSO_DATABASE_URL) db.sync();
}

function parseBoundary(contentType) {
	const match = /boundary=([^;]+)/i.exec(contentType || "");
	return match ? match[1].trim().replace(/^"|"$/g, "") : null;
}

async function parseMultipart(request) {
	const contentType = request.headers["content-type"] || "";
	const boundary = parseBoundary(contentType);
	if (!boundary) throw makeError(400, "Thiếu boundary multipart.");
	const chunks = [];
	let size = 0;
	for await (const chunk of request) {
		size += chunk.length;
		if (size > MAX_UPLOAD_BYTES) throw makeError(413, "Tệp tải lên quá lớn (tối đa 25 MB).");
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

function saveUploadedFile(filePart, allowedType = "any") {
	if (!filePart || !filePart.fileName || !filePart.body.length) return null;
	const ext = path.extname(filePart.fileName).toLowerCase();
	const imageExts = new Set([".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif"]);
	const videoExts = new Set([".mp4", ".webm"]);
	const docExts = new Set([".pdf", ".doc", ".docx", ".txt", ".md", ".csv", ".ppt", ".pptx", ".xls", ".xlsx", ".zip", ".rar"]);
	let valid = false;
	if (allowedType === "image") valid = imageExts.has(ext);
	else if (allowedType === "story") valid = imageExts.has(ext) || videoExts.has(ext);
	else valid = imageExts.has(ext) || videoExts.has(ext) || docExts.has(ext);

	if (!valid) {
		throw makeError(400, "Định dạng tệp không được hỗ trợ.");
	}
	mkdirSync(UPLOAD_DIR, { recursive: true });
	const storedName = `${randomBytes(16).toString("hex")}${ext}`;
	writeFileSync(path.join(UPLOAD_DIR, storedName), filePart.body);
	return {
		fileUrl: `/uploads/${storedName}`,
		fileName: filePart.fileName,
		fileType: filePart.contentType || ext.slice(1).toUpperCase(),
		fileSize: filePart.body.length,
		isVideo: videoExts.has(ext)
	};
}

function getIsoWeekKey(date = new Date()) {
	const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
	const dayNum = d.getUTCDay() || 7;
	d.setUTCDate(d.getUTCDate() + 4 - dayNum);
	const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
	const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
	return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function getTodayDateKey() {
	return new Date().toISOString().slice(0, 10);
}

function relationship(db, viewerId, otherId) {
	if (!viewerId) return "none";
	if (viewerId === otherId) return "self";
	const low = viewerId < otherId ? viewerId : otherId;
	const high = viewerId < otherId ? otherId : viewerId;
	if (db.prepare("SELECT 1 FROM friendships WHERE user_low = ? AND user_high = ?").get(low, high)) return "friend";
	if (db.prepare("SELECT 1 FROM friend_requests WHERE sender_id = ? AND receiver_id = ? AND status = 'pending'").get(otherId, viewerId)) return "incoming";
	if (db.prepare("SELECT 1 FROM friend_requests WHERE sender_id = ? AND receiver_id = ? AND status = 'pending'").get(viewerId, otherId)) return "outgoing";
	return "none";
}

function canViewerSeePrivacy(setting, viewerId, ownerId, relation) {
	if (viewerId && viewerId === ownerId) return true;
	const mode = setting || "public";
	if (mode === "public") return true;
	if (mode === "friends") return relation === "friend";
	return false;
}

function computePresenceStatus(row, viewerId, relation) {
	if (!row) return "offline";
	const isOwner = Boolean(viewerId && viewerId === row.id);
	if (row.ghost_mode) return "offline";
	if (!isOwner && !canViewerSeePrivacy(row.privacy_activity, viewerId, row.id, relation)) {
		return "offline";
	}
	const lastSeen = Number(row.last_seen_at || 0);
	if (Date.now() - lastSeen > 95 * 1000) return "offline";
	return row.status_mode === "studying" ? "studying" : "online";
}

function parseUnlockedFrames(raw) {
	try {
		const parsed = JSON.parse(raw || '["none"]');
		return Array.isArray(parsed) && parsed.length ? parsed : ["none"];
	} catch {
		return ["none"];
	}
}

function parseEcardConfig(raw) {
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw);
		return parsed && typeof parsed === "object" ? parsed : null;
	} catch {
		return null;
	}
}

function cleanUser(db, row, viewerId = "") {
	if (!row) return null;
	const relation = viewerId ? relationship(db, viewerId, row.id) : "none";
	const isSelf = Boolean(viewerId && viewerId === row.id);
	const currentWeek = getIsoWeekKey();
	const weeklyMinutes = row.weekly_study_reset_key === currentWeek ? Number(row.weekly_study_minutes || 0) : 0;
	const nowMs = Date.now();
	const hasActiveNote = Boolean(row.note_text && Number(row.note_expires_at || 0) > nowMs);
	const hasActiveStory = Boolean(
		db.prepare("SELECT 1 FROM user_stories WHERE user_id = ? AND expires_at > ? LIMIT 1").get(row.id, nowMs)
	);
	const presenceStatus = computePresenceStatus(row, viewerId, relation);

	return {
		id: row.id,
		name: row.name,
		email: row.email,
		studentClass: row.student_class,
		cohort: row.cohort || "",
		avatar: row.avatar || "./DIEU.png",
		cover: row.cover || "",
		bio: row.bio || "",
		isAdmin: Boolean(row.is_admin),
		isModerator: Boolean(row.is_moderator),
		isAlumni: Boolean(row.is_alumni),
		socialFacebook: row.social_facebook || "",
		socialInstagram: row.social_instagram || "",
		socialGithub: row.social_github || "",
		studySchedule: row.study_schedule || "",
		privacyAlbum: row.privacy_album || "public",
		privacyAchievements: row.privacy_achievements || "public",
		privacyActivity: row.privacy_activity || "public",
		ghostMode: isSelf ? Boolean(row.ghost_mode) : false,
		themePrimary: row.theme_primary || "",
		themeSecondary: row.theme_secondary || "",
		activeAvatarFrame: row.active_avatar_frame || "none",
		unlockedFrames: isSelf ? parseUnlockedFrames(row.unlocked_frames) : undefined,
		ecardConfig: parseEcardConfig(row.ecard_config),
		studyPoints: Number(row.study_points || 0),
		studyStreakDays: Number(row.study_streak_days || 0),
		weeklyStudyHours: Number((weeklyMinutes / 60).toFixed(1)),
		weeklyStudyMinutes: weeklyMinutes,
		presenceStatus,
		noteText: hasActiveNote ? row.note_text : "",
		noteExpiresAt: hasActiveNote ? Number(row.note_expires_at) : 0,
		hasActiveStory,
		createdAt: row.created_at
	};
}

function getUserClubs(db, row) {
	if (!row) return { profileTitles: [], memberClubs: [] };
	const allApprovedClubs = db.prepare(`
		SELECT id, name, logo, tag_color AS color, manager_id, manager_email, manager_emails
		FROM clubs WHERE status = 'approved'
		ORDER BY created_at
	`).all();
	const memberIds = new Set(
		db.prepare("SELECT club_id FROM club_members WHERE user_id = ?").all(row.id).map(r => r.club_id)
	);
	const userEmail = String(row.email || "").toLowerCase();
	const profileTitles = [];
	const memberClubs = [];
	for (const club of allApprovedClubs) {
		let isManager = club.manager_id === row.id || String(club.manager_email || "").toLowerCase() === userEmail;
		if (!isManager) {
			try {
				const list = JSON.parse(club.manager_emails || "[]");
				if (Array.isArray(list)) isManager = list.some(e => String(e || "").toLowerCase() === userEmail);
			} catch {}
		}
		if (isManager) {
			profileTitles.push({ id: club.id, name: club.name, color: club.color, logo: club.logo || "" });
		}
		if (isManager || memberIds.has(club.id)) {
			memberClubs.push({
				id: club.id,
				name: club.name,
				color: club.color,
				logo: club.logo || "",
				role: isManager ? "Chủ nhiệm / Quản lý" : "Thành viên"
			});
		}
	}
	return { profileTitles, memberClubs };
}

function profileUser(db, row, viewerId = row?.id) {
	if (!row) return null;
	const { profileTitles, memberClubs } = getUserClubs(db, row);
	const setsStats = db.prepare(`
		SELECT COUNT(*) AS setCount, COALESCE(SUM(study_count), 0) AS totalPlays
		FROM study_sets WHERE user_id = ?
	`).get(row.id);

	return {
		...cleanUser(db, row, viewerId),
		profileTitles,
		memberClubs,
		studySetCount: Number(setsStats?.setCount || 0),
		studySetPlays: Number(setsStats?.totalPlays || 0)
	};
}

function initializeDatabase(dbPath) {
	if (dbPath !== ":memory:") mkdirSync(path.dirname(dbPath), { recursive: true });
	const db = new Database(dbPath, {
		syncUrl: process.env.TURSO_DATABASE_URL,
		authToken: process.env.TURSO_AUTH_TOKEN,
	});
	if (process.env.TURSO_DATABASE_URL) syncDb(db);

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
			is_moderator INTEGER NOT NULL DEFAULT 0,
			is_alumni INTEGER NOT NULL DEFAULT 0,
			created_at TEXT NOT NULL
		);
		CREATE TABLE IF NOT EXISTS admin_emails (
			email TEXT PRIMARY KEY COLLATE NOCASE,
			created_at TEXT NOT NULL
		);
		CREATE TABLE IF NOT EXISTS moderator_emails (
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
		CREATE TABLE IF NOT EXISTS club_members (
			club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
			user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			joined_at TEXT NOT NULL,
			PRIMARY KEY(club_id, user_id)
		);
		CREATE TABLE IF NOT EXISTS club_posts (
			id TEXT PRIMARY KEY,
			club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
			author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			content TEXT NOT NULL,
			image TEXT NOT NULL DEFAULT '',
			file_url TEXT NOT NULL DEFAULT '',
			file_name TEXT NOT NULL DEFAULT '',
			file_type TEXT NOT NULL DEFAULT '',
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
			sticker_url TEXT NOT NULL DEFAULT '',
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
			sticker_url TEXT NOT NULL DEFAULT '',
			created_at TEXT NOT NULL
		);
		CREATE TABLE IF NOT EXISTS reports (
			id TEXT PRIMARY KEY,
			target_type TEXT NOT NULL CHECK(target_type IN ('post', 'user')),
			target_id TEXT NOT NULL,
			reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			reason TEXT NOT NULL DEFAULT '',
			status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'dismissed', 'resolved')),
			created_at TEXT NOT NULL,
			UNIQUE(target_type, target_id, reporter_id)
		);
		CREATE TABLE IF NOT EXISTS moderation_audit_logs (
			id TEXT PRIMARY KEY,
			actor_id TEXT NOT NULL,
			actor_name TEXT NOT NULL,
			actor_email TEXT NOT NULL,
			action TEXT NOT NULL,
			target_type TEXT NOT NULL,
			target_id TEXT NOT NULL,
			target_label TEXT NOT NULL DEFAULT '',
			details TEXT NOT NULL DEFAULT '',
			created_at TEXT NOT NULL
		);
		CREATE TABLE IF NOT EXISTS study_tags (
			id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			subject TEXT NOT NULL,
			kind TEXT NOT NULL CHECK(kind IN ('strength', 'need_help')),
			created_at TEXT NOT NULL,
			UNIQUE(user_id, subject, kind)
		);
		CREATE TABLE IF NOT EXISTS study_tag_endorsements (
			id TEXT PRIMARY KEY,
			tag_id TEXT NOT NULL REFERENCES study_tags(id) ON DELETE CASCADE,
			endorser_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			comment TEXT NOT NULL DEFAULT '',
			created_at TEXT NOT NULL,
			UNIQUE(tag_id, endorser_id)
		);
		CREATE TABLE IF NOT EXISTS profile_showcase (
			id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			title TEXT NOT NULL,
			description TEXT NOT NULL DEFAULT '',
			link TEXT NOT NULL DEFAULT '',
			image TEXT NOT NULL DEFAULT '',
			kind TEXT NOT NULL DEFAULT 'product',
			created_at TEXT NOT NULL
		);
		CREATE TABLE IF NOT EXISTS user_moments (
			id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			image TEXT NOT NULL,
			caption TEXT NOT NULL DEFAULT '',
			grad_from TEXT NOT NULL DEFAULT '#173853',
			grad_to TEXT NOT NULL DEFAULT '#2298f8',
			pinned INTEGER NOT NULL DEFAULT 1,
			expires_at INTEGER NOT NULL,
			created_at TEXT NOT NULL
		);
		CREATE TABLE IF NOT EXISTS moment_reactions (
			moment_id TEXT NOT NULL REFERENCES user_moments(id) ON DELETE CASCADE,
			user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			emoji TEXT NOT NULL DEFAULT '❤️',
			created_at TEXT NOT NULL,
			PRIMARY KEY(moment_id, user_id)
		);
		CREATE TABLE IF NOT EXISTS user_stories (
			id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			media_url TEXT NOT NULL,
			media_type TEXT NOT NULL CHECK(media_type IN ('image', 'video')),
			caption TEXT NOT NULL DEFAULT '',
			duration_hours INTEGER NOT NULL DEFAULT 24 CHECK(duration_hours IN (24, 48)),
			expires_at INTEGER NOT NULL,
			created_at TEXT NOT NULL
		);
		CREATE TABLE IF NOT EXISTS story_views (
			story_id TEXT NOT NULL REFERENCES user_stories(id) ON DELETE CASCADE,
			user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			viewed_at TEXT NOT NULL,
			PRIMARY KEY(story_id, user_id)
		);
		CREATE TABLE IF NOT EXISTS user_bookmarks (
			user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			item_type TEXT NOT NULL CHECK(item_type IN ('post', 'resource')),
			item_id TEXT NOT NULL,
			created_at TEXT NOT NULL,
			PRIMARY KEY(user_id, item_type, item_id)
		);
		CREATE TABLE IF NOT EXISTS study_sets (
			id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			forked_from_id TEXT REFERENCES study_sets(id) ON DELETE SET NULL,
			kind TEXT NOT NULL CHECK(kind IN ('flashcard', 'quiz')),
			title TEXT NOT NULL,
			subject TEXT NOT NULL DEFAULT 'Chung',
			description TEXT NOT NULL DEFAULT '',
			cards_json TEXT NOT NULL DEFAULT '[]',
			pinned INTEGER NOT NULL DEFAULT 0,
			study_count INTEGER NOT NULL DEFAULT 0,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);
		CREATE TABLE IF NOT EXISTS quiz_attempts (
			id TEXT PRIMARY KEY,
			set_id TEXT NOT NULL REFERENCES study_sets(id) ON DELETE CASCADE,
			user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			score INTEGER NOT NULL,
			total INTEGER NOT NULL,
			duration_ms INTEGER NOT NULL,
			created_at TEXT NOT NULL
		);
		CREATE TABLE IF NOT EXISTS user_stickers (
			id TEXT PRIMARY KEY,
			owner_type TEXT NOT NULL CHECK(owner_type IN ('user', 'club')),
			owner_id TEXT NOT NULL,
			name TEXT NOT NULL DEFAULT 'Sticker',
			image TEXT NOT NULL,
			created_at TEXT NOT NULL
		);
		CREATE TABLE IF NOT EXISTS typing_status (
			conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
			user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			updated_at INTEGER NOT NULL,
			PRIMARY KEY(conversation_id, user_id)
		);
		CREATE TABLE IF NOT EXISTS message_reads (
			conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
			user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			last_read_at TEXT NOT NULL,
			PRIMARY KEY(conversation_id, user_id)
		);
		CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
		CREATE INDEX IF NOT EXISTS friend_requests_receiver_idx ON friend_requests(receiver_id, status);
		CREATE INDEX IF NOT EXISTS posts_visibility_idx ON posts(visibility, created_at);
		CREATE INDEX IF NOT EXISTS conversation_members_user_idx ON conversation_members(user_id);
		CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages(conversation_id, created_at);
		CREATE INDEX IF NOT EXISTS user_stories_expires_idx ON user_stories(expires_at);
		CREATE INDEX IF NOT EXISTS quiz_attempts_set_idx ON quiz_attempts(set_id, score DESC, duration_ms ASC);
	`);

	const userCols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
	const userAlters = [
		["is_admin", "INTEGER NOT NULL DEFAULT 0"],
		["is_moderator", "INTEGER NOT NULL DEFAULT 0"],
		["is_alumni", "INTEGER NOT NULL DEFAULT 0"],
		["cohort", "TEXT NOT NULL DEFAULT ''"],
		["social_facebook", "TEXT NOT NULL DEFAULT ''"],
		["social_instagram", "TEXT NOT NULL DEFAULT ''"],
		["social_github", "TEXT NOT NULL DEFAULT ''"],
		["study_schedule", "TEXT NOT NULL DEFAULT ''"],
		["privacy_album", "TEXT NOT NULL DEFAULT 'public'"],
		["privacy_achievements", "TEXT NOT NULL DEFAULT 'public'"],
		["privacy_activity", "TEXT NOT NULL DEFAULT 'public'"],
		["ghost_mode", "INTEGER NOT NULL DEFAULT 0"],
		["theme_primary", "TEXT NOT NULL DEFAULT ''"],
		["theme_secondary", "TEXT NOT NULL DEFAULT ''"],
		["active_avatar_frame", "TEXT NOT NULL DEFAULT 'none'"],
		["unlocked_frames", "TEXT NOT NULL DEFAULT '[\"none\"]'"],
		["ecard_config", "TEXT NOT NULL DEFAULT ''"],
		["study_points", "INTEGER NOT NULL DEFAULT 0"],
		["study_streak_days", "INTEGER NOT NULL DEFAULT 0"],
		["last_study_date", "TEXT NOT NULL DEFAULT ''"],
		["weekly_study_minutes", "INTEGER NOT NULL DEFAULT 0"],
		["weekly_study_reset_key", "TEXT NOT NULL DEFAULT ''"],
		["status_mode", "TEXT NOT NULL DEFAULT 'online'"],
		["last_seen_at", "INTEGER NOT NULL DEFAULT 0"],
		["note_text", "TEXT NOT NULL DEFAULT ''"],
		["note_expires_at", "INTEGER NOT NULL DEFAULT 0"]
	];
	for (const [col, def] of userAlters) {
		if (!userCols.includes(col)) db.exec(`ALTER TABLE users ADD COLUMN ${col} ${def}`);
	}

	const clubCols = db.prepare("PRAGMA table_info(clubs)").all().map(c => c.name);
	if (!clubCols.includes("manager_emails")) db.exec("ALTER TABLE clubs ADD COLUMN manager_emails TEXT NOT NULL DEFAULT '[]'");
	if (!clubCols.includes("cover")) db.exec("ALTER TABLE clubs ADD COLUMN cover TEXT NOT NULL DEFAULT ''");
	if (!clubCols.includes("bio")) db.exec("ALTER TABLE clubs ADD COLUMN bio TEXT NOT NULL DEFAULT ''");

	const clubPostCols = db.prepare("PRAGMA table_info(club_posts)").all().map(c => c.name);
	if (!clubPostCols.includes("image")) db.exec("ALTER TABLE club_posts ADD COLUMN image TEXT NOT NULL DEFAULT ''");
	if (!clubPostCols.includes("file_url")) db.exec("ALTER TABLE club_posts ADD COLUMN file_url TEXT NOT NULL DEFAULT ''");
	if (!clubPostCols.includes("file_name")) db.exec("ALTER TABLE club_posts ADD COLUMN file_name TEXT NOT NULL DEFAULT ''");
	if (!clubPostCols.includes("file_type")) db.exec("ALTER TABLE club_posts ADD COLUMN file_type TEXT NOT NULL DEFAULT ''");

	const postCols = db.prepare("PRAGMA table_info(posts)").all().map(c => c.name);
	const postAlters = [
		["club_id", "TEXT REFERENCES clubs(id) ON DELETE CASCADE"],
		["type", "TEXT NOT NULL DEFAULT 'post'"],
		["resource_title", "TEXT NOT NULL DEFAULT ''"],
		["resource_description", "TEXT NOT NULL DEFAULT ''"],
		["resource_link", "TEXT NOT NULL DEFAULT ''"],
		["resource_grade", "TEXT NOT NULL DEFAULT ''"],
		["resource_track", "TEXT NOT NULL DEFAULT ''"],
		["resource_subject", "TEXT NOT NULL DEFAULT ''"],
		["resource_file_url", "TEXT NOT NULL DEFAULT ''"],
		["resource_file_name", "TEXT NOT NULL DEFAULT ''"],
		["resource_file_type", "TEXT NOT NULL DEFAULT ''"],
		["resource_file_size", "INTEGER NOT NULL DEFAULT 0"],
		["resource_cover_color", "TEXT NOT NULL DEFAULT ''"],
		["is_rich_html", "INTEGER NOT NULL DEFAULT 0"],
		["study_set_id", "TEXT DEFAULT NULL"],
		["scheduled_at", "TEXT DEFAULT NULL"],
		["publish_status", "TEXT NOT NULL DEFAULT 'published'"]
	];
	for (const [col, def] of postAlters) {
		if (!postCols.includes(col)) db.exec(`ALTER TABLE posts ADD COLUMN ${col} ${def}`);
	}

	const commentCols = db.prepare("PRAGMA table_info(post_comments)").all().map(c => c.name);
	if (!commentCols.includes("sticker_url")) db.exec("ALTER TABLE post_comments ADD COLUMN sticker_url TEXT NOT NULL DEFAULT ''");

	const msgCols = db.prepare("PRAGMA table_info(messages)").all().map(c => c.name);
	if (!msgCols.includes("sticker_url")) db.exec("ALTER TABLE messages ADD COLUMN sticker_url TEXT NOT NULL DEFAULT ''");

	if (process.env.TURSO_DATABASE_URL) syncDb(db);
	const now = new Date().toISOString();
	db.prepare("INSERT OR IGNORE INTO admin_emails(email, created_at) VALUES (?, ?)").run("k18th.hao2802@nqd.edu.vn", now);
	db.prepare("UPDATE users SET is_admin = 1 WHERE email IN (SELECT email FROM admin_emails)").run();
	db.prepare("UPDATE users SET is_moderator = 1 WHERE email IN (SELECT email FROM moderator_emails)").run();
	syncDb(db);
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

function isAllowedCorsOrigin(origin) {
	if (!origin) return false;
	return origin === "https://hao-cpp.github.io"
		|| origin === "http://localhost:4173"
		|| origin === "http://127.0.0.1:4173"
		|| origin.startsWith("http://localhost:")
		|| origin.startsWith("http://127.0.0.1:");
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
	if (authHeader.startsWith("Bearer ")) sessionToken = authHeader.slice(7).trim();
	else sessionToken = parseCookies(request)[SESSION_COOKIE];
	if (!sessionToken) return null;

	const row = db.prepare(`
		SELECT users.* FROM sessions
		JOIN users ON users.id = sessions.user_id
		WHERE sessions.token_hash = ? AND sessions.expires_at > ?
	`).get(hashValue(sessionToken), Date.now());
	return profileUser(db, row, row?.id);
}

function requireUser(db, request) {
	const user = getUserForRequest(db, request);
	if (!user) throw makeError(401, "Đăng nhập để tiếp tục.");
	return user;
}

function requireAdmin(user) {
	if (!user.isAdmin) throw makeError(403, "Chỉ quản trị viên mới có thể thực hiện thao tác này.");
}

function requireModerator(user) {
	if (!user.isAdmin && !user.isModerator) throw makeError(403, "Chỉ Admin hoặc Ban duyệt bài mới có quyền truy cập.");
}

function writeAuditLog(db, actor, action, targetType, targetId, targetLabel = "", details = "") {
	db.prepare(`
		INSERT INTO moderation_audit_logs(id, actor_id, actor_name, actor_email, action, target_type, target_id, target_label, details, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`).run(
		randomBytes(16).toString("hex"),
		actor.id,
		actor.name || actor.email,
		actor.email,
		action,
		targetType,
		targetId,
		String(targetLabel || "").slice(0, 140),
		String(details || "").slice(0, 300),
		new Date().toISOString()
	);
	syncDb(db);
}

function setSession(db, userId, response, secure) {
	const token = randomBytes(32).toString("hex");
	const expiresAt = Date.now() + SESSION_DURATION;
	db.prepare("INSERT INTO sessions(token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
		.run(hashValue(token), userId, expiresAt, new Date().toISOString());
	syncDb(db);
	return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=None; Path=/; Max-Age=${SESSION_DURATION / 1000}; Secure`;
}

function clearSession(db, request, secure) {
	const authHeader = request.headers.authorization || "";
	const sessionToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : parseCookies(request)[SESSION_COOKIE];
	if (sessionToken) {
		db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashValue(sessionToken));
		syncDb(db);
	}
	return serializeCookie(SESSION_COOKIE, "", { maxAge: 0, secure });
}

function clubForViewer(db, row, viewerId = "") {
	const manager = db.prepare("SELECT id, name, email, avatar FROM users WHERE id = ?").get(row.manager_id);
	const requester = db.prepare("SELECT name, email FROM users WHERE id = ?").get(row.requested_by);
	let managerEmails = [row.manager_email];
	if (row.manager_emails) {
		try {
			const parsed = JSON.parse(row.manager_emails);
			if (Array.isArray(parsed) && parsed.length) managerEmails = parsed;
		} catch {}
	}
	const memberCount = db.prepare("SELECT COUNT(*) AS count FROM club_members WHERE club_id = ?").get(row.id)?.count || 0;
	const isMember = viewerId ? Boolean(db.prepare("SELECT 1 FROM club_members WHERE club_id = ? AND user_id = ?").get(row.id, viewerId)) : false;
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
		memberCount,
		isMember,
		requestedBy: requester?.name || "Thành viên",
		requestedById: row.requested_by,
		createdAt: row.created_at
	};
}

function autoPublishScheduledPosts(db) {
	const nowIso = new Date().toISOString();
	const updated = db.prepare(`
		UPDATE posts SET publish_status = 'published', created_at = scheduled_at
		WHERE publish_status = 'scheduled' AND scheduled_at IS NOT NULL AND scheduled_at <= ?
	`).run(nowIso);
	if (updated.changes) syncDb(db);
}

function serializeStudySet(db, row) {
	if (!row) return null;
	let cards = [];
	try {
		cards = JSON.parse(row.cards_json || "[]");
	} catch {}
	const author = db.prepare("SELECT id, name, email, avatar FROM users WHERE id = ?").get(row.user_id);
	const leaderboard = row.kind === "quiz"
		? db.prepare(`
			SELECT quiz_attempts.score, quiz_attempts.total, quiz_attempts.duration_ms AS durationMs,
				quiz_attempts.created_at AS createdAt, users.id AS userId, users.name, users.avatar
			FROM quiz_attempts JOIN users ON users.id = quiz_attempts.user_id
			WHERE quiz_attempts.set_id = ?
			ORDER BY quiz_attempts.score DESC, quiz_attempts.duration_ms ASC, quiz_attempts.created_at ASC
			LIMIT 3
		`).all(row.id)
		: [];
	return {
		id: row.id,
		userId: row.user_id,
		authorName: author?.name || author?.email || "Thành viên",
		authorAvatar: author?.avatar || "./DIEU.png",
		forkedFromId: row.forked_from_id || null,
		kind: row.kind,
		title: row.title,
		subject: row.subject || "Chung",
		description: row.description || "",
		cards,
		pinned: Boolean(row.pinned),
		studyCount: Number(row.study_count || 0),
		leaderboard,
		createdAt: row.created_at,
		updatedAt: row.updated_at
	};
}

function postForViewer(db, row, viewerId) {
	const author = db.prepare("SELECT id, name, email, avatar, is_admin, is_moderator, is_alumni, active_avatar_frame, ghost_mode, privacy_activity, status_mode, last_seen_at FROM users WHERE id = ?").get(row.user_id);
	const club = row.club_id ? db.prepare("SELECT id, name, logo, tag_color FROM clubs WHERE id = ?").get(row.club_id) : null;
	const comments = db.prepare(`
		SELECT comments.id, comments.user_id AS userId, comments.content AS text, comments.sticker_url AS stickerUrl, comments.created_at AS createdAt,
			users.name, users.avatar, users.email, users.is_admin AS isAdmin, users.is_moderator AS isModerator
		FROM post_comments AS comments JOIN users ON users.id = comments.user_id
		WHERE comments.post_id = ? ORDER BY comments.created_at
	`).all(row.id);
	const likes = db.prepare("SELECT COUNT(*) AS count FROM post_likes WHERE post_id = ?").get(row.id).count;
	const likedByMe = Boolean(viewerId && db.prepare("SELECT 1 FROM post_likes WHERE post_id = ? AND user_id = ?").get(row.id, viewerId));
	const itemType = row.type === "study-resource" ? "resource" : "post";
	const bookmarkedByMe = Boolean(viewerId && db.prepare("SELECT 1 FROM user_bookmarks WHERE user_id = ? AND item_type = ? AND item_id = ?").get(viewerId, itemType, row.id));
	const studySet = row.study_set_id ? serializeStudySet(db, db.prepare("SELECT * FROM study_sets WHERE id = ?").get(row.study_set_id)) : null;

	const authorTitles = author ? getUserClubs(db, author).profileTitles : [];
	const relation = viewerId && author ? relationship(db, viewerId, author.id) : "none";
	const authorPresence = author ? computePresenceStatus(author, viewerId, relation) : "offline";
	const hasActiveStory = author ? Boolean(db.prepare("SELECT 1 FROM user_stories WHERE user_id = ? AND expires_at > ? LIMIT 1").get(author.id, Date.now())) : false;

	return {
		id: row.id,
		userId: row.user_id,
		clubId: club ? club.id : null,
		clubName: club ? club.name : "",
		type: row.type || "post",
		name: club ? club.name : (author?.name || author?.email || "Thành viên"),
		authorEmail: author?.email || "",
		avatar: club ? (club.logo || "./DIEU.png") : (author?.avatar || "./DIEU.png"),
		authorFrame: club ? "none" : (author?.active_avatar_frame || "none"),
		authorPresence: club ? "offline" : authorPresence,
		authorHasStory: club ? false : hasActiveStory,
		authorBadges: club ? [{ label: "FANPAGE CLB", color: club.tag_color || "#1769aa", type: "club" }] : [
			...(author?.is_admin ? [{ label: "Admin", type: "admin" }] : []),
			...(author?.is_moderator ? [{ label: "Ban duyệt bài", type: "mod" }] : []),
			...(author?.is_alumni ? [{ label: "Cựu học sinh", type: "alumni" }] : []),
			...authorTitles.slice(0, 1).map(c => ({ label: `Chủ nhiệm · ${c.name}`, color: c.color, type: "club" }))
		],
		content: row.content,
		isRichHtml: Boolean(row.is_rich_html),
		image: row.image,
		visibility: row.visibility,
		publishStatus: row.publish_status || "published",
		scheduledAt: row.scheduled_at || null,
		studySet,
		createdAt: row.created_at,
		likes,
		likedByMe,
		bookmarkedByMe,
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

function canViewPost(db, post, userId) {
	if (post.publish_status === "scheduled" && post.user_id !== userId) return false;
	return post.visibility === "public" || post.user_id === userId;
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

function validateProfileImage(value, required = false, maxBytes = 700000) {
	const image = String(value || "").trim();
	if (!image && !required) return "";
	if (image.startsWith("/uploads/")) return image;
	if (image.length > maxBytes || !/^data:image\/(png|jpeg|webp|avif|gif);base64,[a-z0-9+/]+={0,2}$/i.test(image)) {
		throw makeError(400, "Ảnh phải là PNG, JPG, WEBP, AVIF hoặc GIF hợp lệ và đúng kích thước.");
	}
	return image;
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
	} catch {
		if (env.NODE_ENV === "production") throw makeError(502, "Không gửi được mã xác nhận qua email.");
		return { sent: false, devCode: code };
	}
}

function ensureConversation(db, userA, userB) {
	const pair = [userA, userB].sort();
	const id = `direct-${pair[0]}-${pair[1]}`;
	const now = new Date().toISOString();
	db.prepare("INSERT OR IGNORE INTO conversations(id, type, name, created_by, created_at) VALUES (?, 'direct', '', ?, ?)")
		.run(id, pair[0], now);
	const addMember = db.prepare("INSERT OR IGNORE INTO conversation_members(conversation_id, user_id, joined_at) VALUES (?, ?, ?)");
	addMember.run(id, pair[0], now);
	addMember.run(id, pair[1], now);
	syncDb(db);
	return id;
}

function isConversationMember(db, conversationId, userId) {
	return Boolean(db.prepare("SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?").get(conversationId, userId));
}

function serializeConversation(db, row, userId) {
	const members = db.prepare(`
		SELECT users.id, users.name, users.email, users.avatar, users.ghost_mode, users.privacy_activity, users.status_mode, users.last_seen_at
		FROM conversation_members JOIN users ON users.id = conversation_members.user_id
		WHERE conversation_members.conversation_id = ?
	`).all(row.id);
	const lastMessage = db.prepare("SELECT content, sticker_url, sender_id, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1").get(row.id);
	const counterpart = row.type === "direct" ? members.find(member => member.id !== userId) : null;
	const relation = counterpart ? relationship(db, userId, counterpart.id) : "none";
	return {
		id: row.id,
		type: row.type,
		name: row.type === "group" ? row.name : counterpart?.name || counterpart?.email || "Bạn bè",
		createdBy: row.created_by,
		subtitle: row.type === "group" ? `${members.length} thành viên` : counterpart?.email || "Cuộc trò chuyện riêng",
		avatar: counterpart?.avatar || "",
		presenceStatus: counterpart ? computePresenceStatus(counterpart, userId, relation) : "offline",
		memberIds: members.map(member => member.id),
		lastMessage: lastMessage
			? { text: lastMessage.sticker_url ? "[Sticker]" : lastMessage.content, fromId: lastMessage.sender_id, createdAt: lastMessage.created_at }
			: null
	};
}

function getFullUserProfilePayload(db, targetRow, viewerId) {
	const relation = viewerId ? relationship(db, viewerId, targetRow.id) : "none";
	const userObj = profileUser(db, targetRow, viewerId);
	const canAchievements = canViewerSeePrivacy(targetRow.privacy_achievements, viewerId, targetRow.id, relation);
	const canAlbum = canViewerSeePrivacy(targetRow.privacy_album, viewerId, targetRow.id, relation);

	const achievements = canAchievements
		? db.prepare("SELECT id, title, certificate_image AS certificateImage, created_at AS createdAt FROM profile_achievements WHERE user_id = ? ORDER BY created_at DESC").all(targetRow.id)
		: [];
	const interests = db.prepare("SELECT id, name, created_at AS createdAt FROM profile_interests WHERE user_id = ? ORDER BY created_at DESC").all(targetRow.id);
	const photos = canAlbum
		? db.prepare("SELECT id, image, caption, created_at AS createdAt FROM profile_photos WHERE user_id = ? ORDER BY created_at DESC").all(targetRow.id)
		: [];

	const rawTags = db.prepare("SELECT id, subject, kind, created_at AS createdAt FROM study_tags WHERE user_id = ? ORDER BY created_at DESC").all(targetRow.id);
	const studyTags = rawTags.map(tag => {
		const endorsements = db.prepare(`
			SELECT e.id, e.comment, e.created_at AS createdAt, e.endorser_id AS endorserId, u.name AS endorserName, u.avatar AS endorserAvatar
			FROM study_tag_endorsements e JOIN users u ON u.id = e.endorser_id
			WHERE e.tag_id = ? ORDER BY e.created_at DESC LIMIT 20
		`).all(tag.id);
		return {
			...tag,
			endorsementCount: endorsements.length,
			endorsedByMe: Boolean(viewerId && endorsements.some(e => e.endorserId === viewerId)),
			endorsements
		};
	});

	const showcase = db.prepare("SELECT id, title, description, link, image, kind, created_at AS createdAt FROM profile_showcase WHERE user_id = ? ORDER BY created_at DESC").all(targetRow.id);

	const nowMs = Date.now();
	const momentRow = db.prepare("SELECT * FROM user_moments WHERE user_id = ? AND expires_at > ? ORDER BY created_at DESC LIMIT 1").get(targetRow.id, nowMs);
	let activeMoment = null;
	if (momentRow) {
		const reactions = db.prepare(`
			SELECT mr.emoji, mr.created_at AS createdAt, u.id AS userId, u.name, u.avatar
			FROM moment_reactions mr JOIN users u ON u.id = mr.user_id
			WHERE mr.moment_id = ? ORDER BY mr.created_at DESC
		`).all(momentRow.id);
		activeMoment = {
			id: momentRow.id,
			image: momentRow.image,
			caption: momentRow.caption,
			gradFrom: momentRow.grad_from,
			gradTo: momentRow.grad_to,
			expiresAt: Number(momentRow.expires_at),
			createdAt: momentRow.created_at,
			reactionCount: reactions.length,
			myReaction: viewerId ? (reactions.find(r => r.userId === viewerId)?.emoji || "") : "",
			reactors: viewerId === targetRow.id ? reactions : reactions.slice(0, 3)
		};
	}

	const stories = db.prepare("SELECT id, media_url AS mediaUrl, media_type AS mediaType, caption, duration_hours AS durationHours, expires_at AS expiresAt, created_at AS createdAt FROM user_stories WHERE user_id = ? AND expires_at > ? ORDER BY created_at ASC").all(targetRow.id, nowMs);
	const studySets = db.prepare("SELECT * FROM study_sets WHERE user_id = ? ORDER BY pinned DESC, updated_at DESC").all(targetRow.id).map(s => serializeStudySet(db, s));

	const postRows = db.prepare(`
		SELECT * FROM posts
		WHERE user_id = ? AND club_id IS NULL AND type != 'study-resource'
		AND (publish_status = 'published' OR user_id = ?)
		AND (visibility = 'public' OR user_id = ?)
		ORDER BY created_at DESC LIMIT 60
	`).all(targetRow.id, viewerId || "", viewerId || "");

	return {
		user: userObj,
		relationship: relation,
		privacyLocked: { achievements: !canAchievements, album: !canAlbum },
		achievements,
		interests,
		photos,
		studyTags,
		showcase,
		activeMoment,
		stories,
		studySets,
		posts: postRows.map(p => postForViewer(db, p, viewerId || ""))
	};
}

function createServer(options = {}) {
	const env = options.env || process.env;
	const dbPath = options.dbPath || env.DATABASE_PATH || path.join(ROOT, "data", "dieunw-turso.sqlite");
	const db = options.db || initializeDatabase(dbPath);
	const server = createHttpServer(async (request, response) => {
		const host = request.headers.host || "localhost";
		const url = new URL(request.url || "/", `http://${host}`);
		const secure = Boolean(request.socket.encrypted || env.COOKIE_SECURE === "1" || request.headers["x-forwarded-proto"] === "https");
		const origin = request.headers.origin;
		try {
			if (url.pathname.startsWith("/api/")) {
				await handleApi({ request, response, url, db, env, secure });
				return;
			}
			if (["GET", "HEAD", "OPTIONS"].includes(request.method || "GET") && url.pathname.startsWith("/uploads/")) {
				const uploadHeaders = { "Vary": "Origin" };
				if (isAllowedCorsOrigin(origin)) {
					uploadHeaders["Access-Control-Allow-Origin"] = origin;
					uploadHeaders["Access-Control-Allow-Credentials"] = "true";
					uploadHeaders["Access-Control-Allow-Methods"] = "GET, HEAD, OPTIONS";
					uploadHeaders["Access-Control-Allow-Headers"] = "Content-Type, Authorization";
				}
				if (request.method === "OPTIONS") {
					response.writeHead(204, uploadHeaders);
					response.end();
					return;
				}
				const fileName = path.basename(decodeURIComponent(url.pathname.slice("/uploads/".length)));
				const filePath = path.join(UPLOAD_DIR, fileName);
				if (!existsSync(filePath) || !statSync(filePath).isFile()) throw makeError(404, "Không tìm thấy tệp.");
				const forceDownload = url.searchParams.get("download") === "1";
				const requestedName = String(url.searchParams.get("name") || fileName).replace(/["\r\n\\/]+/g, "_").trim() || fileName;
				const headers = {
					...uploadHeaders,
					"Content-Type": MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
					"Cache-Control": "public, max-age=86400"
				};
				if (forceDownload) {
					headers["Content-Disposition"] = `attachment; filename*=UTF-8''${encodeURIComponent(requestedName)}`;
				}
				response.writeHead(200, headers);
				if (request.method === "HEAD") {
					response.end();
					return;
				}
				createReadStream(filePath).pipe(response);
				return;
			}
			serveStatic(request, response, url);
		} catch (error) {
			if (!response.headersSent) {
				console.error("Chi tiết lỗi máy chủ:", error);
				const errHeaders = {};
				if (isAllowedCorsOrigin(origin)) {
					errHeaders["Access-Control-Allow-Origin"] = origin;
					errHeaders["Access-Control-Allow-Credentials"] = "true";
					errHeaders["Vary"] = "Origin";
				}
				sendJson(response, error.statusCode || 500, { error: error.statusCode ? error.message : "Lỗi máy chủ." }, errHeaders);
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

	const origin = request.headers.origin;
	if (origin && !isAllowedCorsOrigin(origin)) {
		throw makeError(403, "Nguồn yêu cầu không được phép.");
	}
	if (origin) {
		response.setHeader("Access-Control-Allow-Origin", origin);
		response.setHeader("Access-Control-Allow-Credentials", "true");
		response.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
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
		db.prepare("UPDATE users SET last_seen_at = ?, status_mode = 'online' WHERE id = ?").run(Date.now(), user.id);
		syncDb(db);
		const cookie = setSession(db, user.id, response, secure);
		const token = cookie.split(";")[0].split("=")[1];
		sendJson(response, 200, { user: profileUser(db, db.prepare("SELECT * FROM users WHERE id = ?").get(user.id)), token }, { "Set-Cookie": cookie });
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
		`).run(email, hashValue(`${email}:${code}`), payload, Date.now() + OTP_DURATION);
		syncDb(db);
		const delivery = await sendOtp(email, code, "Đăng ký", env);
		sendJson(response, 200, { ok: true, email, expiresIn: OTP_DURATION / 1000, ...(delivery.devCode ? { devCode: delivery.devCode } : {}) });
		return;
	}
	if (method === "POST" && pathname === "/api/auth/register/verify") {
		const body = await readJson(request);
		const email = validateEmail(body.email);
		const challenge = db.prepare("SELECT * FROM email_challenges WHERE email = ? COLLATE NOCASE AND purpose = 'register'").get(email);
		if (!challenge || challenge.expires_at < Date.now() || challenge.attempts >= 5 || challenge.code_hash !== hashValue(`${email}:${String(body.code || "")}`)) {
			if (challenge) {
				db.prepare("UPDATE email_challenges SET attempts = attempts + 1 WHERE email = ? AND purpose = 'register'").run(email);
				syncDb(db);
			}
			throw makeError(400, "Mã xác nhận không hợp lệ hoặc đã hết hạn.");
		}
		const pending = JSON.parse(challenge.payload);
		const userId = randomBytes(16).toString("hex");
		const now = new Date().toISOString();
		db.prepare(`
			INSERT INTO users(id, name, email, password_hash, password_salt, student_class, avatar, cover, bio, is_admin, is_moderator, last_seen_at, created_at)
			VALUES (?, ?, ?, ?, ?, 'Học sinh NQD', './DIEU.png', '', 'Chào mừng đến với góc học tập của mình trên DIEUNW!',
				EXISTS(SELECT 1 FROM admin_emails WHERE email = ? COLLATE NOCASE),
				EXISTS(SELECT 1 FROM moderator_emails WHERE email = ? COLLATE NOCASE), ?, ?)
		`).run(userId, pending.name, email, pending.password_hash, pending.password_salt, email, email, Date.now(), now);
		db.prepare("DELETE FROM email_challenges WHERE email = ? AND purpose = 'register'").run(email);
		syncDb(db);
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
		`).run(email, hashValue(`${email}:${code}`), JSON.stringify({ userId: user.id }), Date.now() + OTP_DURATION);
		syncDb(db);
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
			if (challenge) {
				db.prepare("UPDATE email_challenges SET attempts = attempts + 1 WHERE email = ? AND purpose = 'password'").run(email);
				syncDb(db);
			}
			throw makeError(400, "Mã xác nhận không hợp lệ hoặc đã hết hạn.");
		}
		const pending = JSON.parse(challenge.payload);
		const password = hashPassword(body.password);
		db.prepare("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?").run(password.hash, password.salt, pending.userId);
		db.prepare("DELETE FROM email_challenges WHERE email = ? AND purpose = 'password'").run(email);
		db.prepare("DELETE FROM sessions WHERE user_id = ?").run(pending.userId);
		syncDb(db);
		const cookie = setSession(db, pending.userId, response, secure);
		const token = cookie.split(";")[0].split("=")[1];
		sendJson(response, 200, { user: profileUser(db, db.prepare("SELECT * FROM users WHERE id = ?").get(pending.userId)), token }, { "Set-Cookie": cookie });
		return;
	}

	const optionalUser = getUserForRequest(db, request);
	autoPublishScheduledPosts(db);

	if (method === "GET" && pathname === "/api/clubs") {
		const rows = optionalUser?.isAdmin
			? db.prepare("SELECT * FROM clubs ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC LIMIT 200").all()
			: db.prepare("SELECT * FROM clubs WHERE status = 'approved' OR requested_by = ? ORDER BY created_at DESC LIMIT 200").all(optionalUser?.id || "");
		sendJson(response, 200, { clubs: rows.map(row => clubForViewer(db, row, optionalUser?.id || "")) });
		return;
	}

	const clubDetailMatch = pathname.match(/^\/api\/clubs\/([^/]+)$/);
	if (method === "GET" && clubDetailMatch) {
		const clubId = decodeURIComponent(clubDetailMatch[1]);
		const row = db.prepare("SELECT * FROM clubs WHERE id = ?").get(clubId);
		if (!row) throw makeError(404, "Không tìm thấy CLB.");
		const club = clubForViewer(db, row, optionalUser?.id || "");
		const isManager = Boolean(optionalUser && (
			optionalUser.isAdmin
			|| row.requested_by === optionalUser.id
			|| club.managerEmails.some(e => String(e || "").toLowerCase() === optionalUser.email.toLowerCase())
		));
		if (row.status !== "approved" && !isManager) throw makeError(404, "Không tìm thấy CLB.");
		const clubPosts = isManager
			? db.prepare("SELECT * FROM posts WHERE club_id = ? AND visibility = 'public' ORDER BY CASE publish_status WHEN 'scheduled' THEN 0 ELSE 1 END, created_at DESC LIMIT 100").all(clubId)
			: db.prepare("SELECT * FROM posts WHERE club_id = ? AND visibility = 'public' AND publish_status = 'published' ORDER BY created_at DESC LIMIT 100").all(clubId);
		sendJson(response, 200, { club, posts: clubPosts.map(post => postForViewer(db, post, optionalUser?.id || "")) });
		return;
	}

	if (method === "GET" && pathname === "/api/announcements") {
		const posts = db.prepare(`
			SELECT club_posts.*, clubs.name AS club_name, clubs.logo AS club_logo, clubs.tag_color, users.name AS author_name
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
			image: row.image || "",
			fileUrl: row.file_url || "",
			fileName: row.file_name || "",
			fileType: row.file_type || "",
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
			users: rows.map(row => ({ ...cleanUser(db, row, optionalUser?.id || ""), relationship: optionalUser ? relationship(db, optionalUser.id, row.id) : "none" })),
			currentUser: optionalUser
		});
		return;
	}

	const userProfileMatch = pathname.match(/^\/api\/users\/([^/]+)\/profile$/);
	if (method === "GET" && userProfileMatch) {
		const targetId = decodeURIComponent(userProfileMatch[1]);
		if (targetId === "me") {
			const me = requireUser(db, request);
			const row = db.prepare("SELECT * FROM users WHERE id = ?").get(me.id);
			sendJson(response, 200, getFullUserProfilePayload(db, row, me.id));
			return;
		}
		const targetRow = db.prepare("SELECT * FROM users WHERE id = ?").get(targetId);
		if (!targetRow) throw makeError(404, "Không tìm thấy học sinh này.");
		sendJson(response, 200, getFullUserProfilePayload(db, targetRow, optionalUser?.id || ""));
		return;
	}

	if (method === "GET" && pathname === "/api/stories") {
		const nowMs = Date.now();
		const rows = db.prepare(`
			SELECT s.*, u.name AS user_name, u.avatar AS user_avatar, u.student_class AS user_class
			FROM user_stories s JOIN users u ON u.id = s.user_id
			WHERE s.expires_at > ?
			ORDER BY s.created_at ASC
		`).all(nowMs);

		const byUser = new Map();
		for (const row of rows) {
			if (!byUser.has(row.user_id)) {
				byUser.set(row.user_id, {
					userId: row.user_id,
					userName: row.user_name,
					userAvatar: row.user_avatar || "./DIEU.png",
					userClass: row.user_class,
					stories: []
				});
			}
			const viewed = optionalUser ? Boolean(db.prepare("SELECT 1 FROM story_views WHERE story_id = ? AND user_id = ?").get(row.id, optionalUser.id)) : false;
			byUser.get(row.user_id).stories.push({
				id: row.id,
				mediaUrl: row.media_url,
				mediaType: row.media_type,
				caption: row.caption,
				durationHours: row.duration_hours,
				expiresAt: Number(row.expires_at),
				createdAt: row.created_at,
				viewed
			});
		}
		sendJson(response, 200, { storyGroups: [...byUser.values()] });
		return;
	}

	const user = optionalUser || requireUser(db, request);
	if (!user) throw makeError(401, "Đăng nhập để tiếp tục.");

	// HEARTBEAT & PRESENCE
	if (method === "POST" && pathname === "/api/presence") {
		const body = await readJson(request);
		const mode = body.statusMode === "studying" ? "studying" : "online";
		db.prepare("UPDATE users SET last_seen_at = ?, status_mode = ? WHERE id = ?").run(Date.now(), mode, user.id);
		syncDb(db);
		sendJson(response, 200, { ok: true, presenceStatus: user.ghostMode ? "offline" : mode });
		return;
	}

	// UPDATE PROFILE & DIEUNW+ SETTINGS
	if (method === "PATCH" && pathname === "/api/users/me") {
		const body = await readJson(request);
		const currentRow = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
		const name = body.name !== undefined ? String(body.name || "").trim().slice(0, 80) : currentRow.name;
		if (!name) throw makeError(400, "Tên hiển thị không được để trống.");
		const email = body.email !== undefined ? validateEmail(body.email) : currentRow.email;
		const studentClass = body.studentClass !== undefined ? String(body.studentClass || "Học sinh NQD").trim().slice(0, 80) : currentRow.student_class;
		const cohort = body.cohort !== undefined ? String(body.cohort || "").trim().slice(0, 40) : (currentRow.cohort || "");
		const avatar = body.avatar !== undefined ? (body.avatar ? validateProfileImage(body.avatar, false) : "./DIEU.png") : currentRow.avatar;
		const cover = body.cover !== undefined ? (body.cover ? validateProfileImage(body.cover, false, 1200000) : "") : currentRow.cover;
		const bio = body.bio !== undefined ? String(body.bio || "").trim().slice(0, 500) : currentRow.bio;
		const socialFb = body.socialFacebook !== undefined ? String(body.socialFacebook || "").trim().slice(0, 250) : currentRow.social_facebook;
		const socialIg = body.socialInstagram !== undefined ? String(body.socialInstagram || "").trim().slice(0, 250) : currentRow.social_instagram;
		const socialGh = body.socialGithub !== undefined ? String(body.socialGithub || "").trim().slice(0, 250) : currentRow.social_github;
		const studySchedule = body.studySchedule !== undefined ? String(body.studySchedule || "").trim().slice(0, 200) : currentRow.study_schedule;

		const validPrivacy = new Set(["public", "friends", "private"]);
		const pAlbum = validPrivacy.has(body.privacyAlbum) ? body.privacyAlbum : currentRow.privacy_album;
		const pAch = validPrivacy.has(body.privacyAchievements) ? body.privacyAchievements : currentRow.privacy_achievements;
		const pAct = validPrivacy.has(body.privacyActivity) ? body.privacyActivity : currentRow.privacy_activity;
		const ghost = body.ghostMode !== undefined ? (body.ghostMode ? 1 : 0) : currentRow.ghost_mode;

		const hexRegex = /^#[0-9a-f]{6}$/i;
		const tPrim = body.themePrimary !== undefined ? (hexRegex.test(body.themePrimary) ? body.themePrimary : "") : currentRow.theme_primary;
		const tSec = body.themeSecondary !== undefined ? (hexRegex.test(body.themeSecondary) ? body.themeSecondary : "") : currentRow.theme_secondary;

		let activeFrame = currentRow.active_avatar_frame || "none";
		if (body.activeAvatarFrame !== undefined) {
			const unlocked = parseUnlockedFrames(currentRow.unlocked_frames);
			if (unlocked.includes(body.activeAvatarFrame)) activeFrame = body.activeAvatarFrame;
		}

		let ecardConfigRaw = currentRow.ecard_config || "";
		if (body.ecardConfig !== undefined) {
			if (body.ecardConfig === null) {
				ecardConfigRaw = "";
			} else if (typeof body.ecardConfig === "object") {
				const cfg = body.ecardConfig;
				const validPos = new Set(["center center", "left center", "right center", "center top", "center bottom"]);
				const bgImage = cfg.bgImage ? validateProfileImage(cfg.bgImage, false, 950000) : "";
				const cleanCfg = {
					bgImage,
					bgPos: validPos.has(cfg.bgPos) ? cfg.bgPos : "center center",
					color1: hexRegex.test(cfg.color1 || "") ? cfg.color1 : "#1769aa",
					color2: hexRegex.test(cfg.color2 || "") ? cfg.color2 : "#2298f8",
					overlayOpacity: Math.max(0, Math.min(80, Math.round(Number(cfg.overlayOpacity ?? 25)))),
					textTone: cfg.textTone === "dark" ? "dark" : "light",
					tagline: String(cfg.tagline || "").trim().slice(0, 60)
				};
				ecardConfigRaw = JSON.stringify(cleanCfg);
			}
		}

		try {
			db.prepare(`
				UPDATE users SET name = ?, email = ?, student_class = ?, cohort = ?, avatar = ?, cover = ?, bio = ?,
					social_facebook = ?, social_instagram = ?, social_github = ?, study_schedule = ?,
					privacy_album = ?, privacy_achievements = ?, privacy_activity = ?, ghost_mode = ?,
					theme_primary = ?, theme_secondary = ?, active_avatar_frame = ?, ecard_config = ?
				WHERE id = ?
			`).run(
				name, email, studentClass, cohort, avatar, cover, bio,
				socialFb, socialIg, socialGh, studySchedule,
				pAlbum, pAch, pAct, ghost,
				tPrim, tSec, activeFrame, ecardConfigRaw, user.id
			);
			syncDb(db);
		} catch {
			throw makeError(409, "Email này đã được tài khoản khác sử dụng.");
		}
		sendJson(response, 200, { user: profileUser(db, db.prepare("SELECT * FROM users WHERE id = ?").get(user.id)) });
		return;
	}

	// NOTE 24H
	if (method === "PUT" && pathname === "/api/profile/note") {
		const body = await readJson(request);
		const text = String(body.text || "").trim().slice(0, 80);
		const expires = text ? Date.now() + 24 * 60 * 60 * 1000 : 0;
		db.prepare("UPDATE users SET note_text = ?, note_expires_at = ? WHERE id = ?").run(text, expires, user.id);
		syncDb(db);
		sendJson(response, 200, { noteText: text, noteExpiresAt: expires });
		return;
	}

	// STUDY STREAK + POINTS + AVATAR FRAMES SHOP
	if (method === "POST" && pathname === "/api/study/session") {
		const body = await readJson(request);
		const minutes = Math.max(1, Math.min(240, Math.round(Number(body.minutes || 25))));
		const row = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
		const currentWeek = getIsoWeekKey();
		const today = getTodayDateKey();
		const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

		let streak = Number(row.study_streak_days || 0);
		if (row.last_study_date === today) streak = Math.max(1, streak);
		else if (row.last_study_date === yesterday) streak = streak + 1;
		else streak = 1;

		const weeklyMins = (row.weekly_study_reset_key === currentWeek ? Number(row.weekly_study_minutes || 0) : 0) + minutes;
		const gainedPoints = Math.max(5, Math.round(minutes));
		const newPoints = Number(row.study_points || 0) + gainedPoints;

		db.prepare(`
			UPDATE users SET study_points = ?, study_streak_days = ?, last_study_date = ?,
				weekly_study_minutes = ?, weekly_study_reset_key = ?, last_seen_at = ?, status_mode = 'studying'
			WHERE id = ?
		`).run(newPoints, streak, today, weeklyMins, currentWeek, Date.now(), user.id);
		syncDb(db);
		sendJson(response, 200, {
			user: profileUser(db, db.prepare("SELECT * FROM users WHERE id = ?").get(user.id)),
			gainedPoints
		});
		return;
	}

	if (method === "POST" && pathname === "/api/study/frames/unlock") {
		const body = await readJson(request);
		const frameId = String(body.frameId || "").trim();
		if (!(frameId in AVATAR_FRAME_COSTS)) throw makeError(400, "Khung avatar không tồn tại.");
		const row = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
		const unlocked = parseUnlockedFrames(row.unlocked_frames);
		let points = Number(row.study_points || 0);
		if (!unlocked.includes(frameId)) {
			const cost = AVATAR_FRAME_COSTS[frameId];
			if (points < cost) throw makeError(400, `Bạn cần ${cost} điểm tự học để đổi khung này (hiện có ${points} điểm).`);
			points -= cost;
			unlocked.push(frameId);
		}
		db.prepare("UPDATE users SET study_points = ?, unlocked_frames = ?, active_avatar_frame = ? WHERE id = ?")
			.run(points, JSON.stringify(unlocked), frameId, user.id);
		syncDb(db);
		sendJson(response, 200, { user: profileUser(db, db.prepare("SELECT * FROM users WHERE id = ?").get(user.id)) });
		return;
	}

	// PROFILE SECTIONS (ACHIEVEMENTS, INTERESTS, ALBUM)
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
		if (db.prepare("SELECT COUNT(*) AS count FROM profile_achievements WHERE user_id = ?").get(user.id).count >= 30) throw makeError(409, "Tối đa 30 thành tích.");
		const id = randomBytes(16).toString("hex");
		const createdAt = new Date().toISOString();
		const certificateImage = validateProfileImage(body.certificateImage);
		db.prepare("INSERT INTO profile_achievements(id, user_id, title, certificate_image, created_at) VALUES (?, ?, ?, ?, ?)").run(id, user.id, title, certificateImage, createdAt);
		syncDb(db);
		sendJson(response, 201, { achievement: { id, title, certificateImage, createdAt } });
		return;
	}
	if (method === "POST" && pathname === "/api/profile/interests") {
		const body = await readJson(request);
		const name = String(body.name || "").trim();
		if (!name || name.length > 40) throw makeError(400, "Sở thích phải có từ 1 đến 40 ký tự.");
		if (db.prepare("SELECT COUNT(*) AS count FROM profile_interests WHERE user_id = ?").get(user.id).count >= 30) throw makeError(409, "Tối đa 30 sở thích.");
		const id = randomBytes(16).toString("hex");
		const createdAt = new Date().toISOString();
		try {
			db.prepare("INSERT INTO profile_interests(id, user_id, name, created_at) VALUES (?, ?, ?, ?)").run(id, user.id, name, createdAt);
			syncDb(db);
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
		if (caption.length > 160) throw makeError(400, "Chú thích ảnh không vượt quá 160 ký tự.");
		if (db.prepare("SELECT COUNT(*) AS count FROM profile_photos WHERE user_id = ?").get(user.id).count >= 50) throw makeError(409, "Album lưu tối đa 50 ảnh.");
		const id = randomBytes(16).toString("hex");
		const createdAt = new Date().toISOString();
		db.prepare("INSERT INTO profile_photos(id, user_id, image, caption, created_at) VALUES (?, ?, ?, ?, ?)").run(id, user.id, image, caption, createdAt);
		syncDb(db);
		sendJson(response, 201, { photo: { id, image, caption, createdAt } });
		return;
	}
	const profileItem = pathname.match(/^\/api\/profile\/(achievements|interests|photos)\/([^/]+)$/);
	if (method === "DELETE" && profileItem) {
		const table = { achievements: "profile_achievements", interests: "profile_interests", photos: "profile_photos" }[profileItem[1]];
		const itemId = decodeURIComponent(profileItem[2]);
		const result = db.prepare(`DELETE FROM ${table} WHERE id = ? AND user_id = ?`).run(itemId, user.id);
		syncDb(db);
		if (!result.changes) throw makeError(404, "Không tìm thấy mục trong hồ sơ của bạn.");
		sendJson(response, 200, { ok: true });
		return;
	}

	// STUDY TAGS & ENDORSEMENTS (+1 XÁC NHẬN & NHẬN XÉT)
	if (method === "POST" && pathname === "/api/profile/study-tags") {
		const body = await readJson(request);
		const subject = String(body.subject || "").trim().replace(/^#/, "").slice(0, 40);
		const kind = body.kind === "need_help" ? "need_help" : "strength";
		if (!subject) throw makeError(400, "Nhập tên môn học / kỹ năng.");
		const id = randomBytes(16).toString("hex");
		const createdAt = new Date().toISOString();
		try {
			db.prepare("INSERT INTO study_tags(id, user_id, subject, kind, created_at) VALUES (?, ?, ?, ?, ?)").run(id, user.id, subject, kind, createdAt);
			syncDb(db);
		} catch {
			throw makeError(409, "Thẻ môn học này đã tồn tại.");
		}
		sendJson(response, 201, { tag: { id, subject, kind, endorsementCount: 0, endorsements: [], createdAt } });
		return;
	}
	const delStudyTag = pathname.match(/^\/api\/profile\/study-tags\/([^/]+)$/);
	if (method === "DELETE" && delStudyTag) {
		const result = db.prepare("DELETE FROM study_tags WHERE id = ? AND user_id = ?").run(decodeURIComponent(delStudyTag[1]), user.id);
		syncDb(db);
		if (!result.changes) throw makeError(404, "Không tìm thấy thẻ môn học.");
		sendJson(response, 200, { ok: true });
		return;
	}
	const endorseMatch = pathname.match(/^\/api\/study-tags\/([^/]+)\/endorse$/);
	if (method === "POST" && endorseMatch) {
		const tagId = decodeURIComponent(endorseMatch[1]);
		const tag = db.prepare("SELECT * FROM study_tags WHERE id = ?").get(tagId);
		if (!tag) throw makeError(404, "Không tìm thấy thẻ môn học.");
		if (tag.user_id === user.id) throw makeError(400, "Bạn không thể tự xác nhận cho mình.");
		const body = await readJson(request);
		const comment = String(body.comment || "").trim().slice(0, 140);
		const existing = db.prepare("SELECT id FROM study_tag_endorsements WHERE tag_id = ? AND endorser_id = ?").get(tagId, user.id);
		if (existing && !comment && body.toggle !== false) {
			db.prepare("DELETE FROM study_tag_endorsements WHERE id = ?").run(existing.id);
		} else {
			db.prepare(`
				INSERT INTO study_tag_endorsements(id, tag_id, endorser_id, comment, created_at)
				VALUES (?, ?, ?, ?, ?)
				ON CONFLICT(tag_id, endorser_id) DO UPDATE SET comment = excluded.comment
			`).run(randomBytes(16).toString("hex"), tagId, user.id, comment, new Date().toISOString());
		}
		syncDb(db);
		sendJson(response, 200, { ok: true });
		return;
	}

	// SHOWCASE (GHIM SẢN PHẨM CLB)
	if (method === "POST" && pathname === "/api/profile/showcase") {
		const body = await readJson(request);
		const title = String(body.title || "").trim().slice(0, 100);
		if (!title) throw makeError(400, "Nhập tiêu đề sản phẩm tâm đắc.");
		const count = db.prepare("SELECT COUNT(*) AS count FROM profile_showcase WHERE user_id = ?").get(user.id).count;
		if (count >= 6) throw makeError(409, "Chỉ ghim tối đa 6 sản phẩm.");
		const id = randomBytes(16).toString("hex");
		const createdAt = new Date().toISOString();
		const image = validateProfileImage(body.image, false);
		db.prepare("INSERT INTO profile_showcase(id, user_id, title, description, link, image, kind, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
			.run(id, user.id, title, String(body.description || "").trim().slice(0, 240), String(body.link || "").trim().slice(0, 500), image, String(body.kind || "product").slice(0, 30), createdAt);
		syncDb(db);
		sendJson(response, 201, { ok: true, id });
		return;
	}
	const delShowcase = pathname.match(/^\/api\/profile\/showcase\/([^/]+)$/);
	if (method === "DELETE" && delShowcase) {
		db.prepare("DELETE FROM profile_showcase WHERE id = ? AND user_id = ?").run(decodeURIComponent(delShowcase[1]), user.id);
		syncDb(db);
		sendJson(response, 200, { ok: true });
		return;
	}

	// MOMENTS 24H
	if (method === "POST" && pathname === "/api/profile/moments") {
		const body = await readJson(request);
		const image = validateProfileImage(body.image, true, 1200000);
		const caption = String(body.caption || "").trim().slice(0, 220);
		const hexRegex = /^#[0-9a-f]{6}$/i;
		const gradFrom = hexRegex.test(body.gradFrom) ? body.gradFrom : "#173853";
		const gradTo = hexRegex.test(body.gradTo) ? body.gradTo : "#2298f8";
		const id = randomBytes(16).toString("hex");
		const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
		db.prepare("INSERT INTO user_moments(id, user_id, image, caption, grad_from, grad_to, pinned, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)")
			.run(id, user.id, image, caption, gradFrom, gradTo, expiresAt, new Date().toISOString());
		syncDb(db);
		sendJson(response, 201, { ok: true, id });
		return;
	}
	const delMoment = pathname.match(/^\/api\/profile\/moments\/([^/]+)$/);
	if (method === "DELETE" && delMoment) {
		db.prepare("DELETE FROM user_moments WHERE id = ? AND user_id = ?").run(decodeURIComponent(delMoment[1]), user.id);
		syncDb(db);
		sendJson(response, 200, { ok: true });
		return;
	}
	const reactMoment = pathname.match(/^\/api\/moments\/([^/]+)\/react$/);
	if (method === "POST" && reactMoment) {
		const momentId = decodeURIComponent(reactMoment[1]);
		if (!db.prepare("SELECT 1 FROM user_moments WHERE id = ?").get(momentId)) throw makeError(404, "Không tìm thấy khoảnh khắc.");
		const body = await readJson(request);
		const emoji = String(body.emoji || "❤️").slice(0, 8);
		db.prepare(`
			INSERT INTO moment_reactions(moment_id, user_id, emoji, created_at)
			VALUES (?, ?, ?, ?)
			ON CONFLICT(moment_id, user_id) DO UPDATE SET emoji = excluded.emoji
		`).run(momentId, user.id, emoji, new Date().toISOString());
		syncDb(db);
		sendJson(response, 200, { ok: true });
		return;
	}

	// STORIES 24H / 48H
	if (method === "POST" && pathname === "/api/stories") {
		const contentType = request.headers["content-type"] || "";
		let mediaUrl = "";
		let mediaType = "image";
		let caption = "";
		let durationHours = 24;
		if (contentType.startsWith("multipart/form-data")) {
			const parts = await parseMultipart(request);
			const fields = {};
			let filePart = null;
			for (const p of parts) {
				if (p.fileName) filePart = p;
				else fields[p.name] = p.body.toString("utf8");
			}
			const saved = saveUploadedFile(filePart, "story");
			if (!saved) throw makeError(400, "Chọn ảnh hoặc video ngắn cho Story.");
			mediaUrl = saved.fileUrl;
			mediaType = saved.isVideo ? "video" : "image";
			caption = String(fields.caption || "").trim().slice(0, 200);
			durationHours = Number(fields.durationHours) === 48 ? 48 : 24;
		} else {
			const body = await readJson(request);
			mediaUrl = validateProfileImage(body.mediaUrl, true, 1200000);
			mediaType = "image";
			caption = String(body.caption || "").trim().slice(0, 200);
			durationHours = Number(body.durationHours) === 48 ? 48 : 24;
		}
		const id = randomBytes(16).toString("hex");
		const expiresAt = Date.now() + durationHours * 60 * 60 * 1000;
		db.prepare("INSERT INTO user_stories(id, user_id, media_url, media_type, caption, duration_hours, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
			.run(id, user.id, mediaUrl, mediaType, caption, durationHours, expiresAt, new Date().toISOString());
		syncDb(db);
		sendJson(response, 201, { ok: true, id });
		return;
	}
	const viewStory = pathname.match(/^\/api\/stories\/([^/]+)\/view$/);
	if (method === "POST" && viewStory) {
		db.prepare("INSERT OR IGNORE INTO story_views(story_id, user_id, viewed_at) VALUES (?, ?, ?)").run(decodeURIComponent(viewStory[1]), user.id, new Date().toISOString());
		syncDb(db);
		sendJson(response, 200, { ok: true });
		return;
	}
	const delStory = pathname.match(/^\/api\/stories\/([^/]+)$/);
	if (method === "DELETE" && delStory) {
		db.prepare("DELETE FROM user_stories WHERE id = ? AND user_id = ?").run(decodeURIComponent(delStory[1]), user.id);
		syncDb(db);
		sendJson(response, 200, { ok: true });
		return;
	}
	// STUDY SETS (FLASHCARD + QUIZ + FORK + CHALLENGE LEADERBOARD)
	if (method === "GET" && pathname === "/api/study-sets") {
		const targetUserId = url.searchParams.get("userId");
		const rows = targetUserId
			? db.prepare("SELECT * FROM study_sets WHERE user_id = ? ORDER BY pinned DESC, updated_at DESC LIMIT 100").all(targetUserId)
			: db.prepare("SELECT * FROM study_sets ORDER BY updated_at DESC LIMIT 100").all();
		sendJson(response, 200, { studySets: rows.map(r => serializeStudySet(db, r)) });
		return;
	}
	if (method === "POST" && pathname === "/api/study-sets") {
		const body = await readJson(request);
		const kind = body.kind === "quiz" || body.setType === "quiz" ? "quiz" : "flashcard";
		const title = String(body.title || "").trim().slice(0, 120);
		if (!title) throw makeError(400, "Nhập tiêu đề bộ thẻ / đề ôn tập.");
		const subject = String(body.subject || "Chung").trim().slice(0, 60);
		const description = String(body.description || "").trim().slice(0, 400);
		const rawCards = Array.isArray(body.cards) ? body.cards : (Array.isArray(body.items) ? body.items : []);
		const cards = rawCards.slice(0, 80);
		if (!cards.length) throw makeError(400, "Cần ít nhất 1 thẻ hoặc 1 câu hỏi.");
		const pinned = (body.pinned ?? body.isPinned) ? 1 : 0;
		const id = randomBytes(16).toString("hex");
		const now = new Date().toISOString();
		db.prepare("INSERT INTO study_sets(id, user_id, kind, title, subject, description, cards_json, pinned, study_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)")
			.run(id, user.id, kind, title, subject, description, JSON.stringify(cards), pinned, now, now);
		syncDb(db);
		sendJson(response, 201, { studySet: serializeStudySet(db, db.prepare("SELECT * FROM study_sets WHERE id = ?").get(id)) });
		return;
	}
	const studySetMatch = pathname.match(/^\/api\/study-sets\/([^/]+)$/);
	if (method === "GET" && studySetMatch) {
		const row = db.prepare("SELECT * FROM study_sets WHERE id = ?").get(decodeURIComponent(studySetMatch[1]));
		if (!row) throw makeError(404, "Không tìm thấy bộ đề.");
		sendJson(response, 200, { studySet: serializeStudySet(db, row) });
		return;
	}
	if (method === "PATCH" && studySetMatch) {
		const setId = decodeURIComponent(studySetMatch[1]);
		const row = db.prepare("SELECT * FROM study_sets WHERE id = ? AND user_id = ?").get(setId, user.id);
		if (!row) throw makeError(404, "Không tìm thấy bộ đề hoặc bạn không phải tác giả.");
		const body = await readJson(request);
		const title = body.title !== undefined ? String(body.title).trim().slice(0, 120) : row.title;
		const subject = body.subject !== undefined ? String(body.subject).trim().slice(0, 60) : row.subject;
		const description = body.description !== undefined ? String(body.description).trim().slice(0, 400) : row.description;
		const incomingCards = Array.isArray(body.cards) ? body.cards : (Array.isArray(body.items) ? body.items : null);
		const cardsJson = incomingCards ? JSON.stringify(incomingCards.slice(0, 80)) : row.cards_json;
		const incomingPinned = body.pinned !== undefined ? body.pinned : body.isPinned;
		const pinned = incomingPinned !== undefined ? (incomingPinned ? 1 : 0) : row.pinned;
		db.prepare("UPDATE study_sets SET title = ?, subject = ?, description = ?, cards_json = ?, pinned = ?, updated_at = ? WHERE id = ?")
			.run(title || row.title, subject, description, cardsJson, pinned, new Date().toISOString(), setId);
		syncDb(db);
		sendJson(response, 200, { studySet: serializeStudySet(db, db.prepare("SELECT * FROM study_sets WHERE id = ?").get(setId)) });
		return;
	}
	if (method === "DELETE" && studySetMatch) {
		const res = db.prepare("DELETE FROM study_sets WHERE id = ? AND user_id = ?").run(decodeURIComponent(studySetMatch[1]), user.id);
		syncDb(db);
		if (!res.changes) throw makeError(404, "Không tìm thấy bộ đề.");
		sendJson(response, 200, { ok: true });
		return;
	}
	const forkMatch = pathname.match(/^\/api\/study-sets\/([^/]+)\/fork$/);
	if (method === "POST" && forkMatch) {
		const source = db.prepare("SELECT * FROM study_sets WHERE id = ?").get(decodeURIComponent(forkMatch[1]));
		if (!source) throw makeError(404, "Không tìm thấy bộ đề gốc.");
		const id = randomBytes(16).toString("hex");
		const now = new Date().toISOString();
		db.prepare("INSERT INTO study_sets(id, user_id, forked_from_id, kind, title, subject, description, cards_json, pinned, study_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)")
			.run(id, user.id, source.id, source.kind, `${source.title} (Bản sao)`, source.subject, source.description, source.cards_json, now, now);
		syncDb(db);
		sendJson(response, 201, { studySet: serializeStudySet(db, db.prepare("SELECT * FROM study_sets WHERE id = ?").get(id)) });
		return;
	}
	const attemptMatch = pathname.match(/^\/api\/study-sets\/([^/]+)\/attempt$/);
	if (method === "POST" && attemptMatch) {
		const setId = decodeURIComponent(attemptMatch[1]);
		const row = db.prepare("SELECT * FROM study_sets WHERE id = ?").get(setId);
		if (!row) throw makeError(404, "Không tìm thấy bộ đề.");
		const body = await readJson(request);
		db.prepare("UPDATE study_sets SET study_count = study_count + 1 WHERE id = ?").run(setId);
		if (row.kind === "quiz" && typeof body.score === "number" && typeof body.total === "number") {
			db.prepare("INSERT INTO quiz_attempts(id, set_id, user_id, score, total, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
				.run(randomBytes(16).toString("hex"), setId, user.id, Math.max(0, Math.round(body.score)), Math.max(1, Math.round(body.total)), Math.max(100, Math.round(Number(body.durationMs || 1000))), new Date().toISOString());
		}
		syncDb(db);
		sendJson(response, 200, { studySet: serializeStudySet(db, db.prepare("SELECT * FROM study_sets WHERE id = ?").get(setId)) });
		return;
	}

	// BOOKMARKS
	if (method === "GET" && pathname === "/api/bookmarks") {
		const rows = db.prepare("SELECT item_type, item_id FROM user_bookmarks WHERE user_id = ? ORDER BY created_at DESC LIMIT 100").all(user.id);
		const posts = [];
		const resources = [];
		for (const b of rows) {
			const p = db.prepare("SELECT * FROM posts WHERE id = ?").get(b.item_id);
			if (!p) continue;
			const serialized = postForViewer(db, p, user.id);
			if (p.type === "study-resource") resources.push(serialized);
			else posts.push(serialized);
		}
		sendJson(response, 200, { posts, resources });
		return;
	}
	if (method === "POST" && pathname === "/api/bookmarks/toggle") {
		const body = await readJson(request);
		const itemType = body.itemType === "resource" ? "resource" : "post";
		const itemId = String(body.itemId || "");
		const exists = db.prepare("SELECT 1 FROM user_bookmarks WHERE user_id = ? AND item_type = ? AND item_id = ?").get(user.id, itemType, itemId);
		if (exists) {
			db.prepare("DELETE FROM user_bookmarks WHERE user_id = ? AND item_type = ? AND item_id = ?").run(user.id, itemType, itemId);
			syncDb(db);
			sendJson(response, 200, { bookmarked: false });
		} else {
			db.prepare("INSERT INTO user_bookmarks(user_id, item_type, item_id, created_at) VALUES (?, ?, ?, ?)").run(user.id, itemType, itemId, new Date().toISOString());
			syncDb(db);
			sendJson(response, 200, { bookmarked: true });
		}
		return;
	}

	// CUSTOM STICKERS (USER OR CLUB)
	if (method === "GET" && pathname === "/api/stickers") {
		const userStickers = db.prepare("SELECT * FROM user_stickers WHERE owner_type = 'user' AND owner_id = ? ORDER BY created_at DESC").all(user.id);
		const clubIds = getUserClubs(db, user).memberClubs.map(c => c.id);
		const clubStickers = clubIds.length
			? db.prepare(`SELECT * FROM user_stickers WHERE owner_type = 'club' AND owner_id IN (${clubIds.map(() => "?").join(",")}) ORDER BY created_at DESC`).all(...clubIds)
			: [];
		sendJson(response, 200, { stickers: [...userStickers, ...clubStickers] });
		return;
	}
	if (method === "POST" && pathname === "/api/stickers") {
		const body = await readJson(request);
		const image = validateProfileImage(body.image, true);
		const name = String(body.name || "Sticker").trim().slice(0, 40);
		let ownerType = "user";
		let ownerId = user.id;
		if (body.ownerType === "club" && body.ownerId) {
			const clubRow = db.prepare("SELECT * FROM clubs WHERE id = ?").get(String(body.ownerId));
			if (!clubRow) throw makeError(404, "Không tìm thấy CLB.");
			const club = clubForViewer(db, clubRow, user.id);
			if (!user.isAdmin && !club.managerEmails.some(e => e.toLowerCase() === user.email.toLowerCase())) {
				throw makeError(403, "Chỉ quản lý CLB mới thêm sticker cho CLB.");
			}
			ownerType = "club";
			ownerId = club.id;
		}
		const count = db.prepare("SELECT COUNT(*) AS count FROM user_stickers WHERE owner_type = ? AND owner_id = ?").get(ownerType, ownerId).count;
		if (count >= 24) throw makeError(409, "Tối đa 24 sticker cho mỗi bộ.");
		const id = randomBytes(16).toString("hex");
		const createdAt = new Date().toISOString();
		db.prepare("INSERT INTO user_stickers(id, owner_type, owner_id, name, image, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(id, ownerType, ownerId, name, image, createdAt);
		syncDb(db);
		sendJson(response, 201, { sticker: { id, owner_type: ownerType, owner_id: ownerId, name, image, created_at: createdAt } });
		return;
	}
	const delSticker = pathname.match(/^\/api\/stickers\/([^/]+)$/);
	if (method === "DELETE" && delSticker) {
		const sticker = db.prepare("SELECT * FROM user_stickers WHERE id = ?").get(decodeURIComponent(delSticker[1]));
		if (!sticker) throw makeError(404, "Không tìm thấy sticker.");
		if (sticker.owner_type === "user" && sticker.owner_id !== user.id) throw makeError(403, "Không có quyền xóa.");
		db.prepare("DELETE FROM user_stickers WHERE id = ?").run(sticker.id);
		syncDb(db);
		sendJson(response, 200, { ok: true });
		return;
	}

	// CLUBS CREATE / JOIN / EDIT / APPROVE / ANNOUNCEMENTS
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
		if (logo.length > 700000 || (logo && !(/^(https?:\/\/|data:image\/(png|jpeg|webp|avif|gif);base64,)/i.test(logo)))) {
			throw makeError(400, "Logo phải là ảnh hợp lệ.");
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
		for (const m of managers) {
			db.prepare("INSERT OR IGNORE INTO club_members(club_id, user_id, joined_at) VALUES (?, ?, ?)").run(id, m.id, createdAt);
		}
		syncDb(db);
		sendJson(response, 201, { club: clubForViewer(db, db.prepare("SELECT * FROM clubs WHERE id = ?").get(id), user.id) });
		return;
	}

	const clubJoinMatch = pathname.match(/^\/api\/clubs\/([^/]+)\/join$/);
	if (clubJoinMatch && ["POST", "DELETE"].includes(method)) {
		const clubId = decodeURIComponent(clubJoinMatch[1]);
		if (!db.prepare("SELECT 1 FROM clubs WHERE id = ? AND status = 'approved'").get(clubId)) throw makeError(404, "Không tìm thấy CLB.");
		if (method === "POST") db.prepare("INSERT OR IGNORE INTO club_members(club_id, user_id, joined_at) VALUES (?, ?, ?)").run(clubId, user.id, new Date().toISOString());
		else db.prepare("DELETE FROM club_members WHERE club_id = ? AND user_id = ?").run(clubId, user.id);
		syncDb(db);
		sendJson(response, 200, { ok: true });
		return;
	}

	const clubDecisionMatch = pathname.match(/^\/api\/clubs\/([^/]+)\/decision$/);
	if (method === "POST" && clubDecisionMatch) {
		requireAdmin(user);
		const clubId = decodeURIComponent(clubDecisionMatch[1]);
		const body = await readJson(request);
		const status = body.status === "approved" ? "approved" : "rejected";
		const clubRow = db.prepare("SELECT * FROM clubs WHERE id = ?").get(clubId);
		if (!clubRow) throw makeError(404, "Không tìm thấy CLB.");
		db.prepare("UPDATE clubs SET status = ?, decided_by = ?, decided_at = ? WHERE id = ?").run(status, user.id, new Date().toISOString(), clubId);
		writeAuditLog(db, user, status === "approved" ? "Duyệt CLB" : "Từ chối CLB", "club", clubId, clubRow.name);
		syncDb(db);
		sendJson(response, 200, { ok: true });
		return;
	}

	const clubPostAnnMatch = pathname.match(/^\/api\/clubs\/([^/]+)\/posts$/);
	if (method === "POST" && clubPostAnnMatch) {
		const clubId = decodeURIComponent(clubPostAnnMatch[1]);
		const clubRow = db.prepare("SELECT * FROM clubs WHERE id = ? AND status = 'approved'").get(clubId);
		if (!clubRow) throw makeError(404, "CLB không tồn tại.");
		const clubData = clubForViewer(db, clubRow, user.id);
		const isAllowed = user.isAdmin || clubData.managerEmails.some(e => e.toLowerCase() === user.email.toLowerCase());
		if (!isAllowed) throw makeError(403, "Bạn không có quyền đăng thông báo cho CLB này.");

		const contentType = request.headers["content-type"] || "";
		let content = "";
		let image = "";
		let fileUrl = "", fileName = "", fileType = "";
		if (contentType.startsWith("multipart/form-data")) {
			const parts = await parseMultipart(request);
			const fields = {};
			for (const p of parts) {
				if (p.fileName && p.name === "image") {
					const savedImg = saveUploadedFile(p, "image");
					if (savedImg) image = savedImg.fileUrl;
				} else if (p.fileName) {
					const savedFile = saveUploadedFile(p, "any");
					if (savedFile) {
						fileUrl = savedFile.fileUrl;
						fileName = savedFile.fileName;
						fileType = savedFile.fileType;
					}
				} else {
					fields[p.name] = p.body.toString("utf8");
				}
			}
			content = String(fields.content || "").trim();
			if (!image && fields.imageData) image = validateProfileImage(fields.imageData, false);
		} else {
			const body = await readJson(request);
			content = String(body.content || "").trim();
			if (body.image) image = validateProfileImage(body.image, false);
		}
		if (!content || content.length > 10000) throw makeError(400, "Nội dung thông báo không hợp lệ.");
		const id = randomBytes(16).toString("hex");
		db.prepare("INSERT INTO club_posts(id, club_id, author_id, content, image, file_url, file_name, file_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
			.run(id, clubId, user.id, content, image, fileUrl, fileName, fileType, new Date().toISOString());
		syncDb(db);
		sendJson(response, 201, { ok: true, id });
		return;
	}

	if (method === "PATCH" && clubDetailMatch) {
		const clubId = decodeURIComponent(clubDetailMatch[1]);
		const row = db.prepare("SELECT * FROM clubs WHERE id = ?").get(clubId);
		if (!row) throw makeError(404, "Không tìm thấy CLB.");
		const currentClub = clubForViewer(db, row, user.id);
		const isAllowed = currentClub.managerEmails.some(e => String(e || "").toLowerCase() === user.email.toLowerCase()) || user.isAdmin;
		if (!isAllowed) throw makeError(403, "Bạn không có quyền chỉnh sửa Fanpage CLB này.");
		const body = await readJson(request);
		const newName = body.name !== undefined ? String(body.name).trim() : row.name;
		const newLogo = body.logo !== undefined ? String(body.logo).trim().slice(0, 700000) : row.logo;
		const newCover = body.cover !== undefined ? String(body.cover).trim().slice(0, 1200000) : (row.cover || "");
		const newBio = body.bio !== undefined ? String(body.bio).trim().slice(0, 500) : (row.bio || "");
		if (!newName || newName.length > 80) throw makeError(400, "Tên CLB không hợp lệ.");
		db.prepare("UPDATE clubs SET name = ?, logo = ?, cover = ?, bio = ? WHERE id = ?").run(newName, newLogo, newCover, newBio, clubId);
		syncDb(db);
		sendJson(response, 200, { club: clubForViewer(db, db.prepare("SELECT * FROM clubs WHERE id = ?").get(clubId), user.id) });
		return;
	}

	// ADMIN / MODERATOR RBAC WORKSPACE & AUDIT LOG
	if (method === "GET" && pathname === "/api/admin/workspace") {
		requireModerator(user);
		const admins = user.isAdmin ? db.prepare("SELECT email FROM admin_emails ORDER BY email").all().map(r => r.email) : [];
		const moderators = user.isAdmin ? db.prepare("SELECT email FROM moderator_emails ORDER BY email").all().map(r => r.email) : [];

		// Max-Heap style sorted report queues (descending by reportCount > 0)
		const postReportGroups = db.prepare(`
			SELECT target_id, COUNT(*) AS report_count, MAX(created_at) AS latest_at
			FROM reports WHERE target_type = 'post' AND status = 'open'
			GROUP BY target_id ORDER BY report_count DESC, latest_at DESC LIMIT 100
		`).all();
		const reportQueuePosts = postReportGroups.map(g => {
			const postRow = db.prepare("SELECT * FROM posts WHERE id = ?").get(g.target_id);
			if (!postRow) return null;
			const reasons = db.prepare("SELECT r.reason, r.created_at AS createdAt, u.name AS reporterName FROM reports r JOIN users u ON u.id = r.reporter_id WHERE r.target_type = 'post' AND r.target_id = ? AND r.status = 'open' ORDER BY r.created_at DESC").all(g.target_id);
			return { targetId: g.target_id, reportCount: g.report_count, post: postForViewer(db, postRow, user.id), reasons };
		}).filter(Boolean);

		const userReportGroups = db.prepare(`
			SELECT target_id, COUNT(*) AS report_count, MAX(created_at) AS latest_at
			FROM reports WHERE target_type = 'user' AND status = 'open'
			GROUP BY target_id ORDER BY report_count DESC, latest_at DESC LIMIT 100
		`).all();
		const reportQueueUsers = userReportGroups.map(g => {
			const uRow = db.prepare("SELECT * FROM users WHERE id = ?").get(g.target_id);
			if (!uRow) return null;
			const reasons = db.prepare("SELECT r.reason, r.created_at AS createdAt, u.name AS reporterName FROM reports r JOIN users u ON u.id = r.reporter_id WHERE r.target_type = 'user' AND r.target_id = ? AND r.status = 'open' ORDER BY r.created_at DESC").all(g.target_id);
			return { targetId: g.target_id, reportCount: g.report_count, account: cleanUser(db, uRow, user.id), reasons };
		}).filter(Boolean);

		const auditLogs = db.prepare("SELECT * FROM moderation_audit_logs ORDER BY created_at DESC LIMIT 60").all();
		sendJson(response, 200, {
			isAdmin: user.isAdmin,
			isModerator: user.isModerator,
			admins,
			moderators,
			reportQueuePosts,
			reportQueueUsers,
			auditLogs
		});
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
		db.prepare("INSERT OR IGNORE INTO admin_emails(email, created_at) VALUES (?, ?)").run(email, new Date().toISOString());
		db.prepare("UPDATE users SET is_admin = 1 WHERE email = ? COLLATE NOCASE").run(email);
		writeAuditLog(db, user, "Cấp quyền Admin", "user", email, email);
		syncDb(db);
		sendJson(response, 200, { ok: true, email, accountExists: Boolean(db.prepare("SELECT 1 FROM users WHERE email = ? COLLATE NOCASE").get(email)) });
		return;
	}
	if (method === "POST" && pathname === "/api/moderators") {
		requireAdmin(user);
		const body = await readJson(request);
		const email = validateEmail(body.email);
		db.prepare("INSERT OR IGNORE INTO moderator_emails(email, created_at) VALUES (?, ?)").run(email, new Date().toISOString());
		db.prepare("UPDATE users SET is_moderator = 1 WHERE email = ? COLLATE NOCASE").run(email);
		writeAuditLog(db, user, "Thêm Ban duyệt bài", "user", email, email);
		syncDb(db);
		sendJson(response, 200, { ok: true, email, accountExists: Boolean(db.prepare("SELECT 1 FROM users WHERE email = ? COLLATE NOCASE").get(email)) });
		return;
	}
	const delModMatch = pathname.match(/^\/api\/moderators\/([^/]+)$/);
	if (method === "DELETE" && delModMatch) {
		requireAdmin(user);
		const email = decodeURIComponent(delModMatch[1]).toLowerCase();
		db.prepare("DELETE FROM moderator_emails WHERE email = ? COLLATE NOCASE").run(email);
		db.prepare("UPDATE users SET is_moderator = 0 WHERE email = ? COLLATE NOCASE").run(email);
		writeAuditLog(db, user, "Gỡ Ban duyệt bài", "user", email, email);
		syncDb(db);
		sendJson(response, 200, { ok: true });
		return;
	}

	if (method === "POST" && pathname === "/api/reports") {
		const body = await readJson(request);
		const targetType = body.targetType === "user" ? "user" : "post";
		const targetId = String(body.targetId || "").trim();
		const reason = String(body.reason || "Vi phạm nội quy").trim().slice(0, 500);
		if (!targetId) throw makeError(400, "Thiếu đối tượng báo cáo.");
		db.prepare(`
			INSERT INTO reports(id, target_type, target_id, reporter_id, reason, status, created_at)
			VALUES (?, ?, ?, ?, ?, 'open', ?)
			ON CONFLICT(target_type, target_id, reporter_id) DO UPDATE SET reason = excluded.reason, status = 'open', created_at = excluded.created_at
		`).run(randomBytes(16).toString("hex"), targetType, targetId, user.id, reason, new Date().toISOString());
		syncDb(db);
		sendJson(response, 201, { ok: true });
		return;
	}

	if (method === "POST" && pathname === "/api/moderation/resolve") {
		requireModerator(user);
		const body = await readJson(request);
		const targetType = body.targetType === "user" ? "user" : "post";
		const targetId = String(body.targetId || "");
		const action = body.action;
		if (!targetId) throw makeError(400, "Thiếu đối tượng kiểm duyệt.");

		if (action === "delete_post" && targetType === "post") {
			const postRow = db.prepare("SELECT content FROM posts WHERE id = ?").get(targetId);
			db.prepare("DELETE FROM posts WHERE id = ?").run(targetId);
			db.prepare("UPDATE reports SET status = 'resolved' WHERE target_type = 'post' AND target_id = ?").run(targetId);
			writeAuditLog(db, user, "Xóa bài viết vi phạm", "post", targetId, (postRow?.content || "").slice(0, 60));
		} else {
			db.prepare("UPDATE reports SET status = 'dismissed' WHERE target_type = ? AND target_id = ?").run(targetType, targetId);
			writeAuditLog(db, user, "Bỏ qua báo cáo", targetType, targetId, targetId);
		}
		syncDb(db);
		sendJson(response, 200, { ok: true });
		return;
	}

	// POSTS (RICH TEXT + SCHEDULED CLUB POSTS + STUDY SET CARDS + STUDY RESOURCES)
	if (method === "GET" && pathname === "/api/posts") {
		const posts = db.prepare(`
			SELECT * FROM posts
			WHERE (visibility = 'public' OR user_id = ?)
			AND (publish_status = 'published' OR user_id = ?)
			ORDER BY created_at DESC LIMIT 100
		`).all(user.id, user.id);
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
			const description = String(fields.resource_description || fields.description || "").trim().slice(0, 3000);
			const link = String(fields.resource_link || fields.link || "").trim().slice(0, 1000);
			const grade = String(fields.resource_grade || fields.grade || "").trim();
			const track = String(fields.resource_track || fields.track || "").trim();
			const subject = String(fields.resource_subject || fields.subject || "").trim();
			const rawColor = String(fields.resource_cover_color || fields.coverColor || "").trim();
			const coverColor = /^#[0-9a-f]{6}$/i.test(rawColor) ? rawColor : "#6aa68d";

			if (!title) throw makeError(400, "Tiêu đề tài liệu không được để trống.");
			let fUrl = "", fName = "", fType = "", fSize = 0;
			if (filePart) {
				const saved = saveUploadedFile(filePart, "any");
				if (saved) {
					fUrl = saved.fileUrl;
					fName = saved.fileName;
					fType = saved.fileType;
					fSize = saved.fileSize;
				}
			}
			if (!link && !fUrl) throw makeError(400, "Cần cung cấp ít nhất Liên kết tài liệu hoặc Tệp tài liệu.");

			const content = title + (description ? " - " + description : "");
			db.prepare(`
				INSERT INTO posts(
					id, user_id, type, content, image, visibility, created_at,
					resource_title, resource_description, resource_link,
					resource_grade, resource_track, resource_subject,
					resource_file_url, resource_file_name, resource_file_type, resource_file_size, resource_cover_color
				) VALUES (?, ?, 'study-resource', ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			`).run(id, user.id, content, visibility, createdAt, title, description, link, grade, track, subject, fUrl, fName, fType, fSize, coverColor);
			syncDb(db);
		} else {
			const content = String(fields.content || "").trim();
			const image = fields.image ? validateProfileImage(fields.image, false, 1200000) : "";
			const clubId = fields.clubId ? String(fields.clubId).trim() : null;
			const isRichHtml = fields.isRichHtml ? 1 : 0;
			const studySetId = fields.studySetId ? String(fields.studySetId).trim() : null;
			let scheduledAt = null;
			let publishStatus = "published";

			if (!content || content.length > 15000) throw makeError(400, "Nội dung bài viết không hợp lệ.");

			if (clubId) {
				const clubRow = db.prepare("SELECT * FROM clubs WHERE id = ?").get(clubId);
				if (!clubRow) throw makeError(404, "CLB không tồn tại.");
				const clubData = clubForViewer(db, clubRow, user.id);
				const isAllowed = clubData.managerEmails.some(e => String(e || "").toLowerCase() === user.email.toLowerCase()) || user.isAdmin;
				if (!isAllowed) throw makeError(403, "Bạn không có quyền đăng bài cho CLB này.");
				if (fields.scheduledAt) {
					const parsedDate = new Date(fields.scheduledAt);
					if (!Number.isNaN(parsedDate.getTime()) && parsedDate.getTime() > Date.now() + 30000) {
						scheduledAt = parsedDate.toISOString();
						publishStatus = "scheduled";
					}
				}
			}

			db.prepare(`
				INSERT INTO posts(id, user_id, club_id, type, content, image, visibility, is_rich_html, study_set_id, scheduled_at, publish_status, created_at)
				VALUES (?, ?, ?, 'post', ?, ?, ?, ?, ?, ?, ?, ?)
			`).run(id, user.id, clubId, content, image, visibility, isRichHtml, studySetId, scheduledAt, publishStatus, createdAt);
			syncDb(db);
		}
		sendJson(response, 201, { post: postForViewer(db, db.prepare("SELECT * FROM posts WHERE id = ?").get(id), user.id) });
		return;
	}

	const deletePost = pathname.match(/^\/api\/posts\/([^/]+)$/);
	if (method === "DELETE" && deletePost) {
		const postId = decodeURIComponent(deletePost[1]);
		const post = db.prepare("SELECT user_id, club_id, content FROM posts WHERE id = ?").get(postId);
		if (!post) throw makeError(404, "Không tìm thấy bài viết.");
		let canDelete = post.user_id === user.id || user.isAdmin || user.isModerator;
		if (!canDelete && post.club_id) {
			const clubRow = db.prepare("SELECT * FROM clubs WHERE id = ?").get(post.club_id);
			if (clubRow) {
				const clubData = clubForViewer(db, clubRow, user.id);
				canDelete = clubData.managerEmails.some(e => String(e || "").toLowerCase() === user.email.toLowerCase());
			}
		}
		if (!canDelete) throw makeError(403, "Chỉ người đăng hoặc ban kiểm duyệt mới có thể xóa.");
		db.prepare("DELETE FROM posts WHERE id = ?").run(postId);
		if (post.user_id !== user.id && (user.isAdmin || user.isModerator)) {
			writeAuditLog(db, user, "Xóa bài viết", "post", postId, (post.content || "").slice(0, 60));
		}
		syncDb(db);
		sendJson(response, 200, { ok: true });
		return;
	}

	const likeMatch = pathname.match(/^\/api\/posts\/([^/]+)\/like$/);
	if (method === "POST" && likeMatch) {
		const post = db.prepare("SELECT * FROM posts WHERE id = ?").get(decodeURIComponent(likeMatch[1]));
		if (!post || !canViewPost(db, post, user.id)) throw makeError(404, "Không tìm thấy bài viết.");
		const body = await readJson(request);
		if (body.liked) db.prepare("INSERT OR IGNORE INTO post_likes(post_id, user_id, created_at) VALUES (?, ?, ?)").run(post.id, user.id, new Date().toISOString());
		else db.prepare("DELETE FROM post_likes WHERE post_id = ? AND user_id = ?").run(post.id, user.id);
		syncDb(db);
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
		const stickerUrl = body.stickerUrl ? validateProfileImage(body.stickerUrl, false) : "";
		if (!content && !stickerUrl) throw makeError(400, "Bình luận không được để trống.");
		if (content.length > 2000) throw makeError(400, "Bình luận quá dài.");
		const id = randomBytes(16).toString("hex");
		const createdAt = new Date().toISOString();
		db.prepare("INSERT INTO post_comments(id, post_id, user_id, content, sticker_url, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(id, post.id, user.id, content, stickerUrl, createdAt);
		syncDb(db);
		sendJson(response, 201, { comment: { id, userId: user.id, text: content, stickerUrl, name: user.name, avatar: user.avatar, createdAt } });
		return;
	}

	// FRIENDS & REQUESTS
	if (method === "GET" && pathname === "/api/friends") {
		const friends = db.prepare(`
			SELECT users.* FROM friendships
			JOIN users ON users.id = CASE WHEN friendships.user_low = ? THEN friendships.user_high ELSE friendships.user_low END
			WHERE friendships.user_low = ? OR friendships.user_high = ? ORDER BY users.name
		`).all(user.id, user.id, user.id).map(row => ({ ...cleanUser(db, row, user.id), relationship: "friend" }));
		const incoming = db.prepare("SELECT users.* FROM friend_requests JOIN users ON users.id = friend_requests.sender_id WHERE receiver_id = ? AND status = 'pending' ORDER BY friend_requests.created_at")
			.all(user.id).map(row => ({ ...cleanUser(db, row, user.id), relationship: "incoming" }));
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
			const result = db.prepare("DELETE FROM friendships WHERE user_low = ? AND user_high = ?").run(pair[0], pair[1]);
			if (!result.changes) throw makeError(404, "Hai tài khoản hiện không phải bạn bè.");
			db.prepare("DELETE FROM friend_requests WHERE status = 'accepted' AND ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))").run(user.id, friendId, friendId, user.id);
			db.exec("COMMIT");
			syncDb(db);
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
		db.prepare("INSERT INTO friend_requests(id, sender_id, receiver_id, status, created_at) VALUES (?, ?, ?, 'pending', ?)").run(randomBytes(16).toString("hex"), user.id, targetId, new Date().toISOString());
		syncDb(db);
		sendJson(response, 201, { ok: true });
		return;
	}
	const friendAction = pathname.match(/^\/api\/friend-requests\/([^/]+)\/(accept|reject)$/);
	if (method === "POST" && friendAction) {
		const senderId = decodeURIComponent(friendAction[1]);
		const requestRow = db.prepare("SELECT * FROM friend_requests WHERE sender_id = ? AND receiver_id = ? AND status = 'pending'").get(senderId, user.id);
		if (!requestRow) throw makeError(404, "Không tìm thấy lời mời.");
		if (friendAction[2] === "reject") {
			db.prepare("UPDATE friend_requests SET status = 'rejected' WHERE id = ?").run(requestRow.id);
			syncDb(db);
			sendJson(response, 200, { ok: true });
			return;
		}
		const pair = [user.id, senderId].sort();
		db.exec("BEGIN");
		try {
			db.prepare("UPDATE friend_requests SET status = 'accepted' WHERE id = ?").run(requestRow.id);
			db.prepare("INSERT OR IGNORE INTO friendships(user_low, user_high, created_at) VALUES (?, ?, ?)").run(pair[0], pair[1], new Date().toISOString());
			ensureConversation(db, pair[0], pair[1]);
			db.exec("COMMIT");
			syncDb(db);
		} catch (error) {
			db.exec("ROLLBACK");
			throw error;
		}
		sendJson(response, 200, { ok: true });
		return;
	}

	// CONVERSATIONS & MESSAGES (TYPING / READ RECEIPTS RESPECTING GHOST MODE + STICKERS)
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
			db.prepare("INSERT INTO conversations(id, type, name, created_by, created_at) VALUES (?, 'group', ?, ?, ?)").run(id, name, user.id, createdAt);
			const addMember = db.prepare("INSERT INTO conversation_members(conversation_id, user_id, joined_at) VALUES (?, ?, ?)");
			[user.id, ...memberIds].forEach(memberId => addMember.run(id, memberId, createdAt));
			db.exec("COMMIT");
			syncDb(db);
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
		db.prepare("DELETE FROM conversations WHERE id = ?").run(conversationId);
		syncDb(db);
		sendJson(response, 200, { ok: true });
		return;
	}

	const typingMatch = pathname.match(/^\/api\/conversations\/([^/]+)\/typing$/);
	if (method === "POST" && typingMatch) {
		const conversationId = decodeURIComponent(typingMatch[1]);
		if (!isConversationMember(db, conversationId, user.id)) throw makeError(404, "Không tìm thấy cuộc trò chuyện.");
		if (!user.ghostMode) {
			db.prepare(`
				INSERT INTO typing_status(conversation_id, user_id, updated_at) VALUES (?, ?, ?)
				ON CONFLICT(conversation_id, user_id) DO UPDATE SET updated_at = excluded.updated_at
			`).run(conversationId, user.id, Date.now());
			syncDb(db);
		}
		sendJson(response, 200, { ok: true });
		return;
	}

	const readMatch = pathname.match(/^\/api\/conversations\/([^/]+)\/read$/);
	if (method === "POST" && readMatch) {
		const conversationId = decodeURIComponent(readMatch[1]);
		if (!isConversationMember(db, conversationId, user.id)) throw makeError(404, "Không tìm thấy cuộc trò chuyện.");
		if (!user.ghostMode) {
			db.prepare(`
				INSERT INTO message_reads(conversation_id, user_id, last_read_at) VALUES (?, ?, ?)
				ON CONFLICT(conversation_id, user_id) DO UPDATE SET last_read_at = excluded.last_read_at
			`).run(conversationId, user.id, new Date().toISOString());
			syncDb(db);
		}
		sendJson(response, 200, { ok: true });
		return;
	}

	const messagesRoute = pathname.match(/^\/api\/conversations\/([^/]+)\/messages$/);
	if (messagesRoute && ["GET", "POST"].includes(method)) {
		const conversationId = decodeURIComponent(messagesRoute[1]);
		if (!isConversationMember(db, conversationId, user.id)) throw makeError(404, "Không tìm thấy cuộc trò chuyện.");
		if (method === "GET") {
			if (!user.ghostMode) {
				db.prepare(`
					INSERT INTO message_reads(conversation_id, user_id, last_read_at) VALUES (?, ?, ?)
					ON CONFLICT(conversation_id, user_id) DO UPDATE SET last_read_at = excluded.last_read_at
				`).run(conversationId, user.id, new Date().toISOString());
			}
			const rows = db.prepare(`
				SELECT messages.id, messages.content, messages.sticker_url, messages.created_at, users.id AS sender_id, users.name, users.avatar
				FROM messages JOIN users ON users.id = messages.sender_id
				WHERE messages.conversation_id = ? ORDER BY messages.created_at LIMIT 500
			`).all(conversationId);
			const typingUsers = db.prepare(`
				SELECT u.id, u.name FROM typing_status t JOIN users u ON u.id = t.user_id
				WHERE t.conversation_id = ? AND t.user_id != ? AND t.updated_at > ? AND u.ghost_mode = 0
			`).all(conversationId, user.id, Date.now() - 5000);
			const readReceipts = db.prepare(`
				SELECT r.user_id AS userId, u.name, r.last_read_at AS lastReadAt
				FROM message_reads r JOIN users u ON u.id = r.user_id
				WHERE r.conversation_id = ? AND r.user_id != ? AND u.ghost_mode = 0
			`).all(conversationId, user.id);

			sendJson(response, 200, {
				messages: rows.map(r => ({
					id: r.id,
					text: r.content,
					stickerUrl: r.sticker_url || "",
					fromId: r.sender_id,
					name: r.name,
					avatar: r.avatar,
					createdAt: r.created_at
				})),
				typingUsers,
				readReceipts
			});
			return;
		}
		const body = await readJson(request);
		const content = String(body.content || "").trim();
		const stickerUrl = body.stickerUrl ? validateProfileImage(body.stickerUrl, false) : "";
		if (!content && !stickerUrl) throw makeError(400, "Tin nhắn không được để trống.");
		if (content.length > 1000) throw makeError(400, "Tin nhắn quá dài.");
		const id = randomBytes(16).toString("hex");
		const createdAt = new Date().toISOString();
		db.prepare("INSERT INTO messages(id, conversation_id, sender_id, content, sticker_url, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(id, conversationId, user.id, content, stickerUrl, createdAt);
		db.prepare("DELETE FROM typing_status WHERE conversation_id = ? AND user_id = ?").run(conversationId, user.id);
		syncDb(db);
		sendJson(response, 201, { message: { id, text: content, stickerUrl, fromId: user.id, name: user.name, avatar: user.avatar, createdAt } });
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
		console.log(`SQLite database: ${process.env.DATABASE_PATH || path.join(ROOT, "data", "dieunw-turso.sqlite")}`);
	});
	for (const signal of ["SIGINT", "SIGTERM"]) {
		process.on(signal, () => server.close(() => {
			server.database.close();
			process.exit(0);
		}));
	}
}

export { createServer, hashPassword, verifyPassword };