import { url } from "./url.js";
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const form = $("loginForm"), email = $("email"), pw = $("password");
  const emailErr = $("emailErr"), pwErr = $("pwErr"), alertBox = $("alert");
  const submit = $("submit");

  const api = {
    async login(creds) {
      const response = await fetch(`${url}/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(creds),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "Could not log in.");
      return result;
    },
  };

  const setErr = (input, box, msg) => {
    box.textContent = msg;
    input.setAttribute("aria-invalid", msg ? "true" : "false");
  };
  const showAlert = (msg, ok) => {
    alertBox.hidden = !msg;
    alertBox.textContent = msg || "";
    alertBox.classList.toggle("ok", !!ok);
  };

  function validate() {
    const e = email.value.trim();
    let bad = null;
    if (!e) { setErr(email, emailErr, "Enter your email address."); bad = bad || email; }
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) { setErr(email, emailErr, "That email doesn't look right. Check it and try again."); bad = bad || email; }
    else setErr(email, emailErr, "");

    if (!pw.value) { setErr(pw, pwErr, "Enter your password."); bad = bad || pw; }
    else if (pw.value.length < 8) { setErr(pw, pwErr, "Passwords are at least 8 characters."); bad = bad || pw; }
    else setErr(pw, pwErr, "");
    return bad;
  }

  [email, pw].forEach((el) => el.addEventListener("input", () => {
    if (el.getAttribute("aria-invalid") === "true") validate();
    showAlert("");
  }));

  /* Show / hide password */
  $("eye").addEventListener("click", (e) => {
    const show = pw.type === "password";
    pw.type = show ? "text" : "password";
    e.currentTarget.textContent = show ? "Hide" : "Show";
    e.currentTarget.setAttribute("aria-label", show ? "Hide password" : "Show password");
    e.currentTarget.setAttribute("aria-pressed", show);
    pw.focus();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    showAlert("");
    const bad = validate();
    if (bad) { bad.focus(); return; }

    submit.disabled = true;
    submit.classList.add("loading");
    submit.querySelector(".btn-text").textContent = "Logging in…";
    try {
      await api.login({ email: email.value.trim(), password: pw.value });
      showAlert("Logged in. Taking you to your dashboard…", true);
      window.location.href = "dashboard.html";
    } catch (error) {
      showAlert(error.message || "Email or password is incorrect. Check your details and try again.");
      pw.select();
    } finally {
      submit.disabled = false;
      submit.classList.remove("loading");
      submit.querySelector(".btn-text").textContent = "Log in";
    }
  });
})();
