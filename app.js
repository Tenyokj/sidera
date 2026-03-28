const PREFS_KEY = "sidera-ui-prefs-v1"
const HINT_SESSION_KEY = "sidera-intro-hint-v1"
const CONSOLE_ROWS = 12
const POLL_INTERVAL_MS = 5000

const TIME_ACCENTS = [
  { color: "#ffffff", glow: "rgba(255, 255, 255, 0.25)" },
  { color: "#69b7ff", glow: "rgba(105, 183, 255, 0.28)" },
  { color: "#ff6b80", glow: "rgba(255, 107, 128, 0.28)" },
  { color: "#58ffab", glow: "rgba(88, 255, 171, 0.28)" },
  { color: "#ffe56d", glow: "rgba(255, 229, 109, 0.28)" },
  { color: "#c083ff", glow: "rgba(192, 131, 255, 0.28)" },
  { color: "#ffb866", glow: "rgba(255, 184, 102, 0.28)" }
]

const AMBIENT_COLORS = [
  "rgba(255, 255, 255, __ALPHA__)",
  "rgba(255, 91, 112, __ALPHA__)",
  "rgba(88, 255, 170, __ALPHA__)",
  "rgba(94, 167, 255, __ALPHA__)",
  "rgba(255, 224, 91, __ALPHA__)",
  "rgba(191, 122, 255, __ALPHA__)",
  "rgba(255, 123, 220, __ALPHA__)"
]

const state = {
  signals: [],
  particles: [],
  receiptTimeout: null,
  consoleFilter: "",
  pendingDestination: null,
  consoleOpen: true,
  cleanMode: false,
  soundEnabled: true,
  audioContext: null,
  introHintVisible: false,
  introHintTimeout: null,
  latestTimestamp: 0,
  pollTimer: null,
  isSubmitting: false
}

const elements = {
  body: document.body,
  topbar: document.querySelector(".topbar"),
  sideStack: document.querySelector(".side-stack"),
  consolePanel: document.querySelector(".console-panel"),
  emptyHint: document.getElementById("empty-hint"),
  starfield: document.getElementById("starfield"),
  signalCount: document.getElementById("signal-count"),
  sectorCount: document.getElementById("sector-count"),
  consoleFeed: document.getElementById("console-feed"),
  consoleTemplate: document.getElementById("console-row-template"),
  consoleState: document.querySelector(".console-state"),
  consoleSearchStatus: document.getElementById("console-search-status"),
  timeSearch: document.getElementById("time-search"),
  timeSearchButton: document.getElementById("time-search-button"),
  timeSearchReset: document.getElementById("time-search-reset"),
  toggleClean: document.getElementById("toggle-clean"),
  toggleSound: document.getElementById("toggle-sound"),
  toggleConsole: document.getElementById("toggle-console"),
  focusLatest: document.getElementById("focus-latest"),
  randomSignal: document.getElementById("random-signal"),
  composeDialog: document.getElementById("compose-dialog"),
  composeForm: document.getElementById("compose-form"),
  openCompose: document.getElementById("open-compose"),
  closeCompose: document.querySelectorAll("[data-close-compose]"),
  messageInput: document.getElementById("message-input"),
  messageLength: document.getElementById("message-length"),
  destinationPreview: document.getElementById("destination-preview"),
  composeStatus: document.getElementById("compose-status"),
  composeSubmit: document.getElementById("compose-submit"),
  signalDialog: document.getElementById("signal-dialog"),
  closeSignal: document.querySelectorAll("[data-close-signal]"),
  signalDestination: document.getElementById("signal-destination"),
  signalDistance: document.getElementById("signal-distance"),
  signalTimestamp: document.getElementById("signal-timestamp"),
  signalText: document.getElementById("signal-text"),
  receiptCard: document.getElementById("receipt-card"),
  nebula: document.getElementById("nebula")
}

void init()

