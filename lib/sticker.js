const fs = require('fs')
const path = require('path')
const { tmpdir } = require('os')
const { spawn } = require('child_process')
const Crypto = require('crypto')
const webp = require('node-webpmux')
const sharp = require('sharp')
function generateTmp(ext) {
  return path.join(tmpdir(), `${Crypto.randomBytes(6).toString('hex')}.${ext}`)
}

function runFfmpeg(input, output, args = []) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', ['-y', '-i', input, ...args, output])

    // capture stderr buat debug
    const stderr = []
    proc.stderr?.on('data', (d) => stderr.push(d))

    proc.on('error', reject)
    proc.on('close', async (code) => {
      if (code !== 0) {
        const errMsg = Buffer.concat(stderr).toString().slice(-500)
        return reject(new Error(`ffmpeg exited with ${code}\n${errMsg}`))
      }
      try {
        const buffer = await fs.promises.readFile(output)
        await fs.promises.unlink(input).catch(() => { })
        await fs.promises.unlink(output).catch(() => { })
        resolve(buffer)
      } catch (e) {
        reject(e)
      }
    })
  })
}

async function imageToWebp(media) {
  const tmpIn = generateTmp('png')
  const tmpOut = generateTmp('webp')
  await fs.promises.writeFile(tmpIn, media)
  return runFfmpeg(tmpIn, tmpOut, [
    '-vcodec', 'libwebp',
    '-preset', 'picture',
    '-lossless', '1',
    '-vf', "format=rgba,scale='min(320,iw)':'min(320,ih)':force_original_aspect_ratio=decrease,fps=15,pad=320:320:-1:-1:color=black@0.0"
  ])
}


async function animatedWebpToWebp(media) {
  const tmpGif = generateTmp('gif')
  const tmpOut = generateTmp('webp')

  await sharp(media, { animated: true }).gif().toFile(tmpGif)

  return runFfmpeg(tmpGif, tmpOut, [
    '-vcodec', 'libwebp',
    '-vf', "scale='min(320,iw)':'min(320,ih)':force_original_aspect_ratio=decrease,fps=15,pad=320:320:-1:-1:color=white@0.0",
    '-loop', '0',
    '-preset', 'default',
    '-an',
    '-vsync', '0',
  ])
}

async function videoToWebp(media) {
  const header = media.slice(0, 12).toString('hex')
  const isWebp = header.startsWith('52494646')

  if (isWebp) return animatedWebpToWebp(media)

  const isWebm = header.startsWith('1a45dfa3')
  const ext    = isWebm ? 'webm' : 'mp4'
  const tmpIn  = generateTmp(ext)
  const tmpOut = generateTmp('webp')
  await fs.promises.writeFile(tmpIn, media)

  return runFfmpeg(tmpIn, tmpOut, [
    '-vcodec', 'libwebp',
    '-vf', "scale='min(320,iw)':'min(320,ih)':force_original_aspect_ratio=decrease,fps=15,pad=320:320:-1:-1:color=white@0.0",
    '-loop', '0',
    '-ss', '00:00:00',
    '-t', '00:00:05',
    '-preset', 'default',
    '-an',
    '-vsync', '0',
  ])
}

async function writeExifImg(media, metadata) {
  let wMedia = await imageToWebp(media)
  const tmpFileIn = path.join(tmpdir(), `${Crypto.randomBytes(6).readUIntLE(0, 6).toString(36)}.webp`)
  const tmpFileOut = path.join(tmpdir(), `${Crypto.randomBytes(6).readUIntLE(0, 6).toString(36)}.webp`)
  fs.writeFileSync(tmpFileIn, wMedia)

  if (metadata.packname || metadata.author) {
    const img = new webp.Image()
    const json = { "publisher_website": "https://satzzdev.xyz", "sticker-pack-id": `https://satzzdev.xyz`, "sticker-pack-name": metadata.packname, "sticker-pack-publisher": metadata.author, "emojis": metadata.categories ? metadata.categories : [""] }
    const exifAttr = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00])
    const jsonBuff = Buffer.from(JSON.stringify(json), "utf-8")
    const exif = Buffer.concat([exifAttr, jsonBuff])
    exif.writeUIntLE(jsonBuff.length, 14, 4)
    await img.load(tmpFileIn)
    fs.unlinkSync(tmpFileIn)
    img.exif = exif
    await img.save(tmpFileOut)
    return tmpFileOut
  }
}

async function writeExifVid(media, metadata) {
  let wMedia = await videoToWebp(media)
  const tmpFileIn = path.join(tmpdir(), `${Crypto.randomBytes(6).readUIntLE(0, 6).toString(36)}.webp`)
  const tmpFileOut = path.join(tmpdir(), `${Crypto.randomBytes(6).readUIntLE(0, 6).toString(36)}.webp`)
  fs.writeFileSync(tmpFileIn, wMedia)

  if (metadata.packname || metadata.author) {
    const img = new webp.Image()
    const json = { "publisher_website": "https://satzzdev.xyz", "sticker-pack-id": `https://satzzdev.xyz`, "sticker-pack-name": metadata.packname, "sticker-pack-publisher": metadata.author, "emojis": metadata.categories ? metadata.categories : [""] }
    const exifAttr = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00])
    const jsonBuff = Buffer.from(JSON.stringify(json), "utf-8")
    const exif = Buffer.concat([exifAttr, jsonBuff])
    exif.writeUIntLE(jsonBuff.length, 14, 4)
    await img.load(tmpFileIn)
    fs.unlinkSync(tmpFileIn)
    img.exif = exif
    await img.save(tmpFileOut)
    return tmpFileOut
  }
}

async function writeExif(media, metadata) {
  let wMedia = /webp/.test(media.mimetype) ? media.data : /image/.test(media.mimetype) ? await imageToWebp(media.data) : /video/.test(media.mimetype) ? await videoToWebp(media.data) : ""
  const tmpFileIn = path.join(tmpdir(), `${Crypto.randomBytes(6).readUIntLE(0, 6).toString(36)}.webp`)
  const tmpFileOut = path.join(tmpdir(), `${Crypto.randomBytes(6).readUIntLE(0, 6).toString(36)}.webp`)
  fs.writeFileSync(tmpFileIn, wMedia)

  if (metadata.packname || metadata.author) {
    const img = new webp.Image()
    const json = { "publisher_website": "https://satzzdev.xyz", "sticker-pack-id": `https://satzzdev.xyz`, "sticker-pack-name": metadata.packname, "sticker-pack-publisher": metadata.author, "emojis": metadata.categories ? metadata.categories : [""] }
    const exifAttr = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00])
    const jsonBuff = Buffer.from(JSON.stringify(json), "utf-8")
    const exif = Buffer.concat([exifAttr, jsonBuff])
    exif.writeUIntLE(jsonBuff.length, 14, 4)
    await img.load(tmpFileIn)
    fs.unlinkSync(tmpFileIn)
    img.exif = exif
    await img.save(tmpFileOut)
    return tmpFileOut
  }
}

module.exports = { imageToWebp, videoToWebp, writeExifImg, writeExifVid, writeExif }

let file = require.resolve(__filename);
fs.watchFile(file, () => {
  fs.unwatchFile(file);
  delete require.cache[file];
  require(file);
});
