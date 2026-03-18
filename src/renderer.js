// ── State ───────────────────────────────────────────────────────────────────
let config        = {}
let history       = []          // current conversation (lean, no base64)
let sessions      = []          // all saved sessions loaded from disk
let currentSessId = null        // active session ID
let pendingImg    = null        // { dataURL, label, mime }
let currentLevel  = 'professional'
let currentMode   = 'auto'
let currentResp   = 'answer'    // 'answer' | 'stepbystep' | 'hint'
let isLoading     = false
let histOpen      = false

const VISION_PROVIDERS = new Set(['anthropic','openai','openrouter','openai-compatible'])

// ── Init ─────────────────────────────────────────────────────────────────────
async function init () {
  config = await window.orb.getConfig()
  currentLevel = config.audienceLevel || 'professional'
  applyTheme(config.theme || 'dark')
  syncLevelPills()
  updateModelHint()
  showSugs(defaultSugs())

  // Load persisted sessions
  const saved = await window.orb.loadHistory()
  sessions = saved || []
  renderSessionList()

  // Start fresh session
  newSession(false)  // don't save empty session yet

  window.addEventListener('focus', async () => {
    const f = await window.orb.getConfig()
    if (f.theme !== config.theme) applyTheme(f.theme)
    config = f; updateModelHint()
  })

  window.orb.onTriggerScreenshot(() => captureWindow())
  registerCropListener()
}

// ── Theme ────────────────────────────────────────────────────────────────────
function applyTheme (t) {
  document.getElementById('shell').classList.toggle('light', t === 'light')
  window.orb.setBackgroundColor?.(t === 'light' ? '#f5f5fa' : '#0e0e16')
}

// ── Status / hints ────────────────────────────────────────────────────────────
function setDot (s) {
  document.getElementById('sdot').className = 'sdot' + (s==='err'?' err':s==='busy'?' busy':'')
}
function updateModelHint () {
  const p = config.provider || '—'
  const m = (config.model || '').replace(/-20\d{6}$/,'')
  const v = VISION_PROVIDERS.has(config.provider) ? ' · 👁' : ''
  document.getElementById('modelHint').textContent = `${p} · ${m||'—'}${v}`
}
function setCtx (icon, text) {
  document.getElementById('ctxIcon').textContent = icon
  document.getElementById('ctxText').textContent = text
}

// ── Pills ─────────────────────────────────────────────────────────────────────
function syncLevelPills () {
  document.querySelectorAll('[data-level]').forEach(b => b.classList.toggle('active', b.dataset.level === currentLevel))
}
function setLevel (el) {
  currentLevel = el.dataset.level; syncLevelPills()
  window.orb.saveConfig({ audienceLevel: currentLevel })
}
function setMode (el) {
  currentMode = el.dataset.mode
  document.querySelectorAll('[data-mode]').forEach(b => b.classList.remove('active'))
  el.classList.add('active'); showSugs(defaultSugs())
}
function setRespMode (el) {
  currentResp = el.dataset.resp
  document.querySelectorAll('[data-resp]').forEach(b => b.classList.remove('active'))
  el.classList.add('active')
}

// ── Suggestions ───────────────────────────────────────────────────────────────
function defaultSugs () {
  const byMode = {
    code:     ['Explain this code','Find the bug','Refactor this','Write tests'],
    math:     ['Solve step by step','Explain the formula','Check my work','Simplify'],
    research: ['Summarize key points','Find counterarguments','Explain methodology'],
    auto:     ['Explain what\'s on screen','Help me debug','Summarize this','What next?'],
  }
  return byMode[currentMode] || []
}
function showSugs (items) {
  document.getElementById('sugs').innerHTML = items
    .map(s => `<button class="sug" onclick="quickSend('${s.replace(/'/g,"\\'")}')">${s}</button>`)
    .join('')
}
function quickSend (t) { document.getElementById('chatInput').value = t; sendMessage() }

