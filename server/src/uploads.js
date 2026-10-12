"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const zlib = require("node:zlib");
const multer = require("multer");
const { HttpError } = require("./errors");

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 5000;
const MAX_IMAGE_PIXELS = 20_000_000;
const MAX_UPLOAD_PIXELS = 40_000_000;
const MAX_DECODED_BYTES = 80 * 1024 * 1024;
const MAX_UPLOAD_FILES = 5;
const MAX_UPLOAD_STORAGE_BYTES = 512 * 1024 * 1024;
const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;
const STORED_IMAGE_NAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp)$/i;
const STORED_UPLOAD_TEMP =
  /^\.[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp)\.uploading$/i;
let uploadWriteQueue = Promise.resolve();

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_IMAGE_BYTES,
    files: MAX_UPLOAD_FILES,
    fields: 4,
    parts: MAX_UPLOAD_FILES + 4,
    fieldNestingDepth: 0,
    fieldArrayIndexLimit: 0,
  },
}).array("images", MAX_UPLOAD_FILES);

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC32_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  return value >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngRowLayout(width, height, bitsPerPixel, interlace) {
  if (interlace === 0) {
    return [
      {
        rows: height,
        bytesPerRow: Math.ceil((width * bitsPerPixel) / 8),
      },
    ];
  }

  const passes = [
    [0, 0, 8, 8],
    [4, 0, 8, 8],
    [0, 4, 4, 8],
    [2, 0, 4, 4],
    [0, 2, 2, 4],
    [1, 0, 2, 2],
    [0, 1, 1, 2],
  ];
  return passes
    .map(([startX, startY, stepX, stepY]) => {
      const columns =
        width <= startX ? 0 : Math.ceil((width - startX) / stepX);
      const rows =
        height <= startY ? 0 : Math.ceil((height - startY) / stepY);
      return {
        rows,
        bytesPerRow: Math.ceil((columns * bitsPerPixel) / 8),
      };
    })
    .filter((pass) => pass.rows > 0 && pass.bytesPerRow > 0);
}