async function init() {
  loadPrefs()
  applyUiState()
  bindEvents()
  initNebula()
  showIntroHintIfNeeded()

  const [messagesResult, destinationResult] = await Promise.allSettled([
    bootstrapSignals(),
    prepareDestinationPreview()
  ])

  if (messagesResult.status === "rejected") {
    elements.consoleSearchStatus.textContent = buildBackendHelpMessage(messagesResult.reason)
  }

  if (destinationResult.status === "rejected") {
    setComposeStatus(buildBackendHelpMessage(destinationResult.reason), "error")
  }
}

async function bootstrapSignals() {
  const payload = await fetchJson("/api/messages")
  state.signals = payload.messages.map(normalizeSignal).sort(sortSignalsForField)
  state.latestTimestamp = state.signals.at(-1)?.createdAt ?? 0
  renderAllSignals()
  renderConsole()
  updateHud()
  updateParallax()
  startPolling()
}

function startPolling() {
  if (state.pollTimer) {
    window.clearInterval(state.pollTimer)
  }

  state.pollTimer = window.setInterval(async () => {
    try {
      const newSignals = await fetchMessagesAfter(state.latestTimestamp)

      if (!newSignals.length) {
        return
      }

      newSignals.forEach((signal) => {
        insertSignal(signal, { fromPoll: true })
      })
    } catch {
      elements.consoleSearchStatus.textContent = "Polling paused. Connection lost."
    }
  }, POLL_INTERVAL_MS)
}

function loadPrefs() {
  const storedPrefs = window.localStorage.getItem(PREFS_KEY)

  if (!storedPrefs) {
    return
  }

  try {
    const parsedPrefs = JSON.parse(storedPrefs)
    state.soundEnabled = parsedPrefs.soundEnabled ?? true
    state.cleanMode = parsedPrefs.cleanMode ?? false
  } catch {
    state.soundEnabled = true
    state.cleanMode = false
  }
}

function persistPrefs() {
  window.localStorage.setItem(
    PREFS_KEY,
    JSON.stringify({
      soundEnabled: state.soundEnabled,
      cleanMode: state.cleanMode
    })
  )
}

function applyUiState() {
  elements.body.classList.toggle("clean-mode", state.cleanMode)
  elements.body.classList.toggle("console-collapsed", !state.consoleOpen)

  elements.consoleState.textContent = state.cleanMode || !state.consoleOpen ? "HIDDEN" : "OPEN FEED"
  elements.toggleConsole.classList.toggle("is-active", state.consoleOpen && !state.cleanMode)
  elements.toggleClean.classList.toggle("is-active", state.cleanMode)
  elements.toggleSound.classList.toggle("is-active", state.soundEnabled)

  elements.toggleConsole.setAttribute("aria-label", state.consoleOpen ? "Hide console" : "Show console")
  elements.toggleConsole.setAttribute("title", state.consoleOpen ? "Hide console" : "Show console")
  elements.toggleClean.setAttribute("aria-label", state.cleanMode ? "Exit clean mode" : "Enter clean mode")
  elements.toggleClean.setAttribute("title", state.cleanMode ? "Exit clean mode" : "Enter clean mode")
  elements.toggleSound.setAttribute("aria-label", state.soundEnabled ? "Mute sound" : "Enable sound")
  elements.toggleSound.setAttribute("title", state.soundEnabled ? "Mute sound" : "Enable sound")
  applyActionAvailability()
}

