const { ipcRenderer } = require('electron')

// ================= UI =================
const scrollText = document.getElementById('scrollText')
const textInput = document.getElementById('textInput')
const inputPanel = document.getElementById('inputPanel')
const speedDisplay = document.getElementById('speedDisplay')

const libraryPanel = document.getElementById('libraryPanel')
const scriptList = document.getElementById('scriptList')
const titleInput = document.getElementById('titleInput')
const saveBtn = document.getElementById('saveBtn')
const openLibraryBtn = document.getElementById('openLibraryBtn')
const searchInput = document.getElementById('searchInput')

// ================= CLEAR STATE =================
let lastClearedText = ""
let isCleared = false

// ================= STATE =================
let isPaused = true
let hasStarted = false

let speed = Number(localStorage.getItem("speed")) || 20
let activeSpeed = speed

let position = 0
let textHeight = 0
let libraryOpen = false
let editingIndex = null

// ================= CLEAR BUTTON =================
const clearBtn = document.createElement("button")
clearBtn.textContent = "Clear"

// ✅ SMALL INLINE BUTTON
clearBtn.style.fontSize = "9px"
clearBtn.style.padding = "2px 6px"
clearBtn.style.borderRadius = "4px"
clearBtn.style.border = "none"
clearBtn.style.background = "rgba(255,255,255,0.08)"
clearBtn.style.color = "#ccc"
clearBtn.style.cursor = "pointer"
clearBtn.style.marginLeft = "6px"

// 👉 attach beside help text
document.getElementById("help").appendChild(clearBtn)

clearBtn.onclick = () => {

  if (!isCleared) {
    lastClearedText = textInput.value

    textInput.value = ""
    scrollText.textContent = ""

    isCleared = true
    clearBtn.textContent = "Restore"

    // ⏱ auto revert after 10 sec
    clearTimeout(clearBtn._timer)
    clearBtn._timer = setTimeout(() => {
      isCleared = false
      clearBtn.textContent = "Clear"
    }, 10000)

  } else {
    textInput.value = lastClearedText
    textInput.dispatchEvent(new Event('input'))

    isCleared = false
    clearBtn.textContent = "Clear"

    clearTimeout(clearBtn._timer)
  }
}

  {
    textInput.value = lastClearedText
    textInput.dispatchEvent(new Event('input'))

    isCleared = false
    clearBtn.textContent = "Clear"
    
  }


// ================= CAMERA =================
let video = null
let stream = null
let canvas = document.createElement("canvas")
let ctx = canvas.getContext("2d")

let gestureEnabled = false
let lastFrame = null
let lastTrigger = 0

function startCamera() {
  video = document.createElement("video")
  video.style.display = "none"
  document.body.appendChild(video)

  navigator.mediaDevices.getUserMedia({ video: true })
    .then(s => {
      stream = s
      video.srcObject = stream
      video.play()
    })
    .catch(err => console.error(err))
}

function stopCamera() {
  if (stream) stream.getTracks().forEach(t => t.stop())
  if (video) video.remove()
  video = null
  lastFrame = null
}

// ================= STATUS =================
function showStatus(text) {
  speedDisplay.textContent = text
  speedDisplay.style.opacity = 1

  clearTimeout(speedDisplay._t)
  speedDisplay._t = setTimeout(() => {
    speedDisplay.style.opacity = 0
  }, 900)
}

// ================= GESTURE =================
function detectPalm() {

  if (!gestureEnabled || !video) {
    requestAnimationFrame(detectPalm)
    return
  }

  if (video.readyState !== 4) {
    requestAnimationFrame(detectPalm)
    return
  }

  canvas.width = video.videoWidth
  canvas.height = video.videoHeight

  ctx.drawImage(video, 0, 0)

  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height)

  let motion = 0

  const startX = canvas.width * 0.4
  const endX = canvas.width * 0.6
  const startY = canvas.height * 0.4
  const endY = canvas.height * 0.6

  if (lastFrame) {
    for (let y = startY; y < endY; y += 10) {
      for (let x = startX; x < endX; x += 10) {

        const i = (y * canvas.width + x) * 4
        const current = frame.data[i]
        const previous = lastFrame.data[i]

        if (Math.abs(current - previous) > 35) {
          motion++
        }
      }
    }

    if (motion > 25 && Date.now() - lastTrigger > 1500 && hasStarted) {
      isPaused = !isPaused
      showStatus(isPaused ? "Paused" : "Playing")
      lastTrigger = Date.now()
    }
  }

  lastFrame = frame
  requestAnimationFrame(detectPalm)
}

// ================= STORAGE =================
async function getScripts() {
  return await ipcRenderer.invoke('read-scripts')
}

async function saveScripts(data) {
  await ipcRenderer.invoke('write-scripts', data)
}

// ================= INPUT =================
textInput.addEventListener('input', async () => {
  const text = textInput.value.trim()
  const now = new Date().toLocaleString()

  if (hasStarted) {
    scrollText.textContent = text
    textHeight = scrollText.offsetHeight
  }

  let scripts = await getScripts()

  if (editingIndex !== null) {
    if (scripts[editingIndex]) {
      scripts[editingIndex].text = text
      scripts[editingIndex].date = now
      await saveScripts(scripts)
    }
    return
  }

  let draftIndex = scripts.findIndex(s => s.isDraft)

  if (!text) {
    if (draftIndex !== -1) {
      scripts.splice(draftIndex, 1)
      await saveScripts(scripts)
    }
    return
  }

  if (draftIndex !== -1) {
    scripts[draftIndex].text = text
    scripts[draftIndex].date = now
  } else {
    scripts.unshift({
      title: "Untitled Draft",
      text,
      date: now,
      isDraft: true
    })
  }

  await saveScripts(scripts)
})

