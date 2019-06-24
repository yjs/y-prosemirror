// @ts-nocheck

const fs = require('fs')
const path = require('path')
const { JSDOM } = require('jsdom')

const documentContent = fs.readFileSync(path.join(__dirname, '../test.html'))
const { window } = new JSDOM(documentContent)

global.window = window
global.document = window.document
global.innerHeight = 0
document.getSelection = () => ({ })

document.createRange = () => ({
  setStart () {},
  setEnd () {},
  getClientRects () {
    return {
      left: 0,
      top: 0,
      right: 0,
      bottom: 0
    }
  },
  getBoundingClientRect () {
    return {
      left: 0,
      top: 0,
      right: 0,
      bottom: 0
    }
  }
})

require('../dist/test.js')
