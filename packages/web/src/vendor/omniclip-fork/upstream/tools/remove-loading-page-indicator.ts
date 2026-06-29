// Extracted from main.ts so that importing the OmniContext (context/context.ts)
// does NOT pull main.ts's module-level side effects (posthog.init, the HashRouter
// that appends a landing-page shell to document.body, sl-theme-dark on
// documentElement). The omniclip fork embeds <construct-editor> inside the host
// app and boots the context directly, so it must be able to import the context
// without triggering the standalone app's router (openimago-uatf).
export function removeLoadingPageIndicator() {
	const loadingPageIndicatorElement = document.querySelector(".loading-page-indicator")
	if(loadingPageIndicatorElement)
		document.body.removeChild(loadingPageIndicatorElement!)
}