function parseAndSanitizePng(buffer) {
  if (buffer.length < 57 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new HttpError(415, "INVALID_IMAGE", "La estructura del archivo PNG no es válida.");
  }

  const output = [buffer.subarray(0, 8)];
  const idatPayloads = [];
  const safeAncillaryChunks = new Set([
    "cHRM",
    "gAMA",
    "sBIT",
    "sRGB",
    "bKGD",
    "tRNS",
  ]);
  const knownCriticalChunks = new Set(["IHDR", "PLTE", "IDAT", "IEND"]);
  let offset = 8;
  let chunkIndex = 0;
  let width;
  let height;
  let bitDepth;
  let colorType;
  let interlace;
  let sawIdat = false;
  let finishedIdat = false;
  let sawIend = false;
  let sawPalette = false;

  while (offset + 12 <= buffer.length) {
    const payloadLength = buffer.readUInt32BE(offset);
    const chunkEnd = offset + 12 + payloadLength;
    if (chunkEnd > buffer.length) {
      throw new HttpError(415, "INVALID_IMAGE", "El archivo PNG está incompleto.");
    }
    const chunkType = buffer.toString("ascii", offset + 4, offset + 8);
    if (!/^[A-Za-z]{4}$/.test(chunkType)) {
      throw new HttpError(415, "INVALID_IMAGE", "El archivo PNG contiene un bloque no válido.");
    }
    const expectedCrc = buffer.readUInt32BE(offset + 8 + payloadLength);
    const actualCrc = crc32(
      buffer.subarray(offset + 4, offset + 8 + payloadLength),
    );
    if (expectedCrc !== actualCrc) {
      throw new HttpError(415, "INVALID_IMAGE", "El archivo PNG no superó la verificación de integridad.");
    }

    if (chunkIndex === 0) {
      if (chunkType !== "IHDR" || payloadLength !== 13) {
        throw new HttpError(415, "INVALID_IMAGE", "El encabezado PNG no es válido.");
      }
      width = buffer.readUInt32BE(offset + 8);
      height = buffer.readUInt32BE(offset + 12);
      bitDepth = buffer[offset + 16];
      colorType = buffer[offset + 17];
      const compression = buffer[offset + 18];
      const filtering = buffer[offset + 19];
      interlace = buffer[offset + 20];
      const validDepths = {
        0: new Set([1, 2, 4, 8, 16]),
        2: new Set([8, 16]),
        3: new Set([1, 2, 4, 8]),
        4: new Set([8, 16]),
        6: new Set([8, 16]),
      };
      if (
        !validDepths[colorType] ||
        !validDepths[colorType].has(bitDepth) ||
        compression !== 0 ||
        filtering !== 0 ||
        ![0, 1].includes(interlace)
      ) {
        throw new HttpError(415, "INVALID_IMAGE", "El encabezado PNG no es compatible.");
      }
      output.push(buffer.subarray(offset, chunkEnd));
    } else if (chunkType === "IHDR") {
      throw new HttpError(415, "INVALID_IMAGE", "El archivo PNG contiene más de un encabezado.");
    } else if (chunkType === "PLTE") {
      if (sawIdat || sawPalette || payloadLength === 0 || payloadLength % 3 !== 0) {
        throw new HttpError(415, "INVALID_IMAGE", "La paleta PNG no es válida.");
      }
      sawPalette = true;
      output.push(buffer.subarray(offset, chunkEnd));
    } else if (chunkType === "IDAT") {
      if (finishedIdat || payloadLength === 0) {
        throw new HttpError(415, "INVALID_IMAGE", "Los datos PNG no son válidos.");
      }
      sawIdat = true;
      idatPayloads.push(buffer.subarray(offset + 8, offset + 8 + payloadLength));
      output.push(buffer.subarray(offset, chunkEnd));
    } else if (chunkType === "IEND") {
      if (!sawIdat || payloadLength !== 0) {
        throw new HttpError(415, "INVALID_IMAGE", "El cierre PNG no es válido.");
      }
      output.push(buffer.subarray(offset, chunkEnd));
      offset = chunkEnd;
      sawIend = true;
      break;
    } else {
      if (sawIdat) finishedIdat = true;
      const isCritical = chunkType[0] === chunkType[0].toUpperCase();
      if (isCritical && !knownCriticalChunks.has(chunkType)) {
        throw new HttpError(415, "INVALID_IMAGE", "El PNG usa un bloque crítico desconocido.");
      }
      if (chunkType === "acTL" || chunkType === "fcTL" || chunkType === "fdAT") {
        throw new HttpError(415, "ANIMATED_IMAGE", "Las imágenes animadas no están permitidas.");
      }
      if (safeAncillaryChunks.has(chunkType)) {
        output.push(buffer.subarray(offset, chunkEnd));
      }
    }

    offset = chunkEnd;
    chunkIndex += 1;
  }

  if (
    !sawIend ||
    offset !== buffer.length ||
    !width ||
    !height ||
    (colorType === 3 && !sawPalette)
  ) {
    throw new HttpError(415, "INVALID_IMAGE", "La estructura del archivo PNG no es válida.");
  }

  const samplesByColorType = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
  const bitsPerPixel = samplesByColorType[colorType] * bitDepth;
  const rowLayout = pngRowLayout(width, height, bitsPerPixel, interlace);
  const expectedBytes = rowLayout.reduce(
    (sum, pass) => sum + pass.rows * (1 + pass.bytesPerRow),
    0,
  );
  if (expectedBytes > MAX_DECODED_BYTES) {
    throw new HttpError(
      400,
      "IMAGE_DECODE_SIZE",
      "La imagen requiere demasiada memoria al descomprimirse.",
    );
  }
  let inflated;
  try {
    inflated = zlib.inflateSync(Buffer.concat(idatPayloads), {
      maxOutputLength: expectedBytes,
    });
  } catch (error) {
    throw new HttpError(415, "INVALID_IMAGE", "No fue posible decodificar los datos PNG.");
  }
  if (inflated.length !== expectedBytes) {
    throw new HttpError(415, "INVALID_IMAGE", "Los datos PNG están incompletos.");
  }
  let rowOffset = 0;
  for (const pass of rowLayout) {
    for (let row = 0; row < pass.rows; row += 1) {
      if (inflated[rowOffset] > 4) {
        throw new HttpError(415, "INVALID_IMAGE", "El filtro interno del PNG no es válido.");
      }
      rowOffset += 1 + pass.bytesPerRow;
    }
  }

  return {
    buffer: Buffer.concat(output),
    width,
    height,
  };
}

