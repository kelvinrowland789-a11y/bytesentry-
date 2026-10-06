/* ByteSentry landing page.
   All plan data lives in DATA. To connect your backend, replace
   loadData() with a fetch() returning the same shape. */
(() => {
  "use strict";

  const DATA = {
    validityDays: 30,
    exampleSaving: 1000, // 10GB: ≈₦4,500 vs ₦3,500
    plans: {
      // `normal` = typical price; set it only where you can stand behind it.
      mtn: [
        { size: "1GB",  price: 400 },
        { size: "3GB",  price: 1100 },
        { size: "5GB",  price: 1800 },
        { size: "10GB", price: 3500, normal: 4500, tag: "Best value" },
      ],
      airtel: [
        { size: "1GB",  price: 400 },
        { size: "3GB",  price: 1100 },
        { size: "5GB",  price: 1800 },
        { size: "10GB", price: 3500, normal: 4500, tag: "Best value" },
      ],
    },
  };
  const loadData = () => Promise.resolve(DATA); // fetch("/api/plans").then(r => r.json())

  const $ = (id) => document.getElementById(id);
  const naira = (n) => "₦" + n.toLocaleString("en-NG");

  loadData().then((data) => {
    const renderPlans = (net) => {
      $("planList").innerHTML = data.plans[net].map((p) => `
        <li>
          <span class="p-size">${p.size}${p.tag ? `<span class="p-tag">${p.tag}</span>` : ""}</span>
          <span class="p-val">${data.validityDays} days · ${net === "mtn" ? "MTN" : "Airtel"}</span>
          <span class="p-price">${p.normal ? `<span class="p-was">≈ ${naira(p.normal)}</span>` : ""}${naira(p.price)}</span>
          <a href="#signup">Buy</a>
        </li>`).join("");
    };
    document.querySelectorAll('input[name="net"]').forEach((r) =>
      r.addEventListener("change", () => renderPlans(r.value)));
    renderPlans("mtn");

    const months = $("months");
    const renderSaving = () => {
      const n = Number(months.value);
      $("monthsOut").textContent = n;
      $("saved").textContent = naira(n * data.exampleSaving);
    };
    months.addEventListener("input", renderSaving);
    renderSaving();
  });

  /* Bars grow once, when they scroll into view */
  const bars = $("bars");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((es) => {
      if (es[0].isIntersecting) { bars.classList.add("in"); io.disconnect(); }
    }, { threshold: 0.35 });
    io.observe(bars);
  } else bars.classList.add("in");

  /* Mobile dock: show after the hero, hide at the sign-up section */
  const dock = $("dock");
  let pastHero = false, atSignup = false;
  const sync = () => dock.classList.toggle("show", pastHero && !atSignup);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((es) => { pastHero = !es[0].isIntersecting; sync(); }).observe($("hero"));
    new IntersectionObserver((es) => { atSignup = es[0].isIntersecting; sync(); }).observe($("signup"));
  }

  /* Auto top-up example switch */
  $("sw").addEventListener("click", () => {
    const on = $("rule").classList.toggle("on");
    $("sw").setAttribute("aria-checked", on);
    $("ruleState").textContent = on ? "On · example" : "Off · example";
  });

  /* Sign-up (replace with a real request) */
  $("joinForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const email = $("email"), msg = $("joinMsg");
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value.trim());
    email.classList.toggle("bad", !ok);
    msg.className = "small " + (ok ? "ok" : "bad");
    msg.textContent = ok
      ? "Thanks. Check your inbox to finish creating your account."
      : "Enter a valid email address, like you@example.com.";
    if (!ok) email.focus();
  });
})();
