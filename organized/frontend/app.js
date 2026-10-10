/* ByteSentry app pages. Server address comes from url.js (unchanged). */
import { url } from "./url.js";

const $ = (id) => document.getElementById(id);
const naira = (n) => "₦" + Number(n || 0).toLocaleString("en-NG");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const PHONE = /^0[789][01]\d{8}$/;
const page = document.body.dataset.page;

const ICON = {
  home: '<path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z"/>',
  data: '<path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01"/>',
  airtime: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>',
  pack: '<path d="M12 3l9 4.5-9 4.5-9-4.5zM3 12l9 4.5 9-4.5M3 16.5l9 4.5 9-4.5"/>',
  history: '<path d="M4 12a8 8 0 1 0 3-6.2M4 4v4h4M12 8v4l3 2"/>',
  payments: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
};
const svg = (n) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[n]}</svg>`;
const KIND_ICON = { data: "data", airtime: "airtime", subscription: "pack", topup: "pack" };

const NAV = [
  { p: "dashboard", href: "dashboard.html", label: "Home", i: "home" },
  { p: "data", href: "data.html", label: "Data", i: "data" },
  { p: "airtime", href: "airtime.html", label: "Airtime", i: "airtime" },
  { p: "subscription", href: "subscription.html", label: "Packs", i: "pack" },
  { p: "history", href: "history.html", label: "History", i: "history" },
  { p: "payments", href: "payments.html", label: "Payments", i: "payments" },
];
const TITLES = { dashboard: "Overview", data: "Buy Data", airtime: "Buy Airtime", subscription: "ByteSentry Packs", fund: "Add Money", history: "History", payments: "Payments" };
const NETS = [["MTN", "mtn.jpg", "MTN"], ["AIRTEL", "airtel.jpg", "Airtel"], ["GLO", "glo.jpg", "Glo"], ["9MOBILE", "9mobile.jpg", "9mobile"]];

let user = { name: "", balance: 0 };

/* ---------- helpers ---------- */
async function api(path, opts = {}) {
  try {
    const r = await fetch(url + path, {
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    let data = {};
    try { data = await r.json(); } catch { /* empty body */ }
    return { ok: r.ok, status: r.status, data };
  } catch {
    return { ok: false, status: 0, data: { detail: "Can't reach the server. Check your connection." } };
  }
}

let toastTimer;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 3400);
}

function setBalance(n) {
  user.balance = n;
  if ($("chip")) $("chip").textContent = naira(n);
  if ($("bal")) paintBalance();
}

function showErr(msg, fundLink) {
  const e = $("err");
  if (!e) return toast(msg);
  e.innerHTML = esc(msg) + (fundLink ? ' <a href="fund.html">Add money</a>' : "");
  e.hidden = false;
}
const clearErr = () => { if ($("err")) $("err").hidden = true; };

function busy(btn, on, label) {
  btn.disabled = on;
  btn.textContent = on ? "Please wait…" : label;
}

function digits(input, max) {
  input.addEventListener("input", () => { input.value = input.value.replace(/\D/g, "").slice(0, max); });
}

function nets(container, initial, onChange) {
  let cur = initial;
  container.className = "nets";
  container.setAttribute("role", "radiogroup");
  container.setAttribute("aria-label", "Network");
  const draw = () => {
    container.innerHTML = NETS.map(([id, img, label]) => `
      <button type="button" role="radio" class="net" data-net="${id}" aria-checked="${id === cur}">
        <span class="logo" data-i="${label[0]}"><img src="${img}" alt="" onerror="this.parentNode.classList.add('nologo');this.remove()"></span>
        <span>${label}</span>
      </button>`).join("");
  };
  draw();
  container.addEventListener("click", (e) => {
    const b = e.target.closest(".net");
    if (!b) return;
    cur = b.dataset.net;
    container.querySelectorAll(".net").forEach((x) => x.setAttribute("aria-checked", x === b));
    onChange(cur);
  });
  return { get: () => cur, set: (n) => { cur = n; draw(); onChange(n); } };
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + "Z");
  return d.toLocaleString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function txRow(t) {
  return `<div class="tx">
    <span class="ic">${svg(KIND_ICON[t.kind] || "data")}</span>
    <span><b>${esc(t.title)}</b><small>${esc(t.phone)} · ${esc(fmtDate(t.date))}</small></span>
    <span class="amt">${naira(t.amount)}<small class="s-${esc(t.status)}">${esc(t.status)}</small></span>
    <button class="tx-delete" type="button" data-tx-id="${t.id}" aria-label="Delete ${esc(t.title)} activity" title="Delete activity">×</button>
  </div>`;
}

async function loadTransactions() {
  const r = await api("/transactions");
  if (!r.ok) {
    $("list").innerHTML = `<p class="empty">${esc(r.data.detail || "Couldn't load history.")}</p>`;
    return;
  }
  const rows = r.data.transactions || [];
  $("list").innerHTML = rows.length ? rows.slice(0, page === "dashboard" ? 5 : rows.length).map(txRow).join("")
    : '<p class="empty">No transactions yet.</p>';
}

function bindTransactionDeletion() {
  $("list").addEventListener("click", async (event) => {
    const button = event.target.closest(".tx-delete");
    if (!button) return;
    if (!window.confirm("Remove this activity from your history? This will not change your wallet balance or delivery.")) return;
    button.disabled = true;
    const result = await api(`/transactions/${encodeURIComponent(button.dataset.txId)}`, { method: "DELETE" });
    if (!result.ok) {
      button.disabled = false;
      toast(result.data.detail || "Couldn't delete this activity.");
      return;
    }
    toast(result.data.message || "Activity removed.");
    await loadTransactions();
  });
}

function paymentRow(payment) {
  const canDelete = payment.status !== "pending";
  return `<article class="payment-row">
    <div class="payment-detail">
      <b>${naira(payment.amount)}</b>
      <small>Ref: ${esc(payment.reference)}</small>
      <small>${esc(fmtDate(payment.date))}</small>
    </div>
    <span class="payment-status s-${esc(payment.status)}">${esc(payment.status)}</span>
    <div class="payment-actions">
      ${payment.status === "pending" ? `<button class="payment-verify" type="button" data-payment-verify="${payment.id}">Verify</button>` : ""}
      ${canDelete ? `<button class="tx-delete" type="button" data-payment-delete="${payment.id}" aria-label="Delete payment ${esc(payment.reference)}" title="Delete payment">×</button>` : ""}
    </div>
  </article>`;
}

async function loadPayments() {
  const list = $("payment-list");
  list.innerHTML = '<p class="empty">Loading payments…</p>';
  const result = await api("/payments");
  if (!result.ok) {
    list.innerHTML = `<p class="empty">${esc(result.data.detail || "Couldn't load payments.")}</p>`;
    return;
  }
  const payments = result.data.payments || [];
  list.innerHTML = payments.length
    ? payments.map(paymentRow).join("")
    : '<p class="empty">No payments yet.</p>';
}

function bindPaymentActions() {
  $("payment-list").addEventListener("click", async (event) => {
    const verifyButton = event.target.closest("[data-payment-verify]");
    if (verifyButton) {
      busy(verifyButton, true);
      const result = await api(`/payments/${encodeURIComponent(verifyButton.dataset.paymentVerify)}/verify`, { method: "POST" });
      if (!result.ok) toast(result.data.detail || "Couldn't verify this payment.");
      else {
        toast(result.data.message || "Payment status checked.");
        if (result.data.status === "success") {
          const me = await api("/me");
          if (me.ok) setBalance(me.data.balance);
        }
      }
      await loadPayments();
      return;
    }

    const deleteButton = event.target.closest("[data-payment-delete]");
    if (!deleteButton) return;
    if (!window.confirm("Delete this payment from your payment history? This does not change your wallet balance.")) return;
    deleteButton.disabled = true;
    const result = await api(`/payments/${encodeURIComponent(deleteButton.dataset.paymentDelete)}`, { method: "DELETE" });
    if (!result.ok) {
      deleteButton.disabled = false;
      toast(result.data.detail || "Couldn't delete this payment.");
      return;
    }
    toast(result.data.message || "Payment deleted.");
    await loadPayments();
  });
}

/* After any purchase call: show the result, update the balance. */
function handleResult(r) {
  if (r.ok) {
    toast(r.data.message || "Done.");
    if (r.data.balance != null) setBalance(r.data.balance);
    else api("/me").then((m) => m.ok && setBalance(m.data.balance));
    return true;
  }
  showErr(r.data.detail || "Something went wrong. Try again.", r.status === 402);
  return false;
}

/* ---------- shell (header, tabs, desktop rail) ---------- */
function shell() {
  const links = NAV.map((n) => `<a href="${n.href}" class="${n.p === page ? "on" : ""}">${svg(n.i)}<span>${n.label}</span></a>`).join("");
  const logo = '<img src="Bytesentry.png" width="1254" height="1254" alt="ByteSentry – Your data. Always there.">';
  document.body.insertAdjacentHTML("afterbegin", `
    <aside class="rail"><a class="brand" href="dashboard.html">${logo}</a><nav aria-label="Main">${links}</nav><a class="btn btn-primary" href="fund.html">Add money</a></aside>
    <header class="top">
      ${page === "dashboard" ? `<a class="logo-sm" href="dashboard.html" aria-label="ByteSentry home">${logo}</a>` : `<button class="icon" id="back" aria-label="Go back">${svg("back")}</button>`}
      <h1>${TITLES[page] || ""}</h1><a class="chip" id="chip" href="fund.html" aria-label="Wallet balance">₦–</a><span class="avatar" id="avatar" aria-hidden="true">·</span><button class="logout" id="logout" type="button">Log out</button>
    </header>
    <nav class="tabs" aria-label="Main">${links}</nav>`);
  if ($("back")) $("back").onclick = () => (history.length > 1 ? history.back() : (location.href = "dashboard.html"));
  $("logout").onclick = async () => {
    const button = $("logout");
    button.disabled = true;
    const result = await api("/logout", { method: "POST" });
    if (!result.ok) {
      button.disabled = false;
      toast(result.data.detail || "Couldn't log out. Try again.");
      return;
    }
    location.href = "index.html";
  };
}

/* ---------- pages ---------- */
function paintBalance() {
  const hidden = localStorage.getItem("bs_hide") === "1";
  $("bal").textContent = hidden ? "₦•••••" : naira(user.balance);
}

const PAGES = {
  async dashboard() {
    const h = new Date().getHours();
    const first = (user.name || "").split(" ")[0];
    $("hello").textContent = `${h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"}${first ? ", " + first : ""}`;
    paintBalance();
    $("eye").onclick = () => {
      try { localStorage.setItem("bs_hide", localStorage.getItem("bs_hide") === "1" ? "0" : "1"); } catch { /* private mode */ }
      paintBalance();
    };
    $("quick").innerHTML = [["data.html", "data", "Data"], ["airtime.html", "airtime", "Airtime"], ["subscription.html", "pack", "Packs"], ["fund.html", "plus", "Add money"]]
      .map(([h2, i, l]) => `<a class="q" href="${h2}"><span>${svg(i)}</span>${l}</a>`).join("");
    bindTransactionDeletion();
    await loadTransactions();
  },

  data() {
    let net = "MTN", plans = [];
    const sel = $("bundle");
    const networkName = { MTN: "MTN", AIRTEL: "Airtel", GLO: "Glo", "9MOBILE": "9mobile" };
    const n = nets($("nets"), net, (v) => {
      net = v;
      $("selected-network").textContent = `Selected network: ${networkName[v]}`;
      fill();
    });
    const price = () => (plans.find((p) => p.plan_id === sel.value) || {}).price || 0;
    function fill() {
      const list = plans.filter((p) => p.network === net);
      sel.innerHTML = `<option value="">${list.length ? "-- Select bundle --" : "No plans available"}</option>` +
        list.map((p) => `<option value="${esc(p.plan_id)}">${esc(p.size)} ${esc(p.type)} · ${esc(p.validity)} (${naira(p.price)})</option>`).join("");
      $("amount").textContent = naira(0);
    }
    sel.onchange = () => { $("amount").textContent = naira(price()); clearErr(); };
    async function load() {            // plans load automatically when the page opens
      sel.innerHTML = "<option>Loading plans…</option>";
      const r = await api("/DataPlans");
      $("planErr").hidden = r.ok;
      if (r.ok) { plans = r.data.plans || []; fill(); } else sel.innerHTML = "<option>Plans unavailable</option>";
    }
    $("retry").onclick = load;
    load();
    digits($("phone"), 11); digits($("pin"), 4);
    $("form").onsubmit = async (e) => {
      e.preventDefault(); clearErr();
      const p = plans.find((x) => x.plan_id === sel.value);
      const phone = $("phone").value, pin = $("pin").value;
      if (!p) return showErr("Choose a data bundle.");
      if (!PHONE.test(phone)) return showErr("Enter a valid 11-digit phone number.");
      if (pin.length !== 4) return showErr("Enter your 4-digit transaction PIN.");
      if (p.price > user.balance) return showErr("Insufficient wallet balance.", true);   // balance first
      const btn = $("buy"); busy(btn, true);
      const r = await api("/BuyData", { method: "POST", body: { network: n.get(), plan_id: p.plan_id, phone, pin, price: p.price } });
      busy(btn, false, "Buy data");
      $("pin").value = "";
      if (handleResult(r)) $("phone").value = "";
      else if (r.status === 409) load();   // plan or price changed: refresh the list
    };
  },

  airtime() {
    const amt = $("amt");
    const networkName = { MTN: "MTN", AIRTEL: "Airtel", GLO: "Glo", "9MOBILE": "9mobile" };
    const n = nets($("nets"), "MTN", (selected) => {
      $("selected-network").textContent = `Selected network: ${networkName[selected]}`;
    });
    digits($("phone"), 11); digits($("pin"), 4); digits(amt, 6);
    const sync = () => {
      $("pay").textContent = naira(Number(amt.value) || 0);
      document.querySelectorAll(".preset").forEach((b) => b.classList.toggle("on", b.dataset.v === amt.value));
    };
    document.querySelectorAll(".preset").forEach((b) => (b.onclick = () => { amt.value = b.dataset.v; sync(); clearErr(); }));
    amt.addEventListener("input", sync);
    $("form").onsubmit = async (e) => {
      e.preventDefault(); clearErr();
      const amount = Number(amt.value), phone = $("phone").value, pin = $("pin").value;
      if (!(amount >= 50 && amount <= 50000)) return showErr("Enter an amount between ₦50 and ₦50,000.");
      if (!PHONE.test(phone)) return showErr("Enter a valid 11-digit phone number.");
      if (pin.length !== 4) return showErr("Enter your 4-digit transaction PIN.");
      if (amount > user.balance) return showErr("Insufficient wallet balance.", true);
      const btn = $("buy"); busy(btn, true);
      const r = await api("/BuyAirtime", { method: "POST", body: { network: n.get(), amount, phone, pin } });
      busy(btn, false, "Buy airtime");
      $("pin").value = "";
      if (handleResult(r)) { amt.value = ""; $("phone").value = ""; sync(); }
    };
  },

  async subscription() {
    let packs = [], subs = [], pick = null;
    const LABEL = { MTN: "MTN", AIRTEL: "Airtel", GLO: "Glo", "9MOBILE": "9mobile" };
    const live = (net) => subs.find((s) => s.network === net && s.live);
    digits($("phone"), 11);
    if (user.phone) $("phone").value = user.phone;

    function guard() {
      const pack = packs.find((p) => p.id === pick);
      const s = pack && live(pack.network);
      $("have").hidden = !s;
      $("buy").disabled = !!s;
      if (s) $("have").textContent = `You already have an active ${LABEL[s.network]} subscription (${s.remaining_gb}GB left).`;
    }

    function drawSubs() {
      const liveSubs = subs.filter((s) => s.live);
      $("subs").hidden = !liveSubs.length;
      $("subList").innerHTML = liveSubs.map((s) => {
        const pct = Math.max(0, Math.min(100, Math.round((s.remaining_gb / s.pack_gb) * 100)));
        const ends = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s.expires_at) ? s.expires_at : s.expires_at + "Z")
          .toLocaleDateString("en-NG", { day: "numeric", month: "short" });
        const img = NETS.find((x) => x[0] === s.network);
        return `<div class="subc">
          <div class="subc-top">
            <b><span class="logo" data-i="${esc(LABEL[s.network][0])}"><img src="${esc(img ? img[1] : "")}" alt="" onerror="this.parentNode.classList.add('nologo');this.remove()"></span>${esc(LABEL[s.network])}</b>
          </div>
          <div class="gbleft"><strong>${s.remaining_gb}GB</strong> left of ${s.pack_gb}GB</div>
          <div class="meter" aria-hidden="true"><i style="width:${pct}%"></i></div>
          <small>${s.pending_gb ? s.pending_gb + "GB being confirmed · " : ""}Ends ${esc(ends)}</small>
          <label class="lab topup-label" for="topup-${esc(s.network)}">Recipient number for next 1GB</label>
          <input class="input topup-phone" id="topup-${esc(s.network)}" type="tel" inputmode="numeric" maxlength="11" value="${esc(s.phone)}" aria-label="Recipient number for ${esc(LABEL[s.network])} top-up">
          <button type="button" class="btn topup" data-net="${esc(s.network)}" ${s.remaining_gb < 1 ? "disabled" : ""}>Confirm top-up · 1GB</button>
        </div>`;
      }).join("");
      $("subList").querySelectorAll(".topup-phone").forEach((input) => digits(input, 11));
    }

    async function load() {
      const r = await api("/subscription/packs");
      if (!r.ok) { $("packs").innerHTML = ""; return showErr(r.data.detail || "Couldn't load packs."); }
      packs = r.data.packs || [];
      subs = r.data.subs || [];
      if (pick == null && packs.length) pick = packs[0].id;
      $("packs").innerHTML = packs.length ? packs.map((p) => `
        <button type="button" class="pack ${p.id === pick ? "on" : ""}" data-id="${p.id}">
          <span class="pack-main">
            <span class="logo pack-logo" data-i="${esc((LABEL[p.network] || p.network)[0])}"><img src="${esc((NETS.find((x) => x[0] === p.network) || [null, ""])[1])}" alt="" onerror="this.parentNode.classList.add('nologo');this.remove()"></span>
            <span class="pack-info"><b>${esc(LABEL[p.network] || p.network)} · ${esc(p.gb)}GB</b><small>${esc(p.validity_days)} days · delivered 1GB at a time</small></span>
          </span>
          <em>${naira(p.price)}</em>
        </button>`).join("") : '<p class="empty">No packs available right now.</p>';
      drawSubs();
      guard();
    }

    $("packs").addEventListener("click", (e) => {
      const b = e.target.closest(".pack");
      if (!b) return;
      pick = Number(b.dataset.id);
      $("packs").querySelectorAll(".pack").forEach((x) => x.classList.toggle("on", x === b));
      guard();
    });

    $("form").onsubmit = async (e) => {
      e.preventDefault(); clearErr();
      const pack = packs.find((p) => p.id === pick), phone = $("phone").value;
      if (!pack) return showErr("Choose a pack.");
      if (!PHONE.test(phone)) return showErr("Enter a valid 11-digit phone number.");
      if (pack.price > user.balance) return showErr("Insufficient wallet balance.", true);
      const btn = $("buy"); busy(btn, true);
      const r = await api("/subscription/subscribe", { method: "POST", body: { phone, plan_id: pack.id } });
      busy(btn, false, "Subscribe");
      if (handleResult(r)) { await load(); window.scrollTo({ top: 0, behavior: "smooth" }); } else guard();
    };

    $("subList").addEventListener("click", async (e) => {
      const b = e.target.closest(".topup");
      if (!b) return;
      clearErr();
      const input = b.closest(".subc").querySelector(".topup-phone");
      const phone = input.value;
      if (!PHONE.test(phone)) {
        input.focus();
        return showErr("Enter a valid 11-digit phone number.");
      }
      b.disabled = true; b.textContent = "Please wait…";
      const r = await api("/subscription/topup", { method: "POST", body: { network: b.dataset.net, phone } });
      if (!handleResult(r)) toast(r.data.detail || "Couldn't top up. Try again.");
      await load();
    });

    load();
  },

  fund() {
    const amt = $("amt"); digits(amt, 6);
    const s = new URLSearchParams(location.search).get("status");
    if (s) {
      const b = $("banner");
      b.hidden = false;
      b.className = s === "failed" ? "err" : "err payment-pending";
      b.textContent = s === "success"
        ? "Payment received. Your wallet has been updated."
        : s === "pending"
          ? "Thanks! Paystack is confirming your payment. Your wallet will update as soon as it’s confirmed."
          : "The payment wasn't completed. You were not charged.";
      if (s === "success") api("/me").then((m) => m.ok && setBalance(m.data.balance));
    }
    const sync = () => document.querySelectorAll(".preset").forEach((b) => b.classList.toggle("on", b.dataset.v === amt.value));
    document.querySelectorAll(".preset").forEach((b) => (b.onclick = () => { amt.value = b.dataset.v; sync(); clearErr(); }));
    amt.addEventListener("input", sync);
    $("form").onsubmit = async (e) => {
      e.preventDefault(); clearErr();
      const amount = Number(amt.value);
      if (!(amount >= 100 && amount <= 500000)) return showErr("Enter an amount between ₦100 and ₦500,000.");
      const btn = $("buy"); busy(btn, true);
      const r = await api("/fund/init", { method: "POST", body: { amount } });
      if (r.ok && r.data.authorization_url) { location.href = r.data.authorization_url; return; }
      busy(btn, false, "Pay securely");
      showErr(r.data.detail || "Couldn't start the payment. Try again.");
    };
  },

  async history() {
    bindTransactionDeletion();
    await loadTransactions();
  },

  payments() {
    bindPaymentActions();
    loadPayments();
  },
};

/* ---------- boot ---------- */
shell();
const me = await api("/me");
if (me.status === 401) location.href = "login.html";
else {
  if (me.ok) user = me.data; else toast(me.data.detail || "Couldn't load your account.");
  setBalance(user.balance || 0);
  $("avatar").textContent = (user.name || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  PAGES[page]?.();
}
