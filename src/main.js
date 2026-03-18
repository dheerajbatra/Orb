const {
  app, BrowserWindow, globalShortcut, ipcMain,
  Tray, Menu, screen, desktopCapturer,
  clipboard, nativeImage, shell, systemPreferences
} = require('electron')

const path = require('path')
const fs   = require('fs')
const os   = require('os')

// ─── Config ───────────────────────────────────────────────────────────────────
const CONFIG_PATH = path.join(os.homedir(), '.orb-assistant', 'config.json')
const DEFAULT_CONFIG = {
  provider: 'anthropic', apiKey: '', model: 'claude-sonnet-4-20250514',
  customEndpoint: '', audienceLevel: 'professional',
  hotkey: 'CommandOrControl+Shift+Space',
  screenshotOnActivate: false, theme: 'dark', position: { x: null, y: null }
}

function loadConfig () {
  try {
    if (fs.existsSync(CONFIG_PATH))
      return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) }
  } catch (e) { console.error('Config load:', e) }
  return { ...DEFAULT_CONFIG }
}
function saveConfig (cfg) {
  try {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true })
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2))
  } catch (e) { console.error('Config save:', e) }
}

let config = loadConfig()

// ─── Windows ──────────────────────────────────────────────────────────────────
let mainWin = null, settingsWin = null, cropWin = null, tray = null
let isVisible = true
app.isQuitting = false

function getWindowPos () {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  const W = 380, H = 640
  return { x: config.position?.x ?? width - W - 24, y: config.position?.y ?? height - H - 24, W, H }
}

function createMainWindow () {
  const { x, y, W, H } = getWindowPos()
  mainWin = new BrowserWindow({
    x, y, width: W, height: H, minWidth: 320, minHeight: 500, maxWidth: 520,
    frame: false, transparent: false, backgroundColor: '#0e0e16',
    alwaysOnTop: true, hasShadow: true, resizable: true, movable: true, skipTaskbar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  })
  mainWin.loadFile(path.join(__dirname, 'index.html'))
  mainWin.setAlwaysOnTop(true, 'floating')
  mainWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  mainWin.setWindowButtonVisibility(false)
  mainWin.on('minimize', e => { e.preventDefault(); hideWindow() })
  mainWin.on('close',    e => { if (!app.isQuitting) { e.preventDefault(); hideWindow() } })
  mainWin.on('moved',    () => {
    const [wx, wy] = mainWin.getPosition()
    config.position = { x: wx, y: wy }; saveConfig(config)
  })
  if (process.argv.includes('--dev')) mainWin.webContents.openDevTools({ mode: 'detach' })
}

function createSettingsWindow () {
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.focus(); return }
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  settingsWin = new BrowserWindow({
    width: 580, height: 700,
    x: Math.floor(width/2 - 290), y: Math.floor(height/2 - 350),
    frame: false, transparent: true, vibrancy: 'under-window',
    hasShadow: true, resizable: false, alwaysOnTop: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  })
  settingsWin.loadFile(path.join(__dirname, 'settings.html'))
  settingsWin.setAlwaysOnTop(true, 'floating')
}

// ─── Tray ─────────────────────────────────────────────────────────────────────
function createTray () {
  // Try @2x (Retina) first, fall back to standard, then empty
  const iconPath2x = path.join(__dirname, '..', 'assets', 'tray-icon@2x.png')
  const iconPath1x = path.join(__dirname, '..', 'assets', 'tray-icon.png')
  let icon
  if (fs.existsSync(iconPath1x)) {
    icon = nativeImage.createFromPath(iconPath1x)
    // On Retina displays, also load the @2x version if available
    if (fs.existsSync(iconPath2x)) {
      try {
        const hi = nativeImage.createFromPath(iconPath2x)
        // Build a multi-resolution image: addRepresentation not available in all versions
        // Just use the 1x — macOS will auto-scale from @2x filename convention
      } catch(e) {}
    }
    // Mark as template image so macOS handles dark/light mode automatically
    icon.setTemplateImage(true)
  } else {
    icon = nativeImage.createEmpty()
  }
  tray = new Tray(icon)
  tray.setToolTip('Orb Assistant')
  tray.on('click', showWindow)
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show Orb',           click: showWindow },
    { label: 'Hide Orb',           click: hideWindow },
    { type: 'separator' },
    { label: 'Settings',           click: createSettingsWindow },
    { label: 'Open Config Folder', click: () => shell.openPath(path.dirname(CONFIG_PATH)) },
    { type: 'separator' },
    { label: 'Quit Orb',           click: () => { app.isQuitting = true; app.quit() } }
  ]))
}

