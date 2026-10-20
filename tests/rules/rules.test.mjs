// Tests the proposed Realtime Database rules on the official Firebase emulator (no real database involved).
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { ref, set, get, remove, serverTimestamp } from "firebase/database";
const env = await initializeTestEnvironment({ projectId: "demo-lamma", database: { rules: readFileSync("firebase/database.rules.json", "utf8"), host: "127.0.0.1", port: 9000 } });
const out = []; let fails = 0;
async function t(name, p){ try { await p; out.push("OK   " + name); } catch(e){ fails++; out.push("FAIL " + name + " :: " + (e.message || e)); } }
const A = env.authenticatedContext("hostA").database(), B = env.authenticatedContext("visitorB").database(), N = env.unauthenticatedContext().database();
const P = (u, s) => ({ j: JSON.stringify(s || { r: "p" }), t: serverTimestamp(), ...(u ? { u } : {}) });
// rooms: presence
await t("signed-in device writes its own presence", assertSucceeds(set(ref(A, "rooms/lm3-1000/peerA"), P("hostA", { r: "h" }))));
await t("another visitor cannot overwrite it (no host impersonation)", assertFails(set(ref(B, "rooms/lm3-1000/peerA"), P("visitorB", { r: "h" }))));
await t("another visitor cannot delete it", assertFails(remove(ref(B, "rooms/lm3-1000/peerA"))));
await t("a visitor cannot write a presence claiming someone else's id", assertFails(set(ref(B, "rooms/lm3-1000/peerZ"), P("hostA"))));
await t("not signed in: cannot claim an id", assertFails(set(ref(N, "rooms/lm3-1000/peerY"), P("hostA"))));
await t("presence must have the expected shape", assertFails(set(ref(B, "rooms/lm3-1000/peerB"), "just a string")));
await t("presence size is limited", assertFails(set(ref(B, "rooms/lm3-1000/peerB"), { j: "x".repeat(13000), t: serverTimestamp(), u: "visitorB" })));
await t("nobody can delete a whole room", assertFails(remove(ref(B, "rooms/lm3-1000"))));
await t("nobody can list all rooms", assertFails(get(ref(N, "rooms"))));
await t("a room can be read with its code (players need it)", assertSucceeds(get(ref(N, "rooms/lm3-1000"))));
await t("the owner removes its own presence when leaving", assertSucceeds(remove(ref(A, "rooms/lm3-1000/peerA"))));
// the live site (v2.1) without sign-in keeps working exactly as today
await t("current site: presence without sign-in still works", assertSucceeds(set(ref(N, "rooms/lm2-2000/peerOld"), P(null, { r: "h", v: 2 }))));
await t("current site: it can update and remove its presence", assertSucceeds(remove(ref(N, "rooms/lm2-2000/peerOld"))));
// host lock + saved game
await t("host locks its room", assertSucceeds(set(ref(A, "hosts/lm3-1000"), { u: "hostA", g: "wheel", t: serverTimestamp() })));
await t("another device cannot take a locked room", assertFails(set(ref(B, "hosts/lm3-1000"), { u: "visitorB", g: "wheel", t: serverTimestamp() })));
await t("the lock cannot be faked into the future", assertFails(set(ref(A, "hosts/lm3-1000"), { u: "hostA", g: "wheel", t: Date.now() + 864e5 })));
await t("host saves the match", assertSucceeds(set(ref(A, "games/lm3-1000"), { g: "wheel", v: 3, s: "{}", at: serverTimestamp() })));
await t("host saves the hidden answers", assertSucceeds(set(ref(A, "gpriv/lm3-1000"), { pv: "{}", at: serverTimestamp() })));
await t("another device cannot change the saved match (no score tampering)", assertFails(set(ref(B, "games/lm3-1000"), { g: "wheel", v: 3, s: "{\"sc\":[9999,0]}" })));
await t("another device cannot read the hidden answers", assertFails(get(ref(B, "gpriv/lm3-1000"))));
await t("not signed in: cannot read the saved match", assertFails(get(ref(N, "games/lm3-1000"))));
await t("the host device reads its saved match back (resume)", assertSucceeds(get(ref(A, "games/lm3-1000"))));
await t("another device cannot delete the saved match", assertFails(remove(ref(B, "games/lm3-1000"))));
await env.withSecurityRulesDisabled(async c => { await set(ref(c.database(), "hosts/lm3-3000"), { u: "hostA", g: "wheel", t: Date.now() - 4 * 3600e3 }); });
await t("after 3 hours without the host, the room can be taken by another device", assertSucceeds(set(ref(B, "hosts/lm3-3000"), { u: "visitorB", g: "wheel", t: serverTimestamp() })));
await t("the host ends the match: removes its copies", assertSucceeds(remove(ref(A, "games/lm3-1000"))));
// spot the difference (paths the current site uses)
await t("spot: a device records a seen picture", assertSucceeds(set(ref(N, "spotseen/dev123/p0001"), Date.now())));
await t("spot: the room reads a device's history", assertSucceeds(get(ref(N, "spotseen/dev123"))));
await t("spot: nobody lists all devices", assertFails(get(ref(N, "spotseen"))));
await t("spot: a report is recorded", assertSucceeds(set(ref(N, "spotreports/p0001/dev123"), Date.now())));
// everything else stays closed
await t("other paths stay closed (write)", assertFails(set(ref(B, "probe/x"), 1)));
await t("the whole database cannot be read", assertFails(get(ref(N, "/"))));
await env.cleanup();
out.push(`${out.length - fails}/${out.length} passed`);
mkdirSync("reports/rules-test", { recursive: true }); writeFileSync("reports/rules-test/result.txt", out.join("\n") + "\n");
console.log(out.join("\n")); process.exit(fails ? 1 : 0);
