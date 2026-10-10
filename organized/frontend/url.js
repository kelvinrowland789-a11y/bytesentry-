const hostname = window.location.hostname;
const isCodespaces = hostname.endsWith(".app.github.dev");
const apiHost = isCodespaces
	? hostname.replace(/-\d+(?=\.app\.github\.dev$)/, "-8000")
	: `${hostname}:8000`;

export const url = `${window.location.protocol}//${apiHost}`;