function bindEvents() {
  elements.openCompose.addEventListener("click", () => {
    dismissIntroHint()
    openDialog(elements.composeDialog)
    elements.messageInput.focus()
    setComposeStatus("")
    void prepareDestinationPreview().catch((error) => {
      setComposeStatus(buildBackendHelpMessage(error), "error")
    })
  })

  elements.closeCompose.forEach((button) => {
    button.addEventListener("click", () => closeDialog(elements.composeDialog))
  })

  elements.closeSignal.forEach((button) => {
    button.addEventListener("click", () => closeDialog(elements.signalDialog))
  })

  ;[elements.composeDialog, elements.signalDialog].forEach((dialog) => {
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault()
      closeDialog(dialog)
    })

    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) {
        closeDialog(dialog)
      }
    })
  })

  elements.messageInput.addEventListener("input", () => {
    elements.messageLength.textContent = `${elements.messageInput.value.length} / 280`
  })

  elements.composeForm.addEventListener("submit", handleComposeSubmit)
  elements.toggleConsole.addEventListener("click", toggleConsole)
  elements.toggleClean.addEventListener("click", toggleCleanMode)
  elements.toggleSound.addEventListener("click", toggleSound)
  elements.focusLatest.addEventListener("click", focusLatestSignal)
  elements.randomSignal.addEventListener("click", openRandomSignal)
  elements.timeSearchButton.addEventListener("click", applyConsoleSearch)
  elements.timeSearchReset.addEventListener("click", resetConsoleSearch)
  elements.timeSearch.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault()
      applyConsoleSearch()
    }
  })

  window.addEventListener(
    "scroll",
    () => {
      updateHud()
      updateParallax()
      dismissIntroHint()
    },
    { passive: true }
  )

  window.addEventListener("pointerdown", dismissIntroHint, { passive: true })

  window.addEventListener("resize", () => {
    renderAllSignals()
    updateHud()
    updateParallax()
    initNebula()
  })
}

async function handleComposeSubmit(event) {
  event.preventDefault()

  if (state.isSubmitting) {
    return
  }

  const message = elements.messageInput.value.trim()

  if (!message) {
    return
  }

  dismissIntroHint()
  state.isSubmitting = true
  setComposeSubmitting(true)
  setComposeStatus("Launching signal...", "neutral")

  try {
    const payload = await fetchJson("/api/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message,
        destination: state.pendingDestination
      })
    })

    const signal = normalizeSignal(payload.message)
    insertSignal(signal, { fromSelf: true })
    closeDialog(elements.composeDialog)
    elements.composeForm.reset()
    elements.messageLength.textContent = "0 / 280"
    setComposeStatus("")
    await prepareDestinationPreview().catch(() => null)
    playTone("send")
  } catch (error) {
    const message = buildBackendHelpMessage(error)
    elements.consoleSearchStatus.textContent = "Could not send signal."
    setComposeStatus(message, "error")
  } finally {
    state.isSubmitting = false
    setComposeSubmitting(false)
  }
}

function insertSignal(signal, options = {}) {
  if (state.signals.some((entry) => entry.id === signal.id)) {
    return
  }

  state.signals.push(signal)
  state.signals.sort(sortSignalsForField)
  state.latestTimestamp = Math.max(state.latestTimestamp, signal.createdAt)
  appendSignal(signal)
  syncUniverseHeight()
  updateHud()

  if (state.consoleFilter) {
    renderConsole()
  } else {
    queueConsoleSignal(signal)
  }

  if (options.fromSelf) {
    window.setTimeout(() => {
      animateSignalLaunch(signal.id)
      showReceipt(signal)
    }, 80)
    return
  }

  if (options.fromPoll) {
    emphasizeStarById(signal.id)
  }
}

function renderAllSignals() {
  elements.starfield.textContent = ""
  syncUniverseHeight()

  state.signals.forEach((signal) => {
    appendSignal(signal)
  })
}

function appendSignal(signal) {
  const star = document.createElement("button")
  star.type = "button"
  star.className = "star"
  star.dataset.id = signal.id
  star.style.left = `${(signal.xRatio * 100).toFixed(2)}%`
  star.style.top = `${computeSignalTop(signal)}px`
  star.style.setProperty("--size", `${signal.size}px`)
  star.style.setProperty("--core", signal.core)
  star.style.setProperty("--glow", signal.glow)
  star.style.setProperty("--halo", signal.halo)
  star.title = `Signal for ${signal.destination}`
  star.setAttribute("aria-label", `Open message for ${signal.destination}`)
  star.addEventListener("click", () => {
    dismissIntroHint()
    openSignal(signal.id)
  })

  elements.starfield.append(star)
}

