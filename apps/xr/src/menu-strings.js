/**
 * 2D DOM menu strings per locale — the greenroom precedent: all
 * browser-page text is DOM (browser font stack renders every glyph);
 * UIKitML spatial panels are reserved for the in-headset surfaces.
 * Text mirrors the former welcome.*.uikitml panels exactly.
 */

/** @typedef {{ brand: string, pitch: string, enter: string, noXr: string, home: string, how: string, privacy: string }} MenuStrings */

/** @type {Record<string, MenuStrings>} */
export const MENU_STRINGS = {
	en: {
		brand: 'Urban Inversion',
		pitch: 'See who nearby is open to a conversation - and who wants quiet. No accounts, nothing stored.',
		enter: 'Enter XR',
		noXr: 'This device cannot enter XR - the site menu below still works.',
		home: 'Site home',
		how: 'How it works',
		privacy: 'Privacy & safety',
	},
	es: {
		brand: 'Urban Inversion',
		pitch: 'Mira quién cerca de ti está abierto a platicar - y quién prefiere tranquilidad. Sin cuentas, sin nada guardado.',
		enter: 'Entrar a XR',
		noXr: 'Este dispositivo no puede entrar a XR - el menú del sitio sigue funcionando.',
		home: 'Inicio',
		how: 'Cómo funciona',
		privacy: 'Privacidad y seguridad',
	},
	fr: {
		brand: 'Urban Inversion',
		pitch: 'Voyez qui, à proximité, est ouvert à la discussion - et qui préfère le calme. Pas de comptes, rien de stocké.',
		enter: 'Entrer en XR',
		noXr: 'Cet appareil ne peut pas entrer en XR - le menu du site fonctionne toujours.',
		home: 'Accueil',
		how: 'Comment ça marche',
		privacy: 'Confidentialité et sécurité',
	},
};
