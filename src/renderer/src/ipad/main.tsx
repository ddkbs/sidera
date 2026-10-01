// Sidera for iPad entry. Order matters: the shims (window.auth / api / app …) must exist before the store and the
// board code are evaluated, so everything React is imported dynamically after `boot()`.
import '../assets-path'
import '../fonts.css'
import '../index.css'
import './ipad.css'
import { boot } from './boot'

const launch = boot()
const { renderIpad } = await import('./IpadRoot')
renderIpad(launch)
