import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "../server.js";

const servers = [];

after(async () => {
	await Promise.all(servers.map(({ server }) => new Promise(resolve => server.close(resolve))));
	servers.forEach(({ server }) => server.database.close());
});

async function createHarness() {
	const server = createServer({
		dbPath: ":memory:",
		env: { ...process.env, NODE_ENV: "test", EMAILJS_ENABLED: "0" }
	});
	await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
	servers.push({ server });
	const address = server.address();
	return { baseUrl: `http://127.0.0.1:${address.port}` };
}

async function request(baseUrl, path, { cookie, method = "GET", body } = {}) {
	const headers = {};
	if (cookie) headers.Cookie = cookie;
	if (body !== undefined) headers["Content-Type"] = "application/json";
	const response = await fetch(`${baseUrl}${path}`, {
		method,
		headers,
		body: body === undefined ? undefined : JSON.stringify(body)
	});
	const data = await response.json();
	return { response, data, cookie: response.headers.get("set-cookie")?.split(";")[0] };
}

async function register(baseUrl, name, email) {
	const start = await request(baseUrl, "/api/auth/register/start", {
		method: "POST",
		body: { name, email, password: "secure-password-123" }
	});
	assert.equal(start.response.status, 200);
	const verify = await request(baseUrl, "/api/auth/register/verify", {
		method: "POST",
		body: { email, code: start.data.devCode }
	});
	assert.equal(verify.response.status, 201);
	return { user: verify.data.user, cookie: verify.cookie };
}

test("registration issues session and private posts are owner-only", async () => {
	const { baseUrl } = await createHarness();
	const unauthorized = await request(baseUrl, "/api/posts");
	assert.equal(unauthorized.response.status, 401);

	const owner = await register(baseUrl, "Owner", "owner@nqd.edu.vn");
	const other = await register(baseUrl, "Other", "other@nqd.edu.vn");
	const created = await request(baseUrl, "/api/posts", {
		cookie: owner.cookie,
		method: "POST",
		body: { content: "private note", visibility: "private" }
	});
	assert.equal(created.response.status, 201);
	assert.equal(created.data.post.name, "Owner");
	assert.equal(created.data.post.userId, owner.user.id);

	const ownerPosts = await request(baseUrl, "/api/posts", { cookie: owner.cookie });
	const otherPosts = await request(baseUrl, "/api/posts", { cookie: other.cookie });
	assert.equal(ownerPosts.data.posts.length, 1);
	assert.equal(otherPosts.data.posts.length, 0);
	const forbiddenPostDelete = await request(baseUrl, `/api/posts/${created.data.post.id}`, { cookie: other.cookie, method: "DELETE" });
	assert.equal(forbiddenPostDelete.response.status, 403);
	const deletedPost = await request(baseUrl, `/api/posts/${created.data.post.id}`, { cookie: owner.cookie, method: "DELETE" });
	assert.equal(deletedPost.response.status, 200);
	const postsAfterDelete = await request(baseUrl, "/api/posts", { cookie: owner.cookie });
	assert.equal(postsAfterDelete.data.posts.length, 0);

	const login = await request(baseUrl, "/api/auth/login", {
		method: "POST",
		body: { email: "owner@nqd.edu.vn", password: "secure-password-123" }
	});
	assert.equal(login.response.status, 200);
	assert.ok(login.cookie);
});