// ── History sidebar ────────────────────────────────────────────────────────────
function toggleHistory () {
  histOpen = !histOpen
  document.getElementById('history-sidebar').classList.toggle('open', histOpen)
  document.getElementById('hist-backdrop').classList.toggle('open', histOpen)
  document.getElementById('histBtn').classList.toggle('active', histOpen)
}

function renderSessionList () {
  const el = document.getElementById('histSessions')
  if (!sessions.length) {
    el.innerHTML = `<div style="font-size:11px;color:var(--text3);padding:12px 10px;font-family:'Geist Mono',monospace">No history yet</div>`
    return
  }
  // Sort newest first
  const sorted = [...sessions].sort((a,b) => b.updatedAt - a.updatedAt)
  el.innerHTML = sorted.map(s => `
    <div class="hist-session ${s.id === currentSessId ? 'active':''}" onclick="loadSession('${s.id}')">
      <div class="hist-session-title">${esc(s.title || 'Untitled')}</div>
      <div class="hist-session-meta">${formatDate(s.updatedAt)} · ${s.messages?.length||0} msgs</div>
      <button class="hist-session-del" onclick="deleteSession(event,'${s.id}')" title="Delete">✕</button>
    </div>`).join('')
}

function formatDate (ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  const diff = now - d
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff/60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff/3600000)}h ago`
  return d.toLocaleDateString([], { month:'short', day:'numeric' })
}

function newSession (saveOld = true) {
  if (saveOld && history.length > 0) persistCurrentSession()

  currentSessId = 'sess_' + Date.now()
  history = []
  clearScreenshot()

  const msgs = document.getElementById('msgs')
  msgs.innerHTML = `
    <div class="empty" id="emptyState">
      <div class="empty-g">✦</div>
      <div class="empty-t">What can I help with?</div>
      <div class="empty-s">Capture a window or region for context</div>
    </div>`
  document.getElementById('sugs').style.display = 'flex'
  showSugs(defaultSugs())
  renderSessionList()
  if (histOpen) toggleHistory()
}

function saveAndClearChat () { newSession(true) }

function persistCurrentSession () {
  if (!history.length) return
  const title = deriveTitle(history)
  const existing = sessions.findIndex(s => s.id === currentSessId)
  const sess = {
    id: currentSessId,
    title,
    messages: history.slice(),
    updatedAt: Date.now()
  }
  if (existing >= 0) sessions[existing] = sess
  else sessions.push(sess)
  window.orb.saveHistory(sessions)
  renderSessionList()
}

function deriveTitle (msgs) {
  const first = msgs.find(m => m.role === 'user')
  if (!first) return 'Untitled'
  const t = typeof first.content === 'string' ? first.content : '[image + text]'
  return t.slice(0, 42) + (t.length > 42 ? '…' : '')
}

function loadSession (id) {
  if (history.length > 0) persistCurrentSession()
  const sess = sessions.find(s => s.id === id)
  if (!sess) return
  currentSessId = id
  history = sess.messages ? [...sess.messages] : []

  const msgs = document.getElementById('msgs')
  msgs.innerHTML = ''
  const es = document.getElementById('emptyState')
  if (es) es.style.display = 'none'

  history.forEach(m => {
    if (m.role === 'user') {
      appendUserMsg(m._displayText || m.content, m._thumb || null)
    } else if (m.role === 'assistant') {
      appendAssistantMsg(m.content, false)  // don't save again
    }
  })
  renderSessionList()
  if (histOpen) toggleHistory()
}

function deleteSession (e, id) {
  e.stopPropagation()
  sessions = sessions.filter(s => s.id !== id)
  window.orb.deleteHistorySession(id)
  if (id === currentSessId) newSession(false)
  else renderSessionList()
}

// ── Crop listener ─────────────────────────────────────────────────────────────
function registerCropListener () {
  window.orb.removeAllListeners('crop-result')
  window.orb.onCropResult(dataURL => {
    window.orb.removeAllListeners('crop-result')
    if (!dataURL) { setCtx('⬜','Cancelled'); setDot('ok'); registerCropListener(); return }
    const mime = dataURL.startsWith('data:image/jpeg') ? 'image/jpeg' : 'image/png'
    setPendingImg(dataURL, 'Selected Region', mime)
    setDot('ok')
    registerCropListener()
  })
}

// ── Capture ───────────────────────────────────────────────────────────────────
async function captureWindow () {
  setDot('busy'); setCtx('⏳','Capturing window…')
  try {
    const r = await window.orb.captureActiveWindow()
    if (!r) { setCtx('⚠️','Failed — enable Screen Recording in System Settings'); setDot('err'); return }
    setPendingImg(r.dataURL, r.windowName, 'image/jpeg')
    setDot('ok')
  } catch (e) { setCtx('⚠️', e.message); setDot('err') }
}

async function captureRegion () {
  setDot('busy'); setCtx('✏️','Draw a selection, then Enter…')
  window.orb.removeAllListeners('crop-result')
  window.orb.onCropResult(dataURL => {
    window.orb.removeAllListeners('crop-result')
    if (!dataURL) { setCtx('⬜','Cancelled'); setDot('ok'); registerCropListener(); return }
    const mime = dataURL.startsWith('data:image/jpeg') ? 'image/jpeg' : 'image/png'
    setPendingImg(dataURL, 'Selected Region', mime)
    setDot('ok')
    registerCropListener()
  })
  await window.orb.openCropSelector()
}

function setPendingImg (dataURL, label, mime) {
  const b64 = dataURL.split(',')[1] || ''
  if (b64.length < 100) { setCtx('⚠️','Empty image — try again'); setDot('err'); return }
  pendingImg = { dataURL, label, mime: mime || 'image/jpeg' }
  document.getElementById('ssThumb').src = dataURL
  document.getElementById('ssPending').style.display = 'block'
  const kb = Math.round(b64.length * 0.75 / 1024)
  setCtx('📸', `${label} · ${kb}KB${VISION_PROVIDERS.has(config.provider) ? ' · 👁 attached' : ' · ⚠️ no vision'}`)
}

function clearScreenshot () {
  pendingImg = null
  document.getElementById('ssPending').style.display = 'none'
  setCtx('⬜','No context — press Window or Region')
}

// ── Response mode instructions ─────────────────────────────────────────────────
function respModeInstructions () {
  return {
    answer:     '',   // normal — no extra instruction
    stepbystep: `\n\nIMPORTANT: Do NOT give the final answer directly. Instead, walk through the solution step by step. Number each step. Explain WHY each step is taken. Show all intermediate work. Only reveal the final answer at the very end, after all steps are shown.`,
    hint:       `\n\nIMPORTANT: Do NOT solve the problem or give the answer. Give ONLY a brief hint or nudge in the right direction — one sentence max. The user wants to figure it out themselves.`,
  }[currentResp] || ''
}

// ── System prompt ──────────────────────────────────────────────────────────────
function buildSystem (hasImage) {
  const levels = {
    highschool:   'Explain like a high school student — simple language, relatable analogies, no jargon.',
    college:      'Explain to a college student — accurate terminology, clear reasoning, some academic depth.',
    professional: 'Assist a professional/developer — direct, precise, technically accurate.',
  }
  const modes = {
    code:     'Focus on code quality and correctness. Use fenced code blocks with language tags.',
    math:     'Work step-by-step. Use LaTeX — inline \\(...\\) and display \\[...\\]. Show all intermediate work.',
    research: 'Synthesize clearly — key claims, methodology, limitations.',
    auto:     'Auto-detect context. For math use LaTeX. For code use fenced blocks.',
  }
  const imgNote = hasImage
    ? `\n\nCRITICAL: An image/screenshot has been attached to this message. You MUST read and analyze the image carefully. Describe what you see. Read all text, equations, and diagrams visible. Do NOT say you cannot see the image.`
    : ''
  return `You are Orb, a floating AI assistant on the user's Mac screen.

