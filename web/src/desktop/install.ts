// Runs before the app: makes the desktop layer the page's "native" side.
import { createDesktopNative } from './native'
import { applyZoom } from './zoom'

window.CarrotNative = createDesktopNative()
document.documentElement.classList.add('desktop')
applyZoom()