function pngMetadata(buffer) {
  if (
    buffer.length < 33 ||
    !buffer.subarray(0, 8).equals(PNG_SIGNATURE) ||
    buffer.toString("ascii", 12, 16) !== "IHDR"
  ) {
    return null;
  }
  return {
    mime: "image/png",
    extension: "png",
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function jpegMetadata(buffer) {
  if (
    buffer.length < 16 ||
    buffer[0] !== 0xff ||
    buffer[1] !== 0xd8 ||
    buffer[buffer.length - 2] !== 0xff ||
    buffer[buffer.length - 1] !== 0xd9
  ) {
    return null;
  }

  const startOfFrameMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
    0xcf,
  ]);
  let offset = 2;
  while (offset + 4 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker >= 0xd0 && marker <= 0xd7) continue;
    if (offset + 2 > buffer.length) return null;

    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) return null;
    if (startOfFrameMarkers.has(marker)) {
      if (segmentLength < 7) return null;
      return {
        mime: "image/jpeg",
        extension: "jpg",
        width: buffer.readUInt16BE(offset + 5),
        height: buffer.readUInt16BE(offset + 3),
      };
    }
    offset += segmentLength;
  }
  return null;
}

function webpMetadata(buffer) {
  if (
    buffer.length < 30 ||
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WEBP" ||
    buffer.readUInt32LE(4) + 8 !== buffer.length
  ) {
    return null;
  }

  const chunk = buffer.toString("ascii", 12, 16);
  if (chunk === "VP8X") {
    return {
      mime: "image/webp",
      extension: "webp",
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3),
    };
  }
  if (chunk === "VP8L" && buffer[20] === 0x2f) {
    const b1 = buffer[21];
    const b2 = buffer[22];
    const b3 = buffer[23];
    const b4 = buffer[24];
    return {
      mime: "image/webp",
      extension: "webp",
      width: 1 + (((b2 & 0x3f) << 8) | b1),
      height: 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | (b2 >> 6)),
    };
  }
  if (
    chunk === "VP8 " &&
    buffer[23] === 0x9d &&
    buffer[24] === 0x01 &&
    buffer[25] === 0x2a
  ) {
    return {
      mime: "image/webp",
      extension: "webp",
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }
  return null;
}

function readExifOrientation(payload) {
  if (
    payload.length < 14 ||
    payload.toString("ascii", 0, 6) !== "Exif\u0000\u0000"
  ) {
    return null;
  }
  const tiffOffset = 6;
  const byteOrder = payload.toString("ascii", tiffOffset, tiffOffset + 2);
  const littleEndian = byteOrder === "II";
  if (!littleEndian && byteOrder !== "MM") return null;

  const read16 = (offset) =>
    littleEndian ? payload.readUInt16LE(offset) : payload.readUInt16BE(offset);
  const read32 = (offset) =>
    littleEndian ? payload.readUInt32LE(offset) : payload.readUInt32BE(offset);
  try {
    if (read16(tiffOffset + 2) !== 42) return null;
    const directoryOffset = tiffOffset + read32(tiffOffset + 4);
    if (directoryOffset + 2 > payload.length) return null;
    const entries = read16(directoryOffset);
    if (entries > 512 || directoryOffset + 2 + entries * 12 > payload.length) {
      return null;
    }
    for (let index = 0; index < entries; index += 1) {
      const entryOffset = directoryOffset + 2 + index * 12;
      const tag = read16(entryOffset);
      const type = read16(entryOffset + 2);
      const count = read32(entryOffset + 4);
      if (tag === 0x0112 && type === 3 && count === 1) {
        const orientation = read16(entryOffset + 8);
        return orientation >= 1 && orientation <= 8 ? orientation : null;
      }
    }
  } catch (error) {
    return null;
  }
  return null;
}