function syncUniverseHeight() {
  const maxSector = state.signals.reduce(
    (highestSector, signal) => Math.max(highestSector, signal.sectorIndex),
    0
  )
  const sectorHeight = getSectorHeight()
  const targetHeight = Math.max(window.innerHeight + 1200, (maxSector + 1) * sectorHeight + 420)
  elements.starfield.style.height = `${targetHeight}px`
}

function renderConsole() {
  elements.consoleFeed.textContent = ""

  if (state.consoleFilter) {
    renderConsoleSearchResults()
    return
  }

  const latestSignals = [...state.signals]
    .sort((left, right) => left.createdAt - right.createdAt)
    .slice(-CONSOLE_ROWS)

  latestSignals.forEach((signal) => {
    elements.consoleFeed.append(buildConsoleRow(signal))
  })

  applyConsoleRowStrengths()
  elements.consoleFeed.scrollTop = elements.consoleFeed.scrollHeight
  elements.consoleSearchStatus.textContent = latestSignals.length
    ? "Showing latest signals."
    : "Waiting for the first signal."
}

function renderConsoleSearchResults() {
  const matches = [...state.signals]
    .sort((left, right) => left.createdAt - right.createdAt)
    .filter((signal) => formatConsoleTime(signal.createdAt) === state.consoleFilter)

  matches.forEach((signal) => {
    elements.consoleFeed.append(buildConsoleRow(signal))
  })

  applyConsoleRowStrengths()
  elements.consoleFeed.scrollTop = elements.consoleFeed.scrollHeight

  if (!matches.length) {
    elements.consoleSearchStatus.textContent = `No signals found for ${state.consoleFilter}.`
    return
  }

  elements.consoleSearchStatus.textContent = `${matches.length} signal(s) found for ${state.consoleFilter}.`
}

function buildConsoleRow(signal, options = {}) {
  const fragment = elements.consoleTemplate.content.cloneNode(true)
  const row = fragment.querySelector(".console-row")
  const timeAccent = pickTimeAccent(signal.id)

  row.style.setProperty("--time-color", timeAccent.color)
  row.style.setProperty("--time-glow", timeAccent.glow)
  row.style.setProperty("--row-glow", signal.glow)
  fragment.querySelector(".console-time").textContent = formatConsoleTime(signal.createdAt)
  fragment.querySelector(".console-message").textContent = truncate(signal.message, 88)

  if (options.entering) {
    row.classList.add("is-entering")
  }

  return fragment
}

function queueConsoleSignal(signal) {
  const row = buildConsoleRow(signal, { entering: true })
  elements.consoleFeed.append(row)

  const rows = [...elements.consoleFeed.children]
  const overflow = rows.length - CONSOLE_ROWS

  if (overflow > 0) {
    rows.slice(0, overflow).forEach((element) => {
      element.classList.add("is-exiting")

      window.setTimeout(() => {
        element.remove()
        applyConsoleRowStrengths()
      }, 280)
    })
  }

  applyConsoleRowStrengths()
  elements.consoleFeed.scrollTop = elements.consoleFeed.scrollHeight
  elements.consoleSearchStatus.textContent = "Live feed updated."
}

function applyConsoleRowStrengths() {
  const rows = [...elements.consoleFeed.children]

  rows.forEach((row, index) => {
    const strength =
      rows.length === 1 ? 1 : 0.3 + (index / Math.max(1, rows.length - 1)) * 0.7

    row.style.setProperty("--row-opacity", strength.toFixed(3))
  })
}