function showWindow () {
  if (!mainWin) return
  mainWin.show(); mainWin.restore()
  mainWin.setAlwaysOnTop(true, 'floating'); mainWin.focus(); isVisible = true
}
function hideWindow () { if (!mainWin) return; mainWin.hide(); isVisible = false }
function toggleVisibility () { isVisible && mainWin?.isVisible() ? hideWindow() : showWindow() }

// ─── Screen capture helpers ───────────────────────────────────────────────────

function sleep (ms) { return new Promise(r => setTimeout(r, ms)) }

// Get the device pixel ratio for the primary display (e.g. 2 on Retina)
function getScaleFactor () {
  return screen.getPrimaryDisplay().scaleFactor || 1
}

// Capture the frontmost non-Orb window, return { dataURL, windowName } or null
async function captureActiveWindow () {
  mainWin?.hide()
  await sleep(200)  // let compositor flush

  let result = null
  try {
    // Use scaleFactor so we request the actual pixel resolution
    const sf = getScaleFactor()
    const disp = screen.getPrimaryDisplay()
    const pw = disp.bounds.width  * sf
    const ph = disp.bounds.height * sf

    const winSources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: { width: Math.round(pw), height: Math.round(ph) },
      fetchWindowIcons: false
    })
    const scrSources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: Math.round(pw), height: Math.round(ph) }
    })

    const candidates = winSources.filter(s =>
      !s.name.toLowerCase().includes('orb') &&
      s.thumbnail.getSize().width > 10
    )

    const chosen = candidates[0] || scrSources[0]
    if (!chosen) { mainWin?.show(); mainWin?.setAlwaysOnTop(true,'floating'); return null }

    const windowName = chosen.name || 'Active Window'
    const full = chosen.thumbnail
    const size = full.getSize()

    // Scale down to max 1440px wide for reasonable IPC payload
    const MAX_W = 1440
    let img = full
    if (size.width > MAX_W) {
      const scale = MAX_W / size.width
      img = full.resize({ width: MAX_W, height: Math.round(size.height * scale), quality: 'good' })
    }

    const b64 = img.toJPEG(85).toString('base64')
    result = { dataURL: `data:image/jpeg;base64,${b64}`, windowName }
  } catch (e) {
    console.error('Capture error:', e)
  }

  mainWin?.show()
  mainWin?.setAlwaysOnTop(true, 'floating')
  return result
}

// ─── Crop / region select ─────────────────────────────────────────────────────
// We store the full screenshot and the scale factor so cropImage can
// correctly map CSS-pixel rect → actual image pixels
let cropState = null   // { fullDataURL, scaleFactor, dispW, dispH }

async function openCropSelector () {
  // Close any stale crop window first
  if (cropWin && !cropWin.isDestroyed()) { cropWin.destroy(); cropWin = null }
  cropState = null

  mainWin?.hide()
  await sleep(220)

  try {
    const sf   = getScaleFactor()
    const disp = screen.getPrimaryDisplay()
    const pw   = Math.round(disp.bounds.width  * sf)
    const ph   = Math.round(disp.bounds.height * sf)

    const scrSources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: pw, height: ph }
    })
    if (!scrSources.length) { mainWin?.show(); return }

    const full    = scrSources[0].thumbnail
    const imgSize = full.getSize()
    // Store as PNG (lossless) so crop quality is preserved
    const pngB64  = full.toPNG().toString('base64')

    cropState = {
      fullDataURL: `data:image/png;base64,${pngB64}`,
      scaleFactor: sf,
      imgW: imgSize.width,
      imgH: imgSize.height,
      dispW: disp.bounds.width,
      dispH: disp.bounds.height
    }

    // Open overlay at display bounds (CSS pixels)
    cropWin = new BrowserWindow({
      x: disp.bounds.x, y: disp.bounds.y,
      width: disp.bounds.width, height: disp.bounds.height,
      frame: false, transparent: true, backgroundColor: '#00000000',
      alwaysOnTop: true, skipTaskbar: true, focusable: true,
      enableLargerThanScreen: true,
      webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
    })
    cropWin.setAlwaysOnTop(true, 'screen-saver')
    // Must set both to avoid rounding on Retina
    cropWin.setContentSize(disp.bounds.width, disp.bounds.height)
    cropWin.loadFile(path.join(__dirname, 'crop.html'))

    cropWin.webContents.once('did-finish-load', () => {
      if (!cropWin || cropWin.isDestroyed()) return
      cropWin.webContents.send('crop-init', {
        dataURL: cropState.fullDataURL,
        dispW:   cropState.dispW,
        dispH:   cropState.dispH
      })
    })

    cropWin.on('closed', () => { cropWin = null })
    cropWin.focus()
  } catch (e) {
    console.error('Crop open error:', e)
    mainWin?.show()
    cropState = null
  }
}

