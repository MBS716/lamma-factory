// Final Realtime Database rules of لمّة, tested on the official Firebase emulator (nothing touches the real database).
// Every "device" below is a separate anonymous identity, like a phone or computer after anonymous sign-in.
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { ref, set, get, update, remove, serverTimestamp, onDisconnect, goOffline, goOnline } from "firebase/database";
const env = await initializeTestEnvironment({ projectId: "demo-lamma", database: { rules: readFileSync("firebase/database.rules.json", "utf8"), host: "127.0.0.1", port: 9000 } });
const out = []; let fails = 0;
const limit = p => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error("no answer in 15 s")), 15000))]);
async function t(name, p){ try { await limit(p); out.push("OK   " + name); } catch(e){ fails++; out.push("FAIL " + name + " :: " + (e.message || e)); } }
const db = uid => uid ? env.authenticatedContext(uid).database() : env.unauthenticatedContext().database();
const A = db("hostA"), B = db("phoneB"), C = db("phoneC"), N = db(null);
const admin = async f => { let r; await env.withSecurityRulesDisabled(async c => { r = await f(c.database()); }); return r; };
const TS = serverTimestamp;
const seat = (u, pres, extra) => ({ j: JSON.stringify(pres || { r: "p", n: "لاعب" }), t: TS(), u, c: TS(), ...(extra || {}) });
const R = "rooms/lm3-1000";

out.push("-- the host opens a room");
await t("host takes the room's host lock", assertSucceeds(set(ref(A, "hosts/lm3-1000"), { u: "hostA", g: "wheel", t: TS() })));
await t("host writes its seat marked as the host", assertSucceeds(set(ref(A, `${R}/hostseat000001`), seat("hostA", { r: "h", s: { sc: [0, 0] } }, { h: true }))));
await t("host updates the match state (scores live in the host's own seat)", assertSucceeds(update(ref(A, `${R}/hostseat000001`), { j: JSON.stringify({ r: "h", s: { sc: [200, 0] } }), t: TS() })));
await t("host saves the match copy for resuming", assertSucceeds(set(ref(A, "games/lm3-1000"), { g: "wheel", v: 3, s: "{}", at: TS() })));
await t("host saves the hidden answers", assertSucceeds(set(ref(A, "gpriv/lm3-1000"), { pv: "{}", at: TS() })));

out.push("-- players join");
await t("a phone joins with its own seat", assertSucceeds(set(ref(B, `${R}/seatphoneB01`), seat("phoneB", { r: "p", n: "سارة", tm: "g" }))));
await t("a second phone joins", assertSucceeds(set(ref(C, `${R}/seatphoneC01`), seat("phoneC", { r: "p", n: "خالد", tm: "o" }))));
await t("a phone sends its answer (changes only its own seat)", assertSucceeds(update(ref(B, `${R}/seatphoneB01`), { j: JSON.stringify({ r: "p", n: "سارة", tm: "g", a: { i: 1, c: 2 } }), t: TS() })));
await t("players read the room (they need the host's state)", assertSucceeds(get(ref(B, R))));

out.push("-- scores and the match: host only");
await t("a phone cannot change the host's seat (scores, questions, phase)", assertFails(update(ref(B, `${R}/hostseat000001`), { j: JSON.stringify({ r: "h", s: { sc: [9999, 0] } }), t: TS() })));
await t("a phone cannot replace the host's seat", assertFails(set(ref(B, `${R}/hostseat000001`), seat("phoneB", { r: "h", s: { sc: [9999, 0] } }))));
await t("a phone cannot delete the host's seat (end the game)", assertFails(remove(ref(B, `${R}/hostseat000001`))));
await t("a phone cannot change the saved match", assertFails(set(ref(B, "games/lm3-1000"), { g: "wheel", v: 3, s: "{\"sc\":[9999,0]}", at: TS() })));
await t("a phone cannot delete the saved match", assertFails(remove(ref(B, "games/lm3-1000"))));
await t("a phone cannot read the hidden answers", assertFails(get(ref(B, "gpriv/lm3-1000"))));
await t("a phone cannot read the saved match", assertFails(get(ref(B, "games/lm3-1000"))));