function stripJpegMetadata(buffer) {
  if (
    buffer.length < 32 ||
    buffer[0] !== 0xff ||
    buffer[1] !== 0xd8
  ) {
    throw new HttpError(415, "INVALID_IMAGE", "La estructura del archivo JPEG no es válida.");
  }

  const chunks = [Buffer.from([0xff, 0xd8])];
  const allowedSofMarkers = new Set([0xc0, 0xc1, 0xc2]);
  let offset = 2;
  let sawFrame = false;
  let sawScan = false;
  let sawEnd = false;

  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      throw new HttpError(
        415,
        "INVALID_IMAGE",
        "La estructura del archivo JPEG no es válida.",
      );
    }
    while (buffer[offset] === 0xff) offset += 1;
    if (offset >= buffer.length) {
      throw new HttpError(415, "INVALID_IMAGE", "El archivo JPEG está incompleto.");
    }
    const marker = buffer[offset];
    offset += 1;

    if (marker === 0xd9) {
      if (offset !== buffer.length || !sawFrame || !sawScan) {
        throw new HttpError(415, "INVALID_IMAGE", "El cierre JPEG no es válido.");
      }
      chunks.push(Buffer.from([0xff, 0xd9]));
      sawEnd = true;
      break;
    }
    if (marker === 0x00 || marker === 0xd8) {
      throw new HttpError(415, "INVALID_IMAGE", "El archivo JPEG contiene un marcador no válido.");
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      chunks.push(Buffer.from([0xff, marker]));
      continue;
    }
    if (offset + 2 > buffer.length) {
      throw new HttpError(415, "INVALID_IMAGE", "El archivo JPEG está incompleto.");
    }
    const segmentLength = buffer.readUInt16BE(offset);
    const segmentEnd = offset + segmentLength;
    if (segmentLength < 2 || segmentEnd > buffer.length) {
      throw new HttpError(415, "INVALID_IMAGE", "El archivo JPEG está incompleto.");
    }

    if (
      (marker >= 0xc0 && marker <= 0xcf) &&
      ![0xc4, 0xc8, 0xcc].includes(marker)
    ) {
      if (!allowedSofMarkers.has(marker) || sawFrame || segmentLength < 11) {
        throw new HttpError(415, "INVALID_IMAGE", "El formato interno del JPEG no es compatible.");
      }
      const precision = buffer[offset + 2];
      const height = buffer.readUInt16BE(offset + 3);
      const width = buffer.readUInt16BE(offset + 5);
      const components = buffer[offset + 7];
      if (
        precision !== 8 ||
        ![1, 3].includes(components) ||
        segmentLength !== 8 + components * 3 ||
        width < 1 ||
        height < 1
      ) {
        throw new HttpError(415, "INVALID_IMAGE", "El encabezado JPEG no es válido.");
      }
      sawFrame = true;
    }

    if (marker === 0xda) {
      const components = buffer[offset + 2];
      if (
        !sawFrame ||
        components < 1 ||
        components > 4 ||
        segmentLength !== 6 + components * 2
      ) {
        throw new HttpError(415, "INVALID_IMAGE", "El bloque de imagen JPEG no es válido.");
      }
      sawScan = true;
    }

    const isMetadata = (marker >= 0xe0 && marker <= 0xef) || marker === 0xfe;
    if (marker === 0xe1) {
      const orientation = readExifOrientation(
        buffer.subarray(offset + 2, segmentEnd),
      );
      if (orientation && orientation !== 1) {
        throw new HttpError(
          400,
          "IMAGE_ORIENTATION",
          "Gira y guarda esta foto antes de subirla; así podremos quitar sus datos privados sin dejarla de lado.",
        );
      }
    }
    if (!isMetadata) {
      chunks.push(
        Buffer.from([0xff, marker]),
        buffer.subarray(offset, segmentEnd),
      );
    }
    offset = segmentEnd;

    if (marker === 0xda) {
      const scanStart = offset;
      let cursor = offset;
      let foundNextMarker = false;
      while (cursor < buffer.length) {
        const markerPrefix = buffer.indexOf(0xff, cursor);
        if (markerPrefix === -1 || markerPrefix + 1 >= buffer.length) break;
        let markerByte = markerPrefix + 1;
        while (buffer[markerByte] === 0xff) markerByte += 1;
        if (markerByte >= buffer.length) break;
        const scanMarker = buffer[markerByte];
        if (
          scanMarker === 0x00 ||
          (scanMarker >= 0xd0 && scanMarker <= 0xd7)
        ) {
          cursor = markerByte + 1;
          continue;
        }
        chunks.push(buffer.subarray(scanStart, markerPrefix));
        offset = markerPrefix;
        foundNextMarker = true;
        break;
      }
      if (!foundNextMarker) {
        throw new HttpError(415, "INVALID_IMAGE", "El flujo de datos JPEG está incompleto.");
      }
    }
  }

  if (!sawEnd) {
    throw new HttpError(415, "INVALID_IMAGE", "El archivo JPEG no tiene un cierre válido.");
  }
  return Buffer.concat(chunks);
}

