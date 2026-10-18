// Hermes ships only part of Intl. Translations with plurals ("2 tickets") need PluralRules,
// which needs Locale and getCanonicalLocales; each polyfill is a no-op where the engine has it.
import "@formatjs/intl-getcanonicallocales/polyfill.js";
import "@formatjs/intl-locale/polyfill.js";
import "@formatjs/intl-pluralrules/polyfill.js";
import "@formatjs/intl-pluralrules/locale-data/en.js";
import "@formatjs/intl-pluralrules/locale-data/tr.js";
