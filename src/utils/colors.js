/**
 * Detects the type of color format specified in the given string
 * @param {string} color A Hex/RGB/RGBA/HSL/HSLA string
 * @returns {'HEX'|'RGB'|'HSL'}
 */
export const detectColorFormat = (color) => {
  if (color.startsWith('#')) {
    return 'HEX'
  } else if (color.startsWith('rgb')) {
    return 'RGB'
  } else if (color.startsWith('hsl')) {
    return 'HSL'
  }
}

/**
 * Sets the alpha channel of the given color to the specified value
 * @param {string} color rgb string
 * @param {number} alphaValue Number ranging from 0 to 1
 * @return {string} A new rgba string with the alpha channel set to the `alphaValue` parameter
 */
export const setRgbAlphaChannel = (color, alphaValue) => {
  const [r, g, b] = color.match(/\d+/g)
  return `rgba(${r}, ${g}, ${b}, ${alphaValue})`
}

/**
 * Sets the alpha channel of the given color to the specified value
 * @param {string} color hex string
 * @param {number} alphaValue Number ranging from 0 to 1
 * @return {string} A new Hex string with the alpha channel set to the `alphaValue` parameter
 */
export const setHexAlphaChannel = (color, alphaValue) => {
  // Remove any leading '#' from the hex color string
  color = color.replace(/^#/, '')

  // Check if the hex color has alpha channel
  if (color.length === 6) {
    // If alpha channel doesn't exist, add it
    color += Math.floor(alphaValue * 255).toString(16).padStart(2, '0')
  } else if (color.length === 8) {
    // If alpha channel exists, replace it with the new alpha value
    color = color.slice(0, 6) + Math.floor(alphaValue * 255).toString(16).padStart(2, '0')
  }

  return '#' + color
}

/**
 * Sets the alpha channel of the given color to the specified value
 * @param {string} color hsl string
 * @param {number} alphaValue Number ranging from 0 to 1
 * @return {string} A new hsla string with the alpha channel set to the `alphaValue` parameter
 */
export const setHslAlphaChannel = (color, alphaValue) => {
  // Extract components from the HSLA color string
  const match = color.match(/hsl[a]?\(\s*(\d+)\s*,\s*(\d+%)\s*,\s*(\d+%)\s*(?:,\s*([\d.]+)\s*)?\)/i)
  if (!match) {
    return null // Return null if the input string doesn't match HSLA format
  }

  const h = parseInt(match[1]) // Hue
  const s = parseInt(match[2]) // Saturation
  const l = parseInt(match[3]) // Lightness
  let a = match[4] ? parseFloat(match[4]) : 1 // Alpha, default to 1 if not provided

  // Update alpha channel with the new value
  a = alphaValue

  // Return the updated HSLA color string
  return `hsla(${h}, ${s}%, ${l}%, ${a})`
}

/**
 * Sets the Alpha value of Any type of given color string to the specified value
 * @param {string} color RGB/Hex/HSL color string
 * @param {*} alphaValue Color value in the same format with the alpha set to `alphaValue`
 */
export const setAlphaChannel = (color, alphaValue) => {
  const colorFormat = detectColorFormat(color)

  if (colorFormat === 'RGB') return setRgbAlphaChannel(color, alphaValue)
  if (colorFormat === 'HSL') return setHslAlphaChannel(color, alphaValue)
  if (colorFormat === 'HEX') return setHexAlphaChannel(color, alphaValue)
}