function stripPngMetadata(buffer) {
  return parseAndSanitizePng(buffer).buffer;
}

function stripWebpMetadata(buffer) {
  const chunks = [];
  let offset = 12;
  let canvasWidth;
  let canvasHeight;
  let imageWidth;
  let imageHeight;
  let imageChunks = 0;
  let sawExtendedHeader = false;
  let sawAlphaChunk = false;
  let extendedFlags = 0;
  let chunkIndex = 0;

  while (offset + 8 <= buffer.length) {
    const type = buffer.toString("ascii", offset, offset + 4);
    const payloadLength = buffer.readUInt32LE(offset + 4);
    const paddedLength = payloadLength + (payloadLength % 2);
    const chunkEnd = offset + 8 + paddedLength;
    if (
      chunkEnd > buffer.length ||
      (payloadLength % 2 === 1 && buffer[chunkEnd - 1] !== 0)
    ) {
      throw new HttpError(415, "INVALID_IMAGE", "El archivo WebP está incompleto.");
    }

    if (type === "VP8X") {
      if (chunkIndex !== 0 || sawExtendedHeader || payloadLength !== 10) {
        throw new HttpError(415, "INVALID_IMAGE", "El encabezado WebP extendido no es válido.");
      }
      sawExtendedHeader = true;
      extendedFlags = buffer[offset + 8];
      if ((extendedFlags & 0xc1) !== 0 || (extendedFlags & 0x02) !== 0) {
        throw new HttpError(
          415,
          (extendedFlags & 0x02) !== 0 ? "ANIMATED_IMAGE" : "INVALID_IMAGE",
          (extendedFlags & 0x02) !== 0
            ? "Las imágenes animadas no están permitidas."
            : "El encabezado WebP contiene indicadores reservados.",
        );
      }
      canvasWidth = 1 + buffer.readUIntLE(offset + 12, 3);
      canvasHeight = 1 + buffer.readUIntLE(offset + 15, 3);
      const chunk = Buffer.from(buffer.subarray(offset, chunkEnd));
      chunk[8] &= ~0x2c;
      chunks.push(chunk);
    } else if (type === "VP8 ") {
      if (
        payloadLength < 10 ||
        (buffer[offset + 8] & 1) !== 0 ||
        buffer[offset + 11] !== 0x9d ||
        buffer[offset + 12] !== 0x01 ||
        buffer[offset + 13] !== 0x2a
      ) {
        throw new HttpError(415, "INVALID_IMAGE", "Los datos WebP con pérdida no son válidos.");
      }
      imageChunks += 1;
      imageWidth = buffer.readUInt16LE(offset + 14) & 0x3fff;
      imageHeight = buffer.readUInt16LE(offset + 16) & 0x3fff;
      chunks.push(Buffer.from(buffer.subarray(offset, chunkEnd)));
    } else if (type === "VP8L") {
      if (payloadLength < 5 || buffer[offset + 8] !== 0x2f) {
        throw new HttpError(415, "INVALID_IMAGE", "Los datos WebP sin pérdida no son válidos.");
      }
      const b1 = buffer[offset + 9];
      const b2 = buffer[offset + 10];
      const b3 = buffer[offset + 11];
      const b4 = buffer[offset + 12];
      imageChunks += 1;
      imageWidth = 1 + (((b2 & 0x3f) << 8) | b1);
      imageHeight = 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | (b2 >> 6));
      chunks.push(Buffer.from(buffer.subarray(offset, chunkEnd)));
    } else if (type === "ALPH") {
      if (
        !sawExtendedHeader ||
        sawAlphaChunk ||
        imageChunks > 0 ||
        payloadLength < 1
      ) {
        throw new HttpError(415, "INVALID_IMAGE", "El canal alfa WebP no es válido.");
      }
      sawAlphaChunk = true;
      chunks.push(Buffer.from(buffer.subarray(offset, chunkEnd)));
    } else if (type === "ANIM" || type === "ANMF") {
      throw new HttpError(415, "ANIMATED_IMAGE", "Las imágenes animadas no están permitidas.");
    } else if (type !== "EXIF" && type !== "XMP " && type !== "ICCP") {
      throw new HttpError(415, "INVALID_IMAGE", "El WebP contiene un bloque no compatible.");
    }
    offset = chunkEnd;
    chunkIndex += 1;
  }

  if (
    offset !== buffer.length ||
    imageChunks !== 1 ||
    imageWidth < 1 ||
    imageHeight < 1 ||
    (sawExtendedHeader &&
      (canvasWidth !== imageWidth || canvasHeight !== imageHeight)) ||
    (!sawExtendedHeader && chunkIndex !== 1) ||
    (sawAlphaChunk && (extendedFlags & 0x10) === 0)
  ) {
    throw new HttpError(415, "INVALID_IMAGE", "La estructura del archivo WebP no es válida.");
  }
  const payload = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(payload.length + 4, 4);
  header.write("WEBP", 8, "ascii");
  return Buffer.concat([header, payload]);
}