Audience: ${levels[currentLevel]||levels.professional}
Mode: ${modes[currentMode]||modes.auto}

Formatting:
- Math: ALWAYS use LaTeX — \\(...\\) inline, \\[...\\] display.
- Code: fenced blocks with language tags.
- Use **bold**, *italic*, ## headers, - lists.${imgNote}${respModeInstructions()}`
}

// ── Vision content builder ─────────────────────────────────────────────────────
function buildVisionContent (img, text) {
  const b64  = img.dataURL.split(',')[1]
  const mime = img.mime || 'image/jpeg'
  const p    = config.provider

  if (p === 'anthropic') {
    return {
      apiContent: [
        { type:'image', source:{ type:'base64', media_type:mime, data:b64 } },
        { type:'text', text }
      ],
      historyText: `[Screenshot: ${img.label}] ${text}`
    }
  }
  if (p === 'openai' || p === 'openrouter' || p === 'openai-compatible') {
    return {
      apiContent: [
        { type:'image_url', image_url:{ url:img.dataURL, detail:'high' } },
        { type:'text', text }
      ],
      historyText: `[Screenshot: ${img.label}] ${text}`
    }
  }
  // No vision
  return {
    apiContent: `[Screenshot context: "${img.label}"]\n\n${text}`,
    historyText: `[Screenshot: ${img.label}] ${text}`
  }
}