test("friendship creates direct chat and group messages are member-only", async () => {
	const { baseUrl } = await createHarness();
	const alice = await register(baseUrl, "Alice", "alice@nqd.edu.vn");
	const bob = await register(baseUrl, "Bob", "bob@nqd.edu.vn");
	const stranger = await register(baseUrl, "Stranger", "stranger@nqd.edu.vn");

	const invite = await request(baseUrl, "/api/friend-requests", {
		cookie: alice.cookie,
		method: "POST",
		body: { userId: bob.user.id }
	});
	assert.equal(invite.response.status, 201);
	const accept = await request(baseUrl, `/api/friend-requests/${alice.user.id}/accept`, { cookie: bob.cookie, method: "POST", body: {} });
	assert.equal(accept.response.status, 200);

	const directList = await request(baseUrl, "/api/conversations", { cookie: alice.cookie });
	const direct = directList.data.conversations.find(conversation => conversation.type === "direct");
	assert.ok(direct);

	const group = await request(baseUrl, "/api/conversations", {
		cookie: alice.cookie,
		method: "POST",
		body: { name: "Study group", memberIds: [bob.user.id] }
	});
	assert.equal(group.response.status, 201);
	const groupId = group.data.conversation.id;
	const sent = await request(baseUrl, `/api/conversations/${groupId}/messages`, {
		cookie: alice.cookie,
		method: "POST",
		body: { content: "Hello group" }
	});
	assert.equal(sent.response.status, 201);

	const bobMessages = await request(baseUrl, `/api/conversations/${groupId}/messages`, { cookie: bob.cookie });
	assert.equal(bobMessages.data.messages[0].text, "Hello group");
	const strangerMessages = await request(baseUrl, `/api/conversations/${groupId}/messages`, { cookie: stranger.cookie });
	assert.equal(strangerMessages.response.status, 404);
	const forbiddenGroupDelete = await request(baseUrl, `/api/conversations/${groupId}`, { cookie: bob.cookie, method: "DELETE" });
	assert.equal(forbiddenGroupDelete.response.status, 403);
	const deletedGroup = await request(baseUrl, `/api/conversations/${groupId}`, { cookie: alice.cookie, method: "DELETE" });
	assert.equal(deletedGroup.response.status, 200);
	const deletedGroupMessages = await request(baseUrl, `/api/conversations/${groupId}/messages`, { cookie: bob.cookie });
	assert.equal(deletedGroupMessages.response.status, 404);

	const unfriend = await request(baseUrl, `/api/friends/${bob.user.id}`, { cookie: alice.cookie, method: "DELETE" });
	assert.equal(unfriend.response.status, 200);
	const friendsAfterUnfriend = await request(baseUrl, "/api/friends", { cookie: alice.cookie });
	assert.equal(friendsAfterUnfriend.data.friends.length, 0);
	const directAfterUnfriend = await request(baseUrl, "/api/conversations", { cookie: alice.cookie });
	assert.ok(directAfterUnfriend.data.conversations.some(conversation => conversation.type === "direct"));
	const refriend = await request(baseUrl, "/api/friend-requests", { cookie: alice.cookie, method: "POST", body: { userId: bob.user.id } });
	assert.equal(refriend.response.status, 201);
});

test("seeded admin reviews clubs and approved managers publish announcements", async () => {
	const { baseUrl } = await createHarness();
	const admin = await register(baseUrl, "Admin", "k18th.hao2802@nqd.edu.vn");
	const manager = await register(baseUrl, "Club manager", "manager@nqd.edu.vn");
	const member = await register(baseUrl, "Member", "member@nqd.edu.vn");
	const outsider = await register(baseUrl, "Outsider", "outsider@nqd.edu.vn");
	assert.equal(admin.user.isAdmin, true);
	assert.equal(manager.user.isAdmin, false);

	const forbiddenAdmins = await request(baseUrl, "/api/admins", { cookie: manager.cookie });
	assert.equal(forbiddenAdmins.response.status, 403);
	const promoted = await request(baseUrl, "/api/admins", {
		cookie: admin.cookie,
		method: "POST",
		body: { email: "member@nqd.edu.vn" }
	});
	assert.equal(promoted.response.status, 200);
	const promotedMe = await request(baseUrl, "/api/auth/me", { cookie: member.cookie });
	assert.equal(promotedMe.data.user.isAdmin, true);
	const futureAdmin = await request(baseUrl, "/api/admins", {
		cookie: admin.cookie,
		method: "POST",
		body: { email: "future-admin@nqd.edu.vn" }
	});
	assert.equal(futureAdmin.data.accountExists, false);
	const futureAdminAccount = await register(baseUrl, "Future admin", "future-admin@nqd.edu.vn");
	assert.equal(futureAdminAccount.user.isAdmin, true);

	const created = await request(baseUrl, "/api/clubs", {
		cookie: manager.cookie,
		method: "POST",
		body: { name: "CLB Sách", managerEmail: "manager@nqd.edu.vn", logo: "", tagColor: "#15803d" }
	});
	assert.equal(created.response.status, 201);
	const clubId = created.data.club.id;
	const pending = await request(baseUrl, "/api/clubs", { cookie: admin.cookie });
	assert.equal(pending.data.clubs.find(club => club.id === clubId).status, "pending");
	const forbiddenDecision = await request(baseUrl, `/api/clubs/${clubId}/decision`, {
		cookie: manager.cookie,
		method: "POST",
		body: { status: "approved" }
	});
	assert.equal(forbiddenDecision.response.status, 403);
	const decision = await request(baseUrl, `/api/clubs/${clubId}/decision`, {
		cookie: admin.cookie,
		method: "POST",
		body: { status: "approved" }
	});
	assert.equal(decision.response.status, 200);

	const managerMe = await request(baseUrl, "/api/auth/me", { cookie: manager.cookie });
	assert.equal(managerMe.data.user.profileTitles[0].name, "CLB Sách");
	const managerLogin = await request(baseUrl, "/api/auth/login", {
		method: "POST",
		body: { email: "manager@nqd.edu.vn", password: "secure-password-123" }
	});
	assert.equal(managerLogin.data.user.profileTitles[0].name, "CLB Sách");
	const unauthorizedPost = await request(baseUrl, `/api/clubs/${clubId}/posts`, {
		cookie: outsider.cookie,
		method: "POST",
		body: { content: "Not allowed" }
	});
	assert.equal(unauthorizedPost.response.status, 403);
	const published = await request(baseUrl, `/api/clubs/${clubId}/posts`, {
		cookie: manager.cookie,
		method: "POST",
		body: { content: "Thông báo đầu tiên" }
	});
	assert.equal(published.response.status, 201);
	const announcements = await request(baseUrl, "/api/announcements");
	assert.equal(announcements.data.posts[0].clubName, "CLB Sách");
	assert.equal(announcements.data.posts[0].content, "Thông báo đầu tiên");
	assert.equal("email" in announcements.data.posts[0].author, false);
});