function showReceipt(signal) {
  if (state.receiptTimeout) {
    window.clearTimeout(state.receiptTimeout)
  }

  elements.receiptCard.innerHTML = `
    <p class="panel-label">TRANSMISSION ACCEPTED</p>
    <h3>Signal received</h3>
    <p>Destination: ${signal.destination}</p>
    <p>Distance: ${formatDistance(signal.distance)} light years. No answer expected.</p>
  `

  elements.receiptCard.classList.remove("hidden")
  window.requestAnimationFrame(() => {
    elements.receiptCard.classList.add("is-visible")
  })

  state.receiptTimeout = window.setTimeout(() => {
    hideReceipt()
  }, 5200)
}

function hideReceipt() {
  elements.receiptCard.classList.remove("is-visible")

  window.setTimeout(() => {
    elements.receiptCard.classList.add("hidden")
  }, 260)
}

function openSignal(signalId) {
  const signal = state.signals.find((entry) => entry.id === signalId)

  if (!signal) {
    return
  }

  elements.signalDestination.textContent = signal.destination
  elements.signalDistance.textContent = `${formatDistance(signal.distance)} light years`
  elements.signalTimestamp.textContent = formatReadableTime(signal.createdAt)
  elements.signalText.textContent = signal.message
  playTone("open")
  openDialog(elements.signalDialog)
}

function openRandomSignal() {
  if (!state.signals.length) {
    elements.consoleSearchStatus.textContent = "No signals yet. Launch the first one."
    return
  }

  dismissIntroHint()
  focusSignalById(randomFrom(state.signals).id, { openAfter: true })
}

function focusLatestSignal() {
  if (!state.signals.length) {
    elements.consoleSearchStatus.textContent = "No signals yet. Launch the first one."
    return
  }

  dismissIntroHint()
  const latestSignal = [...state.signals].sort((left, right) => right.createdAt - left.createdAt)[0]
  focusSignalById(latestSignal.id)
}

function focusSignalById(signalId, options = {}) {
  const star = elements.starfield.querySelector(`[data-id="${signalId}"]`)

  if (!star) {
    return
  }

  const maxScroll = Math.max(0, document.body.scrollHeight - window.innerHeight)
  const targetY = clamp(star.offsetTop - window.innerHeight * 0.42, 0, maxScroll)

  window.scrollTo({
    top: targetY,
    behavior: "auto"
  })

    emphasizeStar(star)

  if (options.openAfter) {
    window.setTimeout(() => openSignal(signalId), 110)
  }
}

function emphasizeStar(star) {
  star.classList.remove("is-emphasized")
  void star.offsetWidth
  star.classList.add("is-emphasized")

  window.setTimeout(() => {
    star.classList.remove("is-emphasized")
  }, 1800)
}

function emphasizeStarById(signalId) {
  const star = elements.starfield.querySelector(`[data-id="${signalId}"]`)
  if (star) {
    emphasizeStar(star)
  }
}

function toggleConsole() {
  state.consoleOpen = !state.consoleOpen
  applyUiState()
}

function toggleCleanMode() {
  state.cleanMode = !state.cleanMode
  applyUiState()
  persistPrefs()
}

function toggleSound() {
  state.soundEnabled = !state.soundEnabled
  applyUiState()
  persistPrefs()

  if (state.soundEnabled) {
    playTone("toggle")
  }
}

function applyConsoleSearch() {
  state.consoleFilter = extractTimeQuery(elements.timeSearch.value.trim())
  elements.timeSearch.value = state.consoleFilter || elements.timeSearch.value.trim()
  renderConsole()

  if (!state.consoleFilter) {
    return
  }

  const firstMatch = [...state.signals]
    .sort((left, right) => left.createdAt - right.createdAt)
    .find((signal) => formatConsoleTime(signal.createdAt) === state.consoleFilter)

  if (firstMatch) {
    focusSignalById(firstMatch.id)
  }
}