// ── Send ────────────────────────────────────────────────────────────────────────
async function sendMessage () {
  if (isLoading) return
  const inp  = document.getElementById('chatInput')
  const text = inp.value.trim()
  if (!text) return

  const es = document.getElementById('emptyState')
  if (es) es.style.display = 'none'
  document.getElementById('sugs').style.display = 'none'

  const img = pendingImg

  if (img) {
    const b64 = img.dataURL.split(',')[1] || ''
    if (b64.length < 100) { appendAssistantMsg('⚠️ **Image empty** — capture again.'); return }
  }

  let apiContent, historyText
  if (img) {
    const v = buildVisionContent(img, text)
    apiContent  = v.apiContent
    historyText = v.historyText
  } else {
    apiContent  = text
    historyText = text
  }

  // Show in UI (keep thumbnail for display)
  appendUserMsg(text, img?.dataURL ?? null)
  inp.value = ''; inp.style.height = 'auto'
  clearScreenshot()

  // Keep lean history entry (with display metadata)
  const histEntry = {
    role: 'user',
    content: historyText,
    _displayText: text,
    _thumb: img?.dataURL ?? null
  }
  history.push(histEntry)

  // Build send array: all previous turns (lean) + this turn (full image)
  const systemMsg  = { role:'system', content: buildSystem(!!img) }
  const thisApiMsg = { role:'user', content: apiContent }
  const sendMsgs   = [systemMsg, ...history.slice(0,-1).map(m => ({ role:m.role, content:m.content })), thisApiMsg]

  const typing = showTyping()
  isLoading = true; setDot('busy')
  document.getElementById('sendBtn').disabled = true

  try {
    const res = await window.orb.chatRequest({ messages: sendMsgs, config: { ...config } })
    typing.remove()
    if (res.success) {
      history.push({ role:'assistant', content: res.content })
      appendAssistantMsg(res.content)
      setDot('ok')
      // Auto-save after each assistant response
      persistCurrentSession()
    } else {
      history.pop()
      appendAssistantMsg(`⚠️ **Error:** ${res.error}\n\nCheck ⚙ Settings — provider / API key / model.`)
      setDot('err')
    }
  } catch (e) {
    typing.remove(); history.pop()
    appendAssistantMsg(`⚠️ **Error:** ${e.message}`)
    setDot('err')
  } finally {
    isLoading = false
    document.getElementById('sendBtn').disabled = false
    document.getElementById('sugs').style.display = 'flex'
    showSugs(defaultSugs())
  }
}

// ── Message rendering ───────────────────────────────────────────────────────────
function ts () { return new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) }