test("profile achievements, interests, and album photos are private to each account", async () => {
	const { baseUrl } = await createHarness();
	const owner = await register(baseUrl, "Profile owner", "profile-owner@nqd.edu.vn");
	const other = await register(baseUrl, "Other member", "profile-other@nqd.edu.vn");
	const unauthorized = await request(baseUrl, "/api/profile/sections");
	assert.equal(unauthorized.response.status, 401);

	const achievement = await request(baseUrl, "/api/profile/achievements", {
		cookie: owner.cookie,
		method: "POST",
		body: { title: "Giải Nhất học sinh giỏi", certificateImage: "data:image/png;base64,YQ==" }
	});
	assert.equal(achievement.response.status, 201);
	const invalidImage = await request(baseUrl, "/api/profile/photos", {
		cookie: owner.cookie,
		method: "POST",
		body: { image: "javascript:alert(1)", caption: "Invalid" }
	});
	assert.equal(invalidImage.response.status, 400);

	const interest = await request(baseUrl, "/api/profile/interests", {
		cookie: owner.cookie,
		method: "POST",
		body: { name: "Nhiếp ảnh" }
	});
	assert.equal(interest.response.status, 201);
	const duplicateInterest = await request(baseUrl, "/api/profile/interests", {
		cookie: owner.cookie,
		method: "POST",
		body: { name: "nhiếp ảnh" }
	});
	assert.equal(duplicateInterest.response.status, 409);
	const photo = await request(baseUrl, "/api/profile/photos", {
		cookie: owner.cookie,
		method: "POST",
		body: { image: "data:image/png;base64,YQ==", caption: "Ngày hội trường" }
	});
	assert.equal(photo.response.status, 201);

	const ownSections = await request(baseUrl, "/api/profile/sections", { cookie: owner.cookie });
	assert.equal(ownSections.data.achievements[0].title, "Giải Nhất học sinh giỏi");
	assert.equal(ownSections.data.interests[0].name, "Nhiếp ảnh");
	assert.equal(ownSections.data.photos[0].caption, "Ngày hội trường");
	const otherSections = await request(baseUrl, "/api/profile/sections", { cookie: other.cookie });
	assert.equal(otherSections.data.achievements.length, 0);
	const forbiddenDelete = await request(baseUrl, `/api/profile/achievements/${achievement.data.achievement.id}`, { cookie: other.cookie, method: "DELETE" });
	assert.equal(forbiddenDelete.response.status, 404);

	const deleteAchievement = await request(baseUrl, `/api/profile/achievements/${achievement.data.achievement.id}`, { cookie: owner.cookie, method: "DELETE" });
	const deleteInterest = await request(baseUrl, `/api/profile/interests/${interest.data.interest.id}`, { cookie: owner.cookie, method: "DELETE" });
	const deletePhoto = await request(baseUrl, `/api/profile/photos/${photo.data.photo.id}`, { cookie: owner.cookie, method: "DELETE" });
	assert.equal(deleteAchievement.response.status, 200);
	assert.equal(deleteInterest.response.status, 200);
	assert.equal(deletePhoto.response.status, 200);
});