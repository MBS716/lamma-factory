// PROPOSAL ONLY (not published), version 2: a separate place taps/<room>/<identity> where a phone's sealed spot-the-difference
// taps are stamped with the database server's own time (t === now). Seats (rooms/) are NOT changed, so closing the
// browser, session restore and the other games keep today's rules exactly.
// Run on the official Firebase emulator with firebase/proposals/servertime/database.rules.json. Nothing touches the real database.
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { ref, set, get, update, remove, serverTimestamp, onDisconnect, goOffline } from "firebase/database";
const RULES = process.env.RULES_FILE || "firebase/proposals/servertime/database.rules.json";
const env = await initializeTestEnvironment({ projectId: "demo-lamma-st", database: { rules: readFileSync(RULES, "utf8"), host: "127.0.0.1", port: 9000 } });
const out = []; let fails = 0;
const limit = p => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error("no answer in 15 s")), 15000))]);
async function t(name, p){ try { await limit(p); out.push("OK   " + name); } catch(e){ fails++; out.push("FAIL " + name + " :: " + (e.message || e)); } }
const db = uid => env.authenticatedContext(uid).database();
const A = db("hostA"), B = db("phoneB"), C = db("phoneC"), N = env.unauthenticatedContext().database();
const admin = async f => { let r; await env.withSecurityRulesDisabled(async c => { r = await f(c.database()); }); return r; };
const TS = serverTimestamp;
const seat = (u, pres, extra) => ({ j: JSON.stringify(pres || { r: "p", n: "لاعب" }), t: TS(), u, c: TS(), ...(extra || {}) });
const R = "rooms/lm3-3000", T = "taps/lm3-3000";
out.push("-- rules file: " + RULES);
out.push("-- seats are unchanged: closing the browser still keeps the seat (session restore)");
await t("host lock and host seat", assertSucceeds(set(ref(A, "hosts/lm3-3000"), { u: "hostA", g: "diff", t: TS() }).then(() => set(ref(A, `${R}/hostseat000001`), seat("hostA", { r: "h", s: {} }, { h: true })))));
await t("a phone joins", assertSucceeds(set(ref(B, `${R}/seatphoneB01`), seat("phoneB"))));
await t("a disconnect update (away:1) can be registered, as today", assertSucceeds(onDisconnect(ref(B, `${R}/seatphoneB01`)).update({ j: JSON.stringify({ r: "p", n: "لاعب", away: 1 }), t: TS(), u: "phoneB" })));
out.push("-- the server-stamped taps");
await t("a phone writes its sealed taps with the server's time", assertSucceeds(set(ref(B, `${T}/phoneB`), { e: "sealed-1", t: TS() })));
await t("…and again (a new tap)", assertSucceeds(set(ref(B, `${T}/phoneB`), { e: "sealed-2", t: TS() })));
await t("the host reads the taps of its room", assertSucceeds(get(ref(A, T))));
await t("another phone can read them too (they are sealed: unreadable without the key)", assertSucceeds(get(ref(C, T))));
await t("not signed in: cannot read", assertFails(get(ref(N, T))));
await t("a phone cannot write its own clock as t", assertFails(set(ref(B, `${T}/phoneB`), { e: "x", t: Date.now() })));
await t("a phone cannot write an earlier t (to look first)", assertFails(set(ref(B, `${T}/phoneB`), { e: "x", t: Date.now() - 5000 })));
await t("a phone cannot change its taps without a new server time (keeping an old time)", assertFails(update(ref(B, `${T}/phoneB`), { e: "sealed-3" })));
await t("a phone cannot write taps without t", assertFails(set(ref(B, `${T}/phoneB`), { e: "x" })));
await t("a phone cannot write in another device's place", assertFails(set(ref(C, `${T}/phoneB`), { e: "fake", t: TS() })));
await t("a phone cannot delete another device's taps", assertFails(remove(ref(C, `${T}/phoneB`))));
await t("unknown fields are refused", assertFails(set(ref(B, `${T}/phoneB`), { e: "x", t: TS(), win: true })));
await t("oversized taps are refused", assertFails(set(ref(B, `${T}/phoneB`), { e: "x".repeat(6001), t: TS() })));
await t("only game rooms (lm3-/lmp3- + 4 digits)", assertFails(set(ref(B, `taps/anything/phoneB`), { e: "x", t: TS() })));
await t("a phone that is not the host cannot clear another device's taps", assertFails(remove(ref(C, `${T}/phoneB`))));
await t("the host clears a device's taps after the round", assertSucceeds(remove(ref(A, `${T}/phoneB`))));
const stamp = await (async () => { await set(ref(C, `${T}/phoneC`), { e: "s", t: TS() }); return admin(d => get(ref(d, `${T}/phoneC/t`)).then(x => x.val())); })();
await t("the stored t is the server's time (within 5 s of this machine's clock)", Promise.resolve().then(() => { if (!(Math.abs(Date.now() - stamp) < 5000)) throw new Error(String(stamp)); }));
out.push("-- closing the browser, after all this");
goOffline(B); await new Promise(r => setTimeout(r, 1500));
const after = await admin(d => get(ref(d, `${R}/seatphoneB01`)).then(x => x.val()));
await t("the phone's seat is kept, marked away (session restore works as today)", Promise.resolve().then(() => { if (!after || !/"away":1/.test(after.j)) throw new Error(JSON.stringify(after)); }));
await env.cleanup();
out.push(`${out.filter(x => x.startsWith("OK")).length}/${out.filter(x => /^(OK|FAIL)/.test(x)).length} passed`);
const RD = process.env.REPORT_DIR || "reports/rules-proposal-servertime"; mkdirSync(RD, { recursive: true }); writeFileSync(RD + "/servertime.txt", out.join("\n") + "\n");
console.log(out.join("\n")); process.exit(fails ? 1 : 0);
