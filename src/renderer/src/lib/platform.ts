/** True in the Sidera for iPad build (vite.ipad.config.ts, `--mode ipad`); compile-time, so desktop code is unaffected. */
export const IS_IPAD = import.meta.env.MODE === 'ipad'
