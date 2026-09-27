// Shared by the icon scripts: rasterises an SVG string at exactly w×h px inside an Electron window via <canvas>
// (independent of the display's scale factor).
async function raster(win, svg, w, h = w) {
  const url = await win.webContents.executeJavaScript(`new Promise((res, rej) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = ${w}; c.height = ${h}
      const ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, ${w}, ${h}); res(c.toDataURL('image/png'))
    }
    img.onerror = () => rej(new Error('svg failed to load'))
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(${JSON.stringify(svg)})
  })`)
  return Buffer.from(url.split(',')[1], 'base64')
}

/** Opens a hidden window, runs fn(render), quits (also on failure). */
function withRenderer(app, BrowserWindow, fn) {
  app.whenReady().then(async () => {
    try {
      const win = new BrowserWindow({ show: false })
      await win.loadURL('data:text/html,<body></body>')
      await fn((svg, w, h) => raster(win, svg, w, h))
    } catch (e) {
      console.error(e)
      process.exitCode = 1
    }
    app.quit()
  })
}

module.exports = { withRenderer }