function resetConsoleSearch() {
  elements.timeSearch.value = ""
  state.consoleFilter = ""
  renderConsole()
}

async function prepareDestinationPreview() {
  try {
    elements.destinationPreview.textContent = "Assigning destination..."
    const payload = await fetchJson("/api/destination-preview")
    state.pendingDestination = payload.destination
    elements.destinationPreview.textContent =
      `${payload.destination.name} · ${formatDistance(payload.destination.distance)} light years`
    return payload.destination
  } catch {
    state.pendingDestination = null
    elements.destinationPreview.textContent = "Destination unavailable."
    throw new Error("Destination preview unavailable.")
  }
}

function setComposeStatus(message, tone = "neutral") {
  elements.composeStatus.textContent = message

  if (tone === "neutral") {
    elements.composeStatus.removeAttribute("data-tone")
    return
  }

  elements.composeStatus.dataset.tone = tone
}

function setComposeSubmitting(isSubmitting) {
  elements.composeSubmit.disabled = isSubmitting
  elements.composeSubmit.textContent = isSubmitting ? "Launching..." : "Launch signal"
}

function updateHud() {
  elements.signalCount.textContent = String(state.signals.length)
  elements.sectorCount.textContent = String(Math.max(1, Math.floor(window.scrollY / getSectorHeight()) + 1)).padStart(
    2,
    "0"
  )
  applyActionAvailability()
}

function applyActionAvailability() {
  const hasSignals = state.signals.length > 0

  elements.focusLatest.disabled = !hasSignals
  elements.randomSignal.disabled = !hasSignals

  elements.focusLatest.setAttribute(
    "aria-label",
    hasSignals ? "Jump to latest signal" : "Latest signal unavailable"
  )
  elements.focusLatest.setAttribute(
    "title",
    hasSignals ? "Jump to latest signal" : "Latest signal unavailable"
  )

  elements.randomSignal.setAttribute(
    "aria-label",
    hasSignals ? "Open random signal" : "Random signal unavailable"
  )
  elements.randomSignal.setAttribute(
    "title",
    hasSignals ? "Open random signal" : "Random signal unavailable"
  )
}

function updateParallax() {
  const drift = (window.scrollY * 0.12).toFixed(2)
  elements.body.style.setProperty("--scroll-drift", `${drift}px`)
}

function formatConsoleTime(timestamp) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(timestamp)
}

function formatReadableTime(timestamp) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(timestamp)
}

function formatDistance(distance) {
  return distance < 100 ? Number(distance).toFixed(1) : Math.round(distance).toLocaleString("en-US")
}

function truncate(text, maxLength) {
  if (text.length <= maxLength) {
    return text
  }

  return `${text.slice(0, maxLength - 1)}...`
}

function extractTimeQuery(value) {
  const match = value.match(/\b\d{1,2}:\d{2}\b/)
  return match?.[0] ?? ""
}

function normalizeSignal(signal) {
  return {
    ...signal,
    distance: Number(signal.distance),
    sectorIndex: Number(signal.sectorIndex),
    slotIndex: Number(signal.slotIndex),
    xRatio: Number(signal.xRatio),
    yRatio: Number(signal.yRatio),
    size: Number(signal.size),
    createdAt: Number(signal.createdAt)
  }
}

function sortSignalsForField(left, right) {
  if (left.sectorIndex !== right.sectorIndex) {
    return left.sectorIndex - right.sectorIndex
  }

  if (left.slotIndex !== right.slotIndex) {
    return left.slotIndex - right.slotIndex
  }

  return left.createdAt - right.createdAt
}

function getSectorHeight() {
  return Math.max(window.innerHeight, 720)
}

function computeSignalTop(signal) {
  const sectorHeight = getSectorHeight()
  const verticalPadding = Math.min(110, sectorHeight * 0.11)
  return Math.round(
    signal.sectorIndex * sectorHeight +
      verticalPadding +
      signal.yRatio * (sectorHeight - verticalPadding * 2)
  )
}

