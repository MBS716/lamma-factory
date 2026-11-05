// PROPOSAL ONLY (not published): a seat's time t must be the database server's own time on every write.
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
const A = db("hostA"), B = db("phoneB"), C = db("phoneC");
const admin = async f => { let r; await env.withSecurityRulesDisabled(async c => { r = await f(c.database()); }); return r; };
const TS = serverTimestamp;
const seat = (u, pres, extra) => ({ j: JSON.stringify(pres || { r: "p", n: "لاعب" }), t: TS(), u, c: TS(), ...(extra || {}) });
const R = "rooms/lm3-3000";
out.push("-- rules file: " + RULES);
out.push("-- what the site does today keeps working");
await t("host lock", assertSucceeds(set(ref(A, "hosts/lm3-3000"), { u: "hostA", g: "diff", t: TS() })));
await t("host seat with the server time", assertSucceeds(set(ref(A, `${R}/hostseat000001`), seat("hostA", { r: "h", s: {} }, { h: true }))));
await t("host updates its seat with the server time", assertSucceeds(update(ref(A, `${R}/hostseat000001`), { j: JSON.stringify({ r: "h", s: { x: 1 } }), t: TS(), u: "hostA", h: true })));
await t("a phone joins with the server time", assertSucceeds(set(ref(B, `${R}/seatphoneB01`), seat("phoneB"))));
await t("a phone updates its seat with the server time (a tap)", assertSucceeds(update(ref(B, `${R}/seatphoneB01`), { j: JSON.stringify({ r: "p", n: "لاعب", df: { e: "sealed" } }), t: TS(), u: "phoneB" })));
await t("the host writes a mailbox seat (spot game)", assertSucceeds(set(ref(A, `${R}/mbox_n_abc123`), seat("hostA", { r: "m", rd: 1, k: "n_abc123", e: "sealed" }, { h: true }))));
await t("the host updates the mailbox", assertSucceeds(update(ref(A, `${R}/mbox_n_abc123`), { j: JSON.stringify({ r: "m", rd: 1, e: "sealed2" }), t: TS(), u: "hostA", h: true })));
await t("the host removes the mailbox", assertSucceeds(remove(ref(A, `${R}/mbox_n_abc123`))));
await t("a phone leaves (removes its own seat)", assertSucceeds(set(ref(C, `${R}/seatphoneC09`), seat("phoneC")).then(() => remove(ref(C, `${R}/seatphoneC09`)))));
out.push("-- what the change forbids");
await t("a phone cannot write its own clock as t (now)", assertFails(update(ref(B, `${R}/seatphoneB01`), { j: "{}", t: Date.now(), u: "phoneB" })));
await t("a phone cannot write an earlier t (to look first)", assertFails(update(ref(B, `${R}/seatphoneB01`), { j: "{}", t: Date.now() - 5000, u: "phoneB" })));
await t("a phone cannot write a later t (to look fresh)", assertFails(update(ref(B, `${R}/seatphoneB01`), { j: "{}", t: Date.now() + 864e5, u: "phoneB" })));
await t("a phone cannot change its seat without renewing t (keeping an old time)", assertFails(update(ref(B, `${R}/seatphoneB01`), { j: JSON.stringify({ r: "p", n: "لاعب", df: { e: "new" } }) })));
await t("a new seat with a chosen t is refused", assertFails(set(ref(C, `${R}/seatphoneC01`), { ...seat("phoneC"), t: 1 })));
out.push("-- closing the browser (the seat stays with away:1, as session restore needs)");
const before = await admin(d => get(ref(d, `${R}/seatphoneB01/t`)).then(x => x.val()));
await t("a disconnect update with the server time can be registered", assertSucceeds(onDisconnect(ref(B, `${R}/seatphoneB01`)).update({ j: JSON.stringify({ r: "p", n: "لاعب", away: 1 }), t: TS(), u: "phoneB" })));
await new Promise(r => setTimeout(r, 300)); goOffline(B); await new Promise(r => setTimeout(r, 1500));
const after = await admin(d => get(ref(d, `${R}/seatphoneB01`)).then(x => x.val()));
await t("after the disconnect the seat is kept, marked away, with the server's time", Promise.resolve().then(() => {
  if (!after || !/"away":1/.test(after.j) || !(after.t > before)) throw new Error(JSON.stringify(after)); }));
const ts = after && after.t, now = Date.now();
await t("the seat's t is the server's time (within 5 s of this machine's clock)", Promise.resolve().then(() => { if (Math.abs(now - ts) > 5000) throw new Error(`${ts} vs ${now}`); }));
await env.cleanup();
out.push(`${out.filter(x => x.startsWith("OK")).length}/${out.filter(x => /^(OK|FAIL)/.test(x)).length} passed`);
const RD = process.env.REPORT_DIR || "reports/rules-proposal-servertime"; mkdirSync(RD, { recursive: true }); writeFileSync(RD + "/servertime.txt", out.join("\n") + "\n");
console.log(out.join("\n")); process.exit(fails ? 1 : 0);