out.push("-- impersonating the host");
await t("a phone cannot mark its own seat as the host's", assertFails(set(ref(B, `${R}/fakehost0001`), seat("phoneB", { r: "h", c: 0, s: {} }, { h: true }))));
await t("a phone cannot add the host mark to its existing seat", assertFails(update(ref(B, `${R}/seatphoneB01`), { h: true })));
await t("a phone cannot take the host lock of an active room", assertFails(set(ref(B, "hosts/lm3-1000"), { u: "phoneB", g: "wheel", t: TS() })));
await t("a phone cannot delete the host lock", assertFails(remove(ref(B, "hosts/lm3-1000"))));
await t("the lock cannot claim a future time (to stay fresh forever)", assertFails(set(ref(A, "hosts/lm3-1000"), { u: "hostA", g: "wheel", t: Date.now() + 864e5 })));
await t("a lock cannot be written for someone else", assertFails(set(ref(B, "hosts/lm3-1111"), { u: "hostA", g: "wheel", t: TS() })));

out.push("-- impersonating a player");
await t("a phone cannot change another player's seat", assertFails(update(ref(C, `${R}/seatphoneB01`), { j: JSON.stringify({ r: "p", n: "سارة", tm: "o" }), t: TS() })));
await t("a phone cannot delete another player's seat", assertFails(remove(ref(C, `${R}/seatphoneB01`))));
await t("a phone cannot write a seat in someone else's name (u)", assertFails(set(ref(C, `${R}/seatfakeB001`), seat("phoneB"))));
await t("a seat's first-join time cannot be backdated (to steal a name)", assertFails(set(ref(C, `${R}/seatearly001`), { ...seat("phoneC", { r: "p", n: "سارة" }), c: Date.now() - 3600e3 })));
await t("a seat's first-join time cannot be changed later", assertFails(update(ref(C, `${R}/seatphoneC01`), { c: 1 })));
await t("not signed in: cannot join", assertFails(set(ref(N, `${R}/seatanon0001`), seat(null))));
await t("not signed in: cannot read a room", assertFails(get(ref(N, R))));

out.push("-- shape and size");
await t("unknown fields are refused", assertFails(set(ref(B, `${R}/seatphoneB02`), seat("phoneB", null, { admin: true }))));
await t("a seat without its fields is refused", assertFails(set(ref(B, `${R}/seatphoneB03`), "just a string")));
await t("oversized seat is refused", assertFails(set(ref(B, `${R}/seatphoneB04`), { ...seat("phoneB"), j: "x".repeat(13000) })));
await t("rooms only under the game's names (lm3-/lmp3- + 4 digits)", assertFails(set(ref(B, "rooms/anything/seatphoneB05"), seat("phoneB"))));
await t("nobody can delete a whole room", assertFails(remove(ref(A, R))));
await t("nobody can list all rooms", assertFails(get(ref(B, "rooms"))));
await t("other paths stay closed", assertFails(set(ref(B, "probe/x"), 1)));
await t("the whole database cannot be read", assertFails(get(ref(B, "/"))));

