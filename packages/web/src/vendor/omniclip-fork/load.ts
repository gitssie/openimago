// Runtime loader for the omniclip fork (openimago-4eiw).
//
// The panel dynamic-imports THIS module by string path so the repo typecheck
// never follows into the browser-only vendor code. Returns the live fork impl +
// theme applier, matching the in-repo LoadOmniclipFork contract.
//
// BROWSER-ONLY (this whole dir is excluded from typecheck/lint).

import { omniclipFork, applyImagoTheme } from './index'

export async function loadOmniclipFork() {
  return { fork: omniclipFork, applyImagoTheme }
}
