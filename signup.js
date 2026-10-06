import { url } from "./url.js";
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const f = {
    name: $("name"), phone: $("phone"), email: $("email"), password: $("password"),
  };
  const pins = [...document.querySelectorAll(".pin input")];
  const pinBox = document.querySelector(".pin");
  const submit = $("submit");

  const api = {
    async signup(data) {
      const response = await fetch(`${url}/signup`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "Could not create account.");
      return result;
    },
  };

  const setErr = (input, id, msg) => {
    $(id).textContent = msg;
    (Array.isArray(input) ? input : [input]).forEach((el) => el.setAttribute("aria-invalid", msg ? "true" : "false"));
    return msg;
  };

  const rules = {
    name: () => {
      const v = f.name.value.trim();
      return setErr(f.name, "nameErr", !v ? "Enter your full name." : v.split(/\s+/).length < 2 ? "Add your first and last name." : "");
    },
    phone: () => {
      const v = f.phone.value;
      return setErr(f.phone, "phoneErr", !v ? "Enter your phone number." : !/^0[789][01]\d{8}$/.test(v) ? "Enter a valid 11-digit Nigerian number, like 08031234567." : "");
    },
    email: () => {
      const v = f.email.value.trim();
      return setErr(f.email, "emailErr", !v ? "Enter your email address." : !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? "That email doesn't look right. Check it and try again." : "");
    },
    password: () => {
      const v = f.password.value;
      return setErr(f.password, "pwErr", !v ? "Create a password." : v.length < 8 ? "Use at least 8 characters." : !(/[a-z]/i.test(v) && /\d/.test(v)) ? "Include both letters and numbers." : "");
    },
    pin: () => {
      const v = pins.map((p) => p.value).join("");
      const weak = /^(\d)\1{3}$/.test(v) || v === "1234" || v === "4321";
      return setErr(pins, "pinErr", v.length < 4 ? "Enter a 4-digit PIN." : weak ? "Choose a PIN that's harder to guess." : "");
    },
    terms: () => {
      const bad = !$("terms").checked;
      $("termsErr").textContent = bad ? "Agree to the Terms and Privacy Policy to continue." : "";
      return bad ? "x" : "";
    },
  };

  /* Live behaviour */
  f.phone.addEventListener("input", () => { f.phone.value = f.phone.value.replace(/\D/g, "").slice(0, 11); });
  Object.keys(f).forEach((k) => {
    f[k].addEventListener("blur", () => f[k].value && rules[k]());
    f[k].addEventListener("input", () => { if (f[k].getAttribute("aria-invalid") === "true") rules[k](); $("alert").hidden = true; });
  });
  $("terms").addEventListener("change", () => $("terms").checked && rules.terms());

  /* Password strength */
  const meter = document.querySelector(".strength");
  f.password.addEventListener("input", () => {
    const v = f.password.value;
    let s = 0;
    if (v.length >= 8) s++;
    if (/[a-z]/i.test(v) && /\d/.test(v)) s++;
    if (/[A-Z]/.test(v) && /[a-z]/.test(v)) s++;
    if (/[^A-Za-z0-9]/.test(v) || v.length >= 12) s++;
    meter.dataset.level = v ? Math.max(s, 1) : 0;
  });

  /* Show / hide password */
  $("eye").addEventListener("click", (e) => {
    const show = f.password.type === "password";
    f.password.type = show ? "text" : "password";
    e.currentTarget.textContent = show ? "Hide" : "Show";
    e.currentTarget.setAttribute("aria-label", show ? "Hide password" : "Show password");
    e.currentTarget.setAttribute("aria-pressed", show);
  });

  /* PIN boxes: auto-advance, backspace, arrows, paste */
  pins.forEach((p, i) => {
    p.addEventListener("input", () => {
      p.value = p.value.replace(/\D/g, "").slice(-1);
      p.classList.toggle("filled", !!p.value);
      if (p.value && pins[i + 1]) pins[i + 1].focus();
      if (p.getAttribute("aria-invalid") === "true") rules.pin();
    });
    p.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !p.value && pins[i - 1]) { pins[i - 1].focus(); pins[i - 1].value = ""; pins[i - 1].classList.remove("filled"); }
      if (e.key === "ArrowLeft" && pins[i - 1]) pins[i - 1].focus();
      if (e.key === "ArrowRight" && pins[i + 1]) pins[i + 1].focus();
    });
    p.addEventListener("focus", () => p.select());
  });
  pinBox.addEventListener("paste", (e) => {
    const d = (e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, 4);
    if (!d) return;
    e.preventDefault();
    pins.forEach((p, i) => { p.value = d[i] || ""; p.classList.toggle("filled", !!p.value); });
    pins[Math.min(d.length, 3)].focus();
  });
  $("pinEye").addEventListener("click", (e) => {
    const show = pins[0].type === "password";
    pins.forEach((p) => (p.type = show ? "text" : "password"));
    e.currentTarget.textContent = show ? "Hide" : "Show";
    e.currentTarget.setAttribute("aria-pressed", show);
  });

  /* Submit */
  $("signupForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("alert").hidden = true;
    const checks = [
      [rules.name, f.name], [rules.phone, f.phone], [rules.email, f.email],
      [rules.password, f.password], [rules.pin, pins[0]], [rules.terms, $("terms")],
    ].map(([fn, el]) => [fn(), el]);
    const firstBad = checks.find(([msg]) => msg);
    if (firstBad) { firstBad[1].focus(); return; }

    submit.disabled = true;
    submit.classList.add("loading");
    submit.querySelector(".btn-text").textContent = "Creating account…";
    try {
      await api.signup({
        username: f.name.value.trim(), phonenumber: f.phone.value, email: f.email.value.trim(),
        password: f.password.value, transactionpin: pins.map((p) => p.value).join(""),
      });
      const a = $("alert");
      a.className = "alert ok";
      a.textContent = "Account created. Opening your dashboard…";
      a.hidden = false;
      window.location.href = "dashboard.html";
    } catch (error) {
      const a = $("alert");
      a.className = "alert";
      a.textContent = error.message || "We couldn't create your account. Check your details and try again.";
      a.hidden = false;
    } finally {
      submit.disabled = false;
      submit.classList.remove("loading");
      submit.querySelector(".btn-text").textContent = "Create account";
    }
  });
})();