out.push("-- leaving and coming back (session restore)");
await t("phone registers its 'away' mark for when it disconnects", assertSucceeds(onDisconnect(ref(B, `${R}/seatphoneB01`)).update({ j: JSON.stringify({ r: "p", n: "سارة", tm: "g", away: 1 }), t: TS(), u: "phoneB" })));
goOffline(B); await new Promise(r => setTimeout(r, 1500));
const afterDrop = await admin(d => get(ref(d, `${R}/seatphoneB01`)).then(s => s.val()));
await t("connection lost (WhatsApp, closed browser): the seat stays, marked away, join time kept", Promise.resolve().then(() => { if (!afterDrop || !afterDrop.j.includes('"away":1') || !afterDrop.c) throw new Error(JSON.stringify(afterDrop)); }));
goOnline(B); const B2 = B;      // same device, same anonymous identity, connected again
await t("same device returns: writes the same seat again (same join time)", assertSucceeds(set(ref(B2, `${R}/seatphoneB01`), { ...seat("phoneB", { r: "p", n: "سارة", tm: "g" }), c: afterDrop.c })));
await t("…or simply updates it", assertSucceeds(update(ref(B2, `${R}/seatphoneB01`), { j: JSON.stringify({ r: "p", n: "سارة", tm: "g" }), t: TS() })));
const A2 = db("hostA");
await t("host closes the tab and returns (same device): updates its host seat", assertSucceeds(update(ref(A2, `${R}/hostseat000001`), { j: JSON.stringify({ r: "h", s: { sc: [200, 0] } }), t: TS(), h: true })));
await t("host refreshes its lock", assertSucceeds(set(ref(A2, "hosts/lm3-1000"), { u: "hostA", g: "wheel", t: TS() })));
await t("host reads its saved match back", assertSucceeds(get(ref(A2, "games/lm3-1000"))));
await t("host tidies a stale seat of its room", assertSucceeds(remove(ref(A2, `${R}/seatphoneC01`))));
const X = db("newIdentity");   // the same phone after clearing its site data = a new identity
await t("a device with a new identity cannot take over its old seat", assertFails(update(ref(X, `${R}/seatphoneB01`), { j: "{}", t: TS() })));
await t("…it joins with a new seat instead", assertSucceeds(set(ref(X, `${R}/seatnewX0001`), seat("newIdentity"))));

out.push("-- abandoned rooms (host away more than 3 hours)");
await admin(d => set(ref(d, "hosts/lm3-3000"), { u: "hostA", g: "wheel", t: Date.now() - 4 * 3600e3 }));
await t("another host can take the room after 3 hours", assertSucceeds(set(ref(C, "hosts/lm3-3000"), { u: "phoneC", g: "quiz", t: TS() })));
await t("the old host can no longer mark a host seat there", assertFails(set(ref(A, "rooms/lm3-3000/hostseat000009"), seat("hostA", { r: "h" }, { h: true }))));
await t("the old host cannot read the new host's saved match", assertFails(get(ref(A, "games/lm3-3000"))));

out.push("-- the host ends the game");
await t("host deletes its saved match", assertSucceeds(remove(ref(A2, "games/lm3-1000"))));
await t("host deletes its hidden answers", assertSucceeds(remove(ref(A2, "gpriv/lm3-1000"))));
await t("host releases the lock", assertSucceeds(remove(ref(A2, "hosts/lm3-1000"))));
await t("host removes its seat", assertSucceeds(remove(ref(A2, `${R}/hostseat000001`))));

out.push("-- spot the difference");
await t("spot: a signed-in device records a seen picture", assertSucceeds(set(ref(B2, "spotseen/dev123abc45/p0001"), Date.now())));
await t("spot: the room reads a device's history", assertSucceeds(get(ref(A2, "spotseen/dev123abc45"))));
await t("spot: nobody lists all devices", assertFails(get(ref(B2, "spotseen"))));
await t("spot: a report is recorded", assertSucceeds(set(ref(B2, "spotreports/p0001/dev123abc45"), Date.now())));
await t("spot: not signed in: refused", assertFails(set(ref(N, "spotseen/dev123abc45/p0002"), Date.now())));

out.push("-- the site version live today (v3.1) after the switch");
await t("a page that is not signed in (old version) can no longer write: the site must be updated first", assertFails(set(ref(N, "rooms/lm3-2000/oldpage00001"), { j: "{}", t: TS() })));

await env.cleanup();
out.push(`${out.filter(x => x.startsWith("OK")).length}/${out.filter(x => /^(OK|FAIL)/.test(x)).length} passed`);
mkdirSync("reports/rules-test", { recursive: true }); writeFileSync("reports/rules-test/result.txt", out.join("\n") + "\n");
console.log(out.join("\n")); process.exit(fails ? 1 : 0);