// rect is in CSS/logical pixels; we scale to image pixels using scaleFactor
function cropImage (rect) {
  if (!cropState) return null
  try {
    const { fullDataURL, scaleFactor, imgW, imgH, dispW, dispH } = cropState

    // Scale factor between logical pixels and actual image pixels
    // Image may not exactly equal dispW*sf due to rounding — compute precisely
    const scaleX = imgW / dispW
    const scaleY = imgH / dispH

    const x = Math.max(0, Math.round(rect.x * scaleX))
    const y = Math.max(0, Math.round(rect.y * scaleY))
    const w = Math.min(Math.round(rect.w * scaleX), imgW - x)
    const h = Math.min(Math.round(rect.h * scaleY), imgH - y)

    if (w < 4 || h < 4) return null

    const b64 = fullDataURL.split(',')[1]
    const buf = Buffer.from(b64, 'base64')
    let img = nativeImage.createFromBuffer(buf)
    const cropped = img.crop({ x, y, width: w, height: h })

    // Scale down for IPC if needed
    const MAX_W = 1440
    let final = cropped
    const cs = cropped.getSize()
    if (cs.width > MAX_W) {
      const s = MAX_W / cs.width
      final = cropped.resize({ width: MAX_W, height: Math.round(cs.height * s), quality: 'good' })
    }
    return `data:image/jpeg;base64,${final.toJPEG(88).toString('base64')}`
  } catch (e) {
    console.error('cropImage error:', e); return null
  }
}

// ─── IPC ──────────────────────────────────────────────────────────────────────
ipcMain.handle('get-config',           ()       => config)

// ─── History persistence ──────────────────────────────────────────────────────
const HISTORY_PATH = path.join(os.homedir(), '.orb-assistant', 'history.json')

ipcMain.handle('load-history', () => {
  try {
    if (fs.existsSync(HISTORY_PATH)) return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'))
  } catch(e) {}
  return []
})

ipcMain.handle('save-history', (_, sessions) => {
  try {
    fs.mkdirSync(path.dirname(HISTORY_PATH), { recursive: true })
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(sessions, null, 2))
  } catch(e) { console.error('History save error:', e) }
})

ipcMain.handle('delete-history-session', (_, sessionId) => {
  try {
    if (!fs.existsSync(HISTORY_PATH)) return
    const sessions = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'))
    const filtered = sessions.filter(s => s.id !== sessionId)
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(filtered, null, 2))
  } catch(e) { console.error('History delete error:', e) }
})
ipcMain.handle('get-clipboard',        ()       => clipboard.readText())
ipcMain.handle('open-settings',        ()       => createSettingsWindow())
ipcMain.handle('hide-window',          ()       => hideWindow())
ipcMain.handle('close-settings',       ()       => { settingsWin?.destroy() })
ipcMain.handle('set-background-color', (_, c)   => mainWin?.setBackgroundColor(c))

ipcMain.handle('save-config', (_, newCfg) => {
  config = { ...config, ...newCfg }; saveConfig(config)
  if (newCfg.hotkey) { globalShortcut.unregisterAll(); registerHotkey() }
  return config
})

ipcMain.handle('capture-active-window', async () => captureActiveWindow())

ipcMain.handle('open-crop-selector', async () => {
  await openCropSelector()
  return true
})

