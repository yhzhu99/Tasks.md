import { createMemo, createContext, useContext, createEffect, createSignal } from "solid-js";
import { makePersisted } from "@solid-primitives/storage";
import { flatten, resolveTemplate, translator } from "@solid-primitives/i18n";
import en from "./locales/en.js";
import zh from "./locales/zh.js";

export const SUPPORTED_LOCALES = ["en", "zh"];

export const DATE_LOCALES = {
	en: "en",
	zh: "zh-CN",
};

const DICTS = { en, zh };

function detectLocale() {
	const browserLocale = (navigator.language || "en").toLowerCase();
	if (browserLocale.startsWith("zh")) {
		return "zh";
	}
	return "en";
}

const [locale, setLocale] = makePersisted(createSignal(detectLocale()), {
	storage: localStorage,
	name: "locale",
});

const dict = createMemo(() => flatten(DICTS[locale()] || en));
const t = createMemo(() => translator(dict, resolveTemplate));

const I18nContext = createContext({ t, locale, setLocale });

export function I18nProvider(props) {
	createEffect(() => {
		document.documentElement.lang = locale() === "zh" ? "zh-CN" : "en";
	});
	return (
		<I18nContext.Provider value={{ t, locale, setLocale }}>
			{props.children}
		</I18nContext.Provider>
	);
}

export function useI18n() {
	const context = useContext(I18nContext);
	if (!context) {
		throw new Error("useI18n must be used within an I18nProvider");
	}
	return context;
}

export function dateLocale(code) {
	return DATE_LOCALES[code] || "en";
}

export { I18nContext };
