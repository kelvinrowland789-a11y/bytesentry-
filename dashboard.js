/* ===== CONFIG: change API_BASE to your FastAPI URL ===== */
const API_BASE = "http://127.0.0.1:8000";

/* ===== FAKE DATA: your agent replaces these with the real response shape ===== */
const FAKE_USER = { name: "Chidi", balance: 12500, spent: 8400, orders: 17, account: "0123456789" };
const NETWORKS = [
  { id: "MTN", color: "#FFCC00" },
  { id: "AIRTEL", color: "#FF3B3B" },
  { id: "GLO", color: "#2ECC71" },
  { id: "9MOBILE", color: "#1FA37A" },
];
const FAKE_DATA_PLANS = [
  { network: "MTN", plan_id: "mtn_500mb", size: "500MB", validity: "7 days", price: 150 },
  { network: "MTN", plan_id: "mtn_1gb", size: "1GB", validity: "30 days", price: 310 },
  { network: "MTN", plan_id: "mtn_2gb", size: "2GB", validity: "30 days", price: 620 },
  { network: "MTN", plan_id: "mtn_5gb", size: "5GB", validity: "30 days", price: 1550 },
  { network: "AIRTEL", plan_id: "air_1gb", size: "1GB", validity: "30 days", price: 320 },
  { network: "AIRTEL", plan_id: "air_3gb", size: "3GB", validity: "30 days", price: 950 },
  { network: "GLO", plan_id: "glo_1_5gb", size: "1.5GB", validity: "30 days", price: 430 },
  { network: "9MOBILE", plan_id: "9m_1gb", size: "1GB", validity: "30 days", price: 340 },
];
const FAKE_AIRTIME_OFFERS = [
  { network: "MTN", amount: 100, discount_pct: 2 },
  { network: "MTN", amount: 200, discount_pct: 2 },
  { network: "MTN", amount: 500, discount_pct: 2 },
  { network: "MTN", amount: 1000, discount_pct: 2 },
  { network: "AIRTEL", amount: 100, discount_pct: 3 },
  { network: "AIRTEL", amount: 500, discount_pct: 3 },
  { network: "GLO", amount: 200, discount_pct: 4 },
  { network: "9MOBILE", amount: 500, discount_pct: 3 },
];
const FAKE_TXNS = [
  { kind: "data", title: "MTN 1GB", phone: "08012345678", amount: 310, status: "success", date: "Today, 10:42" },
  { kind: "airtime", title: "Airtel airtime", phone: "08098765432", amount: 500, status: "success", date: "Yesterday" },
  { kind: "data", title: "Glo 1.5GB", phone: "08051112222", amount: 430, status: "pending", date: "Mon, 18:05" },
];
const SERVICES = [
  { ic: "⚡", name: "Electricity" }, { ic: "📺", name: "Cable TV" },
  { ic: "🎓", name: "Exam pins" }, { ic: "🌐", name: "Internet" },
];

/* ===== state ===== */
const state = { type: "data", network: "MTN", data: [], airtime: [], pick: null };
const $ = (id) => document.getElementById(id);
const naira = (n) => "₦" + Number(n).toLocaleString("en-NG");

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove("show"), 3200);
}

/* ===== rendering ===== */
function renderUser(u) {
  const h = new Date().getHours();
  $("greet").textContent = `${h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"}, ${u.name}`;
  $("balance").textContent = naira(u.balance) + ".00";
  $("spent").textContent = naira(u.spent);
  $("orders").textContent = u.orders;
}

function renderNetworks() {
  const box = $("nets");
  box.replaceChildren();
  NETWORKS.forEach((n) => {
    const b = el("button", "net" + (n.id === state.network ? " on" : ""));
    b.style.setProperty("--c", n.color);
    b.append(el("i"), el("span", "", n.id === "9MOBILE" ? "9mobile" : n.id[0] + n.id.slice(1).toLowerCase()));
    b.onclick = () => { state.network = n.id; renderNetworks(); renderPlans(); };
    box.append(b);
  });
}

function renderPlans() {
  const box = $("plans");
  box.replaceChildren();
  const isData = state.type === "data";
  const items = (isData ? state.data : state.airtime).filter((p) => p.network === state.network);
  if (!items.length) {
    box.append(el("div", "empty", "No plans for this network right now. Try another one."));
    return;
  }
  items.forEach((p) => {
    const card = el("button", "plan");
    if (isData) {
      card.append(el("span", "size", p.size), el("span", "valid", p.validity), el("span", "price", naira(p.price)));
    } else {
      const pay = p.amount - (p.amount * p.discount_pct) / 100;
      card.append(el("span", "size", naira(p.amount)), el("span", "tag", `${p.discount_pct}% off`), el("span", "price", `Pay ${naira(pay)}`));
    }
    card.onclick = () => openSheet(p);
    box.append(card);
  });
}