ipcMain.handle('crop-selected', (_, rect) => {
  if (cropWin && !cropWin.isDestroyed()) { cropWin.destroy(); cropWin = null }
  mainWin?.show()
  mainWin?.setAlwaysOnTop(true, 'floating')

  if (!rect || !cropState) { cropState = null; return null }
  const cropped = cropImage(rect)
  cropState = null
  if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('crop-result', cropped)
  return cropped
})

ipcMain.handle('crop-cancelled', () => {
  if (cropWin && !cropWin.isDestroyed()) { cropWin.destroy(); cropWin = null }
  mainWin?.show()
  mainWin?.setAlwaysOnTop(true, 'floating')
  cropState = null
  if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('crop-result', null)
  return null
})

// ─── AI ───────────────────────────────────────────────────────────────────────
ipcMain.handle('chat-request', async (_, { messages, config: cfg }) => {
  try { return { success: true, content: await callAI(messages, cfg || config) } }
  catch (e) { return { success: false, error: e.message } }
})

async function callAI (messages, cfg) {
  const p = cfg.provider || 'anthropic'
  if (p === 'anthropic')         return callAnthropic(messages, cfg)
  if (p === 'openai')            return callOpenAICompat(messages, cfg, 'https://api.openai.com/v1/chat/completions')
  if (p === 'openrouter')        return callOpenRouter(messages, cfg)
  if (p === 'openai-compatible') return callOpenAICompat(messages, cfg, cfg.customEndpoint)
  if (p === 'ollama')            return callOllama(messages, cfg)
  if (p === 'lmstudio')          return callOpenAICompat(messages, cfg, cfg.customEndpoint || 'http://localhost:1234/v1/chat/completions')
  throw new Error(`Unknown provider: ${p}`)
}

// ── Anthropic (supports vision) ───────────────────────────────────────────────
async function callAnthropic (messages, cfg) {
  const systemMsg = messages.find(m => m.role === 'system')
  const chatMsgs  = messages.filter(m => m.role !== 'system').map(m => {
    if (Array.isArray(m.content)) {
      // Validate vision blocks — ensure image data is intact
      const parts = m.content.map(part => {
        if (part.type === 'image') {
          const { media_type, data } = part.source || {}
          if (!data || data.length < 100) {
            // Image data missing — replace with text note
            return { type: 'text', text: '[Image could not be attached]' }
          }
          return part
        }
        return part
      })
      return { role: m.role, content: parts }
    }
    return { role: m.role, content: String(m.content) }
  })

  const body = {
    model: cfg.model || 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    messages: chatMsgs
  }
  if (systemMsg) body.system = String(systemMsg.content)

  console.log('[Anthropic] Sending', chatMsgs.length, 'messages, last role:', chatMsgs.at(-1)?.role)
  const hasImage = chatMsgs.some(m => Array.isArray(m.content) && m.content.some(p => p.type === 'image'))
  console.log('[Anthropic] Has image:', hasImage)

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body)
  })
  const text = await resp.text()
  if (!resp.ok) {
    let msg = `HTTP ${resp.status}`
    try { msg = JSON.parse(text)?.error?.message || msg } catch {}
    throw new Error(msg)
  }
  return JSON.parse(text).content?.[0]?.text || ''
}

// ── Content helpers ───────────────────────────────────────────────────────────
// Flatten to plain text (for providers that don't support vision arrays)
function flattenToText (content) {
  if (Array.isArray(content)) {
    return content.filter(b => b.type === 'text').map(b => b.text).join('\n') || '[image context provided]'
  }
  return String(content)
}

// Pass through OpenAI-format vision arrays as-is; flatten strings to string
function normalizeOpenAIContent (content) {
  if (Array.isArray(content)) {
    // Validate each part — keep image_url and text blocks
    const parts = content.map(part => {
      if (part.type === 'image_url') {
        const url = part.image_url?.url || ''
        if (!url || url.length < 50) return { type: 'text', text: '[image could not be attached]' }
        return part  // pass through as-is
      }
      if (part.type === 'image') {
        // Anthropic format in wrong place — convert to OpenAI format
        const data = part.source?.data || ''
        const mime = part.source?.media_type || 'image/jpeg'
        if (!data || data.length < 50) return { type: 'text', text: '[image could not be attached]' }
        return { type: 'image_url', image_url: { url: `data:${mime};base64,${data}`, detail: 'high' } }
      }
      return part
    })
    return parts
  }
  return String(content)
}