function appendUserMsg (text, imgURL) {
  const c = document.getElementById('msgs')
  const d = document.createElement('div'); d.className = 'msg user'
  d.innerHTML = `
    <div class="msg-meta"><span class="msg-role">You</span><span class="msg-time">${ts()}</span></div>
    ${imgURL ? `<img class="msg-ss" src="${imgURL}" alt="screenshot">` : ''}
    <div class="bubble">${esc(text)}</div>`
  c.appendChild(d); c.scrollTop = c.scrollHeight
}

function appendAssistantMsg (md, doSave) {
  const c = document.getElementById('msgs')
  const d = document.createElement('div'); d.className = 'msg assistant'

  // Show response mode badge for non-answer modes
  const badge = currentResp !== 'answer'
    ? `<div class="sbs-badge">${currentResp === 'stepbystep' ? '🪜 Step by step' : '💡 Hint only'}</div>`
    : ''

  d.innerHTML = `
    <div class="msg-meta"><span class="msg-role">Orb</span><span class="msg-time">${ts()}</span></div>
    <div class="bubble">${badge}${renderMd(md)}</div>`
  c.appendChild(d)
  renderKatex(d.querySelector('.bubble'))
  c.scrollTop = c.scrollHeight
}

function showTyping () {
  const c = document.getElementById('msgs')
  const d = document.createElement('div'); d.className = 'msg assistant'
  d.innerHTML = `
    <div class="msg-meta"><span class="msg-role">Orb</span></div>
    <div class="bubble"><div class="dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div></div>`
  c.appendChild(d); c.scrollTop = c.scrollHeight; return d
}

// ── KaTeX ───────────────────────────────────────────────────────────────────────
function renderKatex (el) {
  if (typeof renderMathInElement === 'undefined') { setTimeout(() => renderKatex(el), 400); return }
  try {
    renderMathInElement(el, {
      delimiters: [
        { left:'\\[', right:'\\]', display:true  },
        { left:'\\(', right:'\\)', display:false },
        { left:'$$',  right:'$$',  display:true  },
        { left:'$',   right:'$',   display:false },
      ],
      throwOnError:false
    })
  } catch(e) { console.warn('KaTeX:', e) }
}

// ── Markdown ────────────────────────────────────────────────────────────────────
function renderMd (raw) {
  const ph = []; const save = s => { ph.push(s); return `\x00${ph.length-1}\x00` }
  let s = raw
    .replace(/\\\[([\s\S]*?)\\\]/g,   (_, m) => save(`\\[${m}\\]`))
    .replace(/\$\$([\s\S]*?)\$\$/g,   (_, m) => save(`$$${m}$$`))
    .replace(/\\\(([\s\S]*?)\\\)/g,   (_, m) => save(`\\(${m}\\)`))
    .replace(/\$([^$\n]{1,200}?)\$/g, (_, m) => save(`$${m}$`))
    .replace(/```(\w*)\n?([\s\S]*?)```/g, (_, l, c) =>
      save(`<pre><code class="lang-${l}">${esc(c.trim())}</code></pre>`))
    .replace(/`([^`]+)`/g,   (_, c)  => `<code>${esc(c)}</code>`)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g,     '<em>$1</em>')
    .replace(/^#{1,3} (.+)$/gm,'<h3>$1</h3>')
    .replace(/^[-*] (.+)$/gm,  '<li>$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]*?<\/li>\n?)+/g, m => `<ul>${m}</ul>`)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g,  '<a href="$2">$1</a>')
    .replace(/\n\n+/g, '</p><p>')
    .replace(/\n/g,    '<br>')
  return `<p>${s.replace(/\x00(\d+)\x00/g, (_, i) => ph[+i])}</p>`
}

function esc (str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

// ── Utilities ───────────────────────────────────────────────────────────────────
function handleKey (e) { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }
function autoResize (el) { el.style.height='auto'; el.style.height=Math.min(el.scrollHeight,120)+'px' }

init()
