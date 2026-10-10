const hostname = window.location.hostname;
const isCodespaces = hostname.endsWith(".app.github.dev");
const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";

export const url = isCodespaces
	? `${window.location.protocol}//${hostname.replace(/-\d+(?=\.app\.github\.dev$)/, "-8000")}`
	: isLocalhost
		? `${window.location.protocol}//${hostname}:8000`
		: "https://bytesentry.onrender.com";