function stripImageMetadata(buffer, metadata) {
  if (metadata.mime === "image/jpeg") return stripJpegMetadata(buffer);
  if (metadata.mime === "image/png") return stripPngMetadata(buffer);
  if (metadata.mime === "image/webp") return stripWebpMetadata(buffer);
  throw new HttpError(415, "UNSUPPORTED_IMAGE", "Formato de imagen no permitido.");
}

function inspectImageMetadata(file, index = 0) {
  const allowedDeclaredTypes = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);
  if (
    !file ||
    !Buffer.isBuffer(file.buffer) ||
    file.buffer.length === 0 ||
    file.buffer.length > MAX_IMAGE_BYTES
  ) {
    throw new HttpError(
      413,
      "IMAGE_SIZE",
      "Cada imagen debe pesar entre 1 byte y 6 MB.",
    );
  }
  if (!allowedDeclaredTypes.has(file.mimetype)) {
    throw new HttpError(
      415,
      "UNSUPPORTED_IMAGE",
      "La imagen " + (index + 1) + " debe ser JPEG, PNG o WebP.",
    );
  }

  const metadata =
    pngMetadata(file.buffer) ||
    jpegMetadata(file.buffer) ||
    webpMetadata(file.buffer);
  if (!metadata || metadata.mime !== file.mimetype) {
    throw new HttpError(
      415,
      "INVALID_IMAGE",
      "La imagen " + (index + 1) + " está dañada o su formato no es auténtico.",
    );
  }
  if (
    metadata.width < 1 ||
    metadata.height < 1 ||
    metadata.width > MAX_IMAGE_DIMENSION ||
    metadata.height > MAX_IMAGE_DIMENSION ||
    metadata.width * metadata.height > MAX_IMAGE_PIXELS
  ) {
    throw new HttpError(
      400,
      "IMAGE_DIMENSIONS",
      "Cada imagen debe medir máximo 5000 × 5000 y no superar 20 megapíxeles.",
    );
  }
  return metadata;
}

function inspectImage(file, index = 0) {
  const metadata = inspectImageMetadata(file, index);
  return {
    ...metadata,
    safeBuffer: stripImageMetadata(file.buffer, metadata),
  };
}

