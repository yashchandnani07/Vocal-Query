// import.js : the three choices on the import page.

const demoBtn = document.getElementById('demo-btn')
const uploadBtn = document.getElementById('upload-btn')
const existingBtn = document.getElementById('existing-btn')
const fileInput = document.getElementById('file-input')
const dropzone = document.getElementById('dropzone')
const fileName = document.getElementById('file-name')

let chosenFile = null

// POST to the server, return the parsed JSON, throw the server's message on failure
async function post(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Something went wrong.')
  return data
}

// Disable the button, show a loading label, then go to the workspace (or show the error)
async function work(button, errorId, loadingLabel, job) {
  const idleLabel = button.textContent
  const errorBox = document.getElementById(errorId)
  errorBox.textContent = ''
  button.disabled = true
  button.textContent = loadingLabel
  try {
    await job()
    window.location = '/app'
  } catch (err) {
    errorBox.textContent = err.message
    button.disabled = false
    button.textContent = idleLabel
  }
}

demoBtn.addEventListener('click', () => {
  work(demoBtn, 'demo-error', 'Loading...', () => post('/api/demo'))
})

uploadBtn.addEventListener('click', () => {
  work(uploadBtn, 'upload-error', 'Loading...', async () => {
    const text = await chosenFile.text() // read the file in the browser
    await post('/api/import', { sql: text })
  })
})

existingBtn.addEventListener('click', () => {
  window.location = '/app'
})

// Remember the picked file and enable the upload button
function chooseFile(file) {
  if (!file) return
  chosenFile = file
  fileName.textContent = file.name
  uploadBtn.disabled = false
  uploadBtn.className = 'btn btn-primary'
}

fileInput.addEventListener('change', () => chooseFile(fileInput.files[0]))

// Drag and drop onto the dashed box
dropzone.addEventListener('dragover', (e) => {
  e.preventDefault()
  dropzone.classList.add('dragging')
})
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragging'))
dropzone.addEventListener('drop', (e) => {
  e.preventDefault()
  dropzone.classList.remove('dragging')
  chooseFile(e.dataTransfer.files[0])
})