function initNebula() {
  const canvas = elements.nebula
  const context = canvas.getContext("2d")

  if (!context) {
    return
  }

  const devicePixelRatio = window.devicePixelRatio || 1
  const width = window.innerWidth
  const height = window.innerHeight

  canvas.width = width * devicePixelRatio
  canvas.height = height * devicePixelRatio
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
  context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)

  if (!state.particles.length || state.particles.length !== 440) {
    state.particles = Array.from({ length: 440 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: Math.random() * 1.8 + 0.16,
      drift: Math.random() * 0.22 + 0.03,
      phase: Math.random() * Math.PI * 2,
      alpha: Math.random() * 0.92 + 0.18,
      color: randomFrom(AMBIENT_COLORS)
    }))
  }

  if (canvas.dataset.animationFrame) {
    window.cancelAnimationFrame(Number(canvas.dataset.animationFrame))
  }

  const draw = (time) => {
    context.clearRect(0, 0, width, height)

    state.particles.forEach((particle) => {
      const pulse = (Math.sin(time * 0.0012 + particle.phase) + 1) / 2
      const parallaxY =
        (particle.y + window.scrollY * particle.drift * 0.14 + pulse * 7) % (height + 40) - 20

      context.beginPath()
      context.fillStyle = particle.color.replace(
        "__ALPHA__",
        String((0.1 + pulse * particle.alpha).toFixed(3))
      )
      context.arc(particle.x, parallaxY, particle.radius + pulse * 0.35, 0, Math.PI * 2)
      context.fill()
    })

    const animationFrame = window.requestAnimationFrame(draw)
    canvas.dataset.animationFrame = String(animationFrame)
  }

  const animationFrame = window.requestAnimationFrame(draw)
  canvas.dataset.animationFrame = String(animationFrame)
}

function showIntroHintIfNeeded() {
  if (window.sessionStorage.getItem(HINT_SESSION_KEY)) {
    return
  }

  state.introHintVisible = true
  elements.emptyHint.classList.add("is-visible")

  state.introHintTimeout = window.setTimeout(() => {
    dismissIntroHint()
  }, 5200)
}

function dismissIntroHint() {
  if (!state.introHintVisible) {
    return
  }

  state.introHintVisible = false
  window.sessionStorage.setItem(HINT_SESSION_KEY, "1")

  if (state.introHintTimeout) {
    window.clearTimeout(state.introHintTimeout)
  }

  elements.emptyHint.classList.remove("is-visible")
}

function openDialog(dialog) {
  if (dialog.open) {
    return
  }

  dialog.showModal()
  window.requestAnimationFrame(() => {
    dialog.classList.add("is-visible")
  })
}

function closeDialog(dialog) {
  if (!dialog.open) {
    return
  }

  dialog.classList.remove("is-visible")

  window.setTimeout(() => {
    if (dialog.open) {
      dialog.close()
    }
  }, 240)
}

function animateSignalLaunch(signalId) {
  const star = elements.starfield.querySelector(`[data-id="${signalId}"]`)

  if (!star) {
    return
  }

  const rect = star.getBoundingClientRect()
  const launchStar = document.createElement("span")
  launchStar.className = "launch-star"
  launchStar.style.setProperty("--size", getComputedStyle(star).getPropertyValue("--size"))
  launchStar.style.setProperty("--core", getComputedStyle(star).getPropertyValue("--core"))
  launchStar.style.setProperty("--glow", getComputedStyle(star).getPropertyValue("--glow"))
  launchStar.style.setProperty("--halo", getComputedStyle(star).getPropertyValue("--halo"))
  elements.body.append(launchStar)
  star.classList.add("is-launch-hidden")

  const animation = launchStar.animate(
    [
      {
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%) scale(0.12)",
        opacity: 0,
        filter: "blur(10px)"
      },
      {
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%) scale(1.25)",
        opacity: 1,
        filter: "blur(0px)",
        offset: 0.22
      },
      {
        left: `${rect.left + rect.width * 0.5}px`,
        top: `${rect.top + rect.height * 0.5}px`,
        transform: "translate(-50%, -50%) scale(0.7)",
        opacity: 0.94,
        filter: "blur(0px)"
      }
    ],
    {
      duration: 1200,
      easing: "cubic-bezier(0.16, 1, 0.3, 1)",
      fill: "forwards"
    }
  )

  animation.finished
    .catch(() => null)
    .finally(() => {
      launchStar.remove()
      star.classList.remove("is-launch-hidden")
      star.classList.add("star-born")
      emphasizeStar(star)

      window.setTimeout(() => {
        star.classList.remove("star-born")
      }, 1600)
    })
}