// ================= TELEPROMPTER =================
function animate() {
  if (!isPaused && textHeight > 0) {

    // ✅ MUCH SLOWER + RANGE 1–50
    const realSpeed = 0.01 + (activeSpeed / 50) * 0.25

    position -= realSpeed
    scrollText.style.transform = `translateY(${position}px)`

    if (position < -textHeight) {
      position = window.innerHeight + 100
    }
  }

  requestAnimationFrame(animate)
}

function resetPosition() {
  // start fully below screen
  position = window.innerHeight + 100
  scrollText.style.transform = `translateY(${position}px)`
}

// ================= LIBRARY =================
function toggleLibrary() {
  libraryOpen = !libraryOpen

  inputPanel.style.display = libraryOpen ? "none" : "flex"
  libraryPanel.style.display = libraryOpen ? "flex" : "none"

  if (libraryOpen) loadLibrary()
}

openLibraryBtn.onclick = toggleLibrary
searchInput.oninput = loadLibrary

async function loadLibrary() {
  scriptList.innerHTML = ""

  const scripts = await getScripts()
  const query = searchInput.value.toLowerCase()

  scripts.forEach((s, i) => {
    if (!s.title.toLowerCase().includes(query)) return

    const div = document.createElement("div")
    div.className = "scriptItem"

    const title = document.createElement("div")
    title.innerHTML = `
      ${s.isDraft ? "📝 " : ""}${s.title}
      <div class="scriptDate">${s.date || ""}</div>
    `

    const del = document.createElement("span")
    del.textContent = "✕"

    title.onclick = () => {
      textInput.value = s.text
      titleInput.value = s.isDraft ? "" : s.title
      editingIndex = s.isDraft ? null : i

      scrollText.textContent = s.text
      textHeight = scrollText.offsetHeight
      resetPosition()

      toggleLibrary()
    }

    del.onclick = async (e) => {
      e.stopPropagation()
      let updated = await getScripts()
      updated.splice(i, 1)
      await saveScripts(updated)
      loadLibrary()
    }

    div.appendChild(title)
    div.appendChild(del)
    scriptList.appendChild(div)
  })
}

// ================= SAVE =================
saveBtn.onclick = async () => {
  const title = titleInput.value.trim() || "Untitled"
  const text = textInput.value.trim()
  if (!text) return

  let scripts = await getScripts()
  const now = new Date().toLocaleString()

  scripts = scripts.filter(s => !s.isDraft)

  if (editingIndex !== null && scripts[editingIndex]) {
    scripts[editingIndex] = { title, text, date: now }
  } else {
    scripts.unshift({ title, text, date: now })
  }

  editingIndex = null
  await saveScripts(scripts)
  loadLibrary()
}

// ================= AI =================
textInput.addEventListener('keydown', async (e) => {

  if (e.ctrlKey && e.key === 'Enter') {
    e.preventDefault()

    const prompt = textInput.value.trim()
    if (!prompt) return

    showStatus("Thinking...")

    try {
      const res = await fetch("http://127.0.0.1:11434/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "llama3",
          prompt: `Answer like Google. Short, direct.\n${prompt}`,
          stream: false
        })
      })

      const data = await res.json()

      if (!data || !data.response) {
        showStatus("No response")
        return
      }

      textInput.value = data.response.trim()
      textInput.dispatchEvent(new Event('input'))

      showStatus("Done")

    } catch (err) {
      console.error(err)
      showStatus("AI Error")
    }
  }
})

// ================= KEYBOARD =================
document.addEventListener('keydown', (e) => {

  if (e.code === 'Escape') {
    stopCamera()
    ipcRenderer.send('hide-window')
    return
  }

  if (hasStarted && e.key.toLowerCase() === 'g') {
    gestureEnabled = !gestureEnabled

    if (gestureEnabled) {
      startCamera()
      showStatus("Gesture ON")
    } else {
      stopCamera()
      showStatus("Gesture OFF")
    }
    return
  }

  if (libraryOpen && e.key === 'Enter') {
    e.preventDefault()
    toggleLibrary()
    return
  }

  if (e.key === 'Enter') {
    e.preventDefault()

    if (!hasStarted) {
      const text = textInput.value.trim()
      if (!text) return

      scrollText.textContent = text

      requestAnimationFrame(() => {
  requestAnimationFrame(() => {

    textHeight = scrollText.offsetHeight
    resetPosition()

    isPaused = false
    hasStarted = true

  })
})
      inputPanel.style.display = "none"
    } else {
      isPaused = true
      hasStarted = false
      inputPanel.style.display = "flex"
      scrollText.textContent = ""
    }
    return
  }

  if (!hasStarted) return

  if (e.code === 'Space') {
    e.preventDefault()
    isPaused = !isPaused
    showStatus(isPaused ? "Paused" : "Playing")
  }

  if (e.code === 'ArrowUp') {
    speed = Math.min(50, speed + 1)
    activeSpeed = speed
    localStorage.setItem("speed", speed)
    showSpeed()
  }

  if (e.code === 'ArrowDown') {
    speed = Math.max(1, speed - 1)
    activeSpeed = speed
    localStorage.setItem("speed", speed)
    showSpeed()
  }
})

// ================= SPEED =================
function showSpeed() {
  speedDisplay.textContent = `Speed: ${activeSpeed}%`
  speedDisplay.style.opacity = 1
  setTimeout(() => speedDisplay.style.opacity = 0, 800)
}

// ================= START =================
detectPalm()
animate()