async function callOpenAICompat (messages, cfg, endpoint) {
  if (!endpoint) throw new Error('No endpoint URL. Set it in Settings.')
  const sys  = messages.find(m => m.role === 'system')
  const chat = messages.filter(m => m.role !== 'system').map(m => ({
    role: m.role,
    content: normalizeOpenAIContent(m.content)
  }))
  const all  = sys ? [{ role: 'system', content: String(sys.content) }, ...chat] : chat
  const headers = { 'Content-Type': 'application/json' }
  if (cfg.apiKey) headers['Authorization'] = `Bearer ${cfg.apiKey}`

  console.log('[OpenAI-compat] endpoint:', endpoint, 'model:', cfg.model)
  const hasImg = chat.some(m => Array.isArray(m.content) && m.content.some(p => p.type === 'image_url'))
  console.log('[OpenAI-compat] has image:', hasImg)

  const resp = await fetch(endpoint, {
    method: 'POST', headers,
    body: JSON.stringify({ model: cfg.model || 'gpt-4o', messages: all, max_tokens: 2048 })
  })
  const text = await resp.text()
  if (!resp.ok) {
    let msg = `HTTP ${resp.status}`
    try { msg = JSON.parse(text)?.error?.message || msg } catch { msg += ` — ${text.slice(0,120)}` }
    throw new Error(msg)
  }
  try { return JSON.parse(text).choices?.[0]?.message?.content || '' }
  catch { throw new Error(`Invalid JSON: ${text.slice(0,120)}`) }
}

async function callOpenRouter (messages, cfg) {
  const sys  = messages.find(m => m.role === 'system')
  const chat = messages.filter(m => m.role !== 'system').map(m => ({
    role: m.role,
    content: normalizeOpenAIContent(m.content)
  }))
  const all  = sys ? [{ role: 'system', content: String(sys.content) }, ...chat] : chat

  console.log('[OpenRouter] model:', cfg.model)
  const hasImg = chat.some(m => Array.isArray(m.content) && m.content.some(p => p.type === 'image_url'))
  console.log('[OpenRouter] has image:', hasImg)

  const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cfg.apiKey}`,
      'HTTP-Referer': 'https://orb-assistant.app',
      'X-Title': 'Orb'
    },
    body: JSON.stringify({ model: cfg.model, messages: all, max_tokens: 2048 })
  })
  const text = await resp.text()
  if (!resp.ok) {
    let msg = `HTTP ${resp.status}`
    try { msg = JSON.parse(text)?.error?.message || msg } catch { msg += ` — ${text.slice(0,120)}` }
    throw new Error(msg)
  }
  try { return JSON.parse(text).choices?.[0]?.message?.content || '' }
  catch { throw new Error(`Invalid JSON: ${text.slice(0,120)}`) }
}

async function callOllama (messages, cfg) {
  const endpoint = cfg.customEndpoint || 'http://localhost:11434/api/chat'
  // Ollama: text only
  const msgs = messages.map(m => ({ role: m.role, content: flattenToText(m.content) }))
  const resp = await fetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: cfg.model || 'llama3.2', messages: msgs, stream: false })
  })
  const text = await resp.text()
  if (!resp.ok) { throw new Error(`Ollama ${resp.status}: ${text.slice(0,120)}`) }
  try { return JSON.parse(text).message?.content || '' }
  catch { throw new Error(`Invalid JSON from Ollama: ${text.slice(0,120)}`) }
}

// ─── Hotkey ───────────────────────────────────────────────────────────────────
function registerHotkey () {
  const hk = config.hotkey || 'CommandOrControl+Shift+Space'
  try {
    globalShortcut.register(hk, () => {
      toggleVisibility()
      if (isVisible && config.screenshotOnActivate) mainWin?.webContents.send('trigger-screenshot')
    })
  } catch (e) { console.error('Hotkey failed:', e) }
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    const s = systemPreferences.getMediaAccessStatus('screen')
    console.log('[Screen Recording]', s)
  }
  createMainWindow(); createTray(); registerHotkey()
})
app.on('before-quit',       () => { app.isQuitting = true })
app.on('will-quit',         () => globalShortcut.unregisterAll())
app.on('window-all-closed', () => {})
app.on('activate',          () => showWindow())
app.dock?.hide()