function ensureAudioContext() {
  if (!("AudioContext" in window || "webkitAudioContext" in window)) {
    return null
  }

  if (!state.audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    state.audioContext = new AudioContextClass()
  }

  if (state.audioContext.state === "suspended") {
    state.audioContext.resume()
  }

  return state.audioContext
}

function playTone(kind) {
  if (!state.soundEnabled) {
    return
  }

  const audioContext = ensureAudioContext()

  if (!audioContext) {
    return
  }

  const start = audioContext.currentTime + 0.01

  if (kind === "send") {
    scheduleTone(audioContext, { frequency: 248, start, duration: 0.12, gain: 0.018, type: "sine" })
    scheduleTone(audioContext, { frequency: 392, start: start + 0.11, duration: 0.18, gain: 0.016, type: "triangle" })
    return
  }

  if (kind === "open") {
    scheduleTone(audioContext, { frequency: 520, start, duration: 0.11, gain: 0.012, type: "sine" })
    return
  }

  if (kind === "toggle") {
    scheduleTone(audioContext, { frequency: 680, start, duration: 0.08, gain: 0.01, type: "triangle" })
  }
}

function scheduleTone(audioContext, options) {
  const oscillator = audioContext.createOscillator()
  const gainNode = audioContext.createGain()

  oscillator.type = options.type
  oscillator.frequency.setValueAtTime(options.frequency, options.start)
  gainNode.gain.setValueAtTime(0.0001, options.start)
  gainNode.gain.exponentialRampToValueAtTime(options.gain, options.start + 0.02)
  gainNode.gain.exponentialRampToValueAtTime(0.0001, options.start + options.duration)
  oscillator.connect(gainNode)
  gainNode.connect(audioContext.destination)
  oscillator.start(options.start)
  oscillator.stop(options.start + options.duration)
}

async function fetchMessagesAfter(after) {
  const payload = await fetchJson(`/api/messages?after=${after}`)
  return payload.messages.map(normalizeSignal)
}

async function fetchJson(url, options = {}) {
  const response = await window.fetch(url, options)
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(payload?.error || `Request failed: ${response.status}`)
  }

  return payload
}

function buildBackendHelpMessage(error) {
  const detail = error instanceof Error ? error.message : ""

  if (window.location.protocol === "file:") {
    return "Open the project through npm start. file:// cannot reach the Sidera API."
  }

  if (detail.includes("Failed to fetch") || detail.includes("Destination preview unavailable.")) {
    return "Backend unavailable here. Start the project with npm start and open http://127.0.0.1:4173."
  }

  return detail || "Could not reach the signal backend."
}

function pickTimeAccent(seed) {
  const index = Array.from(seed).reduce(
    (accumulator, character) => accumulator + character.charCodeAt(0),
    0
  )

  return TIME_ACCENTS[index % TIME_ACCENTS.length]
}

function randomBetween(min, max) {
  return Math.round(Math.random() * (max - min) + min)
}

function randomFrom(items) {
  return items[randomBetween(0, items.length - 1)]
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}