function showSkeleton() {
  const box = $("plans");
  box.replaceChildren();
  for (let i = 0; i < 6; i++) box.append(el("div", "skel"));
}

function renderTiles() {
  SERVICES.forEach((s) => {
    const t = el("div", "tile");
    t.append(el("div", "ic", s.ic), el("span", "", s.name), el("small", "muted", "Coming soon"));
    $("tiles").append(t);
  });
}

function renderTxns(list) {
  const box = $("txns");
  box.replaceChildren();
  if (!list.length) {
    box.append(el("div", "empty", "No transactions yet. Your first purchase will show up here."));
    return;
  }
  list.forEach((t) => {
    const row = el("div", "txn");
    const info = el("div", "info");
    info.append(el("b", "", t.title), el("small", "", `${t.phone} · ${t.date}`));
    const amt = el("div", "amt", naira(t.amount));
    amt.append(el("small", t.status === "success" ? "ok" : t.status === "pending" ? "pending" : "fail", t.status));
    row.append(el("div", "dot", t.kind === "data" ? "📶" : "📞"), info, amt);
    box.append(row);
  });
}

/* ===== loading plans when the window loads ===== */
async function getJSON(path) {
  const res = await fetch(API_BASE + path, { credentials: "include" });
  if (!res.ok) throw new Error(res.status);
  return res.json();
}

async function loadPlans() {
  showSkeleton();
  try {
    const [d, a] = await Promise.all([getJSON("/DataPlans"), getJSON("/AirtimePlans")]);
    state.data = d.plans || FAKE_DATA_PLANS;        // agent: map the real response here
    state.airtime = a.offers || FAKE_AIRTIME_OFFERS; // agent: map the real response here
  } catch (e) {
    state.data = FAKE_DATA_PLANS;                    // fallback while backend is offline
    state.airtime = FAKE_AIRTIME_OFFERS;
  }
  renderPlans();
}

/* ===== buy flow ===== */
function openSheet(p) {
  state.pick = p;
  const isData = state.type === "data";
  $("sheetTitle").textContent = isData ? `${p.network} ${p.size}` : `${p.network} ${naira(p.amount)} airtime`;
  $("sheetSub").textContent = isData ? `${p.validity} · ${naira(p.price)}` : `You pay ${naira(p.amount - (p.amount * p.discount_pct) / 100)}`;
  $("sheetBg").classList.add("open");
  $("phone").focus();
}
function closeSheet() {
  $("sheetBg").classList.remove("open");
  $("sheet").reset();
}

async function submitBuy(e) {
  e.preventDefault();
  const phone = $("phone").value.trim(), pin = $("pin").value.trim();
  if (!/^0\d{10}$/.test(phone)) return toast("Enter a valid 11-digit phone number.");
  if (!/^\d{4}$/.test(pin)) return toast("Your PIN is 4 digits.");
  const p = state.pick, isData = state.type === "data";
  const body = isData
    ? { network: p.network, plan_id: p.plan_id, phone, pin }
    : { network: p.network, amount: p.amount, phone, pin };
  const btn = $("pay");
  btn.disabled = true; btn.textContent = "Processing...";
  try {
    const res = await fetch(API_BASE + (isData ? "/BuyData" : "/BuyAirtime"), {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const out = await res.json().catch(() => ({}));
    if (res.ok) { toast(out.message || "Done. Check your phone."); closeSheet(); }
    else if (res.status === 202) { toast("Order pending. We are confirming it."); closeSheet(); }
    else toast(out.detail || "Purchase failed. Try again.");
  } catch (err) {
    toast("Can't reach the server. Check your connection.");
  }
  btn.disabled = false; btn.textContent = "Buy now";
}

/* ===== events ===== */
$("tabs").onclick = (e) => {
  const b = e.target.closest(".tab");
  if (!b) return;
  state.type = b.dataset.type;
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("on", t === b));
  renderPlans();
};
$("sheet").onsubmit = submitBuy;
$("cancel").onclick = closeSheet;
$("sheetBg").onclick = (e) => { if (e.target.id === "sheetBg") closeSheet(); };
$("burger").onclick = () => $("side").classList.toggle("open");
document.querySelectorAll(".nav a").forEach((a) => a.addEventListener("click", () => {
  document.querySelectorAll(".nav a").forEach((x) => x.classList.toggle("on", x === a));
  $("side").classList.remove("open");
}));
$("fundBtn").onclick = () => toast("Funding opens here. Your agent connects the payment gateway.");
$("copyAcct").onclick = () => {
  navigator.clipboard?.writeText(FAKE_USER.account);
  toast("Account number copied.");
};

window.addEventListener("load", () => {
  renderUser(FAKE_USER);          // agent: replace with real user fetch
  renderNetworks();
  renderTiles();
  renderTxns(FAKE_TXNS);          // agent: replace with real history fetch
  loadPlans();
});
