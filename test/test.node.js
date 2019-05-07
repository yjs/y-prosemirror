const fs = require('fs')
const path = require('path')
const { JSDOM } = require('jsdom')

const documentContent = fs.readFileSync(path.join(__dirname, '../test.html'))
const { window } = new JSDOM(documentContent)

// @ts-ignore
global.window = window
// @ts-ignore
global.document = window.document
// @ts-ignore
global.innerHeight = 0
// @ts-ignore
document.getSelection = () => ({ })

require('../dist/test.js')
