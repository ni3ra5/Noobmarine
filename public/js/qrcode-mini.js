/**
 * Minimal QR Code generator — renders to a <canvas> element.
 * Based on the QR code algorithm (ISO 18004), supports alphanumeric mode, version 1-6.
 * Usage: QRMini.toCanvas(canvas, text, size, fgColor, bgColor)
 */
const QRMini = (() => {
  // Use a well-tested approach: encode the URL as a data matrix via the QR algorithm.
  // For simplicity, we generate via Google-free, offline method using bit manipulation.

  // This is a simplified QR encoder supporting byte mode, error correction level L.
  // Sufficient for URLs up to ~100 characters.

  const EC_L = 1;

  // GF(256) arithmetic for Reed-Solomon
  const EXP = new Uint8Array(256);
  const LOG = new Uint8Array(256);
  (function initGF() {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;
      x = (x << 1) ^ (x & 128 ? 0x11d : 0);
    }
    EXP[255] = EXP[0];
  })();

  function gfMul(a, b) {
    return a === 0 || b === 0 ? 0 : EXP[(LOG[a] + LOG[b]) % 255];
  }

  function rsEncode(data, ecLen) {
    const gen = [1];
    for (let i = 0; i < ecLen; i++) {
      const newGen = new Array(gen.length + 1).fill(0);
      const factor = EXP[i];
      for (let j = 0; j < gen.length; j++) {
        newGen[j] ^= gen[j];
        newGen[j + 1] ^= gfMul(gen[j], factor);
      }
      gen.length = newGen.length;
      for (let j = 0; j < newGen.length; j++) gen[j] = newGen[j];
    }
    const result = new Uint8Array(ecLen);
    const msg = new Uint8Array(data.length + ecLen);
    msg.set(data);
    for (let i = 0; i < data.length; i++) {
      const coeff = msg[i];
      if (coeff !== 0) {
        for (let j = 0; j < gen.length; j++) {
          msg[i + j] ^= gfMul(gen[j], coeff);
        }
      }
    }
    result.set(msg.subarray(data.length));
    return result;
  }

  // QR version parameters for EC level L
  const VERSIONS = [
    null,
    { total: 26, dataBytes: 19, ecBytes: 7, blocks: 1 },   // v1: 21x21
    { total: 44, dataBytes: 34, ecBytes: 10, blocks: 1 },  // v2: 25x25
    { total: 70, dataBytes: 55, ecBytes: 15, blocks: 1 },  // v3: 29x29
    { total: 100, dataBytes: 80, ecBytes: 20, blocks: 1 }, // v4: 33x33
    { total: 134, dataBytes: 108, ecBytes: 26, blocks: 1 },// v5: 37x37
    { total: 172, dataBytes: 136, ecBytes: 18, blocks: 2 },// v6: 41x41
  ];

  function chooseVersion(dataLen) {
    // Byte mode overhead: 4 bits mode + 8/16 bits length + data + 4 bits terminator
    for (let v = 1; v <= 6; v++) {
      const cap = VERSIONS[v].dataBytes;
      const overhead = v <= 9 ? 2 : 3; // mode(4b) + len(8/16b) + term(4b) ≈ 2-3 bytes
      if (dataLen + overhead <= cap) return v;
    }
    return 6; // fallback
  }

  function encodeData(text) {
    const bytes = new TextEncoder().encode(text);
    const ver = chooseVersion(bytes.length);
    const info = VERSIONS[ver];
    const bits = [];

    function push(val, len) {
      for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
    }

    // Byte mode indicator
    push(0b0100, 4);
    // Character count
    push(bytes.length, ver <= 9 ? 8 : 16);
    // Data
    for (const b of bytes) push(b, 8);
    // Terminator
    const capacity = info.dataBytes * 8;
    const termLen = Math.min(4, capacity - bits.length);
    push(0, termLen);
    // Pad to byte boundary
    while (bits.length % 8 !== 0) bits.push(0);
    // Pad bytes
    let padByte = 0;
    while (bits.length < capacity) {
      push(padByte === 0 ? 0xEC : 0x11, 8);
      padByte ^= 1;
    }

    // Convert to byte array
    const dataBytes = new Uint8Array(info.dataBytes);
    for (let i = 0; i < info.dataBytes; i++) {
      let byte = 0;
      for (let b = 0; b < 8; b++) byte = (byte << 1) | (bits[i * 8 + b] || 0);
      dataBytes[i] = byte;
    }

    // Reed-Solomon error correction
    const ecBytesPerBlock = info.ecBytes;
    let ec;
    if (info.blocks === 1) {
      ec = rsEncode(dataBytes, ecBytesPerBlock);
    } else {
      // Split into blocks
      const blockSize = Math.floor(info.dataBytes / info.blocks);
      const allEC = [];
      const allData = [];
      for (let b = 0; b < info.blocks; b++) {
        const start = b * blockSize;
        const end = b === info.blocks - 1 ? info.dataBytes : start + blockSize;
        const block = dataBytes.subarray(start, end);
        allData.push(block);
        allEC.push(rsEncode(block, ecBytesPerBlock));
      }
      // Interleave data blocks
      const interleaved = [];
      const maxLen = Math.max(...allData.map(d => d.length));
      for (let i = 0; i < maxLen; i++) {
        for (const d of allData) if (i < d.length) interleaved.push(d[i]);
      }
      for (let i = 0; i < ecBytesPerBlock; i++) {
        for (const e of allEC) if (i < e.length) interleaved.push(e[i]);
      }
      return { ver, bits: interleaved.flatMap(b => Array.from({length:8}, (_,i) => (b >> (7-i)) & 1)) };
    }

    // Combine data + EC
    const allBits = [];
    for (const b of dataBytes) for (let i = 7; i >= 0; i--) allBits.push((b >> i) & 1);
    for (const b of ec) for (let i = 7; i >= 0; i--) allBits.push((b >> i) & 1);

    return { ver, bits: allBits };
  }

  function createMatrix(ver) {
    const size = 17 + ver * 4;
    const matrix = Array.from({ length: size }, () => new Int8Array(size)); // 0=empty, 1=black, -1=white
    const reserved = Array.from({ length: size }, () => new Uint8Array(size)); // 1=reserved

    function setModule(r, c, val) {
      if (r >= 0 && r < size && c >= 0 && c < size) {
        matrix[r][c] = val ? 1 : -1;
        reserved[r][c] = 1;
      }
    }

    // Finder patterns
    function finderPattern(row, col) {
      for (let r = -1; r <= 7; r++) {
        for (let c = -1; c <= 7; c++) {
          const inOuter = r >= 0 && r <= 6 && c >= 0 && c <= 6;
          const inInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          const onBorder = r === 0 || r === 6 || c === 0 || c === 6;
          setModule(row + r, col + c, inInner || (inOuter && onBorder));
        }
      }
    }

    finderPattern(0, 0);
    finderPattern(0, size - 7);
    finderPattern(size - 7, 0);

    // Timing patterns
    for (let i = 8; i < size - 8; i++) {
      setModule(6, i, i % 2 === 0);
      setModule(i, 6, i % 2 === 0);
    }

    // Dark module
    setModule(size - 8, 8, true);

    // Format info reserved area
    for (let i = 0; i < 8; i++) {
      reserved[8][i] = 1; reserved[8][size - 1 - i] = 1;
      reserved[i][8] = 1; reserved[size - 1 - i][8] = 1;
    }
    reserved[8][8] = 1;

    // Alignment pattern (v2+)
    if (ver >= 2) {
      const positions = [6, ver === 2 ? 18 : ver === 3 ? 22 : ver === 4 ? 26 : ver === 5 ? 30 : 34];
      for (const ar of positions) {
        for (const ac of positions) {
          if (reserved[ar]?.[ac]) continue;
          for (let r = -2; r <= 2; r++) {
            for (let c = -2; c <= 2; c++) {
              const onBorder = Math.abs(r) === 2 || Math.abs(c) === 2;
              const isCenter = r === 0 && c === 0;
              setModule(ar + r, ac + c, isCenter || onBorder);
            }
          }
        }
      }
    }

    return { matrix, reserved, size };
  }

  function placeData(matrix, reserved, size, dataBits) {
    let bitIdx = 0;
    let upward = true;

    for (let col = size - 1; col >= 0; col -= 2) {
      if (col === 6) col = 5; // skip timing column
      const rows = upward ? Array.from({length: size}, (_, i) => size - 1 - i) : Array.from({length: size}, (_, i) => i);
      for (const row of rows) {
        for (let c = 0; c <= 1; c++) {
          const cc = col - c;
          if (cc < 0 || reserved[row][cc]) continue;
          matrix[row][cc] = (bitIdx < dataBits.length && dataBits[bitIdx]) ? 1 : -1;
          bitIdx++;
        }
      }
      upward = !upward;
    }
  }

  function applyMask(matrix, reserved, size, maskNum) {
    const maskFn = [
      (r, c) => (r + c) % 2 === 0,
      (r, c) => r % 2 === 0,
      (r, c) => c % 3 === 0,
      (r, c) => (r + c) % 3 === 0,
      (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
      (r, c) => (r * c) % 2 + (r * c) % 3 === 0,
      (r, c) => ((r * c) % 2 + (r * c) % 3) % 2 === 0,
      (r, c) => ((r + c) % 2 + (r * c) % 3) % 2 === 0,
    ][maskNum];

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (!reserved[r][c] && maskFn(r, c)) {
          matrix[r][c] = matrix[r][c] === 1 ? -1 : 1;
        }
      }
    }
  }

  function placeFormatInfo(matrix, size, maskNum) {
    // Format info for EC level L (01) and mask
    const FORMAT_BITS = [
      0x77c4, 0x72f3, 0x7daa, 0x789d, 0x662f, 0x6318, 0x6c41, 0x6976,
    ];
    const bits = FORMAT_BITS[maskNum];

    for (let i = 0; i < 15; i++) {
      const bit = (bits >> (14 - i)) & 1 ? 1 : -1;
      // Around top-left finder
      if (i < 6) matrix[8][i] = bit;
      else if (i === 6) matrix[8][7] = bit;
      else if (i === 7) matrix[8][8] = bit;
      else if (i === 8) matrix[7][8] = bit;
      else matrix[14 - i][8] = bit;

      // Other copy
      if (i < 8) matrix[size - 1 - i][8] = bit;
      else matrix[8][size - 15 + i] = bit;
    }
  }

  function generate(text) {
    const { ver, bits: dataBits } = encodeData(text);
    const { matrix, reserved, size } = createMatrix(ver);
    placeData(matrix, reserved, size, dataBits);
    applyMask(matrix, reserved, size, 0); // mask 0
    placeFormatInfo(matrix, size, 0);
    return { matrix, size };
  }

  function toCanvas(canvas, text, pixelSize = 200, fg = '#00FF88', bg = '#001A0E') {
    const { matrix, size } = generate(text);
    const scale = Math.floor(pixelSize / (size + 8)); // quiet zone of 4 modules each side
    const totalSize = (size + 8) * scale;
    canvas.width = totalSize;
    canvas.height = totalSize;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, totalSize, totalSize);
    ctx.fillStyle = fg;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (matrix[r][c] === 1) {
          ctx.fillRect((c + 4) * scale, (r + 4) * scale, scale, scale);
        }
      }
    }
  }

  return { toCanvas };
})();