async function saveUploadedImagesNow(files, uploadDirectory) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new HttpError(
      400,
      "IMAGES_REQUIRED",
      "Selecciona al menos una imagen.",
    );
  }
  if (files.length > MAX_UPLOAD_FILES) {
    throw new HttpError(
      400,
      "TOO_MANY_IMAGES",
      "Puedes subir un máximo de 5 imágenes a la vez.",
    );
  }

  const metadataList = files.map(inspectImageMetadata);
  const totalPixels = metadataList.reduce(
    (sum, metadata) => sum + metadata.width * metadata.height,
    0,
  );
  if (totalPixels > MAX_UPLOAD_PIXELS) {
    throw new HttpError(
      400,
      "UPLOAD_DIMENSIONS",
      "El lote de imágenes supera el límite total de 40 megapíxeles.",
    );
  }
  const inspected = files.map((file, index) => ({
    ...metadataList[index],
    safeBuffer: stripImageMetadata(file.buffer, metadataList[index]),
  }));
  await fsp.mkdir(uploadDirectory, { recursive: true, mode: 0o700 });
  const entries = await fsp.readdir(uploadDirectory, { withFileTypes: true });
  let currentUsage = 0;
  for (const entry of entries) {
    if (
      !entry.isFile() ||
      (!STORED_IMAGE_NAME.test(entry.name) &&
        !STORED_UPLOAD_TEMP.test(entry.name))
    ) {
      continue;
    }
    const stats = await fsp
      .stat(path.join(uploadDirectory, entry.name))
      .catch(() => null);
    if (stats) currentUsage += stats.size;
  }
  const incomingBytes = inspected.reduce(
    (sum, metadata) => sum + metadata.safeBuffer.length,
    0,
  );
  if (currentUsage + incomingBytes > MAX_UPLOAD_STORAGE_BYTES) {
    throw new HttpError(
      507,
      "UPLOAD_STORAGE_FULL",
      "El espacio para fotografías está lleno. Elimina piezas antiguas o amplía el disco.",
    );
  }
  const createdPaths = [];
  const results = [];

  try {
    for (let index = 0; index < files.length; index += 1) {
      const metadata = inspected[index];
      const filename = randomUUID() + "." + metadata.extension;
      const finalPath = path.join(uploadDirectory, filename);
      const temporaryPath = path.join(
        uploadDirectory,
        "." + filename + ".uploading",
      );
      let handle;

      try {
        handle = await fsp.open(
          temporaryPath,
          fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY,
          0o600,
        );
        await handle.writeFile(metadata.safeBuffer);
        await handle.sync();
        await handle.close();
        handle = null;
        await fsp.rename(temporaryPath, finalPath);
        createdPaths.push(finalPath);
      } catch (error) {
        if (handle) await handle.close().catch(() => undefined);
        await fsp.unlink(temporaryPath).catch(() => undefined);
        throw error;
      }

      results.push({
        url: "/uploads/" + filename,
        width: metadata.width,
        height: metadata.height,
        mimeType: metadata.mime,
      });
    }
  } catch (error) {
    await Promise.all(
      createdPaths.map((filePath) =>
        fsp.unlink(filePath).catch(() => undefined),
      ),
    );
    throw error;
  }
  return results;
}

function saveUploadedImages(files, uploadDirectory) {
  const operation = uploadWriteQueue
    .catch(() => undefined)
    .then(() => saveUploadedImagesNow(files, uploadDirectory));
  uploadWriteQueue = operation.then(
    () => undefined,
    () => undefined,
  );
  return operation;
}

function referencedUploadNames(data) {
  const names = new Set();
  const remember = (value) => {
    if (typeof value !== "string" || !value.startsWith("/uploads/")) return;
    const name = value.slice("/uploads/".length);
    if (STORED_IMAGE_NAME.test(name)) names.add(name);
  };
  for (const product of data.products || []) {
    for (const image of product.images || []) remember(image);
  }
  for (const inquiry of data.inquiries || []) {
    for (const item of inquiry.items || []) remember(item.image);
  }
  return names;
}

async function cleanupOrphanUploads(
  uploadDirectory,
  data,
  minimumAgeMs = ORPHAN_GRACE_MS,
) {
  const referenced = referencedUploadNames(data);
  let entries;
  try {
    entries = await fsp.readdir(uploadDirectory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return 0;
    throw error;
  }

  const now = Date.now();
  let removed = 0;
  for (const entry of entries) {
    if (
      !entry.isFile() ||
      (!STORED_IMAGE_NAME.test(entry.name) &&
        !STORED_UPLOAD_TEMP.test(entry.name))
    ) {
      continue;
    }
    if (STORED_IMAGE_NAME.test(entry.name) && referenced.has(entry.name)) {
      continue;
    }
    const filePath = path.join(uploadDirectory, entry.name);
    const stats = await fsp.stat(filePath).catch(() => null);
    if (!stats || now - stats.mtimeMs < minimumAgeMs) continue;
    try {
      await fsp.unlink(filePath);
      removed += 1;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return removed;
}

module.exports = {
  MAX_IMAGE_BYTES,
  MAX_UPLOAD_FILES,
  cleanupOrphanUploads,
  imageUpload,
  inspectImage,
  saveUploadedImages,
  stripImageMetadata,
};
