/* @refresh reload */
import { render } from "solid-js/web";

import App from "./App";
import { I18nProvider } from "./i18n";
import { SessionGate } from "./team-session";

const root = document.getElementById("root");

if (import.meta.env.DEV && "serviceWorker" in navigator) {
	void navigator.serviceWorker.getRegistrations().then((registrations) =>
		Promise.all(registrations.map((registration) => registration.unregister())),
	);
}

if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
	throw new Error(
		"Root element not found. Did you forget to add it to your index.html? Or maybe the id attribute got mispelled?",
	);
}

render(() => <I18nProvider><SessionGate><App /></SessionGate></I18nProvider>, root);
